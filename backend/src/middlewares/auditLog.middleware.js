// ─── Audit log: บันทึกการใช้งานระบบอย่างละเอียดเพื่อตรวจสอบย้อนหลัง (2026-10-08) ───────────────────────
//
// อ้างอิง OWASP Logging Cheat Sheet + ISO/IEC 27001 A.8.15: บันทึก "ใคร ทำอะไร กับข้อมูลไหน เมื่อไหร่ จากที่ไหน ผลเป็นอย่างไร"
// ต่อยอดจาก audit middleware ของระบบ fasttiw (tiwwai) ที่ใช้งานจริง และเพิ่มสิ่งที่ fasttiw ไม่มี:
//   - ค่าก่อน/หลังรายฟิลด์ (diff) ของแถวที่ถูกสร้าง/แก้/ลบ — อ่านแถวจาก DB ก่อนคำขอทำงาน แล้วอ่านซ้ำหลังทำงานเสร็จ
//   - บิตสิทธิ์ (role/ตำแหน่ง) แปลเป็นชื่อสิทธิ์ที่ "ได้เพิ่ม/ถูกถอน" ไม่ใช่สตริง 0/1 ที่คนอ่านไม่ออก
//   - คำขอที่ถูกปฏิเสธ (401/403/429) ทุก method, การเปิดดูข้อมูลสำคัญ (ข้อมูลผู้ใช้ / log / ลิงก์ลูกค้า)
//   - request id (ตรงกับ header X-Request-Id และ error log), โปรเจกต์ที่เกี่ยวข้อง, เวลาที่ใช้ของคำขอ
//
// ทำเป็น middleware ตัวเดียวโดยตั้งใจ (เหตุผลเดียวกับ fasttiw): ครอบคลุม 100% ตั้งแต่วันแรก endpoint ใหม่ถูกบันทึกเอง
// ไม่ต้องจำไปใส่ทีละ controller — แค่เพิ่มแถวใน ENTITIES ถ้าอยากได้ diff/ชื่อการกระทำที่อ่านง่ายของ endpoint นั้น
//
// **กฎเหล็ก**
//   - ห้ามเก็บความลับ: รหัสผ่าน/token/OTP/cookie/รหัสผ่านชั่วคราว → "[ปิดบัง]" ทั้งใน payload และ diff
//   - บันทึกไม่สำเร็จต้องไม่ทำให้คำขอของผู้ใช้พัง: เขียนหลัง response ส่งไปแล้ว (res "finish") + จับ error ทุกตัว
//   - ไม่มี endpoint แก้/ลบ log — log ที่ลบได้จากหน้าเว็บไม่ใช่ร่องรอย
const crypto = require("crypto");
const pool = require("../config/db");
const { verifyToken } = require("../utils/jwt");
const { PERMISSION_KEYS } = require("../utils/permissions");
const { PROJECT_PERMISSION_KEYS } = require("../utils/projectPermissions");

const SECRET_KEYS = /password|token|otp|secret|authorization|cookie|code_hash/i;
const MAX_PAYLOAD_CHARS = 8000;
const MASK = "[ปิดบัง]";

// คอลัมน์ที่ไม่เอาเข้า diff: ความลับ (ไม่ต้องรู้ว่าเปลี่ยนเป็นอะไร แค่รู้ว่า "เปลี่ยน" ก็พอ) และเวลาที่ DB อัปเดตเอง
const HIDDEN_COLUMNS = new Set(["user_password"]);
const IGNORED_COLUMNS = /_updated?_at$/; // *_updated_at และ role_update_at (tb_roles สะกดต่างจากตารางอื่น)

