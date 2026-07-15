SET NAMES utf8mb4 collate utf8mb4_unicode_ci;

-- ─── 1) ตำแหน่งในโปรเจกต์ (project position) ────────────────────────────────────
-- กำหนดกลาง ใช้ร่วมกันได้ทุกโปรเจกต์ (เหมือน tb_roles แต่คนละสิทธิ์กันคนละเรื่อง)
-- tb_roles.role_permission = สิทธิ์ใช้งานระบบหลังบ้านทั้งระบบ (เมนู/หน้าไหนเข้าได้)
-- tb_project_positions.position_permission = สิทธิ์ทำอะไรได้บ้าง "ภายในโปรเจกต์ที่ตัวเองอยู่" เท่านั้น
-- ลำดับบิต (13 บิต) ต้องตรงกับ PROJECT_PERMISSION_GROUPS ใน frontend/app/components/project-position-bits.ts เป๊ะๆ:
--   [เกี่ยวกับ Task]    0 deleteTask, 1 editTask, 2 changeTaskStatus, 3 addTask, 4 editOwnTask, 5 changeOwnTaskStatus
--   [เกี่ยวกับ Subtask] 6 changeSubtaskStatus, 7 addOwnSubtask, 8 changeOwnSubtaskStatus
--   [เกี่ยวกับโปรเจกต์]  9 deleteProject, 10 editProjectInfo, 11 manageMembers, 12 manageShareLink
-- ทุกการกระทำต้องมีบิตชัดเจนเสมอ ไม่มีสิทธิ์อัตโนมัติจากการเป็นผู้รับผิดชอบอีกต่อไป (รวมถึงเปลี่ยนสถานะด้วย)
-- เช่น เปลี่ยนสถานะ task ของตัวเอง ต้องมีบิต changeOwnTaskStatus (หรือ changeTaskStatus) อย่างใดอย่างหนึ่ง
-- แก้ไขข้อมูล task ของตัวเอง ต้องมีบิต editOwnTask (หรือ editTask) อย่างใดอย่างหนึ่ง
-- เพิ่ม subtask ให้ task ที่ตัวเองรับผิดชอบ ต้องมีบิต addOwnSubtask (หรือ addTask) อย่างใดอย่างหนึ่ง
CREATE TABLE tb_project_positions (
  position_id         VARCHAR(15) NOT NULL,
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
  client_id         VARCHAR(15)  NOT NULL,
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
  project_id               VARCHAR(15) NOT NULL,
  client_id                VARCHAR(15) NULL,
  project_name             VARCHAR(150) NOT NULL,
  project_description      TEXT NULL,
  project_status           ENUM('planning','in_progress','on_hold','completed','cancelled') NOT NULL DEFAULT 'planning',
  project_start_date       DATE NULL,
  project_due_date         DATE NULL,
  project_progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
  project_share_token      VARCHAR(64) NOT NULL,
  project_share_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  project_use_task_weight  BOOLEAN NOT NULL DEFAULT FALSE,
  project_created_by       VARCHAR(15) NULL,
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
  project_member_id VARCHAR(15) NOT NULL,
  project_id        VARCHAR(15) NOT NULL,
  user_id           VARCHAR(15) NOT NULL,
  joined_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_member_id),
  UNIQUE KEY uq_project_member (project_id, user_id),
  KEY idx_pm_user (user_id),
  CONSTRAINT fk_pm_project FOREIGN KEY (project_id) REFERENCES tb_projects(project_id) ON DELETE CASCADE,
  CONSTRAINT fk_pm_user    FOREIGN KEY (user_id)    REFERENCES tb_users(user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5) ตำแหน่งที่แต่ละสมาชิกถืออยู่ในโปรเจกต์นั้น (หลายตำแหน่งต่อคนได้) ──────────
CREATE TABLE tb_project_member_positions (
  project_member_id VARCHAR(15) NOT NULL,
  position_id       VARCHAR(15) NOT NULL,
  PRIMARY KEY (project_member_id, position_id),
  CONSTRAINT fk_pmp_member   FOREIGN KEY (project_member_id) REFERENCES tb_project_members(project_member_id) ON DELETE CASCADE,
  CONSTRAINT fk_pmp_position FOREIGN KEY (position_id)       REFERENCES tb_project_positions(position_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 6) งาน (task) ──────────────────────────────────────────────────────────────
-- task_parent_id รองรับ subtask (nullable, อ้างกลับตัวเอง)
-- task_weight ใช้ถ่วงน้ำหนักตอนคำนวณ % ความคืบหน้าของโปรเจกต์
-- ผู้รับผิดชอบเป็นแบบหลายคนต่อ task ได้ ย้ายไปเก็บที่ tb_task_assignees แทนคอลัมน์เดี่ยว
CREATE TABLE tb_tasks (
  task_id          VARCHAR(15) NOT NULL,
  project_id       VARCHAR(15) NOT NULL,
  task_parent_id   VARCHAR(15) NULL,
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
  task_id VARCHAR(15) NOT NULL,
  user_id VARCHAR(15) NOT NULL,
  PRIMARY KEY (task_id, user_id),
  KEY idx_ta_user (user_id),
  CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tb_tasks(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_ta_user FOREIGN KEY (user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 7) ประวัติ/timeline ของ task (สิ่งที่ลูกค้าเห็นผ่าน share link) ─────────────
-- log_fullname snapshot ไว้เหมือน tb_login_logs เผื่อ user ถูกลบทีหลังชื่อจะได้ไม่หาย
-- log_id รูปแบบ yyyymmddxxxxxxx เหมือน tb_login_logs เพราะมีปริมาณเยอะรายวันเหมือนกัน
CREATE TABLE tb_task_activity_log (
  log_id         VARCHAR(15) NOT NULL,
  task_id        VARCHAR(15) NOT NULL,
  user_id        VARCHAR(15) NULL,
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
-- ตำแหน่ง PM เริ่มต้น: เปิดสิทธิ์ทุกบิต (13 บิต) ให้คุมโปรเจกต์ได้เต็มที่
-- position_id ใส่ตรงๆ เพราะ seed ครั้งเดียวตอนตั้งระบบ ไม่ได้ผ่าน generateId()
INSERT INTO tb_project_positions (position_id, position_name, position_permission)
VALUES ('POS000000000001', 'PM', '1111111111111');

INSERT INTO tb_maxID (max_table, max_id) VALUES ('tb_project_positions', 'POS000000000001');

commit;
