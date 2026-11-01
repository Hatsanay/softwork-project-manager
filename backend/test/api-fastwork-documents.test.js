// เอกสารของงาน Fastwork (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md)
// รับงาน = ใบเสนอราคาตอบรับแล้ว · บันทึกเงินงวด = ใบแจ้งหนี้ + ใบเสร็จราคาเต็ม · ยกเลิกเงิน = ยกเลิกตาม · ยกเลิกเองไม่ได้
// ลิงก์ติดตามงานแสดงเอกสารเมื่อเปิดสวิตช์ · ออกย้อนหลังให้งานเดิม กดซ้ำไม่ออกซ้ำ
const test = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer } = require("./support/test-server");

let api;
let projectId;
let milestones;
let shareToken;

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

async function documentsOf(projectIdValue) {
    const [quotations] = await api.pool.query(
        "SELECT qt_id, qt_status, qt_number, qt_total, qt_payment_mode FROM tb_quotations WHERE qt_project_id = ? ORDER BY qt_id",
        [projectIdValue],
    );
    const [invoices] = await api.pool.query(
        "SELECT inv_id, inv_status, inv_number, inv_total, inv_fastwork_payout_id, inv_version FROM tb_invoices WHERE inv_project_id = ? ORDER BY inv_id",
        [projectIdValue],
    );
    const [receipts] = await api.pool.query(
        `SELECT r.rc_id, r.rc_status, r.rc_number, r.rc_received_amount, r.rc_fastwork_payout_id, r.rc_version,
                DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS rc_receipt_date
         FROM tb_receipts r WHERE r.rc_fastwork_payout_id IN (SELECT fwp_id FROM tb_fastwork_payouts WHERE fwp_project_id = ?) ORDER BY r.rc_id`,
        [projectIdValue],
    );
    return { quotations, invoices, receipts };
}

const payoutBody = (milestoneId, gross) => ({
    fwp_status: "pending", fwp_project_id: projectId, fwp_milestone_id: milestoneId, fwp_gross: gross, fwp_fee_rate: "17",
    fwp_fee: (Number(gross) * 0.17).toFixed(2), fwp_fee_vat: "0", fwp_wht: "0", fwp_approved_date: today(),
});

test.before(async () => {
    api = await startTestServer("fastwork_documents");
    await api.loginAsAdmin();
    const created = expectStatus(
        await api.callApi("POST", "/V1/fastwork/projects", {
            body: {
                project_name: "เว็บร้านกาแฟ", client_name: "coffee_buyer", project_start_date: today(),
                milestones: [
                    { fwm_name: "ออกแบบหน้าจอ", fwm_amount: "3000", fwm_due_date: null },
                    { fwm_name: "ทำเว็บ", fwm_amount: "5000", fwm_due_date: null },
                ],
            },
        }),
        201,
    );
    projectId = created.project_id;
    [milestones] = await api.pool.query("SELECT fwm_id, fwm_name FROM tb_fastwork_milestones WHERE fwm_project_id = ? ORDER BY fwm_order", [projectId]);
    const [[project]] = await api.pool.query("SELECT project_share_token FROM tb_projects WHERE project_id = ?", [projectId]);
    shareToken = project.project_share_token;
});

test.after(async () => {
    await api?.stop();
});

test("รับงาน = ใบเสนอราคาตอบรับแล้ว (ไม่ต้องอนุมัติ) · งวดตามงาน Fastwork", async () => {
    const { quotations } = await documentsOf(projectId);
    assert.equal(quotations.length, 1);
    assert.equal(quotations[0].qt_status, "accepted");
    assert.match(quotations[0].qt_number, /^QT-\d{8}-\d{6}$/);
    assert.equal(quotations[0].qt_total, "8000.00");
    assert.equal(quotations[0].qt_payment_mode, "milestones");
});

test("บันทึกเงินงวด = ใบแจ้งหนี้ + ใบเสร็จราคาเต็ม · ยกเลิกเองไม่ได้ · ยกเลิกเงิน = ยกเลิกตาม", async () => {
    const payout = expectStatus(await api.callApi("POST", "/V1/fastwork/payouts", { body: payoutBody(milestones[0].fwm_id, "3000") }), 201);
    let documents = await documentsOf(projectId);
    assert.equal(documents.invoices.length, 1);
    const [invoice] = documents.invoices;
    assert.deepEqual([invoice.inv_status, invoice.inv_total, invoice.inv_fastwork_payout_id], ["issued", "3000.00", payout.fwp_id]);
    assert.match(invoice.inv_number, /^IV-\d{8}-\d{6}$/);
    const [receipt] = documents.receipts;
    assert.deepEqual([receipt.rc_status, receipt.rc_received_amount, receipt.rc_receipt_date], ["issued", "3000.00", today()]);

    const lockedReceipt = expectStatus(await api.callApi("POST", `/V1/receipts/${receipt.rc_id}/cancel`, { body: { reason: "ลอง", rc_version: receipt.rc_version } }), 409);
    assert.equal(lockedReceipt.code, "FASTWORK_DOCUMENT_LOCKED");

    expectStatus(await api.callApi("POST", `/V1/fastwork/payouts/${payout.fwp_id}/cancel`, { body: { reason: "ลูกค้าขอคืนเงิน", fwp_version: payout.fwp_version } }), 200);
    documents = await documentsOf(projectId);
    assert.deepEqual([documents.invoices[0].inv_status, documents.receipts[0].rc_status], ["cancelled", "cancelled"]);

    // บันทึกใหม่ = เอกสารชุดใหม่
    expectStatus(await api.callApi("POST", "/V1/fastwork/payouts", { body: payoutBody(milestones[0].fwm_id, "3000") }), 201);
    documents = await documentsOf(projectId);
    assert.deepEqual(documents.invoices.map((row) => row.inv_status), ["cancelled", "issued"]);
});