// ─── นิยามข้อมูลแต่ละชนิด: path → ตาราง/คีย์ เพื่ออ่านค่าก่อน/หลัง + ชื่อการกระทำภาษาไทย ─────────────────
// pattern เทียบกับ path หลังตัด "/api/V1" · id: "1" = กลุ่มที่ 1 ของ regex, "self" = ผู้ใช้ที่ login อยู่,
// "response:xxx" = อ่านจาก JSON ที่ตอบกลับ (คำขอสร้างข้อมูลใหม่ที่ยังไม่มี id ตอนเริ่ม) · "fixed:xxx" = id ตายตัว (ตารางแถวเดียว)
// เรียงจากเจาะจงไปกว้าง — ตัวแรกที่ตรงชนะ
const ENTITIES = [
    // ลายเซ็น (2026-10-13) — ไม่เก็บรูปใน log (R8) แค่ชื่อการกระทำ · /users/me/signature ต้องมาก่อน /users/:id/signature
    { re: /^\/users\/me\/signature$/, type: "signature", label: { PUT: "ตั้งลายเซ็นของตัวเอง", DELETE: "ยกเลิกลายเซ็นของตัวเอง" } },
    { re: /^\/users\/([^/]+)\/signature$/, type: "signature", label: { DELETE: "ยกเลิกลายเซ็นของผู้ใช้" } },
    { re: /^\/users\/me\/password$/, type: "user", table: "tb_users", pk: "user_id", id: "self", label: { PUT: "เปลี่ยนรหัสผ่านของตัวเอง" } },
    { re: /^\/users\/me\/image$/, type: "user", table: "tb_users", pk: "user_id", id: "self", label: { PUT: "เปลี่ยนรูปโปรไฟล์ของตัวเอง" } },
    { re: /^\/users\/me\/email\/otp$/, type: "user", table: "tb_users", pk: "user_id", id: "self", label: { POST: "ขอรหัส OTP ยืนยันอีเมล" } },
    { re: /^\/users\/me\/email\/verify$/, type: "user", table: "tb_users", pk: "user_id", id: "self", label: { POST: "ยืนยันอีเมลด้วย OTP" } },
    { re: /^\/users\/me$/, type: "user", table: "tb_users", pk: "user_id", id: "self", label: { PUT: "แก้ไขโปรไฟล์ของตัวเอง" } },
    { re: /^\/users\/([^/]+)\/reset-password$/, type: "user", table: "tb_users", pk: "user_id", id: "1", label: { PUT: "รีเซ็ตรหัสผ่านผู้ใช้งาน" } },
    { re: /^\/users\/([^/]+)\/image$/, type: "user", table: "tb_users", pk: "user_id", id: "1", label: { PUT: "เปลี่ยนรูปโปรไฟล์ผู้ใช้งาน" } },
    { re: /^\/users\/([^/]+)$/, type: "user", table: "tb_users", pk: "user_id", id: "1", label: { PUT: "แก้ไขผู้ใช้งาน", DELETE: "ลบผู้ใช้งาน", GET: "ดูข้อมูลผู้ใช้งาน" } },
    { re: /^\/users$/, type: "user", table: "tb_users", pk: "user_id", id: "response:user_id", label: { POST: "สร้างผู้ใช้งาน", GET: "ดูรายชื่อผู้ใช้งาน" } },

    { re: /^\/roles\/([^/]+)$/, type: "role", table: "tb_roles", pk: "role_id", id: "1", label: { PUT: "แก้ไขสิทธิ์ (role)", DELETE: "ลบสิทธิ์ (role)" } },
    { re: /^\/roles$/, type: "role", table: "tb_roles", pk: "role_id", id: "response:role_id", label: { POST: "สร้างสิทธิ์ (role)" } },
    { re: /^\/departments\/([^/]+)$/, type: "department", table: "tb_department", pk: "dep_id", id: "1", label: { PUT: "แก้ไขแผนก", DELETE: "ลบแผนก" } },
    { re: /^\/departments$/, type: "department", table: "tb_department", pk: "dep_id", id: "response:dep_id", label: { POST: "สร้างแผนก" } },
    { re: /^\/project-positions\/([^/]+)$/, type: "project_position", table: "tb_project_positions", pk: "position_id", id: "1", label: { PUT: "แก้ไขตำแหน่งในโปรเจกต์", DELETE: "ลบตำแหน่งในโปรเจกต์" } },
    { re: /^\/project-positions$/, type: "project_position", table: "tb_project_positions", pk: "position_id", id: "response:position_id", label: { POST: "สร้างตำแหน่งในโปรเจกต์" } },
    { re: /^\/clients\/([^/]+)$/, type: "client", table: "tb_clients", pk: "client_id", id: "1", label: { PUT: "แก้ไขลูกค้า", DELETE: "ลบลูกค้า" } },
    { re: /^\/clients$/, type: "client", table: "tb_clients", pk: "client_id", id: "response:client_id", label: { POST: "สร้างลูกค้า" } },

    { re: /^\/projects\/([^/]+)\/members\/([^/]+)$/, type: "project_member", table: "tb_project_members", pk: "project_member_id", id: "2", project: "1", label: { PUT: "แก้ไขตำแหน่งสมาชิกโปรเจกต์", DELETE: "นำสมาชิกออกจากโปรเจกต์" } },
    { re: /^\/projects\/([^/]+)\/members$/, type: "project_member", table: "tb_project_members", pk: "project_member_id", id: "response:project_member_id", project: "1", label: { POST: "เพิ่มสมาชิกโปรเจกต์" } },
    { re: /^\/projects\/([^/]+)\/tasks\/([^/]+)\/status$/, type: "task", table: "tb_tasks", pk: "task_id", id: "2", project: "1", label: { PUT: "เปลี่ยนสถานะงาน" } },
    { re: /^\/projects\/([^/]+)\/tasks\/([^/]+)\/claim$/, type: "task", table: "tb_tasks", pk: "task_id", id: "2", project: "1", label: { POST: "รับงานด้วยตัวเอง (Agile)" } },
    { re: /^\/projects\/([^/]+)\/tasks\/([^/]+)\/issues$/, type: "issue", table: "tb_task_issues", pk: "issue_id", id: "response:issue_id", project: "1", label: { POST: "แจ้งปัญหา" } },
    { re: /^\/projects\/([^/]+)\/tasks\/([^/]+)\/chat$/, type: "task_chat", table: "tb_task_chat_messages", pk: "message_id", id: "response:message_id", project: "1", label: { POST: "ส่งข้อความแชทในงาน" } },
    { re: /^\/projects\/([^/]+)\/tasks\/([^/]+)$/, type: "task", table: "tb_tasks", pk: "task_id", id: "2", project: "1", label: { PUT: "แก้ไขงาน", DELETE: "ลบงาน" } },
    { re: /^\/projects\/([^/]+)\/tasks$/, type: "task", table: "tb_tasks", pk: "task_id", id: "response:task_id", project: "1", label: { POST: "สร้างงาน" } },
    { re: /^\/projects\/([^/]+)\/issues\/([^/]+)\/status$/, type: "issue", table: "tb_task_issues", pk: "issue_id", id: "2", project: "1", label: { PUT: "เปลี่ยนสถานะปัญหา" } },
    { re: /^\/projects\/([^/]+)\/issues\/([^/]+)\/replies$/, type: "issue_reply", table: "tb_task_issue_replies", pk: "reply_id", id: "response:reply_id", project: "1", label: { POST: "ตอบกลับปัญหา" } },
    { re: /^\/projects\/([^/]+)\/issues\/([^/]+)$/, type: "issue", table: "tb_task_issues", pk: "issue_id", id: "2", project: "1", label: { PUT: "แก้ไขปัญหา", DELETE: "ลบปัญหา" } },
    { re: /^\/projects\/([^/]+)\/chat$/, type: "project_chat", table: "tb_project_chat_messages", pk: "message_id", id: "response:message_id", project: "1", label: { POST: "ส่งข้อความแชทโปรเจกต์" } },
    { re: /^\/projects\/([^/]+)\/share\/regenerate$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "สร้างลิงก์ลูกค้าใหม่ (ลิงก์เก่าใช้ไม่ได้)" } },
    { re: /^\/projects\/([^/]+)\/share\/toggle$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "เปิด/ปิดลิงก์ลูกค้า" } },
    { re: /^\/projects\/([^/]+)\/share\/send-email$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { POST: "ส่งลิงก์ลูกค้าทางอีเมล" } },
    { re: /^\/projects\/([^/]+)\/task-weight\/toggle$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "เปิด/ปิดน้ำหนักงาน" } },
    { re: /^\/projects\/([^/]+)\/cancel$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "ยกเลิกโปรเจกต์" } },
    { re: /^\/projects\/([^/]+)\/reactivate$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "กู้คืนโปรเจกต์" } },
    { re: /^\/projects\/([^/]+)$/, type: "project", table: "tb_projects", pk: "project_id", id: "1", project: "1", label: { PUT: "แก้ไขโปรเจกต์", DELETE: "ลบโปรเจกต์" } },
    { re: /^\/projects$/, type: "project", table: "tb_projects", pk: "project_id", id: "response:project_id", project: "response:project_id", label: { POST: "สร้างโปรเจกต์" } },

    // ตั้งค่าบริษัท (2026-10-13) — กติกาอนุมัติบันทึกทั้งชุด ไม่มีแถวเดียวให้เทียบ diff จึงเก็บแค่ payload
    { re: /^\/company\/logo$/, type: "company", table: "tb_company_settings", pk: "cs_id", id: "fixed:1", label: { POST: "เปลี่ยนโลโก้บริษัท", DELETE: "ลบโลโก้บริษัท" } },
    { re: /^\/company\/vat-rates\/([^/]+)$/, type: "vat_rate", table: "tb_vat_rates", pk: "vr_effective_from", id: "1", label: { DELETE: "ลบอัตรา VAT ที่ยังไม่มีผล" } },
    { re: /^\/company\/vat-rates$/, type: "vat_rate", table: "tb_vat_rates", pk: "vr_effective_from", id: "response:vr_effective_from", label: { POST: "เพิ่มอัตรา VAT" } },
    { re: /^\/company\/branches\/([^/]+)$/, type: "branch", table: "tb_branches", pk: "branch_id", id: "1", label: { PUT: "แก้ไขสาขา" } },
    { re: /^\/company\/branches$/, type: "branch", table: "tb_branches", pk: "branch_id", id: "response:branch_id", label: { POST: "เพิ่มสาขา" } },
    { re: /^\/company\/bank-accounts\/([^/]+)$/, type: "bank_account", table: "tb_bank_accounts", pk: "ba_id", id: "1", label: { PUT: "แก้ไขบัญชีธนาคาร" } },
    { re: /^\/company\/bank-accounts$/, type: "bank_account", table: "tb_bank_accounts", pk: "ba_id", id: "response:ba_id", label: { POST: "เพิ่มบัญชีธนาคาร" } },
    { re: /^\/company\/currencies\/([^/]+)$/, type: "currency", table: "tb_currencies", pk: "cur_code", id: "1", label: { PUT: "แก้ไขสกุลเงิน" } },
    { re: /^\/company\/currencies$/, type: "currency", table: "tb_currencies", pk: "cur_code", id: "response:cur_code", label: { POST: "เพิ่มสกุลเงิน" } },
    { re: /^\/company\/approval-levels$/, type: "approval_rules", label: { PUT: "แก้ไขกติกาอนุมัติเอกสาร" } }, // ประเภทเอกสารอยู่ใน payload (doc_type)
    { re: /^\/company$/, type: "company", table: "tb_company_settings", pk: "cs_id", id: "fixed:1", label: { PUT: "แก้ไขข้อมูลบริษัท" } },

    // สินค้า/บริการ หมวดหมู่ ชุดรายการ (2026-10-13)
    { re: /^\/products\/([^/]+)$/, type: "product", table: "tb_products", pk: "product_id", id: "1", label: { PUT: "แก้ไขสินค้า/บริการ", DELETE: "ลบสินค้า/บริการ" } },
    { re: /^\/products$/, type: "product", table: "tb_products", pk: "product_id", id: "response:product_id", label: { POST: "เพิ่มสินค้า/บริการ" } },
    { re: /^\/product-categories\/([^/]+)$/, type: "product_category", table: "tb_product_categories", pk: "pc_id", id: "1", label: { PUT: "แก้ไขหมวดสินค้า", DELETE: "ลบหมวดสินค้า" } },
    { re: /^\/product-categories$/, type: "product_category", table: "tb_product_categories", pk: "pc_id", id: "response:pc_id", label: { POST: "เพิ่มหมวดสินค้า" } },
    { re: /^\/product-packages\/([^/]+)$/, type: "product_package", table: "tb_product_packages", pk: "pkg_id", id: "1", label: { PUT: "แก้ไขชุดรายการ", DELETE: "ลบชุดรายการ" } },
    { re: /^\/product-packages$/, type: "product_package", table: "tb_product_packages", pk: "pkg_id", id: "response:pkg_id", label: { POST: "เพิ่มชุดรายการ" } },

    // ใบเสนอราคา (2026-10-13) — ตารางลูก (รายการ/งวด) บันทึกพร้อมหัวเอกสาร diff ดูที่หัวเอกสาร
    { re: /^\/quotations\/([^/]+)\/submit$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "ส่งใบเสนอราคาขออนุมัติ" } },
    { re: /^\/quotations\/([^/]+)\/approve$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "อนุมัติใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/return$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "ตีกลับใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/send$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "บันทึกว่าส่งใบเสนอราคาให้ลูกค้าแล้ว" } },
    { re: /^\/quotations\/([^/]+)\/accept$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "บันทึกว่าลูกค้าตอบรับใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/decline$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "บันทึกว่าลูกค้าปฏิเสธใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/cancel$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { POST: "ยกเลิกใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/revise$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "response:qt_id", label: { POST: "ออก revision ใบเสนอราคา" } },
    { re: /^\/quotations\/([^/]+)\/copy$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "response:qt_id", label: { POST: "คัดลอกเป็นใบเสนอราคาใหม่" } },
    { re: /^\/quotations\/([^/]+)$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "1", label: { PUT: "แก้ร่างใบเสนอราคา", DELETE: "ลบร่างใบเสนอราคา" } },
    { re: /^\/quotations$/, type: "quotation", table: "tb_quotations", pk: "qt_id", id: "response:qt_id", label: { POST: "สร้างร่างใบเสนอราคา" } },

    // ใบแจ้งหนี้ (2026-10-14 ช่วง 1B) — รายการ/งวดที่ผูกบันทึกพร้อมหัวเอกสาร diff ดูที่หัวเอกสาร
    { re: /^\/invoices\/([^/]+)\/issue$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "ออกใบแจ้งหนี้" } },
    { re: /^\/invoices\/([^/]+)\/submit$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "ส่งใบแจ้งหนี้ขออนุมัติ" } },
    { re: /^\/invoices\/([^/]+)\/approve$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "อนุมัติใบแจ้งหนี้" } },
    { re: /^\/invoices\/([^/]+)\/return$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "ตีกลับใบแจ้งหนี้" } },
    { re: /^\/invoices\/([^/]+)\/send$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "บันทึกว่าส่งใบแจ้งหนี้ให้ลูกค้าแล้ว" } },
    { re: /^\/invoices\/([^/]+)\/cancel$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { POST: "ยกเลิกใบแจ้งหนี้" } },
    { re: /^\/invoices\/([^/]+)\/reissue$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "response:inv_id", label: { POST: "ยกเลิกแล้วออกใบแจ้งหนี้ใหม่แทน" } },
    { re: /^\/invoices\/([^/]+)$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "1", label: { PUT: "แก้ร่างใบแจ้งหนี้", DELETE: "ลบร่างใบแจ้งหนี้" } },
    { re: /^\/invoices$/, type: "invoice", table: "tb_invoices", pk: "inv_id", id: "response:inv_id", label: { POST: "สร้างร่างใบแจ้งหนี้" } },

    // ใบวางบิล (2026-10-15 ขั้น 1B-4) — รายการใบแจ้งหนี้ที่รวมบันทึกพร้อมหัวเอกสาร diff ดูที่หัวเอกสาร
    { re: /^\/billing-notes\/([^/]+)\/issue$/, type: "billing_note", table: "tb_billing_notes", pk: "bn_id", id: "1", label: { POST: "ออกใบวางบิล" } },
    { re: /^\/billing-notes\/([^/]+)\/cancel$/, type: "billing_note", table: "tb_billing_notes", pk: "bn_id", id: "1", label: { POST: "ยกเลิกใบวางบิล" } },
    { re: /^\/billing-notes\/([^/]+)$/, type: "billing_note", table: "tb_billing_notes", pk: "bn_id", id: "1", label: { PUT: "แก้ร่างใบวางบิล", DELETE: "ลบร่างใบวางบิล" } },
    { re: /^\/billing-notes$/, type: "billing_note", table: "tb_billing_notes", pk: "bn_id", id: "response:bn_id", label: { POST: "สร้างร่างใบวางบิล" } },

    { re: /^\/(logs|audit-logs|error-logs)(\/[^/]+)?$/, type: "log", label: { GET: "เปิดดู log ของระบบ", DELETE: "ลบ log" } },
    { re: /^\/share\/([^/]+)$/, type: "project", table: "tb_projects", pk: "project_share_token", label: { GET: "ลูกค้าเปิดลิงก์ติดตามโปรเจกต์" }, shareView: true },
];

