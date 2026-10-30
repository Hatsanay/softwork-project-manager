// จัดซื้อ ขั้น 2-5 — เจ้าหนี้คงค้างแยกอายุ · รายงาน ภ.ง.ด.3/53 รายเดือน · ต้นทุน/กำไรขั้นต้นโปรเจกต์ · ชีตฝั่งจ่ายในไฟล์ส่งนักบัญชี
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 1 ข้อ 7 และ 4.3, R-P9
const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { startTestServer } = require("./support/test-server");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PROJECT_ID = "PRO209901010000002";

let api;
let adminToken;
let categoryId;
const vendors = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

/** บิลที่อนุมัติแล้ว (กติกา EX วงเงินสูง → ผ่านอัตโนมัติ) */
async function approvedBill({
    vendorId = vendors.thai,
    price,
    vat = "0",
    expenseDate = todayBangkok(),
    creditDays = 0,
    project = null,
    whtType = "SERVICE",
}) {
    const created = expectStatus(
        await api.callApi("POST", "/V1/expenses", {
            body: {
                ex_vendor_id: vendorId,
                ex_title: "ค่าจ้างงาน",
                ex_branch_id: "BRA202601010000001",
                ex_doc_type: "substitute_receipt",
                ex_expense_date: expenseDate,
                ex_credit_days: creditDays,
                ex_vat_amount: vat,
                ex_wht_income_type: whtType,
                lines: [
                    {
                        exl_category_id: categoryId,
                        exl_project_id: project,
                        exl_description: "งาน",
                        exl_unit_price: price,
                    },
                ],
            },
        }),
        201,
    );
    expectStatus(await api.callApi("POST", `/V1/expenses/${created.ex_id}/submit`, { body: {} }), 200);
    return created.ex_id;
}

async function pay(expenseId, amount, vendorId = vendors.thai) {
    return expectStatus(
        await api.callApi("POST", "/V1/payments", {
            body: {
                pv_payee_kind: "vendor",
                pv_vendor_id: vendorId,
                pv_branch_id: "BRA202601010000001",
                pv_payment_date: todayBangkok(),
                pv_method: "cash",
                allocations: [{ pva_expense_id: expenseId, pva_amount: amount }],
            },
        }),
        201,
    );
}

test.before(async () => {
    api = await startTestServer("payables");
    adminToken = await api.loginAsAdmin();
    const [[systemRole]] = await api.pool.query("SELECT role_id FROM tb_roles WHERE role_type = 'S' LIMIT 1");
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "EX",
                levels: [{ al_min_amount_thb: "1000000", al_require_distinct: false, role_ids: [systemRole.role_id] }],
            },
        }),
        200,
    );
    vendors.thai = expectStatus(
        await api.callApi("POST", "/V1/vendors", {
            body: {
                vd_name: "บริษัท รับเหมา จำกัด",
                vd_tax_id: "0105557000347",
                vd_branch_code: "00000",
                vd_address: "9 ถนนพระราม 9 กรุงเทพฯ",
            },
        }),
        201,
    ).vd_id;
    vendors.individual = expectStatus(
        await api.callApi("POST", "/V1/vendors", {
            body: { vd_type: "individual", vd_name: "นายช่าง ฝีมือดี", vd_tax_id: "1101700230708" },
        }),
        201,
    ).vd_id;
    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    categoryId = setup.categories.find((category) => category.ec_sort_order === 1).ec_id;

    await api.pool.query(
        `INSERT INTO tb_projects (project_id, project_name, project_share_token, project_created_by)
         VALUES (?, 'แอปลูกค้า', 'token-payables-test', 'USE202601010000001')`,
        [PROJECT_ID],
    );
    await api.pool.query(
        "INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES ('PME209901010000002', ?, 'USE202601010000001')",
        [PROJECT_ID],
    );
});

test.after(async () => {
    await api?.stop();
});

test("เจ้าหนี้คงค้าง: แยกช่วงอายุตามวันครบกำหนด (เวลาไทย) · จ่ายบางส่วนเหลือยอดค้าง · จ่ายครบหายจากรายการ", async () => {
    const overdue = await approvedBill({ price: "1000", expenseDate: daysFromToday(-20), creditDays: 7 });
    const current = await approvedBill({ price: "2000", creditDays: 30 });
    const paidOff = await approvedBill({ price: "500" });
    await pay(paidOff, "500");
    await pay(current, "500");

    const aging = expectStatus(await api.callApi("GET", "/V1/payables/aging"), 200);
    const row = aging.payees.find((payee) => payee.payee_id === vendors.thai);
    assert.equal(row.expense_count, 2);
    assert.equal(row.days_1_30, "1000.00", "ครบกำหนดเมื่อ 13 วันก่อน");
    assert.equal(row.current, "1500.00", "จ่ายไปแล้ว 500 จาก 2,000");
    assert.equal(row.total, "2500.00");
    assert.equal(row.oldest_days_overdue, 13);

    const detail = expectStatus(await api.callApi("GET", `/V1/payables/aging/vendor/${vendors.thai}`), 200);
    assert.deepEqual(
        detail.expenses.map((expense) => [expense.ex_id, expense.bucket]),
        [
            [overdue, "days_1_30"],
            [current, "current"],
        ],
    );
});

