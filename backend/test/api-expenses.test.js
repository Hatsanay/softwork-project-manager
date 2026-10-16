// จัดซื้อ ขั้น 2-2 — ค่าใช้จ่าย / บิลผู้ขาย: ยอดคำนวณใน backend · อนุมัติอัตโนมัติต่ำกว่าวงเงิน / ตามชั้น · กันบิลซ้ำ
// ไฟล์แนบส่วนตัว · สิทธิ์ · ลบผู้ขาย/โปรเจกต์ที่มีค่าใช้จ่ายไม่ได้ · audit
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 4.1 และ R-P2/R-P7/R-P8/R-P12
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n");
const PROJECT_ID = "PRO209901010000001";

let api;
let userCounter = 0;
const people = {};
const vendors = {};
const categories = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

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

function uploadForm(buffer, fileName, type) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type }), fileName);
    return form;
}

const bill = (overrides = {}) => ({
    ex_vendor_id: vendors.thai,
    ex_title: "ค่าจ้างออกแบบหน้าเว็บ",
    ex_branch_id: "BRA202601010000001",
    ex_vendor_doc_no: null,
    ex_vendor_doc_date: todayBangkok(),
    ex_doc_type: "receipt",
    ex_expense_date: todayBangkok(),
    ex_credit_days: 15,
    ex_vat_amount: "0",
    ex_wht_income_type: "SERVICE",
    lines: [
        {
            exl_category_id: categories.freelance,
            exl_description: "ออกแบบหน้าแรก",
            exl_quantity: "1",
            exl_unit_price: "1500",
        },
        {
            exl_category_id: categories.freelance,
            exl_project_id: PROJECT_ID,
            exl_description: "ออกแบบหน้าย่อย",
            exl_quantity: "2",
            exl_unit_price: "250",
        },
    ],
    ...overrides,
});

async function createBill(person, overrides) {
    return expectStatus(await as(person, "POST", "/V1/expenses", bill(overrides)), 201).ex_id;
}

async function detailOf(expenseId, person = people.clerk) {
    return expectStatus(await as(person, "GET", `/V1/expenses/${expenseId}`), 200);
}

test.before(async () => {
    api = await startTestServer("expenses");
    await api.loginAsAdmin();

    people.clerk = await createPerson("ex.clerk", ["dashboard", "createExpense"]);
    people.approver = await createPerson("ex.approver", ["dashboard", "viewExpenses", "approveExpense"]);
    people.viewer = await createPerson("ex.viewer", ["dashboard", "viewExpenses"]);
    people.outsider = await createPerson("ex.outsider", ["dashboard", "viewInvoices"]);

    // กติกา EX: ตั้งแต่ 3,000 บาท ผู้อนุมัติค่าใช้จ่ายอนุมัติ (ต่ำกว่าผ่านอัตโนมัติ — P2)
    expectStatus(
        await api.callApi("PUT", "/V1/company/approval-levels", {
            body: {
                doc_type: "EX",
                levels: [{ al_min_amount_thb: "3000", al_require_distinct: false, role_ids: [people.approver.roleId] }],
            },
        }),
        200,
    );

    const thai = await api.callApi("POST", "/V1/vendors", {
        body: {
            vd_name: "บริษัท ออกแบบดี จำกัด",
            vd_tax_id: "0105557000347",
            vd_branch_code: "00000",
            vd_default_income_type: "SERVICE",
        },
    });
    vendors.thai = expectStatus(thai, 201).vd_id;
    vendors.other = expectStatus(
        await api.callApi("POST", "/V1/vendors", { body: { vd_name: "ร้านเครื่องเขียน" } }),
        201,
    ).vd_id;
    vendors.foreign = expectStatus(
        await api.callApi("POST", "/V1/vendors", {
            body: { vd_country: "US", vd_name: "Figma Inc.", vd_currency: "USD" },
        }),
        201,
    ).vd_id;

    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    categories.freelance = setup.categories.find((category) => category.ec_sort_order === 1).ec_id;
    categories.software = setup.categories.find((category) => category.ec_sort_order === 3).ec_id;

    await api.pool.query(
        `INSERT INTO tb_projects (project_id, project_name, project_share_token, project_created_by)
         VALUES (?, 'เว็บไซต์ลูกค้า', 'token-expense-test', 'USE202601010000001')`,
        [PROJECT_ID],
    );
    // ผู้ลบโปรเจกต์ต้องเป็นสมาชิกที่ตำแหน่งมีสิทธิ์ลบ (PM จาก seed)
    await api.pool.query(
        "INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES ('PME209901010000001', ?, 'USE202601010000001')",
        [PROJECT_ID],
    );
    await api.pool.query(
        "INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES ('PME209901010000001', 'POS202601010000001')",
    );
});

