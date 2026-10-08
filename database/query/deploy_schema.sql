-- ════════════════════════════════════════════════════════════════════════════════
-- deploy_schema.sql — โครงสร้างฐานข้อมูลฉบับเต็ม รันซ้ำกี่ครั้งก็ได้ (idempotent)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- วิธีใช้: รันไฟล์นี้ทั้งไฟล์บนฐานข้อมูลเป้าหมาย "ทุกครั้งที่ deploy" (phpMyAdmin > แท็บ SQL หรือ mysql CLI)
--   - ฐานข้อมูลว่าง        → สร้างทุกตาราง + ข้อมูลเริ่มต้นให้ครบ
--   - ฐานข้อมูลที่มีอยู่แล้ว → เติมเฉพาะตาราง/คอลัมน์/index/foreign key ที่ยังขาด ไม่แตะข้อมูลเดิม
--   - รันซ้ำ               → ไม่มีอะไรเปลี่ยน
-- หลังรันเสร็จ ดูผลลัพธ์ของ query ตรวจสอบท้ายไฟล์ (ส่วนที่ 6): ไม่มีแถวผลลัพธ์ = โครงสร้างครบถ้วน
--
-- ใช้ได้ทั้ง MySQL 8 และ MariaDB 10.x ไม่ต้องมีสิทธิ์สร้าง stored procedure
-- (แต่ละขั้นที่มีเงื่อนไขใช้ prepared statement: เช็ค information_schema ก่อน ถ้ามีอยู่แล้วจะรัน 'DO 0' ซึ่งไม่ทำอะไร)
--
-- ── กติกาเวลาแก้โครงสร้างฐานข้อมูล (ต้องแก้ไฟล์นี้ทุกครั้ง) ──────────────────────────────────
-- ไฟล์นี้คือแหล่งอ้างอิงหลักของโครงสร้าง DB ห้ามแก้ DB ตรงๆ โดยไม่แก้ไฟล์นี้
--   เพิ่มตาราง      → ส่วนที่ 1 (CREATE TABLE IF NOT EXISTS) + บรรทัดใน ส่วนที่ 6
--   เพิ่มคอลัมน์     → แก้ CREATE TABLE ในส่วนที่ 1 + เพิ่มบรรทัด ADD COLUMN แบบมีเงื่อนไขในส่วนที่ 2 + แก้ส่วนที่ 6
--   เพิ่ม index      → แก้ CREATE TABLE ในส่วนที่ 1 + เพิ่มบรรทัดในส่วนที่ 3
--   เพิ่ม FK         → แก้ CREATE TABLE ในส่วนที่ 1 + เพิ่มบรรทัดในส่วนที่ 4
--   เปลี่ยนชนิด/NULL ของคอลัมน์ → แก้ส่วนที่ 1 + เพิ่ม MODIFY แบบมีเงื่อนไขท้ายส่วนที่ 2 (เช็คค่าปัจจุบันก่อนเสมอ)
--   ลบ/เปลี่ยนชื่อ  → เขียนแบบมีเงื่อนไข (เช็คว่ายังมีอยู่ก่อน) ท้ายส่วนที่ 2 พร้อมวันที่และเหตุผล
--   ห้ามใช้ ALTER/DROP/INSERT ที่ไม่มีเงื่อนไข เพราะไฟล์นี้ต้องรันซ้ำได้เสมอ
-- (database/query/create_*.sql เป็นฉบับเดิมไว้อ่านอ้างอิง ให้แก้ตามไปด้วยเพื่อไม่ให้ขัดกัน)
-- ════════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ─── ส่วนที่ 1: สร้างตารางที่ยังไม่มี (เรียงตามลำดับ foreign key) ────────────────────────────
-- รูปแบบ id ทุกตาราง: PREFIX 3 ตัว + yyyymmdd + เลขรัน 7 หลัก = 18 ตัว (ดู backend/src/utils/generateDailyId.js)
-- role_permission / position_permission เป็น bitmask string ลำดับบิตต้องตรงกับ
--   backend/src/utils/permissions.js + frontend/app/components/bit.tsx (role, 27 บิต, append-only)
--   backend/src/utils/projectPermissions.js + frontend/app/components/project-position-bits.ts (position, 29 บิต)

