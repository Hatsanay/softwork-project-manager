-- ════ เฟส 4 บุคคล / ลงเวลา / ลา / เงินเดือน (2026-10-17) · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md ════
-- รันหลัง create_users_roles.sql, create_project_manager.sql, create_sales.sql, create_purchasing.sql (อ้าง tb_users, tb_department, tb_branches)
-- ฐานข้อมูลที่ใช้งานอยู่: รัน deploy_schema.sql แทน (มีตารางกลุ่มนี้แบบรันซ้ำได้)
-- ขั้น 4-1: ทะเบียนพนักงาน + ค่าจ้างตามวันที่มีผล + รายการประจำ · อัตราประกันสังคม · ปีภาษี/ขั้นภาษี · ตั้งค่าเงินเดือน · วันหยุดบริษัท · ประเภทลา
-- ขั้น 4-2: ลงเวลารายสัปดาห์ (สัปดาห์ + แถวชั่วโมงต่อวัน/โปรเจกต์) · ขั้น 4-3: คำขอลา + ไฟล์แนบ · ขั้น 4-4: รอบเงินเดือน — อยู่ท้ายไฟล์ ก่อนข้อมูลเริ่มต้น
--
-- ข้อมูลกลุ่มนี้อ่อนไหว (เงินเดือน เลขประจำตัวประชาชน เลขบัญชี) — ทุก endpoint ตรวจสิทธิ์ manageEmployees
-- audit log ปิดบังค่าเงินเดือน (บันทึกว่า "เปลี่ยน" แต่ไม่เก็บตัวเลข) — แบบระบบ R-H1/R-H8

