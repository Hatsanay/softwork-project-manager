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
  -- วงจรขาย 1A (2026-10-13) — FK สกุลเงินอยู่ใน create_sales.sql
  client_type          ENUM('juristic','individual') NOT NULL DEFAULT 'juristic',
  client_country       CHAR(2)      NOT NULL DEFAULT 'TH' COMMENT 'ISO 3166 — เลขผู้เสียภาษีบังคับ 13 หลักเฉพาะ TH',
  client_tax_id        VARCHAR(30)  NULL,
  client_branch_code   VARCHAR(5)   NULL COMMENT '00000 = สำนักงานใหญ่',
  client_address       TEXT         NULL COMMENT 'ที่อยู่สำหรับออกเอกสาร',
  client_contact_name  VARCHAR(100) NULL,
  client_credit_days   INT          NULL,
  client_wht_rate      DECIMAL(5,2) NULL,
  client_currency      CHAR(3)      NOT NULL DEFAULT 'THB',
  client_language      ENUM('th','en') NOT NULL DEFAULT 'th',
  client_vat_treatment ENUM('standard','zero') NOT NULL DEFAULT 'standard',
  client_status        ENUM('active','inactive') NOT NULL DEFAULT 'active',
  client_created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  client_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id),
  KEY fk_client_currency (client_currency)
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
  -- สามคอลัมน์นี้ถูกกรองบ่อยในทุก query ของ dashboard KPI/รายการโปรเจกต์ (project_status/project_type/project_due_date)
  -- เพิ่ม index ไว้ล่วงหน้ากันข้อมูลโตแล้วช้า แม้ตอนนี้ข้อมูลยังน้อยจนยังไม่เห็นผลต่างชัดเจนก็ตาม
  KEY idx_project_status (project_status),
  KEY idx_project_type (project_type),
  KEY idx_project_due_date (project_due_date),
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
  task_quotation_item_id BIGINT UNSIGNED NULL COMMENT 'สร้างจากรายการไหนของใบเสนอราคา (FK ใน create_sales.sql)',
  task_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  task_updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id),
  KEY idx_task_project (project_id),
  KEY idx_task_parent (task_parent_id),
  -- KPI ใน dashboard.controller.js กรอง/เทียบช่วงวันที่บนสองคอลัมน์นี้แทบทุก query (due date cohort, cycle time ตาม completed_at)
  KEY idx_task_due_date (task_due_date),
  KEY idx_task_status_completed (task_status, task_completed_at),
  KEY fk_task_quotation_item (task_quotation_item_id),
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
  KEY idx_issue_task_status (task_id, issue_status),
  -- dashboard "ปัญหาที่เปิดอยู่" และ KPI เวลาเฉลี่ยแก้ปัญหา กรอง/เทียบช่วงวันที่บนสองคอลัมน์นี้คู่กันเสมอ
  KEY idx_issue_status_resolved (issue_status, issue_resolved_at),
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
  KEY idx_issue_reply_created (issue_id, reply_created_at),
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
  KEY idx_chat_task_created (task_id, message_created_at),
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
  KEY idx_project_chat_created (project_id, message_created_at),
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
  -- KPI cycle time หาเวลาที่เปลี่ยนเป็น in_progress ครั้งแรก (TASK_START_LOG_SUBQUERY) อ่านจาก index นี้อย่างเดียวไม่ต้องสแกนตาราง
  KEY idx_tal_status_start (log_action, log_new_value, task_id, log_created_at),
  CONSTRAINT fk_tal_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_tal_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── บอร์ดงานแบบ Trello (2026-10-17) — ป้ายสีของโปรเจกต์ + checklist ในงาน · แบบ: docs/plans/2026-10-17-project-kanban.md ───
