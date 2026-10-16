-- ════ เฟส 2 จัดซื้อ / ค่าใช้จ่าย / เจ้าหนี้ / หัก ณ ที่จ่าย (2026-10-16) · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md ════
-- รันหลัง create_users_roles.sql, create_project_manager.sql, create_sales.sql (อ้าง tb_users, tb_currencies, tb_projects, tb_branches, tb_approval_levels)
-- ฐานข้อมูลที่ใช้งานอยู่: รัน deploy_schema.sql แทน (มีตารางกลุ่มนี้แบบรันซ้ำได้)
-- ขั้น 2-1: ประเภทเงินได้ + อัตราหัก ณ ที่จ่าย · หมวดค่าใช้จ่าย · ผู้ขาย
-- ขั้น 2-2: ค่าใช้จ่าย/บิลผู้ขาย + บรรทัด + ไฟล์แนบ + ประวัติอนุมัติ · กติกาอนุมัติเริ่มต้น EX/EC
-- ขั้น 2-4: ใบสำคัญจ่าย + การตัดหนี้ + หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) + แถวเงินได้

-- ประเภทเงินได้ที่บริษัทหัก ณ ที่จ่ายผู้อื่น — แถวบนหนังสือรับรอง 50 ทวิ (1–6 ตามแบบกรมสรรพากร)
-- อัตราแยกไว้ใน tb_wht_rates ตามวันที่มีผล (แผนแม่บทหลักการข้อ 4 — อัตราเปลี่ยนได้ เอกสารเก่าต้องใช้อัตรา ณ วันนั้น)
CREATE TABLE `tb_wht_income_types` (
  `wit_code` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เช่น SERVICE, ADVERTISING — ใช้อ้างในโค้ด เปลี่ยนไม่ได้',
  `wit_name_th` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wit_name_en` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wit_form_row` tinyint unsigned NOT NULL DEFAULT '5' COMMENT 'แถวบน 50 ทวิ: 1 เงินเดือน 2 ค่าธรรมเนียม/นายหน้า 3 ค่าลิขสิทธิ์ 4 ดอกเบี้ย/ปันผล 5 ตามมาตรา 3 เตรส 6 อื่นๆ',
  `wit_form_label` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ข้อความประเภทเงินได้ที่พิมพ์บน 50 ทวิ',
  `wit_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `wit_sort_order` int NOT NULL DEFAULT '0',
  `wit_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `wit_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตราหัก ณ ที่จ่ายตามวันที่มีผล — อัตราที่มีผลแล้ว (วันนี้หรือก่อน) แก้/ลบไม่ได้ (แบบ tb_vat_rates)
CREATE TABLE `tb_wht_rates` (
  `wr_income_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wr_effective_from` date NOT NULL,
  `wr_rate` decimal(5,2) NOT NULL COMMENT 'เช่น 3.00',
  `wr_min_payment` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จ่ายต่อครั้ง (ก่อน VAT) ต่ำกว่านี้ไม่ต้องหัก — 0 = หักทุกยอด',
  `wr_note` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ที่มา เช่น เลขคำสั่งกรมสรรพากร',
  `wr_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `wr_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wr_income_type`,`wr_effective_from`),
  KEY `fk_wr_created_by` (`wr_created_by`),
  CONSTRAINT `fk_wr_income_type` FOREIGN KEY (`wr_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`),
  CONSTRAINT `fk_wr_created_by` FOREIGN KEY (`wr_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หมวดค่าใช้จ่าย — รหัสบัญชีว่างได้ (ผูกผังบัญชีในเฟส 3) · ประเภทเงินได้เริ่มต้น = เสนอหัก ณ ที่จ่ายอัตโนมัติ (ว่าง = ไม่หัก)
CREATE TABLE `tb_expense_categories` (
  `ec_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ec_name_th` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ec_name_en` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_account_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รหัสบัญชี (เฟส 3) — ตามผังบัญชีของนักบัญชี (คำถาม X6)',
  `ec_default_income_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ec_is_asset` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ของชิ้นใหญ่ ไว้ย้ายไปทะเบียนทรัพย์สิน (เฟส 6)',
  `ec_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
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
CREATE TABLE `tb_vendors` (
  `vd_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `vd_code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รหัสสั้นตั้งเอง (ไม่บังคับ)',
  `vd_type` enum('juristic','individual') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'juristic',
  `vd_country` char(2) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TH',
  `vd_name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ชื่อตามเอกสารภาษี (บริษัท / ชื่อ-นามสกุล)',
  `vd_tax_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_branch_code` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '00000 = สำนักงานใหญ่',
  `vd_address` text COLLATE utf8mb4_unicode_ci COMMENT 'ที่อยู่สำหรับ 50 ทวิ',
  `vd_contact_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_account_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_bank_account_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_promptpay_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `vd_credit_days` int DEFAULT NULL COMMENT 'ว่าง = ครบกำหนดวันที่เอกสาร',
  `vd_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `vd_default_income_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = ใช้ของหมวดค่าใช้จ่าย',
  `vd_default_category_id` int unsigned DEFAULT NULL,
  `vd_notes` text COLLATE utf8mb4_unicode_ci,
  `vd_status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `vd_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_vd_currency` FOREIGN KEY (`vd_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_vd_income_type` FOREIGN KEY (`vd_default_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`),
  CONSTRAINT `fk_vd_category` FOREIGN KEY (`vd_default_category_id`) REFERENCES `tb_expense_categories` (`ec_id`),
  CONSTRAINT `fk_vd_created_by` FOREIGN KEY (`vd_created_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ── ขั้น 2-2 (2026-10-16): บันทึกค่าใช้จ่าย / บิลผู้ขาย (EX) และใบเบิกเงินพนักงาน (EC) — ตารางเดียว แยกด้วย ex_kind ──
-- flow: draft → (ส่ง) → ยอดก่อน VAT เป็นบาทต่ำกว่าชั้น 1 ของกติกา EX/EC = อนุมัติอัตโนมัติ · ไม่งั้น pending_approval ตามชั้น → approved (ได้เลขตอนนี้)
--       approved = "รอจ่าย" (เจ้าหนี้) · จ่ายแล้ว/บางส่วน/เกินกำหนด คำนวณตอนอ่านจาก ex_paid_amount (แบบใบแจ้งหนี้) · ยกเลิกพร้อมเหตุผล
-- VAT ซื้อบันทึกตามเอกสารของผู้ขาย (ไม่คำนวณใหม่) · ex_vat_claimable = จด VAT ณ วันที่เอกสาร + ใบกำกับเต็มรูป (คำถามนักบัญชี X3)
-- หัก ณ ที่จ่ายในใบนี้เป็นยอดประมาณ — หักจริงตอนทำจ่าย (ขั้น 2-4)
CREATE TABLE `tb_expenses` (
  `ex_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_number` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'EX-/EC-yyyymmdd-xxxxxx ได้ตอนอนุมัติครบ (หรือผ่านอัตโนมัติ) — ร่างไม่มีเลข ลบได้โดยเลขไม่ข้าม',
  `ex_kind` enum('bill','claim') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bill',
  `ex_status` enum('draft','pending_approval','approved','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `ex_version` int unsigned NOT NULL DEFAULT '0',
  `ex_vendor_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บิลผู้ขาย',
  `ex_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเบิก — ผู้เบิก (ผู้รับเงิน)',
  `ex_merchant_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเบิก — ชื่อร้าน/ผู้ขายตามใบเสร็จ (ผู้ขายนอกทะเบียน)',
  `ex_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ex_vendor_doc_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่เอกสารของผู้ขาย — ผู้ขายเดียวกันซ้ำในใบที่ไม่ยกเลิกไม่ได้ (R-P2)',
  `ex_vendor_doc_date` date DEFAULT NULL,
  `ex_doc_type` enum('tax_invoice','abbreviated_tax_invoice','receipt','invoice','substitute_receipt','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'receipt',
  `ex_expense_date` date NOT NULL COMMENT 'วันที่ค่าใช้จ่ายเกิด (วันที่ในเอกสาร/วันที่จ่ายไปก่อน)',
  `ex_credit_days` int NOT NULL DEFAULT '0',
  `ex_due_date` date NOT NULL COMMENT 'วันที่ค่าใช้จ่าย + เครดิต',
  `ex_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `ex_exchange_rate` decimal(20,10) NOT NULL DEFAULT '1.0000000000',
  `ex_rate_source` enum('bot','manual') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_rate_date` date DEFAULT NULL,
  `ex_rate_override_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT',
  `ex_vat_rate` decimal(5,2) NOT NULL DEFAULT '0.00',
  `ex_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ตามเอกสารผู้ขาย',
  `ex_vat_claimable` tinyint(1) NOT NULL DEFAULT '0',
  `ex_total` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_subtotal_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_total_thb` decimal(15,2) NOT NULL DEFAULT '0.00',
  `ex_wht_income_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_wht_rate` decimal(5,2) DEFAULT NULL,
  `ex_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ประมาณการ — หักจริงตอนทำจ่าย',
  `ex_paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมตัดหนี้ของใบสำคัญจ่ายที่ไม่ยกเลิก (ขั้น 2-4)',
  `ex_notes` text COLLATE utf8mb4_unicode_ci,
  `ex_approval_plan` json DEFAULT NULL,
  `ex_approval_round` int unsigned NOT NULL DEFAULT '0',
  `ex_approval_current_level` tinyint unsigned DEFAULT NULL,
  `ex_auto_approved` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ยอดต่ำกว่าวงเงินชั้น 1 ผ่านอัตโนมัติ (P2)',
  `ex_submitted_at` datetime DEFAULT NULL,
  `ex_returned_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_approved_at` datetime DEFAULT NULL,
  `ex_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ex_cancelled_at` datetime DEFAULT NULL,
  `ex_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_ex_vendor` FOREIGN KEY (`ex_vendor_id`) REFERENCES `tb_vendors` (`vd_id`),
  CONSTRAINT `fk_ex_employee` FOREIGN KEY (`ex_employee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ex_branch` FOREIGN KEY (`ex_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_ex_currency` FOREIGN KEY (`ex_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_ex_income_type` FOREIGN KEY (`ex_wht_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`),
  CONSTRAINT `fk_ex_created_by` FOREIGN KEY (`ex_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_ex_cancelled_by` FOREIGN KEY (`ex_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- บรรทัดค่าใช้จ่าย — หมวด + โปรเจกต์ (ว่าง = ส่วนกลาง P4) · ยอดไม่รวม VAT
CREATE TABLE `tb_expense_lines` (
  `exl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `exl_expense_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exl_order` int NOT NULL DEFAULT '0',
  `exl_category_id` int unsigned NOT NULL,
  `exl_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exl_description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exl_quantity` decimal(12,2) NOT NULL DEFAULT '1.00',
  `exl_unit_price` decimal(15,2) NOT NULL DEFAULT '0.00',
  `exl_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`exl_id`),
  KEY `idx_exl_expense` (`exl_expense_id`,`exl_order`),
  KEY `idx_exl_project` (`exl_project_id`),
  KEY `fk_exl_category` (`exl_category_id`),
  CONSTRAINT `fk_exl_expense` FOREIGN KEY (`exl_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exl_category` FOREIGN KEY (`exl_category_id`) REFERENCES `tb_expense_categories` (`ec_id`),
  CONSTRAINT `fk_exl_project` FOREIGN KEY (`exl_project_id`) REFERENCES `tb_projects` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ไฟล์แนบ (ใบเสร็จ/ใบกำกับของผู้ขาย) — เก็บ backend/storage/expense-documents/ เปิดผ่าน API ตรวจสิทธิ์ (R-P7)
CREATE TABLE `tb_expense_attachments` (
  `exf_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `exf_expense_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `exf_file_size` int unsigned NOT NULL DEFAULT '0',
  `exf_uploaded_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `exf_uploaded_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`exf_id`),
  KEY `idx_exf_expense` (`exf_expense_id`),
  KEY `fk_exf_uploaded_by` (`exf_uploaded_by`),
  CONSTRAINT `fk_exf_expense` FOREIGN KEY (`exf_expense_id`) REFERENCES `tb_expenses` (`ex_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exf_uploaded_by` FOREIGN KEY (`exf_uploaded_by`) REFERENCES `tb_users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติอนุมัติ/ตีกลับ — รูปแบบเดียวกับ tb_invoice_approvals
CREATE TABLE `tb_expense_approvals` (
  `expa_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `expa_expense_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expa_round` int unsigned NOT NULL,
  `expa_level` tinyint unsigned NOT NULL,
  `expa_action` enum('approve','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `expa_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_user_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_role_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expa_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
CREATE TABLE `tb_payments` (
  `pv_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_number` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'PV-yyyymmdd-xxxxxx วันที่ในเลข = วันที่จ่าย',
  `pv_status` enum('issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `pv_version` int unsigned NOT NULL DEFAULT '0',
  `pv_payee_kind` enum('vendor','employee') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_vendor_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_employee_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `pv_payment_date` date NOT NULL COMMENT 'วันที่จ่าย (ย้อนหลังได้ไม่เกิน 30 วัน — อัตราหัก ณ ที่จ่ายใช้ของวันนี้)',
  `pv_method` enum('transfer','cheque','cash','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `pv_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีบริษัทที่จ่ายออก (บังคับเมื่อโอน/เช็ค)',
  `pv_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น',
  `pv_cheque_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cheque_date` date DEFAULT NULL,
  `pv_allocated_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดตัดหนี้',
  `pv_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายจริง (= ยอดภาษีใน 50 ทวิ)',
  `pv_net_paid` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'จ่ายผู้รับสุทธิ = ตัดหนี้ - หัก',
  `pv_fee_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าธรรมเนียมโอนที่บริษัทจ่ายเพิ่ม',
  `pv_allocated_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้เป็นบาทตามอัตราของรายการ',
  `pv_paid_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดบาทที่ออกจากบัญชีจริง (ไม่รวมค่าธรรมเนียม)',
  `pv_actual_rate` decimal(20,10) DEFAULT NULL COMMENT 'อัตราจริง = paid_thb / net_paid (สกุลต่างประเทศ)',
  `pv_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนต่างอัตรา บวก = กำไร (จ่ายบาทน้อยกว่าที่บันทึก)',
  `pv_notes` text COLLATE utf8mb4_unicode_ci,
  `pv_payee_snapshot` json DEFAULT NULL COMMENT 'ชื่อ/เลขผู้เสียภาษี/ที่อยู่/บัญชีผู้รับ ณ วันจ่าย (R-P6)',
  `pv_company_snapshot` json DEFAULT NULL,
  `pv_bank_snapshot` json DEFAULT NULL COMMENT 'บัญชีบริษัทที่จ่ายออก ณ วันจ่าย',
  `pv_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้ทำจ่าย',
  `pv_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pv_cancelled_at` datetime DEFAULT NULL,
  `pv_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_pv_vendor` FOREIGN KEY (`pv_vendor_id`) REFERENCES `tb_vendors` (`vd_id`),
  CONSTRAINT `fk_pv_employee` FOREIGN KEY (`pv_employee_id`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_pv_branch` FOREIGN KEY (`pv_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_pv_currency` FOREIGN KEY (`pv_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_pv_bank_account` FOREIGN KEY (`pv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_pv_created_by` FOREIGN KEY (`pv_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_pv_cancelled_by` FOREIGN KEY (`pv_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการที่ใบสำคัญจ่ายตัด · pva_base_amount = ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้ (ฐานหัก ณ ที่จ่าย — ครั้งที่ปิดรายการรับเศษ R-P5)
CREATE TABLE `tb_payment_allocations` (
  `pva_payment_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pva_expense_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pva_order` int NOT NULL DEFAULT '0',
  `pva_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้รายการนี้ (สกุลของรายการ)',
  `pva_base_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT ส่วนที่จ่ายครั้งนี้',
  `pva_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดเป็นบาทตามอัตราของรายการ',
  `pva_wht_income_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ประเภทเงินได้ของรายการ ณ วันจ่าย',
  PRIMARY KEY (`pva_payment_id`,`pva_expense_id`),
  KEY `fk_pva_expense` (`pva_expense_id`),
  CONSTRAINT `fk_pva_payment` FOREIGN KEY (`pva_payment_id`) REFERENCES `tb_payments` (`pv_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pva_expense` FOREIGN KEY (`pva_expense_id`) REFERENCES `tb_expenses` (`ex_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) ที่บริษัทออก — ใบสำคัญจ่ายละไม่เกิน 1 ฉบับ · เลขรันต่อปี (เล่มที่ = ปี ค.ศ. — P5/X5)
-- ปีตามวันที่จ่าย (เวลาไทย) · เลขออกใน transaction เดียวกับใบสำคัญจ่าย (rollback แล้วเลขไม่ข้าม R-P3) · ยกเลิกแล้วเลขยังอยู่
CREATE TABLE `tb_wht_certificates` (
  `wt_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wt_number` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'WT-yyyy-xxxxxx',
  `wt_book_no` char(4) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เล่มที่ = ปี ค.ศ. ของวันที่จ่าย',
  `wt_sequence` int unsigned NOT NULL COMMENT 'เลขที่ในเล่ม',
  `wt_payment_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wt_form` enum('PND3','PND53') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ภ.ง.ด.3 บุคคลธรรมดา / 53 นิติบุคคล',
  `wt_payment_date` date NOT NULL,
  `wt_status` enum('issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
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
CREATE TABLE `tb_wht_certificate_lines` (
  `wtl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `wtl_certificate_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_income_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_form_row` tinyint unsigned NOT NULL,
  `wtl_form_label` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `wtl_rate` decimal(5,2) NOT NULL,
  `wtl_paid_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินได้ที่จ่าย (ยอดก่อน VAT)',
  `wtl_tax_amount` decimal(15,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`wtl_id`),
  KEY `idx_wtl_certificate` (`wtl_certificate_id`),
  KEY `fk_wtl_income_type` (`wtl_income_type`),
  CONSTRAINT `fk_wtl_certificate` FOREIGN KEY (`wtl_certificate_id`) REFERENCES `tb_wht_certificates` (`wt_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_wtl_income_type` FOREIGN KEY (`wtl_income_type`) REFERENCES `tb_wht_income_types` (`wit_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ข้อมูลเริ่มต้น — อัตราและเกณฑ์ต้องยืนยันกับนักบัญชี (คำถาม X1) · หมวดตามผังบัญชีของนักบัญชี (X6)
INSERT INTO tb_wht_income_types (wit_code, wit_name_th, wit_name_en, wit_form_row, wit_form_label, wit_sort_order) VALUES
  ('SERVICE', 'ค่าบริการ / ค่าจ้างทำของ', 'Service fee', 5, 'ค่าบริการ', 1),
  ('PROFESSIONAL', 'ค่าวิชาชีพอิสระ (บัญชี กฎหมาย สถาปัตย์ ฯลฯ)', 'Professional fee', 5, 'ค่าวิชาชีพอิสระ', 2),
  ('ADVERTISING', 'ค่าโฆษณา', 'Advertising', 5, 'ค่าโฆษณา', 3),
  ('TRANSPORT', 'ค่าขนส่ง', 'Transport', 5, 'ค่าขนส่ง', 4),
  ('RENT', 'ค่าเช่า', 'Rent', 5, 'ค่าเช่า', 5),
  ('PRIZE', 'รางวัล / ส่วนลด / ประโยชน์จากการชิงโชค', 'Prize', 5, 'รางวัล', 6);
INSERT INTO tb_wht_rates (wr_income_type, wr_effective_from, wr_rate, wr_min_payment, wr_note) VALUES
  ('SERVICE', '2000-01-01', 3.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'),
  ('PROFESSIONAL', '2000-01-01', 3.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'),
  ('ADVERTISING', '2000-01-01', 2.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'),
  ('TRANSPORT', '2000-01-01', 1.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'),
  ('RENT', '2000-01-01', 5.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี'),
  ('PRIZE', '2000-01-01', 5.00, 1000.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี');
INSERT INTO tb_expense_categories (ec_name_th, ec_name_en, ec_default_income_type, ec_is_asset, ec_sort_order) VALUES
  ('ค่าจ้างฟรีแลนซ์ / ผู้รับเหมาช่วง', 'Freelance / subcontract', 'SERVICE', 0, 1),
  ('เซิร์ฟเวอร์ / คลาวด์', 'Server / cloud', NULL, 0, 2),
  ('ซอฟต์แวร์ / subscription', 'Software / subscription', NULL, 0, 3),
  ('โดเมน / โฮสติ้ง', 'Domain / hosting', NULL, 0, 4),
  ('ค่าโฆษณา / การตลาด', 'Advertising / marketing', 'ADVERTISING', 0, 5),
  ('ค่าเช่าสำนักงาน', 'Office rent', 'RENT', 0, 6),
  ('ค่าน้ำ ค่าไฟ อินเทอร์เน็ต โทรศัพท์', 'Utilities / internet / phone', NULL, 0, 7),
  ('ค่าเดินทาง', 'Travel', NULL, 0, 8),
  ('ค่ารับรอง', 'Entertainment', NULL, 0, 9),
  ('วัสดุ / อุปกรณ์สำนักงาน', 'Office supplies', NULL, 0, 10),
  ('อุปกรณ์คอมพิวเตอร์ (ทรัพย์สิน)', 'Computer equipment (asset)', NULL, 1, 11),
  ('ค่าวิชาชีพ (บัญชี / กฎหมาย)', 'Professional fees', 'PROFESSIONAL', 0, 12),
  ('ค่าธรรมเนียมธนาคาร', 'Bank charges', NULL, 0, 13),
  ('ค่าขนส่ง / ไปรษณีย์', 'Delivery / postage', 'TRANSPORT', 0, 14),
  ('อื่นๆ', 'Other', NULL, 0, 99);

-- กติกาอนุมัติเริ่มต้น: บิลผู้ขาย (EX) ตั้งแต่ 3,000 บาท (ต่ำกว่าผ่านอัตโนมัติ — P2) · ใบเบิก (EC) ทุกใบ · ผู้อนุมัติ = role ระบบ
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct) VALUES ('EX', 1, 3000.00, 0);
INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES ('EX', 1, 'ROL202601010000001');
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct) VALUES ('EC', 1, 0.00, 0);
INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES ('EC', 1, 'ROL202601010000001');

commit;
