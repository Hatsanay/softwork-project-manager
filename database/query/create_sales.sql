SET NAMES utf8mb4 collate utf8mb4_unicode_ci;

-- วงจรขาย (ERP ช่วง 1A) — ฉบับอ่านอ้างอิง สร้างหลัง create_users_roles.sql และ create_project_manager.sql
-- ตอน deploy รัน deploy_schema.sql ไฟล์เดียวเสมอ (ไฟล์นั้นคือแหล่งอ้างอิงหลัก — แก้ที่นั่นแล้วแก้ไฟล์นี้ตาม)
-- ════ วงจรขาย ช่วง 1A (2026-10-13) — แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 1 ════════════════
-- เงิน = DECIMAL(15,2) คำนวณที่ backend ด้วย src/shared/money.mjs · อัตราแลกเปลี่ยน = บาทต่อ 1 หน่วย DECIMAL(20,10)
-- (10 ตำแหน่งพอสำหรับสกุลที่ ธปท. ประกาศต่อ 100/1000 หน่วย เช่น เยน — หารแล้วไม่เสียความแม่นยำ)
-- แถวลูก (รายการ/งวด/ประวัติอนุมัติ/แถวในชุดสินค้า) ใช้ BIGINT AUTO_INCREMENT: สร้างทีละหลายแถวใน transaction เดียว
-- ไม่ควรล็อก tb_maxID ทีละแถว และไม่ใช่เลขที่ผู้ใช้เห็น
-- FK จากตารางเดิม (tb_users, tb_clients, tb_tasks) มาตารางกลุ่มนี้ อยู่ในส่วนที่ 4 เพราะตารางเดิมถูกสร้างก่อน

