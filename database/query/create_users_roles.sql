SET NAMES utf8mb4 collate utf8mb4_unicode_ci;

-- ─── รูปแบบ ID ของทุกตารางในระบบ ──────────────────────────────────────────────────
-- PREFIX (3 ตัว) + yyyymmdd (8 ตัว) + เลขรัน 7 หลักท้าย = 18 ตัวทั้งหมด
-- เลขรัน 7 หลักท้ายรีเซ็ตเป็น 0000001 ใหม่ทุกวันต่อตาราง — คำนวณเลขถัดไปจากตัวตารางเองตรงๆ (generateDailyId ใน backend)
-- ไม่ได้พึ่ง tb_maxID มาคำนวณเลขถัดไปอีกต่อไป แต่ยังอัปเดต tb_maxID ไว้คู่ขนานทุกครั้งที่ออก id ใหม่
-- (เก็บ "id ล่าสุดที่เคยออก" ต่อตาราง ไว้ดูอ้างอิง/debug เฉยๆ ไม่มีผลต่อการออก id จริง)

-- ─── 1) สิทธิ์การใช้งาน (role) ──────────────────────────────────────────────────
-- role_permission เป็น bitmask string ('0'/'1') ยาวตาม TOTAL_BITS ใน app/components/bit.tsx
-- ลำดับบิตต้องตรงกับลำดับ leaf ใน PERMISSION_GROUPS ของไฟล์นั้นเป๊ะๆ (ปัจจุบัน 27 บิต)
CREATE TABLE tb_roles (
  role_id            VARCHAR(18) NOT NULL,
  role_name          VARCHAR(50)        NOT NULL,
  role_permission    VARCHAR(64)        NOT NULL DEFAULT '',
  role_department    VARCHAR(18)        NULL,
  role_type          VARCHAR(1)         NOT NULL DEFAULT 'R' COMMENT 'R = role ปกติ, S = system role (แก้/ลบไม่ได้)',
  role_granted_by_id VARCHAR(18)        NULL COMMENT 'user ที่สร้าง role นี้ (FK เพิ่มทีหลังเพราะอ้างกลับไป tb_users)',
  role_granted_at    DATETIME           DEFAULT CURRENT_TIMESTAMP,
  role_update_at     DATETIME           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 2) ผู้ใช้งาน (staff) ────────────────────────────────────────────────────────
CREATE TABLE tb_users (
  user_id             VARCHAR(18) NOT NULL,
  user_username       VARCHAR(50)        NOT NULL COMMENT 'ชื่อผู้ใช้สำหรับ login (ใช้แทนอีเมลได้) ห้ามมี @ — แอดมินไม่ระบุ = ใช้ user_id',
  user_email          VARCHAR(255)       NULL COMMENT 'NULL ได้ — แอดมินสร้างผู้ใช้โดยไม่ใส่อีเมล แล้วผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก',
  user_password       VARCHAR(255)       NOT NULL COMMENT 'bcrypt hash',
  user_fname          VARCHAR(50)        NOT NULL,
  user_lname          VARCHAR(50)        NOT NULL,
  user_phone          VARCHAR(20)        NULL,
  user_line_uid       VARCHAR(100)       NULL,
  user_whatsapp_no    VARCHAR(20)        NULL,
  user_avatar_url     VARCHAR(255)       NULL,
  user_role_id        VARCHAR(18)                NULL,
  user_status         ENUM('active','inactive') NOT NULL DEFAULT 'active',
  user_must_change_password BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'บังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก (สำหรับรหัสผ่านชั่วคราวที่ระบบ gen ให้)',
  user_last_login_at  DATETIME           NULL,
  user_created_at     DATETIME           DEFAULT CURRENT_TIMESTAMP,
  user_updated_at     DATETIME           DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_user_username (user_username),
  UNIQUE KEY uq_user_email (user_email),
  KEY idx_user_role (user_role_id),
  CONSTRAINT fk_user_role FOREIGN KEY (user_role_id) REFERENCES tb_roles(role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 3) ผูก FK ย้อนกลับของ tb_roles ที่รอ tb_users ถูกสร้างก่อน ───────────────────
ALTER TABLE tb_roles
  ADD CONSTRAINT fk_role_granted_by FOREIGN KEY (role_granted_by_id) REFERENCES tb_users(user_id);

-- ─── 4) bookkeeping — id ล่าสุดที่เคยออกต่อตาราง (อ้างอิง/debug เฉยๆ ไม่ได้ใช้คำนวณ id ถัดไป) ──
CREATE TABLE tb_maxID (
  max_table VARCHAR(50) NOT NULL,
  max_id    VARCHAR(18) NOT NULL,
  PRIMARY KEY (max_table)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 5) แผนก (department) ──────────────────────────────────────────────────────