CREATE TABLE IF NOT EXISTS `tb_department` (
  `dep_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dep_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dep_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `dep_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `dep_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dep_id`),
  UNIQUE KEY `uq_dep_name` (`dep_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_roles` (
  `role_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_permission` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `role_department` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role_type` varchar(1) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'R' COMMENT 'R = role ปกติ, S = system role (แก้/ลบไม่ได้)',
  `role_granted_by_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'user ที่สร้าง role นี้ (FK เพิ่มทีหลังเพราะอ้างกลับไป tb_users)',
  `role_granted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `role_update_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uq_role_name` (`role_name`),
  KEY `fk_role_granted_by` (`role_granted_by_id`),
  KEY `fk_role_department` (`role_department`),
  CONSTRAINT `fk_role_department` FOREIGN KEY (`role_department`) REFERENCES `tb_department` (`dep_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_users` (
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อผู้ใช้สำหรับ login (ใช้แทนอีเมลได้) ห้ามมี @ — แอดมินไม่ระบุ = ใช้ user_id',
  `user_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'NULL ได้ — แอดมินสร้างผู้ใช้โดยไม่ใส่อีเมล แล้วผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก',
  `user_password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'bcrypt hash',
  `user_fname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_lname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_line_uid` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_whatsapp_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_avatar_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `user_must_change_password` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'บังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก (สำหรับรหัสผ่านชั่วคราวที่ระบบ gen ให้)',
  `user_last_login_at` datetime DEFAULT NULL,
  `user_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `user_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_username` (`user_username`),
  UNIQUE KEY `uq_user_email` (`user_email`),
  KEY `idx_user_role` (`user_role_id`),
  CONSTRAINT `fk_user_role` FOREIGN KEY (`user_role_id`) REFERENCES `tb_roles` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_maxID` (
  `max_table` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `max_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`max_table`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_login_logs` (
  `log_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_action` enum('login','logout','login_failed') COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_log_user` (`log_user_id`),
  KEY `idx_log_created` (`log_created_at`),
  CONSTRAINT `fk_log_user` FOREIGN KEY (`log_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รหัส OTP ทางอีเมล (ยกกติกามาจากระบบ fasttiw) — ใช้ยืนยันอีเมลตอนเข้าระบบครั้งแรก (otp_purpose = 'verify_email')
-- เก็บแฮช SHA-256 ของรหัส ไม่เก็บตัวเลขตรงๆ · เกราะจริงคืออายุ 10 นาที + กรอกผิดได้ 5 ครั้ง + ใช้ได้ครั้งเดียว
CREATE TABLE IF NOT EXISTS `tb_email_otps` (
  `otp_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_purpose` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้ใช้ที่ขอรหัส — รหัสใช้ได้เฉพาะคนที่ขอ',
  `otp_code_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `otp_attempts` tinyint NOT NULL DEFAULT '0',
  `otp_expires_at` datetime NOT NULL,
  `otp_used_at` datetime DEFAULT NULL,
  `otp_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`otp_id`),
  KEY `idx_otp_lookup` (`otp_email`,`otp_purpose`,`otp_created_at`),
  KEY `idx_otp_expires` (`otp_expires_at`),
  KEY `fk_otp_user` (`otp_user_id`),
  CONSTRAINT `fk_otp_user` FOREIGN KEY (`otp_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการใช้งานระบบ (audit log) + ข้อผิดพลาดของระบบ — 2026-10-08 (ดู backend/src/middlewares/auditLog.middleware.js)
-- id เป็น BIGINT AUTO_INCREMENT โดยตั้งใจ: ปริมาณสูง ไม่ควรล็อก tb_maxID ทุกครั้งที่บันทึก และลำดับ id = ลำดับเวลา
CREATE TABLE IF NOT EXISTS `tb_audit_logs` (
  `aud_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `aud_request_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตรงกับ header X-Request-Id และ tb_error_logs',
  `aud_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_user_username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_user_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_role_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_event` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'create / update / delete / action / view / denied / error',
  `aud_action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aud_method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aud_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `aud_entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_status` smallint NOT NULL,
  `aud_success` tinyint(1) NOT NULL,
  `aud_changes` json DEFAULT NULL COMMENT 'ค่าก่อน/หลังรายฟิลด์ {field: {from, to}} — ความลับถูกปิดบัง',
  `aud_payload` json DEFAULT NULL COMMENT 'ข้อมูลที่ส่งมา (ปิดบังรหัสผ่าน/token/OTP)',
  `aud_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `aud_duration_ms` int DEFAULT NULL,
  `aud_created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`aud_id`),
  KEY `idx_aud_created` (`aud_created_at`),
  KEY `idx_aud_user_created` (`aud_user_id`,`aud_created_at`),
  KEY `idx_aud_entity` (`aud_entity_type`,`aud_entity_id`),
  KEY `idx_aud_project_created` (`aud_project_id`,`aud_created_at`),
  KEY `idx_aud_event_created` (`aud_event`,`aud_created_at`),
  KEY `idx_aud_request` (`aud_request_id`),
  CONSTRAINT `fk_aud_user` FOREIGN KEY (`aud_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_error_logs` (
  `err_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `err_fingerprint` char(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `err_message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `err_stack` text COLLATE utf8mb4_unicode_ci,
  `err_status` smallint NOT NULL,
  `err_method` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `err_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `err_count` int unsigned NOT NULL DEFAULT '1',
  `err_first_seen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `err_last_seen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `err_last_request_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `err_last_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `err_last_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`err_id`),
  UNIQUE KEY `uq_err_fingerprint` (`err_fingerprint`),
  KEY `idx_err_last_seen` (`err_last_seen`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_positions` (
  `position_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position_permission` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `position_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `position_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `position_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`position_id`),
  UNIQUE KEY `uq_position_name` (`position_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_clients` (
  `client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_company` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `client_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_projects` (
  `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `client_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_description` text COLLATE utf8mb4_unicode_ci,
  `project_status` enum('planning','in_progress','on_hold','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'planning',
  `project_type` enum('waterfall','agile') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'waterfall' COMMENT 'waterfall = มอบหมายงานโดยคนมีสิทธิ์เท่านั้น (แบบเดิม), agile = เพิ่มเติมจาก waterfall คือ task/subtask ที่ยังไม่มีคนรับผิดชอบ สมาชิกกดรับเองได้ (ดู tb_task_assignees, รับได้คนแรกคนเดียว)',
  `project_start_date` date DEFAULT NULL,
  `project_due_date` date DEFAULT NULL,
  `project_completed_at` datetime DEFAULT NULL COMMENT 'ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น completed (เคลียร์เป็น NULL ถ้าเปลี่ยนสถานะออกจาก completed) ใช้คำนวณ KPI อัตราส่งตรงเวลา ไม่ใช้ project_updated_at เพราะแก้ไขข้อมูลอื่นทีหลังจะทำให้เวลาคลาดเคลื่อน',
  `project_progress_percent` decimal(5,2) NOT NULL DEFAULT '0.00',
  `project_share_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_share_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `project_use_task_weight` tinyint(1) NOT NULL DEFAULT '0',
  `project_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `project_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `project_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_id`),
  UNIQUE KEY `uq_project_share_token` (`project_share_token`),
  KEY `idx_project_client` (`client_id`),
  KEY `idx_project_status` (`project_status`),
  KEY `idx_project_type` (`project_type`),
  KEY `idx_project_due_date` (`project_due_date`),
  KEY `fk_project_creator` (`project_created_by`),
  CONSTRAINT `fk_project_client` FOREIGN KEY (`client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_project_creator` FOREIGN KEY (`project_created_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_members` (
  `project_member_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joined_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`project_member_id`),
  UNIQUE KEY `uq_project_member` (`project_id`,`user_id`),
  KEY `idx_pm_user` (`user_id`),
  CONSTRAINT `fk_pm_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pm_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_member_positions` (
  `project_member_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`project_member_id`,`position_id`),
  KEY `fk_pmp_position` (`position_id`),
  CONSTRAINT `fk_pmp_member` FOREIGN KEY (`project_member_id`) REFERENCES `tb_project_members` (`project_member_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pmp_position` FOREIGN KEY (`position_id`) REFERENCES `tb_project_positions` (`position_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_tasks` (
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_parent_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `task_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_description` text COLLATE utf8mb4_unicode_ci,
  `task_status` enum('todo','in_progress','review','done') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'todo',
  `task_start_date` date DEFAULT NULL,
  `task_due_date` date DEFAULT NULL,
  `task_completed_at` datetime DEFAULT NULL,
  `task_weight` int NOT NULL DEFAULT '1',
  `task_sort_order` int NOT NULL DEFAULT '0',
  `task_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `task_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_project` (`project_id`),
  KEY `idx_task_parent` (`task_parent_id`),
  KEY `idx_task_due_date` (`task_due_date`),
  KEY `idx_task_status_completed` (`task_status`,`task_completed_at`),
  CONSTRAINT `fk_task_parent` FOREIGN KEY (`task_parent_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_task_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_assignees` (
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`task_id`,`user_id`),
  KEY `idx_ta_user` (`user_id`),
  CONSTRAINT `fk_ta_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ta_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issues` (
  `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_description` text COLLATE utf8mb4_unicode_ci,
  `issue_status` enum('open','resolved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `issue_resolved_at` datetime DEFAULT NULL COMMENT 'ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น resolved (เคลียร์เป็น NULL ถ้าเปิดใหม่) ใช้คำนวณ KPI เวลาเฉลี่ยแก้ปัญหา ไม่ใช้ issue_updated_at เพราะแก้ไข issue หลัง resolved แล้ว (เช่นแก้ชื่อ) จะทำให้เวลาคลาดเคลื่อน',
  `created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `issue_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`issue_id`),
  KEY `idx_issue_task` (`task_id`),
  KEY `idx_issue_task_status` (`task_id`,`issue_status`),
  KEY `idx_issue_status_resolved` (`issue_status`,`issue_resolved_at`),
  KEY `fk_issue_creator` (`created_by`),
  CONSTRAINT `fk_issue_creator` FOREIGN KEY (`created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_issue_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issue_images` (
  `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `idx_issue_image_issue` (`issue_id`),
  CONSTRAINT `fk_issue_image_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issue_tags` (
  `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tagged_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`issue_id`,`user_id`),
  KEY `idx_issue_tag_user` (`user_id`),
  CONSTRAINT `fk_issue_tag_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_issue_tag_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issue_replies` (
  `reply_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reply_text` text COLLATE utf8mb4_unicode_ci COMMENT 'ว่างได้ถ้าตอบกลับด้วยรูปแนบล้วนๆ ไม่มีข้อความ (เหมือน tb_task_chat_messages)',
  `reply_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`reply_id`),
  KEY `idx_issue_reply_issue` (`issue_id`),
  KEY `idx_issue_reply_created` (`issue_id`,`reply_created_at`),
  KEY `fk_issue_reply_user` (`user_id`),
  CONSTRAINT `fk_issue_reply_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_issue_reply_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issue_reply_images` (
  `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reply_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `idx_issue_reply_image_reply` (`reply_id`),
  CONSTRAINT `fk_issue_reply_image_reply` FOREIGN KEY (`reply_id`) REFERENCES `tb_task_issue_replies` (`reply_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_issue_reply_reads` (
  `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`issue_id`,`user_id`),
  KEY `fk_issue_reply_read_user` (`user_id`),
  CONSTRAINT `fk_issue_reply_read_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_issue_reply_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_chat_messages` (
  `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_text` text COLLATE utf8mb4_unicode_ci,
  `reply_to_message_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`message_id`),
  KEY `idx_chat_task` (`task_id`),
  KEY `idx_chat_task_created` (`task_id`,`message_created_at`),
  KEY `fk_chat_user` (`user_id`),
  KEY `fk_chat_reply_to` (`reply_to_message_id`),
  CONSTRAINT `fk_chat_reply_to` FOREIGN KEY (`reply_to_message_id`) REFERENCES `tb_task_chat_messages` (`message_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_chat_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_chat_images` (
  `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `idx_chat_image_message` (`message_id`),
  CONSTRAINT `fk_chat_image_message` FOREIGN KEY (`message_id`) REFERENCES `tb_task_chat_messages` (`message_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_chat_reads` (
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`task_id`,`user_id`),
  KEY `fk_chat_read_user` (`user_id`),
  CONSTRAINT `fk_chat_read_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_chat_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_chat_messages` (
  `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_text` text COLLATE utf8mb4_unicode_ci,
  `reply_to_message_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `message_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`message_id`),
  KEY `idx_project_chat_project` (`project_id`),
  KEY `idx_project_chat_created` (`project_id`,`message_created_at`),
  KEY `fk_project_chat_user` (`user_id`),
  KEY `fk_project_chat_reply_to` (`reply_to_message_id`),
  CONSTRAINT `fk_project_chat_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_chat_reply_to` FOREIGN KEY (`reply_to_message_id`) REFERENCES `tb_project_chat_messages` (`message_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_project_chat_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_chat_images` (
  `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`image_id`),
  KEY `idx_project_chat_image_message` (`message_id`),
  CONSTRAINT `fk_project_chat_image_message` FOREIGN KEY (`message_id`) REFERENCES `tb_project_chat_messages` (`message_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_project_chat_reads` (
  `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`project_id`,`user_id`),
  KEY `fk_project_chat_read_user` (`user_id`),
  CONSTRAINT `fk_project_chat_read_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_project_chat_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_task_activity_log` (
  `log_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_action` enum('created','status_changed','edited','assigned','comment') COLLATE utf8mb4_unicode_ci NOT NULL,
  `log_old_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_new_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `log_message` text COLLATE utf8mb4_unicode_ci,
  `log_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`log_id`),
  KEY `idx_tal_task` (`task_id`),
  KEY `idx_tal_created` (`log_created_at`),
  KEY `idx_tal_status_start` (`log_action`,`log_new_value`,`task_id`,`log_created_at`),
  KEY `fk_tal_user` (`user_id`),
  CONSTRAINT `fk_tal_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tal_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─── ส่วนที่ 2: เติมคอลัมน์ที่ยังขาด (สำหรับฐานข้อมูลที่สร้างจากโครงสร้างเวอร์ชันเก่า) ──────────────
-- แต่ละบรรทัด: ถ้าคอลัมน์ยังไม่มี → ADD COLUMN, มีแล้ว → ไม่ทำอะไร

-- tb_department
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_id') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_name') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `dep_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_status') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_status` enum(''active'',''inactive'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `dep_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_created_at') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `dep_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_updated_at') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `dep_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_roles
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_id') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_name') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_permission') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_permission` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '''' AFTER `role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_department') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_department` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `role_permission`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_type') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_type` varchar(1) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''R'' COMMENT ''R = role ปกติ, S = system role (แก้/ลบไม่ได้)'' AFTER `role_department`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_granted_by_id') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_granted_by_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''user ที่สร้าง role นี้ (FK เพิ่มทีหลังเพราะอ้างกลับไป tb_users)'' AFTER `role_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_granted_at') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_granted_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `role_granted_by_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_update_at') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_update_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `role_granted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_users
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- user_username เพิ่มเป็น NULL ก่อน แล้วเติมค่าให้แถวเดิม ค่อยเปลี่ยนเป็น NOT NULL ท้ายส่วนนี้ (แถวเดิมจะได้ไม่ชนกันที่ค่าว่างตอนสร้าง unique key)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_username') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_email') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''NULL ได้ — แอดมินสร้างผู้ใช้โดยไม่ใส่อีเมล แล้วผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก'' AFTER `user_username`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_password') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''bcrypt hash'' AFTER `user_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_fname') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_fname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `user_password`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_lname') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_lname` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `user_fname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_phone') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_lname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_line_uid') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_line_uid` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_phone`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_whatsapp_no') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_whatsapp_no` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_line_uid`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_avatar_url') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_avatar_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_whatsapp_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_role_id') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_avatar_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_status') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_status` enum(''active'',''inactive'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `user_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_must_change_password') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_must_change_password` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''บังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก (สำหรับรหัสผ่านชั่วคราวที่ระบบ gen ให้)'' AFTER `user_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_last_login_at') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_last_login_at` datetime DEFAULT NULL AFTER `user_must_change_password`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_created_at') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `user_last_login_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_updated_at') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `user_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_maxID
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_maxID' AND COLUMN_NAME = 'max_table') = 0, 'ALTER TABLE `tb_maxID` ADD COLUMN `max_table` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_maxID' AND COLUMN_NAME = 'max_id') = 0, 'ALTER TABLE `tb_maxID` ADD COLUMN `max_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `max_table`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_login_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_id') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_user_id') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_email') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `log_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_fullname') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_action') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_action` enum(''login'',''logout'',''login_failed'') COLLATE utf8mb4_unicode_ci NOT NULL AFTER `log_fullname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_ip_address') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_user_agent') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_ip_address`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND COLUMN_NAME = 'log_created_at') = 0, 'ALTER TABLE `tb_login_logs` ADD COLUMN `log_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `log_user_agent`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;


-- tb_email_otps
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_id') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_email') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `otp_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_purpose') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_purpose` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `otp_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_user_id') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้ใช้ที่ขอรหัส — รหัสใช้ได้เฉพาะคนที่ขอ'' AFTER `otp_purpose`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_code_hash') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_code_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `otp_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_attempts') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_attempts` tinyint NOT NULL DEFAULT ''0'' AFTER `otp_code_hash`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_expires_at') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_expires_at` datetime NOT NULL AFTER `otp_attempts`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_used_at') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_used_at` datetime DEFAULT NULL AFTER `otp_expires_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND COLUMN_NAME = 'otp_created_at') = 0, 'ALTER TABLE `tb_email_otps` ADD COLUMN `otp_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `otp_used_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_audit_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_request_id') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_request_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ตรงกับ header X-Request-Id และ tb_error_logs'' AFTER `aud_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_user_id') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_request_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_user_username') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_user_username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_user_fullname') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_user_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_user_username`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_role_name') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_role_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_user_fullname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_event') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_event` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''create / update / delete / action / view / denied / error'' AFTER `aud_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_action') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `aud_event`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_method') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_method` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `aud_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_path') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `aud_method`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_entity_type') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_entity_type` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_path`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_entity_id') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_entity_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_entity_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_project_id') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_entity_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_status') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_status` smallint NOT NULL AFTER `aud_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_success') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_success` tinyint(1) NOT NULL AFTER `aud_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_changes') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_changes` json DEFAULT NULL COMMENT ''ค่าก่อน/หลังรายฟิลด์ {field: {from, to}} — ความลับถูกปิดบัง'' AFTER `aud_success`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_payload') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_payload` json DEFAULT NULL COMMENT ''ข้อมูลที่ส่งมา (ปิดบังรหัสผ่าน/token/OTP)'' AFTER `aud_changes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_error') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_error` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_payload`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_ip') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_error`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_user_agent') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_user_agent` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `aud_ip`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_duration_ms') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_duration_ms` int DEFAULT NULL AFTER `aud_user_agent`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND COLUMN_NAME = 'aud_created_at') = 0, 'ALTER TABLE `tb_audit_logs` ADD COLUMN `aud_created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `aud_duration_ms`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_error_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_fingerprint') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_fingerprint` char(40) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `err_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_message') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_message` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `err_fingerprint`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_stack') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_stack` text COLLATE utf8mb4_unicode_ci AFTER `err_message`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_status') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_status` smallint NOT NULL AFTER `err_stack`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_method') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_method` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `err_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_path') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `err_method`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_count') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_count` int unsigned NOT NULL DEFAULT ''1'' AFTER `err_path`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_first_seen') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_first_seen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `err_count`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_last_seen') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_last_seen` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `err_first_seen`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_last_request_id') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_last_request_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `err_last_seen`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_last_user_id') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_last_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `err_last_request_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND COLUMN_NAME = 'err_last_ip') = 0, 'ALTER TABLE `tb_error_logs` ADD COLUMN `err_last_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `err_last_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_positions
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_id') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_name') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `position_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_permission') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_permission` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '''' AFTER `position_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_status') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_status` enum(''active'',''inactive'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `position_permission`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_created_at') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `position_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND COLUMN_NAME = 'position_updated_at') = 0, 'ALTER TABLE `tb_project_positions` ADD COLUMN `position_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `position_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_clients
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_id') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_name') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_company') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_company` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_email') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_company`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_phone') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_created_at') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `client_phone`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_updated_at') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `client_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_projects
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_id') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'client_id') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `client_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_name') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_description') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_description` text COLLATE utf8mb4_unicode_ci AFTER `project_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_status') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_status` enum(''planning'',''in_progress'',''on_hold'',''completed'',''cancelled'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''planning'' AFTER `project_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_type') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_type` enum(''waterfall'',''agile'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''waterfall'' COMMENT ''waterfall = มอบหมายงานโดยคนมีสิทธิ์เท่านั้น (แบบเดิม), agile = เพิ่มเติมจาก waterfall คือ task/subtask ที่ยังไม่มีคนรับผิดชอบ สมาชิกกดรับเองได้ (ดู tb_task_assignees, รับได้คนแรกคนเดียว)'' AFTER `project_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_start_date') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_start_date` date DEFAULT NULL AFTER `project_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_due_date') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_due_date` date DEFAULT NULL AFTER `project_start_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_completed_at') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_completed_at` datetime DEFAULT NULL COMMENT ''ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น completed (เคลียร์เป็น NULL ถ้าเปลี่ยนสถานะออกจาก completed) ใช้คำนวณ KPI อัตราส่งตรงเวลา ไม่ใช้ project_updated_at เพราะแก้ไขข้อมูลอื่นทีหลังจะทำให้เวลาคลาดเคลื่อน'' AFTER `project_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_progress_percent') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_progress_percent` decimal(5,2) NOT NULL DEFAULT ''0.00'' AFTER `project_completed_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_share_token') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_share_token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `project_progress_percent`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_share_enabled') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_share_enabled` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `project_share_token`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_use_task_weight') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_use_task_weight` tinyint(1) NOT NULL DEFAULT ''0'' AFTER `project_share_enabled`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_created_by') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `project_use_task_weight`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_created_at') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `project_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_updated_at') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `project_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_members
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND COLUMN_NAME = 'project_member_id') = 0, 'ALTER TABLE `tb_project_members` ADD COLUMN `project_member_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND COLUMN_NAME = 'project_id') = 0, 'ALTER TABLE `tb_project_members` ADD COLUMN `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `project_member_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_project_members` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND COLUMN_NAME = 'joined_at') = 0, 'ALTER TABLE `tb_project_members` ADD COLUMN `joined_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_member_positions
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_member_positions' AND COLUMN_NAME = 'project_member_id') = 0, 'ALTER TABLE `tb_project_member_positions` ADD COLUMN `project_member_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_member_positions' AND COLUMN_NAME = 'position_id') = 0, 'ALTER TABLE `tb_project_member_positions` ADD COLUMN `position_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `project_member_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_tasks
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'project_id') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_parent_id') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_parent_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_title') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `task_parent_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_description') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_description` text COLLATE utf8mb4_unicode_ci AFTER `task_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_status') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_status` enum(''todo'',''in_progress'',''review'',''done'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''todo'' AFTER `task_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_start_date') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_start_date` date DEFAULT NULL AFTER `task_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_due_date') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_due_date` date DEFAULT NULL AFTER `task_start_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_completed_at') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_completed_at` datetime DEFAULT NULL AFTER `task_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_weight') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_weight` int NOT NULL DEFAULT ''1'' AFTER `task_completed_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_sort_order') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_sort_order` int NOT NULL DEFAULT ''0'' AFTER `task_weight`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_created_at') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `task_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_updated_at') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `task_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_assignees
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_task_assignees` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_assignees` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issues
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_id') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `issue_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_title') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_description') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_description` text COLLATE utf8mb4_unicode_ci AFTER `issue_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_status') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_status` enum(''open'',''resolved'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''open'' AFTER `issue_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_resolved_at') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_resolved_at` datetime DEFAULT NULL COMMENT ''ตั้งครั้งเดียวตอนเปลี่ยนสถานะเป็น resolved (เคลียร์เป็น NULL ถ้าเปิดใหม่) ใช้คำนวณ KPI เวลาเฉลี่ยแก้ปัญหา ไม่ใช้ issue_updated_at เพราะแก้ไข issue หลัง resolved แล้ว (เช่นแก้ชื่อ) จะทำให้เวลาคลาดเคลื่อน'' AFTER `issue_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'created_by') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `issue_resolved_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_created_at') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND COLUMN_NAME = 'issue_updated_at') = 0, 'ALTER TABLE `tb_task_issues` ADD COLUMN `issue_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `issue_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issue_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND COLUMN_NAME = 'image_id') = 0, 'ALTER TABLE `tb_task_issue_images` ADD COLUMN `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND COLUMN_NAME = 'issue_id') = 0, 'ALTER TABLE `tb_task_issue_images` ADD COLUMN `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `image_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND COLUMN_NAME = 'image_url') = 0, 'ALTER TABLE `tb_task_issue_images` ADD COLUMN `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `issue_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND COLUMN_NAME = 'image_created_at') = 0, 'ALTER TABLE `tb_task_issue_images` ADD COLUMN `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `image_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issue_tags
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND COLUMN_NAME = 'issue_id') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD COLUMN `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `issue_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND COLUMN_NAME = 'tagged_at') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD COLUMN `tagged_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issue_replies
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'reply_id') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD COLUMN `reply_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'issue_id') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD COLUMN `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `reply_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `issue_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'reply_text') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD COLUMN `reply_text` text COLLATE utf8mb4_unicode_ci COMMENT ''ว่างได้ถ้าตอบกลับด้วยรูปแนบล้วนๆ ไม่มีข้อความ (เหมือน tb_task_chat_messages)'' AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'reply_created_at') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD COLUMN `reply_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) AFTER `reply_text`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issue_reply_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND COLUMN_NAME = 'image_id') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD COLUMN `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND COLUMN_NAME = 'reply_id') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD COLUMN `reply_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `image_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND COLUMN_NAME = 'image_url') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD COLUMN `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `reply_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND COLUMN_NAME = 'image_created_at') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD COLUMN `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `image_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_issue_reply_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND COLUMN_NAME = 'issue_id') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD COLUMN `issue_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `issue_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND COLUMN_NAME = 'last_read_at') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD COLUMN `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_chat_messages
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'message_id') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'message_text') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `message_text` text COLLATE utf8mb4_unicode_ci AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'reply_to_message_id') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `reply_to_message_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `message_text`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'message_created_at') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD COLUMN `message_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) AFTER `reply_to_message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_chat_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND COLUMN_NAME = 'image_id') = 0, 'ALTER TABLE `tb_task_chat_images` ADD COLUMN `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND COLUMN_NAME = 'message_id') = 0, 'ALTER TABLE `tb_task_chat_images` ADD COLUMN `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `image_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND COLUMN_NAME = 'image_url') = 0, 'ALTER TABLE `tb_task_chat_images` ADD COLUMN `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND COLUMN_NAME = 'image_created_at') = 0, 'ALTER TABLE `tb_task_chat_images` ADD COLUMN `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `image_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND COLUMN_NAME = 'last_read_at') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD COLUMN `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_chat_messages
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'message_id') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'project_id') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'message_text') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `message_text` text COLLATE utf8mb4_unicode_ci AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'reply_to_message_id') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `reply_to_message_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `message_text`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'message_created_at') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD COLUMN `message_created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) AFTER `reply_to_message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_chat_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND COLUMN_NAME = 'image_id') = 0, 'ALTER TABLE `tb_project_chat_images` ADD COLUMN `image_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND COLUMN_NAME = 'message_id') = 0, 'ALTER TABLE `tb_project_chat_images` ADD COLUMN `message_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `image_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND COLUMN_NAME = 'image_url') = 0, 'ALTER TABLE `tb_project_chat_images` ADD COLUMN `image_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `message_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND COLUMN_NAME = 'image_created_at') = 0, 'ALTER TABLE `tb_project_chat_images` ADD COLUMN `image_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `image_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND COLUMN_NAME = 'project_id') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD COLUMN `project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND COLUMN_NAME = 'last_read_at') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD COLUMN `last_read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_activity_log
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_id') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'task_id') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `log_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'user_id') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_fullname') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_fullname` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_action') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_action` enum(''created'',''status_changed'',''edited'',''assigned'',''comment'') COLLATE utf8mb4_unicode_ci NOT NULL AFTER `log_fullname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_old_value') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_old_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_new_value') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_new_value` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `log_old_value`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_message') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_message` text COLLATE utf8mb4_unicode_ci AFTER `log_new_value`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND COLUMN_NAME = 'log_created_at') = 0, 'ALTER TABLE `tb_task_activity_log` ADD COLUMN `log_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `log_message`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ── การเปลี่ยนชนิด/เงื่อนไขของคอลัมน์ที่มีอยู่แล้ว (เรียงตามเวลา) ──────────────────────────────────
-- 2026-10-07 onboarding: ผู้ใช้เดิมได้ชื่อผู้ใช้ = user_id (ยัง login ด้วยอีเมลได้เหมือนเดิม) — UPDATE นี้รันซ้ำได้ แตะเฉพาะแถวที่ยังว่าง
UPDATE tb_users SET user_username = user_id WHERE user_username IS NULL OR user_username = '';
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_username' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_users` MODIFY COLUMN `user_username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ชื่อผู้ใช้สำหรับ login (ใช้แทนอีเมลได้) ห้ามมี @ — แอดมินไม่ระบุ = ใช้ user_id''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-07 onboarding: อีเมลไม่บังคับแล้ว (เดิม NOT NULL)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_email' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_users` MODIFY COLUMN `user_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''NULL ได้ — แอดมินสร้างผู้ใช้โดยไม่ใส่อีเมล แล้วผู้ใช้ยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งแรก''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ข้อความแชท/ตอบกลับต้องเป็น NULL ได้ (ส่งรูปล้วนๆ ไม่มีข้อความ) — ฐานข้อมูลรุ่นแรกอาจเป็น NOT NULL
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'message_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_task_chat_messages` MODIFY COLUMN `message_text` text COLLATE utf8mb4_unicode_ci', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'message_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_project_chat_messages` MODIFY COLUMN `message_text` text COLLATE utf8mb4_unicode_ci', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'reply_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_task_issue_replies` MODIFY COLUMN `reply_text` text COLLATE utf8mb4_unicode_ci COMMENT ''ว่างได้ถ้าตอบกลับด้วยรูปแนบล้วนๆ ไม่มีข้อความ (เหมือน tb_task_chat_messages)''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── ส่วนที่ 3: เติม index ที่ยังขาด ──────────────────────────────────────────────────────────
-- index ทั่วไป: ถ้ามีชื่อนี้อยู่แต่คอลัมน์ไม่ตรง (เช่น index ของเวอร์ชันเก่า) → ลบแล้วสร้างใหม่ให้ถูก
-- index ที่ชื่อขึ้นต้นด้วย fk_ (MySQL สร้างให้ foreign key) เช็คแค่ว่ามีหรือไม่ เพราะลบขณะ FK ใช้อยู่ไม่ได้
-- tb_department
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'uq_dep_name') <> 'dep_name', 'ALTER TABLE `tb_department` DROP INDEX `uq_dep_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'uq_dep_name') = 0, 'ALTER TABLE `tb_department` ADD UNIQUE KEY `uq_dep_name` (`dep_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_roles
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND INDEX_NAME = 'uq_role_name') <> 'role_name', 'ALTER TABLE `tb_roles` DROP INDEX `uq_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND INDEX_NAME = 'uq_role_name') = 0, 'ALTER TABLE `tb_roles` ADD UNIQUE KEY `uq_role_name` (`role_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND INDEX_NAME = 'fk_role_granted_by') = 0, 'ALTER TABLE `tb_roles` ADD KEY `fk_role_granted_by` (`role_granted_by_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND INDEX_NAME = 'fk_role_department') = 0, 'ALTER TABLE `tb_roles` ADD KEY `fk_role_department` (`role_department`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_users
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'uq_user_email') <> 'user_email', 'ALTER TABLE `tb_users` DROP INDEX `uq_user_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'uq_user_email') = 0, 'ALTER TABLE `tb_users` ADD UNIQUE KEY `uq_user_email` (`user_email`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'uq_user_username') <> 'user_username', 'ALTER TABLE `tb_users` DROP INDEX `uq_user_username`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'uq_user_username') = 0, 'ALTER TABLE `tb_users` ADD UNIQUE KEY `uq_user_username` (`user_username`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'idx_user_role') <> 'user_role_id', 'ALTER TABLE `tb_users` DROP INDEX `idx_user_role`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'idx_user_role') = 0, 'ALTER TABLE `tb_users` ADD KEY `idx_user_role` (`user_role_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_login_logs
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND INDEX_NAME = 'idx_log_user') <> 'log_user_id', 'ALTER TABLE `tb_login_logs` DROP INDEX `idx_log_user`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND INDEX_NAME = 'idx_log_user') = 0, 'ALTER TABLE `tb_login_logs` ADD KEY `idx_log_user` (`log_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND INDEX_NAME = 'idx_log_created') <> 'log_created_at', 'ALTER TABLE `tb_login_logs` DROP INDEX `idx_log_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND INDEX_NAME = 'idx_log_created') = 0, 'ALTER TABLE `tb_login_logs` ADD KEY `idx_log_created` (`log_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_email_otps
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND INDEX_NAME = 'idx_otp_lookup') <> 'otp_email,otp_purpose,otp_created_at', 'ALTER TABLE `tb_email_otps` DROP INDEX `idx_otp_lookup`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND INDEX_NAME = 'idx_otp_lookup') = 0, 'ALTER TABLE `tb_email_otps` ADD KEY `idx_otp_lookup` (`otp_email`,`otp_purpose`,`otp_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND INDEX_NAME = 'idx_otp_expires') <> 'otp_expires_at', 'ALTER TABLE `tb_email_otps` DROP INDEX `idx_otp_expires`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND INDEX_NAME = 'idx_otp_expires') = 0, 'ALTER TABLE `tb_email_otps` ADD KEY `idx_otp_expires` (`otp_expires_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND INDEX_NAME = 'fk_otp_user') = 0, 'ALTER TABLE `tb_email_otps` ADD KEY `fk_otp_user` (`otp_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_audit_logs
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_created') <> 'aud_created_at', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_created') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_created` (`aud_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_user_created') <> 'aud_user_id,aud_created_at', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_user_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_user_created') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_user_created` (`aud_user_id`,`aud_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_entity') <> 'aud_entity_type,aud_entity_id', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_entity`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_entity') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_entity` (`aud_entity_type`,`aud_entity_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_project_created') <> 'aud_project_id,aud_created_at', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_project_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_project_created') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_project_created` (`aud_project_id`,`aud_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_event_created') <> 'aud_event,aud_created_at', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_event_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_event_created') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_event_created` (`aud_event`,`aud_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_request') <> 'aud_request_id', 'ALTER TABLE `tb_audit_logs` DROP INDEX `idx_aud_request`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND INDEX_NAME = 'idx_aud_request') = 0, 'ALTER TABLE `tb_audit_logs` ADD KEY `idx_aud_request` (`aud_request_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_error_logs
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND INDEX_NAME = 'uq_err_fingerprint') <> 'err_fingerprint', 'ALTER TABLE `tb_error_logs` DROP INDEX `uq_err_fingerprint`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND INDEX_NAME = 'uq_err_fingerprint') = 0, 'ALTER TABLE `tb_error_logs` ADD UNIQUE KEY `uq_err_fingerprint` (`err_fingerprint`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND INDEX_NAME = 'idx_err_last_seen') <> 'err_last_seen', 'ALTER TABLE `tb_error_logs` DROP INDEX `idx_err_last_seen`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_error_logs' AND INDEX_NAME = 'idx_err_last_seen') = 0, 'ALTER TABLE `tb_error_logs` ADD KEY `idx_err_last_seen` (`err_last_seen`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_positions
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND INDEX_NAME = 'uq_position_name') <> 'position_name', 'ALTER TABLE `tb_project_positions` DROP INDEX `uq_position_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_positions' AND INDEX_NAME = 'uq_position_name') = 0, 'ALTER TABLE `tb_project_positions` ADD UNIQUE KEY `uq_position_name` (`position_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_projects
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'uq_project_share_token') <> 'project_share_token', 'ALTER TABLE `tb_projects` DROP INDEX `uq_project_share_token`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'uq_project_share_token') = 0, 'ALTER TABLE `tb_projects` ADD UNIQUE KEY `uq_project_share_token` (`project_share_token`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_client') <> 'client_id', 'ALTER TABLE `tb_projects` DROP INDEX `idx_project_client`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_client') = 0, 'ALTER TABLE `tb_projects` ADD KEY `idx_project_client` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_status') <> 'project_status', 'ALTER TABLE `tb_projects` DROP INDEX `idx_project_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_status') = 0, 'ALTER TABLE `tb_projects` ADD KEY `idx_project_status` (`project_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_type') <> 'project_type', 'ALTER TABLE `tb_projects` DROP INDEX `idx_project_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_type') = 0, 'ALTER TABLE `tb_projects` ADD KEY `idx_project_type` (`project_type`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_due_date') <> 'project_due_date', 'ALTER TABLE `tb_projects` DROP INDEX `idx_project_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'idx_project_due_date') = 0, 'ALTER TABLE `tb_projects` ADD KEY `idx_project_due_date` (`project_due_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND INDEX_NAME = 'fk_project_creator') = 0, 'ALTER TABLE `tb_projects` ADD KEY `fk_project_creator` (`project_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_members
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND INDEX_NAME = 'uq_project_member') <> 'project_id,user_id', 'ALTER TABLE `tb_project_members` DROP INDEX `uq_project_member`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND INDEX_NAME = 'uq_project_member') = 0, 'ALTER TABLE `tb_project_members` ADD UNIQUE KEY `uq_project_member` (`project_id`,`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND INDEX_NAME = 'idx_pm_user') <> 'user_id', 'ALTER TABLE `tb_project_members` DROP INDEX `idx_pm_user`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND INDEX_NAME = 'idx_pm_user') = 0, 'ALTER TABLE `tb_project_members` ADD KEY `idx_pm_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_member_positions
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_member_positions' AND INDEX_NAME = 'fk_pmp_position') = 0, 'ALTER TABLE `tb_project_member_positions` ADD KEY `fk_pmp_position` (`position_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_tasks
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_project') <> 'project_id', 'ALTER TABLE `tb_tasks` DROP INDEX `idx_task_project`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_project') = 0, 'ALTER TABLE `tb_tasks` ADD KEY `idx_task_project` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_parent') <> 'task_parent_id', 'ALTER TABLE `tb_tasks` DROP INDEX `idx_task_parent`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_parent') = 0, 'ALTER TABLE `tb_tasks` ADD KEY `idx_task_parent` (`task_parent_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_due_date') <> 'task_due_date', 'ALTER TABLE `tb_tasks` DROP INDEX `idx_task_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_due_date') = 0, 'ALTER TABLE `tb_tasks` ADD KEY `idx_task_due_date` (`task_due_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_status_completed') <> 'task_status,task_completed_at', 'ALTER TABLE `tb_tasks` DROP INDEX `idx_task_status_completed`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'idx_task_status_completed') = 0, 'ALTER TABLE `tb_tasks` ADD KEY `idx_task_status_completed` (`task_status`,`task_completed_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_assignees
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND INDEX_NAME = 'idx_ta_user') <> 'user_id', 'ALTER TABLE `tb_task_assignees` DROP INDEX `idx_ta_user`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND INDEX_NAME = 'idx_ta_user') = 0, 'ALTER TABLE `tb_task_assignees` ADD KEY `idx_ta_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issues
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_task') <> 'task_id', 'ALTER TABLE `tb_task_issues` DROP INDEX `idx_issue_task`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_task') = 0, 'ALTER TABLE `tb_task_issues` ADD KEY `idx_issue_task` (`task_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_task_status') <> 'task_id,issue_status', 'ALTER TABLE `tb_task_issues` DROP INDEX `idx_issue_task_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_task_status') = 0, 'ALTER TABLE `tb_task_issues` ADD KEY `idx_issue_task_status` (`task_id`,`issue_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_status_resolved') <> 'issue_status,issue_resolved_at', 'ALTER TABLE `tb_task_issues` DROP INDEX `idx_issue_status_resolved`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'idx_issue_status_resolved') = 0, 'ALTER TABLE `tb_task_issues` ADD KEY `idx_issue_status_resolved` (`issue_status`,`issue_resolved_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND INDEX_NAME = 'fk_issue_creator') = 0, 'ALTER TABLE `tb_task_issues` ADD KEY `fk_issue_creator` (`created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_images
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND INDEX_NAME = 'idx_issue_image_issue') <> 'issue_id', 'ALTER TABLE `tb_task_issue_images` DROP INDEX `idx_issue_image_issue`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND INDEX_NAME = 'idx_issue_image_issue') = 0, 'ALTER TABLE `tb_task_issue_images` ADD KEY `idx_issue_image_issue` (`issue_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_tags
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND INDEX_NAME = 'idx_issue_tag_user') <> 'user_id', 'ALTER TABLE `tb_task_issue_tags` DROP INDEX `idx_issue_tag_user`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND INDEX_NAME = 'idx_issue_tag_user') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD KEY `idx_issue_tag_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_replies
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND INDEX_NAME = 'idx_issue_reply_issue') <> 'issue_id', 'ALTER TABLE `tb_task_issue_replies` DROP INDEX `idx_issue_reply_issue`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND INDEX_NAME = 'idx_issue_reply_issue') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD KEY `idx_issue_reply_issue` (`issue_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND INDEX_NAME = 'idx_issue_reply_created') <> 'issue_id,reply_created_at', 'ALTER TABLE `tb_task_issue_replies` DROP INDEX `idx_issue_reply_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND INDEX_NAME = 'idx_issue_reply_created') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD KEY `idx_issue_reply_created` (`issue_id`,`reply_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND INDEX_NAME = 'fk_issue_reply_user') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD KEY `fk_issue_reply_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_reply_images
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND INDEX_NAME = 'idx_issue_reply_image_reply') <> 'reply_id', 'ALTER TABLE `tb_task_issue_reply_images` DROP INDEX `idx_issue_reply_image_reply`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND INDEX_NAME = 'idx_issue_reply_image_reply') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD KEY `idx_issue_reply_image_reply` (`reply_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_reply_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND INDEX_NAME = 'fk_issue_reply_read_user') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD KEY `fk_issue_reply_read_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_messages
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'idx_chat_task') <> 'task_id', 'ALTER TABLE `tb_task_chat_messages` DROP INDEX `idx_chat_task`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'idx_chat_task') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD KEY `idx_chat_task` (`task_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'idx_chat_task_created') <> 'task_id,message_created_at', 'ALTER TABLE `tb_task_chat_messages` DROP INDEX `idx_chat_task_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'idx_chat_task_created') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD KEY `idx_chat_task_created` (`task_id`,`message_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'fk_chat_user') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD KEY `fk_chat_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND INDEX_NAME = 'fk_chat_reply_to') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD KEY `fk_chat_reply_to` (`reply_to_message_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_images
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND INDEX_NAME = 'idx_chat_image_message') <> 'message_id', 'ALTER TABLE `tb_task_chat_images` DROP INDEX `idx_chat_image_message`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND INDEX_NAME = 'idx_chat_image_message') = 0, 'ALTER TABLE `tb_task_chat_images` ADD KEY `idx_chat_image_message` (`message_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND INDEX_NAME = 'fk_chat_read_user') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD KEY `fk_chat_read_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_messages
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'idx_project_chat_project') <> 'project_id', 'ALTER TABLE `tb_project_chat_messages` DROP INDEX `idx_project_chat_project`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'idx_project_chat_project') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD KEY `idx_project_chat_project` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'idx_project_chat_created') <> 'project_id,message_created_at', 'ALTER TABLE `tb_project_chat_messages` DROP INDEX `idx_project_chat_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'idx_project_chat_created') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD KEY `idx_project_chat_created` (`project_id`,`message_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'fk_project_chat_user') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD KEY `fk_project_chat_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND INDEX_NAME = 'fk_project_chat_reply_to') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD KEY `fk_project_chat_reply_to` (`reply_to_message_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_images
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND INDEX_NAME = 'idx_project_chat_image_message') <> 'message_id', 'ALTER TABLE `tb_project_chat_images` DROP INDEX `idx_project_chat_image_message`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND INDEX_NAME = 'idx_project_chat_image_message') = 0, 'ALTER TABLE `tb_project_chat_images` ADD KEY `idx_project_chat_image_message` (`message_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND INDEX_NAME = 'fk_project_chat_read_user') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD KEY `fk_project_chat_read_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_activity_log
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_task') <> 'task_id', 'ALTER TABLE `tb_task_activity_log` DROP INDEX `idx_tal_task`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_task') = 0, 'ALTER TABLE `tb_task_activity_log` ADD KEY `idx_tal_task` (`task_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_created') <> 'log_created_at', 'ALTER TABLE `tb_task_activity_log` DROP INDEX `idx_tal_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_created') = 0, 'ALTER TABLE `tb_task_activity_log` ADD KEY `idx_tal_created` (`log_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_status_start') <> 'log_action,log_new_value,task_id,log_created_at', 'ALTER TABLE `tb_task_activity_log` DROP INDEX `idx_tal_status_start`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'idx_tal_status_start') = 0, 'ALTER TABLE `tb_task_activity_log` ADD KEY `idx_tal_status_start` (`log_action`,`log_new_value`,`task_id`,`log_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND INDEX_NAME = 'fk_tal_user') = 0, 'ALTER TABLE `tb_task_activity_log` ADD KEY `fk_tal_user` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── ส่วนที่ 4: เติม foreign key ที่ยังขาด (รวม FK ย้อนกลับ tb_roles -> tb_users ที่สร้างพร้อมตารางไม่ได้) ──
-- tb_roles
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND CONSTRAINT_NAME = 'fk_role_department' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_roles` ADD CONSTRAINT `fk_role_department` FOREIGN KEY (`role_department`) REFERENCES `tb_department` (`dep_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND CONSTRAINT_NAME = 'fk_role_granted_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_roles` ADD CONSTRAINT `fk_role_granted_by` FOREIGN KEY (`role_granted_by_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_users
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND CONSTRAINT_NAME = 'fk_user_role' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_users` ADD CONSTRAINT `fk_user_role` FOREIGN KEY (`user_role_id`) REFERENCES `tb_roles` (`role_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_login_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND CONSTRAINT_NAME = 'fk_log_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_login_logs` ADD CONSTRAINT `fk_log_user` FOREIGN KEY (`log_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_projects
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND CONSTRAINT_NAME = 'fk_project_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_projects` ADD CONSTRAINT `fk_project_client` FOREIGN KEY (`client_id`) REFERENCES `tb_clients` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND CONSTRAINT_NAME = 'fk_project_creator' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_projects` ADD CONSTRAINT `fk_project_creator` FOREIGN KEY (`project_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_email_otps
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_email_otps' AND CONSTRAINT_NAME = 'fk_otp_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_email_otps` ADD CONSTRAINT `fk_otp_user` FOREIGN KEY (`otp_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_audit_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_audit_logs' AND CONSTRAINT_NAME = 'fk_aud_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_audit_logs` ADD CONSTRAINT `fk_aud_user` FOREIGN KEY (`aud_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_members
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND CONSTRAINT_NAME = 'fk_pm_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_members` ADD CONSTRAINT `fk_pm_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_members' AND CONSTRAINT_NAME = 'fk_pm_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_members` ADD CONSTRAINT `fk_pm_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_member_positions
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_member_positions' AND CONSTRAINT_NAME = 'fk_pmp_member' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_member_positions` ADD CONSTRAINT `fk_pmp_member` FOREIGN KEY (`project_member_id`) REFERENCES `tb_project_members` (`project_member_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_member_positions' AND CONSTRAINT_NAME = 'fk_pmp_position' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_member_positions` ADD CONSTRAINT `fk_pmp_position` FOREIGN KEY (`position_id`) REFERENCES `tb_project_positions` (`position_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_tasks
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND CONSTRAINT_NAME = 'fk_task_parent' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_tasks` ADD CONSTRAINT `fk_task_parent` FOREIGN KEY (`task_parent_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND CONSTRAINT_NAME = 'fk_task_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_tasks` ADD CONSTRAINT `fk_task_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_assignees
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND CONSTRAINT_NAME = 'fk_ta_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_assignees` ADD CONSTRAINT `fk_ta_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_assignees' AND CONSTRAINT_NAME = 'fk_ta_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_assignees` ADD CONSTRAINT `fk_ta_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issues
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND CONSTRAINT_NAME = 'fk_issue_creator' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issues` ADD CONSTRAINT `fk_issue_creator` FOREIGN KEY (`created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issues' AND CONSTRAINT_NAME = 'fk_issue_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issues` ADD CONSTRAINT `fk_issue_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_images' AND CONSTRAINT_NAME = 'fk_issue_image_issue' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_images` ADD CONSTRAINT `fk_issue_image_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_tags
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND CONSTRAINT_NAME = 'fk_issue_tag_issue' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD CONSTRAINT `fk_issue_tag_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_tags' AND CONSTRAINT_NAME = 'fk_issue_tag_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_tags` ADD CONSTRAINT `fk_issue_tag_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_replies
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND CONSTRAINT_NAME = 'fk_issue_reply_issue' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD CONSTRAINT `fk_issue_reply_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND CONSTRAINT_NAME = 'fk_issue_reply_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_replies` ADD CONSTRAINT `fk_issue_reply_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_reply_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_images' AND CONSTRAINT_NAME = 'fk_issue_reply_image_reply' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_reply_images` ADD CONSTRAINT `fk_issue_reply_image_reply` FOREIGN KEY (`reply_id`) REFERENCES `tb_task_issue_replies` (`reply_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_issue_reply_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND CONSTRAINT_NAME = 'fk_issue_reply_read_issue' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD CONSTRAINT `fk_issue_reply_read_issue` FOREIGN KEY (`issue_id`) REFERENCES `tb_task_issues` (`issue_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_reply_reads' AND CONSTRAINT_NAME = 'fk_issue_reply_read_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_issue_reply_reads` ADD CONSTRAINT `fk_issue_reply_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_messages
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND CONSTRAINT_NAME = 'fk_chat_reply_to' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD CONSTRAINT `fk_chat_reply_to` FOREIGN KEY (`reply_to_message_id`) REFERENCES `tb_task_chat_messages` (`message_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND CONSTRAINT_NAME = 'fk_chat_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD CONSTRAINT `fk_chat_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND CONSTRAINT_NAME = 'fk_chat_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_messages` ADD CONSTRAINT `fk_chat_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_images' AND CONSTRAINT_NAME = 'fk_chat_image_message' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_images` ADD CONSTRAINT `fk_chat_image_message` FOREIGN KEY (`message_id`) REFERENCES `tb_task_chat_messages` (`message_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND CONSTRAINT_NAME = 'fk_chat_read_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD CONSTRAINT `fk_chat_read_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_reads' AND CONSTRAINT_NAME = 'fk_chat_read_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_chat_reads` ADD CONSTRAINT `fk_chat_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_messages
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND CONSTRAINT_NAME = 'fk_project_chat_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD CONSTRAINT `fk_project_chat_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND CONSTRAINT_NAME = 'fk_project_chat_reply_to' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD CONSTRAINT `fk_project_chat_reply_to` FOREIGN KEY (`reply_to_message_id`) REFERENCES `tb_project_chat_messages` (`message_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND CONSTRAINT_NAME = 'fk_project_chat_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_messages` ADD CONSTRAINT `fk_project_chat_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_images
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_images' AND CONSTRAINT_NAME = 'fk_project_chat_image_message' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_images` ADD CONSTRAINT `fk_project_chat_image_message` FOREIGN KEY (`message_id`) REFERENCES `tb_project_chat_messages` (`message_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_project_chat_reads
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND CONSTRAINT_NAME = 'fk_project_chat_read_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD CONSTRAINT `fk_project_chat_read_project` FOREIGN KEY (`project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_reads' AND CONSTRAINT_NAME = 'fk_project_chat_read_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_chat_reads` ADD CONSTRAINT `fk_project_chat_read_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_task_activity_log
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND CONSTRAINT_NAME = 'fk_tal_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_activity_log` ADD CONSTRAINT `fk_tal_task` FOREIGN KEY (`task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_activity_log' AND CONSTRAINT_NAME = 'fk_tal_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_activity_log` ADD CONSTRAINT `fk_tal_user` FOREIGN KEY (`user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── ส่วนที่ 5: ข้อมูลเริ่มต้น (ใส่เฉพาะตอนตารางยังว่างเท่านั้น) ─────────────────────────────────
-- ตั้งใจเช็ค "ตารางว่าง" ไม่ใช่ "ไม่มีแถวนี้" — ถ้าแอดมินลบ/เปลี่ยนบัญชีเริ่มต้นไปแล้วบน production
-- ห้ามสร้างบัญชีที่รู้รหัสผ่านกลับขึ้นมาใหม่เองตอน deploy

-- role Admin เปิดทุกบิต (27 บิต)
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
SELECT 'ROL202601010000001', 'Admin', '111111111111111111111111111', 'S'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_roles);

-- ผู้ใช้คนแรก: admin (หรือ admin@softwork.local) / Admin@12345 — เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรกบน production
INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
SELECT 'USE202601010000001', 'admin', 'admin@softwork.local', '$2a$10$UnrGKjjYX4uf1ojXLAPNOOdAT26aZg/eVmTDGvv2wWF95gYoQ5G0K',
       'System', 'Admin', 'ROL202601010000001', FALSE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_users)
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_id = 'ROL202601010000001');

-- ตำแหน่ง PM เปิดทุกบิต (29 บิต) — project.controller.js หาตำแหน่งชื่อ 'PM' ไปให้ผู้สร้างโปรเจกต์อัตโนมัติ
INSERT INTO tb_project_positions (position_id, position_name, position_permission)
SELECT 'POS202601010000001', 'PM', '11111111111111111111111111111'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_project_positions);

-- ─── ส่วนที่ 6: ตรวจสอบ — ไม่มีแถวผลลัพธ์ = โครงสร้างครบถ้วนตามไฟล์นี้ ─────────────────────────────
-- มีแถว = ตารางนั้นมีคอลัมน์/index ไม่ตรงกับที่คาด (missing_* คือที่ขาด, extra_* คือที่เกินมาจากของเก่า)
SELECT e.table_name,
       IF(a.table_name IS NULL, 'ไม่มีตารางนี้', NULL) AS problem,
       e.expected_columns, a.actual_columns,
       e.expected_indexes, a.actual_indexes
FROM (
              SELECT 'tb_department' AS table_name, 'dep_created_at,dep_id,dep_name,dep_status,dep_updated_at' AS expected_columns, 'primary(dep_id),uq_dep_name(dep_name)' AS expected_indexes
    UNION ALL SELECT 'tb_roles' AS table_name, 'role_department,role_granted_at,role_granted_by_id,role_id,role_name,role_permission,role_type,role_update_at' AS expected_columns, 'fk_role_department(role_department),fk_role_granted_by(role_granted_by_id),primary(role_id),uq_role_name(role_name)' AS expected_indexes
    UNION ALL SELECT 'tb_users' AS table_name, 'user_avatar_url,user_created_at,user_email,user_fname,user_id,user_last_login_at,user_line_uid,user_lname,user_must_change_password,user_password,user_phone,user_role_id,user_status,user_updated_at,user_username,user_whatsapp_no' AS expected_columns, 'idx_user_role(user_role_id),primary(user_id),uq_user_email(user_email),uq_user_username(user_username)' AS expected_indexes
    UNION ALL SELECT 'tb_maxID' AS table_name, 'max_id,max_table' AS expected_columns, 'primary(max_table)' AS expected_indexes
    UNION ALL SELECT 'tb_login_logs' AS table_name, 'log_action,log_created_at,log_email,log_fullname,log_id,log_ip_address,log_user_agent,log_user_id' AS expected_columns, 'idx_log_created(log_created_at),idx_log_user(log_user_id),primary(log_id)' AS expected_indexes
    UNION ALL SELECT 'tb_email_otps' AS table_name, 'otp_attempts,otp_code_hash,otp_created_at,otp_email,otp_expires_at,otp_id,otp_purpose,otp_used_at,otp_user_id' AS expected_columns, 'fk_otp_user(otp_user_id),idx_otp_expires(otp_expires_at),idx_otp_lookup(otp_email+otp_purpose+otp_created_at),primary(otp_id)' AS expected_indexes
    UNION ALL SELECT 'tb_audit_logs' AS table_name, 'aud_action,aud_changes,aud_created_at,aud_duration_ms,aud_entity_id,aud_entity_type,aud_error,aud_event,aud_id,aud_ip,aud_method,aud_path,aud_payload,aud_project_id,aud_request_id,aud_role_name,aud_status,aud_success,aud_user_agent,aud_user_fullname,aud_user_id,aud_user_username' AS expected_columns, 'idx_aud_created(aud_created_at),idx_aud_entity(aud_entity_type+aud_entity_id),idx_aud_event_created(aud_event+aud_created_at),idx_aud_project_created(aud_project_id+aud_created_at),idx_aud_request(aud_request_id),idx_aud_user_created(aud_user_id+aud_created_at),primary(aud_id)' AS expected_indexes
    UNION ALL SELECT 'tb_error_logs' AS table_name, 'err_count,err_fingerprint,err_first_seen,err_id,err_last_ip,err_last_request_id,err_last_seen,err_last_user_id,err_message,err_method,err_path,err_stack,err_status' AS expected_columns, 'idx_err_last_seen(err_last_seen),primary(err_id),uq_err_fingerprint(err_fingerprint)' AS expected_indexes
    UNION ALL SELECT 'tb_project_positions' AS table_name, 'position_created_at,position_id,position_name,position_permission,position_status,position_updated_at' AS expected_columns, 'primary(position_id),uq_position_name(position_name)' AS expected_indexes
    UNION ALL SELECT 'tb_clients' AS table_name, 'client_company,client_created_at,client_email,client_id,client_name,client_phone,client_updated_at' AS expected_columns, 'primary(client_id)' AS expected_indexes
    UNION ALL SELECT 'tb_projects' AS table_name, 'client_id,project_completed_at,project_created_at,project_created_by,project_description,project_due_date,project_id,project_name,project_progress_percent,project_share_enabled,project_share_token,project_start_date,project_status,project_type,project_updated_at,project_use_task_weight' AS expected_columns, 'fk_project_creator(project_created_by),idx_project_client(client_id),idx_project_due_date(project_due_date),idx_project_status(project_status),idx_project_type(project_type),primary(project_id),uq_project_share_token(project_share_token)' AS expected_indexes
    UNION ALL SELECT 'tb_project_members' AS table_name, 'joined_at,project_id,project_member_id,user_id' AS expected_columns, 'idx_pm_user(user_id),primary(project_member_id),uq_project_member(project_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_member_positions' AS table_name, 'position_id,project_member_id' AS expected_columns, 'fk_pmp_position(position_id),primary(project_member_id+position_id)' AS expected_indexes
    UNION ALL SELECT 'tb_tasks' AS table_name, 'project_id,task_completed_at,task_created_at,task_description,task_due_date,task_id,task_parent_id,task_sort_order,task_start_date,task_status,task_title,task_updated_at,task_weight' AS expected_columns, 'idx_task_due_date(task_due_date),idx_task_parent(task_parent_id),idx_task_project(project_id),idx_task_status_completed(task_status+task_completed_at),primary(task_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_assignees' AS table_name, 'task_id,user_id' AS expected_columns, 'idx_ta_user(user_id),primary(task_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issues' AS table_name, 'created_by,issue_created_at,issue_description,issue_id,issue_resolved_at,issue_status,issue_title,issue_updated_at,task_id' AS expected_columns, 'fk_issue_creator(created_by),idx_issue_status_resolved(issue_status+issue_resolved_at),idx_issue_task(task_id),idx_issue_task_status(task_id+issue_status),primary(issue_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issue_images' AS table_name, 'image_created_at,image_id,image_url,issue_id' AS expected_columns, 'idx_issue_image_issue(issue_id),primary(image_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issue_tags' AS table_name, 'issue_id,tagged_at,user_id' AS expected_columns, 'idx_issue_tag_user(user_id),primary(issue_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issue_replies' AS table_name, 'issue_id,reply_created_at,reply_id,reply_text,user_id' AS expected_columns, 'fk_issue_reply_user(user_id),idx_issue_reply_created(issue_id+reply_created_at),idx_issue_reply_issue(issue_id),primary(reply_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issue_reply_images' AS table_name, 'image_created_at,image_id,image_url,reply_id' AS expected_columns, 'idx_issue_reply_image_reply(reply_id),primary(image_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_issue_reply_reads' AS table_name, 'issue_id,last_read_at,user_id' AS expected_columns, 'fk_issue_reply_read_user(user_id),primary(issue_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_chat_messages' AS table_name, 'message_created_at,message_id,message_text,reply_to_message_id,task_id,user_id' AS expected_columns, 'fk_chat_reply_to(reply_to_message_id),fk_chat_user(user_id),idx_chat_task(task_id),idx_chat_task_created(task_id+message_created_at),primary(message_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_chat_images' AS table_name, 'image_created_at,image_id,image_url,message_id' AS expected_columns, 'idx_chat_image_message(message_id),primary(image_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_chat_reads' AS table_name, 'last_read_at,task_id,user_id' AS expected_columns, 'fk_chat_read_user(user_id),primary(task_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_chat_messages' AS table_name, 'message_created_at,message_id,message_text,project_id,reply_to_message_id,user_id' AS expected_columns, 'fk_project_chat_reply_to(reply_to_message_id),fk_project_chat_user(user_id),idx_project_chat_created(project_id+message_created_at),idx_project_chat_project(project_id),primary(message_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_chat_images' AS table_name, 'image_created_at,image_id,image_url,message_id' AS expected_columns, 'idx_project_chat_image_message(message_id),primary(image_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_chat_reads' AS table_name, 'last_read_at,project_id,user_id' AS expected_columns, 'fk_project_chat_read_user(user_id),primary(project_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_activity_log' AS table_name, 'log_action,log_created_at,log_fullname,log_id,log_message,log_new_value,log_old_value,task_id,user_id' AS expected_columns, 'fk_tal_user(user_id),idx_tal_created(log_created_at),idx_tal_status_start(log_action+log_new_value+task_id+log_created_at),idx_tal_task(task_id),primary(log_id)' AS expected_indexes
) e
LEFT JOIN (
    SELECT LOWER(c.TABLE_NAME) AS table_name,
           c.cols AS actual_columns,
           i.idx AS actual_indexes
    FROM (SELECT TABLE_NAME, GROUP_CONCAT(LOWER(COLUMN_NAME) ORDER BY BINARY LOWER(COLUMN_NAME) SEPARATOR ',') AS cols
          FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME) c
    LEFT JOIN (SELECT TABLE_NAME, GROUP_CONCAT(ix ORDER BY BINARY ix SEPARATOR ',') AS idx
          FROM (SELECT TABLE_NAME, LOWER(CONCAT(INDEX_NAME, '(', GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR '+'), ')')) AS ix
                FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() GROUP BY TABLE_NAME, INDEX_NAME) per_index
          GROUP BY TABLE_NAME) i
      ON i.TABLE_NAME = c.TABLE_NAME
) a ON BINARY a.table_name = BINARY LOWER(e.table_name)
WHERE a.table_name IS NULL
   OR BINARY a.actual_columns <> BINARY e.expected_columns
   OR BINARY IFNULL(a.actual_indexes, '') <> BINARY e.expected_indexes;
