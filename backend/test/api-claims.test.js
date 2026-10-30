// จัดซื้อ ขั้น 2-3 — ใบเบิกเงินพนักงาน: ทุกคนเบิกได้ · เห็น/แก้เฉพาะของตัวเอง · ต้องแนบใบเสร็จ · ผู้เบิกอนุมัติตัวเองไม่ได้ (R-P11)
// ใบเสร็จเดียวกันเบิกซ้ำไม่ได้ · บิลกับใบเบิกแยกเส้นทางกัน · audit
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.1 (เบิกเงินพนักงาน)
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");

let api;
let userCounter = 0;
let categoryId;
const people = {};

async function createPerson(name, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    userCounter += 1;
    const userId = `USE20990101000${String(userCounter).padStart(4, "0")}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, roleId: role.body.role_id, token: await api.login(name, PASSWORD) };
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const claim = (overrides = {}) => ({
    ex_title: "ค่าแท็กซี่ไปพบลูกค้า",
    ex_branch_id: "BRA202601010000001",
    ex_merchant_name: "แท็กซี่",
    ex_doc_type: "receipt",
    ex_expense_date: todayBangkok(),
    lines: [{ exl_category_id: categoryId, exl_description: "ไป-กลับ สีลม", exl_unit_price: "350" }],
    ...overrides,
});

async function createClaim(person, overrides) {
    return expectStatus(await as(person, "POST", "/V1/claims", claim(overrides)), 201).ex_id;
}

async function attachReceipt(person, claimId) {
    const form = new FormData();
    form.append("file", new Blob([PDF_BYTES], { type: "application/pdf" }), "ใบเสร็จ.pdf");
    return api.callApi("POST", `/V1/claims/${claimId}/attachments`, { token: person.token, body: form });
}

async function submittedClaim(person, overrides) {
    const claimId = await createClaim(person, overrides);
    expectStatus(await attachReceipt(person, claimId), 201);
    expectStatus(await as(person, "POST", `/V1/claims/${claimId}/submit`, {}), 200);
    return claimId;
}

test.before(async () => {
    api = await startTestServer("claims");
    await api.loginAsAdmin();

    // พนักงานทั่วไปไม่มีสิทธิ์ฝั่งจัดซื้อเลย — เบิกเงินของตัวเองได้
    people.staff = await createPerson("cl.staff", ["dashboard"]);
    people.staff2 = await createPerson("cl.staff2", ["dashboard"]);
    people.approver = await createPerson("cl.approver", ["dashboard", "viewExpenses", "approveExpense"]);
    people.viewer = await createPerson("cl.viewer", ["dashboard", "viewExpenses"]);

    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "EC",
                levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );
    // แม้ตั้งค่าให้อนุมัติเอกสารของตัวเองได้ ใบเบิกก็ยังอนุมัติตัวเองไม่ได้ (R-P11)
    await api.pool.query("UPDATE tb_company_settings SET cs_allow_self_approval = 1");

    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    categoryId = setup.categories.find((category) => category.ec_sort_order === 8).ec_id;
});

test.after(async () => {
    await api?.stop();
});

test("ทุกคนเบิกได้ · ส่งไม่ได้ถ้ายังไม่แนบใบเสร็จ · เห็นและแก้ได้เฉพาะของตัวเอง · ผู้มีสิทธิ์ดูเห็นทุกใบแต่แก้ไม่ได้", async () => {
    const claimId = await createClaim(people.staff);
    const draft = expectStatus(await as(people.staff, "GET", `/V1/claims/${claimId}`), 200);
    assert.equal(draft.expense.ex_kind, "claim");
    assert.equal(draft.expense.ex_employee_id, people.staff.userId);
    assert.equal(draft.expense.ex_total, "350.00");
    assert.equal(draft.expense.ex_wht_amount, "0.00", "ใบเบิกไม่หัก ณ ที่จ่าย");
    assert.equal(draft.actions.can_submit, true);

    const noReceipt = await as(people.staff, "POST", `/V1/claims/${claimId}/submit`, {});
    assert.equal(noReceipt.status, 400);
    assert.match(noReceipt.body.message, /แนบรูปใบเสร็จ/);

    assert.equal((await as(people.staff2, "GET", `/V1/claims/${claimId}`)).status, 404, "คนอื่นไม่เห็นใบของเรา");
    assert.equal((await as(people.staff2, "PUT", `/V1/claims/${claimId}`, claim())).status, 404);
    assert.equal((await attachReceipt(people.staff2, claimId)).status, 404);
    expectStatus(await attachReceipt(people.staff, claimId), 201);
    expectStatus(await as(people.staff, "POST", `/V1/claims/${claimId}/submit`, {}), 200);

    const mine = expectStatus(await as(people.staff, "GET", "/V1/claims"), 200);
    assert.deepEqual(
        mine.data.map((row) => row.ex_id),
        [claimId],
    );
    assert.equal(expectStatus(await as(people.staff2, "GET", "/V1/claims"), 200).total, 0);
    assert.equal((await as(people.staff, "GET", "/V1/claims?scope=all")).status, 403);

    const all = expectStatus(await as(people.viewer, "GET", "/V1/claims?scope=all"), 200);
    assert.ok(all.data.some((row) => row.ex_id === claimId && row.employee_name === "cl.staff ทดสอบ"));
    const viewerDetail = expectStatus(await as(people.viewer, "GET", `/V1/claims/${claimId}`), 200);
    assert.equal(viewerDetail.actions.can_edit, false);
    const viewerFile = await fetch(
        `${api.baseUrl}/api/V1/claims/${claimId}/attachments/${viewerDetail.attachments[0].exf_id}`,
        { headers: { Authorization: `Bearer ${people.viewer.token}` } },
    );
    assert.equal(viewerFile.status, 200, "ผู้มีสิทธิ์ดูเปิดใบเสร็จได้");
    const staff2File = await fetch(
        `${api.baseUrl}/api/V1/claims/${claimId}/attachments/${viewerDetail.attachments[0].exf_id}`,
        { headers: { Authorization: `Bearer ${people.staff2.token}` } },
    );
    assert.equal(staff2File.status, 404, "เพื่อนร่วมงานเปิดใบเสร็จของคนอื่นไม่ได้");
    assert.equal(
        (await as(people.viewer, "GET", `/V1/expenses/${claimId}`)).status,
        404,
        "ใบเบิกเปิดผ่านเส้นทางบิลไม่ได้",
    );
});

test("อนุมัติ: ผู้เบิกอนุมัติใบตัวเองไม่ได้แม้ตั้งค่าอนุมัติเอง (R-P11) · อนุมัติแล้วได้เลข EC ครบกำหนดวันที่อนุมัติ", async () => {
    const ownClaim = await submittedClaim(people.approver, { ex_title: "ค่าที่จอดรถ" });
    const selfApprove = await as(people.approver, "POST", `/V1/claims/${ownClaim}/approve`, {});
    assert.equal(selfApprove.status, 403);
    assert.match(selfApprove.body.message, /ผู้สร้าง/);

    const claimId = await submittedClaim(people.staff, { ex_expense_date: todayBangkok() });
    const pending = expectStatus(await as(people.approver, "GET", `/V1/claims/${claimId}`), 200);
    assert.equal(pending.actions.can_approve, true);
    const approved = expectStatus(
        await as(people.approver, "POST", `/V1/claims/${claimId}/approve`, { ex_version: pending.expense.ex_version }),
        200,
    );
    assert.match(approved.ex_number, /^EC-\d{8}-\d{6}$/);
    const done = expectStatus(await as(people.staff, "GET", `/V1/claims/${claimId}`), 200);
    assert.equal(done.expense.ex_status, "approved");
    assert.equal(done.expense.ex_due_date, todayBangkok());
    assert.equal(done.expense.payment_state, "unpaid");
    assert.equal(done.actions.can_cancel, false, "ผู้เบิกยกเลิกใบที่ผ่านการอนุมัติแล้วเองไม่ได้");

    assert.equal((await as(people.staff, "POST", `/V1/claims/${claimId}/cancel`, { reason: "เบิกผิด" })).status, 403);
    expectStatus(
        await as(people.approver, "POST", `/V1/claims/${claimId}/cancel`, {
            reason: "พนักงานเบิกผิดใบ",
            ex_version: done.expense.ex_version,
        }),
        200,
    );
});

test("ใบเสร็จเดียวกันเบิกซ้ำไม่ได้ (คนละคนได้) · ใบรับรองแทนใบเสร็จส่งได้โดยไม่ต้องแนบ · บิลเปิดผ่านเส้นทางใบเบิกไม่ได้ · audit", async () => {
    await createClaim(people.staff, { ex_vendor_doc_no: "RC-0001" });
    const duplicate = await as(people.staff, "POST", "/V1/claims", claim({ ex_vendor_doc_no: "rc-0001" }));
    assert.equal(duplicate.status, 400);
    assert.ok(duplicate.body.fields.ex_vendor_doc_no);
    await createClaim(people.staff2, { ex_vendor_doc_no: "RC-0001" });

    const substitute = await createClaim(people.staff, {
        ex_doc_type: "substitute_receipt",
        ex_title: "ค่าวินมอเตอร์ไซค์",
    });
    const submitted = expectStatus(await as(people.staff, "POST", `/V1/claims/${substitute}/submit`, {}), 200);
    assert.equal(submitted.auto_approved, false, "กติกา EC เริ่มที่ 0 · ทุกใบต้องอนุมัติ");

    const vendor = expectStatus(await api.callApi("POST", "/V1/vendors", { body: { vd_name: "ร้านค้าทดสอบ" } }), 201);
    const bill = expectStatus(
        await api.callApi("POST", "/V1/expenses", {
            body: {
                ex_vendor_id: vendor.vd_id,
                ex_title: "บิลทดสอบ",
                ex_branch_id: "BRA202601010000001",
                ex_expense_date: todayBangkok(),
                lines: [{ exl_category_id: categoryId, exl_description: "ค่าเดินทาง", exl_unit_price: "100" }],
            },
        }),
        201,
    );
    assert.equal((await as(people.viewer, "GET", `/V1/claims/${bill.ex_id}`)).status, 404);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/claims%' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "บันทึกร่างใบเบิกเงิน",
        "แนบไฟล์ใบเบิก",
        "ส่งใบเบิกเงิน",
        "อนุมัติใบเบิกเงิน",
        "ยกเลิกใบเบิกเงิน",
        "เปิดไฟล์แนบใบเบิก",
    ]) {
        assert.ok(actions.has(expected), `audit ต้องมี "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