CREATE TABLE tb_department (
  dep_id            VARCHAR(18) NOT NULL,
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
CREATE TABLE tb_login_logs (
  log_id         VARCHAR(18) NOT NULL,
  log_user_id    VARCHAR(18)  NULL,
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

-- ─── 7) รหัส OTP ทางอีเมล (ยกกติกามาจากระบบ fasttiw) ─────────────────────────────
-- ใช้ยืนยันอีเมลตอนเข้าระบบครั้งแรก (otp_purpose = 'verify_email') ดู backend/src/utils/emailOtp.js
-- เก็บแฮช SHA-256 ของรหัส ไม่เก็บตัวเลขตรงๆ · เกราะจริงคืออายุ 10 นาที + กรอกผิดได้ 5 ครั้ง + ใช้ได้ครั้งเดียว
CREATE TABLE tb_email_otps (
  otp_id         VARCHAR(18)  NOT NULL,
  otp_email      VARCHAR(255) NOT NULL,
  otp_purpose    VARCHAR(30)  NOT NULL,
  otp_user_id    VARCHAR(18)  NULL COMMENT 'ผู้ใช้ที่ขอรหัส — รหัสใช้ได้เฉพาะคนที่ขอ',
  otp_code_hash  CHAR(64)     NOT NULL,
  otp_attempts   TINYINT      NOT NULL DEFAULT 0,
  otp_expires_at DATETIME     NOT NULL,
  otp_used_at    DATETIME     NULL,
  otp_created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (otp_id),
  KEY idx_otp_lookup (otp_email, otp_purpose, otp_created_at),
  KEY idx_otp_expires (otp_expires_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (otp_user_id) REFERENCES tb_users(user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ─── 8) ประวัติการใช้งานระบบ (audit log) — 2026-10-08 ────────────────────────────────────
-- ใคร ทำอะไร กับข้อมูลไหน เมื่อไหร่ จากที่ไหน ผลเป็นอย่างไร + ค่าก่อน/หลังรายฟิลด์ (ดู backend/src/middlewares/auditLog.middleware.js)
-- ไม่มี endpoint แก้/ลบ — ลบได้ทางเดียวคือหมดระยะเก็บ (utils/logRetention.js, ค่าเริ่มต้น 2 ปี)
-- id เป็น BIGINT AUTO_INCREMENT (ต่างจากตารางอื่นโดยตั้งใจ): ปริมาณสูงมาก ไม่ควรล็อก tb_maxID ทุกครั้งที่บันทึก และลำดับ id = ลำดับเวลา
-- ชื่อ/ชื่อผู้ใช้/role ของผู้กระทำเก็บเป็น snapshot ณ ตอนนั้น — ต้องอ่านได้แม้ผู้ใช้ถูกลบ/เปลี่ยนชื่อ/เปลี่ยน role ภายหลัง
CREATE TABLE tb_audit_logs (
  aud_id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  aud_request_id    VARCHAR(36)  NULL COMMENT 'ตรงกับ header X-Request-Id และ tb_error_logs',
  aud_user_id       VARCHAR(18)  NULL,
  aud_user_username VARCHAR(50)  NULL,
  aud_user_fullname VARCHAR(101) NULL,
  aud_role_name     VARCHAR(50)  NULL,
  aud_event         VARCHAR(20)  NOT NULL COMMENT 'create / update / delete / action / view / denied / error',
  aud_action        VARCHAR(100) NOT NULL,
  aud_method        VARCHAR(10)  NOT NULL,
  aud_path          VARCHAR(255) NOT NULL,
  aud_entity_type   VARCHAR(40)  NULL,
  aud_entity_id     VARCHAR(64)  NULL,
  aud_project_id    VARCHAR(18)  NULL,
  aud_status        SMALLINT     NOT NULL,
  aud_success       TINYINT(1)   NOT NULL,
  aud_changes       JSON         NULL COMMENT 'ค่าก่อน/หลังรายฟิลด์ {field: {from, to}} — ความลับถูกปิดบัง',
  aud_payload       JSON         NULL COMMENT 'ข้อมูลที่ส่งมา (ปิดบังรหัสผ่าน/token/OTP)',
  aud_error         VARCHAR(500) NULL,
  aud_ip            VARCHAR(45)  NULL,
  aud_user_agent    VARCHAR(255) NULL,
  aud_duration_ms   INT          NULL,
  aud_created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (aud_id),
  KEY idx_aud_created (aud_created_at),
  KEY idx_aud_user_created (aud_user_id, aud_created_at),
  KEY idx_aud_entity (aud_entity_type, aud_entity_id),
  KEY idx_aud_project_created (aud_project_id, aud_created_at),
  KEY idx_aud_event_created (aud_event, aud_created_at),
  KEY idx_aud_request (aud_request_id),
  CONSTRAINT fk_aud_user FOREIGN KEY (aud_user_id) REFERENCES tb_users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── 9) ข้อผิดพลาดของระบบ (error 5xx) — 2026-10-08 ─────────────────────────────────────────
-- จัดกลุ่มด้วย fingerprint (ข้อความ + จุดที่เกิดในโค้ด) — error เดิมเกิดร้อยครั้งเป็นแถวเดียวพร้อมตัวนับ
CREATE TABLE tb_error_logs (
  err_id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  err_fingerprint     CHAR(40)     NOT NULL,
  err_message         VARCHAR(500) NOT NULL,
  err_stack           TEXT         NULL,
  err_status          SMALLINT     NOT NULL,
  err_method          VARCHAR(10)  NULL,
  err_path            VARCHAR(255) NULL,
  err_count           INT UNSIGNED NOT NULL DEFAULT 1,
  err_first_seen      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  err_last_seen       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  err_last_request_id VARCHAR(36)  NULL,
  err_last_user_id    VARCHAR(18)  NULL,
  err_last_ip         VARCHAR(45)  NULL,
  PRIMARY KEY (err_id),
  UNIQUE KEY uq_err_fingerprint (err_fingerprint),
  KEY idx_err_last_seen (err_last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

commit;

-- ─── ข้อมูลเริ่มต้น ───────────────────────────────────────────────────────────
-- role admin: เปิดสิทธิ์ทุกบิต (27 บิต ตาม TOTAL_BITS ปัจจุบันใน frontend/app/components/bit.tsx) — ปรับความยาวถ้า bit.tsx เพิ่มบิต
-- id ใส่ตรงๆ เพราะ seed ครั้งเดียวตอนตั้งระบบ ไม่ได้ผ่าน generateDailyId()
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
VALUES ('ROL202601010000001', 'Admin', '111111111111111111111111111', 'S');

-- user แรกของระบบ ผูกกับ role Admin — ต้องมีอย่างน้อยคนเดียวถึงจะ login ผ่าน Postman ได้
-- (createUser endpoint ต้องมี token ก่อน แต่จะ login ได้ต้องมี user อยู่แล้ว เลย seed ตรงนี้ครั้งเดียว)
-- login: admin หรือ admin@softwork.local / password: Admin@12345 — user_must_change_password = FALSE เพราะเป็น bootstrap account
INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
VALUES (
  'USE202601010000001',
  'admin',
  'admin@softwork.local',
  '$2a$10$UnrGKjjYX4uf1ojXLAPNOOdAT26aZg/eVmTDGvv2wWF95gYoQ5G0K',
  'System',
  'Admin',
  'ROL202601010000001',
  FALSE
);

commit;
