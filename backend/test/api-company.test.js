// หน้าตั้งค่าบริษัท (ขั้น 1A-1c) — ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer, createTestImage, SEED_ADMIN } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

let api;

// วันที่ห่างจากวันนี้ (เวลาไทย) n วัน
function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

const VALID_COMPANY = {
    cs_name_th: "บริษัท ซอฟต์เวิร์ค จำกัด",
    cs_name_en: "Softwork Co., Ltd.",
    cs_tax_id: "0-1055-55000-00-5",
    cs_address_th: "123 ถนนสุขุมวิท กรุงเทพฯ",
    cs_address_en: null,
    cs_phone: "02-000-0000",
    cs_email: "account@softwork.co.th",
    cs_website: "",
    cs_vat_registered_from: null,
    cs_quotation_valid_days: 30,
    cs_quotation_terms_th: "ราคานี้ยังไม่รวม VAT",
    cs_quotation_terms_en: null,
    cs_allow_self_approval: false,
    cs_default_credit_days: 30,
    cs_promptpay_id: "081-234-5678",
    cs_invoice_notes_th: "กรุณาชำระภายในวันครบกำหนด",
    cs_invoice_notes_en: null,
};

const JPY = {
    cur_code: "jpy",
    cur_name_th: "เยน",
    cur_name_en: "Japanese Yen",
    cur_symbol: "¥",
    cur_decimals: 0,
    cur_unit_th: "เยน",
    cur_subunit_th: null,
    cur_unit_en: "Yen",
    cur_subunit_en: null,
    cur_bot_unit: 100,
    cur_sort_order: 3,
    cur_status: "active",
};

function bankAccount(overrides) {
    return {
        ba_bank_name: "กสิกรไทย",
        ba_account_name: "บริษัท ซอฟต์เวิร์ค จำกัด",
        ba_account_no: "123-4-56789-0",
        ba_bank_branch: null,
        ba_swift_code: "kasithbk",
        ba_currency: "THB",
        ba_is_default: true,
        ba_status: "active",
        ...overrides,
    };
}

test.before(async () => {
    api = await startTestServer("company");
    await api.loginAsAdmin();
});

test.after(async () => {
    await api?.stop();
});

test("ดูการตั้งค่าได้ครบในคำขอเดียว พร้อมข้อมูลเริ่มต้น", async () => {
    const response = await api.callApi("GET", "/V1/company");
    assert.equal(response.status, 200);
    assert.equal(response.body.can_edit, true);
    assert.equal(response.body.vat_rate_today, "7.00");
    assert.deepEqual(
        response.body.currencies.map((currency) => currency.cur_code),
        ["THB", "USD"],
    );
    assert.equal(response.body.branches[0].is_head_office, true);
    assert.equal(response.body.approval.levels.length, 1);
    assert.deepEqual(response.body.approval.warnings, []);
    assert.equal(response.body.vat_rates[0].is_locked, true);
});

test("ข้อมูลบริษัท: ตรวจทุกช่องแล้วบอกเป็นรายช่อง · เลขผู้เสียภาษีตรวจหลักตรวจสอบ", async () => {
    const invalid = await api.callApi("PUT", "/V1/company", {
        body: {
            ...VALID_COMPANY,
            cs_name_th: " ",
            cs_tax_id: "0105555000001",
            cs_email: "not-an-email",
            cs_quotation_valid_days: 0,
            cs_default_credit_days: 366,
            cs_promptpay_id: "12345",
        },
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, "VALIDATION");
    assert.deepEqual(Object.keys(invalid.body.fields).sort(), [
        "cs_default_credit_days",
        "cs_email",
        "cs_name_th",
        "cs_promptpay_id",
        "cs_quotation_valid_days",
        "cs_tax_id",
    ]);

    const saved = await api.callApi("PUT", "/V1/company", { body: VALID_COMPANY });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.cs_tax_id, "0105555000005"); // ตัดขีดออกก่อนเก็บ
    assert.equal(saved.body.cs_website, null); // ช่องว่าง = NULL
    assert.equal(saved.body.cs_promptpay_id, "0812345678"); // ตัดขีดออกก่อนเก็บ
    assert.equal(saved.body.cs_default_credit_days, 30);
    assert.equal(saved.body.cs_invoice_notes_th, "กรุณาชำระภายในวันครบกำหนด");

    // เครดิต 0 วัน = ครบกำหนดวันที่ออก (ใช้ได้) · ไม่ใส่พร้อมเพย์ = ไม่พิมพ์ QR
    const zeroCredit = await api.callApi("PUT", "/V1/company", {
        body: { ...VALID_COMPANY, cs_default_credit_days: 0, cs_promptpay_id: "" },
    });
    assert.equal(zeroCredit.status, 200);
    assert.equal(zeroCredit.body.cs_default_credit_days, 0);
    assert.equal(zeroCredit.body.cs_promptpay_id, null);
});