-- ป้ายอยู่กับโปรเจกต์ (แบบ Trello ที่ป้ายอยู่กับบอร์ด) · สีเก็บเป็นรหัส ไม่เก็บ hex (เปลี่ยนเฉดทีหลังได้ที่เดียวในหน้าเว็บ)
-- สีครบชุด Trello รวมเขียว/เหลือง/แดง = ข้อยกเว้นของกติกาธีม เฉพาะป้ายบนบอร์ด (เจ้าของระบบเลือก 17 ต.ค. 2026 — K8)
CREATE TABLE tb_project_labels (
  pl_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  pl_project_id  VARCHAR(18) NOT NULL,
  pl_name        VARCHAR(50) NOT NULL,
  pl_color       ENUM('green','yellow','orange','red','purple','blue','sky','lime','pink','black') NOT NULL DEFAULT 'blue',
  pl_sort_order  INT NOT NULL DEFAULT 0,
  pl_created_by  VARCHAR(18) NULL,
  pl_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  pl_updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (pl_id),
  UNIQUE KEY uq_pl_project_name (pl_project_id, pl_name),
  KEY fk_pl_created_by (pl_created_by),
  CONSTRAINT fk_pl_project FOREIGN KEY (pl_project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_pl_created_by FOREIGN KEY (pl_created_by) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ป้ายที่ติดกับงาน — ลบงานหรือลบป้ายแล้วความผูกหายตาม
CREATE TABLE tb_task_labels (
  tl_task_id   VARCHAR(18) NOT NULL,
  tl_label_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (tl_task_id, tl_label_id),
  KEY fk_tl_label (tl_label_id),
  CONSTRAINT fk_tl_task FOREIGN KEY (tl_task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_label FOREIGN KEY (tl_label_id) REFERENCES tb_project_labels(pl_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- checklist ในงาน — รายการย่อยเบาๆ ไม่มีผู้รับผิดชอบ/สถานะ ไม่นับเข้าความคืบหน้าโปรเจกต์ (ต่างจาก subtask)
CREATE TABLE tb_task_checklist_items (
  tci_id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tci_task_id     VARCHAR(18) NOT NULL,
  tci_text        VARCHAR(200) NOT NULL,
  tci_is_done     TINYINT(1) NOT NULL DEFAULT 0,
  tci_sort_order  INT NOT NULL DEFAULT 0,
  tci_done_by     VARCHAR(18) NULL,
  tci_done_at     DATETIME NULL,
  tci_created_by  VARCHAR(18) NULL,
  tci_created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tci_id),
  KEY idx_tci_task (tci_task_id, tci_sort_order),
  KEY fk_tci_done_by (tci_done_by),
  KEY fk_tci_created_by (tci_created_by),
  CONSTRAINT fk_tci_task FOREIGN KEY (tci_task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_tci_done_by FOREIGN KEY (tci_done_by) REFERENCES tb_users(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_tci_created_by FOREIGN KEY (tci_created_by) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

commit;

-- ─── ข้อมูลเริ่มต้น ───────────────────────────────────────────────────────────
-- ตำแหน่ง PM เริ่มต้น: เปิดสิทธิ์ทุกบิต (29 บิต) ให้คุมโปรเจกต์ได้เต็มที่
-- id ใส่ตรงๆ เพราะ seed ครั้งเดียวตอนตั้งระบบ ไม่ได้ผ่าน generateDailyId()
INSERT INTO tb_project_positions (position_id, position_name, position_permission)
VALUES ('POS202601010000001', 'PM', '11111111111111111111111111111');

commit;

-- 2026-10-24 P-1 Fastwork: ช่องทางงานของโปรเจกต์ (ฉบับจริงอยู่ใน deploy_schema.sql)
ALTER TABLE tb_projects ADD COLUMN project_channel enum('direct','fastwork') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'direct' COMMENT 'ช่องทางงาน: direct = ลูกค้าตรง (ใบเสนอราคา/ใบแจ้งหนี้) · fastwork = รับงานผ่าน fastwork.com (รายได้จากการโอนของแพลตฟอร์ม)';
ALTER TABLE tb_projects ADD COLUMN project_fastwork_order_no varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขคำสั่งซื้อบน Fastwork';
ALTER TABLE tb_projects ADD COLUMN project_fastwork_url varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลิงก์หน้างานบน Fastwork';

-- งวดงาน Fastwork (2026-10-24 · P-1) — ตกลงกับลูกค้าบน Fastwork · ส่งงานแล้ว = fwm_delivered_at
-- เงินที่ได้จริงอยู่ใน tb_fastwork_payouts (หนึ่งงวดมีรายการเงินที่ยังไม่ยกเลิกได้รายการเดียว — ตรวจใน backend)
CREATE TABLE IF NOT EXISTS `tb_fastwork_milestones` (
  `fwm_id` int unsigned NOT NULL AUTO_INCREMENT,
  `fwm_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwm_order` smallint unsigned NOT NULL,
  `fwm_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwm_amount` decimal(15,2) NOT NULL COMMENT 'ราคางวดตามที่ตกลงบน Fastwork (ยอดที่ลูกค้าจ่าย)',
  `fwm_due_date` date DEFAULT NULL,
  `fwm_delivered_at` datetime DEFAULT NULL COMMENT 'ส่งงานงวดนี้บน Fastwork แล้ว (รอลูกค้ายืนยัน)',
  `fwm_delivered_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwm_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwm_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `fwm_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`fwm_id`),
  KEY `idx_fwm_project_order` (`fwm_project_id`,`fwm_order`),
  KEY `fk_fwm_delivered_by` (`fwm_delivered_by`),
  KEY `fk_fwm_created_by` (`fwm_created_by`),
  CONSTRAINT `fk_fwm_created_by` FOREIGN KEY (`fwm_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_delivered_by` FOREIGN KEY (`fwm_delivered_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwm_project` FOREIGN KEY (`fwm_project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เงินจาก Fastwork (2026-10-24 · P-1) — หนึ่งแถวต่อการโอนหนึ่งครั้ง · ไม่ออกใบแจ้งหนี้/ใบเสร็จ (Fastwork ออกให้ลูกค้าเอง)
-- รอโอน (ลูกค้ายืนยันงวดแล้ว) → เข้าแล้ว · ยกเลิก = คืนเงินลูกค้า/ข้อพิพาท (ไม่ลบแถว ต้องมีเหตุผล)
-- ยอดเข้าบัญชี = ราคางวด − ค่าธรรมเนียม − VAT ค่าธรรมเนียม − หัก ณ ที่จ่าย · อัตราค่าธรรมเนียมเก็บ ณ วันที่บันทึก
CREATE TABLE IF NOT EXISTS `tb_fastwork_payouts` (
  `fwp_id` int unsigned NOT NULL AUTO_INCREMENT,
  `fwp_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwp_milestone_id` int unsigned DEFAULT NULL,
  `fwp_status` enum('pending','received','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `fwp_gross` decimal(15,2) NOT NULL COMMENT 'ราคางวดที่ลูกค้าจ่ายเข้า Fastwork',
  `fwp_fee_rate` decimal(5,2) NOT NULL COMMENT 'อัตราค่าธรรมเนียม ณ วันที่บันทึก (%)',
  `fwp_fee` decimal(15,2) NOT NULL,
  `fwp_fee_vat` decimal(15,2) NOT NULL DEFAULT '0.00',
  `fwp_wht` decimal(15,2) NOT NULL DEFAULT '0.00',
  `fwp_wht_certificate_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่ 50 ทวิ ที่ Fastwork ออกให้ (ถ้ามี)',
  `fwp_net` decimal(15,2) NOT NULL COMMENT 'ยอดเข้าบัญชีจริง',
  `fwp_approved_date` date NOT NULL COMMENT 'วันที่ลูกค้ายืนยันงวดบน Fastwork',
  `fwp_received_date` date DEFAULT NULL,
  `fwp_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_cancelled_at` datetime DEFAULT NULL,
  `fwp_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_received_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `fwp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `fwp_version` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`fwp_id`),
  KEY `idx_fwp_project` (`fwp_project_id`),
  KEY `idx_fwp_status_received` (`fwp_status`,`fwp_received_date`),
  KEY `fk_fwp_milestone` (`fwp_milestone_id`),
  KEY `fk_fwp_bank_account` (`fwp_bank_account_id`),
  KEY `fk_fwp_cancelled_by` (`fwp_cancelled_by`),
  KEY `fk_fwp_received_by` (`fwp_received_by`),
  KEY `fk_fwp_created_by` (`fwp_created_by`),
  CONSTRAINT `fk_fwp_bank_account` FOREIGN KEY (`fwp_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_fwp_cancelled_by` FOREIGN KEY (`fwp_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwp_created_by` FOREIGN KEY (`fwp_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_fwp_milestone` FOREIGN KEY (`fwp_milestone_id`) REFERENCES `tb_fastwork_milestones` (`fwm_id`),
  CONSTRAINT `fk_fwp_project` FOREIGN KEY (`fwp_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_fwp_received_by` FOREIGN KEY (`fwp_received_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-24 P-2 ส่วนแบ่งกำไร (ฉบับจริงอยู่ใน deploy_schema.sql)

-- ส่วนแบ่งกำไรรายโปรเจกต์ (2026-10-24 · P-2) — ผู้รับเป็นผู้ใช้ในระบบ หรือผู้ขาย/ฟรีแลนซ์ (อย่างใดอย่างหนึ่ง)
-- percent = % ของกำไรหลังหักส่วนแบ่งตายตัว · fixed = จำนวนเงินตายตัว (หักก่อน) · ที่เหลือ = เก็บเข้าเงินทุน
-- แก้ได้จนกว่าจะปิดยอด (บันทึกทั้งชุดใหม่ทุกครั้ง) · ชื่อผู้รับไม่เก็บซ้ำ ดึงจากผู้ใช้/ผู้ขายตอนอ่าน (คัดลอกชื่อเฉพาะตอนเบิกและปิดยอด)
CREATE TABLE IF NOT EXISTS `tb_project_shares` (
  `shr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `shr_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shr_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shr_vendor_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shr_kind` enum('percent','fixed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `shr_percent` decimal(5,2) DEFAULT NULL,
  `shr_amount` decimal(15,2) DEFAULT NULL,
  `shr_note` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'หน้าที่ในงาน เช่น คนทำงาน คนหางาน',
  `shr_order` smallint unsigned NOT NULL DEFAULT '0',
  `shr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`shr_id`),
  KEY `idx_shr_project` (`shr_project_id`),
  KEY `fk_shr_user` (`shr_user_id`),
  KEY `fk_shr_vendor` (`shr_vendor_id`),
  KEY `fk_shr_created_by` (`shr_created_by`),
  CONSTRAINT `fk_shr_created_by` FOREIGN KEY (`shr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_shr_project` FOREIGN KEY (`shr_project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_shr_user` FOREIGN KEY (`shr_user_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_shr_vendor` FOREIGN KEY (`shr_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เบิกส่วนแบ่งล่วงหน้า (2026-10-24 · P-2) — จ่ายแล้วทันทีที่บันทึก · หักออกตอนปิดยอด · ยกเลิกต้องมีเหตุผล (ไม่ลบ)
CREATE TABLE IF NOT EXISTS `tb_share_advances` (
  `sha_id` int unsigned NOT NULL AUTO_INCREMENT,
  `sha_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sha_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_vendor_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_recipient_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อ ณ วันจ่าย (หลักฐานการจ่าย ไม่เปลี่ยนตามชื่อปัจจุบัน)',
  `sha_amount` decimal(15,2) NOT NULL,
  `sha_paid_date` date NOT NULL,
  `sha_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_status` enum('paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'paid',
  `sha_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_cancelled_at` datetime DEFAULT NULL,
  `sha_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sha_id`),
  KEY `idx_sha_project` (`sha_project_id`),
  KEY `fk_sha_user` (`sha_user_id`),
  KEY `fk_sha_vendor` (`sha_vendor_id`),
  KEY `fk_sha_bank_account` (`sha_bank_account_id`),
  KEY `fk_sha_cancelled_by` (`sha_cancelled_by`),
  KEY `fk_sha_created_by` (`sha_created_by`),
  CONSTRAINT `fk_sha_bank_account` FOREIGN KEY (`sha_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_sha_cancelled_by` FOREIGN KEY (`sha_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sha_created_by` FOREIGN KEY (`sha_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sha_project` FOREIGN KEY (`sha_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_sha_user` FOREIGN KEY (`sha_user_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_sha_vendor` FOREIGN KEY (`sha_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ปิดยอดส่วนแบ่ง (2026-10-24 · P-2) — ตัวเลข ณ วันปิดยอด (ล็อก ไม่คิดใหม่) · โปรเจกต์หนึ่งมีที่ยังไม่ยกเลิกได้ครั้งเดียว (ตรวจใน backend)
-- กำไรที่แบ่งได้ = รายได้ที่เงินเข้าจริง (ก่อน VAT) − ค่าธรรมเนียมแพลตฟอร์ม − ค่าใช้จ่ายของโปรเจกต์
-- กำไรหลังหักส่วนตายตัว = กำไรที่แบ่งได้ − ส่วนแบ่งตายตัวทั้งหมด · เข้าเงินทุน = กำไรที่แบ่งได้ − ส่วนแบ่งทุกคน
CREATE TABLE IF NOT EXISTS `tb_share_settlements` (
  `sst_id` int unsigned NOT NULL AUTO_INCREMENT,
  `sst_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sst_status` enum('settled','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'settled',
  `sst_settled_date` date NOT NULL,
  `sst_revenue` decimal(15,2) NOT NULL COMMENT 'รายได้ที่เงินเข้าจริง ก่อน VAT (ลูกค้าตรง + ราคางวด Fastwork)',
  `sst_platform_fee` decimal(15,2) NOT NULL,
  `sst_expense_cost` decimal(15,2) NOT NULL,
  `sst_distributable` decimal(15,2) NOT NULL,
  `sst_fixed_total` decimal(15,2) NOT NULL,
  `sst_after_fixed` decimal(15,2) NOT NULL,
  `sst_company_amount` decimal(15,2) NOT NULL COMMENT 'เก็บเข้าเงินทุน (ติดลบ = โปรเจกต์ขาดทุน)',
  `sst_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_cancelled_at` datetime DEFAULT NULL,
  `sst_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_version` int unsigned NOT NULL DEFAULT '0',
  `sst_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sst_id`),
  KEY `idx_sst_project` (`sst_project_id`),
  KEY `fk_sst_cancelled_by` (`sst_cancelled_by`),
  KEY `fk_sst_created_by` (`sst_created_by`),
  CONSTRAINT `fk_sst_cancelled_by` FOREIGN KEY (`sst_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sst_created_by` FOREIGN KEY (`sst_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sst_project` FOREIGN KEY (`sst_project_id`) REFERENCES `tb_projects` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ส่วนแบ่งรายคนของการปิดยอด (2026-10-24 · P-2) — ยอดที่ได้ − เบิกล่วงหน้า = ต้องจ่าย (ติดลบ = ต้องคืน)
-- ยอดโอน = ต้องจ่าย − หัก ณ ที่จ่าย (รอนักบัญชียืนยัน Z1) · ต้องจ่าย 0 = จ่ายครบอัตโนมัติ
CREATE TABLE IF NOT EXISTS `tb_share_settlement_lines` (
  `ssl_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ssl_settlement_id` int unsigned NOT NULL,
  `ssl_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_vendor_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_recipient_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อ ณ วันปิดยอด (ตัวเลขที่ล็อกแล้ว ไม่เปลี่ยนตามชื่อปัจจุบัน)',
  `ssl_kind` enum('percent','fixed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ssl_percent` decimal(5,2) DEFAULT NULL,
  `ssl_amount` decimal(15,2) NOT NULL COMMENT 'ส่วนแบ่งที่ได้',
  `ssl_advanced` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เบิกล่วงหน้าไปแล้ว',
  `ssl_due` decimal(15,2) NOT NULL COMMENT 'ต้องจ่าย = ส่วนแบ่ง − เบิกล่วงหน้า (ติดลบ = ต้องคืน)',
  `ssl_status` enum('unpaid','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `ssl_wht` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ssl_transfer_amount` decimal(15,2) DEFAULT NULL,
  `ssl_paid_date` date DEFAULT NULL,
  `ssl_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_paid_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_paid_at` datetime DEFAULT NULL,
  `ssl_version` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`ssl_id`),
  KEY `idx_ssl_settlement` (`ssl_settlement_id`),
  KEY `fk_ssl_user` (`ssl_user_id`),
  KEY `fk_ssl_vendor` (`ssl_vendor_id`),
  KEY `fk_ssl_bank_account` (`ssl_bank_account_id`),
  KEY `fk_ssl_paid_by` (`ssl_paid_by`),
  CONSTRAINT `fk_ssl_bank_account` FOREIGN KEY (`ssl_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_ssl_paid_by` FOREIGN KEY (`ssl_paid_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ssl_settlement` FOREIGN KEY (`ssl_settlement_id`) REFERENCES `tb_share_settlements` (`sst_id`),
  CONSTRAINT `fk_ssl_user` FOREIGN KEY (`ssl_user_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ssl_vendor` FOREIGN KEY (`ssl_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-25 P-3 สมุดเงินทุน (ฉบับจริงอยู่ใน deploy_schema.sql)

-- สมุดเงินทุน (2026-10-25 · P-3) — เฉพาะรายการที่บันทึกเอง (ฝากเพิ่ม/ถอนออก)
-- ยอดเข้าทุนจากโปรเจกต์ไม่เก็บซ้ำที่นี่: อ่านจาก tb_share_settlements.sst_company_amount ของการปิดยอดที่ยังไม่ยกเลิก
-- ยกเลิกต้องมีเหตุผล (ไม่ลบ)
CREATE TABLE IF NOT EXISTS `tb_capital_entries` (
  `cpe_id` int unsigned NOT NULL AUTO_INCREMENT,
  `cpe_kind` enum('deposit','withdraw') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'deposit = ฝากเพิ่มเอง · withdraw = ถอนออก (ต้องมีเหตุผล)',
  `cpe_amount` decimal(15,2) NOT NULL COMMENT 'จำนวนเงิน (บวกเสมอ ทิศทางดูจาก cpe_kind)',
  `cpe_entry_date` date NOT NULL,
  `cpe_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_status` enum('active','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `cpe_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_cancelled_at` datetime DEFAULT NULL,
  `cpe_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cpe_id`),
  KEY `idx_cpe_status_date` (`cpe_status`,`cpe_entry_date`),
  KEY `fk_cpe_cancelled_by` (`cpe_cancelled_by`),
  KEY `fk_cpe_created_by` (`cpe_created_by`),
  CONSTRAINT `fk_cpe_cancelled_by` FOREIGN KEY (`cpe_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cpe_created_by` FOREIGN KEY (`cpe_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
