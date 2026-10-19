// ค่าใช้จ่าย: บิลผู้ขาย (อนุมัติตามวงเงิน) · ใบเบิกเงินพนักงาน (แนบรูปใบเสร็จ) · จ่ายเงิน + 50 ทวิ
const sharp = require("sharp");
const { as } = require("./api");
const { HEAD_OFFICE_ID } = require("./setup");

/** บันทึกบิลผู้ขาย → ส่ง → อนุมัติ (ถ้าถึงวงเงิน ผู้อนุมัติกด) → คืน ex_id */
async function recordBill(clerk, approver, bill) {
    const created = await as(clerk, "POST", "/V1/expenses", {
        ex_branch_id: HEAD_OFFICE_ID,
        ex_currency: "THB",
        ex_vat_amount: "0",
        ...bill,
    });
    const submitted = await as(clerk, "POST", `/V1/expenses/${created.ex_id}/submit`, {});
    const status = submitted?.ex_status ?? submitted?.expense?.ex_status;
    if (status !== "approved" && approver) {
        const detail = await as(clerk, "GET", `/V1/expenses/${created.ex_id}`);
        if (detail.expense.ex_status === "pending_approval") {
            await as(approver, "POST", `/V1/expenses/${created.ex_id}/approve`, {});
        }
    }
    return created.ex_id;
}

/** รูปใบเสร็จร้านค้า (PNG) สำหรับแนบใบเบิก — วาดจาก SVG ในเครื่อง */
async function receiptImage(shopName, amountText, dateText) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <text x="210" y="60" font-family="Arial" font-size="22" text-anchor="middle" font-weight="bold">${shopName}</text>
        <text x="210" y="92" font-family="Arial" font-size="14" text-anchor="middle" fill="#555">RECEIPT / TAX INVOICE (ABB)</text>
        <line x1="30" y1="120" x2="390" y2="120" stroke="#999" stroke-dasharray="4"/>
        <text x="30" y="160" font-family="Arial" font-size="16">Date: ${dateText}</text>
        <text x="30" y="200" font-family="Arial" font-size="16">Total (THB)</text>
        <text x="390" y="200" font-family="Arial" font-size="20" text-anchor="end" font-weight="bold">${amountText}</text>
        <line x1="30" y1="230" x2="390" y2="230" stroke="#999" stroke-dasharray="4"/>
        <text x="210" y="520" font-family="Arial" font-size="13" text-anchor="middle" fill="#777">Thank you</text>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * ใบเบิกเงินพนักงาน → แนบรูป (ถ้าไม่ใช่ใบรับรองแทนใบเสร็จ) → ส่ง → อนุมัติ → คืน ex_id
 * @param {{ shop?: string }} claim ค่าจาก expenseClaimDraftSchema + ชื่อร้านสำหรับรูปใบเสร็จ
 */
async function recordClaim(employee, approver, claim) {
    const { shop, ...body } = claim;
    const created = await as(employee, "POST", "/V1/claims", { ex_branch_id: HEAD_OFFICE_ID, ex_vat_amount: "0", ...body });
    if (body.ex_doc_type !== "substitute_receipt") {
        const total = body.lines.reduce((sum, line) => sum + Number(line.exl_unit_price) * Number(line.exl_quantity ?? 1), 0);
        const image = await receiptImage(shop ?? body.ex_merchant_name ?? "Shop", total.toFixed(2), body.ex_expense_date);
        const form = new FormData();
        form.append("file", new Blob([image], { type: "image/png" }), "receipt.png");
        await as(employee, "POST", `/V1/claims/${created.ex_id}/attachments`, form);
    }
    await as(employee, "POST", `/V1/claims/${created.ex_id}/submit`, {});
    await as(approver, "POST", `/V1/claims/${created.ex_id}/approve`, {});
    return created.ex_id;
}

// ใบเบิกอ่านผ่านเส้นทางใบเบิก (เส้นทางบิลผู้ขายเปิดใบเบิกไม่ได้)
async function expenseTotal(user, expenseId, isClaim) {
    const detail = await as(user, "GET", `/V1/${isClaim ? "claims" : "expenses"}/${expenseId}`);
    return detail.expense.ex_total;
}

/**
 * จ่ายเงิน (ผู้ขายหรือพนักงาน) — ระบบหัก ณ ที่จ่ายตามประเภทเงินได้และออก 50 ทวิให้เอง
 * @param {{ payee: { vendorId?: string, employeeId?: string }, date: string, expenseIds: string[], bankAccountId: string, method?: string, reference?: string }} payment
 */
async function pay(payer, payment) {
    const allocations = [];
    for (const expenseId of payment.expenseIds) {
        allocations.push({
            pva_expense_id: expenseId,
            pva_amount: await expenseTotal(payer, expenseId, Boolean(payment.payee.employeeId)),
        });
    }
    const created = await as(payer, "POST", "/V1/payments", {
        pv_payee_kind: payment.payee.vendorId ? "vendor" : "employee",
        pv_vendor_id: payment.payee.vendorId ?? null,
        pv_employee_id: payment.payee.employeeId ?? null,
        pv_branch_id: HEAD_OFFICE_ID,
        pv_payment_date: payment.date,
        pv_method: payment.method ?? "transfer",
        pv_bank_account_id: payment.method === "cash" ? null : payment.bankAccountId,
        pv_reference: payment.reference ?? null,
        allocations,
    });
    return created.pv_id;
}

module.exports = { recordBill, recordClaim, pay };
