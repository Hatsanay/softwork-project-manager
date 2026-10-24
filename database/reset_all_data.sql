-- ════════════════════════════════════════════════════════════════════════════════
-- ล้างข้อมูลทั้งหมดของ Softwork แล้วตั้งต้นใหม่ (ผู้ใช้สั่ง 18 ต.ค. 2026) — ย้อนกลับไม่ได้
-- ไฟล์เดียวจบ: ล้างทุกตาราง → ใส่ค่าเริ่มต้นที่ระบบต้องใช้ → สร้างผู้ใช้ admin
-- ════════════════════════════════════════════════════════════════════════════════
-- ก่อนรัน:
--   1. สำรองฐานข้อมูล production (mysqldump / Plesk backup) เก็บไว้นอกเซิร์ฟเวอร์
--   2. โครงสร้างต้องเป็นเวอร์ชันล่าสุด (deploy 18 ต.ค. 2026 · 93 ตาราง)
--   3. @confirm_database ด้านล่าง = ชื่อฐานข้อมูล production (dktimeh_softwork_pm_db) — รันบนฐานอื่นจะหยุดเอง
-- หลังรัน:
--   - เข้าระบบ admin / 12345678 → ระบบบังคับตั้งรหัสผ่านใหม่และยืนยันอีเมลทันที
--   - ตั้งค่าบริษัทใหม่ (ชื่อ เลขผู้เสียภาษี โลโก้ บัญชีธนาคาร สาขา แผนก role)
--   - ลบไฟล์ใน backend/uploads/ และ backend/storage/ บนเซิร์ฟเวอร์เอง (SQL ลบไฟล์ไม่ได้)
--
-- กันรันผิดฐาน: ชื่อไม่ตรง = หยุดที่ error "Subquery returns more than 1 row" ก่อนลบอะไร

SET @confirm_database = 'dktimeh_softwork_pm_db';
SELECT IF(DATABASE() = @confirm_database, 1, (SELECT 1 UNION SELECT 2)) AS database_confirmed;