test.after(async () => {
    await api?.stop();
});

test("ยอดต่ำกว่าวงเงิน: ผ่านอัตโนมัติ ได้เลข EX · ยอด/หัก ณ ที่จ่าย/ครบกำหนดคิดใน backend · แก้ไม่ได้ · ผู้บันทึกยกเลิกเองได้", async () => {
    const expenseId = await createBill(people.clerk, { ex_vendor_doc_no: "RC-1001" });
    const draft = await detailOf(expenseId);
    assert.equal(draft.expense.ex_status, "draft");
    assert.equal(draft.expense.ex_number, null, "ร่างยังไม่มีเลข");
    assert.equal(draft.expense.ex_subtotal, "2000.00");
    assert.equal(draft.expense.ex_total, "2000.00");
    assert.equal(draft.expense.ex_wht_rate, "3.00");
    assert.equal(draft.expense.ex_wht_amount, "60.00", "ค่าบริการ 3% ของยอดก่อน VAT");
    assert.equal(draft.expense.ex_due_date, daysFromToday(15));
    assert.equal(draft.expense.wht_form, "PND53");
    assert.equal(draft.checks.net_payable, "1940.00");
    assert.equal(draft.lines[1].project_name, "เว็บไซต์ลูกค้า");
    assert.ok(
        draft.readiness.every((item) => item.ok),
        JSON.stringify(draft.readiness),
    );

    const submitted = expectStatus(
        await as(people.clerk, "POST", `/V1/expenses/${expenseId}/submit`, { ex_version: draft.expense.ex_version }),
        200,
    );
    assert.equal(submitted.auto_approved, true);
    assert.match(submitted.ex_number, /^EX-\d{8}-\d{6}$/);

    const approved = await detailOf(expenseId);
    assert.equal(approved.expense.ex_status, "approved");
    assert.equal(approved.expense.ex_auto_approved, true);
    assert.equal(approved.expense.payment_state, "unpaid");
    assert.equal(approved.expense.outstanding_amount, "2000.00");
    assert.equal(approved.actions.can_cancel, true, "ผ่านอัตโนมัติ — ผู้บันทึกยกเลิกเองได้");

    const edit = await as(
        people.clerk,
        "PUT",
        `/V1/expenses/${expenseId}`,
        bill({ ex_version: approved.expense.ex_version }),
    );
    assert.equal(edit.status, 409);
    const unpaid = expectStatus(await as(people.viewer, "GET", "/V1/expenses?tab=unpaid"), 200);
    assert.ok(unpaid.data.some((row) => row.ex_id === expenseId));

    expectStatus(
        await as(people.clerk, "POST", `/V1/expenses/${expenseId}/cancel`, {
            reason: "บันทึกผิดผู้ขาย",
            ex_version: approved.expense.ex_version,
        }),
        200,
    );
    const cancelled = await detailOf(expenseId);
    assert.equal(cancelled.expense.ex_status, "cancelled");
    assert.equal(cancelled.expense.ex_number, submitted.ex_number, "ยกเลิกแล้วเลขยังอยู่");
});

