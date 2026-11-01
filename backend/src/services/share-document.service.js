// เอกสารในลิงก์ติดตามงาน (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md ข้อ 2.3)
// เปิดเมื่อโปรเจกต์เปิดแชร์ลิงก์ และเปิดสวิตช์ "แสดงเอกสารในลิงก์ติดตามงาน" (ค่าเริ่มปิด · เปิดเมื่อลูกค้าขอ)
// เอกสาร = ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ของโปรเจกต์ที่ออกเลขแล้ว · ลูกค้าไม่เห็นบันทึกภายใน ประวัติอนุมัติ หรือปุ่มของทีม
const { AppError } = require("../utils/app-error");
const quotationService = require("./quotation.service");
const invoiceService = require("./invoice.service");
const receiptService = require("./receipt.service");

const NOT_FOUND_MESSAGE = "ไม่พบเอกสารนี้ หรือทีมงานปิดการแสดงเอกสารในลิงก์แล้ว";
// ผู้ดูจากลิงก์ ไม่มีสิทธิ์ใดในระบบ (ปุ่มของทีมจึงปิดหมด)
const VIEWER = { user_id: null, user_role_id: null, role_permission: "" };
// ส่วนที่ลูกค้าไม่เห็น (ข้อมูลภายใน / การทำงานของทีม)
const HIDDEN_KEYS = [
    "approval_history",
    "approvals_this_round",
    "approval",
    "chain",
    "copied_from",
    "actions",
    "readiness",
    "fastwork_internal",
    "billing_note",
    "renewal_cycles",
    "reissued_to",
    "today",
];

async function findProject(conn, token) {
    const [[project]] = await conn.query(
        `SELECT project_id FROM tb_projects
         WHERE project_share_token = ? AND project_share_enabled = TRUE AND project_share_documents = TRUE`,
        [token],
    );
    return project ?? null;
}

/** รายการเอกสารของโปรเจกต์ (ใหม่สุดก่อน · ที่ยกเลิกแล้วแสดงว่ายกเลิก) */
async function listDocuments(conn, projectId) {
    const [quotations] = await conn.query(
        `SELECT 'quotation' AS type, qt_id AS id, qt_number AS number, qt_revision AS revision, DATE_FORMAT(qt_issue_date, '%Y-%m-%d') AS date,
                qt_total AS total, qt_currency AS currency, qt_status AS status, qt_title AS title
         FROM tb_quotations WHERE qt_project_id = ? AND qt_number IS NOT NULL AND qt_status IN ('approved', 'sent', 'accepted', 'cancelled')`,
        [projectId],
    );
    const [invoices] = await conn.query(
        `SELECT 'invoice' AS type, inv_id AS id, inv_number AS number, 0 AS revision, DATE_FORMAT(inv_issue_date, '%Y-%m-%d') AS date,
                inv_total AS total, inv_currency AS currency, inv_status AS status, inv_title AS title
         FROM tb_invoices WHERE inv_project_id = ? AND inv_number IS NOT NULL AND inv_status IN ('issued', 'cancelled')`,
        [projectId],
    );
    const [receipts] = await conn.query(
        `SELECT DISTINCT 'receipt' AS type, r.rc_id AS id, r.rc_number AS number, 0 AS revision,
                DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS date, r.rc_received_amount AS total, r.rc_currency AS currency,
                r.rc_status AS status, NULL AS title
         FROM tb_receipts r
         JOIN tb_receipt_allocations a ON a.rca_receipt_id = r.rc_id
         JOIN tb_invoices i ON i.inv_id = a.rca_invoice_id
         WHERE i.inv_project_id = ?`,
        [projectId],
    );
    return [...quotations, ...invoices, ...receipts]
        .map((row) => ({ ...row, revision: Number(row.revision), is_cancelled: row.status === "cancelled" }))
        .sort((first, second) => (second.date ?? "").localeCompare(first.date ?? "") || second.number.localeCompare(first.number));
}

/** ข้อมูลหน้าเอกสาร (รูปเดียวกับหน้าพิมพ์ของทีม) · เอกสารต้องเป็นของโปรเจกต์นี้และอยู่ในรายการ */
async function documentDetail(conn, token, type, documentId) {
    const project = await findProject(conn, token);
    if (!project) throw new AppError(404, "SHARED_DOCUMENT_NOT_FOUND", NOT_FOUND_MESSAGE);
    const documents = await listDocuments(conn, project.project_id);
    if (!documents.some((row) => row.type === type && row.id === documentId)) {
        throw new AppError(404, "SHARED_DOCUMENT_NOT_FOUND", NOT_FOUND_MESSAGE);
    }
    let detail;
    if (type === "quotation") detail = await quotationService.getQuotationDetail(conn, documentId, VIEWER);
    else if (type === "invoice") detail = await invoiceService.getInvoiceDetail(conn, documentId, VIEWER);
    else detail = await receiptService.getReceiptDetail(conn, documentId, VIEWER);
    const visible = Object.fromEntries(Object.entries(detail).filter(([key]) => !HIDDEN_KEYS.includes(key)));
    // บันทึกภายในของหัวเอกสาร (qt_/inv_/rc_internal_note) ไม่ส่งออกไป
    for (const header of ["quotation", "invoice", "receipt"]) {
        if (!visible[header]) continue;
        visible[header] = Object.fromEntries(Object.entries(visible[header]).filter(([key]) => !key.endsWith("_internal_note")));
    }
    return { type, ...visible };
}

module.exports = { findProject, listDocuments, documentDetail };