// GET ที่บันทึกด้วย (เปิดดูข้อมูลสำคัญ) — นอกนั้น GET ไม่บันทึก ยกเว้นถูกปฏิเสธ/error (ปริมาณมหาศาลและไม่เปลี่ยนข้อมูล)
const SENSITIVE_READS = [/^\/users$/, /^\/users\/(?!me$|for-select$)[^/]+$/, /^\/(logs|audit-logs|error-logs)(\/[^/]+)?$/, /^\/share\/[^/]+$/];
// ไม่บันทึกใน audit: login/logout มีตาราง tb_login_logs ของตัวเอง (และ body login มีรหัสผ่าน)
const SKIP = [/^\/auth\/(login|logout)$/, /^\/auth\/verifyPermission$/];

// ─── helpers ──────────────────────────────────────────────────────────────────────────────────────────
// token ของลิงก์ลูกค้าอยู่ใน path (/share/<token>) และเป็นความลับ (ใครได้ไปก็เปิดดูโปรเจกต์ได้) — เหลือแค่ 4 ตัวแรก
// ใช้ทั้งใน audit log และ console log ของเซิร์ฟเวอร์ (app.js)
const maskSecretPath = (p) => String(p).replace(/(\/share\/)([^/?]{4})[^/?]*/i, "$1$2…");