test("ยอดเกินวงเงิน: รออนุมัติตามชั้น · ผู้บันทึกอนุมัติไม่ได้ · ตีกลับแก้แล้วส่งใหม่ · อนุมัติแล้วได้เลข · VAT ต่างจากที่คิดมีเตือน", async () => {
    const expenseId = await createBill(people.clerk, {
        ex_doc_type: "tax_invoice",
        ex_vendor_doc_no: "TAX-2001",
        ex_vat_amount: "400",
        lines: [
            {
                exl_category_id: categories.freelance,
                exl_description: "พัฒนาระบบ",
                exl_quantity: "1",
                exl_unit_price: "5000",
            },
        ],
    });
    const draft = await detailOf(expenseId);
    assert.equal(draft.checks.suggested_vat, "350.00");
    assert.equal(draft.checks.is_vat_different, true, "ใส่ VAT 400 แต่ 7% ของ 5,000 = 350");
    assert.equal(draft.expense.ex_vat_rate, "7.00");
    assert.equal(draft.expense.ex_vat_claimable, false, "บริษัทยังไม่จด VAT — ภาษีซื้อเป็นต้นทุน");

    const submitted = expectStatus(
        await as(people.clerk, "POST", `/V1/expenses/${expenseId}/submit`, { ex_version: draft.expense.ex_version }),
        200,
    );
    assert.equal(submitted.auto_approved, false);
    assert.deepEqual(submitted.approval_levels, [1]);
    assert.equal(submitted.ex_number, null);

    const waiting = expectStatus(await as(people.approver, "GET", "/V1/expenses?tab=waiting_me"), 200);
    assert.ok(waiting.data.some((row) => row.ex_id === expenseId));
    assert.equal((await as(people.clerk, "POST", `/V1/expenses/${expenseId}/approve`, {})).status, 403);

    const pending = await detailOf(expenseId, people.approver);
    assert.equal(pending.actions.can_approve, true);
    expectStatus(
        await as(people.approver, "POST", `/V1/expenses/${expenseId}/return`, {
            reason: "VAT ไม่ตรงกับใบกำกับ",
            ex_version: pending.expense.ex_version,
        }),
        200,
    );
    const returned = await detailOf(expenseId);
    assert.equal(returned.expense.ex_status, "draft");
    assert.equal(returned.expense.ex_returned_reason, "VAT ไม่ตรงกับใบกำกับ");

    expectStatus(
        await as(
            people.clerk,
            "PUT",
            `/V1/expenses/${expenseId}`,
            bill({
                ex_doc_type: "tax_invoice",
                ex_vendor_doc_no: "TAX-2001",
                ex_vat_amount: "350",
                lines: [
                    {
                        exl_category_id: categories.freelance,
                        exl_description: "พัฒนาระบบ",
                        exl_quantity: "1",
                        exl_unit_price: "5000",
                    },
                ],
                ex_version: returned.expense.ex_version,
            }),
        ),
        200,
    );
    const fixed = await detailOf(expenseId);
    assert.equal(fixed.checks.is_vat_different, false);
    assert.equal(fixed.expense.ex_total, "5350.00");
    expectStatus(
        await as(people.clerk, "POST", `/V1/expenses/${expenseId}/submit`, { ex_version: fixed.expense.ex_version }),
        200,
    );

    const resubmitted = await detailOf(expenseId, people.approver);
    const approved = expectStatus(
        await as(people.approver, "POST", `/V1/expenses/${expenseId}/approve`, {
            ex_version: resubmitted.expense.ex_version,
        }),
        200,
    );
    assert.equal(approved.is_final, true);
    assert.match(approved.ex_number, /^EX-\d{8}-\d{6}$/);
    const done = await detailOf(expenseId, people.approver);
    assert.equal(done.expense.ex_status, "approved");
    assert.equal(done.expense.ex_auto_approved, false);
    assert.deepEqual(
        done.approval_history.map((row) => [row.expa_round, row.expa_action]),
        [
            [1, "return"],
            [2, "approve"],
        ],
    );
    assert.equal(done.actions.can_cancel, true, "ผู้อนุมัติยกเลิกได้");
    assert.equal((await detailOf(expenseId)).actions.can_cancel, false, "ผ่านการอนุมัติแล้ว ผู้บันทึกยกเลิกเองไม่ได้");
});