test("ลิงก์ติดตามงาน: ปิดอยู่ไม่เห็นเอกสาร · เปิดแล้วเห็น · เปิดเอกสารได้ไม่มีบันทึกภายใน · เอกสารโปรเจกต์อื่นเปิดไม่ได้", async () => {
    const closed = expectStatus(await api.callApi("GET", `/V1/share/${shareToken}`, { token: null }), 200);
    assert.equal(closed.documents, null);
    const { invoices } = await documentsOf(projectId);
    expectStatus(await api.callApi("GET", `/V1/share/${shareToken}/documents/invoice/${invoices[1].inv_id}`, { token: null }), 404);

    expectStatus(await api.callApi("PUT", `/V1/projects/${projectId}/share/documents`, { body: { project_share_documents: true } }), 200);
    const opened = expectStatus(await api.callApi("GET", `/V1/share/${shareToken}`, { token: null }), 200);
    assert.deepEqual([...new Set(opened.documents.map((row) => row.type))].sort(), ["invoice", "quotation", "receipt"]);
    assert.ok(opened.documents.some((row) => row.is_cancelled), "ใบที่ยกเลิกยังอยู่ ขึ้นว่ายกเลิก");

    const document = expectStatus(await api.callApi("GET", `/V1/share/${shareToken}/documents/invoice/${invoices[1].inv_id}`, { token: null }), 200);
    assert.equal(document.invoice.inv_number, invoices[1].inv_number);
    assert.equal("inv_internal_note" in document.invoice, false);
    assert.equal("actions" in document, false);
    assert.equal("approval_history" in document, false);
    expectStatus(await api.callApi("GET", `/V1/share/${shareToken}/documents/receipt/RCP000000000000000`, { token: null }), 404);
});

test("ออกเอกสารย้อนหลังให้งานเดิม: ใบเสนอราคา + ใบของเงินงวดที่ยังไม่มีใบ · กดซ้ำไม่ออกซ้ำ", async () => {
    // จำลองงานก่อนมีเรื่องนี้: เงินงวดที่ไม่มีใบ + ใบเสนอราคาที่ยังไม่ผูกงาน
    await api.pool.query(
        `INSERT INTO tb_fastwork_payouts (fwp_project_id, fwp_milestone_id, fwp_status, fwp_gross, fwp_fee_rate, fwp_fee, fwp_net, fwp_approved_date)
         VALUES (?, ?, 'pending', 5000, 17, 850, 4150, ?)`,
        [projectId, milestones[1].fwm_id, "2026-10-01"],
    );
    await api.pool.query("UPDATE tb_quotations SET qt_project_id = NULL WHERE qt_project_id = ?", [projectId]);

    const missing = expectStatus(await api.callApi("GET", "/V1/fastwork/documents/missing"), 200);
    assert.deepEqual(missing.data.find((row) => row.project_id === projectId), { project_id: projectId, needs_quotation: true, missing_payouts: 1 });
    const result = expectStatus(await api.callApi("POST", "/V1/fastwork/documents/backfill"), 200);
    assert.deepEqual([result.quotations >= 1, result.payouts >= 1, result.failed], [true, true, []]);

    const documents = await documentsOf(projectId);
    assert.equal(documents.quotations.length, 1);
    const backdated = documents.receipts.find((row) => row.rc_receipt_date === "2026-10-01");
    assert.ok(backdated, "ใบเสร็จลงวันที่ลูกค้ายืนยันงวด (ย้อนหลังเกิน 30 วันได้)");
    assert.equal(backdated.rc_received_amount, "5000.00");

    const again = expectStatus(await api.callApi("POST", "/V1/fastwork/documents/backfill"), 200);
    assert.deepEqual([again.projects, again.payouts], [0, 0]);
    assert.equal((await documentsOf(projectId)).invoices.filter((row) => row.inv_status === "issued").length, 2);
});
