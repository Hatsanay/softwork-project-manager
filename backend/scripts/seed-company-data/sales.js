// งานขาย: ใบเสนอราคา → อนุมัติ → ส่ง → ตอบรับ (เปิดโปรเจกต์) → ใบแจ้งหนี้ตามงวด → ใบวางบิล → ใบเสร็จ · ใบลด/เพิ่มหนี้
const { as } = require("./api");
const { HEAD_OFFICE_ID } = require("./setup");

/** แถวรายการจากสินค้าในแคตตาล็อก */
function productLine(product, quantity, overrides = {}) {
    return {
        qti_type: "item",
        qti_product_id: product.id,
        qti_description: overrides.description ?? product.name,
        qti_quantity: String(quantity),
        qti_unit: product.unit,
        qti_unit_price: overrides.price ?? product.price,
        qti_list_price: product.price,
    };
}

const heading = (text) => ({ qti_type: "heading", qti_description: text });
const note = (text) => ({ qti_type: "note", qti_description: text });

/** สร้างร่างใบเสนอราคา → คืน qt_id */
async function createQuotation(seller, quotation) {
    const created = await as(seller, "POST", "/V1/quotations", {
        qt_branch_id: HEAD_OFFICE_ID,
        qt_currency: "THB",
        qt_valid_days: 30,
        ...quotation,
    });
    return created.qt_id;
}

/**
 * ส่งขออนุมัติ แล้วผู้อนุมัติกดอนุมัติทีละชั้นจนครบ
 * คนเดียวกันอนุมัติชั้นถัดไปได้ ระบบผ่านชั้นนั้นให้เอง — กดเฉพาะตอนใบยังรออนุมัติ
 */
async function submitAndApprove(seller, quotationId, approvers) {
    await as(seller, "POST", `/V1/quotations/${quotationId}/submit`, {});
    for (const approver of approvers) {
        const detail = await as(approver, "GET", `/V1/quotations/${quotationId}`);
        const status = detail.quotation?.qt_status ?? detail.qt_status;
        if (status !== "pending_approval") break;
        await as(approver, "POST", `/V1/quotations/${quotationId}/approve`, {});
    }
}

async function sendQuotation(seller, quotationId) {
    await as(seller, "POST", `/V1/quotations/${quotationId}/send`, {});
}

/** ลูกค้าตอบรับ → เปิดโปรเจกต์ใหม่ + สร้างงานจากรายการ → คืน project_id */
async function acceptQuotation(seller, quotationId) {
    const accepted = await as(seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "new",
        create_tasks: true,
    });
    return accepted.project_id;
}

async function billableMilestones(user, quotationId) {
    const billable = await as(user, "GET", `/V1/quotations/${quotationId}/billable-milestones`);
    return billable.milestones;
}

/** ใบแจ้งหนี้จากงวดที่ (index เริ่ม 0) ของใบเสนอราคา → ออกเลย → คืน inv_id */
async function invoiceMilestone(user, quotationId, milestoneIndex) {
    const milestones = await billableMilestones(user, quotationId);
    const milestone = milestones.find((item) => item.qtm_order === milestoneIndex + 1) ?? milestones[0];
    const created = await as(user, "POST", "/V1/invoices", { quotation_id: quotationId, milestone_ids: [milestone.qtm_id] });
    await as(user, "POST", `/V1/invoices/${created.inv_id}/issue`, {});
    return created.inv_id;
}

// ใบที่ต้องอนุมัติ: อนุมัติชั้นสุดท้ายแล้วระบบออกเลขให้เอง · ยังเป็นร่าง (ไม่ต้องอนุมัติ) จึงกดออกเอง
async function issueIfDraft(user, invoiceId) {
    const { invoice } = await as(user, "GET", `/V1/invoices/${invoiceId}`);
    if (invoice.inv_status === "draft") await as(user, "POST", `/V1/invoices/${invoiceId}/issue`, {});
}

/** ใบแจ้งหนี้ที่สร้างเอง (ต้องอนุมัติ) → ออก → คืน inv_id */
async function manualInvoice(creator, approver, invoice) {
    const created = await as(creator, "POST", "/V1/invoices", { inv_branch_id: HEAD_OFFICE_ID, ...invoice });
    await as(creator, "POST", `/V1/invoices/${created.inv_id}/submit`, {});
    await as(approver, "POST", `/V1/invoices/${created.inv_id}/approve`, {});
    await issueIfDraft(creator, created.inv_id);
    return created.inv_id;
}