// ไฟล์ที่ส่งมาเป็นข้อความ (ลายเซ็นที่วาดบนจอ = data URL, รูป base64) อ่านไม่ออกและกินที่ log — เหลือแค่ชนิด + ขนาด
// (2026-10-13, risk-fixes R8) ใช้กับทุก endpoint ไม่ใช่แค่ลายเซ็น
const DATA_URL_PREFIX = /^data:([\w/+.-]*)(;[\w=.-]+)*;base64,/i;
const LONG_BASE64 = /^[A-Za-z0-9+/\r\n]{200,}={0,2}$/;

function sizeInKilobytes(byteCount) {
    return `${Math.max(1, Math.round(byteCount / 1024))} KB`;
}

// คืนคำอธิบายแทนตัวข้อมูล หรือ null ถ้าเป็นข้อความธรรมดา
function describeEncodedFile(text) {
    const dataUrl = text.match(DATA_URL_PREFIX);
    if (dataUrl) {
        const decodedBytes = ((text.length - dataUrl[0].length) * 3) / 4;
        const kind = dataUrl[1].toLowerCase().startsWith("image/") ? "รูปภาพ" : "ไฟล์";
        return `[${kind} ${sizeInKilobytes(decodedBytes)}]`;
    }
    if (LONG_BASE64.test(text)) {
        return `[ข้อมูล base64 ${sizeInKilobytes((text.length * 3) / 4)}]`;
    }
    return null;
}

