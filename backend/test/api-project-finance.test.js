// การเงินโปรเจกต์ (ขั้น 1D-1) — สัญญา/ออกบิล/รับ/ค้าง/ยังไม่ออกบิล แยกสกุล + รวมบาท · งานเสร็จเทียบออกบิล · สิทธิ์ (D1)
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-15-finance-1d.md หัวข้อ 3.1 และ R-D1/R-D5/R-D10
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const HEAD_OFFICE_ID = "BRA202601010000001";
const PASSWORD = "Staff@2026";

let api;
let clientId;
let projectId;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 100;
async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    userCounter += 1;
    const userId = `USE20990101000${String(userCounter).padStart(4, "0")}`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, passwordHash, name, role.body.role_id],
    );
    return { userId, roleId: role.body.role_id, token: await api.login(name, PASSWORD) };
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const admin = (method, url, body) => api.callApi(method, url, { body });

async function approvedQuotation(body) {
    const quotation = expectStatus(
        await admin("POST", "/V1/quotations", {
            qt_client_id: clientId,
            qt_branch_id: HEAD_OFFICE_ID,
            qt_valid_days: 30,
            ...body,
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/submit`, {}), 200);
    expectStatus(await admin("POST", `/V1/quotations/${quotation.qt_id}/approve`, {}), 200);
    return quotation.qt_id;
}

async function milestoneIds(quotationId) {
    const billable = expectStatus(await admin("GET", `/V1/quotations/${quotationId}/billable-milestones`), 200);
    return billable.milestones.map((milestone) => milestone.qtm_id);
}

async function addMember(person) {
    await api.pool.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        `PRM${person.userId.slice(3)}`,
        projectId,
        person.userId,
    ]);
}

test.before(async () => {
    api = await startTestServer("project_finance");
    await api.loginAsAdmin();
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
    const client = expectStatus(await admin("POST", "/V1/clients", { client_name: "บริษัท โปรเจกต์ จำกัด" }), 201);
    clientId = client.client_id;

    // ใบที่ 1 (บาท): รายการ ก 60,000 + ข 40,000 = 100,000 + VAT 7% · งวด 30/40/30 → 32,100 / 42,800 / 32,100
    const thbQuotation = await approvedQuotation({
        qt_title: "ระบบหลังบ้าน",
        qt_currency: "THB",
        qt_payment_mode: "milestones",
        milestones: [
            { qtm_name: "มัดจำ", qtm_percent: "30" },
            { qtm_name: "ส่งมอบรอบแรก", qtm_percent: "40" },
            { qtm_name: "ปิดงาน", qtm_percent: "30" },
        ],
        items: [
            { qti_type: "item", qti_description: "งาน ก", qti_quantity: "1", qti_unit_price: "60000" },
            { qti_type: "item", qti_description: "งาน ข", qti_quantity: "1", qti_unit_price: "40000" },
        ],
    });
    const accepted = expectStatus(
        await admin("POST", `/V1/quotations/${thbQuotation}/accept`, { project_mode: "new", create_tasks: true }),
        200,
    );
    projectId = accepted.project_id;

    // ใบที่ 2 (USD 1,000 + VAT = 1,070 × 35.5 = 37,985 บาท) ผูกโปรเจกต์เดิม ยังไม่ออกบิล
    const usdQuotation = await approvedQuotation({
        qt_title: "แอปมือถือ",
        qt_currency: "USD",
        qt_exchange_rate: "35.5",
        qt_rate_source: "manual",
        qt_rate_override_reason: "อัตราคงที่",
        items: [{ qti_type: "item", qti_description: "แอป", qti_quantity: "1", qti_unit_price: "1000" }],
    });
    expectStatus(
        await admin("POST", `/V1/quotations/${usdQuotation}/accept`, {
            project_mode: "existing",
            project_id: projectId,
            create_tasks: false,
        }),
        200,
    );

    // งวด 1 ออกแล้ว + รับ 10,000 (เกินกำหนด) · งวด 2 ร่าง · งวด 3 ออกแล้วยกเลิก (กลับเป็นยังไม่ออกบิล)
    const [first, second, third] = await milestoneIds(thbQuotation);
    const firstInvoice = expectStatus(
        await admin("POST", "/V1/invoices", { quotation_id: thbQuotation, milestone_ids: [first] }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${firstInvoice.inv_id}/issue`, {}), 200);
    expectStatus(await admin("POST", "/V1/invoices", { quotation_id: thbQuotation, milestone_ids: [second] }), 201);
    const thirdInvoice = expectStatus(
        await admin("POST", "/V1/invoices", { quotation_id: thbQuotation, milestone_ids: [third] }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${thirdInvoice.inv_id}/issue`, {}), 200);
    expectStatus(await admin("POST", `/V1/invoices/${thirdInvoice.inv_id}/cancel`, { reason: "ออกเร็วไป" }), 200);
    expectStatus(
        await admin("POST", "/V1/receipts", {
            rc_client_id: clientId,
            rc_branch_id: HEAD_OFFICE_ID,
            rc_receipt_date: todayBangkok(),
            rc_method: "cash",
            allocations: [{ rca_invoice_id: firstInvoice.inv_id, rca_amount: "10000" }],
        }),
        201,
    );
    await api.pool.query("UPDATE tb_invoices SET inv_due_date = ? WHERE inv_id = ?", [
        daysFromToday(-3),
        firstInvoice.inv_id,
    ]);

    // ใบสร้างเองของโปรเจกต์ (นอกสัญญา) 1,000 + VAT = 1,070 · อนุมัติแล้วออกอัตโนมัติ
    const manual = expectStatus(
        await admin("POST", "/V1/invoices", {
            inv_client_id: clientId,
            inv_branch_id: HEAD_OFFICE_ID,
            inv_project_id: projectId,
            inv_title: "ค่าเซิร์ฟเวอร์เพิ่ม",
            inv_credit_days: 30,
            items: [
                { invi_type: "item", invi_description: "เซิร์ฟเวอร์", invi_quantity: "1", invi_unit_price: "1000" },
            ],
        }),
        201,
    );
    expectStatus(await admin("POST", `/V1/invoices/${manual.inv_id}/submit`, {}), 200);
    expectStatus(await admin("POST", `/V1/invoices/${manual.inv_id}/approve`, {}), 200);

    // งาน ก เสร็จ → งานเสร็จ 60% ของมูลค่า (ออกบิลไป 30%)
    await api.pool.query(
        `UPDATE tb_tasks t JOIN tb_quotation_items i ON i.qti_id = t.task_quotation_item_id
         SET t.task_status = 'done' WHERE t.project_id = ? AND i.qti_description = 'งาน ก'`,
        [projectId],
    );

    people.financeMember = await createPerson("pf.finance", ["dashboard", "viewOwnProjects", "viewInvoices"]);
    people.developer = await createPerson("pf.developer", ["dashboard", "viewOwnProjects"]);
    people.outsider = await createPerson("pf.outsider", ["dashboard", "viewOwnProjects", "viewInvoices"]);
    people.allProjects = await createPerson("pf.all", ["dashboard", "viewAllProjects", "viewInvoices"]);
    await addMember(people.financeMember);
    await addMember(people.developer);
});

test.after(async () => {
    await api?.stop();
});

test("สรุปแยกสกุล + รวมบาท: ใบยกเลิก/ร่างไม่นับเป็นออกบิล · ยอดต่างสกุลไม่บวกกันตรงๆ", async () => {
    const finance = expectStatus(
        await api.callApi("GET", `/V1/projects/${projectId}/finance`, { token: people.financeMember.token }),
        200,
    );
    const thb = finance.currencies.find((row) => row.currency === "THB");
    const usd = finance.currencies.find((row) => row.currency === "USD");
    assert.deepEqual(
        [
            thb.contract,
            thb.billed,
            thb.billed_manual,
            thb.received,
            thb.outstanding,
            thb.overdue,
            thb.unbilled,
            thb.in_draft,
        ],
        ["107000.00", "33170.00", "1070.00", "10000.00", "23170.00", "22100.00", "32100.00", "42800.00"],
    );
    assert.deepEqual(
        [usd.contract, usd.contract_thb, usd.billed, usd.unbilled, usd.unbilled_thb],
        ["1070.00", "37985.00", "0.00", "1070.00", "37985.00"],
    );
    assert.deepEqual(finance.totals_thb, {
        contract: "144985.00",
        billed: "33170.00",
        credited: "0.00",
        received: "10000.00",
        outstanding: "23170.00",
        overdue: "22100.00",
        unbilled: "70085.00",
    });
    assert.ok(!finance.invoices.some((invoice) => invoice.inv_status === "cancelled"));
});

test("งวดของใบเสนอราคา: ออกบิลแล้ว / ร่าง / ยังไม่ออก (ใบยกเลิกคืนงวด) · งวดถัดไป · งานเสร็จนำหน้าการออกบิล", async () => {
    const finance = expectStatus(
        await api.callApi("GET", `/V1/projects/${projectId}/finance`, { token: people.financeMember.token }),
        200,
    );
    const thbQuotation = finance.quotations.find((quotation) => quotation.qt_currency === "THB");
    assert.deepEqual(
        thbQuotation.milestones.map((milestone) => [milestone.qtm_order, milestone.state]),
        [
            [1, "billed"],
            [2, "draft"],
            [3, "unbilled"],
        ],
    );
    assert.equal(thbQuotation.next_milestone.qtm_order, 3, "งวดที่ร่างไว้ไม่ใช่งวดถัดไปที่ต้องออก");
    assert.equal(thbQuotation.billed_percent, 30);
    assert.equal(thbQuotation.progress_percent, 60);
    assert.equal(thbQuotation.items_with_tasks, 2);
    assert.equal(thbQuotation.is_work_ahead_of_billing, true);

    const usdQuotation = finance.quotations.find((quotation) => quotation.qt_currency === "USD");
    assert.equal(usdQuotation.progress_percent, null, "ไม่ได้สร้างงาน = ไม่มีค่าประมาณ");
    assert.equal(usdQuotation.items_without_tasks, 1);
    assert.equal(usdQuotation.is_work_ahead_of_billing, false);
});

test("สิทธิ์ (D1, R-D10): สมาชิกที่ไม่มีสิทธิ์ดูใบแจ้งหนี้ได้ 403 · คนนอกโปรเจกต์ 403 · ดูทุกโปรเจกต์ได้", async () => {
    const developer = await api.callApi("GET", `/V1/projects/${projectId}/finance`, { token: people.developer.token });
    assert.equal(developer.status, 403);
    const outsider = await api.callApi("GET", `/V1/projects/${projectId}/finance`, { token: people.outsider.token });
    assert.equal(outsider.status, 403);
    expectStatus(
        await api.callApi("GET", `/V1/projects/${projectId}/finance`, { token: people.allProjects.token }),
        200,
    );
    const missing = await api.callApi("GET", "/V1/projects/PRO209901010000001/finance", {
        token: people.allProjects.token,
    });
    assert.equal(missing.status, 404);
});
