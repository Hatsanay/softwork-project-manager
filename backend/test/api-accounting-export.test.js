// ไฟล์ส่งนักบัญชี (ขั้น 1D-3) — 6 ชีตฝั่งขาย + 3 ชีตฝั่งจ่าย (ขั้น 2-5 — ทดสอบละเอียดใน api-payables.test.js) · ชนิดเซลล์ (ตัวเลข/วันที่/ข้อความ) · ลูกหนี้ ณ สิ้นเดือนคิดย้อนหลัง · ยกเลิกในเดือน · สิทธิ์ · audit
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว แล้วเปิดไฟล์ที่ได้ด้วย exceljs · แบบระบบ: docs/plans/2026-10-15-finance-1d.md R-D2/R-D3/R-D7/R-D9
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const ExcelJS = require("exceljs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const PASSWORD = "Staff@2026";
const TRICKY_NAME = '=HYPERLINK("http://example.com","คลิก")';

let api;
let clientId;
let reporterToken;
let viewerToken;
const ids = {};

// วันที่ของเดือนก่อน (วันที่ day) — ใช้ทำข้อมูล "เดือนที่ส่งออกไปแล้ว"
function previousMonthDate(day) {
    const [year, month] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 2, day)).toISOString().slice(0, 10);
}
const previousMonth = () => previousMonthDate(1).slice(0, 7);
const currentMonth = () => todayBangkok().slice(0, 7);

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const admin = (method, url, body) => api.callApi(method, url, { body });