function redact(value, depth = 0) {
    if (value === null || value === undefined) return value;
    if (depth > 5) return "[ลึกเกินไป]";
    if (Buffer.isBuffer(value)) return `[ไฟล์ ${sizeInKilobytes(value.length)}]`;
    if (typeof value === "string") {
        const fileDescription = describeEncodedFile(value);
        if (fileDescription) return fileDescription;
    }
    if (Array.isArray(value)) return value.slice(0, 100).map((v) => redact(v, depth + 1));
    if (typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? MASK : redact(v, depth + 1);
        return out;
    }
    if (typeof value === "string" && value.length > 1000) return `${value.slice(0, 1000)}…`;
    return value;
}

function normalize(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString();
    if (Buffer.isBuffer(v)) return `[binary ${v.length} bytes]`;
    if (typeof v === "string" && /^\d+\.\d+$/.test(v)) return Number(v); // DECIMAL จาก mysql2 เป็น string
    return v ?? null;
}

// ข้อมูลผูกที่อยู่คนละตาราง แต่เป็น "ส่วนหนึ่ง" ของแถวนั้นในสายตาผู้ใช้ (เช่น ผู้รับผิดชอบงาน)
const RELATED = {
    tb_tasks: async (id) => ({
        assignee_ids: (await pool.query("SELECT user_id FROM tb_task_assignees WHERE task_id = ? ORDER BY user_id", [id]))[0].map((r) => r.user_id),
    }),
    tb_project_members: async (id) => ({
        position_ids: (await pool.query("SELECT position_id FROM tb_project_member_positions WHERE project_member_id = ? ORDER BY position_id", [id]))[0].map((r) => r.position_id),
    }),
    tb_task_issues: async (id) => ({
        tagged_user_ids: (await pool.query("SELECT user_id FROM tb_task_issue_tags WHERE issue_id = ? ORDER BY user_id", [id]))[0].map((r) => r.user_id),
        image_urls: (await pool.query("SELECT image_url FROM tb_task_issue_images WHERE issue_id = ? ORDER BY image_id", [id]))[0].map((r) => r.image_url),
    }),
};