test("กันบิลซ้ำ (R-P2): ผู้ขาย + เลขเอกสารเดียวกันบันทึกซ้ำไม่ได้ (ไม่สนตัวพิมพ์/ช่องว่างซ้อน) · ยิงพร้อมกันได้ใบเดียว · ไม่มีเลขเตือนยอดซ้ำ", async () => {
    const first = await createBill(people.clerk, { ex_vendor_doc_no: "INV 3001" });
    const duplicate = await as(people.clerk, "POST", "/V1/expenses", bill({ ex_vendor_doc_no: "  inv   3001 " }));
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.body.fields.ex_vendor_doc_no, /ร่างที่ใช้เลขนี้/);
    await createBill(people.clerk, {
        ex_vendor_id: vendors.other,
        ex_wht_income_type: null,
        ex_vendor_doc_no: "INV 3001",
    });

    const draft = await detailOf(first);
    expectStatus(
        await as(people.clerk, "DELETE", `/V1/expenses/${first}`, { ex_version: draft.expense.ex_version }),
        204,
    );
    await createBill(people.clerk, { ex_vendor_doc_no: "INV 3001" });

    const results = await Promise.all(
        [1, 2, 3].map(() => as(people.clerk, "POST", "/V1/expenses", bill({ ex_vendor_doc_no: "INV-RACE" }))),
    );
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 400, 400]);

    const withoutNumberA = await createBill(people.clerk, { ex_title: "ไม่มีเลข ก" });
    const withoutNumberB = await createBill(people.clerk, { ex_title: "ไม่มีเลข ข" });
    const possible = (await detailOf(withoutNumberB)).possible_duplicates.map((row) => row.ex_id);
    assert.ok(possible.includes(withoutNumberA), "ผู้ขาย วันที่ ยอดเดียวกัน — เตือน");
});

test("ผู้ขายต่างประเทศ: ไม่หัก ณ ที่จ่าย · วงเงินอนุมัติเทียบยอดบาท", async () => {
    const expenseId = await createBill(people.clerk, {
        ex_vendor_id: vendors.foreign,
        ex_title: "Figma รายปี",
        ex_doc_type: "invoice",
        ex_vendor_doc_no: "FIG-7788",
        ex_currency: "USD",
        ex_exchange_rate: "35.5",
        ex_rate_source: "manual",
        ex_rate_override_reason: "อัตราตามที่บัตรเครดิตตัดจริง",
        ex_wht_income_type: "SERVICE",
        lines: [
            {
                exl_category_id: categories.software,
                exl_description: "Figma Professional",
                exl_quantity: "1",
                exl_unit_price: "100",
            },
        ],
    });
    const draft = await detailOf(expenseId);
    assert.equal(draft.expense.ex_wht_income_type, null, "ต่างประเทศไม่ออก 50 ทวิ");
    assert.equal(draft.expense.ex_wht_amount, "0.00");
    assert.equal(draft.expense.ex_subtotal_thb, "3550.00");
    assert.equal(draft.expense.wht_form, null);

    const submitted = expectStatus(
        await as(people.clerk, "POST", `/V1/expenses/${expenseId}/submit`, { ex_version: draft.expense.ex_version }),
        200,
    );
    assert.equal(submitted.auto_approved, false, "100 USD = 3,550 บาท ถึงวงเงิน 3,000");

    const withoutReason = await as(
        people.clerk,
        "POST",
        "/V1/expenses",
        bill({ ex_vendor_id: vendors.foreign, ex_currency: "USD", ex_exchange_rate: "35.5", ex_rate_source: "manual" }),
    );
    assert.equal(withoutReason.status, 400);
    assert.ok(withoutReason.body.fields.ex_rate_override_reason);
});