-- พนักงาน ≠ ผู้ใช้ระบบ (H7) — ผูกบัญชีผู้ใช้ได้ไม่บังคับ · ฟรีแลนซ์ไม่ใช่พนักงาน (จ่ายผ่านค่าใช้จ่าย + 50 ทวิ ภ.ง.ด.3)
-- สถานะไม่เก็บเป็นคอลัมน์: พ้นสภาพ = มีวันทำงานวันสุดท้ายและเลยวันนั้นแล้ว (ตั้งล่วงหน้าได้ ยังทำงานอยู่จนถึงวันนั้น)
-- รับกลับเข้าทำงานหลังออกไปแล้ว = สร้างพนักงานใหม่ (รหัสใหม่) — ช่วงเวลาทำงานแต่ละช่วงต้องแยกกันเพื่อคิดเงินเดือน/อายุงาน
-- เลขประจำตัวประชาชน/บัญชีผู้ใช้ ห้ามซ้ำกับพนักงานที่ยังไม่พ้นสภาพ (ตรวจใน backend — คนเดิมกลับมาทำงานใหม่ใช้เลขเดิมได้)
CREATE TABLE `tb_employees` (
  `emp_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_code` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'รหัสพนักงาน ระบบออกให้: รหัสแผนก 8 + วันเริ่มงาน yymmdd + ลำดับ 4 (2026-10-18) — ย้ายแผนก/สาขา = รหัสใหม่ (ประวัติใน tb_employee_codes)',
  `emp_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีผู้ใช้ที่ผูก — ใช้ลงเวลา/ขอลา/ดูสลิปของตัวเอง',
  `emp_title` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'คำนำหน้า นาย/นาง/นางสาว — ใช้บน 50 ทวิ/ภ.ง.ด.1',
  `emp_first_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_last_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_first_name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_last_name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_nickname` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_national_id` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขประจำตัวประชาชน = เลขผู้เสียภาษี (ภ.ง.ด.1/50 ทวิ) — ต้องมีก่อนเข้ารอบเงินเดือน',
  `emp_birth_date` date DEFAULT NULL,
  `emp_address` text COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่สำหรับ 50 ทวิ ประจำปี',
  `emp_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_department_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'บังคับ (ประกอบรหัสพนักงาน) — สาขาของพนักงาน = สาขาของแผนก',
  `emp_position` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตำแหน่งงาน (ข้อความ) — คนละเรื่องกับตำแหน่งในโปรเจกต์',
  `emp_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_hire_date` date NOT NULL COMMENT 'วันเริ่มงาน = วันที่มีผลของค่าจ้างแถวแรก',
  `emp_termination_date` date DEFAULT NULL COMMENT 'วันทำงานวันสุดท้าย — หลังวันนี้ถือว่าพ้นสภาพ',
  `emp_termination_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_account_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_bank_account_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `emp_sso_enrolled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = ไม่เข้าประกันสังคม (เช่น อายุเกิน 60 ปีตอนเริ่มงาน) — ไม่หักทั้งสองฝ่าย',
  `emp_sso_number` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = ใช้เลขประจำตัวประชาชน',
  `emp_notes` text COLLATE utf8mb4_unicode_ci,
  `emp_photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปพนักงานสำหรับบัตร (/uploads/employees/...) — ว่าง = ใช้รูปโปรไฟล์บัญชีผู้ใช้ที่ผูก',
  `emp_close_login_on_termination` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ปิดการเข้าระบบของบัญชีที่ผูกหลังวันทำงานวันสุดท้าย (1 = ปิด · 2026-10-18)',
  `emp_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_emp_user` FOREIGN KEY (`emp_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_department` FOREIGN KEY (`emp_department_id`) REFERENCES `tb_department` (`dep_id`),
  CONSTRAINT `fk_emp_branch` FOREIGN KEY (`emp_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_emp_created_by` FOREIGN KEY (`emp_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- เงินเดือนฐานตามวันที่มีผล — ขึ้นเงินเดือน = เพิ่มแถวใหม่ (ประวัติไม่หาย) · ค่าจ้าง ณ วันใด = แถวล่าสุดที่วันที่มีผล <= วันนั้น
-- แถวแรกมีผลวันเริ่มงานเสมอ (ลบไม่ได้) · ขั้น 4-4 จะล็อกแถวที่อยู่ในรอบเงินเดือนที่อนุมัติแล้ว
-- ประวัติรหัสพนักงาน (2026-10-18) — ทุกรหัสที่เคยออกให้ใคร ช่วงวันที่ใช้ และเหตุผล · รหัสใช้ซ้ำไม่ได้ตลอดไป
-- ค้นหาพนักงานด้วยรหัสเก่าได้ · ecd_valid_to ว่าง = รหัสที่ใช้อยู่ (คนละ 1 แถว)
CREATE TABLE `tb_employee_codes` (
  `ecd_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ecd_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_code` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_department_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'แผนกตอนใช้รหัสนี้ (รหัสเดิมก่อนระบบใหม่อาจไม่มี)',
  `ecd_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_valid_from` date NOT NULL,
  `ecd_valid_to` date DEFAULT NULL COMMENT 'วันสุดท้ายที่ใช้รหัสนี้ · ว่าง = ใช้อยู่',
  `ecd_reason` enum('hire','correction','transfer','migration') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecd_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecd_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ecd_id`),
  UNIQUE KEY `uq_ecd_code` (`ecd_code`),
  KEY `idx_ecd_employee` (`ecd_employee_id`,`ecd_valid_to`),
  KEY `fk_ecd_department` (`ecd_department_id`),
  KEY `fk_ecd_branch` (`ecd_branch_id`),
  KEY `fk_ecd_created_by` (`ecd_created_by`),
  CONSTRAINT `fk_ecd_employee` FOREIGN KEY (`ecd_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ecd_department` FOREIGN KEY (`ecd_department_id`) REFERENCES `tb_department` (`dep_id`),
  CONSTRAINT `fk_ecd_branch` FOREIGN KEY (`ecd_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_ecd_created_by` FOREIGN KEY (`ecd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บัตรพนักงาน (2026-10-18) — ใช้ได้ทีละใบต่อคน (ec_voided_at ว่าง) · ข้อมูลบนบัตร snapshot ตอนออก พิมพ์ซ้ำได้หน้าตาเดิม
-- ออกใหม่เมื่อ: เข้างาน · รหัสเปลี่ยน · หาย · ชำรุด · ข้อมูลบนบัตรเปลี่ยน · หมดอายุ (อายุบัตรตั้งที่ tb_payroll_settings) — ใบเดิมยกเลิกใน transaction เดียวกัน
CREATE TABLE `tb_employee_cards` (
  `ec_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ec_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_seq` smallint unsigned NOT NULL COMMENT 'บัตรใบที่ N ของพนักงานคนนี้',
  `ec_emp_code` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_th` varchar(250) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_en` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_position` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_department_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_branch_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_photo_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_reason` enum('first_issue','code_change','lost','damaged','info_change','expired') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_issued_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_issued_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ec_expires_on` date NOT NULL COMMENT 'ใช้ได้ถึงวันนี้ = วันออก + อายุบัตรตามตั้งค่า ณ ตอนออก (snapshot)',
  `ec_printed_at` datetime DEFAULT NULL COMMENT 'พิมพ์ครั้งแรกเมื่อไร · ว่าง = รอพิมพ์',
  `ec_voided_at` datetime DEFAULT NULL COMMENT 'ยกเลิกเมื่อไร · ว่าง = ใบที่ใช้อยู่',
  `ec_void_reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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

CREATE TABLE `tb_employee_compensations` (
  `ecm_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ecm_effective_from` date NOT NULL,
  `ecm_base_salary` decimal(15,2) NOT NULL COMMENT 'เงินเดือนต่อเดือน (บาท)',
  `ecm_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผล เช่น ปรับประจำปี / ผ่านทดลองงาน',
  `ecm_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ecm_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`ecm_employee_id`,`ecm_effective_from`),
  KEY `fk_ecm_created_by` (`ecm_created_by`),
  CONSTRAINT `fk_ecm_employee` FOREIGN KEY (`ecm_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ecm_created_by` FOREIGN KEY (`ecm_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายรับ/รายหักประจำทุกเดือน (ค่าตำแหน่ง ค่าเดินทาง ผ่อนเงินกู้ ฯลฯ) ช่วงวันที่มีผล — รอบเงินเดือนดึงไปเป็นรายการของเดือนนั้น (ขั้น 4-4)
-- เปลี่ยนยอด = หยุดรายการเดิม (ตั้งวันสิ้นสุด) แล้วเพิ่มรายการใหม่ — ประวัติไม่หาย
-- คิดภาษี / นับเป็นค่าจ้างของประกันสังคม ใช้กับรายรับเท่านั้น (รายหักเป็น 0 เสมอ)
CREATE TABLE `tb_employee_recurring_items` (
  `eri_id` int unsigned NOT NULL AUTO_INCREMENT,
  `eri_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `eri_kind` enum('earning','deduction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `eri_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อที่พิมพ์บนสลิป',
  `eri_amount` decimal(15,2) NOT NULL COMMENT 'ต่อเดือน (บาท)',
  `eri_is_taxable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'รายรับนี้นับเป็นเงินได้คิดภาษี',
  `eri_is_sso_wage` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับนี้นับเป็นค่าจ้างของประกันสังคม (คำถามนักบัญชี Y1)',
  `eri_effective_from` date NOT NULL,
  `eri_effective_to` date DEFAULT NULL COMMENT 'วันสุดท้ายที่มีผล — ว่าง = ไม่มีกำหนด',
  `eri_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eri_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eri_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`eri_id`),
  KEY `idx_eri_employee` (`eri_employee_id`,`eri_effective_from`),
  KEY `fk_eri_created_by` (`eri_created_by`),
  CONSTRAINT `fk_eri_employee` FOREIGN KEY (`eri_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_eri_created_by` FOREIGN KEY (`eri_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตราประกันสังคมตามวันที่มีผล — ฐานค่าจ้างจำกัดระหว่างขั้นต่ำ–เพดาน × อัตรา (แผนแม่บทหลักการข้อ 4)
-- ต่างจากอัตรา VAT/หัก ณ ที่จ่าย: แก้/ลบได้จนกว่าจะมีรอบเงินเดือนที่อนุมัติใช้อัตรานั้น (ขั้น 4-4) — ค่าเริ่มต้นต้องให้นักบัญชียืนยันก่อน (Y1)
CREATE TABLE `tb_sso_rates` (
  `sr_effective_from` date NOT NULL,
  `sr_employee_rate` decimal(5,2) NOT NULL COMMENT 'ลูกจ้าง % ของฐานค่าจ้าง',
  `sr_employer_rate` decimal(5,2) NOT NULL COMMENT 'นายจ้าง % ของฐานค่าจ้าง',
  `sr_wage_floor` decimal(15,2) NOT NULL COMMENT 'ฐานค่าจ้างขั้นต่ำต่อเดือน',
  `sr_wage_ceiling` decimal(15,2) NOT NULL COMMENT 'ฐานค่าจ้างสูงสุดต่อเดือน',
  `sr_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ที่มา เช่น กฎกระทรวง',
  `sr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sr_effective_from`),
  KEY `fk_sr_created_by` (`sr_created_by`),
  CONSTRAINT `fk_sr_created_by` FOREIGN KEY (`sr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ปีภาษีเงินได้บุคคลธรรมดา — ค่าใช้จ่าย/ลดหย่อนส่วนตัวตามกฎหมายของปีนั้น · ปีที่ไม่มีแถว = ใช้ปีล่าสุดก่อนหน้า
-- ขั้นภาษีแยกตาราง tb_income_tax_brackets (ทั้งชุดต่อปี)
CREATE TABLE `tb_income_tax_years` (
  `ity_tax_year` smallint unsigned NOT NULL COMMENT 'ปี ค.ศ.',
  `ity_expense_rate` decimal(5,2) NOT NULL COMMENT 'หักค่าใช้จ่ายเงินได้ 40(1)(2) % ของเงินได้',
  `ity_expense_cap` decimal(15,2) NOT NULL COMMENT 'หักค่าใช้จ่ายได้สูงสุดต่อปี',
  `ity_personal_allowance` decimal(15,2) NOT NULL COMMENT 'ลดหย่อนส่วนตัว',
  `ity_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ity_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ity_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `ity_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ity_tax_year`),
  KEY `fk_ity_created_by` (`ity_created_by`),
  CONSTRAINT `fk_ity_created_by` FOREIGN KEY (`ity_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ขั้นภาษี: เงินได้สุทธิส่วนที่เกิน itb_from_amount (จนถึงขั้นถัดไป) เสียภาษีอัตรา itb_rate · ขั้นแรกต้องเริ่มที่ 0
CREATE TABLE `tb_income_tax_brackets` (
  `itb_tax_year` smallint unsigned NOT NULL,
  `itb_from_amount` decimal(15,2) NOT NULL COMMENT 'เงินได้สุทธิตั้งแต่ (ส่วนที่เกินยอดนี้)',
  `itb_rate` decimal(5,2) NOT NULL,
  PRIMARY KEY (`itb_tax_year`,`itb_from_amount`),
  CONSTRAINT `fk_itb_tax_year` FOREIGN KEY (`itb_tax_year`) REFERENCES `tb_income_tax_years` (`ity_tax_year`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ตั้งค่าเงินเดือน/เวลาทำงานของบริษัท — แถวเดียว ps_id = 1
-- วันทำงาน: 7 ตัว จันทร์→อาทิตย์ 1 = ทำงาน · ชั่วโมงมาตรฐานของเดือน = วันทำงาน (ไม่รวมวันหยุดบริษัท) × ชั่วโมงต่อวัน (H10)
CREATE TABLE `tb_payroll_settings` (
  `ps_id` tinyint unsigned NOT NULL,
  `ps_working_weekdays` char(7) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1111100' COMMENT 'จันทร์→อาทิตย์ 1 = วันทำงาน',
  `ps_hours_per_day` decimal(4,2) NOT NULL DEFAULT '8.00',
  `ps_pay_day` tinyint unsigned NOT NULL DEFAULT '25' COMMENT 'วันจ่ายเงินเดือน 1–31 — เดือนที่สั้นกว่าใช้วันสุดท้าย',
  `ps_unpaid_leave_divisor` enum('days_30','working_days') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'days_30' COMMENT 'หักลาไม่รับค่าจ้างต่อวัน = เงินเดือน ÷ 30 หรือ ÷ วันทำงานของเดือน (Y3)',
  `ps_timesheet_backdate_days` smallint unsigned NOT NULL DEFAULT '14' COMMENT 'ลงเวลาย้อนหลังได้กี่วัน (ขั้น 4-2)',
  `ps_card_valid_years` tinyint unsigned NOT NULL DEFAULT '3' COMMENT 'บัตรพนักงานใช้ได้กี่ปีนับจากวันออก (2026-10-18) — เปลี่ยนแล้วมีผลกับบัตรที่ออกหลังจากนั้น',
  `ps_updated_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ps_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ps_id`),
  KEY `fk_ps_updated_by` (`ps_updated_by`),
  CONSTRAINT `fk_ps_updated_by` FOREIGN KEY (`ps_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- วันหยุดบริษัท (นักขัตฤกษ์/วันหยุดพิเศษ) — ไม่นับเป็นวันทำงานมาตรฐาน และไม่นับเป็นวันลา
CREATE TABLE `tb_company_holidays` (
  `hd_date` date NOT NULL,
  `hd_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `hd_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hd_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`hd_date`),
  KEY `fk_hd_created_by` (`hd_created_by`),
  CONSTRAINT `fk_hd_created_by` FOREIGN KEY (`hd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประเภทลา + โควตาต่อปี (ใช้ขั้น 4-3) — ปิดใช้งานแทนการลบ (ใบลาเก่ายังอ้างอยู่)
-- ต้องแนบไฟล์เมื่อลาตั้งแต่ N วันขึ้นไป (เช่น ลาป่วย 3 วัน) · ต้องทำงานครบกี่วันจึงใช้ได้ (เช่น พักร้อนหลังทำงานครบ 1 ปี)
CREATE TABLE `tb_leave_types` (
  `lt_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lt_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lt_name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lt_days_per_year` decimal(5,1) DEFAULT NULL COMMENT 'โควตาวันต่อปี — ว่าง = ไม่จำกัด',
  `lt_is_paid` tinyint(1) NOT NULL DEFAULT '1' COMMENT '0 = หักเงินเดือนตามจำนวนวันลา',
  `lt_attachment_from_days` decimal(5,1) DEFAULT NULL COMMENT 'ลาตั้งแต่กี่วันต้องแนบไฟล์ — ว่าง = ไม่ต้องแนบ',
  `lt_min_service_days` smallint unsigned NOT NULL DEFAULT '0' COMMENT 'ต้องทำงานครบกี่วันจึงใช้ประเภทนี้ได้',
  `lt_carry_over_days` decimal(5,1) NOT NULL DEFAULT '0.0' COMMENT 'ยกวันที่เหลือไปปีถัดไปได้สูงสุด',
  `lt_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `lt_sort_order` int NOT NULL DEFAULT '0',
  `lt_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `lt_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lt_id`),
  UNIQUE KEY `uq_lt_name_th` (`lt_name_th`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ขั้น 4-2 (2026-10-17): ลงเวลาทำงานรายสัปดาห์ (จันทร์–อาทิตย์) ──
-- flow: draft → (พนักงานส่ง) submitted → ผู้อนุมัติแต่ละโปรเจกต์อนุมัติแถวของตัวเอง → อนุมัติครบทุกแถว = approved
--       ตีกลับแถวไหนก็ตาม = ทั้งสัปดาห์กลับเป็น returned + ล้างการอนุมัติทุกแถว (แก้แล้วส่งใหม่ทั้งสัปดาห์)
-- ผู้อนุมัติ: สิทธิ์ approveTimesheet (ทุกแถว) หรือสมาชิกโปรเจกต์ที่มีสิทธิ์ "จัดการสมาชิก" (เฉพาะแถวของโปรเจกต์นั้น) · อนุมัติของตัวเองไม่ได้
-- ขั้น 4-4 จะล็อกสัปดาห์ที่อยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว (ไม่ใช้สถานะแยก — ตรวจจากรอบเงินเดือน)
CREATE TABLE `tb_timesheet_weeks` (
  `tsw_id` int unsigned NOT NULL AUTO_INCREMENT,
  `tsw_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tsw_week_start` date NOT NULL COMMENT 'วันจันทร์ของสัปดาห์',
  `tsw_status` enum('draft','submitted','approved','returned') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `tsw_version` int unsigned NOT NULL DEFAULT '0',
  `tsw_total_hours` decimal(6,2) NOT NULL DEFAULT '0.00',
  `tsw_submitted_at` datetime DEFAULT NULL,
  `tsw_approved_at` datetime DEFAULT NULL COMMENT 'เวลาที่อนุมัติครบทุกแถว',
  `tsw_return_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tsw_returned_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
CREATE TABLE `tb_timesheet_entries` (
  `tse_id` int unsigned NOT NULL AUTO_INCREMENT,
  `tse_week_id` int unsigned NOT NULL,
  `tse_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ซ้ำกับสัปดาห์ — ใช้ค้นตามพนักงาน/วันโดยไม่ต้อง JOIN',
  `tse_date` date NOT NULL,
  `tse_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_task_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_hours` decimal(5,2) NOT NULL COMMENT 'ทีละ 0.25 ชั่วโมง',
  `tse_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_approved_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tse_approved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`tse_id`),
  KEY `idx_tse_project_date` (`tse_project_id`,`tse_date`),
  KEY `idx_tse_employee_date` (`tse_employee_id`,`tse_date`),
  KEY `fk_tse_week` (`tse_week_id`),
  KEY `fk_tse_task` (`tse_task_id`),
  KEY `fk_tse_approved_by` (`tse_approved_by`),
  CONSTRAINT `fk_tse_week` FOREIGN KEY (`tse_week_id`) REFERENCES `tb_timesheet_weeks` (`tsw_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tse_employee` FOREIGN KEY (`tse_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_tse_project` FOREIGN KEY (`tse_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_tse_task` FOREIGN KEY (`tse_task_id`) REFERENCES `tb_tasks` (`task_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_tse_approved_by` FOREIGN KEY (`tse_approved_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ขั้น 4-3 (2026-10-17): คำขอลา ──
-- flow: draft (แนบไฟล์ได้) → pending (ส่งแล้ว) → approved / rejected · ดึงกลับ pending → draft ได้ · ยกเลิก = cancelled (เก็บประวัติ)
-- จำนวนวันคิดใน backend เฉพาะวันทำงาน (ps_working_weekdays ไม่รวมวันหยุดบริษัท) · ครึ่งวันได้เฉพาะลาวันเดียว (= 0.5)
-- ห้ามคร่อมปี (โควตาเป็นรายปีปฏิทิน — แยกเป็น 2 ใบ) · ทับซ้อนกับลาที่ส่งแล้ว/อนุมัติแล้วไม่ได้ (เช้า+บ่ายวันเดียวกันได้)
-- ขั้น 4-4 จะล็อกลาที่อยู่ในเดือนที่รอบเงินเดือนอนุมัติแล้ว
CREATE TABLE `tb_leave_requests` (
  `lr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lr_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lr_leave_type_id` int unsigned NOT NULL,
  `lr_start_date` date NOT NULL,
  `lr_end_date` date NOT NULL,
  `lr_half_day` enum('none','morning','afternoon') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none',
  `lr_days` decimal(5,1) NOT NULL COMMENT 'วันทำงานที่ลา (คิดใน backend)',
  `lr_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เห็นเฉพาะเจ้าของ/ผู้อนุมัติ/ฝ่ายบุคคล',
  `lr_status` enum('draft','pending','approved','rejected','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `lr_version` int unsigned NOT NULL DEFAULT '1',
  `lr_submitted_at` datetime DEFAULT NULL,
  `lr_decided_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_decided_at` datetime DEFAULT NULL,
  `lr_decision_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลที่ไม่อนุมัติ',
  `lr_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_cancelled_at` datetime DEFAULT NULL,
  `lr_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `lr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lr_id`),
  KEY `idx_lr_employee_dates` (`lr_employee_id`,`lr_start_date`),
  KEY `idx_lr_status_dates` (`lr_status`,`lr_start_date`),
  KEY `fk_lr_leave_type` (`lr_leave_type_id`),
  KEY `fk_lr_decided_by` (`lr_decided_by`),
  KEY `fk_lr_cancelled_by` (`lr_cancelled_by`),
  KEY `fk_lr_created_by` (`lr_created_by`),
  CONSTRAINT `fk_lr_employee` FOREIGN KEY (`lr_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_lr_leave_type` FOREIGN KEY (`lr_leave_type_id`) REFERENCES `tb_leave_types` (`lt_id`),
  CONSTRAINT `fk_lr_decided_by` FOREIGN KEY (`lr_decided_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_cancelled_by` FOREIGN KEY (`lr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_lr_created_by` FOREIGN KEY (`lr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์แนบคำขอลา (ใบรับรองแพทย์ ฯลฯ) — เก็บใน storage ส่วนตัว (private-file.js) เปิดผ่าน API ที่ตรวจสิทธิ์เท่านั้น (R-H8)
CREATE TABLE `tb_leave_attachments` (
  `lra_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `lra_request_id` int unsigned NOT NULL,
  `lra_file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lra_file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lra_file_size` int unsigned NOT NULL DEFAULT '0',
  `lra_uploaded_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lra_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`lra_id`),
  KEY `idx_lra_request` (`lra_request_id`),
  KEY `fk_lra_uploaded_by` (`lra_uploaded_by`),
  CONSTRAINT `fk_lra_request` FOREIGN KEY (`lra_request_id`) REFERENCES `tb_leave_requests` (`lr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lra_uploaded_by` FOREIGN KEY (`lra_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ขั้น 4-4 (2026-10-17): รอบเงินเดือน ──
-- ค่าลดหย่อนรายปีของพนักงาน (ล.ย.01) + ยอดยกมาของปี (เงินได้/ภาษี/ประกันสังคมก่อนใช้ระบบ หรือจากที่ทำงานเดิม)
-- ยอดลดหย่อนกรอกเป็นบาทตามที่กฎหมายให้ (ฝ่ายบุคคลคิดเอง) · แก้กลางปีได้ — รอบถัดไปคิดภาษีทั้งปีใหม่
CREATE TABLE `tb_employee_tax_profiles` (
  `etp_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
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
  `etp_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `etp_updated_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `etp_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`etp_employee_id`,`etp_tax_year`),
  KEY `fk_etp_updated_by` (`etp_updated_by`),
  CONSTRAINT `fk_etp_employee` FOREIGN KEY (`etp_employee_id`) REFERENCES `tb_employees` (`emp_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_etp_updated_by` FOREIGN KEY (`etp_updated_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รอบเงินเดือนรายเดือน — เดือนละหนึ่งรอบที่ไม่ยกเลิก (ตรวจใน service + ล็อกแถว tb_payroll_settings ก่อนตรวจ R-H2)
-- draft (คิดใหม่/แก้รายการได้) → pending_approval (ตัวเลขล็อก · กติกาอนุมัติประเภท PR) → approved (ล็อกถาวร + snapshot ค่าแรง + ล็อกลงเวลา/ลาของเดือน)
-- → paid (สลิปเปิดให้พนักงาน) · ยกเลิกได้ก่อนจ่าย
CREATE TABLE `tb_payroll_runs` (
  `pr_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pr_period` char(7) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'YYYY-MM',
  `pr_number` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PR-YYYY-MM',
  `pr_pay_date` date NOT NULL,
  `pr_status` enum('draft','pending_approval','approved','paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
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
  `pr_approval_plan` text COLLATE utf8mb4_unicode_ci COMMENT 'snapshot แผนอนุมัติตอนส่ง (JSON)',
  `pr_submitted_at` datetime DEFAULT NULL,
  `pr_approved_at` datetime DEFAULT NULL,
  `pr_returned_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_paid_date` date DEFAULT NULL,
  `pr_paid_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เช่น บัญชีที่โอน',
  `pr_paid_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_cancelled_at` datetime DEFAULT NULL,
  `pr_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `pr_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`pr_id`),
  KEY `idx_pr_period_status` (`pr_period`,`pr_status`),
  KEY `fk_pr_paid_by` (`pr_paid_by`),
  KEY `fk_pr_cancelled_by` (`pr_cancelled_by`),
  KEY `fk_pr_created_by` (`pr_created_by`),
  CONSTRAINT `fk_pr_paid_by` FOREIGN KEY (`pr_paid_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_cancelled_by` FOREIGN KEY (`pr_cancelled_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pr_created_by` FOREIGN KEY (`pr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติอนุมัติ/ตีกลับ — รูปแบบเดียวกับ tb_expense_approvals
CREATE TABLE `tb_payroll_approvals` (
  `pra_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `pra_run_id` int unsigned NOT NULL,
  `pra_round` int unsigned NOT NULL,
  `pra_level` tinyint unsigned NOT NULL,
  `pra_action` enum('approve','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pra_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_user_name` varchar(201) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_role_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pra_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pra_id`),
  KEY `idx_pra_run_round` (`pra_run_id`,`pra_round`),
  KEY `fk_pra_user` (`pra_user_id`),
  CONSTRAINT `fk_pra_run` FOREIGN KEY (`pra_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pra_user` FOREIGN KEY (`pra_user_id`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายคนในรอบ — snapshot ข้อมูลพนักงาน + ตัวเลขทุกตัวที่ใช้คิด (สลิป/แบบภาษีอ่านจากตรงนี้ ไม่คิดใหม่)
CREATE TABLE `tb_payroll_items` (
  `pri_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pri_run_id` int unsigned NOT NULL,
  `pri_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_emp_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_full_name` varchar(250) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pri_national_id` varchar(13) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_position` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_department_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_bank_account_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pri_sso_enrolled` tinyint(1) NOT NULL DEFAULT '1',
  `pri_employed_days` smallint unsigned NOT NULL COMMENT 'วันปฏิทินที่เป็นพนักงานในเดือน',
  `pri_days_in_month` smallint unsigned NOT NULL,
  `pri_base_salary` decimal(15,2) NOT NULL COMMENT 'เงินเดือนต่อเดือน ณ วันสุดท้ายที่ทำงานในเดือน',
  `pri_salary_amount` decimal(15,2) NOT NULL COMMENT 'เงินเดือนตามสัดส่วนวัน',
  `pri_unpaid_leave_days` decimal(5,1) NOT NULL DEFAULT '0.0',
  `pri_unpaid_leave_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
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
  CONSTRAINT `fk_pri_run` FOREIGN KEY (`pri_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pri_employee` FOREIGN KEY (`pri_employee_id`) REFERENCES `tb_employees` (`emp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการเพิ่ม/หักของแต่ละคน: recurring = ดึงจากรายการประจำตอนคิด (คิดใหม่แล้วสร้างใหม่) · manual = กรอกเอง (คิดใหม่แล้วยังอยู่)
CREATE TABLE `tb_payroll_item_lines` (
  `pil_id` int unsigned NOT NULL AUTO_INCREMENT,
  `pil_item_id` int unsigned NOT NULL,
  `pil_source` enum('recurring','manual') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_kind` enum('earning','deduction') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_label` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pil_amount` decimal(15,2) NOT NULL,
  `pil_is_taxable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'รายรับ: นับเป็นเงินได้คิดภาษี',
  `pil_is_sso_wage` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับ: นับเป็นค่าจ้างประกันสังคม',
  `pil_is_one_off` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'รายรับครั้งเดียว (โบนัส) — ไม่ประมาณการซ้ำทั้งปีตอนคิดภาษี',
  `pil_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pil_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pil_id`),
  KEY `idx_pil_item` (`pil_item_id`),
  KEY `fk_pil_created_by` (`pil_created_by`),
  CONSTRAINT `fk_pil_item` FOREIGN KEY (`pil_item_id`) REFERENCES `tb_payroll_items` (`pri_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pil_created_by` FOREIGN KEY (`pil_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ค่าแรงจริงต่อโปรเจกต์ — snapshot ตอนอนุมัติรอบ (โปรเจกต์ว่าง = ส่วนกลาง: งานภายใน + ชั่วโมงที่ไม่ได้ลง) · หน้าโปรเจกต์อ่านจากที่นี่
CREATE TABLE `tb_labor_cost_allocations` (
  `lca_id` int unsigned NOT NULL AUTO_INCREMENT,
  `lca_run_id` int unsigned NOT NULL,
  `lca_period` char(7) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lca_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lca_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lca_hours` decimal(8,2) NOT NULL DEFAULT '0.00',
  `lca_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`lca_id`),
  KEY `idx_lca_project_period` (`lca_project_id`,`lca_period`),
  KEY `idx_lca_run` (`lca_run_id`),
  KEY `fk_lca_employee` (`lca_employee_id`),
  CONSTRAINT `fk_lca_run` FOREIGN KEY (`lca_run_id`) REFERENCES `tb_payroll_runs` (`pr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_lca_employee` FOREIGN KEY (`lca_employee_id`) REFERENCES `tb_employees` (`emp_id`),
  CONSTRAINT `fk_lca_project` FOREIGN KEY (`lca_project_id`) REFERENCES `tb_projects` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── ข้อมูลเริ่มต้น (ตัวเลขทุกตัวต้องให้นักบัญชียืนยันก่อนจ่ายเงินเดือนจริง — คำถาม Y1/Y2) ──
-- ประกันสังคม: ฝ่ายละ 5% · ฐานขั้นต่ำ 1,650 · เพดาน 17,500 ตั้งแต่ 1 ม.ค. 2569 (กฎกระทรวงปรับเพดานค่าจ้าง — เดิม 15,000)
INSERT INTO `tb_sso_rates` (`sr_effective_from`, `sr_employee_rate`, `sr_employer_rate`, `sr_wage_floor`, `sr_wage_ceiling`, `sr_note`)
VALUES ('2026-01-01', 5.00, 5.00, 1650.00, 17500.00, 'ค่าเริ่มต้นของระบบ — ยืนยันกับนักบัญชีก่อนใช้ (Y1)');

-- ภาษีเงินได้ปี 2026: หักค่าใช้จ่าย 50% ไม่เกิน 100,000 · ลดหย่อนส่วนตัว 60,000 · ขั้นบันได 0–35%
INSERT INTO `tb_income_tax_years` (`ity_tax_year`, `ity_expense_rate`, `ity_expense_cap`, `ity_personal_allowance`, `ity_note`)
VALUES (2026, 50.00, 100000.00, 60000.00, 'ค่าเริ่มต้นของระบบ — ยืนยันกับนักบัญชีก่อนใช้ (Y2)');
INSERT INTO `tb_income_tax_brackets` (`itb_tax_year`, `itb_from_amount`, `itb_rate`) VALUES
  (2026, 0.00, 0.00),
  (2026, 150000.00, 5.00),
  (2026, 300000.00, 10.00),
  (2026, 500000.00, 15.00),
  (2026, 750000.00, 20.00),
  (2026, 1000000.00, 25.00),
  (2026, 2000000.00, 30.00),
  (2026, 5000000.00, 35.00);

INSERT INTO `tb_payroll_settings` (`ps_id`) VALUES (1);

-- ประเภทลาตามพระราชบัญญัติคุ้มครองแรงงาน (ขั้นต่ำ) — บริษัทปรับเพิ่ม/ลดได้ในหน้าตั้งค่าบุคคล
INSERT INTO `tb_leave_types` (`lt_name_th`, `lt_name_en`, `lt_days_per_year`, `lt_is_paid`, `lt_attachment_from_days`, `lt_min_service_days`, `lt_sort_order`) VALUES
  ('ลาป่วย', 'Sick leave', 30.0, 1, 3.0, 0, 1),
  ('ลากิจ', 'Personal leave', 3.0, 1, NULL, 0, 2),
  ('ลาพักร้อน', 'Annual leave', 6.0, 1, NULL, 365, 3),
  ('ลาไม่รับค่าจ้าง', 'Unpaid leave', NULL, 0, NULL, 0, 4);