async function loadSnapshot(def, id) {
    if (!def?.table || !id) return null;
    const [rows] = await pool.query(`SELECT * FROM ${def.table} WHERE ${def.pk} = ? LIMIT 1`, [id]);
    if (!rows[0]) return null;
    const snap = {};
    for (const [k, v] of Object.entries(rows[0])) {
        if (HIDDEN_COLUMNS.has(k)) continue;
        // ลิงก์ลูกค้าเป็นความลับ (ใครได้ไปเปิดดูโปรเจกต์ได้) — เก็บแค่ 4 ตัวแรกไว้พอแยกออกว่าเปลี่ยนแล้ว
        snap[k] = k === "project_share_token" && v ? `${String(v).slice(0, 4)}…` : normalize(v);
    }
    if (RELATED[def.table]) Object.assign(snap, await RELATED[def.table](id));
    return snap;
}

// แปลง bitmask สิทธิ์เป็นชื่อสิทธิ์ที่ "เปิดอยู่"
const bitsToKeys = (bits, keys) => keys.filter((_, i) => String(bits ?? "")[i] === "1");

function diffSnapshots(before, after) {
    if (!before && !after) return null;
    const changes = {};
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
    for (const k of keys) {
        if (IGNORED_COLUMNS.test(k)) continue;
        const from = before?.[k] ?? null, to = after?.[k] ?? null;
        if (JSON.stringify(from) === JSON.stringify(to)) continue;
        const permKeys = k === "role_permission" ? PERMISSION_KEYS : k === "position_permission" ? PROJECT_PERMISSION_KEYS : null;
        if (permKeys) {
            const a = bitsToKeys(from, permKeys), b = bitsToKeys(to, permKeys);
            changes[k] = { from, to, added: b.filter((x) => !a.includes(x)), removed: a.filter((x) => !b.includes(x)) };
        } else {
            changes[k] = { from, to };
        }
    }
    return Object.keys(changes).length ? changes : null;
}

