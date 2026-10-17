-- ════ เฟส 4 บุคคล / ลงเวลา / ลา / เงินเดือน (2026-10-17) · แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md ════
-- รันหลัง create_users_roles.sql, create_project_manager.sql, create_sales.sql, create_purchasing.sql (อ้าง tb_users, tb_department, tb_branches)
-- ฐานข้อมูลที่ใช้งานอยู่: รัน deploy_schema.sql แทน (มีตารางกลุ่มนี้แบบรันซ้ำได้)
-- ขั้น 4-1: ทะเบียนพนักงาน + ค่าจ้างตามวันที่มีผล + รายการประจำ · อัตราประกันสังคม · ปีภาษี/ขั้นภาษี · ตั้งค่าเงินเดือน · วันหยุดบริษัท · ประเภทลา
-- ขั้น 4-2: ลงเวลารายสัปดาห์ (สัปดาห์ + แถวชั่วโมงต่อวัน/โปรเจกต์) — อยู่ท้ายไฟล์ ก่อนข้อมูลเริ่มต้น
--
-- ข้อมูลกลุ่มนี้อ่อนไหว (เงินเดือน เลขประจำตัวประชาชน เลขบัญชี) — ทุก endpoint ตรวจสิทธิ์ manageEmployees
-- audit log ปิดบังค่าเงินเดือน (บันทึกว่า "เปลี่ยน" แต่ไม่เก็บตัวเลข) — แบบระบบ R-H1/R-H8

-- พนักงาน ≠ ผู้ใช้ระบบ (H7) — ผูกบัญชีผู้ใช้ได้ไม่บังคับ · ฟรีแลนซ์ไม่ใช่พนักงาน (จ่ายผ่านค่าใช้จ่าย + 50 ทวิ ภ.ง.ด.3)
-- สถานะไม่เก็บเป็นคอลัมน์: พ้นสภาพ = มีวันทำงานวันสุดท้ายและเลยวันนั้นแล้ว (ตั้งล่วงหน้าได้ ยังทำงานอยู่จนถึงวันนั้น)
-- รับกลับเข้าทำงานหลังออกไปแล้ว = สร้างพนักงานใหม่ (รหัสใหม่) — ช่วงเวลาทำงานแต่ละช่วงต้องแยกกันเพื่อคิดเงินเดือน/อายุงาน
-- เลขประจำตัวประชาชน/บัญชีผู้ใช้ ห้ามซ้ำกับพนักงานที่ยังไม่พ้นสภาพ (ตรวจใน backend — คนเดิมกลับมาทำงานใหม่ใช้เลขเดิมได้)
CREATE TABLE `tb_employees` (
  `emp_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emp_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'รหัสพนักงาน ห้ามซ้ำ',
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
  `emp_department_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
