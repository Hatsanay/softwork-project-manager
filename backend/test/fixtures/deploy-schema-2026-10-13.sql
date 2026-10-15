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
--   backend/src/shared/permissions.mjs + frontend/app/components/bit.tsx (role, 29 บิต, append-only)
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
  `user_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'สาขาเริ่มต้นของเอกสารที่ผู้ใช้นี้สร้าง (แก้ในเอกสารได้) — ว่าง = สำนักงานใหญ่',
  `user_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `user_must_change_password` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'บังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก (สำหรับรหัสผ่านชั่วคราวที่ระบบ gen ให้)',
  `user_last_login_at` datetime DEFAULT NULL,
  `user_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `user_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_user_username` (`user_username`),
  UNIQUE KEY `uq_user_email` (`user_email`),
  KEY `idx_user_role` (`user_role_id`),
  KEY `fk_user_branch` (`user_branch_id`),
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
  `client_type` enum('juristic','individual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'juristic' COMMENT 'นิติบุคคล / บุคคลธรรมดา',
  `client_country` char(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TH' COMMENT 'ISO 3166 — เลขผู้เสียภาษีบังคับ 13 หลักเฉพาะ TH',
  `client_tax_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_branch_code` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'สาขาของลูกค้า 00000 = สำนักงานใหญ่',
  `client_address` text COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่สำหรับออกเอกสาร',
  `client_contact_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `client_credit_days` int DEFAULT NULL COMMENT 'เครดิตเทอม (วัน)',
  `client_wht_rate` decimal(5,2) DEFAULT NULL COMMENT 'อัตราหัก ณ ที่จ่ายเริ่มต้น (%)',
  `client_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB' COMMENT 'สกุลเงินเริ่มต้นของใบเสนอราคา',
  `client_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th' COMMENT 'ภาษาเอกสารเริ่มต้น',
  `client_vat_treatment` enum('standard','zero') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard' COMMENT 'การคิด VAT เริ่มต้น',
  `client_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT 'inactive = เลือกในเอกสารใหม่ไม่ได้',
  `client_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `client_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`client_id`),
  KEY `fk_client_currency` (`client_currency`)
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
  `task_quotation_item_id` bigint unsigned DEFAULT NULL COMMENT 'สร้างจากรายการไหนของใบเสนอราคา (ตอนลูกค้าตอบรับ)',
  `task_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `task_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`task_id`),
  KEY `idx_task_project` (`project_id`),
  KEY `idx_task_parent` (`task_parent_id`),
  KEY `idx_task_due_date` (`task_due_date`),
  KEY `idx_task_status_completed` (`task_status`,`task_completed_at`),
  KEY `fk_task_quotation_item` (`task_quotation_item_id`),
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

-- ════ วงจรขาย ช่วง 1A (2026-10-13) — แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1 ════════════════
-- เงิน = DECIMAL(15,2) คำนวณที่ backend ด้วย src/shared/money.mjs · อัตราแลกเปลี่ยน = บาทต่อ 1 หน่วย DECIMAL(20,10)
-- (10 ตำแหน่งพอสำหรับสกุลที่ ธปท. ประกาศต่อ 100/1000 หน่วย เช่น เยน — หารแล้วไม่เสียความแม่นยำ)
-- แถวลูก (รายการ/งวด/ประวัติอนุมัติ/แถวในชุดสินค้า) ใช้ BIGINT AUTO_INCREMENT: สร้างทีละหลายแถวใน transaction เดียว
-- ไม่ควรล็อก tb_maxID ทีละแถว และไม่ใช่เลขที่ผู้ใช้เห็น
-- FK จากตารางเดิม (tb_users, tb_clients, tb_tasks) มาตารางกลุ่มนี้ อยู่ในส่วนที่ 4 เพราะตารางเดิมถูกสร้างก่อน

-- สกุลเงิน (รหัส ISO 4217) — THB เป็นสกุลหลักของระบบ ปิดใช้งานไม่ได้ · ข้อมูลเริ่มต้น THB + USD อยู่ต้นส่วนที่ 4
CREATE TABLE IF NOT EXISTS `tb_currencies` (
  `cur_code` char(3) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ISO 4217 เช่น THB, USD, JPY',
  `cur_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cur_name_en` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cur_symbol` varchar(10) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cur_decimals` tinyint unsigned NOT NULL DEFAULT '2' COMMENT '0-2 เท่านั้น (เยน = 0) — เปลี่ยนไม่ได้หลังมีเอกสารใช้สกุลนี้',
  `cur_unit_th` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'คำอ่านหน่วยหลัก เช่น บาท, ดอลลาร์สหรัฐ',
  `cur_subunit_th` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'คำอ่านหน่วยย่อย เช่น สตางค์, เซนต์ — ว่างได้ถ้าไม่มีทศนิยม',
  `cur_unit_en` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เช่น Baht, US Dollars',
  `cur_subunit_en` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เช่น Satang, Cents',
  `cur_bot_unit` int unsigned NOT NULL DEFAULT '1' COMMENT 'ธปท. ประกาศอัตราต่อกี่หน่วย (1, 100, 1000) — ใช้แปลงเป็นบาทต่อ 1 หน่วยก่อนเก็บ',
  `cur_sort_order` int NOT NULL DEFAULT '0',
  `cur_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `cur_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `cur_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cur_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ข้อมูลบริษัท — แถวเดียวเสมอ (cs_id = 1)