function resolveRef(ref, match, req, responseBody) {
    if (!ref) return null;
    if (ref === "self") return req.user?.user_id ?? req.auditSelfId ?? null;
    if (ref.startsWith("fixed:")) return ref.slice(6);
    if (ref.startsWith("response:")) return responseBody?.[ref.slice(9)] ?? null;
    return match?.[Number(ref)] ? decodeURIComponent(match[Number(ref)]) : null;
}

// ─── middleware ───────────────────────────────────────────────────────────────────────────────────────
// วางไว้ก่อน routes ทั้งหมด (app.js) — ตั้ง request id ให้ทุกคำขอ แล้วตัดสินใจว่าคำขอนี้ต้องบันทึกไหม
function auditLog(req, res, next) {
    req.id = crypto.randomUUID();
    req.startedAt = process.hrtime.bigint();
    res.setHeader("X-Request-Id", req.id);

    const path = req.originalUrl.split("?")[0].replace(/^\/api\/V1/i, "").replace(/\/+$/, "") || "/";
    if (!req.originalUrl.startsWith("/api/") || SKIP.some((re) => re.test(path)) || req.method === "OPTIONS") return next();

    const isMutation = !["GET", "HEAD"].includes(req.method);
    const isSensitiveRead = !isMutation && SENSITIVE_READS.some((re) => re.test(path));

    let def = null, match = null;
    for (const d of ENTITIES) { const m = path.match(d.re); if (m) { def = d; match = m; break; } }

    // เก็บ JSON ที่ตอบกลับ — ใช้แค่ดึง id ของข้อมูลที่เพิ่งสร้าง + ข้อความ error (ไม่เก็บทั้งก้อน: บางตัวมีรหัสผ่านชั่วคราว)
    const originalJson = res.json.bind(res);
    res.json = (body) => { res.locals.auditBody = body; return originalJson(body); };

    // body ต้องเก็บตอนนี้ เผื่อ controller แก้ req.body ระหว่างทาง (multer ยังไม่อ่าน multipart ณ จุดนี้ — ไฟล์/ฟิลด์ form อ่านตอน finish)
    const bodyAtStart = req.body && Object.keys(req.body).length ? { ...req.body } : null;

    const start = async () => {
        let before = null;
        if (isMutation && def?.table && def.id && !def.id.startsWith("response:")) {
            // ผู้ใช้ "ตัวเอง" (/users/me/...) — requireAuth ยังไม่ทำงาน ณ จุดนี้ อ่าน user_id จาก token เอง (แค่เพื่อ snapshot)
            if (def.id === "self") {
                try { req.auditSelfId = verifyToken(String(req.headers.authorization ?? "").replace(/^Bearer /, "")).user_id; } catch { /* token เสีย: requireAuth จะตอบ 401 เอง */ }
            }
            before = await loadSnapshot(def, resolveRef(def.id, match, req, null)).catch(() => null);
        }

        res.on("finish", () => {
            const status = res.statusCode;
            const denied = [401, 403, 429].includes(status);
            const failed = status >= 500;
            if (!isMutation && !isSensitiveRead && !denied && !failed) return;
            writeAudit({ req, res, def, match, path, before, bodyAtStart, status, denied, failed, isMutation }).catch((err) =>
                console.error("[audit] บันทึก log ไม่สำเร็จ:", err.message)
            );
        });
        next();
    };
    start().catch(next);
}