-- ─── 1. ล้างทุกตาราง ─────────────────────────────────────────────────────────────────────
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE `tb_approval_level_roles`;
TRUNCATE TABLE `tb_approval_levels`;
TRUNCATE TABLE `tb_attendance_corrections`;
TRUNCATE TABLE `tb_attendance_locations`;
TRUNCATE TABLE `tb_attendance_punches`;
TRUNCATE TABLE `tb_audit_logs`;
TRUNCATE TABLE `tb_bank_accounts`;
TRUNCATE TABLE `tb_billing_note_invoices`;
TRUNCATE TABLE `tb_billing_notes`;
TRUNCATE TABLE `tb_branches`;
TRUNCATE TABLE `tb_clients`;
TRUNCATE TABLE `tb_company_holidays`;
TRUNCATE TABLE `tb_company_settings`;
TRUNCATE TABLE `tb_credit_note_approvals`;
TRUNCATE TABLE `tb_credit_note_lines`;
TRUNCATE TABLE `tb_credit_notes`;
TRUNCATE TABLE `tb_currencies`;
TRUNCATE TABLE `tb_department`;
TRUNCATE TABLE `tb_document_sequences`;
TRUNCATE TABLE `tb_email_otps`;
TRUNCATE TABLE `tb_employee_cards`;
TRUNCATE TABLE `tb_employee_codes`;
TRUNCATE TABLE `tb_employee_schedules`;
TRUNCATE TABLE `tb_employee_compensations`;
TRUNCATE TABLE `tb_employee_recurring_items`;
TRUNCATE TABLE `tb_employee_tax_profiles`;
TRUNCATE TABLE `tb_employees`;
TRUNCATE TABLE `tb_error_logs`;
TRUNCATE TABLE `tb_exchange_rates`;
TRUNCATE TABLE `tb_expense_approvals`;
TRUNCATE TABLE `tb_expense_attachments`;
TRUNCATE TABLE `tb_expense_categories`;
TRUNCATE TABLE `tb_expense_lines`;
TRUNCATE TABLE `tb_expenses`;
TRUNCATE TABLE `tb_income_tax_brackets`;
TRUNCATE TABLE `tb_income_tax_years`;
TRUNCATE TABLE `tb_invoice_approvals`;
TRUNCATE TABLE `tb_invoice_items`;
TRUNCATE TABLE `tb_invoice_milestones`;
TRUNCATE TABLE `tb_invoices`;
TRUNCATE TABLE `tb_labor_cost_allocations`;
TRUNCATE TABLE `tb_leave_attachments`;
TRUNCATE TABLE `tb_leave_requests`;
TRUNCATE TABLE `tb_leave_types`;
TRUNCATE TABLE `tb_login_logs`;
TRUNCATE TABLE `tb_maxID`;
TRUNCATE TABLE `tb_payment_allocations`;
TRUNCATE TABLE `tb_payments`;
TRUNCATE TABLE `tb_payroll_approvals`;
TRUNCATE TABLE `tb_payroll_item_lines`;
TRUNCATE TABLE `tb_overtime_requests`;
TRUNCATE TABLE `tb_payroll_items`;
TRUNCATE TABLE `tb_payroll_runs`;
TRUNCATE TABLE `tb_payroll_settings`;
TRUNCATE TABLE `tb_product_categories`;
TRUNCATE TABLE `tb_product_package_items`;
TRUNCATE TABLE `tb_product_packages`;
TRUNCATE TABLE `tb_products`;
TRUNCATE TABLE `tb_project_chat_images`;
TRUNCATE TABLE `tb_project_chat_messages`;
TRUNCATE TABLE `tb_project_chat_reads`;
TRUNCATE TABLE `tb_project_labels`;
TRUNCATE TABLE `tb_project_member_positions`;
TRUNCATE TABLE `tb_project_members`;
TRUNCATE TABLE `tb_project_positions`;
TRUNCATE TABLE `tb_projects`;
TRUNCATE TABLE `tb_quotation_approvals`;
TRUNCATE TABLE `tb_quotation_items`;
TRUNCATE TABLE `tb_quotation_milestones`;
TRUNCATE TABLE `tb_quotations`;
TRUNCATE TABLE `tb_receipt_allocations`;
TRUNCATE TABLE `tb_receipts`;
TRUNCATE TABLE `tb_roles`;
TRUNCATE TABLE `tb_sso_rates`;
TRUNCATE TABLE `tb_task_activity_log`;
TRUNCATE TABLE `tb_task_assignees`;
TRUNCATE TABLE `tb_task_chat_images`;
TRUNCATE TABLE `tb_task_chat_messages`;
TRUNCATE TABLE `tb_task_chat_reads`;
TRUNCATE TABLE `tb_task_checklist_items`;
TRUNCATE TABLE `tb_task_issue_images`;
TRUNCATE TABLE `tb_task_issue_replies`;
TRUNCATE TABLE `tb_task_issue_reply_images`;
TRUNCATE TABLE `tb_task_issue_reply_reads`;
TRUNCATE TABLE `tb_task_issue_tags`;
TRUNCATE TABLE `tb_task_issues`;
TRUNCATE TABLE `tb_task_labels`;
TRUNCATE TABLE `tb_tasks`;
TRUNCATE TABLE `tb_timesheet_entries`;
TRUNCATE TABLE `tb_timesheet_weeks`;
TRUNCATE TABLE `tb_user_signatures`;
TRUNCATE TABLE `tb_users`;
TRUNCATE TABLE `tb_vat_rates`;
TRUNCATE TABLE `tb_vendors`;
TRUNCATE TABLE `tb_wfh_requests`;
TRUNCATE TABLE `tb_wht_certificate_lines`;
TRUNCATE TABLE `tb_wht_certificates`;
TRUNCATE TABLE `tb_wht_income_types`;
TRUNCATE TABLE `tb_wht_rates`;
TRUNCATE TABLE `tb_work_schedules`;
SET FOREIGN_KEY_CHECKS = 1;