/** ใบเพิ่มหนี้อ้างใบแจ้งหนี้เดิม (ต้องอนุมัติ) → คืน inv_id */
async function debitNote(creator, approver, debit) {
    const created = await as(creator, "POST", "/V1/invoices", { inv_branch_id: HEAD_OFFICE_ID, ...debit });
    await as(creator, "POST", `/V1/invoices/${created.inv_id}/submit`, {});
    await as(approver, "POST", `/V1/invoices/${created.inv_id}/approve`, {});
    await issueIfDraft(creator, created.inv_id);
    return created.inv_id;
}

/** ใบลดหนี้ (ต้องอนุมัติ — อนุมัติแล้วออกเลข) → คืน cn_id */
async function creditNote(creator, approver, credit) {
    const created = await as(creator, "POST", "/V1/credit-notes", credit);
    await as(creator, "POST", `/V1/credit-notes/${created.cn_id}/submit`, {});
    await as(approver, "POST", `/V1/credit-notes/${created.cn_id}/approve`, {});
    return created.cn_id;
}

async function invoiceDetail(user, invoiceId) {
    return as(user, "GET", `/V1/invoices/${invoiceId}`);
}

/** ยอดค้างรับของใบแจ้งหนี้ตอนนี้ = ยอดรวม − ลดหนี้แล้ว − รับแล้ว (คิดเป็นสตางค์ ไม่ผ่าน float) */
async function outstandingOf(user, invoiceId) {
    const { invoice } = await invoiceDetail(user, invoiceId);
    const satang = (text) => Math.round(Number(text ?? 0) * 100);
    const remaining = satang(invoice.inv_total) - satang(invoice.inv_credited_amount) - satang(invoice.inv_paid_amount);
    return (remaining / 100).toFixed(2);
}

/** ใบวางบิลรวมหลายใบแจ้งหนี้ → ออก → คืน bn_id */
async function billingNote(user, clientId, invoiceIds, paymentDate) {
    const created = await as(user, "POST", "/V1/billing-notes", {
        bn_client_id: clientId,
        bn_branch_id: HEAD_OFFICE_ID,
        bn_payment_date: paymentDate,
        invoice_ids: invoiceIds,
    });
    await as(user, "POST", `/V1/billing-notes/${created.bn_id}/issue`, {});
    return created.bn_id;
}

/**
 * รับเงิน = ออกใบเสร็จ
 * @param {{ clientId, date, invoices: { id, amount }[], method?, bankAccountId?, wht?, whtCertificateNo?, reference?, cheque?, receivedThb?, billingNoteId? }} receipt
 */
async function receivePayment(user, receipt) {
    const created = await as(user, "POST", "/V1/receipts", {
        rc_client_id: receipt.clientId,
        rc_branch_id: HEAD_OFFICE_ID,
        rc_receipt_date: receipt.date,
        rc_method: receipt.method ?? "transfer",
        rc_bank_account_id: receipt.method === "cash" || receipt.method === "cheque" ? null : receipt.bankAccountId,
        rc_reference: receipt.reference ?? null,
        rc_cheque_no: receipt.cheque?.no ?? null,
        rc_cheque_bank: receipt.cheque?.bank ?? null,
        rc_cheque_date: receipt.cheque?.date ?? null,
        allocations: receipt.invoices.map((invoice) => ({ rca_invoice_id: invoice.id, rca_amount: invoice.amount })),
        rc_wht_amount: receipt.wht ?? "0",
        rc_wht_certificate_no: receipt.whtCertificateNo ?? null,
        rc_wht_certificate_date: receipt.whtCertificateNo ? receipt.date : null,
        rc_received_thb: receipt.receivedThb ?? null,
        rc_billing_note_id: receipt.billingNoteId ?? null,
    });
    return created.rc_id;
}

module.exports = {
    productLine,
    heading,
    note,
    createQuotation,
    submitAndApprove,
    sendQuotation,
    acceptQuotation,
    invoiceMilestone,
    manualInvoice,
    debitNote,
    creditNote,
    invoiceDetail,
    outstandingOf,
    billingNote,
    receivePayment,
};