test("รายงาน ภ.ง.ด.: เฉพาะ 50 ทวิ ที่ไม่ยกเลิก ของเดือนและแบบที่เลือก · ยอดรวม · กำหนดยื่น", async () => {
    const juristic = await approvedBill({ price: "10000" });
    await pay(juristic, "10000");
    const cancelled = await approvedBill({ price: "4000" });
    const cancelledPayment = await pay(cancelled, "4000");
    expectStatus(
        await api.callApi("POST", `/V1/payments/${cancelledPayment.pv_id}/cancel`, { body: { reason: "ทดสอบยกเลิก" } }),
        200,
    );
    const person = await approvedBill({ vendorId: vendors.individual, price: "3000" });
    await pay(person, "3000", vendors.individual);

    const month = todayBangkok().slice(0, 7);
    const pnd53 = expectStatus(await api.callApi("GET", `/V1/reports/withholding?month=${month}&form=PND53`), 200);
    assert.deepEqual(
        pnd53.rows.map((row) => [row.payee_tax_id, row.wtl_paid_amount, row.wtl_tax_amount]),
        [["0105557000347", "10000.00", "300.00"]],
        "ใบที่ยกเลิกไม่อยู่ในรายงาน",
    );
    assert.equal(pnd53.totals.tax_amount, "300.00");
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = monthNumber === 12 ? `${year + 1}-01` : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
    assert.deepEqual(pnd53.due_dates, { paper: `${nextMonth}-07`, online: `${nextMonth}-15` });

    const pnd3 = expectStatus(await api.callApi("GET", `/V1/reports/withholding?month=${month}&form=PND3`), 200);
    assert.equal(pnd3.totals.tax_amount, "90.00");
    assert.equal((await api.callApi("GET", "/V1/reports/withholding?month=2026-13&form=PND3")).status, 400);
});

test("ต้นทุนโปรเจกต์: บรรทัดที่อนุมัติแล้ว + VAT ที่ขอคืนไม่ได้ · รออนุมัติแยกไว้ไม่นับ · กำไรขั้นต้น = ออกบิลก่อน VAT − ต้นทุน", async () => {
    await approvedBill({ price: "2000", vat: "140", project: PROJECT_ID, whtType: null });
    // ร่าง (ยังไม่ส่ง) ผูกโปรเจกต์เดียวกัน — ไม่นับเป็นต้นทุน
    expectStatus(
        await api.callApi("POST", "/V1/expenses", {
            body: {
                ex_vendor_id: vendors.thai,
                ex_title: "ร่าง",
                ex_branch_id: "BRA202601010000001",
                ex_expense_date: todayBangkok(),
                lines: [
                    {
                        exl_category_id: categoryId,
                        exl_project_id: PROJECT_ID,
                        exl_description: "ร่าง",
                        exl_unit_price: "999",
                    },
                ],
            },
        }),
        201,
    );

    const finance = expectStatus(await api.callApi("GET", `/V1/projects/${PROJECT_ID}/finance`), 200);
    assert.equal(finance.profit.cost_thb, "2140.00", "บริษัทยังไม่จด VAT · VAT เป็นต้นทุน");
    assert.equal(finance.profit.pending_cost_thb, "999.00");
    assert.equal(finance.profit.billed_before_vat_thb, "0.00");
    assert.equal(finance.profit.gross_profit_thb, "-2140.00");
    assert.equal(finance.profit.by_category.length, 1);
    assert.equal(finance.profit.expenses.length, 1);
});

test("ไฟล์ส่งนักบัญชีมีชีตค่าใช้จ่าย · ใบสำคัญจ่าย · หัก ณ ที่จ่ายที่บริษัทหัก", async () => {
    const month = todayBangkok().slice(0, 7);
    const response = await fetch(`${api.baseUrl}/api/V1/reports/accounting-export?month=${month}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(response.status, 200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
    const expenses = workbook.getWorksheet("ค่าใช้จ่าย");
    const payments = workbook.getWorksheet("ใบสำคัญจ่าย");
    const withholding = workbook.getWorksheet("หัก ณ ที่จ่าย (บริษัทหัก)");
    assert.ok(expenses && payments && withholding);
    assert.ok(expenses.rowCount > 1);
    const taxIds = [];
    withholding.eachRow((row, rowNumber) => {
        if (rowNumber > 1) taxIds.push(row.getCell(5).value);
    });
    assert.ok(taxIds.includes("0105557000347"), "เลขผู้เสียภาษีเป็นข้อความ (ศูนย์นำหน้าไม่หาย)");
    const statuses = [];
    payments.eachRow((row, rowNumber) => {
        if (rowNumber > 1) statuses.push(row.getCell(19).value);
    });
    assert.ok(statuses.includes("ยกเลิก") && statuses.includes("จ่ายแล้ว"));
});