test("ตรวจข้อมูล: วันที่ผิดปี · หมวดที่ปิดใช้งาน · ส่งไม่ได้ถ้าไม่มีบรรทัด/เลขเอกสารที่ชนิดเอกสารต้องมี", async () => {
    const oldDate = await as(people.clerk, "POST", "/V1/expenses", bill({ ex_expense_date: daysFromToday(-400) }));
    assert.equal(oldDate.status, 400);
    assert.match(oldDate.body.fields.ex_expense_date, /ย้อนหลังได้ไม่เกิน/);
    const futureDate = await as(people.clerk, "POST", "/V1/expenses", bill({ ex_expense_date: daysFromToday(40) }));
    assert.equal(futureDate.status, 400);

    const [[inactive]] = await api.pool.query("SELECT ec_id FROM tb_expense_categories WHERE ec_sort_order = 99");
    await api.pool.query("UPDATE tb_expense_categories SET ec_status = 'inactive' WHERE ec_id = ?", [inactive.ec_id]);
    const inactiveCategory = await as(
        people.clerk,
        "POST",
        "/V1/expenses",
        bill({ lines: [{ exl_category_id: inactive.ec_id, exl_description: "อื่นๆ", exl_unit_price: "10" }] }),
    );
    assert.equal(inactiveCategory.status, 400);
    assert.ok(inactiveCategory.body.fields["lines.0.exl_category_id"]);
    await api.pool.query("UPDATE tb_expense_categories SET ec_status = 'active' WHERE ec_id = ?", [inactive.ec_id]);

    const empty = await createBill(people.clerk, { lines: [], ex_doc_type: "tax_invoice" });
    const notReady = await as(people.clerk, "POST", `/V1/expenses/${empty}/submit`, {});
    assert.equal(notReady.status, 400);
    assert.equal(notReady.body.code, "EXPENSE_NOT_READY");
    assert.match(notReady.body.message, /อย่างน้อย 1 บรรทัด/);
    assert.match(notReady.body.message, /เลขที่และวันที่ของเอกสารผู้ขาย/);

    const substitute = await createBill(people.clerk, { ex_doc_type: "substitute_receipt", ex_vendor_doc_date: null });
    const substituteSubmit = expectStatus(await as(people.clerk, "POST", `/V1/expenses/${substitute}/submit`, {}), 200);
    assert.equal(substituteSubmit.auto_approved, true, "ใบรับรองแทนใบเสร็จไม่ต้องมีเลขเอกสาร");
});

test("ไฟล์แนบ: เปิดผ่าน API ที่ตรวจสิทธิ์ · ตรวจชนิดจากเนื้อไฟล์ · ลบได้เฉพาะร่าง แนบเพิ่มหลังอนุมัติได้ · ลบร่างแล้วไฟล์หาย", async () => {
    const expenseId = await createBill(people.clerk, { ex_vendor_doc_no: "RC-5001" });
    const fake = await api.callApi("POST", `/V1/expenses/${expenseId}/attachments`, {
        token: people.clerk.token,
        body: uploadForm(Buffer.from("not really a pdf file"), "fake.pdf", "application/pdf"),
    });
    assert.equal(fake.status, 400);

    const viewerUpload = await api.callApi("POST", `/V1/expenses/${expenseId}/attachments`, {
        token: people.viewer.token,
        body: uploadForm(PDF_BYTES, "ใบเสร็จ.pdf", "application/pdf"),
    });
    assert.equal(viewerUpload.status, 403, "ดูได้อย่างเดียว แนบไม่ได้");

    const uploaded = expectStatus(
        await api.callApi("POST", `/V1/expenses/${expenseId}/attachments`, {
            token: people.clerk.token,
            body: uploadForm(PDF_BYTES, "ใบเสร็จ ร้าน.pdf", "application/pdf"),
        }),
        201,
    );
    assert.equal(uploaded.exf_file_name, "ใบเสร็จ ร้าน.pdf");
    const [[stored]] = await api.pool.query("SELECT exf_file_path FROM tb_expense_attachments WHERE exf_id = ?", [
        uploaded.exf_id,
    ]);
    assert.match(stored.exf_file_path, /^expense-documents\//);
    const storedFile = path.join(process.env.DOCUMENT_STORAGE_DIR, stored.exf_file_path);
    assert.ok(fs.existsSync(storedFile));

    const fileUrl = `${api.baseUrl}/api/V1/expenses/${expenseId}/attachments/${uploaded.exf_id}`;
    const opened = await fetch(fileUrl, { headers: { Authorization: `Bearer ${people.viewer.token}` } });
    assert.equal(opened.status, 200);
    assert.equal(opened.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await opened.arrayBuffer()), PDF_BYTES);
    const outsiderOpen = await fetch(fileUrl, { headers: { Authorization: `Bearer ${people.outsider.token}` } });
    assert.equal(outsiderOpen.status, 403);

    expectStatus(await as(people.clerk, "POST", `/V1/expenses/${expenseId}/submit`, {}), 200);
    const removeAfterSubmit = await as(
        people.clerk,
        "DELETE",
        `/V1/expenses/${expenseId}/attachments/${uploaded.exf_id}`,
    );
    assert.equal(removeAfterSubmit.status, 409, "อนุมัติแล้วไฟล์เป็นหลักฐาน ลบไม่ได้");
    expectStatus(
        await api.callApi("POST", `/V1/expenses/${expenseId}/attachments`, {
            token: people.clerk.token,
            body: uploadForm(PDF_BYTES, "ใบกำกับตัวจริง.pdf", "application/pdf"),
        }),
        201,
    );
    assert.equal((await detailOf(expenseId)).attachments.length, 2);

    const draftId = await createBill(people.clerk, { ex_vendor_doc_no: "RC-5002" });
    const draftFile = expectStatus(
        await api.callApi("POST", `/V1/expenses/${draftId}/attachments`, {
            token: people.clerk.token,
            body: uploadForm(PDF_BYTES, "a.pdf", "application/pdf"),
        }),
        201,
    );
    const [[draftStored]] = await api.pool.query("SELECT exf_file_path FROM tb_expense_attachments WHERE exf_id = ?", [
        draftFile.exf_id,
    ]);
    expectStatus(await as(people.clerk, "DELETE", `/V1/expenses/${draftId}`, {}), 204);
    assert.equal(fs.existsSync(path.join(process.env.DOCUMENT_STORAGE_DIR, draftStored.exf_file_path)), false);
});