-- cs_vat_registered_from ว่าง = ยังไม่จด VAT · เอกสารที่ลงวันที่ตั้งแต่วันนั้นคิด VAT ตามอัตราใน tb_vat_rates ณ วันที่เอกสาร
CREATE TABLE IF NOT EXISTS `tb_company_settings` (
  `cs_id` tinyint unsigned NOT NULL,
  `cs_name_th` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `cs_name_en` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cs_tax_id` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขประจำตัวผู้เสียภาษี 13 หลัก',
  `cs_address_th` text COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่ตามทะเบียน (สำนักงานใหญ่)',
  `cs_address_en` text COLLATE utf8mb4_unicode_ci,
  `cs_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cs_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cs_website` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cs_logo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cs_vat_registered_from` date DEFAULT NULL COMMENT 'วันที่จดทะเบียน VAT มีผล — ว่าง = ยังไม่จด',
  `cs_quotation_valid_days` int NOT NULL DEFAULT '30' COMMENT 'อายุยืนราคาเริ่มต้นของใบเสนอราคา (วัน)',
  `cs_quotation_terms_th` text COLLATE utf8mb4_unicode_ci COMMENT 'เงื่อนไขท้ายใบเสนอราคาเริ่มต้น (เอกสารภาษาไทย)',
  `cs_quotation_terms_en` text COLLATE utf8mb4_unicode_ci COMMENT 'เงื่อนไขท้ายใบเสนอราคาเริ่มต้น (เอกสารภาษาอังกฤษ)',
  `cs_allow_self_approval` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ผู้สร้างอนุมัติเอกสารของตัวเองได้ (บริษัทที่มีผู้อนุมัติคนเดียว)',
  `cs_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cs_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตรา VAT ตามวันที่มีผล (หลักการ ERP ข้อ 4: อัตราภาษีต้องมีวันที่มีผล ไม่ hardcode)
-- อัตราของเอกสาร = แถวล่าสุดที่ vr_effective_from <= วันที่เอกสาร · ตั้งอัตราใหม่ล่วงหน้าได้ เอกสารเก่าไม่เปลี่ยน (เก็บอัตราในเอกสารแล้ว)
CREATE TABLE IF NOT EXISTS `tb_vat_rates` (
  `vr_effective_from` date NOT NULL,
  `vr_rate` decimal(5,2) NOT NULL COMMENT 'เช่น 7.00',
  `vr_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ที่มา เช่น เลขพระราชกฤษฎีกา',
  `vr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`vr_effective_from`),
  KEY `fk_vr_created_by` (`vr_created_by`),
  CONSTRAINT `fk_vr_created_by` FOREIGN KEY (`vr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สาขา / ศูนย์บริการ — รหัส 5 หลักตามแบบกรมสรรพากร: 00000 = สำนักงานใหญ่ (ใช้รหัสบอกว่าเป็นสำนักงานใหญ่ ไม่มีคอลัมน์แยก
-- จะได้ไม่มีทางมีสำนักงานใหญ่ 2 แห่ง) · ที่อยู่ว่าง = ใช้ที่อยู่บริษัท · ลบไม่ได้ถ้ามีเอกสาร/ผู้ใช้อ้างอยู่ ให้ปิดใช้งานแทน
CREATE TABLE IF NOT EXISTS `tb_branches` (
  `branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_code` char(5) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `branch_name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_address_th` text COLLATE utf8mb4_unicode_ci,
  `branch_address_en` text COLLATE utf8mb4_unicode_ci,
  `branch_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `branch_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `branch_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `branch_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`branch_id`),
  UNIQUE KEY `uq_branch_code` (`branch_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บัญชีธนาคารรับเงิน (แสดงบนใบแจ้งหนี้ ช่วง 1B) — บัญชีหลักมีได้ 1 บัญชีต่อสกุลเงิน (ตรวจใน backend)
CREATE TABLE IF NOT EXISTS `tb_bank_accounts` (
  `ba_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_bank_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_account_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_account_no` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ba_bank_branch` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ba_swift_code` varchar(11) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'สำหรับรับโอนจากต่างประเทศ',
  `ba_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `ba_is_default` tinyint(1) NOT NULL DEFAULT '0',
  `ba_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ba_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ba_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ba_id`),
  KEY `fk_ba_currency` (`ba_currency`),
  CONSTRAINT `fk_ba_currency` FOREIGN KEY (`ba_currency`) REFERENCES `tb_currencies` (`cur_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลำดับเลขที่เอกสาร: ประเภท + yyyymmdd + เลขรัน 6 หลัก (QT-20261231-000001) รีเซ็ตทุกวัน ลำดับเดียวทุกสาขา
-- ออกเลขใน transaction เดียวกับการออกเอกสาร (backend/src/utils/document-number.js) — rollback แล้วเลขถอยด้วย ไม่มีเลขข้าม
CREATE TABLE IF NOT EXISTS `tb_document_sequences` (
  `ds_doc_type` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'QT / IV / BN / RE',
  `ds_date` char(8) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'yyyymmdd ตามวันที่เอกสาร (เวลาไทย)',
  `ds_last` int unsigned NOT NULL,
  PRIMARY KEY (`ds_doc_type`,`ds_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แคชอัตราแลกเปลี่ยนจาก ธปท. (แปลงเป็นบาทต่อ 1 หน่วยแล้ว) — เก็บทุกวันที่เคยดึง ไม่ลบ ใช้ย้อนตรวจได้
-- เก็บอัตราทุกชนิดที่ ธปท. ให้มา เพราะชนิดที่ใช้แปลงรายได้ทางภาษียังรอนักบัญชียืนยัน (คำถาม B6)
CREATE TABLE IF NOT EXISTS `tb_exchange_rates` (
  `er_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL,
  `er_rate_date` date NOT NULL COMMENT 'วันที่ ธปท. ประกาศอัตรานี้',
  `er_buying_sight` decimal(20,10) DEFAULT NULL,
  `er_buying_transfer` decimal(20,10) DEFAULT NULL,
  `er_selling` decimal(20,10) DEFAULT NULL,
  `er_mid_rate` decimal(20,10) DEFAULT NULL,
  `er_fetched_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`er_currency`,`er_rate_date`),
  CONSTRAINT `fk_er_currency` FOREIGN KEY (`er_currency`) REFERENCES `tb_currencies` (`cur_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลายเซ็นผู้ใช้ — ใช้งานได้ทีละ 1 ฉบับต่อคน (ฉบับที่ sig_revoked_at ว่าง · ตรวจใน backend โดยล็อกแถวผู้ใช้)
-- ไฟล์อยู่นอกโฟลเดอร์ที่เปิดสาธารณะ · ไม่ลบไฟล์/แถวเก่า เพราะเอกสารที่อนุมัติแล้วอ้างฉบับที่ใช้ตอนนั้น
-- ผู้ใช้ที่มีลายเซ็นลบไม่ได้ (FK ไม่ cascade) ให้ปิดใช้งานแทน
CREATE TABLE IF NOT EXISTS `tb_user_signatures` (
  `sig_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sig_user_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sig_file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'path ภายใต้ storage/signatures',
  `sig_method` enum('upload','draw') COLLATE utf8mb4_unicode_ci NOT NULL,
  `sig_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `sig_revoked_at` datetime DEFAULT NULL,
  `sig_revoked_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`sig_id`),
  KEY `idx_sig_user_active` (`sig_user_id`,`sig_revoked_at`),
  KEY `fk_sig_revoked_by` (`sig_revoked_by`),
  CONSTRAINT `fk_sig_user` FOREIGN KEY (`sig_user_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_sig_revoked_by` FOREIGN KEY (`sig_revoked_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมวดสินค้า/บริการ — ลบหมวดแล้วสินค้า/ชุดในหมวดนั้นกลายเป็น "ไม่มีหมวด" (ไม่กระทบเอกสาร)
CREATE TABLE IF NOT EXISTS `tb_product_categories` (
  `pc_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pc_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pc_sort_order` int NOT NULL DEFAULT '0',
  `pc_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `pc_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pc_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pc_id`),
  UNIQUE KEY `uq_pc_name` (`pc_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- สินค้า/บริการ — ราคาตั้งต้นเป็นบาทเสมอ · เคยใช้ในเอกสาร/ชุดรายการแล้วลบไม่ได้ ให้ปิดใช้งานแทน
CREATE TABLE IF NOT EXISTS `tb_products` (
  `product_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_code` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่บังคับ แต่ห้ามซ้ำ',
  `product_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `product_description` text COLLATE utf8mb4_unicode_ci,
  `product_unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เช่น งาน, ชั่วโมง, เดือน, ชิ้น',
  `product_price` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ราคาตั้งต้น (บาท)',
  `product_category_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `product_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `product_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `product_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `uq_product_code` (`product_code`),
  KEY `idx_product_name` (`product_name`),
  KEY `fk_product_category` (`product_category_id`),
  CONSTRAINT `fk_product_category` FOREIGN KEY (`product_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ชุดรายการ (แพ็กเกจ) — กดครั้งเดียวได้ทุกแถวของชุดลงใบเสนอราคา
CREATE TABLE IF NOT EXISTS `tb_product_packages` (
  `pkg_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pkg_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pkg_description` text COLLATE utf8mb4_unicode_ci,
  `pkg_category_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pkg_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `pkg_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pkg_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pkg_id`),
  KEY `fk_pkg_category` (`pkg_category_id`),
  CONSTRAINT `fk_pkg_category` FOREIGN KEY (`pkg_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แถวในชุดรายการ — แถวที่อ้างสินค้าใช้ราคาปัจจุบันของสินค้าตอนกดเพิ่ม · แถวที่ไม่อ้างใช้ pki_unit_price
CREATE TABLE IF NOT EXISTS `tb_product_package_items` (
  `pki_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pki_package_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pki_order` int NOT NULL DEFAULT '0',
  `pki_type` enum('item','heading','note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `pki_product_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pki_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `pki_quantity` decimal(12,2) DEFAULT NULL COMMENT 'ว่าง = แถวหัวข้อ/หมายเหตุ',
  `pki_unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pki_unit_price` decimal(15,2) DEFAULT NULL COMMENT 'บาท — ใช้เมื่อแถวนี้ไม่ได้อ้างสินค้า',
  PRIMARY KEY (`pki_id`),
  KEY `idx_pki_package` (`pki_package_id`,`pki_order`),
  KEY `fk_pki_product` (`pki_product_id`),
  CONSTRAINT `fk_pki_package` FOREIGN KEY (`pki_package_id`) REFERENCES `tb_product_packages` (`pkg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pki_product` FOREIGN KEY (`pki_product_id`) REFERENCES `tb_products` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กติกาอนุมัติหลายชั้นตามยอดเงิน (บันทึกทั้งชุดทีเดียว) — ชั้น 1 ยอดขั้นต่ำ 0 เสมอ · ยอดเทียบก่อน VAT เป็นบาท
-- ใบที่ส่งขออนุมัติแล้วเก็บแผนของตัวเองไว้ (qt_approval_plan) แก้กติกาทีหลังไม่กระทบใบที่รออยู่
CREATE TABLE IF NOT EXISTS `tb_approval_levels` (
  `al_doc_type` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'QT',
  `al_level` tinyint unsigned NOT NULL COMMENT '1..n',
  `al_min_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT (บาท) ตั้งแต่เท่านี้ต้องผ่านชั้นนี้',
  `al_require_distinct` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ต้องเป็นคนละคนกับผู้อนุมัติชั้นก่อนหน้าในรอบเดียวกัน',
  `al_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`al_doc_type`,`al_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- role ที่อนุมัติชั้นนั้นได้ (ชั้นหนึ่งหลาย role ได้) — ลบ role ที่อยู่ในกติกาไม่ได้ (FK ไม่ cascade, risk R6)
CREATE TABLE IF NOT EXISTS `tb_approval_level_roles` (
  `alr_doc_type` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL,
  `alr_level` tinyint unsigned NOT NULL,
  `alr_role_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`alr_doc_type`,`alr_level`,`alr_role_id`),
  KEY `fk_alr_role` (`alr_role_id`),
  CONSTRAINT `fk_alr_level` FOREIGN KEY (`alr_doc_type`,`alr_level`) REFERENCES `tb_approval_levels` (`al_doc_type`,`al_level`) ON DELETE CASCADE,
  CONSTRAINT `fk_alr_role` FOREIGN KEY (`alr_role_id`) REFERENCES `tb_roles` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบเสนอราคา
-- flow: draft → pending_approval (ชั้น 1..n) → approved (ได้เลขที่ + วันที่เอกสาร) → sent → accepted / declined / expired
--       ตีกลับ = กลับเป็น draft เริ่มชั้น 1 ใหม่รอบถัดไป · ยกเลิกได้ทุกสถานะยกเว้น accepted/cancelled/superseded
-- revision: แก้ใบที่อนุมัติแล้ว = แถวใหม่ (qt_revision + 1, qt_root_id เดิม) ใช้เลขที่เดิม · revision ใหม่อนุมัติ → ฉบับเก่า superseded
-- วันที่เอกสาร/ยืนราคาถึง ว่างจนกว่าจะอนุมัติชั้นสุดท้าย (วันที่เอกสาร = วันที่อนุมัติชั้นสุดท้าย ตามเวลาไทย ย้อนไม่ได้)
-- ผู้สร้าง/ผู้อนุมัติ/ผู้ยกเลิก ลบไม่ได้ (FK ไม่ cascade, risk R7) + เก็บชื่อและตำแหน่ง ณ ตอนนั้นไว้ในเอกสาร
-- qt_version เพิ่มทุกครั้งที่บันทึก — ส่งเลขที่เห็นมาด้วย ไม่ตรง = มีคนแก้ไปก่อน (risk R4)
CREATE TABLE IF NOT EXISTS `tb_quotations` (
  `qt_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qt_number` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ออกตอนอนุมัติชั้นสุดท้ายของ Rev.0 — revision ใช้เลขเดิม',
  `qt_revision` int unsigned NOT NULL DEFAULT '0',
  `qt_root_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ฉบับแรกของสายนี้ (ฉบับแรกชี้ตัวเอง)',
  `qt_previous_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ฉบับก่อนหน้าในสาย revision',
  `qt_copied_from_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'คัดลอกมาจากใบไหน (คนละสาย)',
  `qt_status` enum('draft','pending_approval','approved','sent','accepted','declined','expired','cancelled','superseded') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `qt_version` int unsigned NOT NULL DEFAULT '0',
  `qt_client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qt_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qt_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qt_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `qt_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `qt_exchange_rate` decimal(20,10) NOT NULL DEFAULT '1.0000000000' COMMENT 'บาทต่อ 1 หน่วยสกุลของเอกสาร — ล็อกตอนส่งขออนุมัติ',
  `qt_rate_source` enum('bot','manual') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = เอกสารบาท',
  `qt_rate_date` date DEFAULT NULL COMMENT 'วันที่ ธปท. ประกาศอัตราที่ใช้',
  `qt_rate_bot` decimal(20,10) DEFAULT NULL COMMENT 'อัตรา ธปท. ที่ดึงมา — เก็บไว้เทียบแม้ผู้ใช้แก้เอง',
  `qt_rate_override_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_vat_treatment` enum('standard','zero') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard' COMMENT 'zero = VAT 0% (ใช้ได้หลังจด VAT)',
  `qt_valid_days` int NOT NULL DEFAULT '30' COMMENT 'อายุยืนราคา (วัน) 1-365',
  `qt_issue_date` date DEFAULT NULL COMMENT 'วันที่เอกสาร = วันที่อนุมัติชั้นสุดท้าย (เวลาไทย)',
  `qt_valid_until` date DEFAULT NULL COMMENT 'วันที่เอกสาร + อายุยืนราคา',
  `qt_payment_mode` enum('single','milestones') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'single',
  `qt_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `qt_discount_type` enum('amount','percent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
  `qt_discount_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าที่ผู้ใช้กรอก (บาทหรือ %)',
  `qt_discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนลดท้ายบิลที่คำนวณแล้ว',
  `qt_after_discount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `qt_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT '0 = ไม่คิด VAT',
  `qt_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `qt_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `qt_after_discount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT เป็นบาท — ใช้เทียบเกณฑ์อนุมัติ',
  `qt_total_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `qt_terms` text COLLATE utf8mb4_unicode_ci,
  `qt_internal_note` text COLLATE utf8mb4_unicode_ci COMMENT 'บันทึกภายใน — ไม่แสดงบนเอกสารที่ส่งลูกค้า',
  `qt_client_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลลูกค้า ณ วันอนุมัติ',
  `qt_company_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลบริษัท + สาขา ณ วันอนุมัติ',
  `qt_approval_round` int unsigned NOT NULL DEFAULT '0' COMMENT 'ส่งขออนุมัติครั้งที่',
  `qt_approval_current_level` tinyint unsigned DEFAULT NULL COMMENT 'ชั้นที่รออยู่ (เฉพาะ pending_approval)',
  `qt_approval_plan` json DEFAULT NULL COMMENT 'ชั้น + role ที่ต้องผ่าน ณ ตอนส่งขออนุมัติ',
  `qt_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_created_by_title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อ role ณ ตอนส่งขออนุมัติ',
  `qt_creator_signature_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลายเซ็นผู้เสนอราคา ฉบับตอนส่งขออนุมัติ',
  `qt_submitted_at` datetime DEFAULT NULL,
  `qt_approved_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้อนุมัติชั้นสุดท้าย',
  `qt_approved_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_approved_by_title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_approver_signature_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_approved_at` datetime DEFAULT NULL,
  `qt_returned_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ตีกลับล่าสุด (ประวัติทั้งหมดใน tb_quotation_approvals)',
  `qt_sent_at` datetime DEFAULT NULL,
  `qt_responded_at` datetime DEFAULT NULL COMMENT 'เวลาที่บันทึกว่าลูกค้าตอบรับ/ปฏิเสธ',
  `qt_decline_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_expired_at` datetime DEFAULT NULL,
  `qt_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_cancelled_at` datetime DEFAULT NULL,
  `qt_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qt_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `qt_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`qt_id`),
  UNIQUE KEY `uq_qt_number_revision` (`qt_number`,`qt_revision`),
  KEY `idx_qt_status_valid_until` (`qt_status`,`qt_valid_until`),
  KEY `idx_qt_root` (`qt_root_id`),
  KEY `idx_qt_issue_date` (`qt_issue_date`),
  KEY `idx_qt_created_by_created` (`qt_created_by`,`qt_created_at`),
  KEY `fk_qt_client` (`qt_client_id`),
  KEY `fk_qt_branch` (`qt_branch_id`),
  KEY `fk_qt_project` (`qt_project_id`),
  KEY `fk_qt_currency` (`qt_currency`),
  KEY `fk_qt_previous` (`qt_previous_id`),
  KEY `fk_qt_copied_from` (`qt_copied_from_id`),
  KEY `fk_qt_creator_signature` (`qt_creator_signature_id`),
  KEY `fk_qt_approved_by` (`qt_approved_by`),
  KEY `fk_qt_approver_signature` (`qt_approver_signature_id`),
  KEY `fk_qt_cancelled_by` (`qt_cancelled_by`),
  CONSTRAINT `fk_qt_client` FOREIGN KEY (`qt_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_qt_branch` FOREIGN KEY (`qt_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_qt_project` FOREIGN KEY (`qt_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_qt_currency` FOREIGN KEY (`qt_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_qt_previous` FOREIGN KEY (`qt_previous_id`) REFERENCES `tb_quotations` (`qt_id`),
  CONSTRAINT `fk_qt_copied_from` FOREIGN KEY (`qt_copied_from_id`) REFERENCES `tb_quotations` (`qt_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_qt_created_by` FOREIGN KEY (`qt_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_qt_creator_signature` FOREIGN KEY (`qt_creator_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_qt_approved_by` FOREIGN KEY (`qt_approved_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_qt_approver_signature` FOREIGN KEY (`qt_approver_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_qt_cancelled_by` FOREIGN KEY (`qt_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการในใบเสนอราคา — แถว heading/note ไม่มีจำนวน/ราคา (ยอดเป็น 0) · ใบเก็บสำเนาของตัวเอง แก้สินค้าทีหลังใบไม่เปลี่ยน
-- สินค้าที่เคยใช้ในใบลบไม่ได้ (FK ไม่ cascade) · ชุดรายการลบได้ (แค่ข้อมูลว่ามาจากชุดไหน)
CREATE TABLE IF NOT EXISTS `tb_quotation_items` (
  `qti_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `qti_quotation_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qti_order` int NOT NULL DEFAULT '0',
  `qti_type` enum('item','heading','note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `qti_product_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qti_package_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qti_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `qti_quantity` decimal(12,2) DEFAULT NULL,
  `qti_unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qti_unit_price` decimal(15,2) DEFAULT NULL COMMENT 'สกุลเงินของใบ',
  `qti_list_price` decimal(15,2) DEFAULT NULL COMMENT 'ราคาตั้งต้นของสินค้า แปลงเป็นสกุลของใบ — ใช้ตรวจขายต่ำกว่าราคา',
  `qti_discount_type` enum('amount','percent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
  `qti_discount_value` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าที่ผู้ใช้กรอก (บาทหรือ %)',
  `qti_discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนลดบรรทัดที่คำนวณแล้ว',
  `qti_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จำนวน × ราคา − ส่วนลดบรรทัด',
  PRIMARY KEY (`qti_id`),
  KEY `idx_qti_quotation` (`qti_quotation_id`,`qti_order`),
  KEY `fk_qti_product` (`qti_product_id`),
  KEY `fk_qti_package` (`qti_package_id`),
  CONSTRAINT `fk_qti_quotation` FOREIGN KEY (`qti_quotation_id`) REFERENCES `tb_quotations` (`qt_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qti_product` FOREIGN KEY (`qti_product_id`) REFERENCES `tb_products` (`product_id`),
  CONSTRAINT `fk_qti_package` FOREIGN KEY (`qti_package_id`) REFERENCES `tb_product_packages` (`pkg_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- งวดชำระ — แบบครั้งเดียวก็มี 1 แถว (100%) ใบแจ้งหนี้ (ช่วง 1B) จะได้อ้างงวดเหมือนกันทุกกรณี
CREATE TABLE IF NOT EXISTS `tb_quotation_milestones` (
  `qtm_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `qtm_quotation_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qtm_order` int NOT NULL DEFAULT '0',
  `qtm_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เช่น มัดจำ, ส่งมอบงาน',
  `qtm_condition` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เงื่อนไขการเรียกเก็บ',
  `qtm_percent` decimal(5,2) DEFAULT NULL COMMENT 'ว่าง = ระบุเป็นจำนวนเงิน',
  `qtm_amount` decimal(15,2) NOT NULL COMMENT 'สกุลเงินของใบ · งวดสุดท้ายรับเศษปัด',
  PRIMARY KEY (`qtm_id`),
  KEY `idx_qtm_quotation` (`qtm_quotation_id`,`qtm_order`),
  CONSTRAINT `fk_qtm_quotation` FOREIGN KEY (`qtm_quotation_id`) REFERENCES `tb_quotations` (`qt_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการอนุมัติ/ตีกลับ ทุกชั้นทุกรอบ — กดครั้งเดียวผ่านหลายชั้น = หลายแถว · เก็บชื่อและ role ณ ตอนกด
CREATE TABLE IF NOT EXISTS `tb_quotation_approvals` (
  `qta_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `qta_quotation_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qta_round` int unsigned NOT NULL,
  `qta_level` tinyint unsigned NOT NULL,
  `qta_action` enum('approve','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `qta_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qta_user_name` varchar(101) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qta_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่',
  `qta_role_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qta_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qta_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`qta_id`),
  KEY `idx_qta_quotation` (`qta_quotation_id`,`qta_round`,`qta_level`),
  KEY `fk_qta_user` (`qta_user_id`),
  CONSTRAINT `fk_qta_quotation` FOREIGN KEY (`qta_quotation_id`) REFERENCES `tb_quotations` (`qt_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_qta_user` FOREIGN KEY (`qta_user_id`) REFERENCES `tb_users` (`user_id`)
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
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_type') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_type` enum(''juristic'',''individual'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''juristic'' COMMENT ''นิติบุคคล / บุคคลธรรมดา'' AFTER `client_phone`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_country') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_country` char(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''TH'' COMMENT ''ISO 3166 — เลขผู้เสียภาษีบังคับ 13 หลักเฉพาะ TH'' AFTER `client_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_tax_id') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_tax_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_country`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_branch_code') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_branch_code` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''สาขาของลูกค้า 00000 = สำนักงานใหญ่'' AFTER `client_tax_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_address') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_address` text COLLATE utf8mb4_unicode_ci COMMENT ''ที่อยู่สำหรับออกเอกสาร'' AFTER `client_branch_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_contact_name') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_contact_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `client_address`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_credit_days') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_credit_days` int DEFAULT NULL COMMENT ''เครดิตเทอม (วัน)'' AFTER `client_contact_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_wht_rate') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_wht_rate` decimal(5,2) DEFAULT NULL COMMENT ''อัตราหัก ณ ที่จ่ายเริ่มต้น (%)'' AFTER `client_credit_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_currency') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' COMMENT ''สกุลเงินเริ่มต้นของใบเสนอราคา'' AFTER `client_wht_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_language') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_language` enum(''th'',''en'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''th'' COMMENT ''ภาษาเอกสารเริ่มต้น'' AFTER `client_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_vat_treatment') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_vat_treatment` enum(''standard'',''zero'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''standard'' COMMENT ''การคิด VAT เริ่มต้น'' AFTER `client_language`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_status') = 0, 'ALTER TABLE `tb_clients` ADD COLUMN `client_status` enum(''active'',''inactive'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' COMMENT ''inactive = เลือกในเอกสารใหม่ไม่ได้'' AFTER `client_vat_treatment`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

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
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND COLUMN_NAME = 'task_quotation_item_id') = 0, 'ALTER TABLE `tb_tasks` ADD COLUMN `task_quotation_item_id` bigint unsigned DEFAULT NULL COMMENT ''สร้างจากรายการไหนของใบเสนอราคา (ตอนลูกค้าตอบรับ)'' AFTER `task_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

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
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND COLUMN_NAME = 'user_branch_id') = 0, 'ALTER TABLE `tb_users` ADD COLUMN `user_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''สาขาเริ่มต้นของเอกสารที่ผู้ใช้นี้สร้าง (แก้ในเอกสารได้) — ว่าง = สำนักงานใหญ่'' AFTER `user_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ข้อความแชท/ตอบกลับต้องเป็น NULL ได้ (ส่งรูปล้วนๆ ไม่มีข้อความ) — ฐานข้อมูลรุ่นแรกอาจเป็น NOT NULL
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_chat_messages' AND COLUMN_NAME = 'message_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_task_chat_messages` MODIFY COLUMN `message_text` text COLLATE utf8mb4_unicode_ci', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_chat_messages' AND COLUMN_NAME = 'message_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_project_chat_messages` MODIFY COLUMN `message_text` text COLLATE utf8mb4_unicode_ci', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_issue_replies' AND COLUMN_NAME = 'reply_text' AND IS_NULLABLE = 'NO') > 0, 'ALTER TABLE `tb_task_issue_replies` MODIFY COLUMN `reply_text` text COLLATE utf8mb4_unicode_ci COMMENT ''ว่างได้ถ้าตอบกลับด้วยรูปแนบล้วนๆ ไม่มีข้อความ (เหมือน tb_task_chat_messages)''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- 2026-10-13 ลูกค้าต่างประเทศ: เลขผู้เสียภาษียาวได้ถึง 30 ตัว (ฐานข้อมูล dev ที่เคยรันร่าง 8 ต.ค. เป็น varchar(13))
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND COLUMN_NAME = 'client_tax_id' AND CHARACTER_MAXIMUM_LENGTH < 30) > 0, 'ALTER TABLE `tb_clients` MODIFY COLUMN `client_tax_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

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
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND INDEX_NAME = 'fk_user_branch') = 0, 'ALTER TABLE `tb_users` ADD KEY `fk_user_branch` (`user_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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
-- tb_clients
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND INDEX_NAME = 'fk_client_currency') = 0, 'ALTER TABLE `tb_clients` ADD KEY `fk_client_currency` (`client_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND INDEX_NAME = 'fk_task_quotation_item') = 0, 'ALTER TABLE `tb_tasks` ADD KEY `fk_task_quotation_item` (`task_quotation_item_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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
-- สกุลเงินเริ่มต้น THB + USD (2026-10-13) — ต้องมีก่อนเพิ่ม FK สกุลเงินของลูกค้า (ลูกค้าเดิมทุกรายได้ค่าเริ่มต้น THB)
-- ใส่เฉพาะตอนตารางยังว่าง · ข้อมูลเริ่มต้นอื่นอยู่ส่วนที่ 5
INSERT INTO tb_currencies (cur_code, cur_name_th, cur_name_en, cur_symbol, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en, cur_subunit_en, cur_bot_unit, cur_sort_order)
SELECT 'THB', 'บาท', 'Thai Baht', '฿', 2, 'บาท', 'สตางค์', 'Baht', 'Satang', 1, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_currencies)
UNION ALL
SELECT 'USD', 'ดอลลาร์สหรัฐ', 'US Dollar', '$', 2, 'ดอลลาร์สหรัฐ', 'เซนต์', 'US Dollars', 'Cents', 1, 2
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_currencies);

-- tb_roles
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND CONSTRAINT_NAME = 'fk_role_department' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_roles` ADD CONSTRAINT `fk_role_department` FOREIGN KEY (`role_department`) REFERENCES `tb_department` (`dep_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND CONSTRAINT_NAME = 'fk_role_granted_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_roles` ADD CONSTRAINT `fk_role_granted_by` FOREIGN KEY (`role_granted_by_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_users
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND CONSTRAINT_NAME = 'fk_user_role' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_users` ADD CONSTRAINT `fk_user_role` FOREIGN KEY (`user_role_id`) REFERENCES `tb_roles` (`role_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_users' AND CONSTRAINT_NAME = 'fk_user_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_users` ADD CONSTRAINT `fk_user_branch` FOREIGN KEY (`user_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_login_logs
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_login_logs' AND CONSTRAINT_NAME = 'fk_log_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_login_logs` ADD CONSTRAINT `fk_log_user` FOREIGN KEY (`log_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_clients
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_clients' AND CONSTRAINT_NAME = 'fk_client_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_clients` ADD CONSTRAINT `fk_client_currency` FOREIGN KEY (`client_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_tasks' AND CONSTRAINT_NAME = 'fk_task_quotation_item' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_tasks` ADD CONSTRAINT `fk_task_quotation_item` FOREIGN KEY (`task_quotation_item_id`) REFERENCES `tb_quotation_items` (`qti_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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

-- role Admin เปิดทุกบิต (29 บิต) — role ระบบ (S) ได้สิทธิ์ครบเสมออยู่แล้วไม่ว่าสตริงจะยาวเท่าไร (effectiveRolePermission)
-- role อื่นที่สตริงสั้นกว่าจำนวนบิตปัจจุบัน ถือว่าบิตใหม่ = 0 (ไม่ได้สิทธิ์ใหม่เอง ต้องมีคนติ๊กให้)
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
SELECT 'ROL202601010000001', 'Admin', '11111111111111111111111111111', 'S'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_roles);

-- ผู้ใช้คนแรก: admin (หรือ admin@softwork.local) / Admin@12345 — ระบบบังคับเปลี่ยนรหัสผ่านตอน login ครั้งแรก
-- (2026-10-12, risk-fixes R23: เดิมเป็น FALSE ทำให้ระบบที่ติดตั้งใหม่ใช้รหัสที่ทุกคนรู้ได้ตลอด · มีผลเฉพาะฐานข้อมูลว่าง)
INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
SELECT 'USE202601010000001', 'admin', 'admin@softwork.local', '$2a$10$UnrGKjjYX4uf1ojXLAPNOOdAT26aZg/eVmTDGvv2wWF95gYoQ5G0K',
       'System', 'Admin', 'ROL202601010000001', TRUE
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_users)
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_id = 'ROL202601010000001');

-- ตำแหน่ง PM เปิดทุกบิต (29 บิต) — project.controller.js หาตำแหน่งชื่อ 'PM' ไปให้ผู้สร้างโปรเจกต์อัตโนมัติ
INSERT INTO tb_project_positions (position_id, position_name, position_permission)
SELECT 'POS202601010000001', 'PM', '11111111111111111111111111111'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_project_positions);

-- ── วงจรขาย 1A (2026-10-13) — ใส่เฉพาะตอนตารางยังว่าง ──
-- ข้อมูลบริษัท: แถวเดียว cs_id = 1 (ชื่อ/ที่อยู่ให้แอดมินกรอกในหน้าตั้งค่า)
INSERT INTO tb_company_settings (cs_id, cs_quotation_terms_th, cs_quotation_terms_en)
SELECT 1,
       '1. ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม (ถ้ามี)\n2. ใบเสนอราคานี้มีผลถึงวันที่ระบุ',
       '1. Prices exclude VAT (if applicable).\n2. This quotation is valid until the date stated.'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_company_settings);

-- อัตรา VAT ทั่วไป 7% — ใช้เมื่อบริษัทจด VAT แล้วเท่านั้น (cs_vat_registered_from) · อัตราใหม่ในอนาคตเพิ่มแถวพร้อมวันที่มีผล
INSERT INTO tb_vat_rates (vr_effective_from, vr_rate, vr_note)
SELECT '2000-01-01', 7.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_vat_rates);

-- สำนักงานใหญ่ (รหัสสาขา 00000)
INSERT INTO tb_branches (branch_id, branch_code, branch_name_th, branch_name_en)
SELECT 'BRA202601010000001', '00000', 'สำนักงานใหญ่', 'Head Office'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_branches);

-- กติกาอนุมัติเริ่มต้น: ชั้นเดียว ยอดตั้งแต่ 0 บาท ผู้อนุมัติ = role ระบบ (ระบบใช้งานได้ทันทีหลัง deploy)
-- เลือก role ระบบจาก role_type ไม่ผูก id ตายตัว เผื่อฐานข้อมูลที่ role แรกไม่ได้มาจาก seed
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct)
SELECT 'QT', 1, 0.00, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_approval_levels WHERE al_doc_type = 'QT');

INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id)
SELECT 'QT', 1, (SELECT role_id FROM tb_roles WHERE role_type = 'S' ORDER BY role_id LIMIT 1)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tb_approval_level_roles WHERE alr_doc_type = 'QT')
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_type = 'S');

-- ─── ส่วนที่ 6: ตรวจสอบ — ไม่มีแถวผลลัพธ์ = โครงสร้างครบถ้วนตามไฟล์นี้ ─────────────────────────────
-- มีแถว = ตารางนั้นมีคอลัมน์/index ไม่ตรงกับที่คาด (missing_* คือที่ขาด, extra_* คือที่เกินมาจากของเก่า)
SELECT e.table_name,
       IF(a.table_name IS NULL, 'ไม่มีตารางนี้', NULL) AS problem,
       e.expected_columns, a.actual_columns,
       e.expected_indexes, a.actual_indexes
FROM (
              SELECT 'tb_department' AS table_name, 'dep_created_at,dep_id,dep_name,dep_status,dep_updated_at' AS expected_columns, 'primary(dep_id),uq_dep_name(dep_name)' AS expected_indexes
    UNION ALL SELECT 'tb_roles' AS table_name, 'role_department,role_granted_at,role_granted_by_id,role_id,role_name,role_permission,role_type,role_update_at' AS expected_columns, 'fk_role_department(role_department),fk_role_granted_by(role_granted_by_id),primary(role_id),uq_role_name(role_name)' AS expected_indexes
    UNION ALL SELECT 'tb_users' AS table_name, 'user_avatar_url,user_branch_id,user_created_at,user_email,user_fname,user_id,user_last_login_at,user_line_uid,user_lname,user_must_change_password,user_password,user_phone,user_role_id,user_status,user_updated_at,user_username,user_whatsapp_no' AS expected_columns, 'fk_user_branch(user_branch_id),idx_user_role(user_role_id),primary(user_id),uq_user_email(user_email),uq_user_username(user_username)' AS expected_indexes
    UNION ALL SELECT 'tb_maxID' AS table_name, 'max_id,max_table' AS expected_columns, 'primary(max_table)' AS expected_indexes
    UNION ALL SELECT 'tb_login_logs' AS table_name, 'log_action,log_created_at,log_email,log_fullname,log_id,log_ip_address,log_user_agent,log_user_id' AS expected_columns, 'idx_log_created(log_created_at),idx_log_user(log_user_id),primary(log_id)' AS expected_indexes
    UNION ALL SELECT 'tb_email_otps' AS table_name, 'otp_attempts,otp_code_hash,otp_created_at,otp_email,otp_expires_at,otp_id,otp_purpose,otp_used_at,otp_user_id' AS expected_columns, 'fk_otp_user(otp_user_id),idx_otp_expires(otp_expires_at),idx_otp_lookup(otp_email+otp_purpose+otp_created_at),primary(otp_id)' AS expected_indexes
    UNION ALL SELECT 'tb_audit_logs' AS table_name, 'aud_action,aud_changes,aud_created_at,aud_duration_ms,aud_entity_id,aud_entity_type,aud_error,aud_event,aud_id,aud_ip,aud_method,aud_path,aud_payload,aud_project_id,aud_request_id,aud_role_name,aud_status,aud_success,aud_user_agent,aud_user_fullname,aud_user_id,aud_user_username' AS expected_columns, 'idx_aud_created(aud_created_at),idx_aud_entity(aud_entity_type+aud_entity_id),idx_aud_event_created(aud_event+aud_created_at),idx_aud_project_created(aud_project_id+aud_created_at),idx_aud_request(aud_request_id),idx_aud_user_created(aud_user_id+aud_created_at),primary(aud_id)' AS expected_indexes
    UNION ALL SELECT 'tb_error_logs' AS table_name, 'err_count,err_fingerprint,err_first_seen,err_id,err_last_ip,err_last_request_id,err_last_seen,err_last_user_id,err_message,err_method,err_path,err_stack,err_status' AS expected_columns, 'idx_err_last_seen(err_last_seen),primary(err_id),uq_err_fingerprint(err_fingerprint)' AS expected_indexes
    UNION ALL SELECT 'tb_project_positions' AS table_name, 'position_created_at,position_id,position_name,position_permission,position_status,position_updated_at' AS expected_columns, 'primary(position_id),uq_position_name(position_name)' AS expected_indexes
    UNION ALL SELECT 'tb_clients' AS table_name, 'client_address,client_branch_code,client_company,client_contact_name,client_country,client_created_at,client_credit_days,client_currency,client_email,client_id,client_language,client_name,client_phone,client_status,client_tax_id,client_type,client_updated_at,client_vat_treatment,client_wht_rate' AS expected_columns, 'fk_client_currency(client_currency),primary(client_id)' AS expected_indexes
    UNION ALL SELECT 'tb_projects' AS table_name, 'client_id,project_completed_at,project_created_at,project_created_by,project_description,project_due_date,project_id,project_name,project_progress_percent,project_share_enabled,project_share_token,project_start_date,project_status,project_type,project_updated_at,project_use_task_weight' AS expected_columns, 'fk_project_creator(project_created_by),idx_project_client(client_id),idx_project_due_date(project_due_date),idx_project_status(project_status),idx_project_type(project_type),primary(project_id),uq_project_share_token(project_share_token)' AS expected_indexes
    UNION ALL SELECT 'tb_project_members' AS table_name, 'joined_at,project_id,project_member_id,user_id' AS expected_columns, 'idx_pm_user(user_id),primary(project_member_id),uq_project_member(project_id+user_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_member_positions' AS table_name, 'position_id,project_member_id' AS expected_columns, 'fk_pmp_position(position_id),primary(project_member_id+position_id)' AS expected_indexes
    UNION ALL SELECT 'tb_tasks' AS table_name, 'project_id,task_completed_at,task_created_at,task_description,task_due_date,task_id,task_parent_id,task_quotation_item_id,task_sort_order,task_start_date,task_status,task_title,task_updated_at,task_weight' AS expected_columns, 'fk_task_quotation_item(task_quotation_item_id),idx_task_due_date(task_due_date),idx_task_parent(task_parent_id),idx_task_project(project_id),idx_task_status_completed(task_status+task_completed_at),primary(task_id)' AS expected_indexes
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
    UNION ALL SELECT 'tb_currencies' AS table_name, 'cur_bot_unit,cur_code,cur_created_at,cur_decimals,cur_name_en,cur_name_th,cur_sort_order,cur_status,cur_subunit_en,cur_subunit_th,cur_symbol,cur_unit_en,cur_unit_th,cur_updated_at' AS expected_columns, 'primary(cur_code)' AS expected_indexes
    UNION ALL SELECT 'tb_company_settings' AS table_name, 'cs_address_en,cs_address_th,cs_allow_self_approval,cs_email,cs_id,cs_logo_url,cs_name_en,cs_name_th,cs_phone,cs_quotation_terms_en,cs_quotation_terms_th,cs_quotation_valid_days,cs_tax_id,cs_updated_at,cs_vat_registered_from,cs_website' AS expected_columns, 'primary(cs_id)' AS expected_indexes
    UNION ALL SELECT 'tb_vat_rates' AS table_name, 'vr_created_at,vr_created_by,vr_effective_from,vr_note,vr_rate' AS expected_columns, 'fk_vr_created_by(vr_created_by),primary(vr_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_branches' AS table_name, 'branch_address_en,branch_address_th,branch_code,branch_created_at,branch_id,branch_name_en,branch_name_th,branch_phone,branch_status,branch_updated_at' AS expected_columns, 'primary(branch_id),uq_branch_code(branch_code)' AS expected_indexes
    UNION ALL SELECT 'tb_bank_accounts' AS table_name, 'ba_account_name,ba_account_no,ba_bank_branch,ba_bank_name,ba_created_at,ba_currency,ba_id,ba_is_default,ba_status,ba_swift_code,ba_updated_at' AS expected_columns, 'fk_ba_currency(ba_currency),primary(ba_id)' AS expected_indexes
    UNION ALL SELECT 'tb_document_sequences' AS table_name, 'ds_date,ds_doc_type,ds_last' AS expected_columns, 'primary(ds_doc_type+ds_date)' AS expected_indexes
    UNION ALL SELECT 'tb_exchange_rates' AS table_name, 'er_buying_sight,er_buying_transfer,er_currency,er_fetched_at,er_mid_rate,er_rate_date,er_selling' AS expected_columns, 'primary(er_currency+er_rate_date)' AS expected_indexes
    UNION ALL SELECT 'tb_user_signatures' AS table_name, 'sig_created_at,sig_file_path,sig_id,sig_method,sig_revoked_at,sig_revoked_by,sig_user_id' AS expected_columns, 'fk_sig_revoked_by(sig_revoked_by),idx_sig_user_active(sig_user_id+sig_revoked_at),primary(sig_id)' AS expected_indexes
    UNION ALL SELECT 'tb_product_categories' AS table_name, 'pc_created_at,pc_id,pc_name,pc_sort_order,pc_status,pc_updated_at' AS expected_columns, 'primary(pc_id),uq_pc_name(pc_name)' AS expected_indexes
    UNION ALL SELECT 'tb_products' AS table_name, 'product_category_id,product_code,product_created_at,product_description,product_id,product_name,product_price,product_status,product_unit,product_updated_at' AS expected_columns, 'fk_product_category(product_category_id),idx_product_name(product_name),primary(product_id),uq_product_code(product_code)' AS expected_indexes
    UNION ALL SELECT 'tb_product_packages' AS table_name, 'pkg_category_id,pkg_created_at,pkg_description,pkg_id,pkg_name,pkg_status,pkg_updated_at' AS expected_columns, 'fk_pkg_category(pkg_category_id),primary(pkg_id)' AS expected_indexes
    UNION ALL SELECT 'tb_product_package_items' AS table_name, 'pki_description,pki_id,pki_order,pki_package_id,pki_product_id,pki_quantity,pki_type,pki_unit,pki_unit_price' AS expected_columns, 'fk_pki_product(pki_product_id),idx_pki_package(pki_package_id+pki_order),primary(pki_id)' AS expected_indexes
    UNION ALL SELECT 'tb_approval_levels' AS table_name, 'al_doc_type,al_level,al_min_amount_thb,al_require_distinct,al_updated_at' AS expected_columns, 'primary(al_doc_type+al_level)' AS expected_indexes
    UNION ALL SELECT 'tb_approval_level_roles' AS table_name, 'alr_doc_type,alr_level,alr_role_id' AS expected_columns, 'fk_alr_role(alr_role_id),primary(alr_doc_type+alr_level+alr_role_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotations' AS table_name, 'qt_after_discount,qt_after_discount_thb,qt_approval_current_level,qt_approval_plan,qt_approval_round,qt_approved_at,qt_approved_by,qt_approved_by_name,qt_approved_by_title,qt_approver_signature_id,qt_branch_id,qt_cancel_reason,qt_cancelled_at,qt_cancelled_by,qt_client_id,qt_client_snapshot,qt_company_snapshot,qt_copied_from_id,qt_created_at,qt_created_by,qt_created_by_name,qt_created_by_title,qt_creator_signature_id,qt_currency,qt_decline_reason,qt_discount_amount,qt_discount_type,qt_discount_value,qt_exchange_rate,qt_expired_at,qt_id,qt_internal_note,qt_issue_date,qt_language,qt_number,qt_payment_mode,qt_previous_id,qt_project_id,qt_rate_bot,qt_rate_date,qt_rate_override_reason,qt_rate_source,qt_responded_at,qt_returned_reason,qt_revision,qt_root_id,qt_sent_at,qt_status,qt_submitted_at,qt_subtotal,qt_terms,qt_title,qt_total,qt_total_thb,qt_updated_at,qt_valid_days,qt_valid_until,qt_vat_amount,qt_vat_rate,qt_vat_treatment,qt_version' AS expected_columns, 'fk_qt_approved_by(qt_approved_by),fk_qt_approver_signature(qt_approver_signature_id),fk_qt_branch(qt_branch_id),fk_qt_cancelled_by(qt_cancelled_by),fk_qt_client(qt_client_id),fk_qt_copied_from(qt_copied_from_id),fk_qt_creator_signature(qt_creator_signature_id),fk_qt_currency(qt_currency),fk_qt_previous(qt_previous_id),fk_qt_project(qt_project_id),idx_qt_created_by_created(qt_created_by+qt_created_at),idx_qt_issue_date(qt_issue_date),idx_qt_root(qt_root_id),idx_qt_status_valid_until(qt_status+qt_valid_until),primary(qt_id),uq_qt_number_revision(qt_number+qt_revision)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_items' AS table_name, 'qti_amount,qti_description,qti_discount_amount,qti_discount_type,qti_discount_value,qti_id,qti_list_price,qti_order,qti_package_id,qti_product_id,qti_quantity,qti_quotation_id,qti_type,qti_unit,qti_unit_price' AS expected_columns, 'fk_qti_package(qti_package_id),fk_qti_product(qti_product_id),idx_qti_quotation(qti_quotation_id+qti_order),primary(qti_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_milestones' AS table_name, 'qtm_amount,qtm_condition,qtm_id,qtm_name,qtm_order,qtm_percent,qtm_quotation_id' AS expected_columns, 'idx_qtm_quotation(qtm_quotation_id+qtm_order),primary(qtm_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_approvals' AS table_name, 'qta_action,qta_created_at,qta_id,qta_level,qta_quotation_id,qta_reason,qta_role_id,qta_role_name,qta_round,qta_user_id,qta_user_name' AS expected_columns, 'fk_qta_user(qta_user_id),idx_qta_quotation(qta_quotation_id+qta_round+qta_level),primary(qta_id)' AS expected_indexes
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