test("โลโก้: รับรูปจริงเท่านั้น เก็บเป็น PNG", async () => {
    const form = new FormData();
    form.append("logo", await createTestImage(), "logo.png");
    const uploaded = await api.callApi("POST", "/V1/company/logo", { body: form });
    assert.equal(uploaded.status, 200);
    assert.match(uploaded.body.cs_logo_url, /^\/uploads\/company\/logo-\d+\.png$/);

    const fakeImage = new FormData();
    fakeImage.append("logo", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "logo.png");
    const rejected = await api.callApi("POST", "/V1/company/logo", { body: fakeImage });
    assert.equal(rejected.status, 400);

    const removed = await api.callApi("DELETE", "/V1/company/logo");
    assert.equal(removed.body.cs_logo_url, null);
});

test("อัตรา VAT: เพิ่มได้เฉพาะวันพรุ่งนี้เป็นต้นไป · อัตราที่มีผลแล้วลบไม่ได้", async () => {
    const today = await api.callApi("POST", "/V1/company/vat-rates", {
        body: { vr_effective_from: daysFromToday(0), vr_rate: "10" },
    });
    assert.equal(today.status, 400);
    assert.ok(today.body.fields.vr_effective_from);

    const tomorrow = daysFromToday(1);
    const added = await api.callApi("POST", "/V1/company/vat-rates", {
        body: { vr_effective_from: tomorrow, vr_rate: "10", vr_note: "ทดสอบ" },
    });
    assert.equal(added.status, 201);
    assert.equal(added.body.vr_rate, "10.00");

    const duplicate = await api.callApi("POST", "/V1/company/vat-rates", {
        body: { vr_effective_from: tomorrow, vr_rate: "9" },
    });
    assert.equal(duplicate.status, 409);

    const tooManyDecimals = await api.callApi("POST", "/V1/company/vat-rates", {
        body: { vr_effective_from: daysFromToday(2), vr_rate: "7.005" },
    });
    assert.equal(tooManyDecimals.status, 400);

    const settings = await api.callApi("GET", "/V1/company");
    assert.equal(settings.body.vat_rate_today, "7.00"); // อัตราใหม่ยังไม่มีผลวันนี้
    assert.equal(settings.body.vat_rates[0].is_locked, false);

    const lockedDelete = await api.callApi("DELETE", "/V1/company/vat-rates/2000-01-01");
    assert.equal(lockedDelete.status, 409);
    assert.equal(lockedDelete.body.code, "VAT_RATE_LOCKED");

    const futureDelete = await api.callApi("DELETE", `/V1/company/vat-rates/${tomorrow}`);
    assert.equal(futureDelete.status, 204);
});

test("สาขา: รหัสห้ามซ้ำ · สำนักงานใหญ่ปิดใช้งานไม่ได้", async () => {
    const branch = { branch_code: "00001", branch_name_th: "สาขาเชียงใหม่", branch_status: "active" };
    const created = await api.callApi("POST", "/V1/company/branches", { body: branch });
    assert.equal(created.status, 201);

    const duplicate = await api.callApi("POST", "/V1/company/branches", { body: { ...branch, branch_name_th: "ซ้ำ" } });
    assert.equal(duplicate.status, 409);
    assert.ok(duplicate.body.fields.branch_code);

    const badCode = await api.callApi("POST", "/V1/company/branches", { body: { ...branch, branch_code: "1" } });
    assert.equal(badCode.status, 400);

    const closeHeadOffice = await api.callApi("PUT", "/V1/company/branches/BRA202601010000001", {
        body: { branch_name_th: "สำนักงานใหญ่", branch_status: "inactive" },
    });
    assert.equal(closeHeadOffice.status, 409);
    assert.equal(closeHeadOffice.body.code, "HEAD_OFFICE_CANNOT_CLOSE");

    const closeBranch = await api.callApi("PUT", `/V1/company/branches/${created.body.branch_id}`, {
        body: { branch_name_th: "สาขาเชียงใหม่ (ปิด)", branch_status: "inactive" },
    });
    assert.equal(closeBranch.status, 200);
});