-- ─── 2. ค่าเริ่มต้นที่ระบบต้องใช้ (ชุดเดียวกับ deploy_schema.sql · ใส่เฉพาะตอนตารางว่าง) ─────────────
-- ─── ส่วนที่ 4: เติม foreign key ที่ยังขาด (รวม FK ย้อนกลับ tb_roles -> tb_users ที่สร้างพร้อมตารางไม่ได้) ──
-- สกุลเงินเริ่มต้น THB + USD (2026-10-13) — ต้องมีก่อนเพิ่ม FK สกุลเงินของลูกค้า (ลูกค้าเดิมทุกรายได้ค่าเริ่มต้น THB)
-- ใส่เฉพาะตอนตารางยังว่าง · ข้อมูลเริ่มต้นอื่นอยู่ส่วนที่ 5
INSERT INTO tb_currencies (cur_code, cur_name_th, cur_name_en, cur_symbol, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en, cur_subunit_en, cur_bot_unit, cur_sort_order)
SELECT 'THB', 'บาท', 'Thai Baht', '฿', 2, 'บาท', 'สตางค์', 'Baht', 'Satang', 1, 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_currencies)
UNION ALL
SELECT 'USD', 'ดอลลาร์สหรัฐ', 'US Dollar', '$', 2, 'ดอลลาร์สหรัฐ', 'เซนต์', 'US Dollars', 'Cents', 1, 2
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_currencies);

-- ─── ส่วนที่ 5: ข้อมูลเริ่มต้น (ใส่เฉพาะตอนตารางยังว่างเท่านั้น) ─────────────────────────────────
-- ตั้งใจเช็ค "ตารางว่าง" ไม่ใช่ "ไม่มีแถวนี้" — ถ้าแอดมินลบ/เปลี่ยนบัญชีเริ่มต้นไปแล้วบน production
-- ห้ามสร้างบัญชีที่รู้รหัสผ่านกลับขึ้นมาใหม่เองตอน deploy

-- role Admin เปิดทุกบิต (54 บิต) — role ระบบ (S) ได้สิทธิ์ครบเสมออยู่แล้วไม่ว่าสตริงจะยาวเท่าไร (effectiveRolePermission)
-- role อื่นที่สตริงสั้นกว่าจำนวนบิตปัจจุบัน ถือว่าบิตใหม่ = 0 (ไม่ได้สิทธิ์ใหม่เอง ต้องมีคนติ๊กให้)
INSERT INTO tb_roles (role_id, role_name, role_permission, role_type)
SELECT 'ROL202601010000001', 'Admin', '111111111111111111111111111111111111111111111111111111', 'S'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tb_roles);

-- ผู้ใช้คนแรก: admin (หรือ admin@softwork.local) / 12345678 — ระบบบังคับตั้งรหัสผ่านใหม่และยืนยันอีเมลตอน login ครั้งแรก
-- (2026-10-12, risk-fixes R23: เดิมเป็น FALSE ทำให้ระบบที่ติดตั้งใหม่ใช้รหัสที่ทุกคนรู้ได้ตลอด · มีผลเฉพาะฐานข้อมูลว่าง)
INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
SELECT 'USE202601010000001', 'admin', 'admin@softwork.local', '$2a$10$c.pMl9q9oBkJOWVVK/X4ueNwkFGmy7irVGtw4.Q/RMMvjMVtg6YFa',
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
-- วันเริ่มใช้ลงเวลา = วันที่ deploy (เฉพาะตอนยังว่างและยังไม่มีการกดเลย — ไม่ทับที่ฝ่ายบุคคลตั้งเอง)
UPDATE tb_payroll_settings SET ps_attendance_start_date = CURDATE()
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

-- ─── 3. ตรวจผล ─────────────────────────────────────────────────────────────────────────
SELECT u.user_username, u.user_email, r.role_name, r.role_type, u.user_must_change_password,
       (SELECT COUNT(*) FROM tb_users) AS users, (SELECT COUNT(*) FROM tb_branches) AS branches,
       (SELECT COUNT(*) FROM tb_currencies) AS currencies, (SELECT COUNT(*) FROM tb_clients) AS clients,
       (SELECT COUNT(*) FROM tb_employees) AS employees
FROM tb_users u JOIN tb_roles r ON r.role_id = u.user_role_id;