async function writeAudit({ req, res, def, match, path, before, bodyAtStart, status, denied, failed, isMutation }) {
    const body = res.locals.auditBody;
    const entityId = def ? resolveRef(def.id, match, req, body) : null;
    const projectId = def?.project ? resolveRef(def.project, match, req, body) : null;

    let after = null;
    if (isMutation && def?.table && entityId && status < 400) after = await loadSnapshot(def, entityId).catch(() => null);
    const changes = isMutation ? diffSnapshots(before, after) : null;

    const event = denied ? "denied" : failed ? "error"
        : !isMutation ? "view"
        : req.method === "DELETE" ? "delete"
        : status === 201 ? "create"
        : req.method === "PUT" ? "update"
        : "action";

    const payloadSource = { ...(bodyAtStart ?? req.body ?? {}) };
    const files = [req.file, ...(req.files ?? [])].filter(Boolean);
    if (files.length) payloadSource.__files = files.map((f) => ({ name: f.originalname, size: f.size, type: f.mimetype }));
    if (req.method === "GET" && Object.keys(req.query ?? {}).length) payloadSource.__query = req.query;
    let payload = Object.keys(payloadSource).length ? JSON.stringify(redact(payloadSource)) : null;
    if (payload && payload.length > MAX_PAYLOAD_CHARS) payload = JSON.stringify({ __truncated: true, size: payload.length });

    // snapshot ตัวตน ณ ตอนนั้น — ต้องอ่านได้แม้ผู้ใช้ถูกลบ/เปลี่ยนชื่อ/เปลี่ยน role ทีหลัง (FK เป็น SET NULL)
    let actor = null;
    if (req.user?.user_id) {
        [[actor]] = await pool.query(
            `SELECT u.user_username, CONCAT(u.user_fname, ' ', u.user_lname) AS fullname, r.role_name
             FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id WHERE u.user_id = ?`,
            [req.user.user_id]
        );
    }

    const durationMs = Math.round(Number(process.hrtime.bigint() - req.startedAt) / 1e6);
    const errorMessage = status >= 400 && typeof body?.message === "string" ? body.message.slice(0, 500) : null;
    // ลูกค้าเปิดลิงก์ share: ระบุโปรเจกต์จาก token ที่ใช้ (ตัว token ไม่เก็บ)
    let shareProjectId = null;
    if (def?.shareView && status === 200) shareProjectId = body?.project?.project_id ?? null;

    await pool.query(
        `INSERT INTO tb_audit_logs
            (aud_request_id, aud_user_id, aud_user_username, aud_user_fullname, aud_role_name,
             aud_event, aud_action, aud_method, aud_path, aud_entity_type, aud_entity_id, aud_project_id,
             aud_status, aud_success, aud_changes, aud_payload, aud_error,
             aud_ip, aud_user_agent, aud_duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            req.id, req.user?.user_id ?? null, actor?.user_username ?? null, actor?.fullname ?? null, actor?.role_name ?? null,
            event, def?.label?.[req.method] ?? `${req.method} ${maskSecretPath(path)}`.slice(0, 100), req.method, maskSecretPath(path).slice(0, 255),
            def?.type ?? null, def?.shareView ? shareProjectId : entityId ? String(entityId).slice(0, 64) : null,
            projectId ?? shareProjectId,
            status, status < 400 ? 1 : 0,
            changes ? JSON.stringify(redact(changes)) : null, payload, errorMessage,
            String(req.ip ?? "").slice(0, 45) || null, String(req.headers["user-agent"] ?? "").slice(0, 255) || null, durationMs,
        ]
    );
}

module.exports = { auditLog, redact, diffSnapshots, maskSecretPath };