async function issuedInvoice(price) {
    const quotation = expectStatus(
        await admin("POST", "/V1/quotations", {
            qt_client_id: clientId,
            qt_branch_id: HEAD_OFFICE_ID,
            qt_title: `งาน ${price}`,
            qt_valid_days: 30,
            items: [{ qti_type: "item", qti_description: "บริการ", qti_quantity: "1", qti_unit_price: price }],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/submit`, {}), 200);
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/approve`, {}), 200);
    expectStatus(
        await admin("POST", `/V1/quotations/${quotation.qt_id}/accept`, { project_mode: "none", create_tasks: false }),
        200,
    );
    const billable = expectStatus(await admin("GET", `/V1/quotations/${quotation.qt_id}/billable-milestones`), 200);
    const invoice = expectStatus(
        await admin("POST", "/V1/invoices", {
            quotation_id: quotation.qt_id,
            milestone_ids: [billable.milestones[0].qtm_id],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${invoice.inv_id}/issue`, {}), 200);
    return invoice.inv_id;
}

async function receipt(invoiceId, amount, extra = {}) {
    return expectStatus(
        await admin("POST", "/V1/receipts", {
            rc_client_id: clientId,
            rc_branch_id: HEAD_OFFICE_ID,
            rc_receipt_date: todayBangkok(),
            rc_method: "cash",
            allocations: [{ rca_invoice_id: invoiceId, rca_amount: amount }],
            ...extra,
        }),
        201,
    ).rc_id;
}

async function download(month, token = reporterToken) {
    const response = await fetch(`${api.baseUrl}/api/V1/reports/accounting-export?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status !== 200) return { status: response.status };
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    return { status: 200, workbook, headers: response.headers };
}

// แถวข้อมูลของชีต (ข้ามหัวตาราง) เป็น object ตามหัวคอลัมน์
function sheetRows(workbook, name) {
    const sheet = workbook.getWorksheet(name);
    const headers = sheet.getRow(1).values;
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const record = {};
        row.values.forEach((value, index) => {
            if (headers[index]) record[headers[index]] = value;
        });
        record.__row = row;
        rows.push(record);
    });
    return rows;
}

test.before(async () => {
    api = await startTestServer("accounting_export");
    await api.loginAsAdmin();
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
    clientId = expectStatus(
        await admin("POST", "/V1/clients", {
            client_name: TRICKY_NAME,
            client_tax_id: "0105557000347",
            client_branch_code: "00001",
        }),
        201,
    ).client_id;

    // C: ออกเดือนก่อน 1,070 · ใบเสร็จ 500 วันนี้ (หลังสิ้นเดือน) · ใบเสร็จ 200 ลงวันที่เดือนก่อนแล้วถูกยกเลิกวันนี้
    ids.c = await issuedInvoice("1000");
    await api.pool.query("UPDATE tb_invoices SET inv_issue_date = ?, inv_due_date = ? WHERE inv_id = ?", [
        previousMonthDate(10),
        previousMonthDate(15),
        ids.c,
    ]);
    ids.r1 = await receipt(ids.c, "500");
    ids.r2 = await receipt(ids.c, "200", { rc_wht_amount: "6" });
    await api.pool.query("UPDATE tb_receipts SET rc_receipt_date = ? WHERE rc_id = ?", [previousMonthDate(20), ids.r2]);
    expectStatus(await admin("POST", `/V1/receipts/${ids.r2}/cancel`, { reason: "เช็คเด้ง" }), 200);

    // D: ออกเดือนก่อน 2,140 · ยกเลิกวันนี้ (หลังสิ้นเดือน)
    ids.d = await issuedInvoice("2000");
    await api.pool.query("UPDATE tb_invoices SET inv_issue_date = ?, inv_due_date = ? WHERE inv_id = ?", [
        previousMonthDate(12),
        previousMonthDate(28),
        ids.d,
    ]);
    expectStatus(await admin("POST", `/V1/invoices/${ids.d}/cancel`, { reason: "ลูกค้าขอยกเลิก" }), 200);

    const bits = (keys) => PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
    for (const [name, keys, userNumber] of [
        ["ae.reporter", ["dashboard", "salesReports"], 131],
        ["ae.viewer", ["dashboard", "viewInvoices", "viewReceipts"], 132],
    ]) {
        const role = expectStatus(
            await admin("POST", "/V1/roles", { role_name: `role-${name}`, role_permission: bits(keys) }),
            201,
        );
        await api.pool.query(
            `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
            [
                `USE20990101000${userNumber}`,
                name,
                `${name}@example.com`,
                await bcrypt.hash(PASSWORD, 10),
                name,
                role.role_id,
            ],
        );
    }
    reporterToken = await api.login("ae.reporter", PASSWORD);
    viewerToken = await api.login("ae.viewer", PASSWORD);
});

test.after(async () => {
    await api?.stop();
});

test("เดือนก่อน: 11 ชีต (ขาย 7 + Fastwork 1 + จ่าย 3) · ใบแจ้งหนี้รวมใบที่ยกเลิกทีหลัง · ชนิดเซลล์ถูก · ชื่อที่หน้าตาเหมือนสูตรเป็นข้อความ (R-D7)", async () => {
    const { workbook, headers } = await download(previousMonth());
    assert.match(headers.get("content-type"), /spreadsheetml/);
    assert.match(headers.get("content-disposition"), /filename\*=UTF-8''softwork-/);
    assert.match(headers.get("cache-control"), /no-store/);
    assert.deepEqual(
        workbook.worksheets.map((sheet) => sheet.name),
        [
            "สรุป",
            "ใบแจ้งหนี้",
            "รายได้ Fastwork",
            "ใบลดหนี้",
            "ใบเสร็จ",
            "หัก ณ ที่จ่าย",
            "ลูกหนี้ ณ สิ้นเดือน",
            "ยกเลิกในเดือน",
            "ค่าใช้จ่าย",
            "ใบสำคัญจ่าย",
            "หัก ณ ที่จ่าย (บริษัทหัก)",
        ],
    );

    const invoices = sheetRows(workbook, "ใบแจ้งหนี้");
    assert.equal(invoices.length, 2);
    const cRow = invoices.find((row) => row["ยอดรวม"] === 1070);
    assert.equal(cRow["สถานะ"], "ออกแล้ว");
    assert.equal(cRow["เลขผู้เสียภาษี"], "0105557000347", "ศูนย์นำหน้าไม่หาย");
    assert.equal(cRow["ลูกค้า"], TRICKY_NAME);
    const clientCell = cRow.__row.getCell(4);
    assert.equal(clientCell.type, ExcelJS.ValueType.String, "เป็นข้อความ ไม่ใช่สูตร");
    assert.ok(cRow["วันที่"] instanceof Date);
    assert.equal(cRow["วันที่"].toISOString().slice(0, 10), previousMonthDate(10));
    assert.equal(cRow["ก่อน VAT (บาท)"], 1000);
    assert.equal(cRow["VAT (บาท)"], 70);
    const dRow = invoices.find((row) => row["ยอดรวม"] === 2140);
    assert.equal(dRow["สถานะ"], "ยกเลิก");
    assert.equal(dRow["เหตุผลที่ยกเลิก"], "ลูกค้าขอยกเลิก");

    const receipts = sheetRows(workbook, "ใบเสร็จ");
    assert.equal(receipts.length, 1, "เฉพาะใบเสร็จที่ลงวันที่ในเดือน");
    assert.equal(receipts[0]["สถานะ"], "ยกเลิก");
    assert.equal(sheetRows(workbook, "หัก ณ ที่จ่าย").length, 0, "ใบเสร็จที่ยกเลิกไม่อยู่ในรายการหัก ณ ที่จ่าย");
});

test("R-D3 ลูกหนี้ ณ สิ้นเดือนก่อน: ใบเสร็จหลังสิ้นเดือนไม่นับ · ใบเสร็จที่ยกเลิกหลังสิ้นเดือนยังนับ · ใบที่ยกเลิกหลังสิ้นเดือนยังเป็นหนี้", async () => {
    const { workbook } = await download(previousMonth());
    const aging = sheetRows(workbook, "ลูกหนี้ ณ สิ้นเดือน");
    const cRow = aging.find((row) => row["ยอดรวม"] === 1070);
    assert.equal(
        cRow["รับแล้ว ณ สิ้นเดือน"],
        200,
        "ใบเสร็จ 200 ลงวันที่เดือนก่อน ยกเลิกหลังสิ้นเดือน → ณ วันนั้นยังรับอยู่",
    );
    assert.equal(cRow["ค้าง"], 870, "ใบเสร็จ 500 ลงวันที่หลังสิ้นเดือนไม่นับ");
    assert.equal(cRow["ค้าง (บาท)"], 870);
    const [year, month] = previousMonth().split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    assert.equal(cRow["เกินกำหนด (วัน)"], lastDay - 15);
    const dRow = aging.find((row) => row["ยอดรวม"] === 2140);
    assert.ok(dRow, "ใบที่ยกเลิกหลังสิ้นเดือน ณ วันนั้นยังเป็นหนี้");
    assert.equal(dRow["ค้าง"], 2140);

    const summary = workbook.getWorksheet("สรุป");
    const summaryValues = Object.fromEntries(
        summary
            .getSheetValues()
            .filter(Boolean)
            .map((row) => [row[1], row[2]]),
    );
    assert.equal(summaryValues["ไฟล์ส่งนักบัญชี เดือน"], previousMonth());
    assert.equal(summaryValues["ลูกหนี้คงค้าง ณ สิ้นเดือน (บาท)"], 3010);
    assert.equal(summaryValues["ใบแจ้งหนี้ที่ออก (ไม่นับที่ยกเลิก) — จำนวน"], 1);
});

test("เดือนนี้: ชีตยกเลิกในเดือนมีใบแจ้งหนี้และใบเสร็จที่ยกเลิกวันนี้ (แม้ออกเดือนก่อน) · ใบเสร็จวันนี้อยู่ในชีตใบเสร็จ", async () => {
    const { workbook } = await download(currentMonth());
    const cancelled = sheetRows(workbook, "ยกเลิกในเดือน");
    assert.deepEqual(cancelled.map((row) => row["ประเภท"]).sort(), ["ใบเสร็จรับเงิน", "ใบแจ้งหนี้"].sort());
    assert.ok(cancelled.every((row) => row["วันที่ยกเลิก"] instanceof Date));
    const receipts = sheetRows(workbook, "ใบเสร็จ");
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0]["ยอดตัดหนี้"], 500);
    assert.equal(sheetRows(workbook, "ใบแจ้งหนี้").length, 0);
});

test("ตรวจเดือน + สิทธิ์ (D3) + audit log (R-D9)", async () => {
    const badMonth = await api.callApi("GET", "/V1/reports/accounting-export?month=2026-13", { token: reporterToken });
    assert.equal(badMonth.status, 400);
    const forbidden = await download(currentMonth(), viewerToken);
    assert.equal(forbidden.status, 403);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT aud_action FROM tb_audit_logs WHERE aud_path = '/reports/accounting-export' AND aud_success = 1",
    );
    assert.ok(rows.length >= 3);
    assert.ok(rows.every((row) => row.aud_action === "ส่งออกไฟล์นักบัญชี"));
});