test("บัญชีธนาคาร: บัญชีหลักมีได้ 1 บัญชีต่อสกุลเงิน · บัญชีหลักปิดใช้งานไม่ได้", async () => {
    const first = await api.callApi("POST", "/V1/company/bank-accounts", { body: bankAccount({}) });
    assert.equal(first.status, 201);
    const second = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: bankAccount({ ba_bank_name: "กรุงเทพ" }),
    });
    assert.equal(second.status, 201);

    const settings = await api.callApi("GET", "/V1/company");
    const defaults = settings.body.bank_accounts.filter((account) => account.ba_is_default);
    assert.deepEqual(
        defaults.map((account) => account.ba_id),
        [second.body.ba_id],
    );
    assert.equal(settings.body.bank_accounts[0].ba_swift_code, "KASITHBK");

    const inactiveDefault = await api.callApi("PUT", `/V1/company/bank-accounts/${second.body.ba_id}`, {
        body: bankAccount({ ba_status: "inactive" }),
    });
    assert.equal(inactiveDefault.status, 400);
    assert.ok(inactiveDefault.body.fields.ba_status);

    const unknownCurrency = await api.callApi("POST", "/V1/company/bank-accounts", {
        body: bankAccount({ ba_currency: "EUR" }),
    });
    assert.equal(unknownCurrency.status, 400);
});

test("สกุลเงิน: รหัสแปลงเป็นตัวใหญ่ ห้ามซ้ำ · บาทแก้ได้แค่ชื่อ · สกุลที่มีทศนิยมต้องมีคำอ่านหน่วยย่อย", async () => {
    const created = await api.callApi("POST", "/V1/company/currencies", { body: JPY });
    assert.equal(created.status, 201);
    assert.equal(created.body.cur_code, "JPY");

    const duplicate = await api.callApi("POST", "/V1/company/currencies", { body: { ...JPY, cur_code: "jpy" } });
    assert.equal(duplicate.status, 409);

    const missingSubunit = await api.callApi("PUT", "/V1/company/currencies/JPY", {
        body: { ...JPY, cur_decimals: 2 },
    });
    assert.equal(missingSubunit.status, 400);
    assert.ok(missingSubunit.body.fields.cur_subunit_th);
    assert.ok(missingSubunit.body.fields.cur_subunit_en);

    const settings = await api.callApi("GET", "/V1/company");
    const baht = settings.body.currencies.find((currency) => currency.cur_code === "THB");
    const closeBaht = await api.callApi("PUT", "/V1/company/currencies/THB", {
        body: { ...stripReadOnly(baht), cur_status: "inactive" },
    });
    assert.equal(closeBaht.status, 409);
    assert.equal(closeBaht.body.code, "BASE_CURRENCY_FIXED");

    const renameBaht = await api.callApi("PUT", "/V1/company/currencies/THB", {
        body: { ...stripReadOnly(baht), cur_symbol: "THB" },
    });
    assert.equal(renameBaht.status, 200);
});

function stripReadOnly(currency) {
    const { cur_code, is_base_currency, is_used_in_documents, ...editable } = currency;
    return editable;
}

test("กติกาอนุมัติ: ตรวจลำดับยอด · เตือนชั้นที่ใบจะค้าง · role ในกติกาลบไม่ได้", async () => {
    const role = await api.callApi("POST", "/V1/roles", {
        body: { role_name: "ผู้จัดการทดสอบ", role_permission: "1" + "0".repeat(PERMISSION_KEYS.length - 1) },
    });
    assert.equal(role.status, 201);

    const notIncreasing = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: {
            levels: [
                { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] },
                { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [role.body.role_id] },
            ],
        },
    });
    assert.equal(notIncreasing.status, 400);
    assert.ok(notIncreasing.body.fields["levels.1.al_min_amount_thb"]);

    const firstLevelNotZero = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: { levels: [{ al_min_amount_thb: "100", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] }] },
    });
    assert.equal(firstLevelNotZero.status, 400);

    // ชั้น 2 บังคับคนละคน แต่ผู้อนุมัติได้มีแค่แอดมินคนเดียว ซึ่งอนุมัติชั้น 1 ได้ด้วย → เตือน
    // ชั้น 3 ใช้ role ที่ยังไม่มีผู้ใช้ → เตือน
    const saved = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: {
            levels: [
                { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] },
                { al_min_amount_thb: "100,000", al_require_distinct: true, role_ids: [SEED_ADMIN.roleId] },
                { al_min_amount_thb: "1000000", al_require_distinct: false, role_ids: [role.body.role_id] },
            ],
        },
    });
    assert.equal(saved.status, 200);
    assert.deepEqual(
        saved.body.levels.map((level) => level.al_min_amount_thb),
        ["0.00", "100000.00", "1000000.00"],
    );
    assert.equal(saved.body.warnings.length, 2);
    assert.match(saved.body.warnings[0], /ชั้น 2/);
    assert.match(saved.body.warnings[1], /ชั้น 3/);

    const deleteRole = await api.callApi("DELETE", `/V1/roles/${role.body.role_id}`);
    assert.equal(deleteRole.status, 409);
    assert.equal(deleteRole.body.code, "ROLE_IN_APPROVAL_RULES");

    // คืนค่าเดิมให้เทสต์อื่น
    const restored = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: { levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] }] },
    });
    assert.equal(restored.status, 200);
});

