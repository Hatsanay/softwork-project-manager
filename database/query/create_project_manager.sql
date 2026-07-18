SET NAMES utf8mb4 collate utf8mb4_unicode_ci;

-- ─── 1) ตำแหน่งในโปรเจกต์ (project position) ────────────────────────────────────
-- กำหนดกลาง ใช้ร่วมกันได้ทุกโปรเจกต์ (เหมือน tb_roles แต่คนละสิทธิ์กันคนละเรื่อง)
-- tb_roles.role_permission = สิทธิ์ใช้งานระบบหลังบ้านทั้งระบบ (เมนู/หน้าไหนเข้าได้)
-- tb_project_positions.position_permission = สิทธิ์ทำอะไรได้บ้าง "ภายในโปรเจกต์ที่ตัวเองอยู่" เท่านั้น
-- ลำดับบิต (29 บิต) ต้องตรงกับ PROJECT_PERMISSION_GROUPS ใน frontend/app/components/project-position-bits.ts เป๊ะๆ:
--   [เกี่ยวกับ Task]          0 deleteTask, 1 editTask, 2 changeTaskStatus, 3 addTask, 4 editOwnTask, 5 changeOwnTaskStatus
--   [เกี่ยวกับ Subtask]       6 changeSubtaskStatus, 7 addOwnSubtask, 8 changeOwnSubtaskStatus
--   [เกี่ยวกับโปรเจกต์]        9 deleteProject, 10 editProjectInfo, 11 manageMembers, 12 manageShareLink
--   [เกี่ยวกับปัญหาใน Task]    13 deleteIssueTask, 14 editIssueTask, 15 changeIssueStatusTask, 16 addIssueTask,
--                             17 deleteOwnIssueTask, 18 editOwnIssueTask, 19 changeOwnIssueStatusTask, 20 addOwnIssueTask
--   [เกี่ยวกับปัญหาใน Subtask] 21 deleteIssueSubtask, 22 editIssueSubtask, 23 changeIssueStatusSubtask, 24 addIssueSubtask,
--                             25 deleteOwnIssueSubtask, 26 editOwnIssueSubtask, 27 changeOwnIssueStatusSubtask, 28 addOwnIssueSubtask
-- ทุกการกระทำต้องมีบิตชัดเจนเสมอ ไม่มีสิทธิ์อัตโนมัติจากการเป็นผู้รับผิดชอบอีกต่อไป (รวมถึงเปลี่ยนสถานะด้วย)
-- เช่น เปลี่ยนสถานะ task ของตัวเอง ต้องมีบิต changeOwnTaskStatus (หรือ changeTaskStatus) อย่างใดอย่างหนึ่ง
-- แก้ไขข้อมูล task ของตัวเอง ต้องมีบิต editOwnTask (หรือ editTask) อย่างใดอย่างหนึ่ง
-- เพิ่ม subtask ให้ task ที่ตัวเองรับผิดชอบ ต้องมีบิต addOwnSubtask (หรือ addTask) อย่างใดอย่างหนึ่ง
CREATE TABLE tb_project_positions (
  position_id         VARCHAR(18) NOT NULL,
  position_name       VARCHAR(50) NOT NULL,
  position_permission VARCHAR(64) NOT NULL DEFAULT '',
  position_status     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  position_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  position_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (position_id),
  UNIQUE KEY uq_position_name (position_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2) ลูกค้า (client) ─────────────────────────────────────────────────────────
-- ข้อมูลอ้างอิงอย่างเดียว ไม่มี login — ลูกค้าดูสถานะผ่าน share link ของแต่ละโปรเจกต์แทน
CREATE TABLE tb_clients (
  client_id         VARCHAR(18)  NOT NULL,
  client_name       VARCHAR(100) NOT NULL,
  client_company    VARCHAR(150) NULL,
  client_email      VARCHAR(255) NULL,
  client_phone      VARCHAR(20)  NULL,
  client_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  client_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3) โปรเจกต์ (project) ──────────────────────────────────────────────────────
-- project_share_token เป็น URL ลับสำหรับหน้า /share/[token] ที่ลูกค้าดูได้โดยไม่ต้อง login
-- project_progress_percent cache ไว้ตรงนี้ คำนวณจาก weighted task ที่เสร็จ/ทั้งหมด ไม่ต้องคำนวณสดทุกครั้ง
CREATE TABLE tb_projects (
  project_id               VARCHAR(18) NOT NULL,
  client_id                VARCHAR(18) NULL,
  project_name             VARCHAR(150) NOT NULL,
  project_description      TEXT NULL,
  project_status           ENUM('planning','in_progress','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  project_type             ENUM('waterfall','agile') NOT NULL DEFAULT 'waterfall' COMMENT 'waterfall = มอบหมายงานโดยคนมีสิทธิ์เท่านั้น (แบบเดิม), agile = เพิ่มเติมจาก waterfall คือ task/subtask ที่ยังไม่มีคนรับผิดชอบ สมาชิกกดรับเองได้ (ดู tb_task_assignees, รับได้คนแรกคนเดียว)',
  project_start_date       DATE NULL,
  project_due_date         DATE NULL,
  project_completed_at     DATETIME NULL COMMENT 'ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น completed (เคลียร์เป็น NULL ถ้าเปลี่ยนสถานะออกจาก completed) ใช้คำนวณ KPI อัตราส่งตรงเวลา ไม่ใช้ project_updated_at เพราะแก้ไขข้อมูลอื่นทีหลังจะทำให้เวลาคลาดเคลื่อน',
  project_progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  project_share_token      VARCHAR(64) NOT NULL,
  project_share_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  project_use_task_weight  BOOLEAN NOT NULL DEFAULT FALSE,
  project_created_by       VARCHAR(18) NULL,
  project_created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id),
  UNIQUE KEY uq_project_share_token (project_share_token),
  KEY idx_project_client (client_id),
  CONSTRAINT fk_project_client  FOREIGN KEY (client_id) REFERENCES tb_clients(client_id),
  CONSTRAINT fk_project_creator FOREIGN KEY (project_created_by) REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 4) สมาชิกในโปรเจกต์ (ใครเห็น/อยู่ในโปรเจกต์นี้บ้าง) ─────────────────────────
CREATE TABLE tb_project_members (
  project_member_id VARCHAR(18) NOT NULL,
  project_id        VARCHAR(18) NOT NULL,
  user_id           VARCHAR(18) NOT NULL,
  joined_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_member_id),
  UNIQUE KEY uq_project_member (project_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5) ตำแหน่งที่แต่ละสมาชิกถืออยู่ในโปรเจกต์นั้น (หลายตำแหน่งต่อคนได้) ──────────
CREATE TABLE tb_project_member_positions (
  project_member_id VARCHAR(18) NOT NULL,
  position_id       VARCHAR(18) NOT NULL,
  PRIMARY KEY (project_member_id, position_id),
  CONSTRAINT fk_pmp_member   FOREIGN KEY (project_member_id) REFERENCES tb_project_members(project_member_id) ON DELETE CASCADE,
  CONSTRAINT fk_pmp_position FOREIGN KEY (position_id)       REFERENCES tb_project_positions(position_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6) งาน (task) ──────────────────────────────────────────────────────────────
-- task_parent_id รองรับ subtask (nullable, อ้างกลับตัวเอง)
-- task_weight ใช้ถ่วงน้ำหนักตอนคำนวณ % ความคืบหน้าของโปรเจกต์
-- ผู้รับผิดชอบเป็นแบบหลายคนต่อ task ได้ ย้ายไปเก็บที่ tb_task_assignees แทนคอลัมน์เดี่ยว
CREATE TABLE tb_tasks (
  task_id          VARCHAR(18) NOT NULL,
  project_id       VARCHAR(18) NOT NULL,
  task_parent_id   VARCHAR(18) NULL,
  task_title       VARCHAR(200) NOT NULL,
  task_description TEXT NULL,
  task_status      ENUM('todo','in_progress','review','done') NOT NULL DEFAULT 'todo',
  task_start_date  DATE NULL,
  task_due_date    DATE NULL,
  task_completed_at DATETIME NULL,
  task_weight      INT NOT NULL DEFAULT 1,
  task_sort_order  INT NOT NULL DEFAULT 0,
  task_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id),
  KEY idx_task_project (project_id),
  KEY idx_task_parent (task_parent_id),
  CONSTRAINT fk_task_project  FOREIGN KEY (project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_task_parent   FOREIGN KEY (task_parent_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผู้รับผิดชอบของแต่ละ task (หลายคนต่อ task ได้) — ใครอยู่ในนี้ แก้ไข task นี้ได้เสมอแม้ไม่มีสิทธิ์ editTask
CREATE TABLE tb_task_assignees (
  task_id VARCHAR(18) NOT NULL,
  user_id VARCHAR(18) NOT NULL,
  PRIMARY KEY (task_id, user_id),
  KEY idx_ta_user (user_id),
  CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.1) ปัญหา (issue) ของ task/subtask ─────────────────────────────────────────
-- issue ผูกกับ task_id ตรงๆ (ใช้ได้ทั้ง task หลักและ subtask เพราะเป็นตารางเดียวกัน)
-- นับ badge "มีปัญหา" ที่หน้าโปรเจกต์เอาแค่ issue ของ task นั้นเอง ไม่รวม/ไม่นับจาก subtask ของมัน
CREATE TABLE tb_task_issues (
  issue_id          VARCHAR(18) NOT NULL,
  task_id           VARCHAR(18) NOT NULL,
  issue_title       VARCHAR(200) NOT NULL,
  issue_description TEXT NULL,
  issue_status      ENUM('open','resolved') NOT NULL DEFAULT 'open',
  issue_resolved_at DATETIME NULL COMMENT 'ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น resolved (เคลียร์เป็น NULL ถ้าเปิดใหม่) ใช้คำนวณ KPI เวลาเฉลี่ยแก้ปัญหา ไม่ใช้ issue_updated_at เพราะแก้ไข issue หลัง resolved แล้ว (เช่นแก้ชื่อ) จะทำให้เวลาคลาดเคลื่อน',
  created_by        VARCHAR(18) NULL,
  issue_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  issue_updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (issue_id),
  KEY idx_issue_task (task_id),
  CONSTRAINT fk_issue_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_creator FOREIGN KEY (created_by) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.2) รูปแนบของปัญหา (issue) ──────────────────────────────────────────────────
-- หนึ่งปัญหาแนบได้หลายรูป — ลบปัญหาแล้ว cascade ลบแถวรูปด้วย แต่ตัวไฟล์จริงใน uploads/ ต้องลบเองในโค้ด (ไม่ผูกกับ DB)
CREATE TABLE tb_task_issue_images (
  image_id         VARCHAR(18) NOT NULL,
  issue_id         VARCHAR(18) NOT NULL,
  image_url        VARCHAR(255) NOT NULL,
  image_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_issue_image_issue (issue_id),
  CONSTRAINT fk_issue_image_issue FOREIGN KEY (issue_id) REFERENCES tb_task_issues(issue_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.2.1) แท็กคนในปัญหา (@ tag) ─────────────────────────────────────────────────
-- แท็กใครไว้ในปัญหาไหน คนนั้นจะเห็นปัญหานี้ใน "ปัญหาที่เปิดอยู่" บนแดชบอร์ดของตัวเองด้วยเสมอ
-- (ขยายการมองเห็นออกจากแค่ผู้รับผิดชอบ task/subtask โดยตรง) และขึ้นพื้นหลังสีแดงเฉพาะในมุมมองของคนที่ถูกแท็กเท่านั้น
CREATE TABLE tb_task_issue_tags (
  issue_id  VARCHAR(18) NOT NULL,
  user_id   VARCHAR(18) NOT NULL,
  tagged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (issue_id, user_id),
  KEY idx_issue_tag_user (user_id),
  CONSTRAINT fk_issue_tag_issue FOREIGN KEY (issue_id) REFERENCES tb_task_issues(issue_id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_tag_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.2.2) ตอบกลับปัญหา (reply) ──────────────────────────────────────────────────
-- ข้อความตอบกลับเรียงตามเวลา ไม่มีแก้ไข/ลบ (เหมือน tb_task_chat_messages) — ใครก็ตามที่เป็นสมาชิกโปรเจกต์ตอบกลับได้
-- ไม่ต้องมีสิทธิ์เฉพาะเหมือนบิต addIssue/editIssue เพราะเป็นแค่การพูดคุย/อัปเดตความคืบหน้า ไม่ใช่การกระทำต่อ workflow ของปัญหา
-- reply_created_at ต้องเป็น DATETIME(3) (ไม่ใช่ DATETIME เฉยๆ) ด้วยเหตุผลเดียวกับ tb_task_chat_messages/tb_task_chat_reads
-- (กันตอบกลับใหม่มาถึงพร้อมกับตอน mark-read ในวินาทีเดียวกัน แล้วเทียบเท่ากันพอดีจนไม่นับว่ายังไม่อ่าน) ดู tb_task_issue_reply_reads คู่กัน
CREATE TABLE tb_task_issue_replies (
  reply_id         VARCHAR(18) NOT NULL,
  issue_id         VARCHAR(18) NOT NULL,
  user_id          VARCHAR(18) NULL,
  reply_text       TEXT NULL COMMENT 'ว่างได้ถ้าตอบกลับด้วยรูปแนบล้วนๆ ไม่มีข้อความ (เหมือน tb_task_chat_messages)',
  reply_created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (reply_id),
  KEY idx_issue_reply_issue (issue_id),
  CONSTRAINT fk_issue_reply_issue FOREIGN KEY (issue_id) REFERENCES tb_task_issues(issue_id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_reply_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รูปแนบของการตอบกลับปัญหา (หนึ่งการตอบกลับแนบได้หลายรูป เหมือน issue/chat images)
CREATE TABLE tb_task_issue_reply_images (
  image_id         VARCHAR(18) NOT NULL,
  reply_id         VARCHAR(18) NOT NULL,
  image_url        VARCHAR(255) NOT NULL,
  image_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_issue_reply_image_reply (reply_id),
  CONSTRAINT fk_issue_reply_image_reply FOREIGN KEY (reply_id) REFERENCES tb_task_issue_replies(reply_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อ่านการตอบกลับของปัญหาที่ตัวเองสร้างล่าสุดเมื่อไหร่ ต่อคนต่อปัญหา — ใช้คำนวณว่ามีการตอบกลับใหม่ที่ยังไม่ได้อ่านไหม
-- (เพื่อดันปัญหาของตัวเองที่โดนตอบกลับให้ไปโผล่ใน "ปัญหาที่เปิดอยู่" บนแดชบอร์ด แม้ไม่ใช่ผู้รับผิดชอบ/ไม่ถูกแท็กก็ตาม
-- พอเปิดอ่านแล้วก็ไม่ต้องโผล่อีกจนกว่าจะมีการตอบกลับใหม่มาอีก) ต้องเป็น DATETIME(3) ด้วยเหตุผลเดียวกับ tb_task_chat_reads
CREATE TABLE tb_task_issue_reply_reads (
  issue_id     VARCHAR(18) NOT NULL,
  user_id      VARCHAR(18) NOT NULL,
  last_read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (issue_id, user_id),
  CONSTRAINT fk_issue_reply_read_issue FOREIGN KEY (issue_id) REFERENCES tb_task_issues(issue_id) ON DELETE CASCADE,
  CONSTRAINT fk_issue_reply_read_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.3) แชทใน task/subtask ──────────────────────────────────────────────────────
-- สมาชิกโปรเจกต์ทุกคนแชทได้ ไม่ต้องมีสิทธิ์เฉพาะ (คนละเรื่องกับ issue ที่คุมด้วยบิต)
-- reply_to_message_id = ตอบกลับข้อความไหน (ถ้ามี) อ้างตัวเองได้ (self-reference) ON DELETE SET NULL เพราะแม้ข้อความต้นทาง
-- จะหายไป ข้อความที่ตอบกลับก็ยังควรอยู่ (ระบบยังไม่มี endpoint ลบข้อความแชทตอนนี้ แต่กันไว้เผื่ออนาคต)
CREATE TABLE tb_task_chat_messages (
  message_id         VARCHAR(18) NOT NULL,
  task_id            VARCHAR(18) NOT NULL,
  user_id            VARCHAR(18) NULL,
  message_text       TEXT NULL,
  reply_to_message_id VARCHAR(18) NULL,
  message_created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id),
  KEY idx_chat_task (task_id),
  CONSTRAINT fk_chat_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_chat_reply_to FOREIGN KEY (reply_to_message_id) REFERENCES tb_task_chat_messages(message_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รูปแนบของข้อความแชท (หนึ่งข้อความแนบได้หลายรูป เหมือน issue images)
CREATE TABLE tb_task_chat_images (
  image_id         VARCHAR(18) NOT NULL,
  message_id       VARCHAR(18) NOT NULL,
  image_url        VARCHAR(255) NOT NULL,
  image_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_chat_image_message (message_id),
  CONSTRAINT fk_chat_image_message FOREIGN KEY (message_id) REFERENCES tb_task_chat_messages(message_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อ่านแชทของ task นั้นล่าสุดเมื่อไหร่ ต่อคนต่อ task (ใช้คำนวณ badge จำนวนข้อความที่ยังไม่ได้อ่าน)
-- อัปเดตทุกครั้งที่เรียกดูข้อความ (GET chat) ของ task นั้น ถือว่าดูแล้ว = อ่านแล้ว ไม่มี endpoint แยกสำหรับ mark-read
-- ต้องเป็น DATETIME(3) (มิลลิวินาที) ไม่ใช่ DATETIME เฉยๆ เพราะเทียบ message_created_at > last_read_at
-- ถ้าปัดแค่ระดับวินาที ข้อความที่มาถึงวินาทีเดียวกับตอนอ่าน จะเทียบเท่ากันพอดีแล้วไม่นับว่ายังไม่อ่าน
CREATE TABLE tb_task_chat_reads (
  task_id      VARCHAR(18) NOT NULL,
  user_id      VARCHAR(18) NOT NULL,
  last_read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT fk_chat_read_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_read_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6.2) แชทของโปรเจกต์ (ไม่ผูกกับ task ไหนเป็นการเฉพาะ — คุยเรื่องรวมๆ ของทั้งโปรเจกต์) ────
-- โครงสร้างเหมือน tb_task_chat_* ทุกอย่าง แค่ผูกกับ project_id แทน task_id
CREATE TABLE tb_project_chat_messages (
  message_id         VARCHAR(18) NOT NULL,
  project_id         VARCHAR(18) NOT NULL,
  user_id            VARCHAR(18) NULL,
  message_text       TEXT NULL,
  reply_to_message_id VARCHAR(18) NULL,
  message_created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (message_id),
  KEY idx_project_chat_project (project_id),
  CONSTRAINT fk_project_chat_project FOREIGN KEY (project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_project_chat_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_project_chat_reply_to FOREIGN KEY (reply_to_message_id) REFERENCES tb_project_chat_messages(message_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tb_project_chat_images (
  image_id         VARCHAR(18) NOT NULL,
  message_id       VARCHAR(18) NOT NULL,
  image_url        VARCHAR(255) NOT NULL,
  image_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (image_id),
  KEY idx_project_chat_image_message (message_id),
  CONSTRAINT fk_project_chat_image_message FOREIGN KEY (message_id) REFERENCES tb_project_chat_messages(message_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ต้องเป็น DATETIME(3) ด้วยเหตุผลเดียวกับ tb_task_chat_reads (กันข้อความ+อ่านชนกันในวินาทีเดียว)
CREATE TABLE tb_project_chat_reads (
  project_id   VARCHAR(18) NOT NULL,
  user_id      VARCHAR(18) NOT NULL,
  last_read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_project_chat_read_project FOREIGN KEY (project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_project_chat_read_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7) ประวัติ/timeline ของ task (สิ่งที่ลูกค้าเห็นผ่าน share link) ─────────────
-- log_fullname snapshot ไว้เหมือน tb_login_logs เผื่อ user ถูกลบทีหลังชื่อจะได้ไม่หาย
CREATE TABLE tb_task_activity_log (
  log_id         VARCHAR(18) NOT NULL,
  task_id        VARCHAR(18) NOT NULL,
  user_id        VARCHAR(18) NULL,
  log_fullname   VARCHAR(101) NULL,
  log_action     ENUM('created','status_changed','edited','assigned','comment') NOT NULL,
  log_old_value  VARCHAR(255) NULL,
  log_new_value  VARCHAR(255) NULL,
  log_message    TEXT NULL,
  log_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_tal_task (task_id),
  KEY idx_tal_created (log_created_at),
  CONSTRAINT fk_tal_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_tal_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

commit;

-- ─── ข้อมูลเริ่มต้น ───────────────────────────────────────────────────────────
-- ตำแหน่ง PM เริ่มต้น: เปิดสิทธิ์ทุกบิต (29 บิต) ให้คุมโปรเจกต์ได้เต็มที่
-- id ใส่ตรงๆ เพราะ seed ครั้งเดียวตอนตั้งระบบ ไม่ได้ผ่าน generateDailyId()
INSERT INTO tb_project_positions (position_id, position_name, position_permission)
VALUES ('POS202601010000001', 'PM', '11111111111111111111111111111');

commit;
