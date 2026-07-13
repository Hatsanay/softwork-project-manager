SET NAMES utf8mb4 collate utf8mb4_unicode_ci;

-- ─── 1) สิทธิ์การใช้งาน (role) ──────────────────────────────────────────────────
-- role_permission เป็น bitmask string ('0'/'1') ยาวตาม TOTAL_BITS ใน app/components/bit.tsx
-- ลำดับบิตต้องตรงกับลำดับ leaf ใน PERMISSION_GROUPS ของไฟล์นั้นเป๊ะๆ (ปัจจุบัน 9 บิต)
CREATE TABLE tb_roles (
  role_id            VARCHAR(15) NOT NULL,
  role_name          VARCHAR(50)        NOT NULL,
  role_permission    VARCHAR(64)        NOT NULL DEFAULT '',
  role_department    VARCHAR(15)        NULL,
  role_type          VARCHAR(1)         NOT NULL DEFAULT 'R' COMMENT 'R = role ปกติ, S = system role (แก้/ลบไม่ได้)',
  role_granted_by_id VARCHAR(15)        NULL COMMENT 'user ที่สร้าง role นี้ (FK เพิ่มทีหลังเพราะอ้างกลับไป tb_users)',
  role_granted_at    DATETIME           DEFAULT CURRENT_TIMESTAMP,
  role_update_at     DATETIME           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2) ผู้ใช้งาน (staff) ────────────────────────────────────────────────────────
CREATE TABLE tb_users (
  user_id             VARCHAR(15) NOT NULL,
  user_email          VARCHAR(255)       NOT NULL,
  user_password       VARCHAR(255)       NOT NULL COMMENT 'bcrypt hash',
  user_fname          VARCHAR(50)        NOT NULL,
  user_lname          VARCHAR(50)        NOT NULL,
  user_phone          VARCHAR(20)        NULL,
  user_line_uid       VARCHAR(100)       NULL,
  user_whatsapp_no    VARCHAR(20)        NULL,
  user_avatar_url     VARCHAR(255)       NULL,
  user_role_id        VARCHAR(15)                NULL,
  user_status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  user_must_change_password BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'บังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก (สำหรับรหัสผ่านชั่วคราวที่ระบบ gen ให้)',
  user_last_login_at  DATETIME           NULL,
  user_created_at     DATETIME           DEFAULT CURRENT_TIMESTAMP,
  user_updated_at     DATETIME           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_user_email (user_email),
  KEY idx_user_role (user_role_id),
  CONSTRAINT fk_user_role FOREIGN KEY (user_role_id) REFERENCES tb_roles(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3) ผูก FK ย้อนกลับของ tb_roles ที่รอ tb_users ถูกสร้างก่อน ───────────────────
ALTER TABLE tb_roles
  ADD CONSTRAINT fk_role_granted_by FOREIGN KEY (role_granted_by_id) REFERENCES tb_users(user_id);

-- ─── 4) maxID ──────────────────────────────────────────────────
-- หนึ่งแถวต่อหนึ่งตาราง เก็บ id ล่าสุดที่ออกไปแล้วของตารางนั้น (ไม่ใช่ log ทุก id ที่เคยออก)
-- generateId() ใน backend อ่านแถวนี้แบบ FOR UPDATE เพื่อกันชนกันตอนออก id พร้อมกัน
CREATE TABLE tb_maxID (
  max_table VARCHAR(50) NOT NULL,
  max_id    VARCHAR(15) NOT NULL,
  PRIMARY KEY (max_table)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5) แผนก (department) ──────────────────────────────────────────────────────
CREATE TABLE tb_department (
  dep_id            VARCHAR(15) NOT NULL,
  dep_name          VARCHAR(100) NOT NULL,
  dep_status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  dep_created_at     DATETIME           DEFAULT CURRENT_TIMESTAMP,
  dep_updated_at     DATETIME           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dep_id),
  UNIQUE KEY uq_dep_name (dep_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผูก FK ของ tb_roles.role_department ที่รอ tb_department ถูกสร้างก่อน (เหมือน fk_role_granted_by)
ALTER TABLE tb_roles
  ADD CONSTRAINT fk_role_department FOREIGN KEY (role_department) REFERENCES tb_department(dep_id);

-- ─── 6) log การ login/logout ────────────────────────────────────────────────
-- log_user_id เป็น NULL ได้ตอน login_failed ด้วยอีเมลที่ไม่มีในระบบ (หา user ไม่เจอ)
-- เก็บ log_email, log_fullname ไว้เป็น snapshot เสมอ (ไม่พึ่ง JOIN ไป tb_users)
-- เพราะถ้า user ถูกลบทีหลัง log_user_id จะเป็น NULL (ON DELETE SET NULL) แล้วชื่อจะหายไปด้วยถ้าไม่ snapshot ไว้
-- log_id รูปแบบ yyyymmddxxxxxxx (15 ตัว) — เลขรัน 7 หลักท้ายรีเซ็ตใหม่ทุกวัน (generateDailyId ใน backend)
CREATE TABLE tb_login_logs (
  log_id         VARCHAR(15) NOT NULL,
  log_user_id    VARCHAR(15)  NULL,
  log_email      VARCHAR(255) NOT NULL,
  log_fullname   VARCHAR(101) NULL,
  log_action     ENUM('login','logout','login_failed') NOT NULL,
  log_ip_address VARCHAR(45)  NULL,
  log_user_agent VARCHAR(255) NULL,
  log_created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (log_id),
  KEY idx_log_user (log_user_id),
  KEY idx_log_created (log_created_at),
  CONSTRAINT fk_log_user FOREIGN KEY (log_user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

commit;

-- ─── ข้อมูลเริ่มต้น ───────────────────────────────────────────────────────────
-- role admin: เปิดสิทธิ์ทุกบิต (14 บิต ตาม TOTAL_BITS ปัจจุบัน) — ปรับความยาวถ้า bit.tsx เพิ่มเมนู
-- role_id ใส่ตรงๆ เพราะ seed ครั้งเดียวตอนตั้งระบบ ไม่ได้ผ่าน generateId()
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
VALUES ('ROL000000000001', 'Admin', '11111111111111', 'S');

-- ตั้งค่า counter เริ่มต้นให้ tb_maxID ตามหลัง id ที่ seed ไปแล้ว
-- ครั้งต่อไปที่ generateId('tb_roles', 'ROL') ทำงาน จะได้ 'ROL000000000002' ต่อ
INSERT INTO tb_maxID (max_table, max_id) VALUES ('tb_roles', 'ROL000000000001');

-- user แรกของระบบ ผูกกับ role Admin — ต้องมีอย่างน้อยคนเดียวถึงจะ login ผ่าน Postman ได้
-- (createUser endpoint ต้องมี token ก่อน แต่จะ login ได้ต้องมี user อยู่แล้ว เลย seed ตรงนี้ครั้งเดียว)
-- email: admin@softwork.local / password: Admin@12345 — user_must_change_password = FALSE เพราะเป็น bootstrap account
INSERT INTO tb_users (user_id, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
VALUES (
  'USR000000000001',
  'admin@softwork.local',
  '$2a$10$UnrGKjjYX4uf1ojXLAPNOOdAT26aZg/eVmTDGvv2wWF95gYoQ5G0K',
  'System',
  'Admin',
  'ROL000000000001',
  FALSE
);

INSERT INTO tb_maxID (max_table, max_id) VALUES ('tb_users', 'USR000000000001');

commit;