-- สกุลเงิน (รหัส ISO 4217) — THB เป็นสกุลหลักของระบบ ปิดใช้งานไม่ได้ · ข้อมูลเริ่มต้น THB + USD อยู่ต้นส่วนที่ 4
CREATE TABLE `tb_currencies` (
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
CREATE TABLE `tb_company_settings` (
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
  `cs_default_credit_days` int NOT NULL DEFAULT '30' COMMENT 'เครดิตเทอมของใบแจ้งหนี้เมื่อลูกค้าไม่ได้ตั้งเอง (วัน) 0-365',
  `cs_promptpay_id` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขพร้อมเพย์รับเงิน (มือถือ 10 หลัก / เลขผู้เสียภาษี 13 หลัก) ว่าง = ไม่พิมพ์ QR',
  `cs_invoice_notes_th` text COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุท้ายใบแจ้งหนี้เริ่มต้น (เอกสารภาษาไทย)',
  `cs_invoice_notes_en` text COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุท้ายใบแจ้งหนี้เริ่มต้น (เอกสารภาษาอังกฤษ)',
  `cs_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`cs_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- อัตรา VAT ตามวันที่มีผล (หลักการ ERP ข้อ 4: อัตราภาษีต้องมีวันที่มีผล ไม่ hardcode)
-- อัตราของเอกสาร = แถวล่าสุดที่ vr_effective_from <= วันที่เอกสาร · ตั้งอัตราใหม่ล่วงหน้าได้ เอกสารเก่าไม่เปลี่ยน (เก็บอัตราในเอกสารแล้ว)
CREATE TABLE `tb_vat_rates` (
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
CREATE TABLE `tb_branches` (
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

-- แผนกผูกสาขา (tb_department สร้างใน create_users_roles.sql ก่อนตารางนี้ — 2026-10-18)
ALTER TABLE tb_department
  ADD CONSTRAINT fk_dep_branch FOREIGN KEY (dep_branch_id) REFERENCES tb_branches(branch_id);

-- บัญชีธนาคารรับเงิน (แสดงบนใบแจ้งหนี้ ช่วง 1B) — บัญชีหลักมีได้ 1 บัญชีต่อสกุลเงิน (ตรวจใน backend)
CREATE TABLE `tb_bank_accounts` (
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
CREATE TABLE `tb_document_sequences` (
  `ds_doc_type` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'QT / IV / BN / RE',
  `ds_date` char(8) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'yyyymmdd ตามวันที่เอกสาร (เวลาไทย)',
  `ds_last` int unsigned NOT NULL,
  PRIMARY KEY (`ds_doc_type`,`ds_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- แคชอัตราแลกเปลี่ยนจาก ธปท. (แปลงเป็นบาทต่อ 1 หน่วยแล้ว) — เก็บทุกวันที่เคยดึง ไม่ลบ ใช้ย้อนตรวจได้
-- เก็บอัตราทุกชนิดที่ ธปท. ให้มา เพราะชนิดที่ใช้แปลงรายได้ทางภาษียังรอนักบัญชียืนยัน (คำถาม B6)
CREATE TABLE `tb_exchange_rates` (
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
CREATE TABLE `tb_user_signatures` (
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
CREATE TABLE `tb_product_categories` (
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
CREATE TABLE `tb_products` (
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
CREATE TABLE `tb_product_packages` (
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
CREATE TABLE `tb_product_package_items` (
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
CREATE TABLE `tb_approval_levels` (
  `al_doc_type` varchar(4) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'QT',
  `al_level` tinyint unsigned NOT NULL COMMENT '1..n',
  `al_min_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดก่อน VAT (บาท) ตั้งแต่เท่านี้ต้องผ่านชั้นนี้',
  `al_require_distinct` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1 = ต้องเป็นคนละคนกับผู้อนุมัติชั้นก่อนหน้าในรอบเดียวกัน',
  `al_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`al_doc_type`,`al_level`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- role ที่อนุมัติชั้นนั้นได้ (ชั้นหนึ่งหลาย role ได้) — ลบ role ที่อยู่ในกติกาไม่ได้ (FK ไม่ cascade, risk R6)
CREATE TABLE `tb_approval_level_roles` (
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
CREATE TABLE `tb_quotations` (
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
CREATE TABLE `tb_quotation_items` (
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
CREATE TABLE `tb_quotation_milestones` (
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
CREATE TABLE `tb_quotation_approvals` (
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
CREATE TABLE `tb_invoices` (
  `inv_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_number` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IV-yyyymmdd-xxxxxx ออกตอนออกใบ — ยกเลิกแล้วเลขยังอยู่',
  `inv_status` enum('draft','pending_approval','issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `inv_version` int unsigned NOT NULL DEFAULT '0',
  `inv_source` enum('quotation','manual') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'quotation = ออกจากงวดของใบเสนอราคา (ยอดล็อก) · manual = สร้างเอง (ต้องอนุมัติ)',
  `inv_quotation_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_reissued_from_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ออกใหม่แทนใบที่ยกเลิกใบไหน',
  `inv_doc_type` enum('invoice','debit_note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'invoice' COMMENT 'debit_note = ใบเพิ่มหนี้ อ้างใบเดิม (2026-10-18 ขั้น N-2)',
  `inv_reference_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: ใบแจ้งหนี้ที่อ้างอิง',
  `inv_original_total` decimal(15,2) DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: มูลค่าที่ถูกต้องเดิม (รวม VAT) ณ ตอนออก = ใบที่อ้างอิงหลังลดหนี้ + ใบเพิ่มหนี้ที่ออกก่อนหน้า',
  `inv_adjust_reason_code` enum('price_increase','scope_increase','error','other') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: รหัสเหตุผล',
  `inv_adjust_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ใบเพิ่มหนี้: เหตุผล (กฎหมายบังคับ)',
  `inv_title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inv_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `inv_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `inv_exchange_rate` decimal(20,10) NOT NULL DEFAULT '1.0000000000' COMMENT 'บาทต่อ 1 หน่วย ณ วันที่ออก — ใช้คิดยอดบาทภายใน',
  `inv_rate_source` enum('bot','manual') COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ว่าง = เอกสารบาท',
  `inv_rate_date` date DEFAULT NULL,
  `inv_rate_bot` decimal(20,10) DEFAULT NULL,
  `inv_rate_override_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_vat_treatment` enum('standard','zero') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'standard',
  `inv_credit_days` int NOT NULL DEFAULT '30' COMMENT 'เครดิตเทอม (วัน) 0-365',
  `inv_issue_date` date DEFAULT NULL COMMENT 'วันที่ออก (เวลาไทย) ย้อนไม่ได้',
  `inv_due_date` date DEFAULT NULL COMMENT 'วันที่ออก + เครดิต',
  `inv_subtotal` decimal(15,2) NOT NULL DEFAULT '0.00',
  `inv_discount_type` enum('amount','percent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
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
  `inv_notes` text COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุที่พิมพ์บนเอกสาร',
  `inv_internal_note` text COLLATE utf8mb4_unicode_ci COMMENT 'บันทึกภายใน — ไม่พิมพ์',
  `inv_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีรับเงินที่พิมพ์บนใบ',
  `inv_client_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลลูกค้า ณ วันออก',
  `inv_company_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลบริษัท + สาขา ณ วันออก',
  `inv_bank_snapshot` json DEFAULT NULL COMMENT 'บัญชีรับเงิน + พร้อมเพย์ ณ วันออก',
  `inv_approval_round` int unsigned NOT NULL DEFAULT '0',
  `inv_approval_current_level` tinyint unsigned DEFAULT NULL,
  `inv_approval_plan` json DEFAULT NULL,
  `inv_returned_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_submitted_at` datetime DEFAULT NULL,
  `inv_issued_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้กดออก (ใบสร้างเอง = ผู้อนุมัติชั้นสุดท้าย)',
  `inv_issued_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_issued_by_title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_issuer_signature_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลายเซ็นผู้ออก ฉบับตอนออก',
  `inv_issued_at` datetime DEFAULT NULL,
  `inv_sent_at` datetime DEFAULT NULL,
  `inv_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inv_cancelled_at` datetime DEFAULT NULL,
  `inv_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_inv_quotation` FOREIGN KEY (`inv_quotation_id`) REFERENCES `tb_quotations` (`qt_id`),
  CONSTRAINT `fk_inv_project` FOREIGN KEY (`inv_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_inv_client` FOREIGN KEY (`inv_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_inv_branch` FOREIGN KEY (`inv_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_inv_currency` FOREIGN KEY (`inv_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_inv_reissued_from` FOREIGN KEY (`inv_reissued_from_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_inv_reference` FOREIGN KEY (`inv_reference_invoice_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_inv_bank_account` FOREIGN KEY (`inv_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_inv_created_by` FOREIGN KEY (`inv_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_inv_issued_by` FOREIGN KEY (`inv_issued_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_inv_issuer_signature` FOREIGN KEY (`inv_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_inv_cancelled_by` FOREIGN KEY (`inv_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการในใบแจ้งหนี้ — รูปแบบเดียวกับรายการใบเสนอราคา · ใบจากงวด = บรรทัดละงวด (ราคา = ยอดก่อน VAT ของงวด)
CREATE TABLE `tb_invoice_items` (
  `invi_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `invi_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invi_order` int NOT NULL DEFAULT '0',
  `invi_type` enum('item','heading','note') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `invi_product_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invi_description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `invi_quantity` decimal(12,2) DEFAULT NULL,
  `invi_unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invi_unit_price` decimal(15,2) DEFAULT NULL,
  `invi_list_price` decimal(15,2) DEFAULT NULL,
  `invi_discount_type` enum('amount','percent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'amount',
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
CREATE TABLE `tb_invoice_milestones` (
  `ivm_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
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
CREATE TABLE `tb_invoice_approvals` (
  `inva_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `inva_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_round` int unsigned NOT NULL,
  `inva_level` tinyint unsigned NOT NULL,
  `inva_action` enum('approve','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_user_name` varchar(101) COLLATE utf8mb4_unicode_ci NOT NULL,
  `inva_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่',
  `inva_role_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `inva_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`inva_id`),
  KEY `idx_inva_invoice` (`inva_invoice_id`,`inva_round`,`inva_level`),
  KEY `fk_inva_user` (`inva_user_id`),
  CONSTRAINT `fk_inva_invoice` FOREIGN KEY (`inva_invoice_id`) REFERENCES `tb_invoices` (`inv_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inva_user` FOREIGN KEY (`inva_user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบวางบิล — รวมใบแจ้งหนี้ที่ออกแล้วของลูกค้ารายเดียว สกุลเงินเดียว + วันนัดชำระ · ไม่ต้องอนุมัติ
-- flow: draft → issued (ได้เลข BN + วันที่) → cancelled (ใบแจ้งหนี้ในใบนี้กลับมาเลือกใหม่ได้)
CREATE TABLE `tb_billing_notes` (
  `bn_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_number` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'BN-yyyymmdd-xxxxxx ออกตอนออกใบ',
  `bn_status` enum('draft','issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `bn_version` int unsigned NOT NULL DEFAULT '0',
  `bn_client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bn_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `bn_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `bn_issue_date` date DEFAULT NULL,
  `bn_payment_date` date DEFAULT NULL COMMENT 'วันนัดชำระ (ลูกค้านัด)',
  `bn_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดใบแจ้งหนี้ ณ ตอนออก',
  `bn_notes` text COLLATE utf8mb4_unicode_ci,
  `bn_client_snapshot` json DEFAULT NULL,
  `bn_company_snapshot` json DEFAULT NULL,
  `bn_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_issued_at` datetime DEFAULT NULL,
  `bn_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bn_cancelled_at` datetime DEFAULT NULL,
  `bn_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_bn_client` FOREIGN KEY (`bn_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_bn_branch` FOREIGN KEY (`bn_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_bn_currency` FOREIGN KEY (`bn_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_bn_created_by` FOREIGN KEY (`bn_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_bn_cancelled_by` FOREIGN KEY (`bn_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบแจ้งหนี้ในใบวางบิล — ใบหนึ่งอยู่ในใบวางบิลที่ยังไม่ยกเลิกได้ใบเดียว (ตรวจใน backend) · เก็บยอด ณ ตอนออก
CREATE TABLE `tb_billing_note_invoices` (
  `bni_billing_note_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bni_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
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
CREATE TABLE `tb_receipts` (
  `rc_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_number` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RE-yyyymmdd-xxxxxx วันที่ในเลข = วันที่ใบเสร็จ',
  `rc_status` enum('issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'issued',
  `rc_version` int unsigned NOT NULL DEFAULT '0',
  `rc_client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `rc_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `rc_receipt_date` date NOT NULL COMMENT 'วันที่ได้รับเงิน (ย้อนหลังได้ไม่เกิน 30 วัน)',
  `rc_method` enum('transfer','cheque','cash','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rc_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีที่เงินเข้า (บังคับเมื่อโอน)',
  `rc_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขอ้างอิงการโอน / รายละเอียดวิธีอื่น',
  `rc_cheque_no` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cheque_bank` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cheque_date` date DEFAULT NULL,
  `rc_allocated_total` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ผลรวมยอดตัดหนี้',
  `rc_wht_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายที่ลูกค้าหักจริง',
  `rc_fee_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ค่าธรรมเนียมที่ถูกหักก่อนเงินเข้า',
  `rc_received_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินเข้าจริง (สกุลของใบ) = ตัดหนี้ - หัก - ค่าธรรมเนียม',
  `rc_received_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดบาทที่เข้าบัญชีจริง (บาท = เท่า received)',
  `rc_actual_rate` decimal(20,10) DEFAULT NULL COMMENT 'อัตราจริง = received_thb / received (สกุลต่างประเทศ)',
  `rc_allocated_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้เป็นบาทตามอัตราของใบแจ้งหนี้',
  `rc_fx_diff_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนต่างอัตรา บวก = กำไร',
  `rc_wht_certificate_no` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เลขที่ใน 50 ทวิ',
  `rc_wht_certificate_date` date DEFAULT NULL,
  `rc_wht_file_path` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไฟล์ 50 ทวิ ใต้ backend/storage (ไม่ใช่ /uploads สาธารณะ)',
  `rc_wht_file_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อไฟล์เดิมที่ผู้ใช้อัปโหลด',
  `rc_wht_file_uploaded_at` datetime DEFAULT NULL,
  `rc_notes` text COLLATE utf8mb4_unicode_ci,
  `rc_internal_note` text COLLATE utf8mb4_unicode_ci,
  `rc_billing_note_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บันทึกจากใบวางบิลไหน (อ้างอิงเท่านั้น)',
  `rc_client_snapshot` json DEFAULT NULL,
  `rc_company_snapshot` json DEFAULT NULL,
  `rc_bank_snapshot` json DEFAULT NULL,
  `rc_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้รับเงิน',
  `rc_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rc_cancelled_at` datetime DEFAULT NULL,
  `rc_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_rc_client` FOREIGN KEY (`rc_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_rc_branch` FOREIGN KEY (`rc_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_rc_currency` FOREIGN KEY (`rc_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_rc_bank_account` FOREIGN KEY (`rc_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_rc_billing_note` FOREIGN KEY (`rc_billing_note_id`) REFERENCES `tb_billing_notes` (`bn_id`),
  CONSTRAINT `fk_rc_created_by` FOREIGN KEY (`rc_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_rc_cancelled_by` FOREIGN KEY (`rc_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ใบแจ้งหนี้ที่ใบเสร็จตัด · inv_paid_amount = ผลรวม rca_amount ของใบเสร็จที่ไม่ยกเลิก (ปรับใน transaction เดียวกัน)
-- rca_vat_amount / rca_amount_thb: ครั้งที่ทำให้ใบชำระครบรับเศษ → ผลรวมทุกครั้ง = VAT / ยอดบาทของใบพอดี (เตรียมใบกำกับภาษี B1)
CREATE TABLE `tb_receipt_allocations` (
  `rca_receipt_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rca_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rca_order` int NOT NULL DEFAULT '0',
  `rca_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดหนี้ใบนี้ (สกุลของใบ)',
  `rca_vat_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'VAT ส่วนที่รับครั้งนี้',
  `rca_amount_thb` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดตัดเป็นบาทตามอัตราของใบแจ้งหนี้',
  `rca_credited_before` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดใบลดหนี้ของใบแจ้งหนี้ ณ ตอนออกใบเสร็จ (2026-10-18 — คงค้างบนใบเสร็จไม่เปลี่ยนภายหลัง)',
  PRIMARY KEY (`rca_receipt_id`,`rca_invoice_id`),
  KEY `fk_rca_invoice` (`rca_invoice_id`),
  CONSTRAINT `fk_rca_receipt` FOREIGN KEY (`rca_receipt_id`) REFERENCES `tb_receipts` (`rc_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rca_invoice` FOREIGN KEY (`rca_invoice_id`) REFERENCES `tb_invoices` (`inv_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ════ ใบลดหนี้ (2026-10-18 ขั้น N-1) · แบบระบบ: docs/plans/2026-10-18-adjustments-po.md หัวข้อ 3.1, 4.1 ════
-- ใบลดหนี้ = ลดยอดที่ลูกค้าต้องจ่ายของใบแจ้งหนี้ที่ออกแล้ว โดยไม่ยกเลิกใบเดิม · ทุกใบต้องอนุมัติตามกติกา 'CN' (N2-ก)
-- flow: draft → pending_approval (ชั้น 1..n) → issued (ได้เลข CN + วันที่ · ยอดรวมของใบเดิมใน tb_invoices.inv_credited_* เพิ่ม) → cancelled
-- ลดเกินยอดค้าง (ลูกค้าจ่ายมาแล้ว) = ต้องคืนเงิน: cn_refund_required > 0 → บันทึกคืนเงิน (N1-ก) · โอนคืน + หัก ณ ที่จ่าย = ยอดที่ต้องคืนพอดี
-- ลูกค้า สาขา สกุล อัตรา VAT อัตราแลกเปลี่ยน โปรเจกต์ มาจากใบเดิมเสมอ · ยอดคำนวณใน backend (shared/credit-note-totals.mjs)
CREATE TABLE `tb_credit_notes` (
  `cn_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_number` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'CN-yyyymmdd-xxxxxx ออกตอนอนุมัติครบ — ยกเลิกแล้วเลขยังอยู่',
  `cn_status` enum('draft','pending_approval','issued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `cn_version` int unsigned NOT NULL DEFAULT '0',
  `cn_invoice_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ใบแจ้งหนี้ที่ลด',
  `cn_client_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_branch_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'THB',
  `cn_language` enum('th','en') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'th',
  `cn_reason_code` enum('price_reduction','scope_reduction','defect','error','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cn_reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'เหตุผล (พิมพ์บนเอกสาร)',
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
  `cn_refund_bank_account_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'บัญชีบริษัทที่โอนคืนออก',
  `cn_refund_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'เงินที่โอนคืนจริง',
  `cn_refund_wht` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ส่วนหัก ณ ที่จ่ายที่ไม่ต้องคืน (ลูกค้าหักไว้แล้ว)',
  `cn_refund_reference` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refund_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refunded_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_refunded_at` datetime DEFAULT NULL,
  `cn_notes` text COLLATE utf8mb4_unicode_ci COMMENT 'หมายเหตุที่พิมพ์บนเอกสาร',
  `cn_internal_note` text COLLATE utf8mb4_unicode_ci COMMENT 'บันทึกภายใน — ไม่พิมพ์',
  `cn_client_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลลูกค้า ณ วันออก',
  `cn_company_snapshot` json DEFAULT NULL COMMENT 'ข้อมูลบริษัท + สาขา ณ วันออก',
  `cn_approval_round` int unsigned NOT NULL DEFAULT '0',
  `cn_approval_current_level` tinyint unsigned DEFAULT NULL,
  `cn_approval_plan` json DEFAULT NULL,
  `cn_returned_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_created_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_submitted_at` datetime DEFAULT NULL,
  `cn_issued_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้อนุมัติชั้นสุดท้าย',
  `cn_issued_by_name` varchar(101) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issued_by_title` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issuer_signature_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_issued_at` datetime DEFAULT NULL,
  `cn_cancelled_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cn_cancelled_at` datetime DEFAULT NULL,
  `cn_cancel_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  CONSTRAINT `fk_cn_invoice` FOREIGN KEY (`cn_invoice_id`) REFERENCES `tb_invoices` (`inv_id`),
  CONSTRAINT `fk_cn_client` FOREIGN KEY (`cn_client_id`) REFERENCES `tb_clients` (`client_id`),
  CONSTRAINT `fk_cn_branch` FOREIGN KEY (`cn_branch_id`) REFERENCES `tb_branches` (`branch_id`),
  CONSTRAINT `fk_cn_project` FOREIGN KEY (`cn_project_id`) REFERENCES `tb_projects` (`project_id`),
  CONSTRAINT `fk_cn_currency` FOREIGN KEY (`cn_currency`) REFERENCES `tb_currencies` (`cur_code`),
  CONSTRAINT `fk_cn_refund_bank_account` FOREIGN KEY (`cn_refund_bank_account_id`) REFERENCES `tb_bank_accounts` (`ba_id`),
  CONSTRAINT `fk_cn_refunded_by` FOREIGN KEY (`cn_refunded_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_created_by` FOREIGN KEY (`cn_created_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_issued_by` FOREIGN KEY (`cn_issued_by`) REFERENCES `tb_users` (`user_id`),
  CONSTRAINT `fk_cn_issuer_signature` FOREIGN KEY (`cn_issuer_signature_id`) REFERENCES `tb_user_signatures` (`sig_id`),
  CONSTRAINT `fk_cn_cancelled_by` FOREIGN KEY (`cn_cancelled_by`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- รายการที่ลด — ยอดก่อน VAT ต่อบรรทัด (VAT คิดท้ายใบด้วยอัตราของใบเดิม)
CREATE TABLE `tb_credit_note_lines` (
  `cnl_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cnl_credit_note_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cnl_order` int NOT NULL DEFAULT '0',
  `cnl_description` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cnl_amount` decimal(15,2) NOT NULL DEFAULT '0.00' COMMENT 'ยอดที่ลดก่อน VAT (สกุลของใบ)',
  PRIMARY KEY (`cnl_id`),
  KEY `idx_cnl_credit_note` (`cnl_credit_note_id`,`cnl_order`),
  CONSTRAINT `fk_cnl_credit_note` FOREIGN KEY (`cnl_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ประวัติการอนุมัติ/ตีกลับของใบลดหนี้ — รูปแบบเดียวกับ tb_invoice_approvals
CREATE TABLE `tb_credit_note_approvals` (
  `cna_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cna_credit_note_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_round` int unsigned NOT NULL,
  `cna_level` tinyint unsigned NOT NULL,
  `cna_action` enum('approve','return') COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_user_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_user_name` varchar(101) COLLATE utf8mb4_unicode_ci NOT NULL,
  `cna_role_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ไม่มี FK — role อาจถูกลบภายหลัง ประวัติต้องอยู่',
  `cna_role_name` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cna_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`cna_id`),
  KEY `idx_cna_credit_note` (`cna_credit_note_id`,`cna_round`,`cna_level`),
  KEY `fk_cna_user` (`cna_user_id`),
  CONSTRAINT `fk_cna_credit_note` FOREIGN KEY (`cna_credit_note_id`) REFERENCES `tb_credit_notes` (`cn_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cna_user` FOREIGN KEY (`cna_user_id`) REFERENCES `tb_users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- FK จากตารางเดิมมาตารางกลุ่มนี้ (ตารางเดิมถูกสร้างก่อน จึงเพิ่มทีหลัง)
INSERT INTO tb_currencies (cur_code, cur_name_th, cur_name_en, cur_symbol, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en, cur_subunit_en, cur_bot_unit, cur_sort_order)
VALUES ('THB', 'บาท', 'Thai Baht', '฿', 2, 'บาท', 'สตางค์', 'Baht', 'Satang', 1, 1),
       ('USD', 'ดอลลาร์สหรัฐ', 'US Dollar', '$', 2, 'ดอลลาร์สหรัฐ', 'เซนต์', 'US Dollars', 'Cents', 1, 2);
ALTER TABLE tb_users   ADD CONSTRAINT fk_user_branch FOREIGN KEY (user_branch_id) REFERENCES tb_branches (branch_id);
ALTER TABLE tb_clients ADD CONSTRAINT fk_client_currency FOREIGN KEY (client_currency) REFERENCES tb_currencies (cur_code);
ALTER TABLE tb_tasks   ADD CONSTRAINT fk_task_quotation_item FOREIGN KEY (task_quotation_item_id) REFERENCES tb_quotation_items (qti_id) ON DELETE SET NULL;

-- ข้อมูลเริ่มต้น
INSERT INTO tb_company_settings (cs_id, cs_quotation_terms_th, cs_quotation_terms_en)
VALUES (1, '1. ราคานี้ยังไม่รวมภาษีมูลค่าเพิ่ม (ถ้ามี)
2. ใบเสนอราคานี้มีผลถึงวันที่ระบุ',
        '1. Prices exclude VAT (if applicable).
2. This quotation is valid until the date stated.');
INSERT INTO tb_vat_rates (vr_effective_from, vr_rate, vr_note) VALUES ('2000-01-01', 7.00, 'ค่าเริ่มต้นของระบบ — ตรวจกับนักบัญชี');
INSERT INTO tb_branches (branch_id, branch_code, branch_name_th, branch_name_en) VALUES ('BRA202601010000001', '00000', 'สำนักงานใหญ่', 'Head Office');
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct) VALUES ('QT', 1, 0.00, 0);
INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES ('QT', 1, 'ROL202601010000001');
INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb, al_require_distinct) VALUES ('IV', 1, 0.00, 0);
INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES ('IV', 1, 'ROL202601010000001');

commit;

-- 2026-10-24 P-1 Fastwork: อัตราค่าธรรมเนียมเริ่มต้น (ฉบับจริงอยู่ใน deploy_schema.sql)
ALTER TABLE tb_company_settings ADD COLUMN cs_fastwork_fee_rate decimal(5,2) NOT NULL DEFAULT '17.00' COMMENT 'ค่าธรรมเนียม Fastwork เริ่มต้น (% ของราคางวด) · แก้ได้ทุกรายการ · ตรวจอัตราจริงในบัญชี Fastwork';
ALTER TABLE tb_company_settings ADD COLUMN cs_fastwork_fee_vat_rate decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'VAT ของค่าธรรมเนียม Fastwork (% ของค่าธรรมเนียม) · 0 = ไม่มี';
ALTER TABLE tb_company_settings ADD COLUMN cs_fastwork_wht_rate decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'หัก ณ ที่จ่ายที่ Fastwork หัก (% ของราคางวด) · รอนักบัญชียืนยัน Z2';

-- 2026-10-25 P-3 เงินทุน: วันที่จดบริษัท + เป้าเงินทุน (ฉบับจริงอยู่ใน deploy_schema.sql)
ALTER TABLE tb_company_settings ADD COLUMN cs_incorporated_on date DEFAULT NULL COMMENT 'วันที่จดบริษัท (นิติบุคคล) · ว่าง = ยังเป็นบุคคลธรรมดา (ช่วงก่อนจดบริษัท)';
ALTER TABLE tb_company_settings ADD COLUMN cs_capital_goal decimal(15,2) DEFAULT NULL COMMENT 'เป้าเงินทุนก่อนจดบริษัท · ว่าง = ยังไม่ตั้ง';
ALTER TABLE tb_company_settings ADD COLUMN cs_capital_target_date date DEFAULT NULL COMMENT 'วันที่ตั้งใจจดบริษัท (ไม่บังคับ)';

-- 2026-10-25 ลิงก์เลือกบริการ (ฉบับจริงอยู่ใน deploy_schema.sql)
ALTER TABLE tb_products ADD COLUMN product_is_public tinyint(1) NOT NULL DEFAULT '0' COMMENT 'แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)';
ALTER TABLE tb_products ADD COLUMN product_image_url varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปบนหน้าร้าน (/uploads/catalog/...)';
ALTER TABLE tb_product_packages ADD COLUMN pkg_is_public tinyint(1) NOT NULL DEFAULT '0' COMMENT 'แสดงบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)';
ALTER TABLE tb_product_packages ADD COLUMN pkg_image_url varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'รูปบนหน้าร้าน (/uploads/catalog/...)';
ALTER TABLE tb_company_settings ADD COLUMN cs_service_request_assignee_id varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ผู้รับคำขอบริการเริ่มต้น (ลิงก์ที่ไม่ได้เลือกคนเอง)';

-- ลิงก์เลือกบริการ (2026-10-25 · docs/plans/2026-10-25-client-order-link.md)
-- personal = ลูกค้าตรงรายเดียว (ส่งคำขอได้ครั้งเดียว) · public = ติดหน้าเว็บ/เพจ (หลายคำขอ) · fastwork = ผู้ซื้อบน Fastwork (ไม่มีข้อมูลติดต่อ/การจ่ายเงิน)
-- token = ที่อยู่เต็ม /order/<token> · short_code = ที่อยู่สั้น /o/<code> (ใต้ QR) ชี้ลิงก์เดียวกัน · หมวดที่เปิด: tb_order_link_categories (ไม่มีแถว = ทุกหมวด)
CREATE TABLE IF NOT EXISTS `tb_order_links` (
  `ol_id` int unsigned NOT NULL AUTO_INCREMENT,
  `ol_token` char(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_short_code` char(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_kind` enum('personal','public','fastwork') COLLATE utf8mb4_unicode_ci NOT NULL,
  `ol_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ชื่อเรียกภายใน เช่น หน้าเว็บ เพจ Facebook',
  `ol_client_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'personal: ลูกค้าที่ผูก (ว่าง = ลูกค้าใหม่ยังไม่มีในระบบ)',
  `ol_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'fastwork: งานเดิมที่เพิ่มขอบเขต (ว่าง = ก่อนจ้าง)',
  `ol_buyer_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'fastwork ก่อนจ้าง: ชื่อผู้ซื้อที่แสดงบน Fastwork',
  `ol_assignee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'ผู้รับคำขอจากลิงก์นี้',
  `ol_expires_on` date DEFAULT NULL COMMENT 'วันสุดท้ายที่เปิดได้ (ว่าง = ไม่หมดอายุ)',
  `ol_status` enum('active','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `ol_allow_more` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'ลูกค้าเลือกเพิ่มเองได้ (0 = มีแต่รายการที่ทีมเลือกให้)',
  `ol_created_by` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `olc_category_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`olc_link_id`,`olc_category_id`),
  KEY `fk_olc_category` (`olc_category_id`),
  CONSTRAINT `fk_olc_category` FOREIGN KEY (`olc_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_olc_link` FOREIGN KEY (`olc_link_id`) REFERENCES `tb_order_links` (`ol_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- คำขอบริการที่ลูกค้าส่งจากลิงก์ (2026-10-25) — ชนิดของคำขออ่านจากลิงก์ (ไม่เก็บซ้ำ)
-- submitted = รอตรวจ · converted = ออกใบเสนอราคา/เปิดโปรเจกต์แล้ว (สถานะต่อจากนั้นอ่านจากใบเสนอราคา/โปรเจกต์) · rejected = ปฏิเสธ · closed = ไม่ได้งาน (Fastwork)
-- access_token = หน้าสถานะของลูกค้า /order/r/<token> · submit_key = กันกดส่งซ้ำ (ซ้ำ = ตอบคำขอเดิม)
CREATE TABLE IF NOT EXISTS `tb_service_requests` (
  `svr_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_link_id` int unsigned NOT NULL,
  `svr_access_token` char(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_submit_key` char(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_status` enum('submitted','converted','rejected','closed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'submitted',
  `svr_status_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'เหตุผลปฏิเสธ/ปิด (ภายใน ลูกค้าไม่เห็น)',
  `svr_contact_name` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_contact_line` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_company_name` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_tax_id` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'กรอกเมื่อต้องการใบกำกับในนามบริษัท',
  `svr_address` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_note` varchar(2000) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ข้อความถึงทีมงานจากลูกค้า',
  `svr_consent_at` datetime DEFAULT NULL COMMENT 'เวลายินยอมข้อมูลส่วนบุคคล (ลิงก์ fastwork ไม่เก็บข้อมูลติดต่อ = ว่าง)',
  `svr_vat_rate` decimal(5,2) DEFAULT NULL COMMENT 'อัตรา VAT ที่ลูกค้าเห็นตอนส่ง (ว่าง = ยังไม่จด VAT)',
  `svr_assignee_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svr_client_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ลูกค้าที่ผูกตอนตรวจ (personal ผูกจากลิงก์)',
  `svr_quotation_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svr_project_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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
  `svi_request_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svi_order` smallint unsigned NOT NULL,
  `svi_type` enum('item','heading') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'item',
  `svi_product_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svi_package_id` varchar(18) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `svi_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svi_unit` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
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

-- 2026-10-25 คำถามความต้องการ (ฉบับจริงอยู่ใน deploy_schema.sql)

-- คำถามความต้องการของลิงก์เลือกบริการ (2026-10-25 · S-2) — กลุ่มผูกหมวดสินค้า · กลุ่มทั่วไป (is_general) ถามทุกคำขอ
-- ลูกค้าเลือกสินค้าหมวดไหน ขึ้นกลุ่มที่ผูกหมวดนั้น (กลุ่มเดียวกันขึ้นครั้งเดียว)
CREATE TABLE IF NOT EXISTS `tb_requirement_groups` (
  `rqg_id` int unsigned NOT NULL AUTO_INCREMENT,
  `rqg_name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqg_description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'โน้ตภายใน ลูกค้าไม่เห็น',
  `rqg_customer_intro` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'คำอธิบายที่ลูกค้าเห็นใต้ชื่อกลุ่ม (ทำไมถาม)',
  `rqg_is_general` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'เลิกใช้ 2026-10-26 ใช้ rqg_trigger',
  `rqg_trigger` enum('always','selection','link_only') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'selection' COMMENT 'ถามเมื่อไหร่: ทุกคำขอ / ตามที่ลูกค้าเลือก / เฉพาะลิงก์ที่ถามเพิ่ม',
  `rqg_audience` enum('all','direct','fastwork') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'all' COMMENT 'ชนิดลิงก์ที่ถาม · direct = เฉพาะลูกค้า + สาธารณะ',
  `rqg_sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `rqg_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `rqg_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rqg_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rqg_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_requirement_group_categories` (
  `rgc_group_id` int unsigned NOT NULL,
  `rgc_category_id` varchar(18) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`rgc_group_id`,`rgc_category_id`),
  KEY `fk_rgc_category` (`rgc_category_id`),
  CONSTRAINT `fk_rgc_category` FOREIGN KEY (`rgc_category_id`) REFERENCES `tb_product_categories` (`pc_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rgc_group` FOREIGN KEY (`rgc_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ชนิดคำตอบ: short_text long_text single multi yes_no number date url file · rqq_options = ตัวเลือก (JSON array ของข้อความ) เฉพาะ single/multi
CREATE TABLE IF NOT EXISTS `tb_requirement_questions` (
  `rqq_id` int unsigned NOT NULL AUTO_INCREMENT,
  `rqq_group_id` int unsigned NOT NULL,
  `rqq_text` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqq_help` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ข้อความช่วยใต้คำถาม (ตัวอย่างคำตอบ)',
  `rqq_placeholder` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ตัวอย่างคำตอบในช่อง',
  `rqq_type` enum('short_text','long_text','single','multi','yes_no','number','date','url','file') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `rqq_options` json DEFAULT NULL,
  `rqq_allow_other` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'single/multi: มีตัวเลือก อื่นๆ (ระบุ)',
  `rqq_unit` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'number: หน่วย เช่น หน้าจอ',
  `rqq_min` decimal(12,2) DEFAULT NULL COMMENT 'number: ค่าต่ำสุด',
  `rqq_max` decimal(12,2) DEFAULT NULL COMMENT 'number: ค่าสูงสุด',
  `rqq_future_only` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'date: ต้องเป็นวันหลังวันนี้',
  `rqq_file_kind` enum('document','design') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'document' COMMENT 'file: document = รูป/PDF 10 MB · design = เพิ่ม AI PSD SVG ZIP 20 MB ดาวน์โหลดเท่านั้น',
  `rqq_is_required` tinyint(1) NOT NULL DEFAULT '0',
  `rqq_parent_id` int unsigned DEFAULT NULL COMMENT 'ถามเมื่อข้อนี้ (ข้อแม่) ตอบตรง rqq_parent_values',
  `rqq_parent_values` json DEFAULT NULL COMMENT 'คำตอบของข้อแม่ที่ทำให้ถามข้อนี้ (yes_no = yes/no)',
  `rqq_audience` enum('group','direct','fastwork') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'group' COMMENT 'ชนิดลิงก์ที่ถาม · group = ตามกลุ่ม',
  `rqq_skip_when_preset` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ไม่ถามเมื่อทีมงานเลือกรายการให้แล้ว (ราคาตกลงแล้ว)',
  `rqq_prefill` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ลิงก์เฉพาะลูกค้า: เติมคำตอบล่าสุดของลูกค้าคนนี้',
  `rqq_sort_order` smallint unsigned NOT NULL DEFAULT '0',
  `rqq_status` enum('active','inactive') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `rqq_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `rqq_updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`rqq_id`),
  KEY `idx_rqq_group` (`rqq_group_id`,`rqq_sort_order`),
  KEY `fk_rqq_parent` (`rqq_parent_id`),
  CONSTRAINT `fk_rqq_group` FOREIGN KEY (`rqq_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rqq_parent` FOREIGN KEY (`rqq_parent_id`) REFERENCES `tb_requirement_questions` (`rqq_id`) ON DELETE RESTRICT
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
  `sva_other_text` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ข้อความที่ลูกค้าพิมพ์ใน อื่นๆ (ระบุ)',
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
  `svf_file_path` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svf_original_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `svf_size` int unsigned NOT NULL,
  `svf_created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`svf_id`),
  KEY `idx_svf_answer` (`svf_answer_id`),
  CONSTRAINT `fk_svf_answer` FOREIGN KEY (`svf_answer_id`) REFERENCES `tb_service_request_answers` (`sva_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2026-10-25 หน้าร้านตรงกับของที่ขาย
ALTER TABLE tb_product_categories ADD COLUMN pc_is_single_choice tinyint(1) NOT NULL DEFAULT '0' COMMENT 'ลูกค้าเลือกได้รายการเดียวในหมวดนี้ เช่น แพ็กเกจ (ใส่อันใหม่ = แทนอันเดิมในตะกร้า)' AFTER pc_status;
ALTER TABLE tb_products ADD COLUMN product_price_mode enum('fixed','percent') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fixed' COMMENT 'percent = คิดเป็น % ของยอดรายการอื่นก่อน VAT เช่น งานด่วน +30%' AFTER product_is_public;
ALTER TABLE tb_products ADD COLUMN product_percent decimal(5,2) DEFAULT NULL COMMENT 'percent: อัตรา % (ไม่ใช้ product_price)' AFTER product_price_mode;

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

CREATE TABLE IF NOT EXISTS `tb_requirement_group_products` (
  `rgr_group_id` int unsigned NOT NULL,
  `rgr_product_id` varchar(18) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`rgr_group_id`,`rgr_product_id`),
  KEY `fk_rgr_product` (`rgr_product_id`),
  CONSTRAINT `fk_rgr_group` FOREIGN KEY (`rgr_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rgr_product` FOREIGN KEY (`rgr_product_id`) REFERENCES `tb_products` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tb_order_link_requirement_groups` (
  `olq_link_id` int unsigned NOT NULL,
  `olq_group_id` int unsigned NOT NULL,
  `olq_mode` enum('include','exclude') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`olq_link_id`,`olq_group_id`),
  KEY `fk_olq_group` (`olq_group_id`),
  CONSTRAINT `fk_olq_group` FOREIGN KEY (`olq_group_id`) REFERENCES `tb_requirement_groups` (`rqg_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_olq_link` FOREIGN KEY (`olq_link_id`) REFERENCES `tb_order_links` (`ol_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