test("สิทธิ์ · ลบผู้ขาย/โปรเจกต์ที่มีค่าใช้จ่ายไม่ได้ · คัดลอกเป็นร่างใหม่ · audit", async () => {
    assert.equal((await as(people.viewer, "GET", "/V1/expenses")).status, 200);
    assert.equal((await as(people.viewer, "POST", "/V1/expenses", bill())).status, 403);
    assert.equal((await as(people.outsider, "GET", "/V1/expenses")).status, 403);
    const projectOptions = expectStatus(
        await as(people.clerk, "GET", "/V1/expenses/project-options?search=เว็บไซต์"),
        200,
    );
    assert.deepEqual(
        projectOptions.data.map((project) => project.project_id),
        [PROJECT_ID],
        "ผู้บันทึกเลือกโปรเจกต์ได้แม้ไม่ได้เป็นสมาชิก",
    );

    const vendorDelete = await api.callApi("DELETE", `/V1/vendors/${vendors.thai}`);
    assert.equal(vendorDelete.status, 409);
    assert.equal(vendorDelete.body.code, "VENDOR_IN_USE");
    const projectDelete = await api.callApi("DELETE", `/V1/projects/${PROJECT_ID}`);
    assert.equal(projectDelete.status, 409);
    assert.equal(projectDelete.body.code, "PROJECT_HAS_EXPENSES");

    const sourceId = await createBill(people.clerk, { ex_vendor_doc_no: "MONTHLY-01", ex_title: "ค่าโฮสติ้งรายเดือน" });
    const copied = expectStatus(await as(people.clerk, "POST", `/V1/expenses/${sourceId}/copy`, {}), 201);
    const copy = await detailOf(copied.ex_id);
    assert.equal(copy.expense.ex_status, "draft");
    assert.equal(copy.expense.ex_title, "ค่าโฮสติ้งรายเดือน");
    assert.equal(copy.expense.ex_vendor_doc_no, null, "บิลใหม่มีเลขใหม่");
    assert.equal(copy.expense.ex_expense_date, todayBangkok());
    assert.equal(copy.lines.length, 2);
    assert.equal(copy.attachments.length, 0);

    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/expenses%' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "บันทึกร่างค่าใช้จ่าย",
        "แก้ร่างค่าใช้จ่าย",
        "ลบร่างค่าใช้จ่าย",
        "ส่งค่าใช้จ่าย (ขออนุมัติ / ผ่านอัตโนมัติเมื่อต่ำกว่าวงเงิน)",
        "อนุมัติค่าใช้จ่าย",
        "ตีกลับค่าใช้จ่าย",
        "ยกเลิกค่าใช้จ่าย",
        "คัดลอกเป็นค่าใช้จ่ายใหม่",
        "แนบไฟล์ค่าใช้จ่าย",
        "เปิดไฟล์แนบค่าใช้จ่าย",
    ]) {
        assert.ok(actions.has(expected), `audit ต้องมี "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
