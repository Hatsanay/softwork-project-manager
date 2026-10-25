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
--   backend/src/shared/permissions.mjs + frontend/app/components/bit.tsx (role, 54 บิต, append-only)
--   backend/src/utils/projectPermissions.js + frontend/app/components/project-position-bits.ts (position, 29 บิต)

CREATE TABLE IF NOT EXISTS `tb_department` (
  `dep_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dep_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dep_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'สาขาที่แผนกสังกัด',
  `dep_abbr` char(3) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ตัวย่อ 3 ตัว A-Z 0-9 — แก้ได้เฉพาะตอนแผนกยังไม่มีพนักงาน',
  `dep_code` char(8) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'รหัสแผนก = รหัสสาขา + ตัวย่อ (ส่วนหน้าของรหัสพนักงาน)',
  `dep_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `dep_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `dep_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`dep_id`),
  UNIQUE KEY `uq_dep_code` (`dep_code`),
  UNIQUE KEY `uq_dep_branch_name` (`dep_branch_id`,`dep_name`),
  KEY `fk_dep_branch` (`dep_branch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_roles` (
  `role_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role_permission` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
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
  `project_channel` enum('direct','fastwork') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'direct' COMMENT 'ช่องทางงาน: direct = ลูกค้าตรง (ใบเสนอราคา/ใบแจ้งหนี้) · fastwork = รับงานผ่าน fastwork.com (รายได้จากการโอนของแพลตฟอร์ม)',
  `project_fastwork_order_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขคำสั่งซื้อบน Fastwork',
  `project_fastwork_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลิงก์หน้างานบน Fastwork',
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
  `cs_fastwork_fee_rate` decimal(5,2) NOT NULL DEFAULT '17.00' COMMENT 'ค่าธรรมเนียม Fastwork เริ่มต้น (% ของราคางวด) · แก้ได้ทุกรายการ · ตรวจอัตราจริงในบัญชี Fastwork',
  `cs_fastwork_fee_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'VAT ของค่าธรรมเนียม Fastwork (% ของค่าธรรมเนียม) · 0 = ไม่มี',
  `cs_fastwork_wht_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายที่ Fastwork หัก (% ของราคางวด) · รอนักบัญชียืนยัน Z2',
  `cs_incorporated_on` date DEFAULT NULL COMMENT 'วันที่จดบริษัท (นิติบุคคล) · ว่าง = ยังเป็นบุคคลธรรมดา (ช่วงก่อนจดบริษัท)',
  `cs_capital_goal` decimal(15,2) DEFAULT NULL COMMENT 'เป้าเงินทุนก่อนจดบริษัท · ว่าง = ยังไม่ตั้ง',
  `cs_capital_target_date` date DEFAULT NULL COMMENT 'วันที่ตั้งใจจดบริษัท (ไม่บังคับ)',
  `cs_service_request_assignee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้รับคำขอบริการเริ่มต้น (ลิงก์ที่ไม่ได้เลือกคนเอง)',
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
  `pc_is_single_choice` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ลูกค้าเลือกได้รายการเดียวในหมวดนี้ เช่น แพ็กเกจ (ใส่อันใหม่ = แทนอันเดิมในตะกร้า)',
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
  `product_is_public` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)',
  `product_price_mode` enum('fixed','percent') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fixed' COMMENT 'percent = คิดเป็น % ของยอดรายการอื่นก่อน VAT เช่น งานด่วน +30%',
  `product_percent` decimal(5,2) DEFAULT NULL COMMENT 'percent: อัตรา % (ไม่ใช้ product_price)',
  `product_image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปบนหน้าร้าน (/uploads/catalog/...)',
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
  `pkg_is_public` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)',
  `pkg_image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปบนหน้าร้าน (/uploads/catalog/...)',
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

-- งวดชำระ — ทุกใบมีอย่างน้อย 1 แถว: เก็บเงินครั้งเดียว = แถว "ชำระเต็มจำนวน" 100% (บันทึกโดย backend ไม่แสดงในฟอร์ม)
-- ใบแจ้งหนี้ (ช่วง 1B) จึงอ้างงวดได้เหมือนกันทุกกรณี · งวดที่ออกบิลแล้วลบไม่ได้ (tb_invoice_milestones)
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

-- ════ วงจรขาย ช่วง 1B (2026-10-14) — ใบแจ้งหนี้ + ใบวางบิล · แบบระบบ: docs/plans/2026-10-14-invoices-1b.md ════════
-- ใบแจ้งหนี้ (ยังไม่ใช่ใบกำกับภาษี — บริษัทยังไม่จด VAT · ใบกำกับภาษีออกแบบก่อนวันจด ตามคำตอบนักบัญชี B1)
-- flow: draft → (ใบสร้างเอง: pending_approval ชั้น 1..n) → issued (ได้เลขที่ + วันที่ + ครบกำหนด) → cancelled
--       ใบที่ออกจากงวดของใบเสนอราคาไม่ต้องอนุมัติ (ยอดผ่านการอนุมัติในใบเสนอราคาแล้ว) · ใบสร้างเองอนุมัติตามกติกา 'IV'
-- "เกินกำหนด" ไม่เก็บ — คำนวณตอนอ่านจาก inv_due_date เทียบวันนี้ (เวลาไทย) · ยอดรับแล้ว (inv_paid_amount) เริ่มใช้ช่วง 1C
-- วันที่/ครบกำหนด/อัตราแลกเปลี่ยน/VAT คิดตอนกดออกเท่านั้น (ร่างค้างข้ามวันไม่ได้วันที่เก่า)
-- ผู้สร้าง/ผู้ออก/ผู้ยกเลิก ลบไม่ได้ (FK ไม่ cascade, risk R7) + เก็บชื่อ ณ ตอนนั้นไว้ในเอกสาร
CREATE TABLE IF NOT EXISTS `tb_invoices` (
  `inv_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IV-yyyymmdd-xxxxxx ออกตอนออกใบ — ยกเลิกแล้วเลขยังอยู่',
  `inv_status` enum('draft','pending_approval','issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `inv_version` int unsigned NOT NULL DEFAULT '0',
  `inv_source` enum('quotation','manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'quotation = ออกจากงวดของใบเสนอราคา (ยอดล็อก) · manual = สร้างเอง (ต้องอนุมัติ)',
  `inv_quotation_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_reissued_from_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ออกใหม่แทนใบที่ยกเลิกใบไหน',
  `inv_doc_type` enum('invoice','debit_note') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invoice' COMMENT 'debit_note = ใบเพิ่มหนี้ อ้างใบเดิม (2026-10-18 ขั้น N-2)',
  `inv_reference_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: ใบแจ้งหนี้ที่อ้างอิง',
  `inv_original_total` decimal(15,2) DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: มูลค่าที่ถูกต้องเดิม (รวม VAT) ณ ตอนออก = ใบที่อ้างอิงหลังลดหนี้ + ใบเพิ่มหนี้ที่ออกก่อนหน้า',
  `inv_adjust_reason_code` enum('price_increase','scope_increase','error','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: รหัสเหตุผล',
  `inv_adjust_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: เหตุผล (กฎหมายบังคับ)',
  `inv_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_language` enum('th','en') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `inv_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `inv_exchange_rate` decimal(20,10) NOT NULL DEFAULT '1.0000000000' COMMENT 'บาทต่อ 1 หน่วย ณ วันที่ออก — ใช้คิดยอดบาทภายใน',
  `inv_rate_source` enum('bot','manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = เอกสารบาท',
  `inv_rate_date` date DEFAULT NULL,
  `inv_rate_bot` decimal(20,10) DEFAULT NULL,
  `inv_rate_override_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_vat_treatment` enum('standard','zero') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `inv_credit_days` int NOT NULL DEFAULT '30' COMMENT 'เครดิตเทอม (วัน) 0-365',
  `inv_issue_date` date DEFAULT NULL COMMENT 'วันที่ออก (เวลาไทย) ย้อนไม่ได้',
  `inv_due_date` date DEFAULT NULL COMMENT 'วันที่ออก + เครดิต',
  `inv_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_discount_type` enum('amount','percent') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
  `inv_discount_value` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_after_discount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT',
  `inv_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `inv_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_after_discount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT เป็นบาท — ใช้เทียบเกณฑ์อนุมัติ (ใบสร้างเอง)',
  `inv_total_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_wht_rate` decimal(5,2) DEFAULT NULL COMMENT 'อัตราหัก ณ ที่จ่ายที่แสดงบนใบ — ว่าง = ไม่แสดง (ยอดหักจริงบันทึกตอนรับเงิน 1C)',
  `inv_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ประมาณการ = ยอดก่อน VAT × อัตรา',
  `inv_paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดรับชำระแล้ว (ช่วง 1C)',
  `inv_credited_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดของใบลดหนี้ที่ออกแล้ว (2026-10-18)',
  `inv_credited_base` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนก่อน VAT ของใบลดหนี้ที่ออกแล้ว',
  `inv_credited_vat` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วน VAT ของใบลดหนี้ที่ออกแล้ว',
  `inv_credited_base_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนก่อน VAT เป็นบาทของใบลดหนี้ที่ออกแล้ว',
  `inv_credited_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดบาทของใบลดหนี้ที่ออกแล้ว',
  `inv_credited_wht` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายประมาณการส่วนที่ลดแล้ว',
  `inv_refunded_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'คืนเงินลูกค้าแล้วตามใบลดหนี้ (โอนคืน + หัก ณ ที่จ่ายที่ไม่ต้องคืน)',
  `inv_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุที่พิมพ์บนเอกสาร',
  `inv_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'บันทึกภายใน — ไม่พิมพ์',
  `inv_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีรับเงินที่พิมพ์บนใบ',
  `inv_client_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลลูกค้า ณ วันออก',
  `inv_company_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลบริษัท + สาขา ณ วันออก',
  `inv_bank_snapshot` json DEFAULT NULL COMMENT 'บัญชีรับเงิน + พร้อมเพย์ ณ วันออก',
  `inv_approval_round` int unsigned NOT NULL DEFAULT '0',
  `inv_approval_current_level` tinyint unsigned DEFAULT NULL,
  `inv_approval_plan` json DEFAULT NULL,
  `inv_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_submitted_at` datetime DEFAULT NULL,
  `inv_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้กดออก (ใบสร้างเอง = ผู้อนุมัติชั้นสุดท้าย)',
  `inv_issued_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_issued_by_title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_issuer_signature_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลายเซ็นผู้ออก ฉบับตอนออก',
  `inv_issued_at` datetime DEFAULT NULL,
  `inv_sent_at` datetime DEFAULT NULL,
  `inv_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_cancelled_at` datetime DEFAULT NULL,
  `inv_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `inv_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`inv_id`),
  UNIQUE KEY `uq_inv_number` (`inv_number`),
  KEY `idx_inv_status_due` (`inv_status`,`inv_due_date`),
  KEY `idx_inv_issue_date` (`inv_issue_date`),
  KEY `idx_inv_client_status` (`inv_client_id`,`inv_status`),
  KEY `idx_inv_created_by_created` (`inv_created_by`,`inv_created_at`),
  KEY `fk_inv_quotation` (`inv_quotation_id`),
  KEY `fk_inv_project` (`inv_project_id`),
  KEY `fk_inv_branch` (`inv_branch_id`),
  KEY `fk_inv_currency` (`inv_currency`),
  KEY `fk_inv_reissued_from` (`inv_reissued_from_id`),
  KEY `fk_inv_reference` (`inv_reference_invoice_id`),
  KEY `fk_inv_bank_account` (`inv_bank_account_id`),
  KEY `fk_inv_issued_by` (`inv_issued_by`),
  KEY `fk_inv_issuer_signature` (`inv_issuer_signature_id`),
  KEY `fk_inv_cancelled_by` (`inv_cancelled_by`),
  CONSTRAINT `fk_inv_bank_account` FOREIGN KEY (`inv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_inv_branch` FOREIGN KEY (`inv_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_inv_cancelled_by` FOREIGN KEY (`inv_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_inv_client` FOREIGN KEY (`inv_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_inv_created_by` FOREIGN KEY (`inv_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_inv_currency` FOREIGN KEY (`inv_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_inv_issued_by` FOREIGN KEY (`inv_issued_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_inv_issuer_signature` FOREIGN KEY (`inv_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_inv_project` FOREIGN KEY (`inv_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_inv_quotation` FOREIGN KEY (`inv_quotation_id`) REFERENCES `tb_quotations` (`qt_id`),
  CONSTRAINT `fk_inv_reissued_from` FOREIGN KEY (`inv_reissued_from_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_inv_reference` FOREIGN KEY (`inv_reference_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการในใบแจ้งหนี้ — รูปแบบเดียวกับรายการใบเสนอราคา · ใบจากงวด = บรรทัดละงวด (ราคา = ยอดก่อน VAT ของงวด)
CREATE TABLE IF NOT EXISTS `tb_invoice_items` (
  `invi_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `invi_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `invi_order` int NOT NULL DEFAULT '0',
  `invi_type` enum('item','heading','note') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `invi_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invi_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `invi_quantity` decimal(12,2) DEFAULT NULL,
  `invi_unit` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invi_unit_price` decimal(15,2) DEFAULT NULL,
  `invi_list_price` decimal(15,2) DEFAULT NULL,
  `invi_discount_type` enum('amount','percent') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
  `invi_discount_value` decimal(15,2) NOT NULL DEFAULT '0.00',
  `invi_discount_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `invi_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`invi_id`),
  KEY `idx_invi_invoice` (`invi_invoice_id`,`invi_order`),
  KEY `fk_invi_product` (`invi_product_id`),
  CONSTRAINT `fk_invi_invoice` FOREIGN KEY (`invi_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invi_product` FOREIGN KEY (`invi_product_id`) REFERENCES `tb_products` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- งวดของใบเสนอราคาที่ใบแจ้งหนี้นี้เรียกเก็บ — ใช้กันออกงวดซ้ำ (งวดหนึ่งอยู่ในใบที่ไม่ยกเลิกได้ใบเดียว ตรวจใน backend
-- โดยล็อกแถวใบเสนอราคา) · ยอดก่อน VAT/VAT ของแต่ละงวดคงที่ตั้งแต่ใบเสนอราคา (shared/invoice-totals.mjs) ผลรวมทุกใบตรงพอดี
CREATE TABLE IF NOT EXISTS `tb_invoice_milestones` (
  `ivm_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ivm_milestone_id` bigint unsigned NOT NULL,
  `ivm_amount` decimal(15,2) NOT NULL COMMENT 'ยอดงวดตามใบเสนอราคา (รวม VAT ของใบเสนอราคา)',
  `ivm_base` decimal(15,2) NOT NULL COMMENT 'ส่วนที่เป็นยอดก่อน VAT',
  `ivm_vat` decimal(15,2) NOT NULL COMMENT 'ส่วนที่เป็น VAT ตามใบเสนอราคา',
  PRIMARY KEY (`ivm_invoice_id`,`ivm_milestone_id`),
  KEY `fk_ivm_milestone` (`ivm_milestone_id`),
  CONSTRAINT `fk_ivm_invoice` FOREIGN KEY (`ivm_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ivm_milestone` FOREIGN KEY (`ivm_milestone_id`) REFERENCES `tb_quotation_milestones` (`qtm_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการอนุมัติ/ตีกลับของใบแจ้งหนี้ที่สร้างเอง — รูปแบบเดียวกับ tb_quotation_approvals
CREATE TABLE IF NOT EXISTS `tb_invoice_approvals` (
  `inva_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inva_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_round` int unsigned NOT NULL,
  `inva_level` tinyint unsigned NOT NULL,
  `inva_action` enum('approve','return') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่',
  `inva_role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`inva_id`),
  KEY `idx_inva_invoice` (`inva_invoice_id`,`inva_round`,`inva_level`),
  KEY `fk_inva_user` (`inva_user_id`),
  CONSTRAINT `fk_inva_invoice` FOREIGN KEY (`inva_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inva_user` FOREIGN KEY (`inva_user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบวางบิล — รวมใบแจ้งหนี้ที่ออกแล้วของลูกค้ารายเดียว สกุลเงินเดียว + วันนัดชำระ · ไม่ต้องอนุมัติ
-- flow: draft → issued (ได้เลข BN + วันที่) → cancelled (ใบแจ้งหนี้ในใบนี้กลับมาเลือกใหม่ได้)
CREATE TABLE IF NOT EXISTS `tb_billing_notes` (
  `bn_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'BN-yyyymmdd-xxxxxx ออกตอนออกใบ',
  `bn_status` enum('draft','issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `bn_version` int unsigned NOT NULL DEFAULT '0',
  `bn_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `bn_language` enum('th','en') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `bn_issue_date` date DEFAULT NULL,
  `bn_payment_date` date DEFAULT NULL COMMENT 'วันนัดชำระ (ลูกค้านัด)',
  `bn_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดใบแจ้งหนี้ ณ ตอนออก',
  `bn_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `bn_client_snapshot` json DEFAULT NULL,
  `bn_company_snapshot` json DEFAULT NULL,
  `bn_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_issued_at` datetime DEFAULT NULL,
  `bn_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_cancelled_at` datetime DEFAULT NULL,
  `bn_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `bn_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`bn_id`),
  UNIQUE KEY `uq_bn_number` (`bn_number`),
  KEY `idx_bn_client_status` (`bn_client_id`,`bn_status`),
  KEY `idx_bn_issue_date` (`bn_issue_date`),
  KEY `fk_bn_branch` (`bn_branch_id`),
  KEY `fk_bn_currency` (`bn_currency`),
  KEY `fk_bn_created_by` (`bn_created_by`),
  KEY `fk_bn_cancelled_by` (`bn_cancelled_by`),
  CONSTRAINT `fk_bn_branch` FOREIGN KEY (`bn_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_bn_cancelled_by` FOREIGN KEY (`bn_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_bn_client` FOREIGN KEY (`bn_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_bn_created_by` FOREIGN KEY (`bn_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_bn_currency` FOREIGN KEY (`bn_currency`) REFERENCES `tb_currencies` (`cur_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบแจ้งหนี้ในใบวางบิล — ใบหนึ่งอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ใบเดียว (ตรวจใน backend) · เก็บยอด ณ ตอนออก
CREATE TABLE IF NOT EXISTS `tb_billing_note_invoices` (
  `bni_billing_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bni_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `bni_order` int NOT NULL DEFAULT '0',
  `bni_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`bni_billing_note_id`,`bni_invoice_id`),
  KEY `fk_bni_invoice` (`bni_invoice_id`),
  CONSTRAINT `fk_bni_billing_note` FOREIGN KEY (`bni_billing_note_id`) REFERENCES `tb_billing_notes` (`bn_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_bni_invoice` FOREIGN KEY (`bni_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ ช่วง 1C (2026-10-15) — ใบเสร็จรับเงิน · แบบระบบ: docs/plans/2026-10-15-receipts-1c.md ════
-- ใบเสร็จ = รับเงินจากลูกค้ารายเดียว สกุลเดียว ตัดได้หลายใบแจ้งหนี้ / รับบางส่วนได้ · ไม่มีร่าง (บันทึก = ออกทันที)
-- สมการ (สกุลของใบ): ยอดตัดหนี้รวม = เงินเข้าจริง + หัก ณ ที่จ่าย + ค่าธรรมเนียม — backend คำนวณเงินเข้าเอง
-- ออกแล้วแก้ได้เฉพาะข้อมูล 50 ทวิ + บันทึกภายใน · ยกเลิกแล้วยอดรับแล้วของใบแจ้งหนี้ลดกลับ (เลขยังอยู่)
CREATE TABLE IF NOT EXISTS `tb_receipts` (
  `rc_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RE-yyyymmdd-xxxxxx วันที่ในเลข = วันที่ใบเสร็จ',
  `rc_status` enum('issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `rc_version` int unsigned NOT NULL DEFAULT '0',
  `rc_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `rc_language` enum('th','en') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `rc_receipt_date` date NOT NULL COMMENT 'วันที่ได้รับเงิน (ย้อนหลังได้ไม่เกิน 30 วัน)',
  `rc_method` enum('transfer','cheque','cash','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีที่เงินเข้า (บังคับเมื่อโอน)',
  `rc_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น',
  `rc_cheque_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cheque_bank` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cheque_date` date DEFAULT NULL,
  `rc_allocated_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดตัดหนี้',
  `rc_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายที่ลูกค้าหักจริง',
  `rc_fee_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าธรรมเนียมที่ถูกหักก่อนเงินเข้า',
  `rc_received_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินเข้าจริง (สกุลของใบ) = ตัดหนี้ - หัก - ค่าธรรมเนียม',
  `rc_received_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดบาทที่เข้าบัญชีจริง (บาท = เท่า received)',
  `rc_actual_rate` decimal(20,10) DEFAULT NULL COMMENT 'อัตราจริง = received_thb / received (สกุลต่างประเทศ)',
  `rc_allocated_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้เป็นบาทตามอัตราของใบแจ้งหนี้',
  `rc_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนต่างอัตรา บวก = กำไร',
  `rc_wht_certificate_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่ใน 50 ทวิ',
  `rc_wht_certificate_date` date DEFAULT NULL,
  `rc_wht_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไฟล์ 50 ทวิ ใต้ backend/storage (ไม่ใช่ /uploads สาธารณะ)',
  `rc_wht_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อไฟล์เดิมที่ผู้ใช้อัปโหลด',
  `rc_wht_file_uploaded_at` datetime DEFAULT NULL,
  `rc_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `rc_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `rc_billing_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บันทึกจากใบวางบิลไหน (อ้างอิงเท่านั้น)',
  `rc_client_snapshot` json DEFAULT NULL,
  `rc_company_snapshot` json DEFAULT NULL,
  `rc_bank_snapshot` json DEFAULT NULL,
  `rc_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้รับเงิน',
  `rc_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cancelled_at` datetime DEFAULT NULL,
  `rc_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rc_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rc_id`),
  UNIQUE KEY `uq_rc_number` (`rc_number`),
  KEY `idx_rc_client_status` (`rc_client_id`,`rc_status`),
  KEY `idx_rc_receipt_date` (`rc_receipt_date`),
  KEY `fk_rc_branch` (`rc_branch_id`),
  KEY `fk_rc_currency` (`rc_currency`),
  KEY `fk_rc_bank_account` (`rc_bank_account_id`),
  KEY `fk_rc_billing_note` (`rc_billing_note_id`),
  KEY `fk_rc_created_by` (`rc_created_by`),
  KEY `fk_rc_cancelled_by` (`rc_cancelled_by`),
  CONSTRAINT `fk_rc_bank_account` FOREIGN KEY (`rc_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_rc_billing_note` FOREIGN KEY (`rc_billing_note_id`) REFERENCES `tb_billing_notes` (`bn_id`),
  CONSTRAINT `fk_rc_branch` FOREIGN KEY (`rc_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_rc_cancelled_by` FOREIGN KEY (`rc_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_rc_client` FOREIGN KEY (`rc_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_rc_created_by` FOREIGN KEY (`rc_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_rc_currency` FOREIGN KEY (`rc_currency`) REFERENCES `tb_currencies` (`cur_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบแจ้งหนี้ที่ใบเสร็จตัด · inv_paid_amount = ผลรวม rca_amount ของใบเสร็จที่ไม่ยกเลิก (ปรับใน transaction เดียวกัน)
-- rca_vat_amount / rca_amount_thb: ครั้งที่ทำให้ใบชำระครบรับเศษ → ผลรวมทุกครั้ง = VAT / ยอดบาทของใบพอดี (เตรียมใบกำกับภาษี B1)
CREATE TABLE IF NOT EXISTS `tb_receipt_allocations` (
  `rca_receipt_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rca_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rca_order` int NOT NULL DEFAULT '0',
  `rca_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้ใบนี้ (สกุลของใบ)',
  `rca_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'VAT ส่วนที่รับครั้งนี้',
  `rca_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดเป็นบาทตามอัตราของใบแจ้งหนี้',
  `rca_credited_before` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดใบลดหนี้ของใบแจ้งหนี้ ณ ตอนออกใบเสร็จ (2026-10-18 — คงค้างบนใบเสร็จไม่เปลี่ยนภายหลัง)',
  PRIMARY KEY (`rca_receipt_id`,`rca_invoice_id`),
  KEY `fk_rca_invoice` (`rca_invoice_id`),
  CONSTRAINT `fk_rca_invoice` FOREIGN KEY (`rca_invoice_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_rca_receipt` FOREIGN KEY (`rca_receipt_id`) REFERENCES `tb_receipts` (`rc_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประเภทเงินได้ที่บริษัทหัก ณ ที่จ่ายผู้อื่น — แถวบนหนังสือรับรอง 50 ทวิ (1–6 ตามแบบกรมสรรพากร)
-- อัตราแยกไว้ใน tb_wht_rates ตามวันที่มีผล (แผนแม่บทหลักการข้อ 4 — อัตราเปลี่ยนได้ เอกสารเก่าต้องใช้อัตรา ณ วันนั้น)
CREATE TABLE IF NOT EXISTS `tb_wht_income_types` (
  `wit_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เช่น SERVICE, ADVERTISING — ใช้อ้างในโค้ด เปลี่ยนไม่ได้',
  `wit_name_th` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wit_name_en` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wit_form_row` tinyint unsigned NOT NULL DEFAULT '5' COMMENT 'แถวบน 50 ทวิ: 1 เงินเดือน 2 ค่าธรรมเนียม/นายหน้า 3 ค่าลิขสิทธิ์ 4 ดอกเบี้ย/ปันผล 5 ตามมาตรา 3 เตรส 6 อื่นๆ',
  `wit_form_label` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ข้อความประเภทเงินได้ที่พิมพ์บน 50 ทวิ',
  `wit_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `wit_sort_order` int NOT NULL DEFAULT '0',
  `wit_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `wit_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตราหัก ณ ที่จ่ายตามวันที่มีผล — อัตราที่มีผลแล้ว (วันนี้หรือก่อน) แก้/ลบไม่ได้ (แบบ tb_vat_rates)
CREATE TABLE IF NOT EXISTS `tb_wht_rates` (
  `wr_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wr_effective_from` date NOT NULL,
  `wr_rate` decimal(5,2) NOT NULL COMMENT 'เช่น 3.00',
  `wr_min_payment` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จ่ายต่อครั้ง (ก่อน VAT) ต่ำกว่านี้ไม่ต้องหัก — 0 = หักทุกยอด',
  `wr_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ที่มา เช่น เลขคำสั่งกรมสรรพากร',
  `wr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wr_income_type`,`wr_effective_from`),
  KEY `fk_wr_created_by` (`wr_created_by`),
  CONSTRAINT `fk_wr_created_by` FOREIGN KEY (`wr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wr_income_type` FOREIGN KEY (`wr_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมวดค่าใช้จ่าย — รหัสบัญชีว่างได้ (ผูกผังบัญชีในเฟส 3) · ประเภทเงินได้เริ่มต้น = เสนอหัก ณ ที่จ่ายอัตโนมัติ (ว่าง = ไม่หัก)
CREATE TABLE IF NOT EXISTS `tb_expense_categories` (
  `ec_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ec_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_account_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รหัสบัญชี (เฟส 3) — ตามผังบัญชีของนักบัญชี (คำถาม X6)',
  `ec_default_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_is_asset` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ของชิ้นใหญ่ ไว้ย้ายไปทะเบียนทรัพย์สิน (เฟส 6)',
  `ec_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ec_sort_order` int NOT NULL DEFAULT '0',
  `ec_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ec_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ec_id`),
  UNIQUE KEY `uq_ec_name_th` (`ec_name_th`),
  KEY `fk_ec_income_type` (`ec_default_income_type`),
  CONSTRAINT `fk_ec_income_type` FOREIGN KEY (`ec_default_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ผู้ขาย / ผู้รับเงิน — บุคคลธรรมดาในไทย → ภ.ง.ด.3 · นิติบุคคลในไทย → ภ.ง.ด.53 · ต่างประเทศ → ไม่ออก 50 ทวิ (คำถาม X2)
-- บัญชีธนาคารของผู้ขาย: แก้ได้เฉพาะสิทธิ์จัดการผู้ขาย · audit log เก็บค่าก่อน/หลัง (กันโกงเปลี่ยนบัญชีรับเงิน R-P6)
-- ลบได้เฉพาะที่ยังไม่มีเอกสาร — ที่ใช้แล้วให้ปิดใช้งาน
CREATE TABLE IF NOT EXISTS `tb_vendors` (
  `vd_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `vd_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รหัสสั้นตั้งเอง (ไม่บังคับ)',
  `vd_type` enum('juristic','individual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'juristic',
  `vd_country` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TH',
  `vd_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อตามเอกสารภาษี (บริษัท / ชื่อ-นามสกุล)',
  `vd_tax_id` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_branch_code` varchar(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '00000 = สำนักงานใหญ่',
  `vd_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่สำหรับ 50 ทวิ',
  `vd_contact_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_account_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_promptpay_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_credit_days` int DEFAULT NULL COMMENT 'ว่าง = ครบกำหนดวันที่เอกสาร',
  `vd_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `vd_default_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = ใช้ของหมวดค่าใช้จ่าย',
  `vd_default_category_id` int unsigned DEFAULT NULL,
  `vd_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `vd_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `vd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `vd_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`vd_id`),
  UNIQUE KEY `uq_vd_code` (`vd_code`),
  KEY `idx_vd_name` (`vd_name`),
  KEY `idx_vd_tax_id` (`vd_tax_id`),
  KEY `fk_vd_currency` (`vd_currency`),
  KEY `fk_vd_income_type` (`vd_default_income_type`),
  KEY `fk_vd_category` (`vd_default_category_id`),
  KEY `fk_vd_created_by` (`vd_created_by`),
  CONSTRAINT `fk_vd_category` FOREIGN KEY (`vd_default_category_id`) REFERENCES `tb_expense_categories` (`ec_id`),
  CONSTRAINT `fk_vd_created_by` FOREIGN KEY (`vd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_vd_currency` FOREIGN KEY (`vd_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_vd_income_type` FOREIGN KEY (`vd_default_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ขั้น 2-2 (2026-10-16): บันทึกค่าใช้จ่าย / บิลผู้ขาย (EX) และใบเบิกเงินพนักงาน (EC) — ตารางเดียว แยกด้วย ex_kind ──
-- flow: draft → (ส่ง) → ยอดก่อน VAT เป็นบาทต่ำกว่าชั้น 1 ของกติกา EX/EC = อนุมัติอัตโนมัติ · ไม่งั้น pending_approval ตามชั้น → approved (ได้เลขตอนนี้)
--       approved = "รอจ่าย" (เจ้าหนี้) · จ่ายแล้ว/บางส่วน/เกินกำหนด คำนวณตอนอ่านจาก ex_paid_amount (แบบใบแจ้งหนี้) · ยกเลิกพร้อมเหตุผล
-- VAT ซื้อบันทึกตามเอกสารของผู้ขาย (ไม่คำนวณใหม่) · ex_vat_claimable = จด VAT ณ วันที่เอกสาร + ใบกำกับเต็มรูป (คำถามนักบัญชี X3)
-- หัก ณ ที่จ่ายในใบนี้เป็นยอดประมาณ — หักจริงตอนทำจ่าย (ขั้น 2-4)
CREATE TABLE IF NOT EXISTS `tb_expenses` (
  `ex_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'EX-/EC-yyyymmdd-xxxxxx ได้ตอนอนุมัติครบ (หรือผ่านอัตโนมัติ) — ร่างไม่มีเลข ลบได้โดยเลขไม่ข้าม',
  `ex_kind` enum('bill','claim') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bill',
  `ex_status` enum('draft','pending_approval','approved','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `ex_version` int unsigned NOT NULL DEFAULT '0',
  `ex_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บิลผู้ขาย',
  `ex_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเบิก — ผู้เบิก (ผู้รับเงิน)',
  `ex_merchant_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเบิก — ชื่อร้าน/ผู้ขายตามใบเสร็จ (ผู้ขายนอกทะเบียน)',
  `ex_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_vendor_doc_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่เอกสารของผู้ขาย — ผู้ขายเดียวกันซ้ำในใบที่ไม่ยกเลิกไม่ได้ (R-P2)',
  `ex_vendor_doc_date` date DEFAULT NULL,
  `ex_doc_type` enum('tax_invoice','abbreviated_tax_invoice','receipt','invoice','substitute_receipt','none') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'receipt',
  `ex_expense_date` date NOT NULL COMMENT 'วันที่ค่าใช้จ่ายเกิด (วันที่ในเอกสาร/วันที่จ่ายไปก่อน)',
  `ex_credit_days` int NOT NULL DEFAULT '0',
  `ex_due_date` date NOT NULL COMMENT 'วันที่ค่าใช้จ่าย + เครดิต',
  `ex_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `ex_exchange_rate` decimal(20,10) NOT NULL DEFAULT '1.0000000000',
  `ex_rate_source` enum('bot','manual') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_rate_date` date DEFAULT NULL,
  `ex_rate_override_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT',
  `ex_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `ex_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ตามเอกสารผู้ขาย',
  `ex_vat_claimable` tinyint(1) NOT NULL DEFAULT '0',
  `ex_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_subtotal_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_total_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_wht_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_wht_rate` decimal(5,2) DEFAULT NULL,
  `ex_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ประมาณการ — หักจริงตอนทำจ่าย',
  `ex_paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมตัดหนี้ของใบสำคัญจ่ายที่ไม่ยกเลิก (ขั้น 2-4)',
  `ex_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `ex_approval_plan` json DEFAULT NULL,
  `ex_approval_round` int unsigned NOT NULL DEFAULT '0',
  `ex_approval_current_level` tinyint unsigned DEFAULT NULL,
  `ex_auto_approved` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ยอดต่ำกว่าวงเงินชั้น 1 ผ่านอัตโนมัติ (P2)',
  `ex_submitted_at` datetime DEFAULT NULL,
  `ex_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_approved_at` datetime DEFAULT NULL,
  `ex_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_cancelled_at` datetime DEFAULT NULL,
  `ex_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ex_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ex_id`),
  UNIQUE KEY `uq_ex_number` (`ex_number`),
  KEY `idx_ex_status_due` (`ex_status`,`ex_due_date`),
  KEY `idx_ex_vendor_doc` (`ex_vendor_id`,`ex_vendor_doc_no`),
  KEY `idx_ex_employee` (`ex_employee_id`,`ex_status`),
  KEY `idx_ex_expense_date` (`ex_expense_date`),
  KEY `fk_ex_branch` (`ex_branch_id`),
  KEY `fk_ex_currency` (`ex_currency`),
  KEY `fk_ex_income_type` (`ex_wht_income_type`),
  KEY `fk_ex_created_by` (`ex_created_by`),
  KEY `fk_ex_cancelled_by` (`ex_cancelled_by`),
  CONSTRAINT `fk_ex_branch` FOREIGN KEY (`ex_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_ex_cancelled_by` FOREIGN KEY (`ex_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ex_created_by` FOREIGN KEY (`ex_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ex_currency` FOREIGN KEY (`ex_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_ex_employee` FOREIGN KEY (`ex_employee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ex_income_type` FOREIGN KEY (`ex_wht_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`),
  CONSTRAINT `fk_ex_vendor` FOREIGN KEY (`ex_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บรรทัดค่าใช้จ่าย — หมวด + โปรเจกต์ (ว่าง = ส่วนกลาง P4) · ยอดไม่รวม VAT
CREATE TABLE IF NOT EXISTS `tb_expense_lines` (
  `exl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `exl_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exl_order` int NOT NULL DEFAULT '0',
  `exl_category_id` int unsigned NOT NULL,
  `exl_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exl_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exl_quantity` decimal(12,2) NOT NULL DEFAULT '1.00',
  `exl_unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `exl_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`exl_id`),
  KEY `idx_exl_expense` (`exl_expense_id`,`exl_order`),
  KEY `idx_exl_project` (`exl_project_id`),
  KEY `fk_exl_category` (`exl_category_id`),
  CONSTRAINT `fk_exl_category` FOREIGN KEY (`exl_category_id`) REFERENCES `tb_expense_categories` (`ec_id`),
  CONSTRAINT `fk_exl_expense` FOREIGN KEY (`exl_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exl_project` FOREIGN KEY (`exl_project_id`) REFERENCES `tb_projects` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์แนบ (ใบเสร็จ/ใบกำกับของผู้ขาย) — เก็บ backend/storage/expense-documents/ เปิดผ่าน API ตรวจสิทธิ์ (R-P7)
CREATE TABLE IF NOT EXISTS `tb_expense_attachments` (
  `exf_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `exf_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_size` int unsigned NOT NULL DEFAULT '0',
  `exf_uploaded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exf_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`exf_id`),
  KEY `idx_exf_expense` (`exf_expense_id`),
  KEY `fk_exf_uploaded_by` (`exf_uploaded_by`),
  CONSTRAINT `fk_exf_expense` FOREIGN KEY (`exf_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exf_uploaded_by` FOREIGN KEY (`exf_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติอนุมัติ/ตีกลับ — รูปแบบเดียวกับ tb_invoice_approvals
CREATE TABLE IF NOT EXISTS `tb_expense_approvals` (
  `expa_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `expa_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expa_round` int unsigned NOT NULL,
  `expa_level` tinyint unsigned NOT NULL,
  `expa_action` enum('approve','return') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `expa_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_role_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`expa_id`),
  KEY `idx_expa_expense` (`expa_expense_id`,`expa_round`,`expa_level`),
  KEY `fk_expa_user` (`expa_user_id`),
  CONSTRAINT `fk_expa_expense` FOREIGN KEY (`expa_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_expa_user` FOREIGN KEY (`expa_user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ขั้น 2-4 (2026-10-16): ทำจ่าย / ใบสำคัญจ่าย (PV) + หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ, WT) ──
-- แบบเดียวกับใบเสร็จ (1C) กลับด้าน: บันทึก = ออกเลขทันที (ไม่มีร่าง) · ยกเลิกพร้อมเหตุผล เลขยังอยู่ · 50 ทวิ ยกเลิกตาม
-- จ่ายหลายรายการของผู้รับรายเดียว สกุลเดียว ในครั้งเดียว · จ่ายบางส่วนได้ · ex_paid_amount ปรับใน transaction เดียวกัน
-- สมการ (สกุลของรายการ): ยอดตัดหนี้ = จ่ายผู้รับสุทธิ + หัก ณ ที่จ่าย · เงินออกจากบัญชี = จ่ายสุทธิ + ค่าธรรมเนียมโอน
CREATE TABLE IF NOT EXISTS `tb_payments` (
  `pv_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PV-yyyymmdd-xxxxxx วันที่ในเลข = วันที่จ่าย',
  `pv_status` enum('issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `pv_version` int unsigned NOT NULL DEFAULT '0',
  `pv_payee_kind` enum('vendor','employee') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `pv_payment_date` date NOT NULL COMMENT 'วันที่จ่าย (ย้อนหลังได้ไม่เกิน 30 วัน — อัตราหัก ณ ที่จ่ายใช้ของวันนี้)',
  `pv_method` enum('transfer','cheque','cash','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีบริษัทที่จ่ายออก (บังคับเมื่อโอน/เช็ค)',
  `pv_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น',
  `pv_cheque_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cheque_date` date DEFAULT NULL,
  `pv_allocated_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดตัดหนี้',
  `pv_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายจริง (= ยอดภาษีใน 50 ทวิ)',
  `pv_net_paid` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จ่ายผู้รับสุทธิ = ตัดหนี้ - หัก',
  `pv_fee_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าธรรมเนียมโอนที่บริษัทจ่ายเพิ่ม',
  `pv_allocated_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้เป็นบาทตามอัตราของรายการ',
  `pv_paid_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดบาทที่ออกจากบัญชีจริง (ไม่รวมค่าธรรมเนียม)',
  `pv_actual_rate` decimal(20,10) DEFAULT NULL COMMENT 'อัตราจริง = paid_thb / net_paid (สกุลต่างประเทศ)',
  `pv_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนต่างอัตรา บวก = กำไร (จ่ายบาทน้อยกว่าที่บันทึก)',
  `pv_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `pv_payee_snapshot` json DEFAULT NULL COMMENT 'ชื่อ/เลขผู้เสียภาษี/ที่อยู่/บัญชีผู้รับ ณ วันจ่าย (R-P6)',
  `pv_company_snapshot` json DEFAULT NULL,
  `pv_bank_snapshot` json DEFAULT NULL COMMENT 'บัญชีบริษัทที่จ่ายออก ณ วันจ่าย',
  `pv_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้ทำจ่าย',
  `pv_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cancelled_at` datetime DEFAULT NULL,
  `pv_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pv_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pv_id`),
  UNIQUE KEY `uq_pv_number` (`pv_number`),
  KEY `idx_pv_payment_date` (`pv_payment_date`),
  KEY `idx_pv_vendor` (`pv_vendor_id`,`pv_status`),
  KEY `idx_pv_employee` (`pv_employee_id`,`pv_status`),
  KEY `fk_pv_branch` (`pv_branch_id`),
  KEY `fk_pv_currency` (`pv_currency`),
  KEY `fk_pv_bank_account` (`pv_bank_account_id`),
  KEY `fk_pv_created_by` (`pv_created_by`),
  KEY `fk_pv_cancelled_by` (`pv_cancelled_by`),
  CONSTRAINT `fk_pv_bank_account` FOREIGN KEY (`pv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_pv_branch` FOREIGN KEY (`pv_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_pv_cancelled_by` FOREIGN KEY (`pv_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_pv_created_by` FOREIGN KEY (`pv_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_pv_currency` FOREIGN KEY (`pv_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_pv_employee` FOREIGN KEY (`pv_employee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_pv_vendor` FOREIGN KEY (`pv_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการที่ใบสำคัญจ่ายตัด · pva_base_amount = ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้ (ฐานหัก ณ ที่จ่าย — ครั้งที่ปิดรายการรับเศษ R-P5)
CREATE TABLE IF NOT EXISTS `tb_payment_allocations` (
  `pva_payment_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pva_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pva_order` int NOT NULL DEFAULT '0',
  `pva_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้รายการนี้ (สกุลของรายการ)',
  `pva_base_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้',
  `pva_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดเป็นบาทตามอัตราของรายการ',
  `pva_wht_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ประเภทเงินได้ของรายการ ณ วันจ่าย',
  PRIMARY KEY (`pva_payment_id`,`pva_expense_id`),
  KEY `fk_pva_expense` (`pva_expense_id`),
  CONSTRAINT `fk_pva_expense` FOREIGN KEY (`pva_expense_id`) REFERENCES `tb_expenses` (`ex_id`),
  CONSTRAINT `fk_pva_payment` FOREIGN KEY (`pva_payment_id`) REFERENCES `tb_payments` (`pv_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่บริษัทออก — ใบสำคัญจ่ายละไม่เกิน 1 ฉบับ · เลขรันต่อปี (เล่มที่ = ปี ค.ศ. — P5/X5)
-- ปีตามวันที่จ่าย (เวลาไทย) · เลขออกใน transaction เดียวกับใบสำคัญจ่าย (rollback แล้วเลขไม่ข้าม R-P3) · ยกเลิกแล้วเลขยังอยู่
CREATE TABLE IF NOT EXISTS `tb_wht_certificates` (
  `wt_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wt_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'WT-yyyy-xxxxxx',
  `wt_book_no` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เล่มที่ = ปี ค.ศ. ของวันที่จ่าย',
  `wt_sequence` int unsigned NOT NULL COMMENT 'เลขที่ในเล่ม',
  `wt_payment_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wt_form` enum('PND3','PND53') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ภ.ง.ด.3 บุคคลธรรมดา / 53 นิติบุคคล',
  `wt_payment_date` date NOT NULL,
  `wt_status` enum('issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `wt_total_paid` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินได้ที่จ่ายรวม (ฐาน)',
  `wt_total_tax` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ภาษีที่หักรวม',
  `wt_payer_snapshot` json DEFAULT NULL COMMENT 'บริษัท ณ วันจ่าย',
  `wt_payee_snapshot` json DEFAULT NULL COMMENT 'ผู้ถูกหัก ณ วันจ่าย',
  `wt_cancelled_at` datetime DEFAULT NULL,
  `wt_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wt_id`),
  UNIQUE KEY `uq_wt_number` (`wt_number`),
  UNIQUE KEY `uq_wt_payment` (`wt_payment_id`),
  KEY `idx_wt_form_date` (`wt_form`,`wt_payment_date`),
  CONSTRAINT `fk_wt_payment` FOREIGN KEY (`wt_payment_id`) REFERENCES `tb_payments` (`pv_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แถวเงินได้ในหนังสือรับรอง — เก็บอัตรา/ข้อความ ณ วันจ่าย (แก้ประเภทเงินได้ทีหลัง หนังสือเก่าไม่เปลี่ยน R-P4)
CREATE TABLE IF NOT EXISTS `tb_wht_certificate_lines` (
  `wtl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wtl_certificate_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_form_row` tinyint unsigned NOT NULL,
  `wtl_form_label` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_rate` decimal(5,2) NOT NULL,
  `wtl_paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินได้ที่จ่าย (ยอดก่อน VAT)',
  `wtl_tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`wtl_id`),
  KEY `idx_wtl_certificate` (`wtl_certificate_id`),
  KEY `fk_wtl_income_type` (`wtl_income_type`),
  CONSTRAINT `fk_wtl_certificate` FOREIGN KEY (`wtl_certificate_id`) REFERENCES `tb_wht_certificates` (`wt_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wtl_income_type` FOREIGN KEY (`wtl_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ เฟส 4 ขั้น 4-1 (2026-10-17) — บุคคล: พนักงาน + ค่าจ้างตามวันที่มีผล + ตั้งค่าเงินเดือน/วันหยุด/ประเภทลา · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md ════
-- พนักงาน ≠ ผู้ใช้ระบบ (H7) — ผูกบัญชีผู้ใช้ได้ไม่บังคับ · ฟรีแลนซ์ไม่ใช่พนักงาน (จ่ายผ่านค่าใช้จ่าย + 50 ทวิ ภ.ง.ด.3)
-- สถานะไม่เก็บเป็นคอลัมน์: พ้นสภาพ = มีวันทำงานวันสุดท้ายและเลยวันนั้นแล้ว (ตั้งล่วงหน้าได้ ยังทำงานอยู่จนถึงวันนั้น)
-- รับกลับเข้าทำงานหลังออกไปแล้ว = สร้างพนักงานใหม่ (รหัสใหม่) — ช่วงเวลาทำงานแต่ละช่วงต้องแยกกันเพื่อคิดเงินเดือน/อายุงาน
-- เลขประจำตัวประชาชน/บัญชีผู้ใช้ ห้ามซ้ำกับพนักงานที่ยังไม่พ้นสภาพ (ตรวจใน backend — คนเดิมกลับมาทำงานใหม่ใช้เลขเดิมได้)
CREATE TABLE IF NOT EXISTS `tb_employees` (
  `emp_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'รหัสพนักงาน ระบบออกให้: รหัสแผนก 8 + วันเริ่มงาน yymmdd + ลำดับ 4 (2026-10-18) — ย้ายแผนก/สาขา = รหัสใหม่ (ประวัติใน tb_employee_codes)',
  `emp_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีผู้ใช้ที่ผูก — ใช้ลงเวลา/ขอลา/ดูสลิปของตัวเอง',
  `emp_title` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'คำนำหน้า นาย/นาง/นางสาว — ใช้บน 50 ทวิ/ภ.ง.ด.1',
  `emp_first_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_last_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_first_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_last_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_nickname` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_national_id` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขประจำตัวประชาชน = เลขผู้เสียภาษี (ภ.ง.ด.1/50 ทวิ) — ต้องมีก่อนเข้ารอบเงินเดือน',
  `emp_birth_date` date DEFAULT NULL,
  `emp_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่สำหรับ 50 ทวิ ประจำปี',
  `emp_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_department_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'บังคับ (ประกอบรหัสพนักงาน) — สาขาของพนักงาน = สาขาของแผนก',
  `emp_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตำแหน่งงาน (ข้อความ) — คนละเรื่องกับตำแหน่งในโปรเจกต์',
  `emp_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_hire_date` date NOT NULL COMMENT 'วันเริ่มงาน = วันที่มีผลของค่าจ้างแถวแรก',
  `emp_termination_date` date DEFAULT NULL COMMENT 'วันทำงานวันสุดท้าย — หลังวันนี้ถือว่าพ้นสภาพ',
  `emp_termination_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_account_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_sso_enrolled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = ไม่เข้าประกันสังคม (เช่น อายุเกิน 60 ปีตอนเริ่มงาน) — ไม่หักทั้งสองฝ่าย',
  `emp_sso_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = ใช้เลขประจำตัวประชาชน',
  `emp_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `emp_photo_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปพนักงานสำหรับบัตร (/uploads/employees/...) — ว่าง = ใช้รูปโปรไฟล์บัญชีผู้ใช้ที่ผูก',
  `emp_close_login_on_termination` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ปิดการเข้าระบบของบัญชีที่ผูกหลังวันทำงานวันสุดท้าย (1 = ปิด · 2026-10-18)',
  `emp_attendance_required` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ต้องลงเวลาเข้า-ออกงานไหม (2026-10-23) · 0 = ไม่ต้อง เช่น ผู้บริหาร — ไม่นับสาย/ขาด',
  `emp_wfh_weekdays` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0000000' COMMENT 'วัน WFH ประจำ จันทร์→อาทิตย์ (1 = ทำงานที่บ้าน · 1111111 = WFH เต็มเวลา) · วัน WFH กดได้ทุกที่ (2026-10-24)',
  `emp_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `emp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`emp_id`),
  UNIQUE KEY `uq_emp_code` (`emp_code`),
  KEY `idx_emp_name` (`emp_first_name_th`,`emp_last_name_th`),
  KEY `idx_emp_national_id` (`emp_national_id`),
  KEY `idx_emp_termination` (`emp_termination_date`),
  KEY `fk_emp_user` (`emp_user_id`),
  KEY `fk_emp_department` (`emp_department_id`),
  KEY `fk_emp_branch` (`emp_branch_id`),
  KEY `fk_emp_created_by` (`emp_created_by`),
  CONSTRAINT `fk_emp_branch` FOREIGN KEY (`emp_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_emp_created_by` FOREIGN KEY (`emp_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_department` FOREIGN KEY (`emp_department_id`) REFERENCES `tb_department` (`dep_id`),
  CONSTRAINT `fk_emp_user` FOREIGN KEY (`emp_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เงินเดือนฐานตามวันที่มีผล — ขึ้นเงินเดือน = เพิ่มแถวใหม่ (ประวัติไม่หาย) · ค่าจ้าง ณ วันใด = แถวล่าสุดที่วันที่มีผล <= วันนั้น
-- แถวแรกมีผลวันเริ่มงานเสมอ (ลบไม่ได้) · ขั้น 4-4 จะล็อกแถวที่อยู่ในรอบเงินเดือนที่อนุมัติแล้ว
-- ประวัติรหัสพนักงาน + บัตรพนักงาน (2026-10-18)
CREATE TABLE IF NOT EXISTS `tb_employee_codes` (
  `ecd_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecd_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_department_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'แผนกตอนใช้รหัสนี้ (รหัสเดิมก่อนระบบใหม่อาจไม่มี)',
  `ecd_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_valid_from` date NOT NULL,
  `ecd_valid_to` date DEFAULT NULL COMMENT 'วันสุดท้ายที่ใช้รหัสนี้ · ว่าง = ใช้อยู่',
  `ecd_reason` enum('hire','correction','transfer','migration') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ecd_id`),
  UNIQUE KEY `uq_ecd_code` (`ecd_code`),
  KEY `idx_ecd_employee` (`ecd_employee_id`,`ecd_valid_to`),
  KEY `fk_ecd_department` (`ecd_department_id`),
  KEY `fk_ecd_branch` (`ecd_branch_id`),
  KEY `fk_ecd_created_by` (`ecd_created_by`),
  CONSTRAINT `fk_ecd_branch` FOREIGN KEY (`ecd_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_ecd_created_by` FOREIGN KEY (`ecd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ecd_department` FOREIGN KEY (`ecd_department_id`) REFERENCES `tb_department` (`dep_id`),
  CONSTRAINT `fk_ecd_employee` FOREIGN KEY (`ecd_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_employee_cards` (
  `ec_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ec_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_seq` smallint unsigned NOT NULL COMMENT 'บัตรใบที่ N ของพนักงานคนนี้',
  `ec_emp_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_th` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_en` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_department_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_branch_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_photo_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_reason` enum('first_issue','code_change','lost','damaged','info_change','expired') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_issued_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ec_expires_on` date NOT NULL COMMENT 'ใช้ได้ถึงวันนี้ = วันออก + อายุบัตรตามตั้งค่า ณ ตอนออก (snapshot)',
  `ec_printed_at` datetime DEFAULT NULL COMMENT 'พิมพ์ครั้งแรกเมื่อไร · ว่าง = รอพิมพ์',
  `ec_voided_at` datetime DEFAULT NULL COMMENT 'ยกเลิกเมื่อไร · ว่าง = ใบที่ใช้อยู่',
  `ec_void_reason` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_returned_at` datetime DEFAULT NULL COMMENT 'เก็บบัตรคืนแล้วเมื่อไร (บัตรที่ยกเลิก)',
  PRIMARY KEY (`ec_id`),
  UNIQUE KEY `uq_ec_employee_seq` (`ec_employee_id`,`ec_seq`),
  KEY `idx_ec_voided` (`ec_voided_at`,`ec_returned_at`),
  KEY `idx_ec_printed` (`ec_printed_at`),
  KEY `idx_ec_expires` (`ec_expires_on`),
  KEY `fk_ec_issued_by` (`ec_issued_by`),
  CONSTRAINT `fk_ec_employee` FOREIGN KEY (`ec_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ec_issued_by` FOREIGN KEY (`ec_issued_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_employee_compensations` (
  `ecm_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecm_effective_from` date NOT NULL,
  `ecm_base_salary` decimal(15,2) NOT NULL COMMENT 'เงินเดือนต่อเดือน (บาท)',
  `ecm_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผล เช่น ปรับประจำปี / ผ่านทดลองงาน',
  `ecm_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecm_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ecm_employee_id`,`ecm_effective_from`),
  KEY `fk_ecm_created_by` (`ecm_created_by`),
  CONSTRAINT `fk_ecm_created_by` FOREIGN KEY (`ecm_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ecm_employee` FOREIGN KEY (`ecm_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายรับ/รายหักประจำทุกเดือน (ค่าตำแหน่ง ค่าเดินทาง ผ่อนเงินกู้ ฯลฯ) ช่วงวันที่มีผล — รอบเงินเดือนดึงไปเป็นรายการของเดือนนั้น (ขั้น 4-4)
-- เปลี่ยนยอด = หยุดรายการเดิม (ตั้งวันสิ้นสุด) แล้วเพิ่มรายการใหม่ — ประวัติไม่หาย
-- คิดภาษี / นับเป็นค่าจ้างของประกันสังคม ใช้กับรายรับเท่านั้น (รายหักเป็น 0 เสมอ)
CREATE TABLE IF NOT EXISTS `tb_employee_recurring_items` (
  `eri_id` int unsigned NOT NULL AUTO_INCREMENT,
  `eri_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `eri_kind` enum('earning','deduction') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `eri_label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อที่พิมพ์บนสลิป',
  `eri_amount` decimal(15,2) NOT NULL COMMENT 'ต่อเดือน (บาท)',
  `eri_is_taxable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'รายรับนี้นับเป็นเงินได้คิดภาษี',
  `eri_is_sso_wage` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับนี้นับเป็นค่าจ้างของประกันสังคม (คำถามนักบัญชี Y1)',
  `eri_effective_from` date NOT NULL,
  `eri_effective_to` date DEFAULT NULL COMMENT 'วันสุดท้ายที่มีผล — ว่าง = ไม่มีกำหนด',
  `eri_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eri_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eri_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`eri_id`),
  KEY `idx_eri_employee` (`eri_employee_id`,`eri_effective_from`),
  KEY `fk_eri_created_by` (`eri_created_by`),
  CONSTRAINT `fk_eri_created_by` FOREIGN KEY (`eri_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_eri_employee` FOREIGN KEY (`eri_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตราประกันสังคมตามวันที่มีผล — ฐานค่าจ้างจำกัดระหว่างขั้นต่ำ–เพดาน × อัตรา (แผนแม่บทหลักการข้อ 4)
-- ต่างจากอัตรา VAT/หัก ณ ที่จ่าย: แก้/ลบได้จนกว่าจะมีรอบเงินเดือนที่อนุมัติใช้อัตรานั้น (ขั้น 4-4) — ค่าเริ่มต้นต้องให้นักบัญชียืนยันก่อน (Y1)
CREATE TABLE IF NOT EXISTS `tb_sso_rates` (
  `sr_effective_from` date NOT NULL,
  `sr_employee_rate` decimal(5,2) NOT NULL COMMENT 'ลูกจ้าง % ของฐานค่าจ้าง',
  `sr_employer_rate` decimal(5,2) NOT NULL COMMENT 'นายจ้าง % ของฐานค่าจ้าง',
  `sr_wage_floor` decimal(15,2) NOT NULL COMMENT 'ฐานค่าจ้างขั้นต่ำต่อเดือน',
  `sr_wage_ceiling` decimal(15,2) NOT NULL COMMENT 'ฐานค่าจ้างสูงสุดต่อเดือน',
  `sr_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ที่มา เช่น กฎกระทรวง',
  `sr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sr_effective_from`),
  KEY `fk_sr_created_by` (`sr_created_by`),
  CONSTRAINT `fk_sr_created_by` FOREIGN KEY (`sr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ปีภาษีเงินได้บุคคลธรรมดา — ค่าใช้จ่าย/ลดหย่อนส่วนตัวตามกฎหมายของปีนั้น · ปีที่ไม่มีแถว = ใช้ปีล่าสุดก่อนหน้า
-- ขั้นภาษีแยกตาราง tb_income_tax_brackets (ทั้งชุดต่อปี)
CREATE TABLE IF NOT EXISTS `tb_income_tax_years` (
  `ity_tax_year` smallint unsigned NOT NULL COMMENT 'ปี ค.ศ.',
  `ity_expense_rate` decimal(5,2) NOT NULL COMMENT 'หักค่าใช้จ่ายเงินได้ 40(1)(2) % ของเงินได้',
  `ity_expense_cap` decimal(15,2) NOT NULL COMMENT 'หักค่าใช้จ่ายได้สูงสุดต่อปี',
  `ity_personal_allowance` decimal(15,2) NOT NULL COMMENT 'ลดหย่อนส่วนตัว',
  `ity_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ity_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ity_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ity_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ity_tax_year`),
  KEY `fk_ity_created_by` (`ity_created_by`),
  CONSTRAINT `fk_ity_created_by` FOREIGN KEY (`ity_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ขั้นภาษี: เงินได้สุทธิส่วนที่เกิน itb_from_amount (จนถึงขั้นถัดไป) เสียภาษีอัตรา itb_rate · ขั้นแรกต้องเริ่มที่ 0
CREATE TABLE IF NOT EXISTS `tb_income_tax_brackets` (
  `itb_tax_year` smallint unsigned NOT NULL,
  `itb_from_amount` decimal(15,2) NOT NULL COMMENT 'เงินได้สุทธิตั้งแต่ (ส่วนที่เกินยอดนี้)',
  `itb_rate` decimal(5,2) NOT NULL,
  PRIMARY KEY (`itb_tax_year`,`itb_from_amount`),
  CONSTRAINT `fk_itb_tax_year` FOREIGN KEY (`itb_tax_year`) REFERENCES `tb_income_tax_years` (`ity_tax_year`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตั้งค่าเงินเดือน/เวลาทำงานของบริษัท — แถวเดียว ps_id = 1
-- วันทำงาน: 7 ตัว จันทร์→อาทิตย์ 1 = ทำงาน · ชั่วโมงมาตรฐานของเดือน = วันทำงาน (ไม่รวมวันหยุดบริษัท) × ชั่วโมงต่อวัน (H10)
CREATE TABLE IF NOT EXISTS `tb_payroll_settings` (
  `ps_id` tinyint unsigned NOT NULL,
  `ps_working_weekdays` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1111100' COMMENT 'จันทร์→อาทิตย์ 1 = วันทำงาน',
  `ps_hours_per_day` decimal(4,2) NOT NULL DEFAULT '8.00',
  `ps_pay_day` tinyint unsigned NOT NULL DEFAULT '25' COMMENT 'วันจ่ายเงินเดือน 1–31 — เดือนที่สั้นกว่าใช้วันสุดท้าย',
  `ps_unpaid_leave_divisor` enum('days_30','working_days') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'days_30' COMMENT 'หักลาไม่รับค่าจ้างต่อวัน = เงินเดือน ÷ 30 หรือ ÷ วันทำงานของเดือน (Y3)',
  `ps_timesheet_backdate_days` smallint unsigned NOT NULL DEFAULT '14' COMMENT 'ลงเวลาย้อนหลังได้กี่วัน (ขั้น 4-2)',
  `ps_card_valid_years` tinyint unsigned NOT NULL DEFAULT '3' COMMENT 'บัตรพนักงานใช้ได้กี่ปีนับจากวันออก (2026-10-18) — เปลี่ยนแล้วมีผลกับบัตรที่ออกหลังจากนั้น',
  `ps_default_schedule_id` int unsigned DEFAULT NULL COMMENT 'กะเริ่มต้นของพนักงานที่ยังไม่ได้กำหนดกะ (tb_work_schedules.ws_id · 2026-10-23)',
  `ps_timesheet_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'เปิดลงชั่วโมงต่อโปรเจกต์ (ขั้น 4-2) · 0 = ปิด ใช้ลงเวลาเข้า-ออกแทน (2026-10-23 ผู้ใช้สั่งปิด เปิดกลับได้)',
  `ps_attendance_start_date` date DEFAULT NULL COMMENT 'เริ่มใช้ลงเวลาเข้า-ออกงานตั้งแต่วันนี้ (2026-10-24) · วันก่อนหน้าไม่นับขาด/สาย · ว่าง = นับทุกวัน',
  `ps_ot_rate_workday` decimal(4,2) NOT NULL DEFAULT '1.50' COMMENT 'อัตรา OT วันทำงาน (เท่าของค่าจ้างต่อชั่วโมง · ม.61) — รอนักบัญชียืนยัน Y7',
  `ps_ot_rate_holiday_work` decimal(4,2) NOT NULL DEFAULT '1.00' COMMENT 'ทำงานวันหยุดในเวลาปกติ จ่ายเพิ่ม (เท่า · พนักงานรายเดือน ม.62)',
  `ps_ot_rate_holiday_ot` decimal(4,2) NOT NULL DEFAULT '3.00' COMMENT 'OT วันหยุด นอกเวลาปกติ (เท่า · ม.63)',
  `ps_ot_weekly_cap_hours` smallint unsigned NOT NULL DEFAULT '36' COMMENT 'OT + OT วันหยุด รวมไม่เกินกี่ชั่วโมงต่อสัปดาห์ (กฎกระทรวง 36)',
  `ps_ot_is_sso_wage` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'OT นับเป็นค่าจ้างคิดประกันสังคม (1 = นับ · รอนักบัญชียืนยัน Y5)',
  `ps_updated_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ps_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ps_id`),
  KEY `fk_ps_updated_by` (`ps_updated_by`),
  CONSTRAINT `fk_ps_updated_by` FOREIGN KEY (`ps_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- วันหยุดบริษัท (นักขัตฤกษ์/วันหยุดพิเศษ) — ไม่นับเป็นวันทำงานมาตรฐาน และไม่นับเป็นวันลา
CREATE TABLE IF NOT EXISTS `tb_company_holidays` (
  `hd_date` date NOT NULL,
  `hd_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `hd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hd_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hd_date`),
  KEY `fk_hd_created_by` (`hd_created_by`),
  CONSTRAINT `fk_hd_created_by` FOREIGN KEY (`hd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประเภทลา + โควตาต่อปี (ใช้ขั้น 4-3) — ปิดใช้งานแทนการลบ (ใบลาเก่ายังอ้างอยู่)
-- ต้องแนบไฟล์เมื่อลาตั้งแต่ N วันขึ้นไป (เช่น ลาป่วย 3 วัน) · ต้องทำงานครบกี่วันจึงใช้ได้ (เช่น พักร้อนหลังทำงานครบ 1 ปี)
CREATE TABLE IF NOT EXISTS `tb_leave_types` (
  `lt_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lt_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lt_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lt_days_per_year` decimal(5,1) DEFAULT NULL COMMENT 'โควตาวันต่อปี — ว่าง = ไม่จำกัด',
  `lt_is_paid` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = หักเงินเดือนตามจำนวนวันลา',
  `lt_attachment_from_days` decimal(5,1) DEFAULT NULL COMMENT 'ลาตั้งแต่กี่วันต้องแนบไฟล์ — ว่าง = ไม่ต้องแนบ',
  `lt_min_service_days` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'ต้องทำงานครบกี่วันจึงใช้ประเภทนี้ได้',
  `lt_carry_over_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT 'ยกวันที่เหลือไปปีถัดไปได้สูงสุด',
  `lt_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `lt_sort_order` int NOT NULL DEFAULT '0',
  `lt_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `lt_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lt_id`),
  UNIQUE KEY `uq_lt_name_th` (`lt_name_th`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ เฟส 4 ขั้น 4-2 (2026-10-17) — ลงเวลาทำงานรายสัปดาห์ · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.5 ════
-- ── ขั้น 4-2 (2026-10-17): ลงเวลาทำงานรายสัปดาห์ (จันทร์–อาทิตย์) ──
-- flow: draft → (พนักงานส่ง) submitted → ผู้อนุมัติแต่ละโปรเจกต์อนุมัติแถวของตัวเอง → อนุมัติครบทุกแถว = approved
--       ตีกลับแถวไหนก็ตาม = ทั้งสัปดาห์กลับเป็น returned + ล้างการอนุมัติทุกแถว (แก้แล้วส่งใหม่ทั้งสัปดาห์)
-- ผู้อนุมัติ: สิทธิ์ approveTimesheet (ทุกแถว) หรือสมาชิกโปรเจกต์ที่มีสิทธิ์ "จัดการสมาชิก" (เฉพาะแถวของโปรเจกต์นั้น) · อนุมัติของตัวเองไม่ได้
-- ขั้น 4-4 จะล็อกสัปดาห์ที่อยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว (ไม่ใช้สถานะแยก — ตรวจจากรอบเงินเดือน)
CREATE TABLE IF NOT EXISTS `tb_timesheet_weeks` (
  `tsw_id` int unsigned NOT NULL AUTO_INCREMENT,
  `tsw_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `tsw_week_start` date NOT NULL COMMENT 'วันจันทร์ของสัปดาห์',
  `tsw_status` enum('draft','submitted','approved','returned') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `tsw_version` int unsigned NOT NULL DEFAULT '0',
  `tsw_total_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `tsw_submitted_at` datetime DEFAULT NULL,
  `tsw_approved_at` datetime DEFAULT NULL COMMENT 'เวลาที่อนุมัติครบทุกแถว',
  `tsw_return_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tsw_returned_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tsw_returned_at` datetime DEFAULT NULL,
  `tsw_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `tsw_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tsw_id`),
  UNIQUE KEY `uq_tsw_employee_week` (`tsw_employee_id`,`tsw_week_start`),
  KEY `idx_tsw_status` (`tsw_status`,`tsw_week_start`),
  KEY `fk_tsw_returned_by` (`tsw_returned_by`),
  CONSTRAINT `fk_tsw_employee` FOREIGN KEY (`tsw_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_tsw_returned_by` FOREIGN KEY (`tsw_returned_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ชั่วโมงทำงานต่อวันต่อโปรเจกต์ (โปรเจกต์ว่าง = งานภายใน → ต้นทุนส่วนกลาง) · งานในโปรเจกต์ไม่บังคับ
-- โปรเจกต์ที่มีชั่วโมงลงไว้ลบไม่ได้ (FK ไม่ cascade — ใช้ยกเลิกโปรเจกต์แทน R-H10) · ลบงานแล้วชั่วโมงยังอยู่ที่โปรเจกต์ (SET NULL)
CREATE TABLE IF NOT EXISTS `tb_timesheet_entries` (
  `tse_id` int unsigned NOT NULL AUTO_INCREMENT,
  `tse_week_id` int unsigned NOT NULL,
  `tse_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ซ้ำกับสัปดาห์ — ใช้ค้นตามพนักงาน/วันโดยไม่ต้อง JOIN',
  `tse_date` date NOT NULL,
  `tse_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_task_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_hours` decimal(5,2) NOT NULL COMMENT 'ทีละ 0.25 ชั่วโมง',
  `tse_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_approved_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`tse_id`),
  KEY `idx_tse_project_date` (`tse_project_id`,`tse_date`),
  KEY `idx_tse_employee_date` (`tse_employee_id`,`tse_date`),
  KEY `fk_tse_week` (`tse_week_id`),
  KEY `fk_tse_task` (`tse_task_id`),
  KEY `fk_tse_approved_by` (`tse_approved_by`),
  CONSTRAINT `fk_tse_approved_by` FOREIGN KEY (`tse_approved_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tse_employee` FOREIGN KEY (`tse_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_tse_project` FOREIGN KEY (`tse_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_tse_task` FOREIGN KEY (`tse_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tse_week` FOREIGN KEY (`tse_week_id`) REFERENCES `tb_timesheet_weeks` (`tsw_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ บอร์ดงานแบบ Trello (2026-10-17) — ป้ายสีของโปรเจกต์ + checklist ในงาน · แบบ: docs/plans/2026-10-17-project-kanban.md ════

CREATE TABLE IF NOT EXISTS `tb_project_labels` (
  `pl_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pl_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pl_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pl_color` enum('green','yellow','orange','red','purple','blue','sky','lime','pink','black') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'blue',
  `pl_sort_order` int NOT NULL DEFAULT '0',
  `pl_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pl_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pl_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pl_id`),
  UNIQUE KEY `uq_pl_project_name` (`pl_project_id`,`pl_name`),
  KEY `fk_pl_created_by` (`pl_created_by`),
  CONSTRAINT `fk_pl_created_by` FOREIGN KEY (`pl_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pl_project` FOREIGN KEY (`pl_project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `tb_task_labels` (
  `tl_task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tl_label_id` int unsigned NOT NULL,
  PRIMARY KEY (`tl_task_id`,`tl_label_id`),
  KEY `fk_tl_label` (`tl_label_id`),
  CONSTRAINT `fk_tl_label` FOREIGN KEY (`tl_label_id`) REFERENCES `tb_project_labels` (`pl_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tl_task` FOREIGN KEY (`tl_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS `tb_task_checklist_items` (
  `tci_id` int unsigned NOT NULL AUTO_INCREMENT,
  `tci_task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tci_text` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tci_is_done` tinyint(1) NOT NULL DEFAULT '0',
  `tci_sort_order` int NOT NULL DEFAULT '0',
  `tci_done_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tci_done_at` datetime DEFAULT NULL,
  `tci_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tci_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tci_id`),
  KEY `idx_tci_task` (`tci_task_id`,`tci_sort_order`),
  KEY `fk_tci_done_by` (`tci_done_by`),
  KEY `fk_tci_created_by` (`tci_created_by`),
  CONSTRAINT `fk_tci_created_by` FOREIGN KEY (`tci_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tci_done_by` FOREIGN KEY (`tci_done_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tci_task` FOREIGN KEY (`tci_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ เฟส 4 ขั้น 4-3 (2026-10-17) — คำขอลา + ไฟล์แนบ · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.4 ════
-- ── ขั้น 4-3 (2026-10-17): คำขอลา ──
-- flow: draft (แนบไฟล์ได้) → pending (ส่งแล้ว) → approved / rejected · ดึงกลับ pending → draft ได้ · ยกเลิก = cancelled (เก็บประวัติ)
-- จำนวนวันคิดใน backend เฉพาะวันทำงาน (ps_working_weekdays ไม่รวมวันหยุดบริษัท) · ครึ่งวันได้เฉพาะลาวันเดียว (= 0.5)
-- ห้ามคร่อมปี (โควตาเป็นรายปีปฏิทิน — แยกเป็น 2 ใบ) · ทับซ้อนกับลาที่ส่งแล้ว/อนุมัติแล้วไม่ได้ (เช้า+บ่ายวันเดียวกันได้)
-- ขั้น 4-4 จะล็อกลาที่อยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว
CREATE TABLE IF NOT EXISTS `tb_leave_requests` (
  `lr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lr_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lr_leave_type_id` int unsigned NOT NULL,
  `lr_start_date` date NOT NULL,
  `lr_end_date` date NOT NULL,
  `lr_half_day` enum('none','morning','afternoon') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `lr_days` decimal(5,1) NOT NULL COMMENT 'วันทำงานที่ลา (คิดใน backend)',
  `lr_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เห็นเฉพาะเจ้าของ/ผู้อนุมัติ/ฝ่ายบุคคล',
  `lr_status` enum('draft','pending','approved','rejected','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `lr_version` int unsigned NOT NULL DEFAULT '1',
  `lr_submitted_at` datetime DEFAULT NULL,
  `lr_decided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_decided_at` datetime DEFAULT NULL,
  `lr_decision_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ไม่อนุมัติ',
  `lr_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_cancelled_at` datetime DEFAULT NULL,
  `lr_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `lr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lr_id`),
  KEY `idx_lr_employee_dates` (`lr_employee_id`,`lr_start_date`),
  KEY `idx_lr_status_dates` (`lr_status`,`lr_start_date`),
  KEY `fk_lr_leave_type` (`lr_leave_type_id`),
  KEY `fk_lr_decided_by` (`lr_decided_by`),
  KEY `fk_lr_cancelled_by` (`lr_cancelled_by`),
  KEY `fk_lr_created_by` (`lr_created_by`),
  CONSTRAINT `fk_lr_cancelled_by` FOREIGN KEY (`lr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_created_by` FOREIGN KEY (`lr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_decided_by` FOREIGN KEY (`lr_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_employee` FOREIGN KEY (`lr_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_lr_leave_type` FOREIGN KEY (`lr_leave_type_id`) REFERENCES `tb_leave_types` (`lt_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์แนบคำขอลา (ใบรับรองแพทย์ ฯลฯ) — เก็บใน storage ส่วนตัว (private-file.js) เปิดผ่าน API ที่ตรวจสิทธิ์เท่านั้น (R-H8)
CREATE TABLE IF NOT EXISTS `tb_leave_attachments` (
  `lra_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `lra_request_id` int unsigned NOT NULL,
  `lra_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lra_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lra_file_size` int unsigned NOT NULL DEFAULT '0',
  `lra_uploaded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lra_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lra_id`),
  KEY `idx_lra_request` (`lra_request_id`),
  KEY `fk_lra_uploaded_by` (`lra_uploaded_by`),
  CONSTRAINT `fk_lra_request` FOREIGN KEY (`lra_request_id`) REFERENCES `tb_leave_requests` (`lr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lra_uploaded_by` FOREIGN KEY (`lra_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ เฟส 4 ขั้น 4-4 (2026-10-17) — รอบเงินเดือน + ค่าลดหย่อนรายปี + ค่าแรงจริงต่อโปรเจกต์ · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 3.7, 4.3 ════
-- ── ขั้น 4-4 (2026-10-17): รอบเงินเดือน ──
-- ค่าลดหย่อนรายปีของพนักงาน (ล.ย.01) + ยอดยกมาของปี (เงินได้/ภาษี/ประกันสังคมก่อนใช้ระบบ หรือจากที่ทำงานเดิม)
-- ยอดลดหย่อนกรอกเป็นบาทตามที่กฎหมายให้ (ฝ่ายบุคคลคิดเอง) · แก้กลางปีได้ — รอบถัดไปคิดภาษีทั้งปีใหม่
CREATE TABLE IF NOT EXISTS `tb_employee_tax_profiles` (
  `etp_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `etp_tax_year` smallint unsigned NOT NULL COMMENT 'ปี ค.ศ.',
  `etp_spouse_allowance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `etp_child_allowance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `etp_parent_allowance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `etp_insurance_allowance` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ประกันชีวิต/สุขภาพ',
  `etp_fund_allowance` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'กองทุน (สำรองเลี้ยงชีพ/RMF/SSF ฯลฯ)',
  `etp_home_loan_interest` decimal(15,2) NOT NULL DEFAULT '0.00',
  `etp_other_allowance` decimal(15,2) NOT NULL DEFAULT '0.00',
  `etp_prior_income` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินได้ยกมาของปี (ก่อนรอบแรกในระบบ)',
  `etp_prior_tax` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ภาษีที่หักไปแล้วยกมา',
  `etp_prior_sso` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ประกันสังคมที่หักไปแล้วยกมา',
  `etp_prior_from_other_employer` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ยอดยกมาจากที่ทำงานเดิม — ใช้คิดภาษีเท่านั้น ไม่รวมใน ภ.ง.ด.1ก/50 ทวิ ของบริษัท',
  `etp_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `etp_updated_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `etp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`etp_employee_id`,`etp_tax_year`),
  KEY `fk_etp_updated_by` (`etp_updated_by`),
  CONSTRAINT `fk_etp_employee` FOREIGN KEY (`etp_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_etp_updated_by` FOREIGN KEY (`etp_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รอบเงินเดือนรายเดือน — เดือนละหนึ่งรอบที่ไม่ยกเลิก (ตรวจใน service + ล็อกแถว tb_payroll_settings ก่อนตรวจ R-H2)
-- draft (คิดใหม่/แก้รายการได้) → pending_approval (ตัวเลขล็อก · กติกาอนุมัติประเภท PR) → approved (ล็อกถาวร + snapshot ค่าแรง + ล็อกลงเวลา/ลาของเดือน)
-- → paid (สลิปเปิดให้พนักงาน) · ยกเลิกได้ก่อนจ่าย
CREATE TABLE IF NOT EXISTS `tb_payroll_runs` (
  `pr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pr_period` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'YYYY-MM',
  `pr_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PR-YYYY-MM',
  `pr_pay_date` date NOT NULL,
  `pr_status` enum('draft','pending_approval','approved','paid','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `pr_version` int unsigned NOT NULL DEFAULT '1',
  `pr_working_days` smallint unsigned NOT NULL DEFAULT '0',
  `pr_standard_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `pr_employee_count` smallint unsigned NOT NULL DEFAULT '0',
  `pr_total_gross` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pr_total_deductions` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'รายหักอื่น (ไม่รวมประกันสังคม/ภาษี)',
  `pr_total_sso_employee` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pr_total_sso_employer` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pr_total_tax` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pr_total_net` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pr_calculated_at` datetime DEFAULT NULL,
  `pr_approval_round` int unsigned NOT NULL DEFAULT '0',
  `pr_approval_current_level` tinyint unsigned DEFAULT NULL,
  `pr_approval_plan` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'snapshot แผนอนุมัติตอนส่ง (JSON)',
  `pr_submitted_at` datetime DEFAULT NULL,
  `pr_approved_at` datetime DEFAULT NULL,
  `pr_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_paid_date` date DEFAULT NULL,
  `pr_paid_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เช่น บัญชีที่โอน',
  `pr_paid_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_cancelled_at` datetime DEFAULT NULL,
  `pr_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pr_id`),
  KEY `idx_pr_period_status` (`pr_period`,`pr_status`),
  KEY `fk_pr_paid_by` (`pr_paid_by`),
  KEY `fk_pr_cancelled_by` (`pr_cancelled_by`),
  KEY `fk_pr_created_by` (`pr_created_by`),
  CONSTRAINT `fk_pr_cancelled_by` FOREIGN KEY (`pr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_created_by` FOREIGN KEY (`pr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_paid_by` FOREIGN KEY (`pr_paid_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติอนุมัติ/ตีกลับ — รูปแบบเดียวกับ tb_expense_approvals
CREATE TABLE IF NOT EXISTS `tb_payroll_approvals` (
  `pra_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pra_run_id` int unsigned NOT NULL,
  `pra_round` int unsigned NOT NULL,
  `pra_level` tinyint unsigned NOT NULL,
  `pra_action` enum('approve','return') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pra_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_user_name` varchar(201) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_role_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pra_id`),
  KEY `idx_pra_run_round` (`pra_run_id`,`pra_round`),
  KEY `fk_pra_user` (`pra_user_id`),
  CONSTRAINT `fk_pra_run` FOREIGN KEY (`pra_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pra_user` FOREIGN KEY (`pra_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายคนในรอบ — snapshot ข้อมูลพนักงาน + ตัวเลขทุกตัวที่ใช้คิด (สลิป/แบบภาษีอ่านจากตรงนี้ ไม่คิดใหม่)
CREATE TABLE IF NOT EXISTS `tb_payroll_items` (
  `pri_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pri_run_id` int unsigned NOT NULL,
  `pri_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_emp_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_full_name` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_national_id` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_department_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_sso_enrolled` tinyint(1) NOT NULL DEFAULT '1',
  `pri_employed_days` smallint unsigned NOT NULL COMMENT 'วันปฏิทินที่เป็นพนักงานในเดือน',
  `pri_days_in_month` smallint unsigned NOT NULL,
  `pri_base_salary` decimal(15,2) NOT NULL COMMENT 'เงินเดือนต่อเดือน ณ วันสุดท้ายที่ทำงานในเดือน',
  `pri_salary_amount` decimal(15,2) NOT NULL COMMENT 'เงินเดือนตามสัดส่วนวัน',
  `pri_unpaid_leave_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `pri_unpaid_leave_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_late_minutes` int unsigned NOT NULL DEFAULT '0' COMMENT 'นาทีมาสาย (หลังผ่อนผัน) ที่หัก · ลงเวลา A-4',
  `pri_early_leave_minutes` int unsigned NOT NULL DEFAULT '0' COMMENT 'นาทีออกก่อนเวลาที่หัก',
  `pri_absent_days` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'วันขาดงาน (วันทำงาน ไม่ลา ไม่กดเลย)',
  `pri_attendance_deduction` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หักสาย/ออกก่อน/ขาด (ลดเงินเดือนก่อนคิดภาษีและประกันสังคม เหมือนลาไม่รับค่าจ้าง)',
  `pri_other_earnings` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_other_deductions` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_gross` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินเดือนสุทธิจากลา + รายรับอื่น',
  `pri_taxable_income` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_sso_wage` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_sso_employee` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_sso_employer` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_ytd_income_before` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_ytd_tax_before` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_ytd_sso_before` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_annual_income_estimate` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_annual_tax_estimate` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_tax` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_net` decimal(15,2) NOT NULL DEFAULT '0.00',
  `pri_standard_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `pri_labor_cost` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ต้นทุนทั้งเดือน = ค่าจ้าง + ประกันสังคมส่วนบริษัท',
  PRIMARY KEY (`pri_id`),
  UNIQUE KEY `uq_pri_run_employee` (`pri_run_id`,`pri_employee_id`),
  KEY `idx_pri_employee` (`pri_employee_id`),
  CONSTRAINT `fk_pri_employee` FOREIGN KEY (`pri_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_pri_run` FOREIGN KEY (`pri_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการเพิ่ม/หักของแต่ละคน: recurring = ดึงจากรายการประจำตอนคิด (คิดใหม่แล้วสร้างใหม่) · manual = กรอกเอง (คิดใหม่แล้วยังอยู่)
CREATE TABLE IF NOT EXISTS `tb_payroll_item_lines` (
  `pil_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pil_item_id` int unsigned NOT NULL,
  `pil_source` enum('recurring','manual','attendance') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_kind` enum('earning','deduction') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_amount` decimal(15,2) NOT NULL,
  `pil_is_taxable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'รายรับ: นับเป็นเงินได้คิดภาษี',
  `pil_is_sso_wage` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับ: นับเป็นค่าจ้างประกันสังคม',
  `pil_is_one_off` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับครั้งเดียว (โบนัส) — ไม่ประมาณการซ้ำทั้งปีตอนคิดภาษี',
  `pil_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pil_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pil_id`),
  KEY `idx_pil_item` (`pil_item_id`),
  KEY `fk_pil_created_by` (`pil_created_by`),
  CONSTRAINT `fk_pil_created_by` FOREIGN KEY (`pil_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pil_item` FOREIGN KEY (`pil_item_id`) REFERENCES `tb_payroll_items` (`pri_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ค่าแรงจริงต่อโปรเจกต์ — snapshot ตอนอนุมัติรอบ (โปรเจกต์ว่าง = ส่วนกลาง: งานภายใน + ชั่วโมงที่ไม่ได้ลง) · หน้าโปรเจกต์อ่านจากที่นี่
CREATE TABLE IF NOT EXISTS `tb_labor_cost_allocations` (
  `lca_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lca_run_id` int unsigned NOT NULL,
  `lca_period` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lca_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `lca_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lca_hours` decimal(8,2) NOT NULL DEFAULT '0.00',
  `lca_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`lca_id`),
  KEY `idx_lca_project_period` (`lca_project_id`,`lca_period`),
  KEY `idx_lca_run` (`lca_run_id`),
  KEY `fk_lca_employee` (`lca_employee_id`),
  CONSTRAINT `fk_lca_employee` FOREIGN KEY (`lca_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_lca_project` FOREIGN KEY (`lca_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_lca_run` FOREIGN KEY (`lca_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ ใบลดหนี้ (2026-10-18 ขั้น N-1) · แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, 4.1 ════
-- ใบลดหนี้ = ลดยอดที่ลูกค้าต้องจ่ายของใบแจ้งหนี้ที่ออกแล้ว โดยไม่ยกเลิกใบเดิม · ทุกใบต้องอนุมัติตามกติกา 'CN' (N2-ก)
-- flow: draft → pending_approval (ชั้น 1..n) → issued (ได้เลข CN + วันที่ · ยอดรวมของใบเดิมใน tb_invoices.inv_credited_* เพิ่ม) → cancelled
-- ลดเกินยอดค้าง (ลูกค้าจ่ายมาแล้ว) = ต้องคืนเงิน: cn_refund_required > 0 → บันทึกคืนเงิน (N1-ก) · โอนคืน + หัก ณ ที่จ่าย = ยอดที่ต้องคืนพอดี
-- ลูกค้า สาขา สกุล อัตรา VAT อัตราแลกเปลี่ยน โปรเจกต์ มาจากใบเดิมเสมอ · ยอดคำนวณใน backend (shared/credit-note-totals.mjs)
CREATE TABLE IF NOT EXISTS `tb_credit_notes` (
  `cn_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CN-yyyymmdd-xxxxxx ออกตอนอนุมัติครบ — ยกเลิกแล้วเลขยังอยู่',
  `cn_status` enum('draft','pending_approval','issued','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `cn_version` int unsigned NOT NULL DEFAULT '0',
  `cn_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ใบแจ้งหนี้ที่ลด',
  `cn_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `cn_language` enum('th','en') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `cn_reason_code` enum('price_reduction','scope_reduction','defect','error','other') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เหตุผล (พิมพ์บนเอกสาร)',
  `cn_issue_date` date DEFAULT NULL COMMENT 'วันที่อนุมัติครบ (เวลาไทย)',
  `cn_original_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'มูลค่าตามใบเดิมก่อนใบนี้ (หักใบลดหนี้ก่อนหน้าแล้ว)',
  `cn_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดที่ลดก่อน VAT',
  `cn_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'อัตราของใบเดิม',
  `cn_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  `cn_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'รวมลดหนี้',
  `cn_base_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT เป็นบาท (อัตราของใบเดิม) — ใช้เทียบเกณฑ์อนุมัติ',
  `cn_total_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `cn_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายประมาณการส่วนที่ลด',
  `cn_outstanding_before` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดค้างของใบเดิมก่อนใบนี้ (ณ ตอนออก)',
  `cn_refund_required` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนที่ลูกค้าจ่ายเกิน = ต้องคืน (ณ ตอนออก)',
  `cn_refund_date` date DEFAULT NULL,
  `cn_refund_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีบริษัทที่โอนคืนออก',
  `cn_refund_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินที่โอนคืนจริง',
  `cn_refund_wht` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนหัก ณ ที่จ่ายที่ไม่ต้องคืน (ลูกค้าหักไว้แล้ว)',
  `cn_refund_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refund_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refunded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refunded_at` datetime DEFAULT NULL,
  `cn_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุที่พิมพ์บนเอกสาร',
  `cn_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT 'บันทึกภายใน — ไม่พิมพ์',
  `cn_client_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลลูกค้า ณ วันออก',
  `cn_company_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลบริษัท + สาขา ณ วันออก',
  `cn_approval_round` int unsigned NOT NULL DEFAULT '0',
  `cn_approval_current_level` tinyint unsigned DEFAULT NULL,
  `cn_approval_plan` json DEFAULT NULL,
  `cn_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_submitted_at` datetime DEFAULT NULL,
  `cn_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้อนุมัติชั้นสุดท้าย',
  `cn_issued_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issued_by_title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issuer_signature_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issued_at` datetime DEFAULT NULL,
  `cn_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_cancelled_at` datetime DEFAULT NULL,
  `cn_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `cn_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cn_id`),
  UNIQUE KEY `uq_cn_number` (`cn_number`),
  KEY `idx_cn_invoice_status` (`cn_invoice_id`,`cn_status`),
  KEY `idx_cn_status_issue_date` (`cn_status`,`cn_issue_date`),
  KEY `fk_cn_client` (`cn_client_id`),
  KEY `fk_cn_branch` (`cn_branch_id`),
  KEY `fk_cn_project` (`cn_project_id`),
  KEY `fk_cn_currency` (`cn_currency`),
  KEY `fk_cn_refund_bank_account` (`cn_refund_bank_account_id`),
  KEY `fk_cn_refunded_by` (`cn_refunded_by`),
  KEY `fk_cn_created_by` (`cn_created_by`),
  KEY `fk_cn_issued_by` (`cn_issued_by`),
  KEY `fk_cn_issuer_signature` (`cn_issuer_signature_id`),
  KEY `fk_cn_cancelled_by` (`cn_cancelled_by`),
  CONSTRAINT `fk_cn_branch` FOREIGN KEY (`cn_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_cn_cancelled_by` FOREIGN KEY (`cn_cancelled_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_client` FOREIGN KEY (`cn_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_cn_created_by` FOREIGN KEY (`cn_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_currency` FOREIGN KEY (`cn_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_cn_invoice` FOREIGN KEY (`cn_invoice_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_cn_issued_by` FOREIGN KEY (`cn_issued_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_issuer_signature` FOREIGN KEY (`cn_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_cn_project` FOREIGN KEY (`cn_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_cn_refund_bank_account` FOREIGN KEY (`cn_refund_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_cn_refunded_by` FOREIGN KEY (`cn_refunded_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการที่ลด — ยอดก่อน VAT ต่อบรรทัด (VAT คิดท้ายใบด้วยอัตราของใบเดิม)
CREATE TABLE IF NOT EXISTS `tb_credit_note_lines` (
  `cnl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cnl_credit_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cnl_order` int NOT NULL DEFAULT '0',
  `cnl_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cnl_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดที่ลดก่อน VAT (สกุลของใบ)',
  PRIMARY KEY (`cnl_id`),
  KEY `idx_cnl_credit_note` (`cnl_credit_note_id`,`cnl_order`),
  CONSTRAINT `fk_cnl_credit_note` FOREIGN KEY (`cnl_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการอนุมัติ/ตีกลับของใบลดหนี้ — รูปแบบเดียวกับ tb_invoice_approvals
CREATE TABLE IF NOT EXISTS `tb_credit_note_approvals` (
  `cna_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cna_credit_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_round` int unsigned NOT NULL,
  `cna_level` tinyint unsigned NOT NULL,
  `cna_action` enum('approve','return') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่',
  `cna_role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cna_id`),
  KEY `idx_cna_credit_note` (`cna_credit_note_id`,`cna_round`,`cna_level`),
  KEY `fk_cna_user` (`cna_user_id`),
  CONSTRAINT `fk_cna_credit_note` FOREIGN KEY (`cna_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cna_user` FOREIGN KEY (`cna_user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ ลงเวลาเข้า-ออกงาน ช่วง A-1 (2026-10-23) · แบบระบบ: docs/plans/2026-10-23-attendance-ot.md ════
-- กะทำงาน: ชุดเวลาให้เลือกแล้วกำหนดให้แต่ละคน · เวลาเลิก <= เวลาเข้า = กะข้ามเที่ยงคืน (วันทำงาน = วันที่เริ่มกะ)
-- ปิดใช้งานแทนการลบ (พนักงานที่เคยใช้กะนี้ต้องดูประวัติได้)
CREATE TABLE IF NOT EXISTS `tb_work_schedules` (
  `ws_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ws_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ws_start_time` time NOT NULL COMMENT 'เวลาเข้างาน',
  `ws_end_time` time NOT NULL COMMENT 'เวลาเลิกงาน (<= เวลาเข้า = เลิกวันถัดไป)',
  `ws_break_minutes` smallint unsigned NOT NULL DEFAULT '60' COMMENT 'พักระหว่างวัน (นาที) ไม่นับเป็นเวลาทำงาน',
  `ws_working_weekdays` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1111100' COMMENT 'วันทำงาน จันทร์→อาทิตย์ 1 = ทำงาน',
  `ws_late_grace_minutes` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'ผ่อนผันสาย (นาที) · เกินแล้วนับสายจากเวลาเข้างาน (Q3)',
  `ws_checkin_open_minutes` smallint unsigned NOT NULL DEFAULT '120' COMMENT 'กดเข้างานได้ก่อนเวลาเข้ากี่นาที (ใช้ตัดวันของกะข้ามคืน)',
  `ws_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ws_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ws_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ws_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ws_id`),
  UNIQUE KEY `uq_ws_name` (`ws_name`),
  KEY `fk_ws_created_by` (`ws_created_by`),
  CONSTRAINT `fk_ws_created_by` FOREIGN KEY (`ws_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- กะของพนักงานตามวันที่มีผล (ประวัติไม่หาย เหมือนค่าจ้าง) · กะ ณ วันใด = แถวล่าสุดที่มีผลไม่เกินวันนั้น · ไม่มีแถว = กะเริ่มต้นในตั้งค่า
CREATE TABLE IF NOT EXISTS `tb_employee_schedules` (
  `es_id` int unsigned NOT NULL AUTO_INCREMENT,
  `es_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `es_schedule_id` int unsigned NOT NULL,
  `es_effective_from` date NOT NULL,
  `es_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `es_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`es_id`),
  UNIQUE KEY `uq_es_employee_date` (`es_employee_id`,`es_effective_from`),
  KEY `fk_es_schedule` (`es_schedule_id`),
  KEY `fk_es_created_by` (`es_created_by`),
  CONSTRAINT `fk_es_created_by` FOREIGN KEY (`es_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_es_employee` FOREIGN KEY (`es_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_es_schedule` FOREIGN KEY (`es_schedule_id`) REFERENCES `tb_work_schedules` (`ws_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- จุดลงเวลา (พิกัด + รัศมี) · สาขาหนึ่งมีได้หลายจุด · กดในรัศมี = ในจุด · นอกรัศมีกดได้แต่ต้องใส่เหตุผล (Q1)
CREATE TABLE IF NOT EXISTS `tb_attendance_locations` (
  `al_id` int unsigned NOT NULL AUTO_INCREMENT,
  `al_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `al_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `al_latitude` decimal(9,6) NOT NULL,
  `al_longitude` decimal(9,6) NOT NULL,
  `al_radius_m` smallint unsigned NOT NULL DEFAULT '150' COMMENT 'รัศมี (เมตร)',
  `al_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `al_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `al_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `al_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`al_id`),
  KEY `fk_al_branch` (`al_branch_id`),
  KEY `fk_al_created_by` (`al_created_by`),
  CONSTRAINT `fk_al_branch` FOREIGN KEY (`al_branch_id`) REFERENCES `tb_branches` (`branch_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_al_created_by` FOREIGN KEY (`al_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- การกดเข้า/ออกงาน — แก้/ลบไม่ได้ · เวลา = เวลาเซิร์ฟเวอร์ (ไทย) ไม่รับจากมือถือ · ชื่อจุดและระยะเก็บไว้ในแถว (จุดถูกปิดทีหลังก็ยังอ่านได้)
-- แก้เวลา (ช่วง A-2) = เพิ่มแถวที่มา correction และทำเครื่องหมายแถวเดิมว่าไม่ใช้ (ap_voided_at) — ประวัติครบ
-- พิกัดเป็นข้อมูลส่วนบุคคล: เก็บเฉพาะตอนกด · เห็นได้เฉพาะเจ้าตัว ผู้อนุมัติ และฝ่ายบุคคล
CREATE TABLE IF NOT EXISTS `tb_attendance_punches` (
  `ap_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `ap_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ap_type` enum('in','out') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ap_at` datetime NOT NULL COMMENT 'เวลาเซิร์ฟเวอร์ (เวลาไทย)',
  `ap_work_date` date NOT NULL COMMENT 'วันทำงานที่การกดนี้นับ (กะข้ามคืน = วันเริ่มกะ)',
  `ap_source` enum('mobile','correction','hr') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'mobile',
  `ap_latitude` decimal(9,6) DEFAULT NULL,
  `ap_longitude` decimal(9,6) DEFAULT NULL,
  `ap_accuracy_m` int unsigned DEFAULT NULL COMMENT 'ความแม่นยำ GPS (เมตร) ที่มือถือรายงาน',
  `ap_location_id` int unsigned DEFAULT NULL COMMENT 'จุดลงเวลาที่ใกล้ที่สุด',
  `ap_location_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_distance_m` int unsigned DEFAULT NULL,
  `ap_is_offsite` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = นอกจุดลงเวลา / ไม่มีตำแหน่ง (ต้องมีเหตุผล)',
  `ap_is_wfh` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = กดวัน WFH (ไม่ตรวจตำแหน่ง · ไม่ใช่นอกจุด)',
  `ap_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_ip` varchar(45) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_user_agent` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_voided_at` datetime DEFAULT NULL,
  `ap_voided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_void_reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ap_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ap_id`),
  KEY `idx_ap_employee_date` (`ap_employee_id`,`ap_work_date`),
  KEY `idx_ap_work_date` (`ap_work_date`),
  KEY `fk_ap_location` (`ap_location_id`),
  KEY `fk_ap_voided_by` (`ap_voided_by`),
  KEY `fk_ap_created_by` (`ap_created_by`),
  CONSTRAINT `fk_ap_created_by` FOREIGN KEY (`ap_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ap_employee` FOREIGN KEY (`ap_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_ap_location` FOREIGN KEY (`ap_location_id`) REFERENCES `tb_attendance_locations` (`al_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ap_voided_by` FOREIGN KEY (`ap_voided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำขอแก้เวลา (ลงเวลา A-2 · 2026-10-24) — ลืมกดเข้า/ออก → ขอเวลาที่ถูก + เหตุผล → ผู้มีสิทธิ์อนุมัติลงเวลาอนุมัติ
-- อนุมัติแล้วสร้างการกดที่มา 'correction' (ac_punch_id) · ของตัวเองอนุมัติไม่ได้ · เดือนที่ปิดรอบเงินเดือนแล้วขอ/อนุมัติไม่ได้
-- ac_requested_at = เวลาเต็ม (กะข้ามคืน: ออกหลังเที่ยงคืนเป็นวันถัดไป) · ac_work_date = วันทำงานที่ขอแก้
CREATE TABLE IF NOT EXISTS `tb_attendance_corrections` (
  `ac_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ac_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ac_work_date` date NOT NULL,
  `ac_type` enum('in','out') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ac_requested_at` datetime NOT NULL COMMENT 'เวลาที่ขอให้บันทึก (เวลาไทย)',
  `ac_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ac_status` enum('pending','approved','rejected','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `ac_decided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ac_decided_at` datetime DEFAULT NULL,
  `ac_decision_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ไม่อนุมัติ (พนักงานเห็น)',
  `ac_punch_id` bigint unsigned DEFAULT NULL COMMENT 'การกดที่สร้างตอนอนุมัติ',
  `ac_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ac_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ac_id`),
  KEY `idx_ac_employee_date` (`ac_employee_id`,`ac_work_date`),
  KEY `idx_ac_status` (`ac_status`),
  KEY `fk_ac_decided_by` (`ac_decided_by`),
  KEY `fk_ac_punch` (`ac_punch_id`),
  KEY `fk_ac_created_by` (`ac_created_by`),
  CONSTRAINT `fk_ac_created_by` FOREIGN KEY (`ac_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ac_decided_by` FOREIGN KEY (`ac_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ac_employee` FOREIGN KEY (`ac_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_ac_punch` FOREIGN KEY (`ac_punch_id`) REFERENCES `tb_attendance_punches` (`ap_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำขอ OT (ลงเวลา A-3 · 2026-10-24) — พนักงานขอ (= ยินยอมทำ OT ครั้งนั้น ม.24) → ผู้มีสิทธิ์อนุมัติลงเวลาอนุมัติ
-- นาทีแยกชนิด (snapshot ตอนขอ ใช้คุมเพดานต่อสัปดาห์): วันทำงานนอกเวลางาน · วันหยุดในเวลาปกติของกะ · วันหยุดนอกเวลาปกติ
-- จ่ายจริง (A-4) = ช่วงที่อนุมัติ ∩ เวลาที่อยู่จริง (เข้า-ออก) ปัดลงทีละ 15 นาที
CREATE TABLE IF NOT EXISTS `tb_overtime_requests` (
  `ot_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ot_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ot_work_date` date NOT NULL,
  `ot_start_at` datetime NOT NULL,
  `ot_end_at` datetime NOT NULL,
  `ot_workday_minutes` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'OT วันทำงาน (นอกเวลางาน)',
  `ot_holiday_work_minutes` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'ทำงานวันหยุดในเวลาปกติของกะ',
  `ot_holiday_ot_minutes` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'OT วันหยุด (นอกเวลาปกติ)',
  `ot_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ot_status` enum('pending','approved','rejected','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `ot_decided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ot_decided_at` datetime DEFAULT NULL,
  `ot_decision_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ไม่อนุมัติ (พนักงานเห็น)',
  `ot_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ot_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ot_id`),
  KEY `idx_ot_employee_date` (`ot_employee_id`,`ot_work_date`),
  KEY `idx_ot_status` (`ot_status`),
  KEY `fk_ot_decided_by` (`ot_decided_by`),
  KEY `fk_ot_created_by` (`ot_created_by`),
  CONSTRAINT `fk_ot_created_by` FOREIGN KEY (`ot_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ot_decided_by` FOREIGN KEY (`ot_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ot_employee` FOREIGN KEY (`ot_employee_id`) REFERENCES `tb_employees` (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำขอ WFH รายวัน (2026-10-24) — พนักงานขอล่วงหน้า (วันนี้หรือหลังจากนี้) → ผู้มีสิทธิ์อนุมัติลงเวลาอนุมัติ
-- วันที่อนุมัติแล้ว = วัน WFH: กดเข้า/ออกได้ทุกที่ ไม่ต้องใส่เหตุผล (บันทึกพิกัดไว้) · WFH ประจำตั้งที่ tb_employees.emp_wfh_weekdays
CREATE TABLE IF NOT EXISTS `tb_wfh_requests` (
  `wfh_id` int unsigned NOT NULL AUTO_INCREMENT,
  `wfh_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wfh_date` date NOT NULL,
  `wfh_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `wfh_status` enum('pending','approved','rejected','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `wfh_decided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wfh_decided_at` datetime DEFAULT NULL,
  `wfh_decision_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ไม่อนุมัติ (พนักงานเห็น)',
  `wfh_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wfh_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wfh_id`),
  KEY `idx_wfh_employee_date` (`wfh_employee_id`,`wfh_date`),
  KEY `idx_wfh_status` (`wfh_status`),
  KEY `fk_wfh_decided_by` (`wfh_decided_by`),
  KEY `fk_wfh_created_by` (`wfh_created_by`),
  CONSTRAINT `fk_wfh_created_by` FOREIGN KEY (`wfh_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wfh_decided_by` FOREIGN KEY (`wfh_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_wfh_employee` FOREIGN KEY (`wfh_employee_id`) REFERENCES `tb_employees` (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- งวดงาน Fastwork (2026-10-24 · P-1) — ตกลงกับลูกค้าบน Fastwork · ส่งงานแล้ว = fwm_delivered_at
-- เงินที่ได้จริงอยู่ใน tb_fastwork_payouts (หนึ่งงวดมีรายการเงินที่ยังไม่ยกเลิกได้รายการเดียว — ตรวจใน backend)
CREATE TABLE IF NOT EXISTS `tb_fastwork_milestones` (
  `fwm_id` int unsigned NOT NULL AUTO_INCREMENT,
  `fwm_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwm_order` smallint unsigned NOT NULL,
  `fwm_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwm_amount` decimal(15,2) NOT NULL COMMENT 'ราคางวดตามที่ตกลงบน Fastwork (ยอดที่ลูกค้าจ่าย)',
  `fwm_due_date` date DEFAULT NULL,
  `fwm_delivered_at` datetime DEFAULT NULL COMMENT 'ส่งงานงวดนี้บน Fastwork แล้ว (รอลูกค้ายืนยัน)',
  `fwm_delivered_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwm_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `fwp_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `fwp_milestone_id` int unsigned DEFAULT NULL,
  `fwp_status` enum('pending','received','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `fwp_gross` decimal(15,2) NOT NULL COMMENT 'ราคางวดที่ลูกค้าจ่ายเข้า Fastwork',
  `fwp_fee_rate` decimal(5,2) NOT NULL COMMENT 'อัตราค่าธรรมเนียม ณ วันที่บันทึก (%)',
  `fwp_fee` decimal(15,2) NOT NULL,
  `fwp_fee_vat` decimal(15,2) NOT NULL DEFAULT '0.00',
  `fwp_wht` decimal(15,2) NOT NULL DEFAULT '0.00',
  `fwp_wht_certificate_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่ 50 ทวิ ที่ Fastwork ออกให้ (ถ้ามี)',
  `fwp_net` decimal(15,2) NOT NULL COMMENT 'ยอดเข้าบัญชีจริง',
  `fwp_approved_date` date NOT NULL COMMENT 'วันที่ลูกค้ายืนยันงวดบน Fastwork',
  `fwp_received_date` date DEFAULT NULL,
  `fwp_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_cancelled_at` datetime DEFAULT NULL,
  `fwp_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_received_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fwp_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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

-- ส่วนแบ่งกำไรรายโปรเจกต์ (2026-10-24 · P-2) — ผู้รับเป็นผู้ใช้ในระบบ หรือผู้ขาย/ฟรีแลนซ์ (อย่างใดอย่างหนึ่ง)
-- percent = % ของกำไรหลังหักส่วนแบ่งตายตัว · fixed = จำนวนเงินตายตัว (หักก่อน) · ที่เหลือ = เก็บเข้าเงินทุน
-- แก้ได้จนกว่าจะปิดยอด (บันทึกทั้งชุดใหม่ทุกครั้ง) · ชื่อผู้รับไม่เก็บซ้ำ ดึงจากผู้ใช้/ผู้ขายตอนอ่าน (คัดลอกชื่อเฉพาะตอนเบิกและปิดยอด)
CREATE TABLE IF NOT EXISTS `tb_project_shares` (
  `shr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `shr_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `shr_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shr_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shr_kind` enum('percent','fixed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `shr_percent` decimal(5,2) DEFAULT NULL,
  `shr_amount` decimal(15,2) DEFAULT NULL,
  `shr_note` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'หน้าที่ในงาน เช่น คนทำงาน คนหางาน',
  `shr_order` smallint unsigned NOT NULL DEFAULT '0',
  `shr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `sha_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sha_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_recipient_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อ ณ วันจ่าย (หลักฐานการจ่าย ไม่เปลี่ยนตามชื่อปัจจุบัน)',
  `sha_amount` decimal(15,2) NOT NULL,
  `sha_paid_date` date NOT NULL,
  `sha_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_status` enum('paid','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'paid',
  `sha_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_cancelled_at` datetime DEFAULT NULL,
  `sha_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sha_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `sst_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sst_status` enum('settled','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'settled',
  `sst_settled_date` date NOT NULL,
  `sst_revenue` decimal(15,2) NOT NULL COMMENT 'รายได้ที่เงินเข้าจริง ก่อน VAT (ลูกค้าตรง + ราคางวด Fastwork)',
  `sst_platform_fee` decimal(15,2) NOT NULL,
  `sst_expense_cost` decimal(15,2) NOT NULL,
  `sst_distributable` decimal(15,2) NOT NULL,
  `sst_fixed_total` decimal(15,2) NOT NULL,
  `sst_after_fixed` decimal(15,2) NOT NULL,
  `sst_company_amount` decimal(15,2) NOT NULL COMMENT 'เก็บเข้าเงินทุน (ติดลบ = โปรเจกต์ขาดทุน)',
  `sst_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_cancelled_at` datetime DEFAULT NULL,
  `sst_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sst_version` int unsigned NOT NULL DEFAULT '0',
  `sst_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `ssl_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_recipient_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อ ณ วันปิดยอด (ตัวเลขที่ล็อกแล้ว ไม่เปลี่ยนตามชื่อปัจจุบัน)',
  `ssl_kind` enum('percent','fixed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ssl_percent` decimal(5,2) DEFAULT NULL,
  `ssl_amount` decimal(15,2) NOT NULL COMMENT 'ส่วนแบ่งที่ได้',
  `ssl_advanced` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เบิกล่วงหน้าไปแล้ว',
  `ssl_due` decimal(15,2) NOT NULL COMMENT 'ต้องจ่าย = ส่วนแบ่ง − เบิกล่วงหน้า (ติดลบ = ต้องคืน)',
  `ssl_status` enum('unpaid','paid') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unpaid',
  `ssl_wht` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ssl_transfer_amount` decimal(15,2) DEFAULT NULL,
  `ssl_paid_date` date DEFAULT NULL,
  `ssl_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ssl_paid_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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

-- สมุดเงินทุน (2026-10-25 · P-3) — เฉพาะรายการที่บันทึกเอง (ฝากเพิ่ม/ถอนออก)
-- ยอดเข้าทุนจากโปรเจกต์ไม่เก็บซ้ำที่นี่: อ่านจาก tb_share_settlements.sst_company_amount ของการปิดยอดที่ยังไม่ยกเลิก
-- ยกเลิกต้องมีเหตุผล (ไม่ลบ)
CREATE TABLE IF NOT EXISTS `tb_capital_entries` (
  `cpe_id` int unsigned NOT NULL AUTO_INCREMENT,
  `cpe_kind` enum('deposit','withdraw') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'deposit = ฝากเพิ่มเอง · withdraw = ถอนออก (ต้องมีเหตุผล)',
  `cpe_amount` decimal(15,2) NOT NULL COMMENT 'จำนวนเงิน (บวกเสมอ ทิศทางดูจาก cpe_kind)',
  `cpe_entry_date` date NOT NULL,
  `cpe_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_status` enum('active','cancelled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `cpe_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_cancelled_at` datetime DEFAULT NULL,
  `cpe_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cpe_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cpe_id`),
  KEY `idx_cpe_status_date` (`cpe_status`,`cpe_entry_date`),
  KEY `fk_cpe_cancelled_by` (`cpe_cancelled_by`),
  KEY `fk_cpe_created_by` (`cpe_created_by`),
  CONSTRAINT `fk_cpe_cancelled_by` FOREIGN KEY (`cpe_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_cpe_created_by` FOREIGN KEY (`cpe_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ลิงก์เลือกบริการ (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
-- personal = ลูกค้าตรงรายเดียว (ส่งคำขอได้ครั้งเดียว) · public = ติดหน้าเว็บ/เพจ (หลายคำขอ) · fastwork = ผู้ซื้อบน Fastwork (ไม่มีข้อมูลติดต่อ/การจ่ายเงิน)
-- token = ที่อยู่เต็ม /order/<token> · short_code = ที่อยู่สั้น /o/<code> (ใต้ QR) ชี้ลิงก์เดียวกัน · หมวดที่เปิด: tb_order_link_categories (ไม่มีแถว = ทุกหมวด)
CREATE TABLE IF NOT EXISTS `tb_order_links` (
  `ol_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ol_token` char(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_short_code` char(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_kind` enum('personal','public','fastwork') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อเรียกภายใน เช่น หน้าเว็บ เพจ Facebook',
  `ol_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'personal: ลูกค้าที่ผูก (ว่าง = ลูกค้าใหม่ยังไม่มีในระบบ)',
  `ol_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'fastwork: งานเดิมที่เพิ่มขอบเขต (ว่าง = ก่อนจ้าง)',
  `ol_buyer_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'fastwork ก่อนจ้าง: ชื่อผู้ซื้อที่แสดงบน Fastwork',
  `ol_assignee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ผู้รับคำขอจากลิงก์นี้',
  `ol_expires_on` date DEFAULT NULL COMMENT 'วันสุดท้ายที่เปิดได้ (ว่าง = ไม่หมดอายุ)',
  `ol_status` enum('active','disabled') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ol_allow_more` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ลูกค้าเลือกเพิ่มเองได้ (0 = มีแต่รายการที่ทีมเลือกให้)',
  `ol_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ol_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ol_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ol_id`),
  UNIQUE KEY `uq_ol_token` (`ol_token`),
  UNIQUE KEY `uq_ol_short_code` (`ol_short_code`),
  KEY `fk_ol_client` (`ol_client_id`),
  KEY `fk_ol_project` (`ol_project_id`),
  KEY `fk_ol_assignee` (`ol_assignee_id`),
  KEY `fk_ol_created_by` (`ol_created_by`),
  CONSTRAINT `fk_ol_assignee` FOREIGN KEY (`ol_assignee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ol_client` FOREIGN KEY (`ol_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_ol_created_by` FOREIGN KEY (`ol_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_ol_project` FOREIGN KEY (`ol_project_id`) REFERENCES `tb_projects` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_order_link_categories` (
  `olc_link_id` int unsigned NOT NULL,
  `olc_category_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`olc_link_id`,`olc_category_id`),
  KEY `fk_olc_category` (`olc_category_id`),
  CONSTRAINT `fk_olc_category` FOREIGN KEY (`olc_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_olc_link` FOREIGN KEY (`olc_link_id`) REFERENCES `tb_order_links` (`ol_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำขอบริการที่ลูกค้าส่งจากลิงก์ (2026-10-25) — ชนิดของคำขออ่านจากลิงก์ (ไม่เก็บซ้ำ)
-- submitted = รอตรวจ · converted = ออกใบเสนอราคา/เปิดโปรเจกต์แล้ว (สถานะต่อจากนั้นอ่านจากใบเสนอราคา/โปรเจกต์) · rejected = ปฏิเสธ · closed = ไม่ได้งาน (Fastwork)
-- access_token = หน้าสถานะของลูกค้า /order/r/<token> · submit_key = กันกดส่งซ้ำ (ซ้ำ = ตอบคำขอเดิม)
CREATE TABLE IF NOT EXISTS `tb_service_requests` (
  `svr_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_link_id` int unsigned NOT NULL,
  `svr_access_token` char(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_submit_key` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_status` enum('submitted','converted','rejected','closed') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `svr_status_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลปฏิเสธ/ปิด (ภายใน ลูกค้าไม่เห็น)',
  `svr_contact_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_phone` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_line` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_company_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_tax_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'กรอกเมื่อต้องการใบกำกับในนามบริษัท',
  `svr_address` varchar(1000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_note` varchar(2000) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ข้อความถึงทีมงานจากลูกค้า',
  `svr_consent_at` datetime DEFAULT NULL COMMENT 'เวลายินยอมข้อมูลส่วนบุคคล (ลิงก์ fastwork ไม่เก็บข้อมูลติดต่อ = ว่าง)',
  `svr_vat_rate` decimal(5,2) DEFAULT NULL COMMENT 'อัตรา VAT ที่ลูกค้าเห็นตอนส่ง (ว่าง = ยังไม่จด VAT)',
  `svr_assignee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลูกค้าที่ผูกตอนตรวจ (personal ผูกจากลิงก์)',
  `svr_quotation_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_version` int unsigned NOT NULL DEFAULT '0',
  `svr_accepted_name` varchar(150) DEFAULT NULL COMMENT 'ชื่อที่ลูกค้าพิมพ์ยืนยันตอนกดยอมรับใบเสนอราคาในลิงก์ (S-4)',
  `svr_accepted_at` datetime DEFAULT NULL COMMENT 'เวลาที่ลูกค้ากดยอมรับในลิงก์ (เวลาไทย)',
  `svr_submitted_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `svr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`svr_id`),
  UNIQUE KEY `uq_svr_access_token` (`svr_access_token`),
  UNIQUE KEY `uq_svr_submit_key` (`svr_link_id`,`svr_submit_key`),
  KEY `idx_svr_status` (`svr_status`,`svr_submitted_at`),
  KEY `fk_svr_assignee` (`svr_assignee_id`),
  KEY `fk_svr_client` (`svr_client_id`),
  KEY `fk_svr_quotation` (`svr_quotation_id`),
  KEY `fk_svr_project` (`svr_project_id`),
  CONSTRAINT `fk_svr_assignee` FOREIGN KEY (`svr_assignee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_svr_client` FOREIGN KEY (`svr_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_svr_link` FOREIGN KEY (`svr_link_id`) REFERENCES `tb_order_links` (`ol_id`),
  CONSTRAINT `fk_svr_project` FOREIGN KEY (`svr_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_svr_quotation` FOREIGN KEY (`svr_quotation_id`) REFERENCES `tb_quotations` (`qt_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการที่ลูกค้าเลือก (2026-10-25) — ชื่อ/หน่วย/ราคา ณ วันส่ง (คัดลอกเพราะเป็นราคาที่ลูกค้าเห็นตอนส่ง สินค้าแก้ราคาทีหลังได้)
-- ชุดสินค้า = แถว heading (ชื่อชุด) + แถว item ที่มี svi_package_id เดียวกัน
CREATE TABLE IF NOT EXISTS `tb_service_request_items` (
  `svi_id` int unsigned NOT NULL AUTO_INCREMENT,
  `svi_request_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svi_order` smallint unsigned NOT NULL,
  `svi_type` enum('item','heading') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `svi_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svi_package_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svi_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svi_unit` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svi_unit_price` decimal(15,2) DEFAULT NULL COMMENT 'บาท ณ วันส่ง (heading = ว่าง)',
  `svi_quantity` decimal(12,2) DEFAULT NULL COMMENT 'heading = จำนวนชุด',
  `svi_adjusted_quantity` decimal(12,2) DEFAULT NULL COMMENT 'จำนวนที่ผู้รับผิดชอบปรับ (ว่าง = ตามที่ลูกค้าเลือก)',
  `svi_adjusted_unit_price` decimal(15,2) DEFAULT NULL COMMENT 'ราคาที่ผู้รับผิดชอบปรับ (ว่าง = ราคา ณ วันส่ง)',
  `svi_is_removed` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ผู้รับผิดชอบเอาออก (แถวลูกค้ายังเก็บไว้ดูว่าเคยเลือก)',
  `svi_added_by_staff` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ผู้รับผิดชอบเพิ่มเอง (ลูกค้าไม่ได้เลือก)',
  `svi_is_preset` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ทีมเลือกให้ในลิงก์ (สำเนาตอนส่ง เพราะรายการของลิงก์แก้ได้ภายหลัง)',
  `svi_percent` decimal(5,2) DEFAULT NULL COMMENT 'งานเพิ่มแบบ %: อัตรา ณ วันส่ง · ยอดคิดจากยอดรายการอื่น (หลังปรับ) ทุกครั้ง ไม่เก็บยอดซ้ำ',
  PRIMARY KEY (`svi_id`),
  KEY `idx_svi_request` (`svi_request_id`,`svi_order`),
  KEY `fk_svi_product` (`svi_product_id`),
  KEY `fk_svi_package` (`svi_package_id`),
  CONSTRAINT `fk_svi_package` FOREIGN KEY (`svi_package_id`) REFERENCES `tb_product_packages` (`pkg_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_svi_product` FOREIGN KEY (`svi_product_id`) REFERENCES `tb_products` (`product_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_svi_request` FOREIGN KEY (`svi_request_id`) REFERENCES `tb_service_requests` (`svr_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำถามความต้องการของลิงก์เลือกบริการ (2026-10-25 · S-2) — กลุ่มผูกหมวดสินค้า · กลุ่มทั่วไป (is_general) ถามทุกคำขอ
-- ลูกค้าเลือกสินค้าหมวดไหน ขึ้นกลุ่มที่ผูกหมวดนั้น (กลุ่มเดียวกันขึ้นครั้งเดียว)
CREATE TABLE IF NOT EXISTS `tb_requirement_groups` (
  `rqg_id` int unsigned NOT NULL AUTO_INCREMENT,
  `rqg_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqg_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rqg_is_general` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ถามทุกคำขอ ไม่ขึ้นกับหมวด',
  `rqg_sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `rqg_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `rqg_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rqg_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rqg_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_requirement_group_categories` (
  `rgc_group_id` int unsigned NOT NULL,
  `rgc_category_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`rgc_group_id`,`rgc_category_id`),
  KEY `fk_rgc_category` (`rgc_category_id`),
  CONSTRAINT `fk_rgc_category` FOREIGN KEY (`rgc_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rgc_group` FOREIGN KEY (`rgc_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-25 รายการที่ทีมงานเลือกให้ในลิงก์ (ล็อก ลูกค้าเอาออก/แก้จำนวนไม่ได้ · ราคาปัจจุบันของสินค้า/ชุด) · มีสินค้าหรือชุดอย่างใดอย่างหนึ่ง
CREATE TABLE IF NOT EXISTS `tb_order_link_items` (
  `oli_id` int unsigned NOT NULL AUTO_INCREMENT,
  `oli_link_id` int unsigned NOT NULL,
  `oli_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `oli_package_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `oli_quantity` int unsigned NOT NULL DEFAULT '1',
  `oli_order` int unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`oli_id`),
  KEY `idx_oli_link` (`oli_link_id`,`oli_order`),
  KEY `fk_oli_product` (`oli_product_id`),
  KEY `fk_oli_package` (`oli_package_id`),
  CONSTRAINT `fk_oli_link` FOREIGN KEY (`oli_link_id`) REFERENCES `tb_order_links` (`ol_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_oli_package` FOREIGN KEY (`oli_package_id`) REFERENCES `tb_product_packages` (`pkg_id`),
  CONSTRAINT `fk_oli_product` FOREIGN KEY (`oli_product_id`) REFERENCES `tb_products` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-25 กติกางานเพิ่มต่อแพ็ก: included = มีในแพ็กแล้ว (กดซื้อไม่ได้) · not_available = ใช้กับแพ็กนี้ไม่ได้ (ซ่อน) · ไม่มีแถว = ซื้อได้
CREATE TABLE IF NOT EXISTS `tb_package_addon_rules` (
  `par_package_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `par_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `par_rule` enum('included','not_available') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`par_package_id`,`par_product_id`),
  KEY `fk_par_product` (`par_product_id`),
  CONSTRAINT `fk_par_package` FOREIGN KEY (`par_package_id`) REFERENCES `tb_product_packages` (`pkg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_par_product` FOREIGN KEY (`par_product_id`) REFERENCES `tb_products` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-25 กลุ่มคำถามที่ถามเฉพาะเมื่อเลือกแพ็กนี้ (นอกจากผูกหมวด)
CREATE TABLE IF NOT EXISTS `tb_requirement_group_packages` (
  `rgp_group_id` int unsigned NOT NULL,
  `rgp_package_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`rgp_group_id`,`rgp_package_id`),
  KEY `fk_rgp_package` (`rgp_package_id`),
  CONSTRAINT `fk_rgp_group` FOREIGN KEY (`rgp_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rgp_package` FOREIGN KEY (`rgp_package_id`) REFERENCES `tb_product_packages` (`pkg_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ชนิดคำตอบ: short_text long_text single multi yes_no number date url file · rqq_options = ตัวเลือก (JSON array ของข้อความ) เฉพาะ single/multi
CREATE TABLE IF NOT EXISTS `tb_requirement_questions` (
  `rqq_id` int unsigned NOT NULL AUTO_INCREMENT,
  `rqq_group_id` int unsigned NOT NULL,
  `rqq_text` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqq_help` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ข้อความช่วยใต้คำถาม (ตัวอย่างคำตอบ)',
  `rqq_type` enum('short_text','long_text','single','multi','yes_no','number','date','url','file') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqq_options` json DEFAULT NULL,
  `rqq_is_required` tinyint(1) NOT NULL DEFAULT '0',
  `rqq_sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `rqq_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `rqq_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rqq_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rqq_id`),
  KEY `idx_rqq_group` (`rqq_group_id`,`rqq_sort_order`),
  CONSTRAINT `fk_rqq_group` FOREIGN KEY (`rqq_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำตอบในคำขอ (2026-10-25 · S-2) — ชื่อกลุ่ม/ข้อความคำถาม/ชนิด ณ วันส่ง (คัดลอกเพราะคำถามแก้หรือลบทีหลังได้ คำตอบต้องอ่านคู่กับคำถามเดิม)
-- sva_value: ข้อความ · multi = JSON array · yes_no = yes/no · file = ว่าง (ไฟล์อยู่ใน tb_service_request_files)
CREATE TABLE IF NOT EXISTS `tb_service_request_answers` (
  `sva_id` int unsigned NOT NULL AUTO_INCREMENT,
  `sva_request_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sva_question_id` int unsigned DEFAULT NULL,
  `sva_order` smallint unsigned NOT NULL,
  `sva_group_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sva_question_text` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sva_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `sva_value` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`sva_id`),
  KEY `idx_sva_request` (`sva_request_id`,`sva_order`),
  KEY `fk_sva_question` (`sva_question_id`),
  CONSTRAINT `fk_sva_question` FOREIGN KEY (`sva_question_id`) REFERENCES `tb_requirement_questions` (`rqq_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sva_request` FOREIGN KEY (`sva_request_id`) REFERENCES `tb_service_requests` (`svr_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์แนบของคำตอบ (รูป/PDF) — เก็บที่ storage/ (ไม่เปิดสาธารณะ) เปิดได้ทาง API ที่ตรวจสิทธิ์
CREATE TABLE IF NOT EXISTS `tb_service_request_files` (
  `svf_id` int unsigned NOT NULL AUTO_INCREMENT,
  `svf_answer_id` int unsigned NOT NULL,
  `svf_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svf_original_name` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `svf_size` int unsigned NOT NULL,
  `svf_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`svf_id`),
  KEY `idx_svf_answer` (`svf_answer_id`),
  CONSTRAINT `fk_svf_answer` FOREIGN KEY (`svf_answer_id`) REFERENCES `tb_service_request_answers` (`sva_id`) ON DELETE CASCADE
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
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_permission') = 0, 'ALTER TABLE `tb_roles` ADD COLUMN `role_permission` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '''' AFTER `role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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
-- 2026-10-24 P-1 Fastwork: ช่องทางงานของโปรเจกต์
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_channel') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_channel` enum(''direct'',''fastwork'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''direct'' COMMENT ''ช่องทางงาน: direct = ลูกค้าตรง (ใบเสนอราคา/ใบแจ้งหนี้) · fastwork = รับงานผ่าน fastwork.com (รายได้จากการโอนของแพลตฟอร์ม)'' AFTER `project_use_task_weight`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_fastwork_order_no') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_fastwork_order_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขคำสั่งซื้อบน Fastwork'' AFTER `project_channel`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_projects' AND COLUMN_NAME = 'project_fastwork_url') = 0, 'ALTER TABLE `tb_projects` ADD COLUMN `project_fastwork_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ลิงก์หน้างานบน Fastwork'' AFTER `project_fastwork_order_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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

-- tb_company_settings — ค่าเริ่มต้นใบแจ้งหนี้ (2026-10-14 ช่วง 1B)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_default_credit_days') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_default_credit_days` int NOT NULL DEFAULT ''30'' COMMENT ''เครดิตเทอมของใบแจ้งหนี้เมื่อลูกค้าไม่ได้ตั้งเอง (วัน) 0-365'' AFTER `cs_allow_self_approval`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_promptpay_id') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_promptpay_id` varchar(15) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขพร้อมเพย์รับเงิน (มือถือ 10 หลัก / เลขผู้เสียภาษี 13 หลัก) ว่าง = ไม่พิมพ์ QR'' AFTER `cs_default_credit_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_invoice_notes_th') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_invoice_notes_th` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''หมายเหตุท้ายใบแจ้งหนี้เริ่มต้น (เอกสารภาษาไทย)'' AFTER `cs_promptpay_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_invoice_notes_en') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_invoice_notes_en` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''หมายเหตุท้ายใบแจ้งหนี้เริ่มต้น (เอกสารภาษาอังกฤษ)'' AFTER `cs_invoice_notes_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-24 P-1 Fastwork: อัตราค่าธรรมเนียมเริ่มต้น
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_fastwork_fee_rate') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_fastwork_fee_rate` decimal(5,2) NOT NULL DEFAULT ''17.00'' COMMENT ''ค่าธรรมเนียม Fastwork เริ่มต้น (% ของราคางวด) · แก้ได้ทุกรายการ · ตรวจอัตราจริงในบัญชี Fastwork'' AFTER `cs_invoice_notes_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_fastwork_fee_vat_rate') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_fastwork_fee_vat_rate` decimal(5,2) NOT NULL DEFAULT ''0.00'' COMMENT ''VAT ของค่าธรรมเนียม Fastwork (% ของค่าธรรมเนียม) · 0 = ไม่มี'' AFTER `cs_fastwork_fee_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_fastwork_wht_rate') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_fastwork_wht_rate` decimal(5,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หัก ณ ที่จ่ายที่ Fastwork หัก (% ของราคางวด) · รอนักบัญชียืนยัน Z2'' AFTER `cs_fastwork_fee_vat_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-25 P-3 เงินทุน: วันที่จดบริษัท + เป้าเงินทุน
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_incorporated_on') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_incorporated_on` date DEFAULT NULL COMMENT ''วันที่จดบริษัท (นิติบุคคล) · ว่าง = ยังเป็นบุคคลธรรมดา (ช่วงก่อนจดบริษัท)'' AFTER `cs_fastwork_wht_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_capital_goal') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_capital_goal` decimal(15,2) DEFAULT NULL COMMENT ''เป้าเงินทุนก่อนจดบริษัท · ว่าง = ยังไม่ตั้ง'' AFTER `cs_incorporated_on`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_capital_target_date') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_capital_target_date` date DEFAULT NULL COMMENT ''วันที่ตั้งใจจดบริษัท (ไม่บังคับ)'' AFTER `cs_capital_goal`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-25 ลิงก์เลือกบริการ: หน้าร้านของสินค้า/ชุด + ผู้รับคำขอเริ่มต้น
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_products' AND COLUMN_NAME = 'product_is_public') = 0, 'ALTER TABLE `tb_products` ADD COLUMN `product_is_public` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)'' AFTER `product_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_products' AND COLUMN_NAME = 'product_image_url') = 0, 'ALTER TABLE `tb_products` ADD COLUMN `product_image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''รูปบนหน้าร้าน (/uploads/catalog/...)'' AFTER `product_is_public`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_product_packages' AND COLUMN_NAME = 'pkg_is_public') = 0, 'ALTER TABLE `tb_product_packages` ADD COLUMN `pkg_is_public` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)'' AFTER `pkg_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_product_packages' AND COLUMN_NAME = 'pkg_image_url') = 0, 'ALTER TABLE `tb_product_packages` ADD COLUMN `pkg_image_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''รูปบนหน้าร้าน (/uploads/catalog/...)'' AFTER `pkg_is_public`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_settings' AND COLUMN_NAME = 'cs_service_request_assignee_id') = 0, 'ALTER TABLE `tb_company_settings` ADD COLUMN `cs_service_request_assignee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้รับคำขอบริการเริ่มต้น (ลิงก์ที่ไม่ได้เลือกคนเอง)'' AFTER `cs_capital_target_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-25 S-3 ผู้รับผิดชอบปรับรายการในคำขอ
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_adjusted_quantity') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_adjusted_quantity` decimal(12,2) DEFAULT NULL COMMENT ''จำนวนที่ผู้รับผิดชอบปรับ (ว่าง = ตามที่ลูกค้าเลือก)'' AFTER `svi_quantity`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_adjusted_unit_price') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_adjusted_unit_price` decimal(15,2) DEFAULT NULL COMMENT ''ราคาที่ผู้รับผิดชอบปรับ (ว่าง = ราคา ณ วันส่ง)'' AFTER `svi_adjusted_quantity`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_is_removed') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_is_removed` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''ผู้รับผิดชอบเอาออก (แถวลูกค้ายังเก็บไว้ดูว่าเคยเลือก)'' AFTER `svi_adjusted_unit_price`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_added_by_staff') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_added_by_staff` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''ผู้รับผิดชอบเพิ่มเอง (ลูกค้าไม่ได้เลือก)'' AFTER `svi_is_removed`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-25 S-4 ลูกค้ายอมรับใบเสนอราคาในลิงก์
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_requests' AND COLUMN_NAME = 'svr_accepted_name') = 0, 'ALTER TABLE `tb_service_requests` ADD COLUMN `svr_accepted_name` varchar(150) DEFAULT NULL COMMENT ''ชื่อที่ลูกค้าพิมพ์ยืนยันตอนกดยอมรับใบเสนอราคาในลิงก์ (S-4)'' AFTER `svr_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_requests' AND COLUMN_NAME = 'svr_accepted_at') = 0, 'ALTER TABLE `tb_service_requests` ADD COLUMN `svr_accepted_at` datetime DEFAULT NULL COMMENT ''เวลาที่ลูกค้ากดยอมรับในลิงก์ (เวลาไทย)'' AFTER `svr_accepted_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-25 หน้าร้านตรงกับของที่ขาย: รายการล็อกในลิงก์ · เลือกได้อย่างเดียวในหมวด · งานเพิ่มแบบ %
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_product_categories' AND COLUMN_NAME = 'pc_is_single_choice') = 0, 'ALTER TABLE `tb_product_categories` ADD COLUMN `pc_is_single_choice` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''ลูกค้าเลือกได้รายการเดียวในหมวดนี้ เช่น แพ็กเกจ (ใส่อันใหม่ = แทนอันเดิมในตะกร้า)'' AFTER `pc_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_products' AND COLUMN_NAME = 'product_price_mode') = 0, 'ALTER TABLE `tb_products` ADD COLUMN `product_price_mode` enum(''fixed'',''percent'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''fixed'' COMMENT ''percent = คิดเป็น % ของยอดรายการอื่นก่อน VAT เช่น งานด่วน +30%'' AFTER `product_is_public`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_products' AND COLUMN_NAME = 'product_percent') = 0, 'ALTER TABLE `tb_products` ADD COLUMN `product_percent` decimal(5,2) DEFAULT NULL COMMENT ''percent: อัตรา % (ไม่ใช้ product_price)'' AFTER `product_price_mode`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_order_links' AND COLUMN_NAME = 'ol_allow_more') = 0, 'ALTER TABLE `tb_order_links` ADD COLUMN `ol_allow_more` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''ลูกค้าเลือกเพิ่มเองได้ (0 = มีแต่รายการที่ทีมเลือกให้)'' AFTER `ol_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_is_preset') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_is_preset` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''ทีมเลือกให้ในลิงก์ (สำเนาตอนส่ง เพราะรายการของลิงก์แก้ได้ภายหลัง)'' AFTER `svi_added_by_staff`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_service_request_items' AND COLUMN_NAME = 'svi_percent') = 0, 'ALTER TABLE `tb_service_request_items` ADD COLUMN `svi_percent` decimal(5,2) DEFAULT NULL COMMENT ''งานเพิ่มแบบ %: อัตรา ณ วันส่ง · ยอดคิดจากยอดรายการอื่น (หลังปรับ) ทุกครั้ง ไม่เก็บยอดซ้ำ'' AFTER `svi_is_preset`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoices
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_number') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''IV-yyyymmdd-xxxxxx ออกตอนออกใบ — ยกเลิกแล้วเลขยังอยู่'' AFTER `inv_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_status') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_status` enum(''draft'',''pending_approval'',''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `inv_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_version') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `inv_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_source') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_source` enum(''quotation'',''manual'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''quotation = ออกจากงวดของใบเสนอราคา (ยอดล็อก) · manual = สร้างเอง (ต้องอนุมัติ)'' AFTER `inv_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_quotation_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_quotation_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_source`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_project_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_quotation_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_client_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inv_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_branch_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inv_client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_reissued_from_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_reissued_from_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ออกใหม่แทนใบที่ยกเลิกใบไหน'' AFTER `inv_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_title') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inv_reissued_from_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_language') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_language` enum(''th'',''en'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''th'' AFTER `inv_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_currency') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `inv_language`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_exchange_rate') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_exchange_rate` decimal(20,10) NOT NULL DEFAULT ''1.0000000000'' COMMENT ''บาทต่อ 1 หน่วย ณ วันที่ออก — ใช้คิดยอดบาทภายใน'' AFTER `inv_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_rate_source') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_rate_source` enum(''bot'',''manual'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ว่าง = เอกสารบาท'' AFTER `inv_exchange_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_rate_date') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_rate_date` date DEFAULT NULL AFTER `inv_rate_source`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_rate_bot') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_rate_bot` decimal(20,10) DEFAULT NULL AFTER `inv_rate_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_rate_override_reason') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_rate_override_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_rate_bot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_vat_treatment') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_vat_treatment` enum(''standard'',''zero'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''standard'' AFTER `inv_rate_override_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credit_days') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credit_days` int NOT NULL DEFAULT ''30'' COMMENT ''เครดิตเทอม (วัน) 0-365'' AFTER `inv_vat_treatment`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issue_date') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issue_date` date DEFAULT NULL COMMENT ''วันที่ออก (เวลาไทย) ย้อนไม่ได้'' AFTER `inv_credit_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_due_date') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_due_date` date DEFAULT NULL COMMENT ''วันที่ออก + เครดิต'' AFTER `inv_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_subtotal') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_subtotal` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_discount_type') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_discount_type` enum(''amount'',''percent'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''amount'' AFTER `inv_subtotal`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_discount_value') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_discount_value` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_discount_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_discount_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_discount_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_discount_value`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_after_discount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_after_discount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดก่อน VAT'' AFTER `inv_discount_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_vat_rate') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_vat_rate` decimal(5,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_after_discount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_vat_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_vat_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_vat_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_total') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_vat_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_after_discount_thb') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_after_discount_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดก่อน VAT เป็นบาท — ใช้เทียบเกณฑ์อนุมัติ (ใบสร้างเอง)'' AFTER `inv_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_total_thb') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_total_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `inv_after_discount_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_wht_rate') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_wht_rate` decimal(5,2) DEFAULT NULL COMMENT ''อัตราหัก ณ ที่จ่ายที่แสดงบนใบ — ว่าง = ไม่แสดง (ยอดหักจริงบันทึกตอนรับเงิน 1C)'' AFTER `inv_total_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_wht_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_wht_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ประมาณการ = ยอดก่อน VAT × อัตรา'' AFTER `inv_wht_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_paid_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_paid_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดรับชำระแล้ว (ช่วง 1C)'' AFTER `inv_wht_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_notes') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''หมายเหตุที่พิมพ์บนเอกสาร'' AFTER `inv_paid_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_internal_note') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''บันทึกภายใน — ไม่พิมพ์'' AFTER `inv_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_bank_account_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บัญชีรับเงินที่พิมพ์บนใบ'' AFTER `inv_internal_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_client_snapshot') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_client_snapshot` json DEFAULT NULL COMMENT ''ข้อมูลลูกค้า ณ วันออก'' AFTER `inv_bank_account_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_company_snapshot') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_company_snapshot` json DEFAULT NULL COMMENT ''ข้อมูลบริษัท + สาขา ณ วันออก'' AFTER `inv_client_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_bank_snapshot') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_bank_snapshot` json DEFAULT NULL COMMENT ''บัญชีรับเงิน + พร้อมเพย์ ณ วันออก'' AFTER `inv_company_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_approval_round') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_approval_round` int unsigned NOT NULL DEFAULT ''0'' AFTER `inv_bank_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_approval_current_level') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_approval_current_level` tinyint unsigned DEFAULT NULL AFTER `inv_approval_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_approval_plan') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_approval_plan` json DEFAULT NULL AFTER `inv_approval_current_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_returned_reason') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_approval_plan`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_created_by') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_returned_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_created_by_name') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_submitted_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_submitted_at` datetime DEFAULT NULL AFTER `inv_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issued_by') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้กดออก (ใบสร้างเอง = ผู้อนุมัติชั้นสุดท้าย)'' AFTER `inv_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issued_by_name') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issued_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_issued_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issued_by_title') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issued_by_title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_issued_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issuer_signature_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issuer_signature_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ลายเซ็นผู้ออก ฉบับตอนออก'' AFTER `inv_issued_by_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_issued_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_issued_at` datetime DEFAULT NULL AFTER `inv_issuer_signature_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_sent_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_sent_at` datetime DEFAULT NULL AFTER `inv_issued_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_cancelled_by') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_sent_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_cancelled_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_cancelled_at` datetime DEFAULT NULL AFTER `inv_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_cancel_reason') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inv_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_created_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `inv_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_updated_at') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `inv_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_id') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_invoice_id') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `invi_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_order') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_order` int NOT NULL DEFAULT ''0'' AFTER `invi_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_type') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_type` enum(''item'',''heading'',''note'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''item'' AFTER `invi_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_product_id') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `invi_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_description') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `invi_product_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_quantity') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_quantity` decimal(12,2) DEFAULT NULL AFTER `invi_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_unit') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_unit` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `invi_quantity`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_unit_price') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_unit_price` decimal(15,2) DEFAULT NULL AFTER `invi_unit`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_list_price') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_list_price` decimal(15,2) DEFAULT NULL AFTER `invi_unit_price`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_discount_type') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_discount_type` enum(''amount'',''percent'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''amount'' AFTER `invi_list_price`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_discount_value') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_discount_value` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `invi_discount_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_discount_amount') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_discount_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `invi_discount_value`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND COLUMN_NAME = 'invi_amount') = 0, 'ALTER TABLE `tb_invoice_items` ADD COLUMN `invi_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `invi_discount_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_milestones
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND COLUMN_NAME = 'ivm_invoice_id') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD COLUMN `ivm_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND COLUMN_NAME = 'ivm_milestone_id') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD COLUMN `ivm_milestone_id` bigint unsigned NOT NULL AFTER `ivm_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND COLUMN_NAME = 'ivm_amount') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD COLUMN `ivm_amount` decimal(15,2) NOT NULL COMMENT ''ยอดงวดตามใบเสนอราคา (รวม VAT ของใบเสนอราคา)'' AFTER `ivm_milestone_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND COLUMN_NAME = 'ivm_base') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD COLUMN `ivm_base` decimal(15,2) NOT NULL COMMENT ''ส่วนที่เป็นยอดก่อน VAT'' AFTER `ivm_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND COLUMN_NAME = 'ivm_vat') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD COLUMN `ivm_vat` decimal(15,2) NOT NULL COMMENT ''ส่วนที่เป็น VAT ตามใบเสนอราคา'' AFTER `ivm_base`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_id') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_invoice_id') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inva_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_round') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_round` int unsigned NOT NULL AFTER `inva_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_level') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_level` tinyint unsigned NOT NULL AFTER `inva_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_action') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_action` enum(''approve'',''return'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inva_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_user_id') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inva_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_user_name') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `inva_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_role_id') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่'' AFTER `inva_user_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_role_name') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inva_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_reason') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `inva_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND COLUMN_NAME = 'inva_created_at') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD COLUMN `inva_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `inva_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_notes
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_id') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_number') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''BN-yyyymmdd-xxxxxx ออกตอนออกใบ'' AFTER `bn_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_status') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_status` enum(''draft'',''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `bn_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_version') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `bn_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_client_id') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `bn_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_branch_id') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `bn_client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_currency') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `bn_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_language') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_language` enum(''th'',''en'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''th'' AFTER `bn_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_issue_date') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_issue_date` date DEFAULT NULL AFTER `bn_language`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_payment_date') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_payment_date` date DEFAULT NULL COMMENT ''วันนัดชำระ (ลูกค้านัด)'' AFTER `bn_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_total') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ผลรวมยอดใบแจ้งหนี้ ณ ตอนออก'' AFTER `bn_payment_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_notes') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `bn_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_client_snapshot') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_client_snapshot` json DEFAULT NULL AFTER `bn_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_company_snapshot') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_company_snapshot` json DEFAULT NULL AFTER `bn_client_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_created_by') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `bn_company_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_created_by_name') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `bn_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_issued_at') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_issued_at` datetime DEFAULT NULL AFTER `bn_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_cancelled_by') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `bn_issued_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_cancelled_at') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_cancelled_at` datetime DEFAULT NULL AFTER `bn_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_cancel_reason') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `bn_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_created_at') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `bn_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND COLUMN_NAME = 'bn_updated_at') = 0, 'ALTER TABLE `tb_billing_notes` ADD COLUMN `bn_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `bn_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_note_invoices
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND COLUMN_NAME = 'bni_billing_note_id') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD COLUMN `bni_billing_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND COLUMN_NAME = 'bni_invoice_id') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD COLUMN `bni_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `bni_billing_note_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND COLUMN_NAME = 'bni_order') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD COLUMN `bni_order` int NOT NULL DEFAULT ''0'' AFTER `bni_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND COLUMN_NAME = 'bni_amount') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD COLUMN `bni_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `bni_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ ช่วง 1C (2026-10-15) — ใบเสร็จรับเงิน

-- tb_receipts
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_id') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_number') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''RE-yyyymmdd-xxxxxx วันที่ในเลข = วันที่ใบเสร็จ'' AFTER `rc_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_status') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_status` enum(''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''issued'' AFTER `rc_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_version') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `rc_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_client_id') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `rc_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_branch_id') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `rc_client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_currency') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `rc_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_language') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_language` enum(''th'',''en'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''th'' AFTER `rc_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_receipt_date') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_receipt_date` date NOT NULL COMMENT ''วันที่ได้รับเงิน (ย้อนหลังได้ไม่เกิน 30 วัน)'' AFTER `rc_language`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_method') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_method` enum(''transfer'',''cheque'',''cash'',''other'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `rc_receipt_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_bank_account_id') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บัญชีที่เงินเข้า (บังคับเมื่อโอน)'' AFTER `rc_method`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_reference') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น'' AFTER `rc_bank_account_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cheque_no') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cheque_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `rc_reference`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cheque_bank') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cheque_bank` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `rc_cheque_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cheque_date') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cheque_date` date DEFAULT NULL AFTER `rc_cheque_bank`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_allocated_total') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_allocated_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ผลรวมยอดตัดหนี้'' AFTER `rc_cheque_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_amount') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หัก ณ ที่จ่ายที่ลูกค้าหักจริง'' AFTER `rc_allocated_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_fee_amount') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_fee_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ค่าธรรมเนียมที่ถูกหักก่อนเงินเข้า'' AFTER `rc_wht_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_received_amount') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_received_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินเข้าจริง (สกุลของใบ) = ตัดหนี้ - หัก - ค่าธรรมเนียม'' AFTER `rc_fee_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_received_thb') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_received_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดบาทที่เข้าบัญชีจริง (บาท = เท่า received)'' AFTER `rc_received_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_actual_rate') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_actual_rate` decimal(20,10) DEFAULT NULL COMMENT ''อัตราจริง = received_thb / received (สกุลต่างประเทศ)'' AFTER `rc_received_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_allocated_thb') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_allocated_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดหนี้เป็นบาทตามอัตราของใบแจ้งหนี้'' AFTER `rc_actual_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_fx_diff_thb') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนต่างอัตรา บวก = กำไร'' AFTER `rc_allocated_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_certificate_no') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_certificate_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขที่ใน 50 ทวิ'' AFTER `rc_fx_diff_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_certificate_date') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_certificate_date` date DEFAULT NULL AFTER `rc_wht_certificate_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_file_path') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ไฟล์ 50 ทวิ ใต้ backend/storage (ไม่ใช่ /uploads สาธารณะ)'' AFTER `rc_wht_certificate_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_file_name') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ชื่อไฟล์เดิมที่ผู้ใช้อัปโหลด'' AFTER `rc_wht_file_path`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_wht_file_uploaded_at') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_wht_file_uploaded_at` datetime DEFAULT NULL AFTER `rc_wht_file_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_notes') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `rc_wht_file_uploaded_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_internal_note') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `rc_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_billing_note_id') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_billing_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บันทึกจากใบวางบิลไหน (อ้างอิงเท่านั้น)'' AFTER `rc_internal_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_client_snapshot') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_client_snapshot` json DEFAULT NULL AFTER `rc_billing_note_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_company_snapshot') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_company_snapshot` json DEFAULT NULL AFTER `rc_client_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_bank_snapshot') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_bank_snapshot` json DEFAULT NULL AFTER `rc_company_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_created_by') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้รับเงิน'' AFTER `rc_bank_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_created_by_name') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `rc_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cancelled_by') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `rc_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cancelled_at') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cancelled_at` datetime DEFAULT NULL AFTER `rc_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_cancel_reason') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `rc_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_created_at') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `rc_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND COLUMN_NAME = 'rc_updated_at') = 0, 'ALTER TABLE `tb_receipts` ADD COLUMN `rc_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `rc_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_receipt_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_receipt_id') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_receipt_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_invoice_id') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `rca_receipt_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_order') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_order` int NOT NULL DEFAULT ''0'' AFTER `rca_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_amount') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดหนี้ใบนี้ (สกุลของใบ)'' AFTER `rca_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_vat_amount') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_vat_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''VAT ส่วนที่รับครั้งนี้'' AFTER `rca_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_amount_thb') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_amount_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดเป็นบาทตามอัตราของใบแจ้งหนี้'' AFTER `rca_vat_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND COLUMN_NAME = 'rca_credited_before') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD COLUMN `rca_credited_before` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดใบลดหนี้ของใบแจ้งหนี้ ณ ตอนออกใบเสร็จ (2026-10-18 — คงค้างบนใบเสร็จไม่เปลี่ยนภายหลัง)'' AFTER `rca_amount_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 2 (2026-10-16) — ผู้ขาย / หมวดค่าใช้จ่าย / ประเภทเงินได้

-- tb_wht_income_types
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_code') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''เช่น SERVICE, ADVERTISING — ใช้อ้างในโค้ด เปลี่ยนไม่ได้'' FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_name_th') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_name_th` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `wit_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_name_en') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_name_en` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `wit_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_form_row') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_form_row` tinyint unsigned NOT NULL DEFAULT ''5'' COMMENT ''แถวบน 50 ทวิ: 1 เงินเดือน 2 ค่าธรรมเนียม/นายหน้า 3 ค่าลิขสิทธิ์ 4 ดอกเบี้ย/ปันผล 5 ตามมาตรา 3 เตรส 6 อื่นๆ'' AFTER `wit_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_form_label') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_form_label` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ข้อความประเภทเงินได้ที่พิมพ์บน 50 ทวิ'' AFTER `wit_form_row`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_status') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_status` enum(''active'',''inactive'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `wit_form_label`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_sort_order') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_sort_order` int NOT NULL DEFAULT ''0'' AFTER `wit_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_created_at') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `wit_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_income_types' AND COLUMN_NAME = 'wit_updated_at') = 0, 'ALTER TABLE `tb_wht_income_types` ADD COLUMN `wit_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `wit_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_income_type') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_effective_from') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_effective_from` date NOT NULL AFTER `wr_income_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_rate') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_rate` decimal(5,2) NOT NULL COMMENT ''เช่น 3.00'' AFTER `wr_effective_from`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_min_payment') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_min_payment` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''จ่ายต่อครั้ง (ก่อน VAT) ต่ำกว่านี้ไม่ต้องหัก — 0 = หักทุกยอด'' AFTER `wr_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_note') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ที่มา เช่น เลขคำสั่งกรมสรรพากร'' AFTER `wr_min_payment`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_created_by') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `wr_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND COLUMN_NAME = 'wr_created_at') = 0, 'ALTER TABLE `tb_wht_rates` ADD COLUMN `wr_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `wr_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_categories
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_id') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_name_th') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ec_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_name_en') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_account_code') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_account_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''รหัสบัญชี (เฟส 3) — ตามผังบัญชีของนักบัญชี (คำถาม X6)'' AFTER `ec_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_default_income_type') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_default_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_account_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_is_asset') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_is_asset` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = ของชิ้นใหญ่ ไว้ย้ายไปทะเบียนทรัพย์สิน (เฟส 6)'' AFTER `ec_default_income_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_status') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_status` enum(''active'',''inactive'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `ec_is_asset`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_sort_order') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_sort_order` int NOT NULL DEFAULT ''0'' AFTER `ec_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_created_at') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ec_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND COLUMN_NAME = 'ec_updated_at') = 0, 'ALTER TABLE `tb_expense_categories` ADD COLUMN `ec_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `ec_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_vendors
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_id') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_code') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''รหัสสั้นตั้งเอง (ไม่บังคับ)'' AFTER `vd_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_type') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_type` enum(''juristic'',''individual'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''juristic'' AFTER `vd_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_country') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_country` char(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''TH'' AFTER `vd_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_name') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ชื่อตามเอกสารภาษี (บริษัท / ชื่อ-นามสกุล)'' AFTER `vd_country`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_tax_id') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_tax_id` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_branch_code') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_branch_code` varchar(5) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''00000 = สำนักงานใหญ่'' AFTER `vd_tax_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_address') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''ที่อยู่สำหรับ 50 ทวิ'' AFTER `vd_branch_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_contact_name') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_contact_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_address`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_email') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_contact_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_phone') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_bank_name') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_phone`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_bank_account_no') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_bank_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_bank_account_name') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_bank_account_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_bank_account_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_promptpay_id') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_promptpay_id` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_bank_account_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_credit_days') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_credit_days` int DEFAULT NULL COMMENT ''ว่าง = ครบกำหนดวันที่เอกสาร'' AFTER `vd_promptpay_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_currency') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `vd_credit_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_default_income_type') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_default_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ว่าง = ใช้ของหมวดค่าใช้จ่าย'' AFTER `vd_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_default_category_id') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_default_category_id` int unsigned DEFAULT NULL AFTER `vd_default_income_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_notes') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `vd_default_category_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_status') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_status` enum(''active'',''inactive'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `vd_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_created_by') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `vd_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_created_at') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `vd_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND COLUMN_NAME = 'vd_updated_at') = 0, 'ALTER TABLE `tb_vendors` ADD COLUMN `vd_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `vd_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 2 ขั้น 2-2 (2026-10-16) — ค่าใช้จ่าย / บิลผู้ขาย

-- tb_expenses
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_id') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_number') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''EX-/EC-yyyymmdd-xxxxxx ได้ตอนอนุมัติครบ (หรือผ่านอัตโนมัติ) — ร่างไม่มีเลข ลบได้โดยเลขไม่ข้าม'' AFTER `ex_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_kind') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_kind` enum(''bill'',''claim'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''bill'' AFTER `ex_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_status') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_status` enum(''draft'',''pending_approval'',''approved'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `ex_kind`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_version') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `ex_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vendor_id') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บิลผู้ขาย'' AFTER `ex_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_employee_id') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ใบเบิก — ผู้เบิก (ผู้รับเงิน)'' AFTER `ex_vendor_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_merchant_name') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_merchant_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ใบเบิก — ชื่อร้าน/ผู้ขายตามใบเสร็จ (ผู้ขายนอกทะเบียน)'' AFTER `ex_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_branch_id') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ex_merchant_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_title') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_title` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ex_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vendor_doc_no') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vendor_doc_no` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขที่เอกสารของผู้ขาย — ผู้ขายเดียวกันซ้ำในใบที่ไม่ยกเลิกไม่ได้ (R-P2)'' AFTER `ex_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vendor_doc_date') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vendor_doc_date` date DEFAULT NULL AFTER `ex_vendor_doc_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_doc_type') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_doc_type` enum(''tax_invoice'',''abbreviated_tax_invoice'',''receipt'',''invoice'',''substitute_receipt'',''none'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''receipt'' AFTER `ex_vendor_doc_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_expense_date') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_expense_date` date NOT NULL COMMENT ''วันที่ค่าใช้จ่ายเกิด (วันที่ในเอกสาร/วันที่จ่ายไปก่อน)'' AFTER `ex_doc_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_credit_days') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_credit_days` int NOT NULL DEFAULT ''0'' AFTER `ex_expense_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_due_date') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_due_date` date NOT NULL COMMENT ''วันที่ค่าใช้จ่าย + เครดิต'' AFTER `ex_credit_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_currency') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `ex_due_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_exchange_rate') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_exchange_rate` decimal(20,10) NOT NULL DEFAULT ''1.0000000000'' AFTER `ex_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_rate_source') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_rate_source` enum(''bot'',''manual'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_exchange_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_rate_date') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_rate_date` date DEFAULT NULL AFTER `ex_rate_source`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_rate_override_reason') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_rate_override_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_rate_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_subtotal') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_subtotal` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดก่อน VAT'' AFTER `ex_rate_override_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vat_rate') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vat_rate` decimal(5,2) NOT NULL DEFAULT ''0.00'' AFTER `ex_subtotal`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vat_amount') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vat_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ตามเอกสารผู้ขาย'' AFTER `ex_vat_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_vat_claimable') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_vat_claimable` tinyint(1) NOT NULL DEFAULT ''0'' AFTER `ex_vat_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_total') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `ex_vat_claimable`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_subtotal_thb') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_subtotal_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `ex_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_total_thb') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_total_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `ex_subtotal_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_wht_income_type') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_wht_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_total_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_wht_rate') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_wht_rate` decimal(5,2) DEFAULT NULL AFTER `ex_wht_income_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_wht_amount') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_wht_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ประมาณการ — หักจริงตอนทำจ่าย'' AFTER `ex_wht_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_paid_amount') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_paid_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ผลรวมตัดหนี้ของใบสำคัญจ่ายที่ไม่ยกเลิก (ขั้น 2-4)'' AFTER `ex_wht_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_notes') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `ex_paid_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_approval_plan') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_approval_plan` json DEFAULT NULL AFTER `ex_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_approval_round') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_approval_round` int unsigned NOT NULL DEFAULT ''0'' AFTER `ex_approval_plan`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_approval_current_level') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_approval_current_level` tinyint unsigned DEFAULT NULL AFTER `ex_approval_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_auto_approved') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_auto_approved` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = ยอดต่ำกว่าวงเงินชั้น 1 ผ่านอัตโนมัติ (P2)'' AFTER `ex_approval_current_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_submitted_at') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_submitted_at` datetime DEFAULT NULL AFTER `ex_auto_approved`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_returned_reason') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_approved_at') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_approved_at` datetime DEFAULT NULL AFTER `ex_returned_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_created_by') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_approved_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_created_by_name') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_cancelled_by') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_cancelled_at') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_cancelled_at` datetime DEFAULT NULL AFTER `ex_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_cancel_reason') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ex_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_created_at') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ex_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND COLUMN_NAME = 'ex_updated_at') = 0, 'ALTER TABLE `tb_expenses` ADD COLUMN `ex_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `ex_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_id') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_expense_id') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `exl_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_order') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_order` int NOT NULL DEFAULT ''0'' AFTER `exl_expense_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_category_id') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_category_id` int unsigned NOT NULL AFTER `exl_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_project_id') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `exl_category_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_description') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `exl_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_quantity') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_quantity` decimal(12,2) NOT NULL DEFAULT ''1.00'' AFTER `exl_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_unit_price') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_unit_price` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `exl_quantity`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND COLUMN_NAME = 'exl_amount') = 0, 'ALTER TABLE `tb_expense_lines` ADD COLUMN `exl_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `exl_unit_price`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_attachments
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_id') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_expense_id') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `exf_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_file_path') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `exf_expense_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_file_name') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `exf_file_path`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_file_size') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_file_size` int unsigned NOT NULL DEFAULT ''0'' AFTER `exf_file_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_uploaded_by') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_uploaded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `exf_file_size`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND COLUMN_NAME = 'exf_uploaded_at') = 0, 'ALTER TABLE `tb_expense_attachments` ADD COLUMN `exf_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `exf_uploaded_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_id') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_expense_id') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `expa_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_round') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_round` int unsigned NOT NULL AFTER `expa_expense_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_level') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_level` tinyint unsigned NOT NULL AFTER `expa_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_action') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_action` enum(''approve'',''return'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `expa_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_user_id') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `expa_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_user_name') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `expa_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_role_id') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `expa_user_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_role_name') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_role_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `expa_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_reason') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `expa_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND COLUMN_NAME = 'expa_created_at') = 0, 'ALTER TABLE `tb_expense_approvals` ADD COLUMN `expa_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `expa_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 2 ขั้น 2-4 (2026-10-16) — ทำจ่าย / 50 ทวิ

-- tb_payments
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_id') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_number') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''PV-yyyymmdd-xxxxxx วันที่ในเลข = วันที่จ่าย'' AFTER `pv_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_status') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_status` enum(''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''issued'' AFTER `pv_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_version') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `pv_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_payee_kind') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_payee_kind` enum(''vendor'',''employee'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pv_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_vendor_id') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_vendor_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_payee_kind`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_employee_id') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_vendor_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_branch_id') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pv_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_currency') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `pv_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_payment_date') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_payment_date` date NOT NULL COMMENT ''วันที่จ่าย (ย้อนหลังได้ไม่เกิน 30 วัน — อัตราหัก ณ ที่จ่ายใช้ของวันนี้)'' AFTER `pv_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_method') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_method` enum(''transfer'',''cheque'',''cash'',''other'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pv_payment_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_bank_account_id') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บัญชีบริษัทที่จ่ายออก (บังคับเมื่อโอน/เช็ค)'' AFTER `pv_method`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_reference') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น'' AFTER `pv_bank_account_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_cheque_no') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_cheque_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_reference`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_cheque_date') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_cheque_date` date DEFAULT NULL AFTER `pv_cheque_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_allocated_total') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_allocated_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ผลรวมยอดตัดหนี้'' AFTER `pv_cheque_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_wht_amount') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_wht_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หัก ณ ที่จ่ายจริง (= ยอดภาษีใน 50 ทวิ)'' AFTER `pv_allocated_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_net_paid') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_net_paid` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''จ่ายผู้รับสุทธิ = ตัดหนี้ - หัก'' AFTER `pv_wht_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_fee_amount') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_fee_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ค่าธรรมเนียมโอนที่บริษัทจ่ายเพิ่ม'' AFTER `pv_net_paid`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_allocated_thb') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_allocated_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดหนี้เป็นบาทตามอัตราของรายการ'' AFTER `pv_fee_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_paid_thb') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_paid_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดบาทที่ออกจากบัญชีจริง (ไม่รวมค่าธรรมเนียม)'' AFTER `pv_allocated_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_actual_rate') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_actual_rate` decimal(20,10) DEFAULT NULL COMMENT ''อัตราจริง = paid_thb / net_paid (สกุลต่างประเทศ)'' AFTER `pv_paid_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_fx_diff_thb') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนต่างอัตรา บวก = กำไร (จ่ายบาทน้อยกว่าที่บันทึก)'' AFTER `pv_actual_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_notes') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `pv_fx_diff_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_payee_snapshot') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_payee_snapshot` json DEFAULT NULL COMMENT ''ชื่อ/เลขผู้เสียภาษี/ที่อยู่/บัญชีผู้รับ ณ วันจ่าย (R-P6)'' AFTER `pv_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_company_snapshot') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_company_snapshot` json DEFAULT NULL AFTER `pv_payee_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_bank_snapshot') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_bank_snapshot` json DEFAULT NULL COMMENT ''บัญชีบริษัทที่จ่ายออก ณ วันจ่าย'' AFTER `pv_company_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_created_by') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้ทำจ่าย'' AFTER `pv_bank_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_created_by_name') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_cancelled_by') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_cancelled_at') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_cancelled_at` datetime DEFAULT NULL AFTER `pv_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_cancel_reason') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pv_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_created_at') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `pv_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND COLUMN_NAME = 'pv_updated_at') = 0, 'ALTER TABLE `tb_payments` ADD COLUMN `pv_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `pv_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payment_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_payment_id') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_payment_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_expense_id') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_expense_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pva_payment_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_order') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_order` int NOT NULL DEFAULT ''0'' AFTER `pva_expense_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_amount') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดหนี้รายการนี้ (สกุลของรายการ)'' AFTER `pva_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_base_amount') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_base_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้'' AFTER `pva_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_amount_thb') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_amount_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดตัดเป็นบาทตามอัตราของรายการ'' AFTER `pva_base_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND COLUMN_NAME = 'pva_wht_income_type') = 0, 'ALTER TABLE `tb_payment_allocations` ADD COLUMN `pva_wht_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ประเภทเงินได้ของรายการ ณ วันจ่าย'' AFTER `pva_amount_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificates
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_id') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_number') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''WT-yyyy-xxxxxx'' AFTER `wt_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_book_no') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_book_no` char(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''เล่มที่ = ปี ค.ศ. ของวันที่จ่าย'' AFTER `wt_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_sequence') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_sequence` int unsigned NOT NULL COMMENT ''เลขที่ในเล่ม'' AFTER `wt_book_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_payment_id') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_payment_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `wt_sequence`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_form') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_form` enum(''PND3'',''PND53'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ภ.ง.ด.3 บุคคลธรรมดา / 53 นิติบุคคล'' AFTER `wt_payment_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_payment_date') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_payment_date` date NOT NULL AFTER `wt_form`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_status') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_status` enum(''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''issued'' AFTER `wt_payment_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_total_paid') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_total_paid` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินได้ที่จ่ายรวม (ฐาน)'' AFTER `wt_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_total_tax') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_total_tax` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ภาษีที่หักรวม'' AFTER `wt_total_paid`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_payer_snapshot') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_payer_snapshot` json DEFAULT NULL COMMENT ''บริษัท ณ วันจ่าย'' AFTER `wt_total_tax`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_payee_snapshot') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_payee_snapshot` json DEFAULT NULL COMMENT ''ผู้ถูกหัก ณ วันจ่าย'' AFTER `wt_payer_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_cancelled_at') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_cancelled_at` datetime DEFAULT NULL AFTER `wt_payee_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND COLUMN_NAME = 'wt_created_at') = 0, 'ALTER TABLE `tb_wht_certificates` ADD COLUMN `wt_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `wt_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificate_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_id') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_certificate_id') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_certificate_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `wtl_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_income_type') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_income_type` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `wtl_certificate_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_form_row') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_form_row` tinyint unsigned NOT NULL AFTER `wtl_income_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_form_label') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_form_label` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `wtl_form_row`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_rate') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_rate` decimal(5,2) NOT NULL AFTER `wtl_form_label`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_paid_amount') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_paid_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินได้ที่จ่าย (ยอดก่อน VAT)'' AFTER `wtl_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND COLUMN_NAME = 'wtl_tax_amount') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD COLUMN `wtl_tax_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `wtl_paid_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 4 ขั้น 4-1 (2026-10-17) — พนักงาน / ตั้งค่าบุคคล

-- tb_employees
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_id') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_code') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''รหัสพนักงาน ห้ามซ้ำ'' AFTER `emp_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_user_id') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บัญชีผู้ใช้ที่ผูก — ใช้ลงเวลา/ขอลา/ดูสลิปของตัวเอง'' AFTER `emp_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_title') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_title` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''คำนำหน้า นาย/นาง/นางสาว — ใช้บน 50 ทวิ/ภ.ง.ด.1'' AFTER `emp_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_first_name_th') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_first_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `emp_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_last_name_th') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_last_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `emp_first_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_first_name_en') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_first_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_last_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_last_name_en') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_last_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_first_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_nickname') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_nickname` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_last_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_national_id') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_national_id` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เลขประจำตัวประชาชน = เลขผู้เสียภาษี (ภ.ง.ด.1/50 ทวิ) — ต้องมีก่อนเข้ารอบเงินเดือน'' AFTER `emp_nickname`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_birth_date') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_birth_date` date DEFAULT NULL AFTER `emp_national_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_address') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_address` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''ที่อยู่สำหรับ 50 ทวิ ประจำปี'' AFTER `emp_birth_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_phone') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_address`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_email') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_phone`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_department_id') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_department_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_email`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_position') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ตำแหน่งงาน (ข้อความ) — คนละเรื่องกับตำแหน่งในโปรเจกต์'' AFTER `emp_department_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_branch_id') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_position`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_hire_date') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_hire_date` date NOT NULL COMMENT ''วันเริ่มงาน = วันที่มีผลของค่าจ้างแถวแรก'' AFTER `emp_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_termination_date') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_termination_date` date DEFAULT NULL COMMENT ''วันทำงานวันสุดท้าย — หลังวันนี้ถือว่าพ้นสภาพ'' AFTER `emp_hire_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_termination_reason') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_termination_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_termination_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_bank_name') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_termination_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_bank_account_no') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_bank_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_bank_account_name') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_bank_account_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_bank_account_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_sso_enrolled') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_sso_enrolled` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''0 = ไม่เข้าประกันสังคม (เช่น อายุเกิน 60 ปีตอนเริ่มงาน) — ไม่หักทั้งสองฝ่าย'' AFTER `emp_bank_account_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_sso_number') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_sso_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ว่าง = ใช้เลขประจำตัวประชาชน'' AFTER `emp_sso_enrolled`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_notes') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER `emp_sso_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_created_by') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `emp_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_created_at') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `emp_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_updated_at') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `emp_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_compensations
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_employee_id') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_effective_from') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_effective_from` date NOT NULL AFTER `ecm_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_base_salary') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_base_salary` decimal(15,2) NOT NULL COMMENT ''เงินเดือนต่อเดือน (บาท)'' AFTER `ecm_effective_from`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_note') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เหตุผล เช่น ปรับประจำปี / ผ่านทดลองงาน'' AFTER `ecm_base_salary`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_created_by') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ecm_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND COLUMN_NAME = 'ecm_created_at') = 0, 'ALTER TABLE `tb_employee_compensations` ADD COLUMN `ecm_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ecm_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_recurring_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_id') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_employee_id') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `eri_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_kind') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_kind` enum(''earning'',''deduction'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `eri_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_label') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ชื่อที่พิมพ์บนสลิป'' AFTER `eri_kind`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_amount') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_amount` decimal(15,2) NOT NULL COMMENT ''ต่อเดือน (บาท)'' AFTER `eri_label`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_is_taxable') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_is_taxable` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''รายรับนี้นับเป็นเงินได้คิดภาษี'' AFTER `eri_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_is_sso_wage') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_is_sso_wage` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''รายรับนี้นับเป็นค่าจ้างของประกันสังคม (คำถามนักบัญชี Y1)'' AFTER `eri_is_taxable`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_effective_from') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_effective_from` date NOT NULL AFTER `eri_is_sso_wage`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_effective_to') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_effective_to` date DEFAULT NULL COMMENT ''วันสุดท้ายที่มีผล — ว่าง = ไม่มีกำหนด'' AFTER `eri_effective_from`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_note') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `eri_effective_to`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_created_by') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `eri_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND COLUMN_NAME = 'eri_created_at') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD COLUMN `eri_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `eri_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_sso_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_effective_from') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_effective_from` date NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_employee_rate') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_employee_rate` decimal(5,2) NOT NULL COMMENT ''ลูกจ้าง % ของฐานค่าจ้าง'' AFTER `sr_effective_from`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_employer_rate') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_employer_rate` decimal(5,2) NOT NULL COMMENT ''นายจ้าง % ของฐานค่าจ้าง'' AFTER `sr_employee_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_wage_floor') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_wage_floor` decimal(15,2) NOT NULL COMMENT ''ฐานค่าจ้างขั้นต่ำต่อเดือน'' AFTER `sr_employer_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_wage_ceiling') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_wage_ceiling` decimal(15,2) NOT NULL COMMENT ''ฐานค่าจ้างสูงสุดต่อเดือน'' AFTER `sr_wage_floor`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_note') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ที่มา เช่น กฎกระทรวง'' AFTER `sr_wage_ceiling`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_created_by') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `sr_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND COLUMN_NAME = 'sr_created_at') = 0, 'ALTER TABLE `tb_sso_rates` ADD COLUMN `sr_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `sr_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_income_tax_years
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_tax_year') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_tax_year` smallint unsigned NOT NULL COMMENT ''ปี ค.ศ.'' FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_expense_rate') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_expense_rate` decimal(5,2) NOT NULL COMMENT ''หักค่าใช้จ่ายเงินได้ 40(1)(2) % ของเงินได้'' AFTER `ity_tax_year`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_expense_cap') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_expense_cap` decimal(15,2) NOT NULL COMMENT ''หักค่าใช้จ่ายได้สูงสุดต่อปี'' AFTER `ity_expense_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_personal_allowance') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_personal_allowance` decimal(15,2) NOT NULL COMMENT ''ลดหย่อนส่วนตัว'' AFTER `ity_expense_cap`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_note') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ity_personal_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_created_by') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ity_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_created_at') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ity_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND COLUMN_NAME = 'ity_updated_at') = 0, 'ALTER TABLE `tb_income_tax_years` ADD COLUMN `ity_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `ity_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_income_tax_brackets
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_brackets' AND COLUMN_NAME = 'itb_tax_year') = 0, 'ALTER TABLE `tb_income_tax_brackets` ADD COLUMN `itb_tax_year` smallint unsigned NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_brackets' AND COLUMN_NAME = 'itb_from_amount') = 0, 'ALTER TABLE `tb_income_tax_brackets` ADD COLUMN `itb_from_amount` decimal(15,2) NOT NULL COMMENT ''เงินได้สุทธิตั้งแต่ (ส่วนที่เกินยอดนี้)'' AFTER `itb_tax_year`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_brackets' AND COLUMN_NAME = 'itb_rate') = 0, 'ALTER TABLE `tb_income_tax_brackets` ADD COLUMN `itb_rate` decimal(5,2) NOT NULL AFTER `itb_from_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_settings
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_id') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_id` tinyint unsigned NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_working_weekdays') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_working_weekdays` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''1111100'' COMMENT ''จันทร์→อาทิตย์ 1 = วันทำงาน'' AFTER `ps_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_hours_per_day') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_hours_per_day` decimal(4,2) NOT NULL DEFAULT ''8.00'' AFTER `ps_working_weekdays`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_pay_day') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_pay_day` tinyint unsigned NOT NULL DEFAULT ''25'' COMMENT ''วันจ่ายเงินเดือน 1–31 — เดือนที่สั้นกว่าใช้วันสุดท้าย'' AFTER `ps_hours_per_day`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_unpaid_leave_divisor') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_unpaid_leave_divisor` enum(''days_30'',''working_days'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''days_30'' COMMENT ''หักลาไม่รับค่าจ้างต่อวัน = เงินเดือน ÷ 30 หรือ ÷ วันทำงานของเดือน (Y3)'' AFTER `ps_pay_day`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_timesheet_backdate_days') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_timesheet_backdate_days` smallint unsigned NOT NULL DEFAULT ''14'' COMMENT ''ลงเวลาย้อนหลังได้กี่วัน (ขั้น 4-2)'' AFTER `ps_unpaid_leave_divisor`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-18 อายุบัตรพนักงาน
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_card_valid_years') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_card_valid_years` tinyint unsigned NOT NULL DEFAULT ''3'' COMMENT ''บัตรพนักงานใช้ได้กี่ปีนับจากวันออก (2026-10-18) — เปลี่ยนแล้วมีผลกับบัตรที่ออกหลังจากนั้น'' AFTER `ps_timesheet_backdate_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-23 ลงเวลาเข้า-ออกงาน: กะเริ่มต้น + เปิด/ปิดลงชั่วโมงต่อโปรเจกต์ (ค่าเริ่มต้น = ปิด ตามที่ผู้ใช้สั่ง)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_default_schedule_id') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_default_schedule_id` int unsigned DEFAULT NULL COMMENT ''กะเริ่มต้นของพนักงานที่ยังไม่ได้กำหนดกะ (tb_work_schedules.ws_id · 2026-10-23)'' AFTER `ps_card_valid_years`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_timesheet_enabled') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_timesheet_enabled` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''เปิดลงชั่วโมงต่อโปรเจกต์ (ขั้น 4-2) · 0 = ปิด ใช้ลงเวลาเข้า-ออกแทน (2026-10-23 ผู้ใช้สั่งปิด เปิดกลับได้)'' AFTER `ps_default_schedule_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_attendance_start_date') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_attendance_start_date` date DEFAULT NULL COMMENT ''เริ่มใช้ลงเวลาเข้า-ออกงานตั้งแต่วันนี้ (2026-10-24) · วันก่อนหน้าไม่นับขาด/สาย · ว่าง = นับทุกวัน'' AFTER `ps_timesheet_enabled`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-24 ลงเวลา A-3: อัตรา OT + เพดานต่อสัปดาห์
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_ot_rate_workday') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_ot_rate_workday` decimal(4,2) NOT NULL DEFAULT ''1.50'' COMMENT ''อัตรา OT วันทำงาน (เท่าของค่าจ้างต่อชั่วโมง · ม.61) — รอนักบัญชียืนยัน Y7'' AFTER `ps_attendance_start_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_ot_rate_holiday_work') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_ot_rate_holiday_work` decimal(4,2) NOT NULL DEFAULT ''1.00'' COMMENT ''ทำงานวันหยุดในเวลาปกติ จ่ายเพิ่ม (เท่า · พนักงานรายเดือน ม.62)'' AFTER `ps_ot_rate_workday`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_ot_rate_holiday_ot') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_ot_rate_holiday_ot` decimal(4,2) NOT NULL DEFAULT ''3.00'' COMMENT ''OT วันหยุด นอกเวลาปกติ (เท่า · ม.63)'' AFTER `ps_ot_rate_holiday_work`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_ot_weekly_cap_hours') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_ot_weekly_cap_hours` smallint unsigned NOT NULL DEFAULT ''36'' COMMENT ''OT + OT วันหยุด รวมไม่เกินกี่ชั่วโมงต่อสัปดาห์ (กฎกระทรวง 36)'' AFTER `ps_ot_rate_holiday_ot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-24 ลงเวลา A-4: หักสาย/ขาดในรอบเงินเดือน + บรรทัด OT (ที่มา attendance) + OT นับค่าจ้างประกันสังคมไหม
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_ot_is_sso_wage') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_ot_is_sso_wage` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''OT นับเป็นค่าจ้างคิดประกันสังคม (1 = นับ · รอนักบัญชียืนยัน Y5)'' AFTER `ps_ot_weekly_cap_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_late_minutes') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_late_minutes` int unsigned NOT NULL DEFAULT ''0'' COMMENT ''นาทีมาสาย (หลังผ่อนผัน) ที่หัก · ลงเวลา A-4'' AFTER `pri_unpaid_leave_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_early_leave_minutes') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_early_leave_minutes` int unsigned NOT NULL DEFAULT ''0'' COMMENT ''นาทีออกก่อนเวลาที่หัก'' AFTER `pri_late_minutes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_absent_days') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_absent_days` smallint unsigned NOT NULL DEFAULT ''0'' COMMENT ''วันขาดงาน (วันทำงาน ไม่ลา ไม่กดเลย)'' AFTER `pri_early_leave_minutes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_attendance_deduction') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_attendance_deduction` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หักสาย/ออกก่อน/ขาด (ลดเงินเดือนก่อนคิดภาษีและประกันสังคม เหมือนลาไม่รับค่าจ้าง)'' AFTER `pri_absent_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_source' AND COLUMN_TYPE NOT LIKE '%''attendance''%') > 0, 'ALTER TABLE `tb_payroll_item_lines` MODIFY COLUMN `pil_source` enum(''recurring'',''manual'',''attendance'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_updated_by') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_updated_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ps_timesheet_backdate_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND COLUMN_NAME = 'ps_updated_at') = 0, 'ALTER TABLE `tb_payroll_settings` ADD COLUMN `ps_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `ps_updated_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_company_holidays
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND COLUMN_NAME = 'hd_date') = 0, 'ALTER TABLE `tb_company_holidays` ADD COLUMN `hd_date` date NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND COLUMN_NAME = 'hd_name') = 0, 'ALTER TABLE `tb_company_holidays` ADD COLUMN `hd_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `hd_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND COLUMN_NAME = 'hd_created_by') = 0, 'ALTER TABLE `tb_company_holidays` ADD COLUMN `hd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `hd_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND COLUMN_NAME = 'hd_created_at') = 0, 'ALTER TABLE `tb_company_holidays` ADD COLUMN `hd_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `hd_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_types
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_id') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_name_th') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_name_th` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lt_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_name_en') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_name_en` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lt_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_days_per_year') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_days_per_year` decimal(5,1) DEFAULT NULL COMMENT ''โควตาวันต่อปี — ว่าง = ไม่จำกัด'' AFTER `lt_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_is_paid') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_is_paid` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''0 = หักเงินเดือนตามจำนวนวันลา'' AFTER `lt_days_per_year`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_attachment_from_days') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_attachment_from_days` decimal(5,1) DEFAULT NULL COMMENT ''ลาตั้งแต่กี่วันต้องแนบไฟล์ — ว่าง = ไม่ต้องแนบ'' AFTER `lt_is_paid`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_min_service_days') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_min_service_days` smallint unsigned NOT NULL DEFAULT ''0'' COMMENT ''ต้องทำงานครบกี่วันจึงใช้ประเภทนี้ได้'' AFTER `lt_attachment_from_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_carry_over_days') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_carry_over_days` decimal(5,1) NOT NULL DEFAULT ''0.0'' COMMENT ''ยกวันที่เหลือไปปีถัดไปได้สูงสุด'' AFTER `lt_min_service_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_status') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_status` enum(''active'',''inactive'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''active'' AFTER `lt_carry_over_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_sort_order') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_sort_order` int NOT NULL DEFAULT ''0'' AFTER `lt_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_created_at') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `lt_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND COLUMN_NAME = 'lt_updated_at') = 0, 'ALTER TABLE `tb_leave_types` ADD COLUMN `lt_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `lt_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 4 ขั้น 4-2 (2026-10-17) — ลงเวลา

-- tb_timesheet_weeks
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_id') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_employee_id') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `tsw_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_week_start') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_week_start` date NOT NULL COMMENT ''วันจันทร์ของสัปดาห์'' AFTER `tsw_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_status') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_status` enum(''draft'',''submitted'',''approved'',''returned'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `tsw_week_start`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_version') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `tsw_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_total_hours') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_total_hours` decimal(6,2) NOT NULL DEFAULT ''0.00'' AFTER `tsw_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_submitted_at') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_submitted_at` datetime DEFAULT NULL AFTER `tsw_total_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_approved_at') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_approved_at` datetime DEFAULT NULL COMMENT ''เวลาที่อนุมัติครบทุกแถว'' AFTER `tsw_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_return_reason') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_return_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tsw_approved_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_returned_by') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_returned_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tsw_return_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_returned_at') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_returned_at` datetime DEFAULT NULL AFTER `tsw_returned_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_created_at') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `tsw_returned_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND COLUMN_NAME = 'tsw_updated_at') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD COLUMN `tsw_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `tsw_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_timesheet_entries
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_id') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_week_id') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_week_id` int unsigned NOT NULL AFTER `tse_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_employee_id') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ซ้ำกับสัปดาห์ — ใช้ค้นตามพนักงาน/วันโดยไม่ต้อง JOIN'' AFTER `tse_week_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_date') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_date` date NOT NULL AFTER `tse_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_project_id') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tse_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_task_id') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_task_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tse_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_hours') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_hours` decimal(5,2) NOT NULL COMMENT ''ทีละ 0.25 ชั่วโมง'' AFTER `tse_task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_note') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tse_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_approved_by') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_approved_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tse_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND COLUMN_NAME = 'tse_approved_at') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD COLUMN `tse_approved_at` datetime DEFAULT NULL AFTER `tse_approved_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ บอร์ดงาน (2026-10-17) — ป้ายสี / checklist

-- tb_project_labels
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_id') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_project_id') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_project_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pl_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_name') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pl_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_color') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_color` enum(''green'',''yellow'',''orange'',''red'',''purple'',''blue'',''sky'',''lime'',''pink'',''black'') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''blue'' AFTER `pl_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_sort_order') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_sort_order` int NOT NULL DEFAULT ''0'' AFTER `pl_color`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_created_by') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pl_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_created_at') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `pl_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND COLUMN_NAME = 'pl_updated_at') = 0, 'ALTER TABLE `tb_project_labels` ADD COLUMN `pl_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `pl_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_labels
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_labels' AND COLUMN_NAME = 'tl_task_id') = 0, 'ALTER TABLE `tb_task_labels` ADD COLUMN `tl_task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_labels' AND COLUMN_NAME = 'tl_label_id') = 0, 'ALTER TABLE `tb_task_labels` ADD COLUMN `tl_label_id` int unsigned NOT NULL AFTER `tl_task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_checklist_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_id') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_task_id') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_task_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `tci_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_text') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_text` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL AFTER `tci_task_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_is_done') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_is_done` tinyint(1) NOT NULL DEFAULT ''0'' AFTER `tci_text`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_sort_order') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_sort_order` int NOT NULL DEFAULT ''0'' AFTER `tci_is_done`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_done_by') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_done_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tci_sort_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_done_at') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_done_at` datetime DEFAULT NULL AFTER `tci_done_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_created_by') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `tci_done_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND COLUMN_NAME = 'tci_created_at') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD COLUMN `tci_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `tci_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 4 ขั้น 4-3 (2026-10-17) — ลา

-- tb_leave_requests
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_id') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_employee_id') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lr_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_leave_type_id') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_leave_type_id` int unsigned NOT NULL AFTER `lr_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_start_date') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_start_date` date NOT NULL AFTER `lr_leave_type_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_end_date') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_end_date` date NOT NULL AFTER `lr_start_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_half_day') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_half_day` enum(''none'',''morning'',''afternoon'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''none'' AFTER `lr_end_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_days') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_days` decimal(5,1) NOT NULL COMMENT ''วันทำงานที่ลา (คิดใน backend)'' AFTER `lr_half_day`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_reason') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เห็นเฉพาะเจ้าของ/ผู้อนุมัติ/ฝ่ายบุคคล'' AFTER `lr_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_status') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_status` enum(''draft'',''pending'',''approved'',''rejected'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `lr_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_version') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_version` int unsigned NOT NULL DEFAULT ''1'' AFTER `lr_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_submitted_at') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_submitted_at` datetime DEFAULT NULL AFTER `lr_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_decided_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_decided_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lr_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_decided_at') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_decided_at` datetime DEFAULT NULL AFTER `lr_decided_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_decision_note') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_decision_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เหตุผลที่ไม่อนุมัติ'' AFTER `lr_decided_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_cancelled_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lr_decision_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_cancelled_at') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_cancelled_at` datetime DEFAULT NULL AFTER `lr_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_cancel_reason') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lr_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_created_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lr_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_created_at') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `lr_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND COLUMN_NAME = 'lr_updated_at') = 0, 'ALTER TABLE `tb_leave_requests` ADD COLUMN `lr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `lr_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_attachments
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_id') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_request_id') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_request_id` int unsigned NOT NULL AFTER `lra_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_file_path') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_file_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lra_request_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_file_name') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_file_name` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lra_file_path`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_file_size') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_file_size` int unsigned NOT NULL DEFAULT ''0'' AFTER `lra_file_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_uploaded_by') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_uploaded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lra_file_size`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND COLUMN_NAME = 'lra_uploaded_at') = 0, 'ALTER TABLE `tb_leave_attachments` ADD COLUMN `lra_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `lra_uploaded_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ เฟส 4 ขั้น 4-4 (2026-10-17) — รอบเงินเดือน

-- tb_employee_tax_profiles
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_employee_id') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_tax_year') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_tax_year` smallint unsigned NOT NULL COMMENT ''ปี ค.ศ.'' AFTER `etp_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_spouse_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_spouse_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `etp_tax_year`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_child_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_child_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `etp_spouse_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_parent_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_parent_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `etp_child_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_insurance_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_insurance_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ประกันชีวิต/สุขภาพ'' AFTER `etp_parent_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_fund_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_fund_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''กองทุน (สำรองเลี้ยงชีพ/RMF/SSF ฯลฯ)'' AFTER `etp_insurance_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_home_loan_interest') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_home_loan_interest` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `etp_fund_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_other_allowance') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_other_allowance` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `etp_home_loan_interest`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_prior_income') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_prior_income` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินได้ยกมาของปี (ก่อนรอบแรกในระบบ)'' AFTER `etp_other_allowance`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_prior_tax') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_prior_tax` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ภาษีที่หักไปแล้วยกมา'' AFTER `etp_prior_income`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_prior_sso') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_prior_sso` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ประกันสังคมที่หักไปแล้วยกมา'' AFTER `etp_prior_tax`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_prior_from_other_employer') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_prior_from_other_employer` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = ยอดยกมาจากที่ทำงานเดิม — ใช้คิดภาษีเท่านั้น ไม่รวมใน ภ.ง.ด.1ก/50 ทวิ ของบริษัท'' AFTER `etp_prior_sso`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_note') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `etp_prior_from_other_employer`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_updated_by') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_updated_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `etp_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND COLUMN_NAME = 'etp_updated_at') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD COLUMN `etp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `etp_updated_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_runs
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_id') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_period') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_period` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''YYYY-MM'' AFTER `pr_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_number') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_number` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''PR-YYYY-MM'' AFTER `pr_period`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_pay_date') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_pay_date` date NOT NULL AFTER `pr_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_status') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_status` enum(''draft'',''pending_approval'',''approved'',''paid'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `pr_pay_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_version') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_version` int unsigned NOT NULL DEFAULT ''1'' AFTER `pr_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_working_days') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_working_days` smallint unsigned NOT NULL DEFAULT ''0'' AFTER `pr_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_standard_hours') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_standard_hours` decimal(6,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_working_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_employee_count') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_employee_count` smallint unsigned NOT NULL DEFAULT ''0'' AFTER `pr_standard_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_gross') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_gross` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_employee_count`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_deductions') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_deductions` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''รายหักอื่น (ไม่รวมประกันสังคม/ภาษี)'' AFTER `pr_total_gross`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_sso_employee') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_sso_employee` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_total_deductions`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_sso_employer') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_sso_employer` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_total_sso_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_tax') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_tax` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_total_sso_employer`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_total_net') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_total_net` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pr_total_tax`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_calculated_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_calculated_at` datetime DEFAULT NULL AFTER `pr_total_net`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_approval_round') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_approval_round` int unsigned NOT NULL DEFAULT ''0'' AFTER `pr_calculated_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_approval_current_level') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_approval_current_level` tinyint unsigned DEFAULT NULL AFTER `pr_approval_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_approval_plan') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_approval_plan` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''snapshot แผนอนุมัติตอนส่ง (JSON)'' AFTER `pr_approval_current_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_submitted_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_submitted_at` datetime DEFAULT NULL AFTER `pr_approval_plan`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_approved_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_approved_at` datetime DEFAULT NULL AFTER `pr_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_returned_reason') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pr_approved_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_paid_date') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_paid_date` date DEFAULT NULL AFTER `pr_returned_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_paid_note') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_paid_note` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''เช่น บัญชีที่โอน'' AFTER `pr_paid_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_paid_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_paid_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pr_paid_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_cancelled_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_cancelled_at` datetime DEFAULT NULL AFTER `pr_paid_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_cancel_reason') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pr_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_cancelled_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pr_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_created_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pr_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_created_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `pr_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND COLUMN_NAME = 'pr_updated_at') = 0, 'ALTER TABLE `tb_payroll_runs` ADD COLUMN `pr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `pr_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_id') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_run_id') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_run_id` int unsigned NOT NULL AFTER `pra_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_round') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_round` int unsigned NOT NULL AFTER `pra_run_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_level') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_level` tinyint unsigned NOT NULL AFTER `pra_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_action') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_action` enum(''approve'',''return'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pra_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_user_id') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pra_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_user_name') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_user_name` varchar(201) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pra_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_role_id') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pra_user_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_role_name') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_role_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pra_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_reason') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pra_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND COLUMN_NAME = 'pra_created_at') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD COLUMN `pra_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `pra_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_id') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_run_id') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_run_id` int unsigned NOT NULL AFTER `pri_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_employee_id') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pri_run_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_emp_code') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_emp_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pri_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_full_name') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_full_name` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pri_emp_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_national_id') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_national_id` varchar(13) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pri_full_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_position') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pri_national_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_department_name') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_department_name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pri_position`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_bank_name') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_bank_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pri_department_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_bank_account_no') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_bank_account_no` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pri_bank_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_sso_enrolled') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_sso_enrolled` tinyint(1) NOT NULL DEFAULT ''1'' AFTER `pri_bank_account_no`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_employed_days') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_employed_days` smallint unsigned NOT NULL COMMENT ''วันปฏิทินที่เป็นพนักงานในเดือน'' AFTER `pri_sso_enrolled`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_days_in_month') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_days_in_month` smallint unsigned NOT NULL AFTER `pri_employed_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_base_salary') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_base_salary` decimal(15,2) NOT NULL COMMENT ''เงินเดือนต่อเดือน ณ วันสุดท้ายที่ทำงานในเดือน'' AFTER `pri_days_in_month`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_salary_amount') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_salary_amount` decimal(15,2) NOT NULL COMMENT ''เงินเดือนตามสัดส่วนวัน'' AFTER `pri_base_salary`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_unpaid_leave_days') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_unpaid_leave_days` decimal(5,1) NOT NULL DEFAULT ''0.0'' AFTER `pri_salary_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_unpaid_leave_amount') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_unpaid_leave_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_unpaid_leave_days`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_other_earnings') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_other_earnings` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_unpaid_leave_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_other_deductions') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_other_deductions` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_other_earnings`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_gross') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_gross` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินเดือนสุทธิจากลา + รายรับอื่น'' AFTER `pri_other_deductions`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_taxable_income') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_taxable_income` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_gross`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_sso_wage') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_sso_wage` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_taxable_income`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_sso_employee') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_sso_employee` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_sso_wage`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_sso_employer') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_sso_employer` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_sso_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_ytd_income_before') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_ytd_income_before` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_sso_employer`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_ytd_tax_before') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_ytd_tax_before` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_ytd_income_before`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_ytd_sso_before') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_ytd_sso_before` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_ytd_tax_before`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_annual_income_estimate') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_annual_income_estimate` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_ytd_sso_before`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_annual_tax_estimate') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_annual_tax_estimate` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_annual_income_estimate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_tax') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_tax` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_annual_tax_estimate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_net') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_net` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_tax`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_standard_hours') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_standard_hours` decimal(6,2) NOT NULL DEFAULT ''0.00'' AFTER `pri_net`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND COLUMN_NAME = 'pri_labor_cost') = 0, 'ALTER TABLE `tb_payroll_items` ADD COLUMN `pri_labor_cost` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ต้นทุนทั้งเดือน = ค่าจ้าง + ประกันสังคมส่วนบริษัท'' AFTER `pri_standard_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_item_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_id') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_item_id') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_item_id` int unsigned NOT NULL AFTER `pil_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_source') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_source` enum(''recurring'',''manual'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pil_item_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_kind') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_kind` enum(''earning'',''deduction'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pil_source`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_label') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_label` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `pil_kind`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_amount') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_amount` decimal(15,2) NOT NULL AFTER `pil_label`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_is_taxable') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_is_taxable` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''รายรับ: นับเป็นเงินได้คิดภาษี'' AFTER `pil_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_is_sso_wage') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_is_sso_wage` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''รายรับ: นับเป็นค่าจ้างประกันสังคม'' AFTER `pil_is_taxable`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_is_one_off') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_is_one_off` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''รายรับครั้งเดียว (โบนัส) — ไม่ประมาณการซ้ำทั้งปีตอนคิดภาษี'' AFTER `pil_is_sso_wage`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_created_by') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `pil_is_one_off`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND COLUMN_NAME = 'pil_created_at') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD COLUMN `pil_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `pil_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_labor_cost_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_id') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_run_id') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_run_id` int unsigned NOT NULL AFTER `lca_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_period') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_period` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lca_run_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_employee_id') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `lca_period`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_project_id') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `lca_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_hours') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_hours` decimal(8,2) NOT NULL DEFAULT ''0.00'' AFTER `lca_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND COLUMN_NAME = 'lca_amount') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD COLUMN `lca_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `lca_hours`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ ใบลดหนี้ (2026-10-18 ขั้น N-1)

-- tb_credit_notes
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_number') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_number` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''CN-yyyymmdd-xxxxxx ออกตอนอนุมัติครบ — ยกเลิกแล้วเลขยังอยู่'' AFTER `cn_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_status') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_status` enum(''draft'',''pending_approval'',''issued'',''cancelled'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''draft'' AFTER `cn_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_version') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_version` int unsigned NOT NULL DEFAULT ''0'' AFTER `cn_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_invoice_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ใบแจ้งหนี้ที่ลด'' AFTER `cn_version`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_client_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_client_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cn_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_branch_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cn_client_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_project_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_project_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_currency') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_currency` char(3) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''THB'' AFTER `cn_project_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_language') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_language` enum(''th'',''en'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''th'' AFTER `cn_currency`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_reason_code') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_reason_code` enum(''price_reduction'',''scope_reduction'',''defect'',''error'',''other'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cn_language`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_reason') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''เหตุผล (พิมพ์บนเอกสาร)'' AFTER `cn_reason_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issue_date') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issue_date` date DEFAULT NULL COMMENT ''วันที่อนุมัติครบ (เวลาไทย)'' AFTER `cn_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_original_total') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_original_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''มูลค่าตามใบเดิมก่อนใบนี้ (หักใบลดหนี้ก่อนหน้าแล้ว)'' AFTER `cn_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_subtotal') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_subtotal` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดที่ลดก่อน VAT'' AFTER `cn_original_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_vat_rate') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_vat_rate` decimal(5,2) NOT NULL DEFAULT ''0.00'' COMMENT ''อัตราของใบเดิม'' AFTER `cn_subtotal`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_vat_amount') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_vat_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `cn_vat_rate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_total') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_total` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''รวมลดหนี้'' AFTER `cn_vat_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_base_thb') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_base_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดก่อน VAT เป็นบาท (อัตราของใบเดิม) — ใช้เทียบเกณฑ์อนุมัติ'' AFTER `cn_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_total_thb') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_total_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' AFTER `cn_base_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_wht_amount') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_wht_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หัก ณ ที่จ่ายประมาณการส่วนที่ลด'' AFTER `cn_total_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_outstanding_before') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_outstanding_before` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดค้างของใบเดิมก่อนใบนี้ (ณ ตอนออก)'' AFTER `cn_wht_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_required') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_required` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนที่ลูกค้าจ่ายเกิน = ต้องคืน (ณ ตอนออก)'' AFTER `cn_outstanding_before`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_date') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_date` date DEFAULT NULL AFTER `cn_refund_required`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_bank_account_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_bank_account_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''บัญชีบริษัทที่โอนคืนออก'' AFTER `cn_refund_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_amount') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''เงินที่โอนคืนจริง'' AFTER `cn_refund_bank_account_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_wht') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_wht` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนหัก ณ ที่จ่ายที่ไม่ต้องคืน (ลูกค้าหักไว้แล้ว)'' AFTER `cn_refund_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_reference') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_reference` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_refund_wht`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refund_note') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refund_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_refund_reference`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refunded_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refunded_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_refund_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_refunded_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_refunded_at` datetime DEFAULT NULL AFTER `cn_refunded_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_notes') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_notes` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''หมายเหตุที่พิมพ์บนเอกสาร'' AFTER `cn_refunded_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_internal_note') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_internal_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT ''บันทึกภายใน — ไม่พิมพ์'' AFTER `cn_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_client_snapshot') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_client_snapshot` json DEFAULT NULL COMMENT ''ข้อมูลลูกค้า ณ วันออก'' AFTER `cn_internal_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_company_snapshot') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_company_snapshot` json DEFAULT NULL COMMENT ''ข้อมูลบริษัท + สาขา ณ วันออก'' AFTER `cn_client_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_approval_round') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_approval_round` int unsigned NOT NULL DEFAULT ''0'' AFTER `cn_company_snapshot`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_approval_current_level') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_approval_current_level` tinyint unsigned DEFAULT NULL AFTER `cn_approval_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_approval_plan') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_approval_plan` json DEFAULT NULL AFTER `cn_approval_current_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_returned_reason') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_returned_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_approval_plan`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_created_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_returned_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_created_by_name') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_created_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_submitted_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_submitted_at` datetime DEFAULT NULL AFTER `cn_created_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issued_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ผู้อนุมัติชั้นสุดท้าย'' AFTER `cn_submitted_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issued_by_name') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issued_by_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_issued_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issued_by_title') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issued_by_title` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_issued_by_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issuer_signature_id') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issuer_signature_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_issued_by_title`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_issued_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_issued_at` datetime DEFAULT NULL AFTER `cn_issuer_signature_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_cancelled_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_cancelled_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_issued_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_cancelled_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_cancelled_at` datetime DEFAULT NULL AFTER `cn_cancelled_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_cancel_reason') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_cancel_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cn_cancelled_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_created_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `cn_cancel_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND COLUMN_NAME = 'cn_updated_at') = 0, 'ALTER TABLE `tb_credit_notes` ADD COLUMN `cn_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `cn_created_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND COLUMN_NAME = 'cnl_id') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD COLUMN `cnl_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND COLUMN_NAME = 'cnl_credit_note_id') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD COLUMN `cnl_credit_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cnl_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND COLUMN_NAME = 'cnl_order') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD COLUMN `cnl_order` int NOT NULL DEFAULT ''0'' AFTER `cnl_credit_note_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND COLUMN_NAME = 'cnl_description') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD COLUMN `cnl_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cnl_order`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND COLUMN_NAME = 'cnl_amount') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD COLUMN `cnl_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดที่ลดก่อน VAT (สกุลของใบ)'' AFTER `cnl_description`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_id') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_id` bigint unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_credit_note_id') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_credit_note_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cna_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_round') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_round` int unsigned NOT NULL AFTER `cna_credit_note_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_level') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_level` tinyint unsigned NOT NULL AFTER `cna_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_action') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_action` enum(''approve'',''return'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cna_level`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_user_id') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_user_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cna_action`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_user_name') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_user_name` varchar(101) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `cna_user_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_role_id') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_role_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่'' AFTER `cna_user_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_role_name') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_role_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cna_role_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_reason') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `cna_role_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND COLUMN_NAME = 'cna_created_at') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD COLUMN `cna_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `cna_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoices (ยอดใบลดหนี้/คืนเงินที่ออกแล้ว)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ผลรวมยอดของใบลดหนี้ที่ออกแล้ว (2026-10-18)'' AFTER `inv_paid_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_base') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_base` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนก่อน VAT ของใบลดหนี้ที่ออกแล้ว'' AFTER `inv_credited_amount`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_vat') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_vat` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วน VAT ของใบลดหนี้ที่ออกแล้ว'' AFTER `inv_credited_base`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_base_thb') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_base_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ส่วนก่อน VAT เป็นบาทของใบลดหนี้ที่ออกแล้ว'' AFTER `inv_credited_vat`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_thb') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_thb` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''ยอดบาทของใบลดหนี้ที่ออกแล้ว'' AFTER `inv_credited_base_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_credited_wht') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_credited_wht` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''หัก ณ ที่จ่ายประมาณการส่วนที่ลดแล้ว'' AFTER `inv_credited_thb`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_refunded_amount') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_refunded_amount` decimal(15,2) NOT NULL DEFAULT ''0.00'' COMMENT ''คืนเงินลูกค้าแล้วตามใบลดหนี้ (โอนคืน + หัก ณ ที่จ่ายที่ไม่ต้องคืน)'' AFTER `inv_credited_wht`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ ใบเพิ่มหนี้ (2026-10-18 ขั้น N-2)
-- tb_invoices (ชนิดเอกสาร · ใบที่อ้างอิง · มูลค่าเดิม · เหตุผล)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_doc_type') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_doc_type` enum(''invoice'',''debit_note'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''invoice'' COMMENT ''debit_note = ใบเพิ่มหนี้ อ้างใบเดิม (2026-10-18 ขั้น N-2)'' AFTER `inv_reissued_from_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_reference_invoice_id') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_reference_invoice_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ใบเพิ่มหนี้: ใบแจ้งหนี้ที่อ้างอิง'' AFTER `inv_doc_type`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_original_total') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_original_total` decimal(15,2) DEFAULT NULL COMMENT ''ใบเพิ่มหนี้: มูลค่าที่ถูกต้องเดิม (รวม VAT) ณ ตอนออก = ใบที่อ้างอิงหลังลดหนี้ + ใบเพิ่มหนี้ที่ออกก่อนหน้า'' AFTER `inv_reference_invoice_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_adjust_reason_code') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_adjust_reason_code` enum(''price_increase'',''scope_increase'',''error'',''other'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ใบเพิ่มหนี้: รหัสเหตุผล'' AFTER `inv_original_total`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND COLUMN_NAME = 'inv_adjust_reason') = 0, 'ALTER TABLE `tb_invoices` ADD COLUMN `inv_adjust_reason` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''ใบเพิ่มหนี้: เหตุผล (กฎหมายบังคับ)'' AFTER `inv_adjust_reason_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ════ รหัสแผนก/รหัสพนักงาน + ประวัติรหัส + บัตรพนักงาน (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
-- tb_department: สาขา · ตัวย่อ · รหัส (ให้ว่างได้ก่อน — ข้อมูลเดิมเติมด้านล่าง แล้วค่อยบังคับ NOT NULL)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_branch_id') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NULL COMMENT ''สาขาที่แผนกสังกัด'' AFTER `dep_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_abbr') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_abbr` char(3) COLLATE utf8mb4_unicode_ci NULL COMMENT ''ตัวย่อ 3 ตัว A-Z 0-9 — แก้ได้เฉพาะตอนแผนกยังไม่มีพนักงาน'' AFTER `dep_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_code') = 0, 'ALTER TABLE `tb_department` ADD COLUMN `dep_code` char(8) COLLATE utf8mb4_unicode_ci NULL COMMENT ''รหัสแผนก = รหัสสาขา + ตัวย่อ (ส่วนหน้าของรหัสพนักงาน)'' AFTER `dep_abbr`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employees: รูปสำหรับบัตร
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_photo_url') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_photo_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''รูปพนักงานสำหรับบัตร (/uploads/employees/...) — ว่าง = ใช้รูปโปรไฟล์บัญชีผู้ใช้ที่ผูก'' AFTER `emp_notes`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-18 บัญชีเข้าระบบ ↔ พนักงาน (docs/plans/2026-10-18-user-employee-link.md)
SET @close_login_added = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_close_login_on_termination') = 0;
SET @q = IF(@close_login_added, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_close_login_on_termination` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''ปิดการเข้าระบบของบัญชีที่ผูกหลังวันทำงานวันสุดท้าย (1 = ปิด · 2026-10-18)'' AFTER `emp_photo_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- K3: คนที่ตั้งพ้นสภาพไว้แล้วก่อนมีคอลัมน์นี้ ไม่ปิดบัญชีให้เอง (ฝ่ายบุคคลเลือกปิดทีละคนที่หน้าพนักงาน) · รันเฉพาะรอบที่เพิ่งเพิ่มคอลัมน์
UPDATE tb_employees SET emp_close_login_on_termination = 0 WHERE @close_login_added AND emp_termination_date IS NOT NULL;
-- 2026-10-23 ลงเวลาเข้า-ออกงาน: ต้องลงเวลาไหม (พนักงานเดิมทุกคน = ต้องลง)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_attendance_required') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_attendance_required` tinyint(1) NOT NULL DEFAULT ''1'' COMMENT ''ต้องลงเวลาเข้า-ออกงานไหม (2026-10-23) · 0 = ไม่ต้อง เช่น ผู้บริหาร — ไม่นับสาย/ขาด'' AFTER `emp_close_login_on_termination`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-24 WFH: วัน WFH ประจำรายคน + ป้าย WFH ของการกด
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_wfh_weekdays') = 0, 'ALTER TABLE `tb_employees` ADD COLUMN `emp_wfh_weekdays` char(7) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''0000000'' COMMENT ''วัน WFH ประจำ จันทร์→อาทิตย์ (1 = ทำงานที่บ้าน · 1111111 = WFH เต็มเวลา) · วัน WFH กดได้ทุกที่ (2026-10-24)'' AFTER `emp_attendance_required`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_attendance_punches' AND COLUMN_NAME = 'ap_is_wfh') = 0, 'ALTER TABLE `tb_attendance_punches` ADD COLUMN `ap_is_wfh` tinyint(1) NOT NULL DEFAULT ''0'' COMMENT ''1 = กดวัน WFH (ไม่ตรวจตำแหน่ง · ไม่ใช่นอกจุด)'' AFTER `ap_is_offsite`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employee_codes
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_id') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_employee_id') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ecd_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_code') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ecd_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_department_id') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_department_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT ''แผนกตอนใช้รหัสนี้ (รหัสเดิมก่อนระบบใหม่อาจไม่มี)'' AFTER `ecd_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_branch_id') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_branch_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ecd_department_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_valid_from') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_valid_from` date NOT NULL AFTER `ecd_branch_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_valid_to') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_valid_to` date DEFAULT NULL COMMENT ''วันสุดท้ายที่ใช้รหัสนี้ · ว่าง = ใช้อยู่'' AFTER `ecd_valid_from`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_reason') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_reason` enum(''hire'',''correction'',''transfer'',''migration'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ecd_valid_to`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_note') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ecd_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_created_by') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_created_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ecd_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND COLUMN_NAME = 'ecd_created_at') = 0, 'ALTER TABLE `tb_employee_codes` ADD COLUMN `ecd_created_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ecd_created_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employee_cards
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_id') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_id` int unsigned NOT NULL AUTO_INCREMENT FIRST', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_employee_id') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_employee_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ec_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_seq') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_seq` smallint unsigned NOT NULL COMMENT ''บัตรใบที่ N ของพนักงานคนนี้'' AFTER `ec_employee_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_emp_code') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_emp_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ec_seq`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_name_th') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_name_th` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ec_emp_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_name_en') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_name_en` varchar(250) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_position') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_position` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_name_en`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_department_name') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_department_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_position`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_branch_name') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_branch_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_department_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_photo_url') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_photo_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_branch_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_reason') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_reason` enum(''first_issue'',''code_change'',''lost'',''damaged'',''info_change'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL AFTER `ec_photo_url`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_note') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_note` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_issued_by') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_issued_by` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_issued_at') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_issued_at` datetime DEFAULT CURRENT_TIMESTAMP AFTER `ec_issued_by`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_printed_at') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_printed_at` datetime DEFAULT NULL COMMENT ''พิมพ์ครั้งแรกเมื่อไร · ว่าง = รอพิมพ์'' AFTER `ec_issued_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_voided_at') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_voided_at` datetime DEFAULT NULL COMMENT ''ยกเลิกเมื่อไร · ว่าง = ใบที่ใช้อยู่'' AFTER `ec_printed_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_void_reason') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_void_reason` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `ec_voided_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_returned_at') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_returned_at` datetime DEFAULT NULL COMMENT ''เก็บบัตรคืนแล้วเมื่อไร (บัตรที่ยกเลิก)'' AFTER `ec_void_reason`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- 2026-10-18 วันหมดอายุบัตร + เหตุผล 'expired' (ต่ออายุ)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_expires_on') = 0, 'ALTER TABLE `tb_employee_cards` ADD COLUMN `ec_expires_on` date DEFAULT NULL COMMENT ''ใช้ได้ถึงวันนี้ = วันออก + อายุบัตรตามตั้งค่า ณ ตอนออก (snapshot)'' AFTER `ec_issued_at`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_reason' AND COLUMN_TYPE NOT LIKE '%''expired''%') > 0, 'ALTER TABLE `tb_employee_cards` MODIFY COLUMN `ec_reason` enum(''first_issue'',''code_change'',''lost'',''damaged'',''info_change'',''expired'') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ย้ายข้อมูลเดิม (รันซ้ำได้ — ทำเฉพาะแถวที่ยังไม่ครบ)
SET @codes_today = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'));
SET @codes_hq = (SELECT branch_id FROM tb_branches WHERE branch_code = '00000' LIMIT 1);
-- 1) แผนกเดิมที่ยังไม่มีสาขา = สำนักงานใหญ่
UPDATE tb_department SET dep_branch_id = @codes_hq WHERE dep_branch_id IS NULL AND @codes_hq IS NOT NULL;
-- 2) แผนกเดิมที่ยังไม่มีตัวย่อ = D01, D02 ... ตามลำดับวันที่สร้าง (ผู้ดูแลเปลี่ยนเป็นตัวย่อจริงได้ตราบที่แผนกยังไม่มีพนักงาน)
SET @codes_used = (SELECT COUNT(*) FROM tb_department WHERE dep_abbr REGEXP '^D[0-9]{2}$');
UPDATE tb_department d
JOIN (SELECT ranked.dep_id, ranked.n FROM (
        SELECT dep_id, ROW_NUMBER() OVER (ORDER BY dep_created_at, dep_id) AS n FROM tb_department WHERE dep_abbr IS NULL OR dep_abbr = ''
     ) ranked) x ON x.dep_id = d.dep_id
SET d.dep_abbr = CONCAT('D', LPAD(x.n + @codes_used, 2, '0'));
-- 3) รหัสแผนก = รหัสสาขา + ตัวย่อ
UPDATE tb_department d JOIN tb_branches b ON b.branch_id = d.dep_branch_id
SET d.dep_code = CONCAT(b.branch_code, d.dep_abbr)
WHERE d.dep_code IS NULL OR d.dep_code <> CONCAT(b.branch_code, d.dep_abbr);
-- 4) พนักงานที่ไม่มีแผนก → แผนก "ทั่วไป" (GEN) ที่สำนักงานใหญ่ (สร้างเฉพาะเมื่อมีพนักงานแบบนี้)
SET @codes_need_general = (SELECT COUNT(*) FROM tb_employees WHERE emp_department_id IS NULL);
INSERT INTO tb_department (dep_id, dep_name, dep_branch_id, dep_abbr, dep_code)
SELECT CONCAT('DEP', DATE_FORMAT(@codes_today, '%Y%m%d'), '9000001'), 'ทั่วไป', @codes_hq, 'GEN', '00000GEN'
FROM DUAL
WHERE @codes_need_general > 0 AND @codes_hq IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM tb_department WHERE dep_code = '00000GEN' OR (dep_name = 'ทั่วไป' AND dep_branch_id = @codes_hq));
SET @codes_general = (SELECT dep_id FROM tb_department WHERE dep_code = '00000GEN' OR (dep_name = 'ทั่วไป' AND dep_branch_id = @codes_hq) ORDER BY dep_code = '00000GEN' DESC LIMIT 1);
UPDATE tb_employees SET emp_department_id = @codes_general WHERE emp_department_id IS NULL AND @codes_general IS NOT NULL;
-- 5) สาขาของพนักงาน = สาขาของแผนกเสมอ
UPDATE tb_employees e JOIN tb_department d ON d.dep_id = e.emp_department_id
SET e.emp_branch_id = d.dep_branch_id
WHERE NOT (e.emp_branch_id <=> d.dep_branch_id);
-- 6) รหัสพนักงานรูปแบบเดิม → เก็บเข้าประวัติ แล้วออกรหัสใหม่ (รหัสแผนก + วันเริ่มงาน yymmdd + ลำดับ 4 หลักของวันนั้น ต่อจากเลขที่ออกไปแล้ว)
INSERT INTO tb_employee_codes (ecd_employee_id, ecd_code, ecd_department_id, ecd_branch_id, ecd_valid_from, ecd_valid_to, ecd_reason, ecd_note)
SELECT e.emp_id, e.emp_code, e.emp_department_id, e.emp_branch_id,
       LEAST(e.emp_hire_date, DATE_SUB(@codes_today, INTERVAL 1 DAY)), DATE_SUB(@codes_today, INTERVAL 1 DAY), 'migration', 'รหัสก่อนปรับระบบรหัส'
FROM tb_employees e
WHERE e.emp_code NOT REGEXP '^[0-9]{5}[A-Z0-9]{3}[0-9]{10}$'
  AND NOT EXISTS (SELECT 1 FROM tb_employee_codes c WHERE c.ecd_code = e.emp_code);
DROP TEMPORARY TABLE IF EXISTS tmp_employee_new_codes;
CREATE TEMPORARY TABLE tmp_employee_new_codes AS
SELECT e.emp_id, d.dep_code, DATE_FORMAT(e.emp_hire_date, '%y%m%d') AS code_date, DATE_FORMAT(e.emp_hire_date, '%Y%m%d') AS sequence_date,
       ROW_NUMBER() OVER (PARTITION BY e.emp_hire_date ORDER BY e.emp_created_at, e.emp_id) AS n
FROM tb_employees e JOIN tb_department d ON d.dep_id = e.emp_department_id
WHERE e.emp_code NOT REGEXP '^[0-9]{5}[A-Z0-9]{3}[0-9]{10}$';
UPDATE tmp_employee_new_codes t
LEFT JOIN tb_document_sequences s ON s.ds_doc_type = 'EMP' AND s.ds_date = t.sequence_date
SET t.n = t.n + COALESCE(s.ds_last, 0);
UPDATE tb_employees e JOIN tmp_employee_new_codes t ON t.emp_id = e.emp_id
SET e.emp_code = CONCAT(t.dep_code, t.code_date, LPAD(t.n, 4, '0'));
INSERT INTO tb_document_sequences (ds_doc_type, ds_date, ds_last)
SELECT 'EMP', t.sequence_date, MAX(t.n) FROM tmp_employee_new_codes t GROUP BY t.sequence_date
ON DUPLICATE KEY UPDATE ds_last = GREATEST(ds_last, VALUES(ds_last));
INSERT INTO tb_employee_codes (ecd_employee_id, ecd_code, ecd_department_id, ecd_branch_id, ecd_valid_from, ecd_valid_to, ecd_reason, ecd_note)
SELECT e.emp_id, e.emp_code, e.emp_department_id, e.emp_branch_id, @codes_today, NULL, 'migration', 'ออกรหัสรูปแบบใหม่ตอนปรับระบบรหัส'
FROM tb_employees e JOIN tmp_employee_new_codes t ON t.emp_id = e.emp_id;
DROP TEMPORARY TABLE tmp_employee_new_codes;
-- 7) พนักงานรูปแบบใหม่ที่ยังไม่มีประวัติรหัส (กันข้อมูลที่ใส่ตรงๆ) = แถวรหัสปัจจุบัน
INSERT INTO tb_employee_codes (ecd_employee_id, ecd_code, ecd_department_id, ecd_branch_id, ecd_valid_from, ecd_valid_to, ecd_reason)
SELECT e.emp_id, e.emp_code, e.emp_department_id, e.emp_branch_id, e.emp_hire_date, NULL, 'hire'
FROM tb_employees e
WHERE NOT EXISTS (SELECT 1 FROM tb_employee_codes c WHERE c.ecd_code = e.emp_code);
-- 8) พนักงานที่ยังไม่พ้นสภาพและยังไม่มีบัตร = บัตรใบที่ 1 รอพิมพ์
INSERT INTO tb_employee_cards (ec_employee_id, ec_seq, ec_emp_code, ec_name_th, ec_name_en, ec_position, ec_department_name, ec_branch_name, ec_photo_url, ec_reason, ec_note, ec_expires_on)
SELECT e.emp_id, 1, e.emp_code,
       CONCAT(COALESCE(e.emp_title, ''), e.emp_first_name_th, ' ', e.emp_last_name_th),
       NULLIF(TRIM(CONCAT(COALESCE(e.emp_first_name_en, ''), ' ', COALESCE(e.emp_last_name_en, ''))), ''),
       e.emp_position, d.dep_name, b.branch_name_th, COALESCE(e.emp_photo_url, u.user_avatar_url), 'first_issue', 'ออกตอนปรับระบบรหัส',
       DATE_ADD(@codes_today, INTERVAL COALESCE((SELECT ps_card_valid_years FROM tb_payroll_settings WHERE ps_id = 1), 3) YEAR)
FROM tb_employees e
JOIN tb_department d ON d.dep_id = e.emp_department_id
LEFT JOIN tb_branches b ON b.branch_id = e.emp_branch_id
LEFT JOIN tb_users u ON u.user_id = e.emp_user_id
WHERE (e.emp_termination_date IS NULL OR e.emp_termination_date >= @codes_today)
  AND NOT EXISTS (SELECT 1 FROM tb_employee_cards c WHERE c.ec_employee_id = e.emp_id);
-- บัตรที่ออกก่อนมีวันหมดอายุ: นับจากวันออก + อายุบัตรตามตั้งค่า (รันซ้ำได้ แตะเฉพาะแถวที่ยังว่าง)
UPDATE tb_employee_cards SET ec_expires_on = DATE_ADD(DATE(ec_issued_at), INTERVAL COALESCE((SELECT ps_card_valid_years FROM tb_payroll_settings WHERE ps_id = 1), 3) YEAR) WHERE ec_expires_on IS NULL;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND COLUMN_NAME = 'ec_expires_on' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_employee_cards` MODIFY COLUMN `ec_expires_on` date NOT NULL COMMENT ''ใช้ได้ถึงวันนี้ = วันออก + อายุบัตรตามตั้งค่า ณ ตอนออก (snapshot)''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- บังคับตามโครงสร้างใหม่ (หลังเติมข้อมูลครบแล้ว)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_branch_id' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_department` MODIFY COLUMN `dep_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''สาขาที่แผนกสังกัด''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_abbr' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_department` MODIFY COLUMN `dep_abbr` char(3) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''ตัวย่อ 3 ตัว A-Z 0-9 — แก้ได้เฉพาะตอนแผนกยังไม่มีพนักงาน''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND COLUMN_NAME = 'dep_code' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_department` MODIFY COLUMN `dep_code` char(8) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''รหัสแผนก = รหัสสาขา + ตัวย่อ (ส่วนหน้าของรหัสพนักงาน)''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_department_id' AND IS_NULLABLE = 'YES') > 0, 'ALTER TABLE `tb_employees` MODIFY COLUMN `emp_department_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''บังคับ (ประกอบรหัสพนักงาน) — สาขาของพนักงาน = สาขาของแผนก''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND COLUMN_NAME = 'emp_code' AND CHARACTER_MAXIMUM_LENGTH <> 18) > 0, 'ALTER TABLE `tb_employees` MODIFY COLUMN `emp_code` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT ''รหัสพนักงาน ระบบออกให้: รหัสแผนก 8 + วันเริ่มงาน yymmdd + ลำดับ 4 (2026-10-18) — ย้ายแผนก/สาขา = รหัสใหม่ (ประวัติใน tb_employee_codes)''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

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

-- 2026-10-16 เฟส 2: สิทธิ์ใกล้เต็ม 64 บิต → ขยายเป็น 255 (ข้อมูลเดิมไม่เปลี่ยน)
SET @q = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_permission' AND CHARACTER_MAXIMUM_LENGTH < 255) > 0, 'ALTER TABLE `tb_roles` MODIFY COLUMN `role_permission` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT ''''', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- 2026-10-18 K2: บัญชีที่ผูกกับพนักงานปัจจุบัน ใช้ชื่อ เบอร์ สาขาตามทะเบียนพนักงาน (รันซ้ำได้ · ค่าเดิมซ้ำ = ไม่เปลี่ยน)
-- วางท้ายส่วนที่ 2: ต้องรอให้ทุกคอลัมน์ที่ใช้ (user_branch_id ฯลฯ) ถูกเติมครบก่อน — ฐานเก่ามาก (12 ต.ค.) ยังไม่มี
-- ดูรายการที่จะเปลี่ยนก่อน deploy:
--   SELECT u.user_username, u.user_fname, u.user_lname, e.emp_first_name_th, e.emp_last_name_th FROM tb_users u
--   JOIN tb_employees e ON e.emp_user_id = u.user_id
--   WHERE (e.emp_termination_date IS NULL OR e.emp_termination_date >= CURDATE()) AND (u.user_fname <> e.emp_first_name_th OR u.user_lname <> e.emp_last_name_th);
SET @link_today = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'));
-- เบอร์ของพนักงานที่ยังว่าง: เติมจากบัญชีก่อน (ไม่ลบเบอร์ที่ผู้ใช้กรอกไว้ทิ้ง)
UPDATE tb_employees e JOIN tb_users u ON u.user_id = e.emp_user_id
SET e.emp_phone = u.user_phone
WHERE e.emp_phone IS NULL AND u.user_phone IS NOT NULL AND (e.emp_termination_date IS NULL OR e.emp_termination_date >= @link_today);
UPDATE tb_users u JOIN tb_employees e ON e.emp_user_id = u.user_id
SET u.user_fname = e.emp_first_name_th, u.user_lname = e.emp_last_name_th, u.user_phone = e.emp_phone, u.user_branch_id = e.emp_branch_id
WHERE (e.emp_termination_date IS NULL OR e.emp_termination_date >= @link_today);

-- ─── ส่วนที่ 3: เติม index ที่ยังขาด ──────────────────────────────────────────────────────────
-- index ทั่วไป: ถ้ามีชื่อนี้อยู่แต่คอลัมน์ไม่ตรง (เช่น index ของเวอร์ชันเก่า) → ลบแล้วสร้างใหม่ให้ถูก
-- index ที่ชื่อขึ้นต้นด้วย fk_ (MySQL สร้างให้ foreign key) เช็คแค่ว่ามีหรือไม่ เพราะลบขณะ FK ใช้อยู่ไม่ได้
-- tb_department
-- ชื่อแผนกซ้ำได้ข้ามสาขาแล้ว (2026-10-18): ลบ uq_dep_name เดิม แทนด้วย uq_dep_branch_name
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'uq_dep_name') > 0, 'ALTER TABLE `tb_department` DROP INDEX `uq_dep_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'uq_dep_code') = 0, 'ALTER TABLE `tb_department` ADD UNIQUE KEY `uq_dep_code` (`dep_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'uq_dep_branch_name') = 0, 'ALTER TABLE `tb_department` ADD UNIQUE KEY `uq_dep_branch_name` (`dep_branch_id`,`dep_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND INDEX_NAME = 'fk_dep_branch') = 0, 'ALTER TABLE `tb_department` ADD KEY `fk_dep_branch` (`dep_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
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

-- tb_invoices
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'uq_inv_number') <> 'inv_number', 'ALTER TABLE `tb_invoices` DROP INDEX `uq_inv_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'uq_inv_number') = 0, 'ALTER TABLE `tb_invoices` ADD UNIQUE KEY `uq_inv_number` (`inv_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_status_due') <> 'inv_status,inv_due_date', 'ALTER TABLE `tb_invoices` DROP INDEX `idx_inv_status_due`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_status_due') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `idx_inv_status_due` (`inv_status`,`inv_due_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_issue_date') <> 'inv_issue_date', 'ALTER TABLE `tb_invoices` DROP INDEX `idx_inv_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_issue_date') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `idx_inv_issue_date` (`inv_issue_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_client_status') <> 'inv_client_id,inv_status', 'ALTER TABLE `tb_invoices` DROP INDEX `idx_inv_client_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_client_status') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `idx_inv_client_status` (`inv_client_id`,`inv_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_created_by_created') <> 'inv_created_by,inv_created_at', 'ALTER TABLE `tb_invoices` DROP INDEX `idx_inv_created_by_created`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'idx_inv_created_by_created') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `idx_inv_created_by_created` (`inv_created_by`,`inv_created_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_quotation') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_quotation` (`inv_quotation_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_project') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_project` (`inv_project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_branch') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_branch` (`inv_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_currency') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_currency` (`inv_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_reissued_from') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_reissued_from` (`inv_reissued_from_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_bank_account') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_bank_account` (`inv_bank_account_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_issued_by') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_issued_by` (`inv_issued_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_issuer_signature') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_issuer_signature` (`inv_issuer_signature_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_cancelled_by') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_cancelled_by` (`inv_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_items
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND INDEX_NAME = 'idx_invi_invoice') <> 'invi_invoice_id,invi_order', 'ALTER TABLE `tb_invoice_items` DROP INDEX `idx_invi_invoice`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND INDEX_NAME = 'idx_invi_invoice') = 0, 'ALTER TABLE `tb_invoice_items` ADD KEY `idx_invi_invoice` (`invi_invoice_id`,`invi_order`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND INDEX_NAME = 'fk_invi_product') = 0, 'ALTER TABLE `tb_invoice_items` ADD KEY `fk_invi_product` (`invi_product_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_milestones
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND INDEX_NAME = 'fk_ivm_milestone') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD KEY `fk_ivm_milestone` (`ivm_milestone_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_approvals
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND INDEX_NAME = 'idx_inva_invoice') <> 'inva_invoice_id,inva_round,inva_level', 'ALTER TABLE `tb_invoice_approvals` DROP INDEX `idx_inva_invoice`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND INDEX_NAME = 'idx_inva_invoice') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD KEY `idx_inva_invoice` (`inva_invoice_id`,`inva_round`,`inva_level`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND INDEX_NAME = 'fk_inva_user') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD KEY `fk_inva_user` (`inva_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_notes
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'uq_bn_number') <> 'bn_number', 'ALTER TABLE `tb_billing_notes` DROP INDEX `uq_bn_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'uq_bn_number') = 0, 'ALTER TABLE `tb_billing_notes` ADD UNIQUE KEY `uq_bn_number` (`bn_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'idx_bn_client_status') <> 'bn_client_id,bn_status', 'ALTER TABLE `tb_billing_notes` DROP INDEX `idx_bn_client_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'idx_bn_client_status') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `idx_bn_client_status` (`bn_client_id`,`bn_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'idx_bn_issue_date') <> 'bn_issue_date', 'ALTER TABLE `tb_billing_notes` DROP INDEX `idx_bn_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'idx_bn_issue_date') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `idx_bn_issue_date` (`bn_issue_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'fk_bn_branch') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `fk_bn_branch` (`bn_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'fk_bn_currency') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `fk_bn_currency` (`bn_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'fk_bn_created_by') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `fk_bn_created_by` (`bn_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND INDEX_NAME = 'fk_bn_cancelled_by') = 0, 'ALTER TABLE `tb_billing_notes` ADD KEY `fk_bn_cancelled_by` (`bn_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_note_invoices
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND INDEX_NAME = 'fk_bni_invoice') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD KEY `fk_bni_invoice` (`bni_invoice_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_receipts
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'uq_rc_number') <> 'rc_number', 'ALTER TABLE `tb_receipts` DROP INDEX `uq_rc_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'uq_rc_number') = 0, 'ALTER TABLE `tb_receipts` ADD UNIQUE KEY `uq_rc_number` (`rc_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'idx_rc_client_status') <> 'rc_client_id,rc_status', 'ALTER TABLE `tb_receipts` DROP INDEX `idx_rc_client_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'idx_rc_client_status') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `idx_rc_client_status` (`rc_client_id`,`rc_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'idx_rc_receipt_date') <> 'rc_receipt_date', 'ALTER TABLE `tb_receipts` DROP INDEX `idx_rc_receipt_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'idx_rc_receipt_date') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `idx_rc_receipt_date` (`rc_receipt_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_branch') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_branch` (`rc_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_currency') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_currency` (`rc_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_bank_account') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_bank_account` (`rc_bank_account_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_billing_note') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_billing_note` (`rc_billing_note_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_created_by') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_created_by` (`rc_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND INDEX_NAME = 'fk_rc_cancelled_by') = 0, 'ALTER TABLE `tb_receipts` ADD KEY `fk_rc_cancelled_by` (`rc_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_receipt_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND INDEX_NAME = 'fk_rca_invoice') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD KEY `fk_rca_invoice` (`rca_invoice_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND INDEX_NAME = 'fk_wr_created_by') = 0, 'ALTER TABLE `tb_wht_rates` ADD KEY `fk_wr_created_by` (`wr_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_categories
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND INDEX_NAME = 'uq_ec_name_th') <> 'ec_name_th', 'ALTER TABLE `tb_expense_categories` DROP INDEX `uq_ec_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND INDEX_NAME = 'uq_ec_name_th') = 0, 'ALTER TABLE `tb_expense_categories` ADD UNIQUE KEY `uq_ec_name_th` (`ec_name_th`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND INDEX_NAME = 'fk_ec_income_type') = 0, 'ALTER TABLE `tb_expense_categories` ADD KEY `fk_ec_income_type` (`ec_default_income_type`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_vendors
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'uq_vd_code') <> 'vd_code', 'ALTER TABLE `tb_vendors` DROP INDEX `uq_vd_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'uq_vd_code') = 0, 'ALTER TABLE `tb_vendors` ADD UNIQUE KEY `uq_vd_code` (`vd_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'idx_vd_name') <> 'vd_name', 'ALTER TABLE `tb_vendors` DROP INDEX `idx_vd_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'idx_vd_name') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `idx_vd_name` (`vd_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'idx_vd_tax_id') <> 'vd_tax_id', 'ALTER TABLE `tb_vendors` DROP INDEX `idx_vd_tax_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'idx_vd_tax_id') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `idx_vd_tax_id` (`vd_tax_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'fk_vd_currency') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `fk_vd_currency` (`vd_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'fk_vd_income_type') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `fk_vd_income_type` (`vd_default_income_type`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'fk_vd_category') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `fk_vd_category` (`vd_default_category_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND INDEX_NAME = 'fk_vd_created_by') = 0, 'ALTER TABLE `tb_vendors` ADD KEY `fk_vd_created_by` (`vd_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expenses
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'uq_ex_number') <> 'ex_number', 'ALTER TABLE `tb_expenses` DROP INDEX `uq_ex_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'uq_ex_number') = 0, 'ALTER TABLE `tb_expenses` ADD UNIQUE KEY `uq_ex_number` (`ex_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_status_due') <> 'ex_status,ex_due_date', 'ALTER TABLE `tb_expenses` DROP INDEX `idx_ex_status_due`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_status_due') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `idx_ex_status_due` (`ex_status`,`ex_due_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_vendor_doc') <> 'ex_vendor_id,ex_vendor_doc_no', 'ALTER TABLE `tb_expenses` DROP INDEX `idx_ex_vendor_doc`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_vendor_doc') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `idx_ex_vendor_doc` (`ex_vendor_id`,`ex_vendor_doc_no`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_employee') <> 'ex_employee_id,ex_status', 'ALTER TABLE `tb_expenses` DROP INDEX `idx_ex_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_employee') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `idx_ex_employee` (`ex_employee_id`,`ex_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_expense_date') <> 'ex_expense_date', 'ALTER TABLE `tb_expenses` DROP INDEX `idx_ex_expense_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'idx_ex_expense_date') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `idx_ex_expense_date` (`ex_expense_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'fk_ex_branch') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `fk_ex_branch` (`ex_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'fk_ex_currency') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `fk_ex_currency` (`ex_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'fk_ex_income_type') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `fk_ex_income_type` (`ex_wht_income_type`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'fk_ex_created_by') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `fk_ex_created_by` (`ex_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND INDEX_NAME = 'fk_ex_cancelled_by') = 0, 'ALTER TABLE `tb_expenses` ADD KEY `fk_ex_cancelled_by` (`ex_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_lines
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND INDEX_NAME = 'idx_exl_expense') <> 'exl_expense_id,exl_order', 'ALTER TABLE `tb_expense_lines` DROP INDEX `idx_exl_expense`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND INDEX_NAME = 'idx_exl_expense') = 0, 'ALTER TABLE `tb_expense_lines` ADD KEY `idx_exl_expense` (`exl_expense_id`,`exl_order`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND INDEX_NAME = 'idx_exl_project') <> 'exl_project_id', 'ALTER TABLE `tb_expense_lines` DROP INDEX `idx_exl_project`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND INDEX_NAME = 'idx_exl_project') = 0, 'ALTER TABLE `tb_expense_lines` ADD KEY `idx_exl_project` (`exl_project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND INDEX_NAME = 'fk_exl_category') = 0, 'ALTER TABLE `tb_expense_lines` ADD KEY `fk_exl_category` (`exl_category_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_attachments
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND INDEX_NAME = 'idx_exf_expense') <> 'exf_expense_id', 'ALTER TABLE `tb_expense_attachments` DROP INDEX `idx_exf_expense`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND INDEX_NAME = 'idx_exf_expense') = 0, 'ALTER TABLE `tb_expense_attachments` ADD KEY `idx_exf_expense` (`exf_expense_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND INDEX_NAME = 'fk_exf_uploaded_by') = 0, 'ALTER TABLE `tb_expense_attachments` ADD KEY `fk_exf_uploaded_by` (`exf_uploaded_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_approvals
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND INDEX_NAME = 'idx_expa_expense') <> 'expa_expense_id,expa_round,expa_level', 'ALTER TABLE `tb_expense_approvals` DROP INDEX `idx_expa_expense`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND INDEX_NAME = 'idx_expa_expense') = 0, 'ALTER TABLE `tb_expense_approvals` ADD KEY `idx_expa_expense` (`expa_expense_id`,`expa_round`,`expa_level`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND INDEX_NAME = 'fk_expa_user') = 0, 'ALTER TABLE `tb_expense_approvals` ADD KEY `fk_expa_user` (`expa_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payments
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'uq_pv_number') <> 'pv_number', 'ALTER TABLE `tb_payments` DROP INDEX `uq_pv_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'uq_pv_number') = 0, 'ALTER TABLE `tb_payments` ADD UNIQUE KEY `uq_pv_number` (`pv_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_payment_date') <> 'pv_payment_date', 'ALTER TABLE `tb_payments` DROP INDEX `idx_pv_payment_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_payment_date') = 0, 'ALTER TABLE `tb_payments` ADD KEY `idx_pv_payment_date` (`pv_payment_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_vendor') <> 'pv_vendor_id,pv_status', 'ALTER TABLE `tb_payments` DROP INDEX `idx_pv_vendor`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_vendor') = 0, 'ALTER TABLE `tb_payments` ADD KEY `idx_pv_vendor` (`pv_vendor_id`,`pv_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_employee') <> 'pv_employee_id,pv_status', 'ALTER TABLE `tb_payments` DROP INDEX `idx_pv_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'idx_pv_employee') = 0, 'ALTER TABLE `tb_payments` ADD KEY `idx_pv_employee` (`pv_employee_id`,`pv_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'fk_pv_branch') = 0, 'ALTER TABLE `tb_payments` ADD KEY `fk_pv_branch` (`pv_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'fk_pv_currency') = 0, 'ALTER TABLE `tb_payments` ADD KEY `fk_pv_currency` (`pv_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'fk_pv_bank_account') = 0, 'ALTER TABLE `tb_payments` ADD KEY `fk_pv_bank_account` (`pv_bank_account_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'fk_pv_created_by') = 0, 'ALTER TABLE `tb_payments` ADD KEY `fk_pv_created_by` (`pv_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND INDEX_NAME = 'fk_pv_cancelled_by') = 0, 'ALTER TABLE `tb_payments` ADD KEY `fk_pv_cancelled_by` (`pv_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payment_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND INDEX_NAME = 'fk_pva_expense') = 0, 'ALTER TABLE `tb_payment_allocations` ADD KEY `fk_pva_expense` (`pva_expense_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificates
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'uq_wt_number') <> 'wt_number', 'ALTER TABLE `tb_wht_certificates` DROP INDEX `uq_wt_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'uq_wt_number') = 0, 'ALTER TABLE `tb_wht_certificates` ADD UNIQUE KEY `uq_wt_number` (`wt_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'uq_wt_payment') <> 'wt_payment_id', 'ALTER TABLE `tb_wht_certificates` DROP INDEX `uq_wt_payment`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'uq_wt_payment') = 0, 'ALTER TABLE `tb_wht_certificates` ADD UNIQUE KEY `uq_wt_payment` (`wt_payment_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'idx_wt_form_date') <> 'wt_form,wt_payment_date', 'ALTER TABLE `tb_wht_certificates` DROP INDEX `idx_wt_form_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND INDEX_NAME = 'idx_wt_form_date') = 0, 'ALTER TABLE `tb_wht_certificates` ADD KEY `idx_wt_form_date` (`wt_form`,`wt_payment_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificate_lines
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND INDEX_NAME = 'idx_wtl_certificate') <> 'wtl_certificate_id', 'ALTER TABLE `tb_wht_certificate_lines` DROP INDEX `idx_wtl_certificate`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND INDEX_NAME = 'idx_wtl_certificate') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD KEY `idx_wtl_certificate` (`wtl_certificate_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND INDEX_NAME = 'fk_wtl_income_type') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD KEY `fk_wtl_income_type` (`wtl_income_type`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employees
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'uq_emp_code') <> 'emp_code', 'ALTER TABLE `tb_employees` DROP INDEX `uq_emp_code`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'uq_emp_code') = 0, 'ALTER TABLE `tb_employees` ADD UNIQUE KEY `uq_emp_code` (`emp_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_name') <> 'emp_first_name_th,emp_last_name_th', 'ALTER TABLE `tb_employees` DROP INDEX `idx_emp_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_name') = 0, 'ALTER TABLE `tb_employees` ADD KEY `idx_emp_name` (`emp_first_name_th`,`emp_last_name_th`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_national_id') <> 'emp_national_id', 'ALTER TABLE `tb_employees` DROP INDEX `idx_emp_national_id`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_national_id') = 0, 'ALTER TABLE `tb_employees` ADD KEY `idx_emp_national_id` (`emp_national_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_termination') <> 'emp_termination_date', 'ALTER TABLE `tb_employees` DROP INDEX `idx_emp_termination`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'idx_emp_termination') = 0, 'ALTER TABLE `tb_employees` ADD KEY `idx_emp_termination` (`emp_termination_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'fk_emp_user') = 0, 'ALTER TABLE `tb_employees` ADD KEY `fk_emp_user` (`emp_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'fk_emp_department') = 0, 'ALTER TABLE `tb_employees` ADD KEY `fk_emp_department` (`emp_department_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'fk_emp_branch') = 0, 'ALTER TABLE `tb_employees` ADD KEY `fk_emp_branch` (`emp_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND INDEX_NAME = 'fk_emp_created_by') = 0, 'ALTER TABLE `tb_employees` ADD KEY `fk_emp_created_by` (`emp_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_compensations
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND INDEX_NAME = 'fk_ecm_created_by') = 0, 'ALTER TABLE `tb_employee_compensations` ADD KEY `fk_ecm_created_by` (`ecm_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_recurring_items
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND INDEX_NAME = 'idx_eri_employee') <> 'eri_employee_id,eri_effective_from', 'ALTER TABLE `tb_employee_recurring_items` DROP INDEX `idx_eri_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND INDEX_NAME = 'idx_eri_employee') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD KEY `idx_eri_employee` (`eri_employee_id`,`eri_effective_from`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND INDEX_NAME = 'fk_eri_created_by') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD KEY `fk_eri_created_by` (`eri_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_sso_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND INDEX_NAME = 'fk_sr_created_by') = 0, 'ALTER TABLE `tb_sso_rates` ADD KEY `fk_sr_created_by` (`sr_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_income_tax_years
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND INDEX_NAME = 'fk_ity_created_by') = 0, 'ALTER TABLE `tb_income_tax_years` ADD KEY `fk_ity_created_by` (`ity_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_settings
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND INDEX_NAME = 'fk_ps_updated_by') = 0, 'ALTER TABLE `tb_payroll_settings` ADD KEY `fk_ps_updated_by` (`ps_updated_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_company_holidays
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND INDEX_NAME = 'fk_hd_created_by') = 0, 'ALTER TABLE `tb_company_holidays` ADD KEY `fk_hd_created_by` (`hd_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_types
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND INDEX_NAME = 'uq_lt_name_th') <> 'lt_name_th', 'ALTER TABLE `tb_leave_types` DROP INDEX `uq_lt_name_th`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_types' AND INDEX_NAME = 'uq_lt_name_th') = 0, 'ALTER TABLE `tb_leave_types` ADD UNIQUE KEY `uq_lt_name_th` (`lt_name_th`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_timesheet_weeks
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND INDEX_NAME = 'uq_tsw_employee_week') <> 'tsw_employee_id,tsw_week_start', 'ALTER TABLE `tb_timesheet_weeks` DROP INDEX `uq_tsw_employee_week`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND INDEX_NAME = 'uq_tsw_employee_week') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD UNIQUE KEY `uq_tsw_employee_week` (`tsw_employee_id`,`tsw_week_start`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND INDEX_NAME = 'idx_tsw_status') <> 'tsw_status,tsw_week_start', 'ALTER TABLE `tb_timesheet_weeks` DROP INDEX `idx_tsw_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND INDEX_NAME = 'idx_tsw_status') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD KEY `idx_tsw_status` (`tsw_status`,`tsw_week_start`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND INDEX_NAME = 'fk_tsw_returned_by') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD KEY `fk_tsw_returned_by` (`tsw_returned_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_timesheet_entries
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'idx_tse_project_date') <> 'tse_project_id,tse_date', 'ALTER TABLE `tb_timesheet_entries` DROP INDEX `idx_tse_project_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'idx_tse_project_date') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD KEY `idx_tse_project_date` (`tse_project_id`,`tse_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'idx_tse_employee_date') <> 'tse_employee_id,tse_date', 'ALTER TABLE `tb_timesheet_entries` DROP INDEX `idx_tse_employee_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'idx_tse_employee_date') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD KEY `idx_tse_employee_date` (`tse_employee_id`,`tse_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'fk_tse_week') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD KEY `fk_tse_week` (`tse_week_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'fk_tse_task') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD KEY `fk_tse_task` (`tse_task_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND INDEX_NAME = 'fk_tse_approved_by') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD KEY `fk_tse_approved_by` (`tse_approved_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_labels
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND INDEX_NAME = 'uq_pl_project_name') <> 'pl_project_id,pl_name', 'ALTER TABLE `tb_project_labels` DROP INDEX `uq_pl_project_name`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND INDEX_NAME = 'uq_pl_project_name') = 0, 'ALTER TABLE `tb_project_labels` ADD UNIQUE KEY `uq_pl_project_name` (`pl_project_id`,`pl_name`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND INDEX_NAME = 'fk_pl_created_by') = 0, 'ALTER TABLE `tb_project_labels` ADD KEY `fk_pl_created_by` (`pl_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_labels
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_labels' AND INDEX_NAME = 'fk_tl_label') = 0, 'ALTER TABLE `tb_task_labels` ADD KEY `fk_tl_label` (`tl_label_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_checklist_items
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND INDEX_NAME = 'idx_tci_task') <> 'tci_task_id,tci_sort_order', 'ALTER TABLE `tb_task_checklist_items` DROP INDEX `idx_tci_task`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND INDEX_NAME = 'idx_tci_task') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD KEY `idx_tci_task` (`tci_task_id`,`tci_sort_order`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND INDEX_NAME = 'fk_tci_done_by') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD KEY `fk_tci_done_by` (`tci_done_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND INDEX_NAME = 'fk_tci_created_by') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD KEY `fk_tci_created_by` (`tci_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_requests
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'idx_lr_employee_dates') <> 'lr_employee_id,lr_start_date', 'ALTER TABLE `tb_leave_requests` DROP INDEX `idx_lr_employee_dates`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'idx_lr_employee_dates') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `idx_lr_employee_dates` (`lr_employee_id`,`lr_start_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'idx_lr_status_dates') <> 'lr_status,lr_start_date', 'ALTER TABLE `tb_leave_requests` DROP INDEX `idx_lr_status_dates`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'idx_lr_status_dates') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `idx_lr_status_dates` (`lr_status`,`lr_start_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'fk_lr_leave_type') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `fk_lr_leave_type` (`lr_leave_type_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'fk_lr_decided_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `fk_lr_decided_by` (`lr_decided_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'fk_lr_cancelled_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `fk_lr_cancelled_by` (`lr_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND INDEX_NAME = 'fk_lr_created_by') = 0, 'ALTER TABLE `tb_leave_requests` ADD KEY `fk_lr_created_by` (`lr_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_attachments
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND INDEX_NAME = 'idx_lra_request') <> 'lra_request_id', 'ALTER TABLE `tb_leave_attachments` DROP INDEX `idx_lra_request`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND INDEX_NAME = 'idx_lra_request') = 0, 'ALTER TABLE `tb_leave_attachments` ADD KEY `idx_lra_request` (`lra_request_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND INDEX_NAME = 'fk_lra_uploaded_by') = 0, 'ALTER TABLE `tb_leave_attachments` ADD KEY `fk_lra_uploaded_by` (`lra_uploaded_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_tax_profiles
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND INDEX_NAME = 'fk_etp_updated_by') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD KEY `fk_etp_updated_by` (`etp_updated_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_runs
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND INDEX_NAME = 'idx_pr_period_status') <> 'pr_period,pr_status', 'ALTER TABLE `tb_payroll_runs` DROP INDEX `idx_pr_period_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND INDEX_NAME = 'idx_pr_period_status') = 0, 'ALTER TABLE `tb_payroll_runs` ADD KEY `idx_pr_period_status` (`pr_period`,`pr_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND INDEX_NAME = 'fk_pr_paid_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD KEY `fk_pr_paid_by` (`pr_paid_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND INDEX_NAME = 'fk_pr_cancelled_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD KEY `fk_pr_cancelled_by` (`pr_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND INDEX_NAME = 'fk_pr_created_by') = 0, 'ALTER TABLE `tb_payroll_runs` ADD KEY `fk_pr_created_by` (`pr_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_approvals
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND INDEX_NAME = 'idx_pra_run_round') <> 'pra_run_id,pra_round', 'ALTER TABLE `tb_payroll_approvals` DROP INDEX `idx_pra_run_round`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND INDEX_NAME = 'idx_pra_run_round') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD KEY `idx_pra_run_round` (`pra_run_id`,`pra_round`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND INDEX_NAME = 'fk_pra_user') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD KEY `fk_pra_user` (`pra_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_items
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND INDEX_NAME = 'uq_pri_run_employee') <> 'pri_run_id,pri_employee_id', 'ALTER TABLE `tb_payroll_items` DROP INDEX `uq_pri_run_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND INDEX_NAME = 'uq_pri_run_employee') = 0, 'ALTER TABLE `tb_payroll_items` ADD UNIQUE KEY `uq_pri_run_employee` (`pri_run_id`,`pri_employee_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND INDEX_NAME = 'idx_pri_employee') <> 'pri_employee_id', 'ALTER TABLE `tb_payroll_items` DROP INDEX `idx_pri_employee`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND INDEX_NAME = 'idx_pri_employee') = 0, 'ALTER TABLE `tb_payroll_items` ADD KEY `idx_pri_employee` (`pri_employee_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_item_lines
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND INDEX_NAME = 'idx_pil_item') <> 'pil_item_id', 'ALTER TABLE `tb_payroll_item_lines` DROP INDEX `idx_pil_item`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND INDEX_NAME = 'idx_pil_item') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD KEY `idx_pil_item` (`pil_item_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND INDEX_NAME = 'fk_pil_created_by') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD KEY `fk_pil_created_by` (`pil_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_labor_cost_allocations
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND INDEX_NAME = 'idx_lca_project_period') <> 'lca_project_id,lca_period', 'ALTER TABLE `tb_labor_cost_allocations` DROP INDEX `idx_lca_project_period`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND INDEX_NAME = 'idx_lca_project_period') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD KEY `idx_lca_project_period` (`lca_project_id`,`lca_period`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND INDEX_NAME = 'idx_lca_run') <> 'lca_run_id', 'ALTER TABLE `tb_labor_cost_allocations` DROP INDEX `idx_lca_run`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND INDEX_NAME = 'idx_lca_run') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD KEY `idx_lca_run` (`lca_run_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND INDEX_NAME = 'fk_lca_employee') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD KEY `fk_lca_employee` (`lca_employee_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_notes
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'uq_cn_number') <> 'cn_number', 'ALTER TABLE `tb_credit_notes` DROP INDEX `uq_cn_number`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'uq_cn_number') = 0, 'ALTER TABLE `tb_credit_notes` ADD UNIQUE KEY `uq_cn_number` (`cn_number`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'idx_cn_invoice_status') <> 'cn_invoice_id,cn_status', 'ALTER TABLE `tb_credit_notes` DROP INDEX `idx_cn_invoice_status`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'idx_cn_invoice_status') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `idx_cn_invoice_status` (`cn_invoice_id`,`cn_status`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'idx_cn_status_issue_date') <> 'cn_status,cn_issue_date', 'ALTER TABLE `tb_credit_notes` DROP INDEX `idx_cn_status_issue_date`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'idx_cn_status_issue_date') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `idx_cn_status_issue_date` (`cn_status`,`cn_issue_date`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_client') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_client` (`cn_client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_branch') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_branch` (`cn_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_project') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_project` (`cn_project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_currency') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_currency` (`cn_currency`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_refund_bank_account') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_refund_bank_account` (`cn_refund_bank_account_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_refunded_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_refunded_by` (`cn_refunded_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_created_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_created_by` (`cn_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_issued_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_issued_by` (`cn_issued_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_issuer_signature') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_issuer_signature` (`cn_issuer_signature_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND INDEX_NAME = 'fk_cn_cancelled_by') = 0, 'ALTER TABLE `tb_credit_notes` ADD KEY `fk_cn_cancelled_by` (`cn_cancelled_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_lines
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND INDEX_NAME = 'idx_cnl_credit_note') <> 'cnl_credit_note_id,cnl_order', 'ALTER TABLE `tb_credit_note_lines` DROP INDEX `idx_cnl_credit_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND INDEX_NAME = 'idx_cnl_credit_note') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD KEY `idx_cnl_credit_note` (`cnl_credit_note_id`,`cnl_order`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_approvals
SET @q = IF((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND INDEX_NAME = 'idx_cna_credit_note') <> 'cna_credit_note_id,cna_round,cna_level', 'ALTER TABLE `tb_credit_note_approvals` DROP INDEX `idx_cna_credit_note`', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND INDEX_NAME = 'idx_cna_credit_note') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD KEY `idx_cna_credit_note` (`cna_credit_note_id`,`cna_round`,`cna_level`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND INDEX_NAME = 'fk_cna_user') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD KEY `fk_cna_user` (`cna_user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoices (ใบเพิ่มหนี้ ขั้น N-2)
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND INDEX_NAME = 'fk_inv_reference') = 0, 'ALTER TABLE `tb_invoices` ADD KEY `fk_inv_reference` (`inv_reference_invoice_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_codes
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND INDEX_NAME = 'uq_ecd_code') = 0, 'ALTER TABLE `tb_employee_codes` ADD UNIQUE KEY `uq_ecd_code` (`ecd_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND INDEX_NAME = 'idx_ecd_employee') = 0, 'ALTER TABLE `tb_employee_codes` ADD KEY `idx_ecd_employee` (`ecd_employee_id`,`ecd_valid_to`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND INDEX_NAME = 'fk_ecd_department') = 0, 'ALTER TABLE `tb_employee_codes` ADD KEY `fk_ecd_department` (`ecd_department_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND INDEX_NAME = 'fk_ecd_branch') = 0, 'ALTER TABLE `tb_employee_codes` ADD KEY `fk_ecd_branch` (`ecd_branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND INDEX_NAME = 'fk_ecd_created_by') = 0, 'ALTER TABLE `tb_employee_codes` ADD KEY `fk_ecd_created_by` (`ecd_created_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employee_cards
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND INDEX_NAME = 'uq_ec_employee_seq') = 0, 'ALTER TABLE `tb_employee_cards` ADD UNIQUE KEY `uq_ec_employee_seq` (`ec_employee_id`,`ec_seq`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND INDEX_NAME = 'idx_ec_voided') = 0, 'ALTER TABLE `tb_employee_cards` ADD KEY `idx_ec_voided` (`ec_voided_at`,`ec_returned_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND INDEX_NAME = 'idx_ec_printed') = 0, 'ALTER TABLE `tb_employee_cards` ADD KEY `idx_ec_printed` (`ec_printed_at`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND INDEX_NAME = 'idx_ec_expires') = 0, 'ALTER TABLE `tb_employee_cards` ADD KEY `idx_ec_expires` (`ec_expires_on`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND INDEX_NAME = 'fk_ec_issued_by') = 0, 'ALTER TABLE `tb_employee_cards` ADD KEY `fk_ec_issued_by` (`ec_issued_by`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

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

-- tb_invoices
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_bank_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_bank_account` FOREIGN KEY (`inv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_branch` FOREIGN KEY (`inv_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_cancelled_by` FOREIGN KEY (`inv_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_client` FOREIGN KEY (`inv_client_id`) REFERENCES `tb_clients` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_created_by` FOREIGN KEY (`inv_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_currency` FOREIGN KEY (`inv_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_issued_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_issued_by` FOREIGN KEY (`inv_issued_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_issuer_signature' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_issuer_signature` FOREIGN KEY (`inv_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_project` FOREIGN KEY (`inv_project_id`) REFERENCES `tb_projects` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_quotation' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_quotation` FOREIGN KEY (`inv_quotation_id`) REFERENCES `tb_quotations` (`qt_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_reissued_from' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_reissued_from` FOREIGN KEY (`inv_reissued_from_id`) REFERENCES `tb_invoices` (`inv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND CONSTRAINT_NAME = 'fk_invi_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_items` ADD CONSTRAINT `fk_invi_invoice` FOREIGN KEY (`invi_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_items' AND CONSTRAINT_NAME = 'fk_invi_product' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_items` ADD CONSTRAINT `fk_invi_product` FOREIGN KEY (`invi_product_id`) REFERENCES `tb_products` (`product_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_milestones
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND CONSTRAINT_NAME = 'fk_ivm_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD CONSTRAINT `fk_ivm_invoice` FOREIGN KEY (`ivm_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_milestones' AND CONSTRAINT_NAME = 'fk_ivm_milestone' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_milestones` ADD CONSTRAINT `fk_ivm_milestone` FOREIGN KEY (`ivm_milestone_id`) REFERENCES `tb_quotation_milestones` (`qtm_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoice_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND CONSTRAINT_NAME = 'fk_inva_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD CONSTRAINT `fk_inva_invoice` FOREIGN KEY (`inva_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoice_approvals' AND CONSTRAINT_NAME = 'fk_inva_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoice_approvals` ADD CONSTRAINT `fk_inva_user` FOREIGN KEY (`inva_user_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_notes
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND CONSTRAINT_NAME = 'fk_bn_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_notes` ADD CONSTRAINT `fk_bn_branch` FOREIGN KEY (`bn_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND CONSTRAINT_NAME = 'fk_bn_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_notes` ADD CONSTRAINT `fk_bn_cancelled_by` FOREIGN KEY (`bn_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND CONSTRAINT_NAME = 'fk_bn_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_notes` ADD CONSTRAINT `fk_bn_client` FOREIGN KEY (`bn_client_id`) REFERENCES `tb_clients` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND CONSTRAINT_NAME = 'fk_bn_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_notes` ADD CONSTRAINT `fk_bn_created_by` FOREIGN KEY (`bn_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_notes' AND CONSTRAINT_NAME = 'fk_bn_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_notes` ADD CONSTRAINT `fk_bn_currency` FOREIGN KEY (`bn_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_billing_note_invoices
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND CONSTRAINT_NAME = 'fk_bni_billing_note' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD CONSTRAINT `fk_bni_billing_note` FOREIGN KEY (`bni_billing_note_id`) REFERENCES `tb_billing_notes` (`bn_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_billing_note_invoices' AND CONSTRAINT_NAME = 'fk_bni_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_billing_note_invoices` ADD CONSTRAINT `fk_bni_invoice` FOREIGN KEY (`bni_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_receipts
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_bank_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_bank_account` FOREIGN KEY (`rc_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_billing_note' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_billing_note` FOREIGN KEY (`rc_billing_note_id`) REFERENCES `tb_billing_notes` (`bn_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_branch` FOREIGN KEY (`rc_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_cancelled_by` FOREIGN KEY (`rc_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_client` FOREIGN KEY (`rc_client_id`) REFERENCES `tb_clients` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_created_by` FOREIGN KEY (`rc_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipts' AND CONSTRAINT_NAME = 'fk_rc_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipts` ADD CONSTRAINT `fk_rc_currency` FOREIGN KEY (`rc_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_receipt_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND CONSTRAINT_NAME = 'fk_rca_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD CONSTRAINT `fk_rca_invoice` FOREIGN KEY (`rca_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_receipt_allocations' AND CONSTRAINT_NAME = 'fk_rca_receipt' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_receipt_allocations` ADD CONSTRAINT `fk_rca_receipt` FOREIGN KEY (`rca_receipt_id`) REFERENCES `tb_receipts` (`rc_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND CONSTRAINT_NAME = 'fk_wr_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_wht_rates` ADD CONSTRAINT `fk_wr_created_by` FOREIGN KEY (`wr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_rates' AND CONSTRAINT_NAME = 'fk_wr_income_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_wht_rates` ADD CONSTRAINT `fk_wr_income_type` FOREIGN KEY (`wr_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_categories
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_categories' AND CONSTRAINT_NAME = 'fk_ec_income_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_categories` ADD CONSTRAINT `fk_ec_income_type` FOREIGN KEY (`ec_default_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_vendors
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND CONSTRAINT_NAME = 'fk_vd_category' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_vendors` ADD CONSTRAINT `fk_vd_category` FOREIGN KEY (`vd_default_category_id`) REFERENCES `tb_expense_categories` (`ec_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND CONSTRAINT_NAME = 'fk_vd_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_vendors` ADD CONSTRAINT `fk_vd_created_by` FOREIGN KEY (`vd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND CONSTRAINT_NAME = 'fk_vd_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_vendors` ADD CONSTRAINT `fk_vd_currency` FOREIGN KEY (`vd_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_vendors' AND CONSTRAINT_NAME = 'fk_vd_income_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_vendors` ADD CONSTRAINT `fk_vd_income_type` FOREIGN KEY (`vd_default_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expenses
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_branch` FOREIGN KEY (`ex_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_cancelled_by` FOREIGN KEY (`ex_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_created_by` FOREIGN KEY (`ex_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_currency` FOREIGN KEY (`ex_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_employee` FOREIGN KEY (`ex_employee_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_income_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_income_type` FOREIGN KEY (`ex_wht_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expenses' AND CONSTRAINT_NAME = 'fk_ex_vendor' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expenses` ADD CONSTRAINT `fk_ex_vendor` FOREIGN KEY (`ex_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND CONSTRAINT_NAME = 'fk_exl_category' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_lines` ADD CONSTRAINT `fk_exl_category` FOREIGN KEY (`exl_category_id`) REFERENCES `tb_expense_categories` (`ec_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND CONSTRAINT_NAME = 'fk_exl_expense' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_lines` ADD CONSTRAINT `fk_exl_expense` FOREIGN KEY (`exl_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_lines' AND CONSTRAINT_NAME = 'fk_exl_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_lines` ADD CONSTRAINT `fk_exl_project` FOREIGN KEY (`exl_project_id`) REFERENCES `tb_projects` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_attachments
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND CONSTRAINT_NAME = 'fk_exf_expense' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_attachments` ADD CONSTRAINT `fk_exf_expense` FOREIGN KEY (`exf_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_attachments' AND CONSTRAINT_NAME = 'fk_exf_uploaded_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_attachments` ADD CONSTRAINT `fk_exf_uploaded_by` FOREIGN KEY (`exf_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_expense_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND CONSTRAINT_NAME = 'fk_expa_expense' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_approvals` ADD CONSTRAINT `fk_expa_expense` FOREIGN KEY (`expa_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_expense_approvals' AND CONSTRAINT_NAME = 'fk_expa_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_expense_approvals` ADD CONSTRAINT `fk_expa_user` FOREIGN KEY (`expa_user_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payments
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_bank_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_bank_account` FOREIGN KEY (`pv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_branch` FOREIGN KEY (`pv_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_cancelled_by` FOREIGN KEY (`pv_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_created_by` FOREIGN KEY (`pv_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_currency` FOREIGN KEY (`pv_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_employee` FOREIGN KEY (`pv_employee_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payments' AND CONSTRAINT_NAME = 'fk_pv_vendor' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payments` ADD CONSTRAINT `fk_pv_vendor` FOREIGN KEY (`pv_vendor_id`) REFERENCES `tb_vendors` (`vd_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payment_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND CONSTRAINT_NAME = 'fk_pva_expense' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payment_allocations` ADD CONSTRAINT `fk_pva_expense` FOREIGN KEY (`pva_expense_id`) REFERENCES `tb_expenses` (`ex_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payment_allocations' AND CONSTRAINT_NAME = 'fk_pva_payment' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payment_allocations` ADD CONSTRAINT `fk_pva_payment` FOREIGN KEY (`pva_payment_id`) REFERENCES `tb_payments` (`pv_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificates
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificates' AND CONSTRAINT_NAME = 'fk_wt_payment' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_wht_certificates` ADD CONSTRAINT `fk_wt_payment` FOREIGN KEY (`wt_payment_id`) REFERENCES `tb_payments` (`pv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_wht_certificate_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND CONSTRAINT_NAME = 'fk_wtl_certificate' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD CONSTRAINT `fk_wtl_certificate` FOREIGN KEY (`wtl_certificate_id`) REFERENCES `tb_wht_certificates` (`wt_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_wht_certificate_lines' AND CONSTRAINT_NAME = 'fk_wtl_income_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_wht_certificate_lines` ADD CONSTRAINT `fk_wtl_income_type` FOREIGN KEY (`wtl_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employees
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND CONSTRAINT_NAME = 'fk_emp_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employees` ADD CONSTRAINT `fk_emp_branch` FOREIGN KEY (`emp_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND CONSTRAINT_NAME = 'fk_emp_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employees` ADD CONSTRAINT `fk_emp_created_by` FOREIGN KEY (`emp_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND CONSTRAINT_NAME = 'fk_emp_department' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employees` ADD CONSTRAINT `fk_emp_department` FOREIGN KEY (`emp_department_id`) REFERENCES `tb_department` (`dep_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employees' AND CONSTRAINT_NAME = 'fk_emp_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employees` ADD CONSTRAINT `fk_emp_user` FOREIGN KEY (`emp_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_compensations
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND CONSTRAINT_NAME = 'fk_ecm_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_compensations` ADD CONSTRAINT `fk_ecm_created_by` FOREIGN KEY (`ecm_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_compensations' AND CONSTRAINT_NAME = 'fk_ecm_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_compensations` ADD CONSTRAINT `fk_ecm_employee` FOREIGN KEY (`ecm_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_recurring_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND CONSTRAINT_NAME = 'fk_eri_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD CONSTRAINT `fk_eri_created_by` FOREIGN KEY (`eri_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_recurring_items' AND CONSTRAINT_NAME = 'fk_eri_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_recurring_items` ADD CONSTRAINT `fk_eri_employee` FOREIGN KEY (`eri_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_sso_rates
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_sso_rates' AND CONSTRAINT_NAME = 'fk_sr_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_sso_rates` ADD CONSTRAINT `fk_sr_created_by` FOREIGN KEY (`sr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_income_tax_years
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_years' AND CONSTRAINT_NAME = 'fk_ity_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_income_tax_years` ADD CONSTRAINT `fk_ity_created_by` FOREIGN KEY (`ity_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_income_tax_brackets
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_income_tax_brackets' AND CONSTRAINT_NAME = 'fk_itb_tax_year' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_income_tax_brackets` ADD CONSTRAINT `fk_itb_tax_year` FOREIGN KEY (`itb_tax_year`) REFERENCES `tb_income_tax_years` (`ity_tax_year`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_settings
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_settings' AND CONSTRAINT_NAME = 'fk_ps_updated_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_settings` ADD CONSTRAINT `fk_ps_updated_by` FOREIGN KEY (`ps_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_company_holidays
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_company_holidays' AND CONSTRAINT_NAME = 'fk_hd_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_company_holidays` ADD CONSTRAINT `fk_hd_created_by` FOREIGN KEY (`hd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_timesheet_weeks
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND CONSTRAINT_NAME = 'fk_tsw_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD CONSTRAINT `fk_tsw_employee` FOREIGN KEY (`tsw_employee_id`) REFERENCES `tb_employees` (`emp_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_weeks' AND CONSTRAINT_NAME = 'fk_tsw_returned_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_weeks` ADD CONSTRAINT `fk_tsw_returned_by` FOREIGN KEY (`tsw_returned_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_timesheet_entries
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND CONSTRAINT_NAME = 'fk_tse_approved_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD CONSTRAINT `fk_tse_approved_by` FOREIGN KEY (`tse_approved_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND CONSTRAINT_NAME = 'fk_tse_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD CONSTRAINT `fk_tse_employee` FOREIGN KEY (`tse_employee_id`) REFERENCES `tb_employees` (`emp_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND CONSTRAINT_NAME = 'fk_tse_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD CONSTRAINT `fk_tse_project` FOREIGN KEY (`tse_project_id`) REFERENCES `tb_projects` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND CONSTRAINT_NAME = 'fk_tse_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD CONSTRAINT `fk_tse_task` FOREIGN KEY (`tse_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_timesheet_entries' AND CONSTRAINT_NAME = 'fk_tse_week' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_timesheet_entries` ADD CONSTRAINT `fk_tse_week` FOREIGN KEY (`tse_week_id`) REFERENCES `tb_timesheet_weeks` (`tsw_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_project_labels
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND CONSTRAINT_NAME = 'fk_pl_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_labels` ADD CONSTRAINT `fk_pl_created_by` FOREIGN KEY (`pl_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_project_labels' AND CONSTRAINT_NAME = 'fk_pl_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_project_labels` ADD CONSTRAINT `fk_pl_project` FOREIGN KEY (`pl_project_id`) REFERENCES `tb_projects` (`project_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_labels
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_labels' AND CONSTRAINT_NAME = 'fk_tl_label' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_labels` ADD CONSTRAINT `fk_tl_label` FOREIGN KEY (`tl_label_id`) REFERENCES `tb_project_labels` (`pl_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_labels' AND CONSTRAINT_NAME = 'fk_tl_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_labels` ADD CONSTRAINT `fk_tl_task` FOREIGN KEY (`tl_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_task_checklist_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND CONSTRAINT_NAME = 'fk_tci_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD CONSTRAINT `fk_tci_created_by` FOREIGN KEY (`tci_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND CONSTRAINT_NAME = 'fk_tci_done_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD CONSTRAINT `fk_tci_done_by` FOREIGN KEY (`tci_done_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_task_checklist_items' AND CONSTRAINT_NAME = 'fk_tci_task' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_task_checklist_items` ADD CONSTRAINT `fk_tci_task` FOREIGN KEY (`tci_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_requests
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND CONSTRAINT_NAME = 'fk_lr_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_requests` ADD CONSTRAINT `fk_lr_cancelled_by` FOREIGN KEY (`lr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND CONSTRAINT_NAME = 'fk_lr_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_requests` ADD CONSTRAINT `fk_lr_created_by` FOREIGN KEY (`lr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND CONSTRAINT_NAME = 'fk_lr_decided_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_requests` ADD CONSTRAINT `fk_lr_decided_by` FOREIGN KEY (`lr_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND CONSTRAINT_NAME = 'fk_lr_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_requests` ADD CONSTRAINT `fk_lr_employee` FOREIGN KEY (`lr_employee_id`) REFERENCES `tb_employees` (`emp_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_requests' AND CONSTRAINT_NAME = 'fk_lr_leave_type' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_requests` ADD CONSTRAINT `fk_lr_leave_type` FOREIGN KEY (`lr_leave_type_id`) REFERENCES `tb_leave_types` (`lt_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_leave_attachments
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND CONSTRAINT_NAME = 'fk_lra_request' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_attachments` ADD CONSTRAINT `fk_lra_request` FOREIGN KEY (`lra_request_id`) REFERENCES `tb_leave_requests` (`lr_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_leave_attachments' AND CONSTRAINT_NAME = 'fk_lra_uploaded_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_leave_attachments` ADD CONSTRAINT `fk_lra_uploaded_by` FOREIGN KEY (`lra_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_employee_tax_profiles
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND CONSTRAINT_NAME = 'fk_etp_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD CONSTRAINT `fk_etp_employee` FOREIGN KEY (`etp_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_tax_profiles' AND CONSTRAINT_NAME = 'fk_etp_updated_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_tax_profiles` ADD CONSTRAINT `fk_etp_updated_by` FOREIGN KEY (`etp_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_runs
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND CONSTRAINT_NAME = 'fk_pr_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_runs` ADD CONSTRAINT `fk_pr_cancelled_by` FOREIGN KEY (`pr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND CONSTRAINT_NAME = 'fk_pr_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_runs` ADD CONSTRAINT `fk_pr_created_by` FOREIGN KEY (`pr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_runs' AND CONSTRAINT_NAME = 'fk_pr_paid_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_runs` ADD CONSTRAINT `fk_pr_paid_by` FOREIGN KEY (`pr_paid_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND CONSTRAINT_NAME = 'fk_pra_run' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD CONSTRAINT `fk_pra_run` FOREIGN KEY (`pra_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_approvals' AND CONSTRAINT_NAME = 'fk_pra_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_approvals` ADD CONSTRAINT `fk_pra_user` FOREIGN KEY (`pra_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_items
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND CONSTRAINT_NAME = 'fk_pri_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_items` ADD CONSTRAINT `fk_pri_employee` FOREIGN KEY (`pri_employee_id`) REFERENCES `tb_employees` (`emp_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_items' AND CONSTRAINT_NAME = 'fk_pri_run' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_items` ADD CONSTRAINT `fk_pri_run` FOREIGN KEY (`pri_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_payroll_item_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND CONSTRAINT_NAME = 'fk_pil_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD CONSTRAINT `fk_pil_created_by` FOREIGN KEY (`pil_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_payroll_item_lines' AND CONSTRAINT_NAME = 'fk_pil_item' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_payroll_item_lines` ADD CONSTRAINT `fk_pil_item` FOREIGN KEY (`pil_item_id`) REFERENCES `tb_payroll_items` (`pri_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_labor_cost_allocations
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND CONSTRAINT_NAME = 'fk_lca_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD CONSTRAINT `fk_lca_employee` FOREIGN KEY (`lca_employee_id`) REFERENCES `tb_employees` (`emp_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND CONSTRAINT_NAME = 'fk_lca_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD CONSTRAINT `fk_lca_project` FOREIGN KEY (`lca_project_id`) REFERENCES `tb_projects` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_labor_cost_allocations' AND CONSTRAINT_NAME = 'fk_lca_run' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_labor_cost_allocations` ADD CONSTRAINT `fk_lca_run` FOREIGN KEY (`lca_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_notes
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_branch` FOREIGN KEY (`cn_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_cancelled_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_cancelled_by` FOREIGN KEY (`cn_cancelled_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_client' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_client` FOREIGN KEY (`cn_client_id`) REFERENCES `tb_clients` (`client_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_created_by` FOREIGN KEY (`cn_created_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_currency' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_currency` FOREIGN KEY (`cn_currency`) REFERENCES `tb_currencies` (`cur_code`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_invoice' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_invoice` FOREIGN KEY (`cn_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_issued_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_issued_by` FOREIGN KEY (`cn_issued_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_issuer_signature' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_issuer_signature` FOREIGN KEY (`cn_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_project' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_project` FOREIGN KEY (`cn_project_id`) REFERENCES `tb_projects` (`project_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_refund_bank_account' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_refund_bank_account` FOREIGN KEY (`cn_refund_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_notes' AND CONSTRAINT_NAME = 'fk_cn_refunded_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_notes` ADD CONSTRAINT `fk_cn_refunded_by` FOREIGN KEY (`cn_refunded_by`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_lines
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_lines' AND CONSTRAINT_NAME = 'fk_cnl_credit_note' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_note_lines` ADD CONSTRAINT `fk_cnl_credit_note` FOREIGN KEY (`cnl_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_credit_note_approvals
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND CONSTRAINT_NAME = 'fk_cna_credit_note' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD CONSTRAINT `fk_cna_credit_note` FOREIGN KEY (`cna_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_credit_note_approvals' AND CONSTRAINT_NAME = 'fk_cna_user' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_credit_note_approvals` ADD CONSTRAINT `fk_cna_user` FOREIGN KEY (`cna_user_id`) REFERENCES `tb_users` (`user_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_invoices (ใบเพิ่มหนี้ ขั้น N-2)
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_invoices' AND CONSTRAINT_NAME = 'fk_inv_reference' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_invoices` ADD CONSTRAINT `fk_inv_reference` FOREIGN KEY (`inv_reference_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- tb_department (แผนกผูกสาขา 2026-10-18)
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_department' AND CONSTRAINT_NAME = 'fk_dep_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_department` ADD CONSTRAINT `fk_dep_branch` FOREIGN KEY (`dep_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employee_codes
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND CONSTRAINT_NAME = 'fk_ecd_branch' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_codes` ADD CONSTRAINT `fk_ecd_branch` FOREIGN KEY (`ecd_branch_id`) REFERENCES `tb_branches` (`branch_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND CONSTRAINT_NAME = 'fk_ecd_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_codes` ADD CONSTRAINT `fk_ecd_created_by` FOREIGN KEY (`ecd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND CONSTRAINT_NAME = 'fk_ecd_department' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_codes` ADD CONSTRAINT `fk_ecd_department` FOREIGN KEY (`ecd_department_id`) REFERENCES `tb_department` (`dep_id`)', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_codes' AND CONSTRAINT_NAME = 'fk_ecd_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_codes` ADD CONSTRAINT `fk_ecd_employee` FOREIGN KEY (`ecd_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
-- tb_employee_cards
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND CONSTRAINT_NAME = 'fk_ec_employee' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_cards` ADD CONSTRAINT `fk_ec_employee` FOREIGN KEY (`ec_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;
SET @q = IF((SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_employee_cards' AND CONSTRAINT_NAME = 'fk_ec_issued_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY') = 0, 'ALTER TABLE `tb_employee_cards` ADD CONSTRAINT `fk_ec_issued_by` FOREIGN KEY (`ec_issued_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL', 'DO 0'); PREPARE s FROM @q; EXECUTE s; DEALLOCATE PREPARE s;

-- ─── ส่วนที่ 5: ข้อมูลเริ่มต้น (ใส่เฉพาะตอนตารางยังว่างเท่านั้น) ─────────────────────────────────
-- ตั้งใจเช็ค "ตารางว่าง" ไม่ใช่ "ไม่มีแถวนี้" — ถ้าแอดมินลบ/เปลี่ยนบัญชีเริ่มต้นไปแล้วบน production
-- ห้ามสร้างบัญชีที่รู้รหัสผ่านกลับขึ้นมาใหม่เองตอน deploy

-- role Admin เปิดทุกบิต (54 บิต) — role ระบบ (S) ได้สิทธิ์ครบเสมออยู่แล้วไม่ว่าสตริงจะยาวเท่าไร (effectiveRolePermission)
-- role อื่นที่สตริงสั้นกว่าจำนวนบิตปัจจุบัน ถือว่าบิตใหม่ = 0 (ไม่ได้สิทธิ์ใหม่เอง ต้องมีคนติ๊กให้)
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
SELECT 'ROL202601010000001', 'Admin', '111111111111111111111111111111111111111111111111111111', 'S'
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

-- ใบเสนอราคาแบบเก็บเงินครั้งเดียวที่บันทึกก่อน 14 ต.ค. 2026 ยังไม่มีแถวงวด — เติมงวด "ชำระเต็มจำนวน" 100% ให้
-- (ใบแจ้งหนี้ช่วง 1B อ้างงวดเสมอ) · ใส่เฉพาะใบที่ยังไม่มีงวดเลย รันซ้ำไม่เพิ่มซ้ำ
INSERT INTO tb_quotation_milestones (qtm_quotation_id, qtm_order, qtm_name, qtm_condition, qtm_percent, qtm_amount)
SELECT q.qt_id, 1, IF(q.qt_language = 'en', 'Full payment', 'ชำระเต็มจำนวน'), NULL, 100, q.qt_total
FROM tb_quotations q
WHERE q.qt_payment_mode = 'single'
  AND NOT EXISTS (SELECT 1 FROM tb_quotation_milestones m WHERE m.qtm_quotation_id = q.qt_id);

-- กติกาอนุมัติเริ่มต้นของใบแจ้งหนี้ที่สร้างเอง (ช่วง 1B): ชั้นเดียว ยอดตั้งแต่ 0 บาท ผู้อนุมัติ = role ระบบ
-- (ใบที่ออกจากงวดของใบเสนอราคาไม่ต้องอนุมัติ) · ตั้งแยกจากใบเสนอราคาได้ที่ ตั้งค่าบริษัท > การอนุมัติ
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct)
SELECT 'IV', 1, 0.00, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_approval_levels WHERE al_doc_type = 'IV');

INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id)
SELECT 'IV', 1, (SELECT role_id FROM tb_roles WHERE role_type = 'S' ORDER BY role_id LIMIT 1)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tb_approval_level_roles WHERE alr_doc_type = 'IV')
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_type = 'S');

-- เฟส 2 (2026-10-16): ประเภทเงินได้ + อัตราหัก ณ ที่จ่าย + หมวดค่าใช้จ่ายเริ่มต้น — อัตราต้องยืนยันกับนักบัญชี (X1)
INSERT INTO tb_wht_income_types (wit_code, wit_name_th, wit_name_en, wit_form_row, wit_form_label, wit_sort_order)
SELECT * FROM (
  SELECT 'SERVICE', 'ค่าบริการ / ค่าจ้างทำของ', 'Service fee', 5, 'ค่าบริการ', 1
  UNION ALL SELECT 'PROFESSIONAL', 'ค่าวิชาชีพอิสระ (บัญชี กฎหมาย สถาปัตย์ ฯลฯ)', 'Professional fee', 5, 'ค่าวิชาชีพอิสระ', 2
  UNION ALL SELECT 'ADVERTISING', 'ค่าโฆษณา', 'Advertising', 5, 'ค่าโฆษณา', 3
  UNION ALL SELECT 'TRANSPORT', 'ค่าขนส่ง', 'Transport', 5, 'ค่าขนส่ง', 4
  UNION ALL SELECT 'RENT', 'ค่าเช่า', 'Rent', 5, 'ค่าเช่า', 5
  UNION ALL SELECT 'PRIZE', 'รางวัล / ส่วนลด / ประโยชน์จากการชิงโชค', 'Prize', 5, 'รางวัล', 6
) seed
WHERE NOT EXISTS (SELECT 1 FROM tb_wht_income_types);

INSERT INTO tb_wht_rates (wr_income_type, wr_effective_from, wr_rate, wr_min_payment, wr_note)
SELECT * FROM (
  SELECT 'SERVICE', '2000-01-01', 3.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
  UNION ALL SELECT 'PROFESSIONAL', '2000-01-01', 3.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
  UNION ALL SELECT 'ADVERTISING', '2000-01-01', 2.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
  UNION ALL SELECT 'TRANSPORT', '2000-01-01', 1.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
  UNION ALL SELECT 'RENT', '2000-01-01', 5.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
  UNION ALL SELECT 'PRIZE', '2000-01-01', 5.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'
) seed
WHERE NOT EXISTS (SELECT 1 FROM tb_wht_rates);

INSERT INTO tb_expense_categories (ec_name_th, ec_name_en, ec_default_income_type, ec_is_asset, ec_sort_order)
SELECT * FROM (
  SELECT 'ค่าจ้างฟรีแลนซ์ / ผู้รับเหมาช่วง', 'Freelance / subcontract', 'SERVICE', 0, 1
  UNION ALL SELECT 'เซิร์ฟเวอร์ / คลาวด์', 'Server / cloud', NULL, 0, 2
  UNION ALL SELECT 'ซอฟต์แวร์ / subscription', 'Software / subscription', NULL, 0, 3
  UNION ALL SELECT 'โดเมน / โฮสติ้ง', 'Domain / hosting', NULL, 0, 4
  UNION ALL SELECT 'ค่าโฆษณา / การตลาด', 'Advertising / marketing', 'ADVERTISING', 0, 5
  UNION ALL SELECT 'ค่าเช่าสำนักงาน', 'Office rent', 'RENT', 0, 6
  UNION ALL SELECT 'ค่าน้ำ ค่าไฟ อินเทอร์เน็ต โทรศัพท์', 'Utilities / internet / phone', NULL, 0, 7
  UNION ALL SELECT 'ค่าเดินทาง', 'Travel', NULL, 0, 8
  UNION ALL SELECT 'ค่ารับรอง', 'Entertainment', NULL, 0, 9
  UNION ALL SELECT 'วัสดุ / อุปกรณ์สำนักงาน', 'Office supplies', NULL, 0, 10
  UNION ALL SELECT 'อุปกรณ์คอมพิวเตอร์ (ทรัพย์สิน)', 'Computer equipment (asset)', NULL, 1, 11
  UNION ALL SELECT 'ค่าวิชาชีพ (บัญชี / กฎหมาย)', 'Professional fees', 'PROFESSIONAL', 0, 12
  UNION ALL SELECT 'ค่าธรรมเนียมธนาคาร', 'Bank charges', NULL, 0, 13
  UNION ALL SELECT 'ค่าขนส่ง / ไปรษณีย์', 'Delivery / postage', 'TRANSPORT', 0, 14
  UNION ALL SELECT 'อื่นๆ', 'Other', NULL, 0, 99
) seed
WHERE NOT EXISTS (SELECT 1 FROM tb_expense_categories);

-- เฟส 2 ขั้น 2-2: กติกาอนุมัติเริ่มต้นของค่าใช้จ่าย/บิลผู้ขาย (EX) — ยอดก่อน VAT ต่ำกว่า 3,000 บาทผ่านอัตโนมัติ (P2)
-- ตั้งแต่ 3,000 ขึ้นไป role ระบบอนุมัติ · แก้ได้ที่ ตั้งค่าบริษัท › การอนุมัติ
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct)
SELECT 'EX', 1, 3000.00, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_approval_levels WHERE al_doc_type = 'EX');

INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id)
SELECT 'EX', 1, (SELECT role_id FROM tb_roles WHERE role_type = 'S' ORDER BY role_id LIMIT 1)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tb_approval_level_roles WHERE alr_doc_type = 'EX')
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_type = 'S');

-- ใบเบิกเงินพนักงาน (EC): ทุกใบต้องอนุมัติ ผู้อนุมัติ = role ระบบ
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct)
SELECT 'EC', 1, 0.00, 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_approval_levels WHERE al_doc_type = 'EC');

INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id)
SELECT 'EC', 1, (SELECT role_id FROM tb_roles WHERE role_type = 'S' ORDER BY role_id LIMIT 1)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM tb_approval_level_roles WHERE alr_doc_type = 'EC')
  AND EXISTS (SELECT 1 FROM tb_roles WHERE role_type = 'S');

-- ── เฟส 4 ขั้น 4-1 (2026-10-17) — ใส่เฉพาะตอนตารางยังว่าง · ตัวเลขต้องให้นักบัญชียืนยันก่อนจ่ายเงินเดือนจริง (คำถาม Y1/Y2) ──
-- ประกันสังคม: ฝ่ายละ 5% · ฐานขั้นต่ำ 1,650 · เพดาน 17,500 ตั้งแต่ 1 ม.ค. 2569 (กฎกระทรวงปรับเพดานค่าจ้าง — เดิม 15,000)
INSERT INTO tb_sso_rates (sr_effective_from, sr_employee_rate, sr_employer_rate, sr_wage_floor, sr_wage_ceiling, sr_note)
SELECT '2026-01-01', 5.00, 5.00, 1650.00, 17500.00, 'ค่าเริ่มต้นของระบบ — ยืนยันกับนักบัญชีก่อนใช้ (Y1)'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_sso_rates);

-- ภาษีเงินได้ปี 2026: หักค่าใช้จ่าย 50% ไม่เกิน 100,000 · ลดหย่อนส่วนตัว 60,000 · ขั้นบันได 0–35% (ปีถัดไปใช้ชุดนี้จนกว่าจะเพิ่มปีใหม่)
INSERT INTO tb_income_tax_years (ity_tax_year, ity_expense_rate, ity_expense_cap, ity_personal_allowance, ity_note)
SELECT 2026, 50.00, 100000.00, 60000.00, 'ค่าเริ่มต้นของระบบ — ยืนยันกับนักบัญชีก่อนใช้ (Y2)'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_income_tax_years);

INSERT INTO tb_income_tax_brackets (itb_tax_year, itb_from_amount, itb_rate)
SELECT 2026, seed.from_amount, seed.rate FROM (
  SELECT 0.00 AS from_amount, 0.00 AS rate
  UNION ALL SELECT 150000.00, 5.00
  UNION ALL SELECT 300000.00, 10.00
  UNION ALL SELECT 500000.00, 15.00
  UNION ALL SELECT 750000.00, 20.00
  UNION ALL SELECT 1000000.00, 25.00
  UNION ALL SELECT 2000000.00, 30.00
  UNION ALL SELECT 5000000.00, 35.00
) seed
WHERE NOT EXISTS (SELECT 1 FROM tb_income_tax_brackets)
  AND EXISTS (SELECT 1 FROM tb_income_tax_years WHERE ity_tax_year = 2026);

INSERT INTO tb_payroll_settings (ps_id)
SELECT 1 FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_payroll_settings);

-- ── ลงเวลาเข้า-ออกงาน A-1 (2026-10-23) — กะเริ่มต้น (ใส่เฉพาะตอนยังไม่มีกะเลย) แล้วตั้งเป็นกะเริ่มต้นถ้ายังว่าง ──
INSERT INTO tb_work_schedules (ws_name, ws_start_time, ws_end_time, ws_break_minutes, ws_working_weekdays, ws_late_grace_minutes)
SELECT 'ออฟฟิศ 09:00-18:00', '09:00:00', '18:00:00', 60,
       COALESCE((SELECT ps_working_weekdays FROM tb_payroll_settings WHERE ps_id = 1), '1111100'), 0
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_work_schedules);
UPDATE tb_payroll_settings
SET ps_default_schedule_id = (SELECT MIN(ws_id) FROM tb_work_schedules WHERE ws_status = 'active')
WHERE ps_id = 1 AND ps_default_schedule_id IS NULL;
-- วันเริ่มใช้ลงเวลา = วันที่ deploy ตามเวลาไทย (เฉพาะตอนยังว่างและยังไม่มีการกดเลย — ไม่ทับที่ฝ่ายบุคคลตั้งเอง)
-- ไม่ใช้ CURDATE(): MySQL ที่ตั้งเป็น UTC จะได้วันก่อนหน้าเมื่อ deploy ช่วง 00:00-07:00 น.
UPDATE tb_payroll_settings SET ps_attendance_start_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00'))
WHERE ps_id = 1 AND ps_attendance_start_date IS NULL AND NOT EXISTS (SELECT 1 FROM tb_attendance_punches);


-- ประเภทลาตามพระราชบัญญัติคุ้มครองแรงงาน (ขั้นต่ำ) — บริษัทปรับได้ในหน้าตั้งค่าบุคคล
INSERT INTO tb_leave_types (lt_name_th, lt_name_en, lt_days_per_year, lt_is_paid, lt_attachment_from_days, lt_min_service_days, lt_sort_order)
SELECT * FROM (
  SELECT 'ลาป่วย' AS name_th, 'Sick leave' AS name_en, 30.0 AS days_per_year, 1 AS is_paid, 3.0 AS attachment_from_days, 0 AS min_service_days, 1 AS sort_order
  UNION ALL SELECT 'ลากิจ', 'Personal leave', 3.0, 1, NULL, 0, 2
  UNION ALL SELECT 'ลาพักร้อน', 'Annual leave', 6.0, 1, NULL, 365, 3
  UNION ALL SELECT 'ลาไม่รับค่าจ้าง', 'Unpaid leave', NULL, 0, NULL, 0, 4
) seed
WHERE NOT EXISTS (SELECT 1 FROM tb_leave_types);

-- คำถามความต้องการตั้งต้น (2026-10-25) — ใส่เฉพาะตอนยังไม่มีกลุ่มเลย · ผูกกลุ่มกับหมวดสินค้าเองในหน้าตั้งค่า
SET @seed_requirements = (SELECT COUNT(*) = 0 FROM tb_requirement_groups);
INSERT INTO tb_requirement_groups (rqg_id, rqg_name, rqg_description, rqg_is_general, rqg_sort_order)
SELECT * FROM (
    SELECT 1 AS rqg_id, 'ทั่วไป' AS rqg_name, 'ถามทุกคำขอ' AS rqg_description, 1 AS rqg_is_general, 1 AS rqg_sort_order
    UNION ALL SELECT 2 AS rqg_id, 'เว็บไซต์' AS rqg_name, 'ผูกกับหมวดงานเว็บไซต์' AS rqg_description, 0 AS rqg_is_general, 2 AS rqg_sort_order
    UNION ALL SELECT 3 AS rqg_id, 'แอปมือถือ' AS rqg_name, 'ผูกกับหมวดงานแอปมือถือ' AS rqg_description, 0 AS rqg_is_general, 3 AS rqg_sort_order
    UNION ALL SELECT 4 AS rqg_id, 'ออกแบบ UX/UI' AS rqg_name, 'ผูกกับหมวดงานออกแบบ' AS rqg_description, 0 AS rqg_is_general, 4 AS rqg_sort_order
    UNION ALL SELECT 5 AS rqg_id, 'ระบบงาน' AS rqg_name, 'ผูกกับหมวดระบบภายในองค์กร' AS rqg_description, 0 AS rqg_is_general, 5 AS rqg_sort_order
) AS seed WHERE @seed_requirements = 1;
INSERT INTO tb_requirement_questions (rqq_group_id, rqq_text, rqq_help, rqq_type, rqq_options, rqq_is_required, rqq_sort_order)
SELECT * FROM (
    SELECT 1 AS rqq_group_id, 'ธุรกิจ/องค์กรของคุณทำอะไร ลูกค้าหลักคือใคร' AS rqq_text, 'เช่น ร้านอาหารไทย ลูกค้าเป็นนักท่องเที่ยว' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 1 AS rqq_is_required, 1 AS rqq_sort_order
    UNION ALL SELECT 1 AS rqq_group_id, 'เป้าหมายของงานนี้' AS rqq_text, NULL AS rqq_help, 'multi' AS rqq_type, '["เพิ่มยอดขาย","ลดงานเอกสาร","สร้างภาพลักษณ์","ให้ลูกค้าจอง/สั่งเอง","อื่นๆ"]' AS rqq_options, 0 AS rqq_is_required, 2 AS rqq_sort_order
    UNION ALL SELECT 1 AS rqq_group_id, 'อยากให้เสร็จภายใน' AS rqq_text, NULL AS rqq_help, 'date' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 3 AS rqq_sort_order
    UNION ALL SELECT 1 AS rqq_group_id, 'งบประมาณที่ตั้งไว้' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["ต่ำกว่า 20,000","20,000-50,000","50,000-100,000","มากกว่า 100,000","ยังไม่แน่ใจ"]' AS rqq_options, 0 AS rqq_is_required, 4 AS rqq_sort_order
    UNION ALL SELECT 1 AS rqq_group_id, 'ใครเป็นคนตัดสินใจ/ตรวจรับงาน' AS rqq_text, NULL AS rqq_help, 'short_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 5 AS rqq_sort_order
    UNION ALL SELECT 1 AS rqq_group_id, 'ช่องทางที่สะดวกให้ติดต่อ' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["โทร","LINE","อีเมล"]' AS rqq_options, 0 AS rqq_is_required, 6 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'มีเว็บไซต์เดิมไหม' AS rqq_text, NULL AS rqq_help, 'yes_no' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 1 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'ลิงก์เว็บไซต์เดิม (ถ้ามี)' AS rqq_text, NULL AS rqq_help, 'url' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 2 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'ประมาณกี่หน้า และมีหน้าอะไรบ้าง' AS rqq_text, 'เช่น หน้าแรก เกี่ยวกับเรา บริการ ติดต่อ' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 3 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'มีโดเมนแล้วไหม' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["มีแล้ว","ยังไม่มี ให้จดให้","ไม่แน่ใจ"]' AS rqq_options, 0 AS rqq_is_required, 4 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'ต้องการระบบอะไรเพิ่ม' AS rqq_text, NULL AS rqq_help, 'multi' AS rqq_type, '["ฟอร์มติดต่อ","จอง/นัดหมาย","ร้านค้าออนไลน์","ชำระเงิน","ระบบสมาชิก","หลายภาษา","บทความ/ข่าว"]' AS rqq_options, 0 AS rqq_is_required, 5 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'ใครจะแก้เนื้อหาหลังส่งมอบ' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["แก้เอง ต้องมีหลังบ้าน","ให้ทีมงานแก้"]' AS rqq_options, 0 AS rqq_is_required, 6 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'เว็บตัวอย่างที่ชอบ และชอบตรงไหน' AS rqq_text, NULL AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 7 AS rqq_sort_order
    UNION ALL SELECT 2 AS rqq_group_id, 'มีเนื้อหา/รูปพร้อมแล้วไหม' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["พร้อม","บางส่วน","ยังไม่มี"]' AS rqq_options, 0 AS rqq_is_required, 8 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'ต้องการลงระบบไหน' AS rqq_text, NULL AS rqq_help, 'multi' AS rqq_type, '["iOS","Android"]' AS rqq_options, 1 AS rqq_is_required, 1 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'ผู้ใช้แอปคือใคร ใช้ทำอะไรเป็นหลัก' AS rqq_text, NULL AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 1 AS rqq_is_required, 2 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'ฟีเจอร์ที่ต้องมีในเวอร์ชันแรก' AS rqq_text, 'เรียงจากสำคัญที่สุด' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 3 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'ต้องใช้งานตอนไม่มีอินเทอร์เน็ตไหม' AS rqq_text, NULL AS rqq_help, 'yes_no' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 4 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'ต้องเชื่อมกับระบบอื่นไหม' AS rqq_text, 'เช่น LINE ระบบชำระเงิน ระบบเดิม' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 5 AS rqq_sort_order
    UNION ALL SELECT 3 AS rqq_group_id, 'มีบัญชีนักพัฒนา App Store / Google Play แล้วไหม' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["มีแล้ว","ยังไม่มี","ไม่แน่ใจ"]' AS rqq_options, 0 AS rqq_is_required, 6 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'ออกแบบให้อะไร' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["เว็บไซต์","แอปมือถือ","ระบบงาน","อื่นๆ"]' AS rqq_options, 0 AS rqq_is_required, 1 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'ประมาณกี่หน้าจอ' AS rqq_text, NULL AS rqq_help, 'number' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 2 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'มีโลโก้/สีประจำแบรนด์แล้วไหม' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["มีครบ","มีโลโก้อย่างเดียว","ยังไม่มี"]' AS rqq_options, 0 AS rqq_is_required, 3 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'ไฟล์โลโก้หรือคู่มือแบรนด์' AS rqq_text, 'รูปหรือ PDF ไม่เกิน 10 MB' AS rqq_help, 'file' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 4 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'โทนที่ต้องการ' AS rqq_text, NULL AS rqq_help, 'multi' AS rqq_type, '["เรียบหรู","สดใส","เป็นทางการ","เป็นกันเอง","มินิมอล"]' AS rqq_options, 0 AS rqq_is_required, 5 AS rqq_sort_order
    UNION ALL SELECT 4 AS rqq_group_id, 'ตัวอย่างงานที่ชอบ' AS rqq_text, 'รูปหรือ PDF' AS rqq_help, 'file' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 6 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ตอนนี้ทำงานนี้อย่างไร และติดปัญหาอะไร' AS rqq_text, 'เช่น ใช้กระดาษ Excel โปรแกรมเดิม' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 1 AS rqq_is_required, 1 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ผู้ใช้กี่คน แบ่งกี่บทบาท' AS rqq_text, 'เช่น แอดมิน 2 พนักงาน 15' AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 2 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ต้องย้ายข้อมูลเดิมเข้าระบบใหม่ไหม' AS rqq_text, NULL AS rqq_help, 'yes_no' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 3 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ตัวอย่างไฟล์/เอกสารที่ใช้อยู่' AS rqq_text, 'รูปหรือ PDF' AS rqq_help, 'file' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 4 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'รายงานที่ต้องดู' AS rqq_text, NULL AS rqq_help, 'long_text' AS rqq_type, NULL AS rqq_options, 0 AS rqq_is_required, 5 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ใช้บนอุปกรณ์อะไร' AS rqq_text, NULL AS rqq_help, 'multi' AS rqq_type, '["คอมพิวเตอร์","มือถือ","แท็บเล็ต"]' AS rqq_options, 0 AS rqq_is_required, 6 AS rqq_sort_order
    UNION ALL SELECT 5 AS rqq_group_id, 'ต้องการติดตั้งที่ไหน' AS rqq_text, NULL AS rqq_help, 'single' AS rqq_type, '["คลาวด์","เซิร์ฟเวอร์ของบริษัท","ไม่แน่ใจ"]' AS rqq_options, 0 AS rqq_is_required, 7 AS rqq_sort_order
) AS seed WHERE @seed_requirements = 1;

-- ─── ส่วนที่ 6: ตรวจสอบ — ไม่มีแถวผลลัพธ์ = โครงสร้างครบถ้วนตามไฟล์นี้ ─────────────────────────────
-- มีแถว = ตารางนั้นมีคอลัมน์/index ไม่ตรงกับที่คาด (missing_* คือที่ขาด, extra_* คือที่เกินมาจากของเก่า)
SELECT e.table_name,
       IF(a.table_name IS NULL, 'ไม่มีตารางนี้', NULL) AS problem,
       e.expected_columns, a.actual_columns,
       e.expected_indexes, a.actual_indexes
FROM (
              SELECT 'tb_department' AS table_name, 'dep_abbr,dep_branch_id,dep_code,dep_created_at,dep_id,dep_name,dep_status,dep_updated_at' AS expected_columns, 'fk_dep_branch(dep_branch_id),primary(dep_id),uq_dep_branch_name(dep_branch_id+dep_name),uq_dep_code(dep_code)' AS expected_indexes
    UNION ALL SELECT 'tb_roles' AS table_name, 'role_department,role_granted_at,role_granted_by_id,role_id,role_name,role_permission,role_type,role_update_at' AS expected_columns, 'fk_role_department(role_department),fk_role_granted_by(role_granted_by_id),primary(role_id),uq_role_name(role_name)' AS expected_indexes
    UNION ALL SELECT 'tb_users' AS table_name, 'user_avatar_url,user_branch_id,user_created_at,user_email,user_fname,user_id,user_last_login_at,user_line_uid,user_lname,user_must_change_password,user_password,user_phone,user_role_id,user_status,user_updated_at,user_username,user_whatsapp_no' AS expected_columns, 'fk_user_branch(user_branch_id),idx_user_role(user_role_id),primary(user_id),uq_user_email(user_email),uq_user_username(user_username)' AS expected_indexes
    UNION ALL SELECT 'tb_maxID' AS table_name, 'max_id,max_table' AS expected_columns, 'primary(max_table)' AS expected_indexes
    UNION ALL SELECT 'tb_login_logs' AS table_name, 'log_action,log_created_at,log_email,log_fullname,log_id,log_ip_address,log_user_agent,log_user_id' AS expected_columns, 'idx_log_created(log_created_at),idx_log_user(log_user_id),primary(log_id)' AS expected_indexes
    UNION ALL SELECT 'tb_email_otps' AS table_name, 'otp_attempts,otp_code_hash,otp_created_at,otp_email,otp_expires_at,otp_id,otp_purpose,otp_used_at,otp_user_id' AS expected_columns, 'fk_otp_user(otp_user_id),idx_otp_expires(otp_expires_at),idx_otp_lookup(otp_email+otp_purpose+otp_created_at),primary(otp_id)' AS expected_indexes
    UNION ALL SELECT 'tb_audit_logs' AS table_name, 'aud_action,aud_changes,aud_created_at,aud_duration_ms,aud_entity_id,aud_entity_type,aud_error,aud_event,aud_id,aud_ip,aud_method,aud_path,aud_payload,aud_project_id,aud_request_id,aud_role_name,aud_status,aud_success,aud_user_agent,aud_user_fullname,aud_user_id,aud_user_username' AS expected_columns, 'idx_aud_created(aud_created_at),idx_aud_entity(aud_entity_type+aud_entity_id),idx_aud_event_created(aud_event+aud_created_at),idx_aud_project_created(aud_project_id+aud_created_at),idx_aud_request(aud_request_id),idx_aud_user_created(aud_user_id+aud_created_at),primary(aud_id)' AS expected_indexes
    UNION ALL SELECT 'tb_error_logs' AS table_name, 'err_count,err_fingerprint,err_first_seen,err_id,err_last_ip,err_last_request_id,err_last_seen,err_last_user_id,err_message,err_method,err_path,err_stack,err_status' AS expected_columns, 'idx_err_last_seen(err_last_seen),primary(err_id),uq_err_fingerprint(err_fingerprint)' AS expected_indexes
    UNION ALL SELECT 'tb_project_positions' AS table_name, 'position_created_at,position_id,position_name,position_permission,position_status,position_updated_at' AS expected_columns, 'primary(position_id),uq_position_name(position_name)' AS expected_indexes
    UNION ALL SELECT 'tb_clients' AS table_name, 'client_address,client_branch_code,client_company,client_contact_name,client_country,client_created_at,client_credit_days,client_currency,client_email,client_id,client_language,client_name,client_phone,client_status,client_tax_id,client_type,client_updated_at,client_vat_treatment,client_wht_rate' AS expected_columns, 'fk_client_currency(client_currency),primary(client_id)' AS expected_indexes
    UNION ALL SELECT 'tb_projects' AS table_name, 'client_id,project_channel,project_completed_at,project_created_at,project_created_by,project_description,project_due_date,project_fastwork_order_no,project_fastwork_url,project_id,project_name,project_progress_percent,project_share_enabled,project_share_token,project_start_date,project_status,project_type,project_updated_at,project_use_task_weight' AS expected_columns, 'fk_project_creator(project_created_by),idx_project_client(client_id),idx_project_due_date(project_due_date),idx_project_status(project_status),idx_project_type(project_type),primary(project_id),uq_project_share_token(project_share_token)' AS expected_indexes
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
    UNION ALL SELECT 'tb_company_settings' AS table_name, 'cs_address_en,cs_address_th,cs_allow_self_approval,cs_capital_goal,cs_capital_target_date,cs_default_credit_days,cs_email,cs_fastwork_fee_rate,cs_fastwork_fee_vat_rate,cs_fastwork_wht_rate,cs_id,cs_incorporated_on,cs_invoice_notes_en,cs_invoice_notes_th,cs_logo_url,cs_name_en,cs_name_th,cs_phone,cs_promptpay_id,cs_quotation_terms_en,cs_quotation_terms_th,cs_quotation_valid_days,cs_service_request_assignee_id,cs_tax_id,cs_updated_at,cs_vat_registered_from,cs_website' AS expected_columns, 'primary(cs_id)' AS expected_indexes
    UNION ALL SELECT 'tb_vat_rates' AS table_name, 'vr_created_at,vr_created_by,vr_effective_from,vr_note,vr_rate' AS expected_columns, 'fk_vr_created_by(vr_created_by),primary(vr_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_branches' AS table_name, 'branch_address_en,branch_address_th,branch_code,branch_created_at,branch_id,branch_name_en,branch_name_th,branch_phone,branch_status,branch_updated_at' AS expected_columns, 'primary(branch_id),uq_branch_code(branch_code)' AS expected_indexes
    UNION ALL SELECT 'tb_bank_accounts' AS table_name, 'ba_account_name,ba_account_no,ba_bank_branch,ba_bank_name,ba_created_at,ba_currency,ba_id,ba_is_default,ba_status,ba_swift_code,ba_updated_at' AS expected_columns, 'fk_ba_currency(ba_currency),primary(ba_id)' AS expected_indexes
    UNION ALL SELECT 'tb_document_sequences' AS table_name, 'ds_date,ds_doc_type,ds_last' AS expected_columns, 'primary(ds_doc_type+ds_date)' AS expected_indexes
    UNION ALL SELECT 'tb_exchange_rates' AS table_name, 'er_buying_sight,er_buying_transfer,er_currency,er_fetched_at,er_mid_rate,er_rate_date,er_selling' AS expected_columns, 'primary(er_currency+er_rate_date)' AS expected_indexes
    UNION ALL SELECT 'tb_user_signatures' AS table_name, 'sig_created_at,sig_file_path,sig_id,sig_method,sig_revoked_at,sig_revoked_by,sig_user_id' AS expected_columns, 'fk_sig_revoked_by(sig_revoked_by),idx_sig_user_active(sig_user_id+sig_revoked_at),primary(sig_id)' AS expected_indexes
    UNION ALL SELECT 'tb_product_categories' AS table_name, 'pc_created_at,pc_id,pc_is_single_choice,pc_name,pc_sort_order,pc_status,pc_updated_at' AS expected_columns, 'primary(pc_id),uq_pc_name(pc_name)' AS expected_indexes
    UNION ALL SELECT 'tb_products' AS table_name, 'product_category_id,product_code,product_created_at,product_description,product_id,product_image_url,product_is_public,product_name,product_percent,product_price,product_price_mode,product_status,product_unit,product_updated_at' AS expected_columns, 'fk_product_category(product_category_id),idx_product_name(product_name),primary(product_id),uq_product_code(product_code)' AS expected_indexes
    UNION ALL SELECT 'tb_product_packages' AS table_name, 'pkg_category_id,pkg_created_at,pkg_description,pkg_id,pkg_image_url,pkg_is_public,pkg_name,pkg_status,pkg_updated_at' AS expected_columns, 'fk_pkg_category(pkg_category_id),primary(pkg_id)' AS expected_indexes
    UNION ALL SELECT 'tb_product_package_items' AS table_name, 'pki_description,pki_id,pki_order,pki_package_id,pki_product_id,pki_quantity,pki_type,pki_unit,pki_unit_price' AS expected_columns, 'fk_pki_product(pki_product_id),idx_pki_package(pki_package_id+pki_order),primary(pki_id)' AS expected_indexes
    UNION ALL SELECT 'tb_approval_levels' AS table_name, 'al_doc_type,al_level,al_min_amount_thb,al_require_distinct,al_updated_at' AS expected_columns, 'primary(al_doc_type+al_level)' AS expected_indexes
    UNION ALL SELECT 'tb_approval_level_roles' AS table_name, 'alr_doc_type,alr_level,alr_role_id' AS expected_columns, 'fk_alr_role(alr_role_id),primary(alr_doc_type+alr_level+alr_role_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotations' AS table_name, 'qt_after_discount,qt_after_discount_thb,qt_approval_current_level,qt_approval_plan,qt_approval_round,qt_approved_at,qt_approved_by,qt_approved_by_name,qt_approved_by_title,qt_approver_signature_id,qt_branch_id,qt_cancel_reason,qt_cancelled_at,qt_cancelled_by,qt_client_id,qt_client_snapshot,qt_company_snapshot,qt_copied_from_id,qt_created_at,qt_created_by,qt_created_by_name,qt_created_by_title,qt_creator_signature_id,qt_currency,qt_decline_reason,qt_discount_amount,qt_discount_type,qt_discount_value,qt_exchange_rate,qt_expired_at,qt_id,qt_internal_note,qt_issue_date,qt_language,qt_number,qt_payment_mode,qt_previous_id,qt_project_id,qt_rate_bot,qt_rate_date,qt_rate_override_reason,qt_rate_source,qt_responded_at,qt_returned_reason,qt_revision,qt_root_id,qt_sent_at,qt_status,qt_submitted_at,qt_subtotal,qt_terms,qt_title,qt_total,qt_total_thb,qt_updated_at,qt_valid_days,qt_valid_until,qt_vat_amount,qt_vat_rate,qt_vat_treatment,qt_version' AS expected_columns, 'fk_qt_approved_by(qt_approved_by),fk_qt_approver_signature(qt_approver_signature_id),fk_qt_branch(qt_branch_id),fk_qt_cancelled_by(qt_cancelled_by),fk_qt_client(qt_client_id),fk_qt_copied_from(qt_copied_from_id),fk_qt_creator_signature(qt_creator_signature_id),fk_qt_currency(qt_currency),fk_qt_previous(qt_previous_id),fk_qt_project(qt_project_id),idx_qt_created_by_created(qt_created_by+qt_created_at),idx_qt_issue_date(qt_issue_date),idx_qt_root(qt_root_id),idx_qt_status_valid_until(qt_status+qt_valid_until),primary(qt_id),uq_qt_number_revision(qt_number+qt_revision)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_items' AS table_name, 'qti_amount,qti_description,qti_discount_amount,qti_discount_type,qti_discount_value,qti_id,qti_list_price,qti_order,qti_package_id,qti_product_id,qti_quantity,qti_quotation_id,qti_type,qti_unit,qti_unit_price' AS expected_columns, 'fk_qti_package(qti_package_id),fk_qti_product(qti_product_id),idx_qti_quotation(qti_quotation_id+qti_order),primary(qti_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_milestones' AS table_name, 'qtm_amount,qtm_condition,qtm_id,qtm_name,qtm_order,qtm_percent,qtm_quotation_id' AS expected_columns, 'idx_qtm_quotation(qtm_quotation_id+qtm_order),primary(qtm_id)' AS expected_indexes
    UNION ALL SELECT 'tb_quotation_approvals' AS table_name, 'qta_action,qta_created_at,qta_id,qta_level,qta_quotation_id,qta_reason,qta_role_id,qta_role_name,qta_round,qta_user_id,qta_user_name' AS expected_columns, 'fk_qta_user(qta_user_id),idx_qta_quotation(qta_quotation_id+qta_round+qta_level),primary(qta_id)' AS expected_indexes
    UNION ALL SELECT 'tb_invoices' AS table_name, 'inv_adjust_reason,inv_adjust_reason_code,inv_after_discount,inv_after_discount_thb,inv_approval_current_level,inv_approval_plan,inv_approval_round,inv_bank_account_id,inv_bank_snapshot,inv_branch_id,inv_cancel_reason,inv_cancelled_at,inv_cancelled_by,inv_client_id,inv_client_snapshot,inv_company_snapshot,inv_created_at,inv_created_by,inv_created_by_name,inv_credit_days,inv_credited_amount,inv_credited_base,inv_credited_base_thb,inv_credited_thb,inv_credited_vat,inv_credited_wht,inv_currency,inv_discount_amount,inv_discount_type,inv_discount_value,inv_doc_type,inv_due_date,inv_exchange_rate,inv_id,inv_internal_note,inv_issue_date,inv_issued_at,inv_issued_by,inv_issued_by_name,inv_issued_by_title,inv_issuer_signature_id,inv_language,inv_notes,inv_number,inv_original_total,inv_paid_amount,inv_project_id,inv_quotation_id,inv_rate_bot,inv_rate_date,inv_rate_override_reason,inv_rate_source,inv_reference_invoice_id,inv_refunded_amount,inv_reissued_from_id,inv_returned_reason,inv_sent_at,inv_source,inv_status,inv_sub' AS expected_columns, 'fk_inv_bank_account(inv_bank_account_id),fk_inv_branch(inv_branch_id),fk_inv_cancelled_by(inv_cancelled_by),fk_inv_currency(inv_currency),fk_inv_issued_by(inv_issued_by),fk_inv_issuer_signature(inv_issuer_signature_id),fk_inv_project(inv_project_id),fk_inv_quotation(inv_quotation_id),fk_inv_reference(inv_reference_invoice_id),fk_inv_reissued_from(inv_reissued_from_id),idx_inv_client_status(inv_client_id+inv_status),idx_inv_created_by_created(inv_created_by+inv_created_at),idx_inv_issue_date(inv_issue_date),idx_inv_status_due(inv_status+inv_due_date),primary(inv_id),uq_inv_number(inv_number)' AS expected_indexes
    UNION ALL SELECT 'tb_invoice_items' AS table_name, 'invi_amount,invi_description,invi_discount_amount,invi_discount_type,invi_discount_value,invi_id,invi_invoice_id,invi_list_price,invi_order,invi_product_id,invi_quantity,invi_type,invi_unit,invi_unit_price' AS expected_columns, 'fk_invi_product(invi_product_id),idx_invi_invoice(invi_invoice_id+invi_order),primary(invi_id)' AS expected_indexes
    UNION ALL SELECT 'tb_invoice_milestones' AS table_name, 'ivm_amount,ivm_base,ivm_invoice_id,ivm_milestone_id,ivm_vat' AS expected_columns, 'fk_ivm_milestone(ivm_milestone_id),primary(ivm_invoice_id+ivm_milestone_id)' AS expected_indexes
    UNION ALL SELECT 'tb_invoice_approvals' AS table_name, 'inva_action,inva_created_at,inva_id,inva_invoice_id,inva_level,inva_reason,inva_role_id,inva_role_name,inva_round,inva_user_id,inva_user_name' AS expected_columns, 'fk_inva_user(inva_user_id),idx_inva_invoice(inva_invoice_id+inva_round+inva_level),primary(inva_id)' AS expected_indexes
    UNION ALL SELECT 'tb_billing_notes' AS table_name, 'bn_branch_id,bn_cancel_reason,bn_cancelled_at,bn_cancelled_by,bn_client_id,bn_client_snapshot,bn_company_snapshot,bn_created_at,bn_created_by,bn_created_by_name,bn_currency,bn_id,bn_issue_date,bn_issued_at,bn_language,bn_notes,bn_number,bn_payment_date,bn_status,bn_total,bn_updated_at,bn_version' AS expected_columns, 'fk_bn_branch(bn_branch_id),fk_bn_cancelled_by(bn_cancelled_by),fk_bn_created_by(bn_created_by),fk_bn_currency(bn_currency),idx_bn_client_status(bn_client_id+bn_status),idx_bn_issue_date(bn_issue_date),primary(bn_id),uq_bn_number(bn_number)' AS expected_indexes
    UNION ALL SELECT 'tb_billing_note_invoices' AS table_name, 'bni_amount,bni_billing_note_id,bni_invoice_id,bni_order' AS expected_columns, 'fk_bni_invoice(bni_invoice_id),primary(bni_billing_note_id+bni_invoice_id)' AS expected_indexes
    UNION ALL SELECT 'tb_receipts' AS table_name, 'rc_actual_rate,rc_allocated_thb,rc_allocated_total,rc_bank_account_id,rc_bank_snapshot,rc_billing_note_id,rc_branch_id,rc_cancel_reason,rc_cancelled_at,rc_cancelled_by,rc_cheque_bank,rc_cheque_date,rc_cheque_no,rc_client_id,rc_client_snapshot,rc_company_snapshot,rc_created_at,rc_created_by,rc_created_by_name,rc_currency,rc_fee_amount,rc_fx_diff_thb,rc_id,rc_internal_note,rc_language,rc_method,rc_notes,rc_number,rc_receipt_date,rc_received_amount,rc_received_thb,rc_reference,rc_status,rc_updated_at,rc_version,rc_wht_amount,rc_wht_certificate_date,rc_wht_certificate_no,rc_wht_file_name,rc_wht_file_path,rc_wht_file_uploaded_at' AS expected_columns, 'fk_rc_bank_account(rc_bank_account_id),fk_rc_billing_note(rc_billing_note_id),fk_rc_branch(rc_branch_id),fk_rc_cancelled_by(rc_cancelled_by),fk_rc_created_by(rc_created_by),fk_rc_currency(rc_currency),idx_rc_client_status(rc_client_id+rc_status),idx_rc_receipt_date(rc_receipt_date),primary(rc_id),uq_rc_number(rc_number)' AS expected_indexes
    UNION ALL SELECT 'tb_receipt_allocations' AS table_name, 'rca_amount,rca_amount_thb,rca_credited_before,rca_invoice_id,rca_order,rca_receipt_id,rca_vat_amount' AS expected_columns, 'fk_rca_invoice(rca_invoice_id),primary(rca_receipt_id+rca_invoice_id)' AS expected_indexes
    UNION ALL SELECT 'tb_wht_income_types' AS table_name, 'wit_code,wit_created_at,wit_form_label,wit_form_row,wit_name_en,wit_name_th,wit_sort_order,wit_status,wit_updated_at' AS expected_columns, 'primary(wit_code)' AS expected_indexes
    UNION ALL SELECT 'tb_wht_rates' AS table_name, 'wr_created_at,wr_created_by,wr_effective_from,wr_income_type,wr_min_payment,wr_note,wr_rate' AS expected_columns, 'fk_wr_created_by(wr_created_by),primary(wr_income_type+wr_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_expense_categories' AS table_name, 'ec_account_code,ec_created_at,ec_default_income_type,ec_id,ec_is_asset,ec_name_en,ec_name_th,ec_sort_order,ec_status,ec_updated_at' AS expected_columns, 'fk_ec_income_type(ec_default_income_type),primary(ec_id),uq_ec_name_th(ec_name_th)' AS expected_indexes
    UNION ALL SELECT 'tb_vendors' AS table_name, 'vd_address,vd_bank_account_name,vd_bank_account_no,vd_bank_name,vd_branch_code,vd_code,vd_contact_name,vd_country,vd_created_at,vd_created_by,vd_credit_days,vd_currency,vd_default_category_id,vd_default_income_type,vd_email,vd_id,vd_name,vd_notes,vd_phone,vd_promptpay_id,vd_status,vd_tax_id,vd_type,vd_updated_at' AS expected_columns, 'fk_vd_category(vd_default_category_id),fk_vd_created_by(vd_created_by),fk_vd_currency(vd_currency),fk_vd_income_type(vd_default_income_type),idx_vd_name(vd_name),idx_vd_tax_id(vd_tax_id),primary(vd_id),uq_vd_code(vd_code)' AS expected_indexes
    UNION ALL SELECT 'tb_expenses' AS table_name, 'ex_approval_current_level,ex_approval_plan,ex_approval_round,ex_approved_at,ex_auto_approved,ex_branch_id,ex_cancel_reason,ex_cancelled_at,ex_cancelled_by,ex_created_at,ex_created_by,ex_created_by_name,ex_credit_days,ex_currency,ex_doc_type,ex_due_date,ex_employee_id,ex_exchange_rate,ex_expense_date,ex_id,ex_kind,ex_merchant_name,ex_notes,ex_number,ex_paid_amount,ex_rate_date,ex_rate_override_reason,ex_rate_source,ex_returned_reason,ex_status,ex_submitted_at,ex_subtotal,ex_subtotal_thb,ex_title,ex_total,ex_total_thb,ex_updated_at,ex_vat_amount,ex_vat_claimable,ex_vat_rate,ex_vendor_doc_date,ex_vendor_doc_no,ex_vendor_id,ex_version,ex_wht_amount,ex_wht_income_type,ex_wht_rate' AS expected_columns, 'fk_ex_branch(ex_branch_id),fk_ex_cancelled_by(ex_cancelled_by),fk_ex_created_by(ex_created_by),fk_ex_currency(ex_currency),fk_ex_income_type(ex_wht_income_type),idx_ex_employee(ex_employee_id+ex_status),idx_ex_expense_date(ex_expense_date),idx_ex_status_due(ex_status+ex_due_date),idx_ex_vendor_doc(ex_vendor_id+ex_vendor_doc_no),primary(ex_id),uq_ex_number(ex_number)' AS expected_indexes
    UNION ALL SELECT 'tb_expense_lines' AS table_name, 'exl_amount,exl_category_id,exl_description,exl_expense_id,exl_id,exl_order,exl_project_id,exl_quantity,exl_unit_price' AS expected_columns, 'fk_exl_category(exl_category_id),idx_exl_expense(exl_expense_id+exl_order),idx_exl_project(exl_project_id),primary(exl_id)' AS expected_indexes
    UNION ALL SELECT 'tb_expense_attachments' AS table_name, 'exf_expense_id,exf_file_name,exf_file_path,exf_file_size,exf_id,exf_uploaded_at,exf_uploaded_by' AS expected_columns, 'fk_exf_uploaded_by(exf_uploaded_by),idx_exf_expense(exf_expense_id),primary(exf_id)' AS expected_indexes
    UNION ALL SELECT 'tb_expense_approvals' AS table_name, 'expa_action,expa_created_at,expa_expense_id,expa_id,expa_level,expa_reason,expa_role_id,expa_role_name,expa_round,expa_user_id,expa_user_name' AS expected_columns, 'fk_expa_user(expa_user_id),idx_expa_expense(expa_expense_id+expa_round+expa_level),primary(expa_id)' AS expected_indexes
    UNION ALL SELECT 'tb_payments' AS table_name, 'pv_actual_rate,pv_allocated_thb,pv_allocated_total,pv_bank_account_id,pv_bank_snapshot,pv_branch_id,pv_cancel_reason,pv_cancelled_at,pv_cancelled_by,pv_cheque_date,pv_cheque_no,pv_company_snapshot,pv_created_at,pv_created_by,pv_created_by_name,pv_currency,pv_employee_id,pv_fee_amount,pv_fx_diff_thb,pv_id,pv_method,pv_net_paid,pv_notes,pv_number,pv_paid_thb,pv_payee_kind,pv_payee_snapshot,pv_payment_date,pv_reference,pv_status,pv_updated_at,pv_vendor_id,pv_version,pv_wht_amount' AS expected_columns, 'fk_pv_bank_account(pv_bank_account_id),fk_pv_branch(pv_branch_id),fk_pv_cancelled_by(pv_cancelled_by),fk_pv_created_by(pv_created_by),fk_pv_currency(pv_currency),idx_pv_employee(pv_employee_id+pv_status),idx_pv_payment_date(pv_payment_date),idx_pv_vendor(pv_vendor_id+pv_status),primary(pv_id),uq_pv_number(pv_number)' AS expected_indexes
    UNION ALL SELECT 'tb_payment_allocations' AS table_name, 'pva_amount,pva_amount_thb,pva_base_amount,pva_expense_id,pva_order,pva_payment_id,pva_wht_income_type' AS expected_columns, 'fk_pva_expense(pva_expense_id),primary(pva_payment_id+pva_expense_id)' AS expected_indexes
    UNION ALL SELECT 'tb_wht_certificates' AS table_name, 'wt_book_no,wt_cancelled_at,wt_created_at,wt_form,wt_id,wt_number,wt_payee_snapshot,wt_payer_snapshot,wt_payment_date,wt_payment_id,wt_sequence,wt_status,wt_total_paid,wt_total_tax' AS expected_columns, 'idx_wt_form_date(wt_form+wt_payment_date),primary(wt_id),uq_wt_number(wt_number),uq_wt_payment(wt_payment_id)' AS expected_indexes
    UNION ALL SELECT 'tb_wht_certificate_lines' AS table_name, 'wtl_certificate_id,wtl_form_label,wtl_form_row,wtl_id,wtl_income_type,wtl_paid_amount,wtl_rate,wtl_tax_amount' AS expected_columns, 'fk_wtl_income_type(wtl_income_type),idx_wtl_certificate(wtl_certificate_id),primary(wtl_id)' AS expected_indexes
    UNION ALL SELECT 'tb_employees' AS table_name, 'emp_address,emp_attendance_required,emp_bank_account_name,emp_bank_account_no,emp_bank_name,emp_birth_date,emp_branch_id,emp_close_login_on_termination,emp_code,emp_created_at,emp_created_by,emp_department_id,emp_email,emp_first_name_en,emp_first_name_th,emp_hire_date,emp_id,emp_last_name_en,emp_last_name_th,emp_national_id,emp_nickname,emp_notes,emp_phone,emp_photo_url,emp_position,emp_sso_enrolled,emp_sso_number,emp_termination_date,emp_termination_reason,emp_title,emp_updated_at,emp_user_id,emp_wfh_weekdays' AS expected_columns, 'fk_emp_branch(emp_branch_id),fk_emp_created_by(emp_created_by),fk_emp_department(emp_department_id),fk_emp_user(emp_user_id),idx_emp_name(emp_first_name_th+emp_last_name_th),idx_emp_national_id(emp_national_id),idx_emp_termination(emp_termination_date),primary(emp_id),uq_emp_code(emp_code)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_compensations' AS table_name, 'ecm_base_salary,ecm_created_at,ecm_created_by,ecm_effective_from,ecm_employee_id,ecm_note' AS expected_columns, 'fk_ecm_created_by(ecm_created_by),primary(ecm_employee_id+ecm_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_recurring_items' AS table_name, 'eri_amount,eri_created_at,eri_created_by,eri_effective_from,eri_effective_to,eri_employee_id,eri_id,eri_is_sso_wage,eri_is_taxable,eri_kind,eri_label,eri_note' AS expected_columns, 'fk_eri_created_by(eri_created_by),idx_eri_employee(eri_employee_id+eri_effective_from),primary(eri_id)' AS expected_indexes
    UNION ALL SELECT 'tb_sso_rates' AS table_name, 'sr_created_at,sr_created_by,sr_effective_from,sr_employee_rate,sr_employer_rate,sr_note,sr_wage_ceiling,sr_wage_floor' AS expected_columns, 'fk_sr_created_by(sr_created_by),primary(sr_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_income_tax_years' AS table_name, 'ity_created_at,ity_created_by,ity_expense_cap,ity_expense_rate,ity_note,ity_personal_allowance,ity_tax_year,ity_updated_at' AS expected_columns, 'fk_ity_created_by(ity_created_by),primary(ity_tax_year)' AS expected_indexes
    UNION ALL SELECT 'tb_income_tax_brackets' AS table_name, 'itb_from_amount,itb_rate,itb_tax_year' AS expected_columns, 'primary(itb_tax_year+itb_from_amount)' AS expected_indexes
    UNION ALL SELECT 'tb_payroll_settings' AS table_name, 'ps_attendance_start_date,ps_card_valid_years,ps_default_schedule_id,ps_hours_per_day,ps_id,ps_ot_is_sso_wage,ps_ot_rate_holiday_ot,ps_ot_rate_holiday_work,ps_ot_rate_workday,ps_ot_weekly_cap_hours,ps_pay_day,ps_timesheet_backdate_days,ps_timesheet_enabled,ps_unpaid_leave_divisor,ps_updated_at,ps_updated_by,ps_working_weekdays' AS expected_columns, 'fk_ps_updated_by(ps_updated_by),primary(ps_id)' AS expected_indexes
    UNION ALL SELECT 'tb_fastwork_milestones' AS table_name, 'fwm_amount,fwm_created_at,fwm_created_by,fwm_delivered_at,fwm_delivered_by,fwm_due_date,fwm_id,fwm_name,fwm_order,fwm_project_id,fwm_updated_at' AS expected_columns, 'fk_fwm_created_by(fwm_created_by),fk_fwm_delivered_by(fwm_delivered_by),idx_fwm_project_order(fwm_project_id+fwm_order),primary(fwm_id)' AS expected_indexes
    UNION ALL SELECT 'tb_fastwork_payouts' AS table_name, 'fwp_approved_date,fwp_bank_account_id,fwp_cancel_reason,fwp_cancelled_at,fwp_cancelled_by,fwp_created_at,fwp_created_by,fwp_fee,fwp_fee_rate,fwp_fee_vat,fwp_gross,fwp_id,fwp_milestone_id,fwp_net,fwp_note,fwp_project_id,fwp_received_by,fwp_received_date,fwp_reference,fwp_status,fwp_updated_at,fwp_version,fwp_wht,fwp_wht_certificate_no' AS expected_columns, 'fk_fwp_bank_account(fwp_bank_account_id),fk_fwp_cancelled_by(fwp_cancelled_by),fk_fwp_created_by(fwp_created_by),fk_fwp_milestone(fwp_milestone_id),fk_fwp_received_by(fwp_received_by),idx_fwp_project(fwp_project_id),idx_fwp_status_received(fwp_status+fwp_received_date),primary(fwp_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_shares' AS table_name, 'shr_amount,shr_created_at,shr_created_by,shr_id,shr_kind,shr_note,shr_order,shr_percent,shr_project_id,shr_user_id,shr_vendor_id' AS expected_columns, 'fk_shr_created_by(shr_created_by),fk_shr_user(shr_user_id),fk_shr_vendor(shr_vendor_id),idx_shr_project(shr_project_id),primary(shr_id)' AS expected_indexes
    UNION ALL SELECT 'tb_share_advances' AS table_name, 'sha_amount,sha_bank_account_id,sha_cancel_reason,sha_cancelled_at,sha_cancelled_by,sha_created_at,sha_created_by,sha_id,sha_note,sha_paid_date,sha_project_id,sha_recipient_name,sha_reference,sha_status,sha_user_id,sha_vendor_id' AS expected_columns, 'fk_sha_bank_account(sha_bank_account_id),fk_sha_cancelled_by(sha_cancelled_by),fk_sha_created_by(sha_created_by),fk_sha_user(sha_user_id),fk_sha_vendor(sha_vendor_id),idx_sha_project(sha_project_id),primary(sha_id)' AS expected_indexes
    UNION ALL SELECT 'tb_share_settlements' AS table_name, 'sst_after_fixed,sst_cancel_reason,sst_cancelled_at,sst_cancelled_by,sst_company_amount,sst_created_at,sst_created_by,sst_distributable,sst_expense_cost,sst_fixed_total,sst_id,sst_note,sst_platform_fee,sst_project_id,sst_revenue,sst_settled_date,sst_status,sst_version' AS expected_columns, 'fk_sst_cancelled_by(sst_cancelled_by),fk_sst_created_by(sst_created_by),idx_sst_project(sst_project_id),primary(sst_id)' AS expected_indexes
    UNION ALL SELECT 'tb_share_settlement_lines' AS table_name, 'ssl_advanced,ssl_amount,ssl_bank_account_id,ssl_due,ssl_id,ssl_kind,ssl_paid_at,ssl_paid_by,ssl_paid_date,ssl_percent,ssl_recipient_name,ssl_reference,ssl_settlement_id,ssl_status,ssl_transfer_amount,ssl_user_id,ssl_vendor_id,ssl_version,ssl_wht' AS expected_columns, 'fk_ssl_bank_account(ssl_bank_account_id),fk_ssl_paid_by(ssl_paid_by),fk_ssl_user(ssl_user_id),fk_ssl_vendor(ssl_vendor_id),idx_ssl_settlement(ssl_settlement_id),primary(ssl_id)' AS expected_indexes
    UNION ALL SELECT 'tb_capital_entries' AS table_name, 'cpe_amount,cpe_cancel_reason,cpe_cancelled_at,cpe_cancelled_by,cpe_created_at,cpe_created_by,cpe_entry_date,cpe_id,cpe_kind,cpe_note,cpe_status' AS expected_columns, 'fk_cpe_cancelled_by(cpe_cancelled_by),fk_cpe_created_by(cpe_created_by),idx_cpe_status_date(cpe_status+cpe_entry_date),primary(cpe_id)' AS expected_indexes
    UNION ALL SELECT 'tb_order_links' AS table_name, 'ol_allow_more,ol_assignee_id,ol_buyer_name,ol_client_id,ol_created_at,ol_created_by,ol_expires_on,ol_id,ol_kind,ol_name,ol_project_id,ol_short_code,ol_status,ol_token,ol_updated_at' AS expected_columns, 'fk_ol_assignee(ol_assignee_id),fk_ol_client(ol_client_id),fk_ol_created_by(ol_created_by),fk_ol_project(ol_project_id),primary(ol_id),uq_ol_short_code(ol_short_code),uq_ol_token(ol_token)' AS expected_indexes
    UNION ALL SELECT 'tb_order_link_categories' AS table_name, 'olc_category_id,olc_link_id' AS expected_columns, 'fk_olc_category(olc_category_id),primary(olc_link_id+olc_category_id)' AS expected_indexes
    UNION ALL SELECT 'tb_service_requests' AS table_name, 'svr_accepted_at,svr_accepted_name,svr_access_token,svr_address,svr_assignee_id,svr_client_id,svr_company_name,svr_consent_at,svr_contact_email,svr_contact_line,svr_contact_name,svr_contact_phone,svr_id,svr_link_id,svr_note,svr_project_id,svr_quotation_id,svr_status,svr_status_reason,svr_submit_key,svr_submitted_at,svr_tax_id,svr_updated_at,svr_vat_rate,svr_version' AS expected_columns, 'fk_svr_assignee(svr_assignee_id),fk_svr_client(svr_client_id),fk_svr_project(svr_project_id),fk_svr_quotation(svr_quotation_id),idx_svr_status(svr_status+svr_submitted_at),primary(svr_id),uq_svr_access_token(svr_access_token),uq_svr_submit_key(svr_link_id+svr_submit_key)' AS expected_indexes
    UNION ALL SELECT 'tb_service_request_items' AS table_name, 'svi_added_by_staff,svi_adjusted_quantity,svi_adjusted_unit_price,svi_id,svi_is_preset,svi_is_removed,svi_name,svi_order,svi_package_id,svi_percent,svi_product_id,svi_quantity,svi_request_id,svi_type,svi_unit,svi_unit_price' AS expected_columns, 'fk_svi_package(svi_package_id),fk_svi_product(svi_product_id),idx_svi_request(svi_request_id+svi_order),primary(svi_id)' AS expected_indexes
    UNION ALL SELECT 'tb_requirement_groups' AS table_name, 'rqg_created_at,rqg_description,rqg_id,rqg_is_general,rqg_name,rqg_sort_order,rqg_status,rqg_updated_at' AS expected_columns, 'primary(rqg_id)' AS expected_indexes
    UNION ALL SELECT 'tb_requirement_group_categories' AS table_name, 'rgc_category_id,rgc_group_id' AS expected_columns, 'fk_rgc_category(rgc_category_id),primary(rgc_group_id+rgc_category_id)' AS expected_indexes
    UNION ALL SELECT 'tb_order_link_items' AS table_name, 'oli_id,oli_link_id,oli_order,oli_package_id,oli_product_id,oli_quantity' AS expected_columns, 'fk_oli_package(oli_package_id),fk_oli_product(oli_product_id),idx_oli_link(oli_link_id+oli_order),primary(oli_id)' AS expected_indexes
    UNION ALL SELECT 'tb_package_addon_rules' AS table_name, 'par_package_id,par_product_id,par_rule' AS expected_columns, 'fk_par_product(par_product_id),primary(par_package_id+par_product_id)' AS expected_indexes
    UNION ALL SELECT 'tb_requirement_group_packages' AS table_name, 'rgp_group_id,rgp_package_id' AS expected_columns, 'fk_rgp_package(rgp_package_id),primary(rgp_group_id+rgp_package_id)' AS expected_indexes
    UNION ALL SELECT 'tb_requirement_questions' AS table_name, 'rqq_created_at,rqq_group_id,rqq_help,rqq_id,rqq_is_required,rqq_options,rqq_sort_order,rqq_status,rqq_text,rqq_type,rqq_updated_at' AS expected_columns, 'idx_rqq_group(rqq_group_id+rqq_sort_order),primary(rqq_id)' AS expected_indexes
    UNION ALL SELECT 'tb_service_request_answers' AS table_name, 'sva_group_name,sva_id,sva_order,sva_question_id,sva_question_text,sva_request_id,sva_type,sva_value' AS expected_columns, 'fk_sva_question(sva_question_id),idx_sva_request(sva_request_id+sva_order),primary(sva_id)' AS expected_indexes
    UNION ALL SELECT 'tb_service_request_files' AS table_name, 'svf_answer_id,svf_created_at,svf_file_path,svf_id,svf_original_name,svf_size' AS expected_columns, 'idx_svf_answer(svf_answer_id),primary(svf_id)' AS expected_indexes
    UNION ALL SELECT 'tb_company_holidays' AS table_name, 'hd_created_at,hd_created_by,hd_date,hd_name' AS expected_columns, 'fk_hd_created_by(hd_created_by),primary(hd_date)' AS expected_indexes
    UNION ALL SELECT 'tb_leave_types' AS table_name, 'lt_attachment_from_days,lt_carry_over_days,lt_created_at,lt_days_per_year,lt_id,lt_is_paid,lt_min_service_days,lt_name_en,lt_name_th,lt_sort_order,lt_status,lt_updated_at' AS expected_columns, 'primary(lt_id),uq_lt_name_th(lt_name_th)' AS expected_indexes
    UNION ALL SELECT 'tb_timesheet_weeks' AS table_name, 'tsw_approved_at,tsw_created_at,tsw_employee_id,tsw_id,tsw_return_reason,tsw_returned_at,tsw_returned_by,tsw_status,tsw_submitted_at,tsw_total_hours,tsw_updated_at,tsw_version,tsw_week_start' AS expected_columns, 'fk_tsw_returned_by(tsw_returned_by),idx_tsw_status(tsw_status+tsw_week_start),primary(tsw_id),uq_tsw_employee_week(tsw_employee_id+tsw_week_start)' AS expected_indexes
    UNION ALL SELECT 'tb_timesheet_entries' AS table_name, 'tse_approved_at,tse_approved_by,tse_date,tse_employee_id,tse_hours,tse_id,tse_note,tse_project_id,tse_task_id,tse_week_id' AS expected_columns, 'fk_tse_approved_by(tse_approved_by),fk_tse_task(tse_task_id),fk_tse_week(tse_week_id),idx_tse_employee_date(tse_employee_id+tse_date),idx_tse_project_date(tse_project_id+tse_date),primary(tse_id)' AS expected_indexes
    UNION ALL SELECT 'tb_project_labels' AS table_name, 'pl_color,pl_created_at,pl_created_by,pl_id,pl_name,pl_project_id,pl_sort_order,pl_updated_at' AS expected_columns, 'fk_pl_created_by(pl_created_by),primary(pl_id),uq_pl_project_name(pl_project_id+pl_name)' AS expected_indexes
    UNION ALL SELECT 'tb_task_labels' AS table_name, 'tl_label_id,tl_task_id' AS expected_columns, 'fk_tl_label(tl_label_id),primary(tl_task_id+tl_label_id)' AS expected_indexes
    UNION ALL SELECT 'tb_task_checklist_items' AS table_name, 'tci_created_at,tci_created_by,tci_done_at,tci_done_by,tci_id,tci_is_done,tci_sort_order,tci_task_id,tci_text' AS expected_columns, 'fk_tci_created_by(tci_created_by),fk_tci_done_by(tci_done_by),idx_tci_task(tci_task_id+tci_sort_order),primary(tci_id)' AS expected_indexes
    UNION ALL SELECT 'tb_work_schedules' AS table_name, 'ws_break_minutes,ws_checkin_open_minutes,ws_created_at,ws_created_by,ws_end_time,ws_id,ws_late_grace_minutes,ws_name,ws_start_time,ws_status,ws_updated_at,ws_working_weekdays' AS expected_columns, 'fk_ws_created_by(ws_created_by),primary(ws_id),uq_ws_name(ws_name)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_schedules' AS table_name, 'es_created_at,es_created_by,es_effective_from,es_employee_id,es_id,es_schedule_id' AS expected_columns, 'fk_es_created_by(es_created_by),fk_es_schedule(es_schedule_id),primary(es_id),uq_es_employee_date(es_employee_id+es_effective_from)' AS expected_indexes
    UNION ALL SELECT 'tb_attendance_locations' AS table_name, 'al_branch_id,al_created_at,al_created_by,al_id,al_latitude,al_longitude,al_name,al_radius_m,al_status,al_updated_at' AS expected_columns, 'fk_al_branch(al_branch_id),fk_al_created_by(al_created_by),primary(al_id)' AS expected_indexes
    UNION ALL SELECT 'tb_attendance_punches' AS table_name, 'ap_accuracy_m,ap_at,ap_created_at,ap_created_by,ap_distance_m,ap_employee_id,ap_id,ap_ip,ap_is_offsite,ap_is_wfh,ap_latitude,ap_location_id,ap_location_name,ap_longitude,ap_note,ap_source,ap_type,ap_user_agent,ap_void_reason,ap_voided_at,ap_voided_by,ap_work_date' AS expected_columns, 'fk_ap_created_by(ap_created_by),fk_ap_location(ap_location_id),fk_ap_voided_by(ap_voided_by),idx_ap_employee_date(ap_employee_id+ap_work_date),idx_ap_work_date(ap_work_date),primary(ap_id)' AS expected_indexes
    UNION ALL SELECT 'tb_attendance_corrections' AS table_name, 'ac_created_at,ac_created_by,ac_decided_at,ac_decided_by,ac_decision_note,ac_employee_id,ac_id,ac_punch_id,ac_reason,ac_requested_at,ac_status,ac_type,ac_work_date' AS expected_columns, 'fk_ac_created_by(ac_created_by),fk_ac_decided_by(ac_decided_by),fk_ac_punch(ac_punch_id),idx_ac_employee_date(ac_employee_id+ac_work_date),idx_ac_status(ac_status),primary(ac_id)' AS expected_indexes
    UNION ALL SELECT 'tb_overtime_requests' AS table_name, 'ot_created_at,ot_created_by,ot_decided_at,ot_decided_by,ot_decision_note,ot_employee_id,ot_end_at,ot_holiday_ot_minutes,ot_holiday_work_minutes,ot_id,ot_reason,ot_start_at,ot_status,ot_work_date,ot_workday_minutes' AS expected_columns, 'fk_ot_created_by(ot_created_by),fk_ot_decided_by(ot_decided_by),idx_ot_employee_date(ot_employee_id+ot_work_date),idx_ot_status(ot_status),primary(ot_id)' AS expected_indexes
    UNION ALL SELECT 'tb_wfh_requests' AS table_name, 'wfh_created_at,wfh_created_by,wfh_date,wfh_decided_at,wfh_decided_by,wfh_decision_note,wfh_employee_id,wfh_id,wfh_reason,wfh_status' AS expected_columns, 'fk_wfh_created_by(wfh_created_by),fk_wfh_decided_by(wfh_decided_by),idx_wfh_employee_date(wfh_employee_id+wfh_date),idx_wfh_status(wfh_status),primary(wfh_id)' AS expected_indexes
    UNION ALL SELECT 'tb_leave_requests' AS table_name, 'lr_cancel_reason,lr_cancelled_at,lr_cancelled_by,lr_created_at,lr_created_by,lr_days,lr_decided_at,lr_decided_by,lr_decision_note,lr_employee_id,lr_end_date,lr_half_day,lr_id,lr_leave_type_id,lr_reason,lr_start_date,lr_status,lr_submitted_at,lr_updated_at,lr_version' AS expected_columns, 'fk_lr_cancelled_by(lr_cancelled_by),fk_lr_created_by(lr_created_by),fk_lr_decided_by(lr_decided_by),fk_lr_leave_type(lr_leave_type_id),idx_lr_employee_dates(lr_employee_id+lr_start_date),idx_lr_status_dates(lr_status+lr_start_date),primary(lr_id)' AS expected_indexes
    UNION ALL SELECT 'tb_leave_attachments' AS table_name, 'lra_file_name,lra_file_path,lra_file_size,lra_id,lra_request_id,lra_uploaded_at,lra_uploaded_by' AS expected_columns, 'fk_lra_uploaded_by(lra_uploaded_by),idx_lra_request(lra_request_id),primary(lra_id)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_tax_profiles' AS table_name, 'etp_child_allowance,etp_employee_id,etp_fund_allowance,etp_home_loan_interest,etp_insurance_allowance,etp_note,etp_other_allowance,etp_parent_allowance,etp_prior_from_other_employer,etp_prior_income,etp_prior_sso,etp_prior_tax,etp_spouse_allowance,etp_tax_year,etp_updated_at,etp_updated_by' AS expected_columns, 'fk_etp_updated_by(etp_updated_by),primary(etp_employee_id+etp_tax_year)' AS expected_indexes
    UNION ALL SELECT 'tb_payroll_runs' AS table_name, 'pr_approval_current_level,pr_approval_plan,pr_approval_round,pr_approved_at,pr_calculated_at,pr_cancel_reason,pr_cancelled_at,pr_cancelled_by,pr_created_at,pr_created_by,pr_employee_count,pr_id,pr_number,pr_paid_by,pr_paid_date,pr_paid_note,pr_pay_date,pr_period,pr_returned_reason,pr_standard_hours,pr_status,pr_submitted_at,pr_total_deductions,pr_total_gross,pr_total_net,pr_total_sso_employee,pr_total_sso_employer,pr_total_tax,pr_updated_at,pr_version,pr_working_days' AS expected_columns, 'fk_pr_cancelled_by(pr_cancelled_by),fk_pr_created_by(pr_created_by),fk_pr_paid_by(pr_paid_by),idx_pr_period_status(pr_period+pr_status),primary(pr_id)' AS expected_indexes
    UNION ALL SELECT 'tb_payroll_approvals' AS table_name, 'pra_action,pra_created_at,pra_id,pra_level,pra_reason,pra_role_id,pra_role_name,pra_round,pra_run_id,pra_user_id,pra_user_name' AS expected_columns, 'fk_pra_user(pra_user_id),idx_pra_run_round(pra_run_id+pra_round),primary(pra_id)' AS expected_indexes
    UNION ALL SELECT 'tb_payroll_items' AS table_name, 'pri_absent_days,pri_annual_income_estimate,pri_annual_tax_estimate,pri_attendance_deduction,pri_bank_account_no,pri_bank_name,pri_base_salary,pri_days_in_month,pri_department_name,pri_early_leave_minutes,pri_emp_code,pri_employed_days,pri_employee_id,pri_full_name,pri_gross,pri_id,pri_labor_cost,pri_late_minutes,pri_national_id,pri_net,pri_other_deductions,pri_other_earnings,pri_position,pri_run_id,pri_salary_amount,pri_sso_employee,pri_sso_employer,pri_sso_enrolled,pri_sso_wage,pri_standard_hours,pri_tax,pri_taxable_income,pri_unpaid_leave_amount,pri_unpaid_leave_days,pri_ytd_income_before,pri_ytd_sso_before,pri_ytd_tax_before' AS expected_columns, 'idx_pri_employee(pri_employee_id),primary(pri_id),uq_pri_run_employee(pri_run_id+pri_employee_id)' AS expected_indexes
    UNION ALL SELECT 'tb_payroll_item_lines' AS table_name, 'pil_amount,pil_created_at,pil_created_by,pil_id,pil_is_one_off,pil_is_sso_wage,pil_is_taxable,pil_item_id,pil_kind,pil_label,pil_source' AS expected_columns, 'fk_pil_created_by(pil_created_by),idx_pil_item(pil_item_id),primary(pil_id)' AS expected_indexes
    UNION ALL SELECT 'tb_labor_cost_allocations' AS table_name, 'lca_amount,lca_employee_id,lca_hours,lca_id,lca_period,lca_project_id,lca_run_id' AS expected_columns, 'fk_lca_employee(lca_employee_id),idx_lca_project_period(lca_project_id+lca_period),idx_lca_run(lca_run_id),primary(lca_id)' AS expected_indexes
    UNION ALL SELECT 'tb_credit_notes' AS table_name, 'cn_approval_current_level,cn_approval_plan,cn_approval_round,cn_base_thb,cn_branch_id,cn_cancel_reason,cn_cancelled_at,cn_cancelled_by,cn_client_id,cn_client_snapshot,cn_company_snapshot,cn_created_at,cn_created_by,cn_created_by_name,cn_currency,cn_id,cn_internal_note,cn_invoice_id,cn_issue_date,cn_issued_at,cn_issued_by,cn_issued_by_name,cn_issued_by_title,cn_issuer_signature_id,cn_language,cn_notes,cn_number,cn_original_total,cn_outstanding_before,cn_project_id,cn_reason,cn_reason_code,cn_refund_amount,cn_refund_bank_account_id,cn_refund_date,cn_refund_note,cn_refund_reference,cn_refund_required,cn_refund_wht,cn_refunded_at,cn_refunded_by,cn_returned_reason,cn_status,cn_submitted_at,cn_subtotal,cn_total,cn_total_thb,cn_updated_at,cn_vat_amount,cn_vat_rate,cn_version,cn_wht_amount' AS expected_columns, 'fk_cn_branch(cn_branch_id),fk_cn_cancelled_by(cn_cancelled_by),fk_cn_client(cn_client_id),fk_cn_created_by(cn_created_by),fk_cn_currency(cn_currency),fk_cn_issued_by(cn_issued_by),fk_cn_issuer_signature(cn_issuer_signature_id),fk_cn_project(cn_project_id),fk_cn_refund_bank_account(cn_refund_bank_account_id),fk_cn_refunded_by(cn_refunded_by),idx_cn_invoice_status(cn_invoice_id+cn_status),idx_cn_status_issue_date(cn_status+cn_issue_date),primary(cn_id),uq_cn_number(cn_number)' AS expected_indexes
    UNION ALL SELECT 'tb_credit_note_lines' AS table_name, 'cnl_amount,cnl_credit_note_id,cnl_description,cnl_id,cnl_order' AS expected_columns, 'idx_cnl_credit_note(cnl_credit_note_id+cnl_order),primary(cnl_id)' AS expected_indexes
    UNION ALL SELECT 'tb_credit_note_approvals' AS table_name, 'cna_action,cna_created_at,cna_credit_note_id,cna_id,cna_level,cna_reason,cna_role_id,cna_role_name,cna_round,cna_user_id,cna_user_name' AS expected_columns, 'fk_cna_user(cna_user_id),idx_cna_credit_note(cna_credit_note_id+cna_round+cna_level),primary(cna_id)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_codes' AS table_name, 'ecd_branch_id,ecd_code,ecd_created_at,ecd_created_by,ecd_department_id,ecd_employee_id,ecd_id,ecd_note,ecd_reason,ecd_valid_from,ecd_valid_to' AS expected_columns, 'fk_ecd_branch(ecd_branch_id),fk_ecd_created_by(ecd_created_by),fk_ecd_department(ecd_department_id),idx_ecd_employee(ecd_employee_id+ecd_valid_to),primary(ecd_id),uq_ecd_code(ecd_code)' AS expected_indexes
    UNION ALL SELECT 'tb_employee_cards' AS table_name, 'ec_branch_name,ec_department_name,ec_emp_code,ec_employee_id,ec_expires_on,ec_id,ec_issued_at,ec_issued_by,ec_name_en,ec_name_th,ec_note,ec_photo_url,ec_position,ec_printed_at,ec_reason,ec_returned_at,ec_seq,ec_void_reason,ec_voided_at' AS expected_columns, 'fk_ec_issued_by(ec_issued_by),idx_ec_expires(ec_expires_on),idx_ec_printed(ec_printed_at),idx_ec_voided(ec_voided_at+ec_returned_at),primary(ec_id),uq_ec_employee_seq(ec_employee_id+ec_seq)' AS expected_indexes
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