test("กติกาอนุมัติใบแจ้งหนี้ที่สร้างเอง (IV): บันทึกแยกจากใบเสนอราคา · role ในกติกาลบไม่ได้และบอกว่าเป็นของเอกสารไหน", async () => {
    const role = await api.callApi("POST", "/V1/roles", {
        body: { role_name: "ผู้อนุมัติบิลทดสอบ", role_permission: "1" + "0".repeat(PERMISSION_KEYS.length - 1) },
    });
    const invoiceRules = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: {
            doc_type: "IV",
            levels: [
                { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] },
                { al_min_amount_thb: "50000", al_require_distinct: false, role_ids: [role.body.role_id] },
            ],
        },
    });
    assert.equal(invoiceRules.status, 200);
    assert.equal(invoiceRules.body.levels.length, 2);

    const settings = await api.callApi("GET", "/V1/company");
    assert.equal(settings.body.invoice_approval.levels.length, 2);
    assert.equal(settings.body.approval.levels.length, 1, "กติกาใบเสนอราคาไม่เปลี่ยน");

    const deleteRole = await api.callApi("DELETE", `/V1/roles/${role.body.role_id}`);
    assert.equal(deleteRole.status, 409);
    assert.match(deleteRole.body.message, /ใบแจ้งหนี้ที่สร้างเอง ชั้น 2/);

    const unknownType = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: { doc_type: "XX", levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] }] },
    });
    assert.equal(unknownType.status, 400);

    const restored = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: { doc_type: "IV", levels: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [SEED_ADMIN.roleId] }] },
    });
    assert.equal(restored.status, 200);
});

test("ผู้ใช้ที่ไม่มีสิทธิ์ตั้งค่าบริษัท: ดูได้ (ฟอร์มเอกสารต้องใช้) แต่แก้ไม่ได้", async () => {
    const dashboardOnly = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", {
        body: { role_name: "พนักงานขายทดสอบ", role_permission: dashboardOnly },
    });
    const passwordHash = await bcrypt.hash("Staff@2026", 10);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901010000009', 'staff.test', 'staff@example.com', ?, 'พนักงาน', 'ทดสอบ', ?, 0)`,
        [passwordHash, role.body.role_id],
    );
    const staffToken = await api.login("staff.test", "Staff@2026");

    const view = await api.callApi("GET", "/V1/company", { token: staffToken });
    assert.equal(view.status, 200);
    assert.equal(view.body.can_edit, false);

    const edit = await api.callApi("PUT", "/V1/company", { token: staffToken, body: VALID_COMPANY });
    assert.equal(edit.status, 403);
    const addBranch = await api.callApi("POST", "/V1/company/branches", {
        token: staffToken,
        body: { branch_code: "00009", branch_name_th: "ห้ามสร้าง", branch_status: "active" },
    });
    assert.equal(addBranch.status, 403);
});

test("ทุกการแก้ไขเข้า audit log ด้วยชื่อการกระทำภาษาไทย", async () => {
    // audit เขียนหลังตอบกลับแล้ว — รอให้คำขอก่อนหน้าบันทึกเสร็จ
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/company%' AND aud_success = 1 ORDER BY aud_action",
    );
    const actions = rows.map((row) => row.aud_action);
    for (const expected of [
        "แก้ไขข้อมูลบริษัท",
        "เพิ่มอัตรา VAT",
        "เพิ่มสาขา",
        "เพิ่มบัญชีธนาคาร",
        "เพิ่มสกุลเงิน",
        "แก้ไขกติกาอนุมัติเอกสาร",
    ]) {
        assert.ok(actions.includes(expected), `ไม่พบ "${expected}" ใน audit log (มี: ${actions.join(", ")})`);
    }
});
