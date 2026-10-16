// จัดซื้อ ขั้น 2-1 — ผู้ขาย · หมวดค่าใช้จ่าย · ประเภทเงินได้ + อัตราหัก ณ ที่จ่ายตามวันที่มีผล · สิทธิ์ · audit
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว · แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.1–3.3 และ R-P4/R-P6/R-P12
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
const JURISTIC_TAX_ID = "0105557000347";

let api;
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

// เลขประจำตัว 13 หลักที่หลักตรวจสอบถูก (สำหรับผู้ขายบุคคลธรรมดา)
function validCitizenId(first12) {
    let sum = 0;
    for (let index = 0; index < 12; index++) sum += Number(first12[index]) * (13 - index);
    return `${first12}${(11 - (sum % 11)) % 10}`;
}

async function createPerson(name, permissionKeys, userNumber) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", { body: { role_name: `role-${name}`, role_permission: bits } });
    assert.equal(role.status, 201, JSON.stringify(role.body));
    const userId = `USE20990101000${userNumber}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, ?, 'ทดสอบ', ?, 0)`,
        [userId, name, `${name}@example.com`, await bcrypt.hash(PASSWORD, 10), name, role.body.role_id],
    );
    return { userId, token: await api.login(name, PASSWORD) };
}

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person?.token, body });
}

function expectStatus(response, status) {
    assert.equal(response.status, status, JSON.stringify(response.body));
    return response.body;
}

const vendorBody = (overrides = {}) => ({
    vd_type: "juristic",
    vd_country: "TH",
    vd_name: "บริษัท ฟรีแลนซ์ดี จำกัด",
    vd_tax_id: JURISTIC_TAX_ID,
    vd_branch_code: "00000",
    vd_bank_name: "กสิกรไทย",
    vd_bank_account_no: "123 4 56789 0",
    vd_bank_account_name: "บริษัท ฟรีแลนซ์ดี จำกัด",
    vd_credit_days: 15,
    vd_default_income_type: "SERVICE",
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("purchasing_setup");
    await api.loginAsAdmin();
    people.buyer = await createPerson("ps.buyer", ["dashboard", "manageVendors"], 141);
    people.clerk = await createPerson("ps.clerk", ["dashboard", "createExpense"], 142);
    people.outsider = await createPerson("ps.outsider", ["dashboard", "viewInvoices"], 143);
});

test.after(async () => {
    await api?.stop();
});

test("ผู้ขาย: ตรวจเลขผู้เสียภาษี/สาขา/ธนาคาร · แบบ ภ.ง.ด. ตามประเภท · รหัสห้ามซ้ำ · พร้อมเพย์จัดรูป", async () => {
    const created = expectStatus(
        await as(
            people.buyer,
            "POST",
            "/V1/vendors",
            vendorBody({ vd_code: "FL-01", vd_promptpay_id: "081-234-5678" }),
        ),
        201,
    );
    const vendor = expectStatus(await as(people.buyer, "GET", `/V1/vendors/${created.vd_id}`), 200);
    assert.equal(vendor.wht_form, "PND53");
    assert.equal(vendor.vd_bank_account_no, "1234567890", "ตัดช่องว่างในเลขบัญชี");
    assert.equal(vendor.vd_promptpay_id, "0812345678");

    const individual = expectStatus(
        await as(people.buyer, "POST", "/V1/vendors", {
            vd_type: "individual",
            vd_name: "นายสมชาย ออกแบบเก่ง",
            vd_tax_id: validCitizenId("110170023070"),
            vd_branch_code: "00000",
        }),
        201,
    );
    const individualRow = expectStatus(await as(people.buyer, "GET", `/V1/vendors/${individual.vd_id}`), 200);
    assert.equal(individualRow.wht_form, "PND3");
    assert.equal(individualRow.vd_branch_code, null, "บุคคลธรรมดาไม่มีรหัสสาขา");

    const foreign = expectStatus(
        await as(people.buyer, "POST", "/V1/vendors", {
            vd_country: "US",
            vd_name: "Amazon Web Services",
            vd_tax_id: "EIN 12-345",
            vd_currency: "USD",
        }),
        201,
    );
    assert.equal(expectStatus(await as(people.buyer, "GET", `/V1/vendors/${foreign.vd_id}`), 200).wht_form, null);

    const badTaxId = await as(people.buyer, "POST", "/V1/vendors", vendorBody({ vd_tax_id: "0105557000348" }));
    assert.equal(badTaxId.status, 400);
    assert.ok(badTaxId.body.fields.vd_tax_id);
    const noBranch = await as(people.buyer, "POST", "/V1/vendors", vendorBody({ vd_branch_code: null }));
    assert.equal(noBranch.status, 400);
    assert.ok(noBranch.body.fields.vd_branch_code);
    const noBankName = await as(people.buyer, "POST", "/V1/vendors", vendorBody({ vd_bank_name: null }));
    assert.equal(noBankName.status, 400);
    assert.ok(noBankName.body.fields.vd_bank_name);
    const duplicateCode = await as(people.buyer, "POST", "/V1/vendors", vendorBody({ vd_code: "FL-01" }));
    assert.equal(duplicateCode.status, 400);
    assert.match(duplicateCode.body.fields.vd_code, /ใช้กับ/);
    const unknownIncomeType = await as(
        people.buyer,
        "POST",
        "/V1/vendors",
        vendorBody({ vd_default_income_type: "NOPE" }),
    );
    assert.equal(unknownIncomeType.status, 400);

    const search = expectStatus(await as(people.clerk, "GET", "/V1/vendors?search=ฟรีแลนซ์&status=active"), 200);
    assert.equal(search.total, 1);
    assert.equal(search.data[0].income_type_name, "ค่าบริการ / ค่าจ้างทำของ");
});

test("สิทธิ์: บันทึกค่าใช้จ่ายดูผู้ขายได้แต่แก้ไม่ได้ · คนนอกฝั่งจัดซื้อดูไม่ได้ · ตั้งค่าต้องมีสิทธิ์ตั้งค่าบริษัท", async () => {
    const clerkCreate = await as(people.clerk, "POST", "/V1/vendors", vendorBody({ vd_name: "ร้าน ก" }));
    assert.equal(clerkCreate.status, 403);
    const outsiderList = await as(people.outsider, "GET", "/V1/vendors");
    assert.equal(outsiderList.status, 403);
    const setup = expectStatus(await as(people.outsider, "GET", "/V1/purchasing/setup"), 200);
    assert.ok(setup.income_types.length >= 6, "ทุกคนอ่านตั้งค่าได้ (ฟอร์มเบิกเงินใช้)");
    const buyerCategory = await as(people.buyer, "POST", "/V1/purchasing/categories", { ec_name_th: "หมวดใหม่" });
    assert.equal(buyerCategory.status, 403);
});

test("R-P6: แก้เลขบัญชีผู้ขายเข้า audit log พร้อมค่าก่อน/หลัง", async () => {
    const created = expectStatus(
        await as(people.buyer, "POST", "/V1/vendors", vendorBody({ vd_name: "บริษัท บัญชีเปลี่ยน จำกัด" })),
        201,
    );
    expectStatus(
        await as(
            people.buyer,
            "PUT",
            `/V1/vendors/${created.vd_id}`,
            vendorBody({ vd_name: "บริษัท บัญชีเปลี่ยน จำกัด", vd_bank_account_no: "9999999999" }),
        ),
        200,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [[log]] = await api.pool.query(
        "SELECT aud_action, aud_changes FROM tb_audit_logs WHERE aud_entity_type = 'vendor' AND aud_entity_id = ? AND aud_method = 'PUT'",
        [created.vd_id],
    );
    assert.equal(log.aud_action, "แก้ไขผู้ขาย");
    const changes = typeof log.aud_changes === "string" ? JSON.parse(log.aud_changes) : log.aud_changes;
    assert.match(JSON.stringify(changes), /1234567890/);
    assert.match(JSON.stringify(changes), /9999999999/);

    expectStatus(await as(people.buyer, "DELETE", `/V1/vendors/${created.vd_id}`), 204);
    const missing = await as(people.buyer, "GET", `/V1/vendors/${created.vd_id}`);
    assert.equal(missing.status, 404);
});

test("หมวดค่าใช้จ่าย: ข้อมูลเริ่มต้น · ชื่อห้ามซ้ำ · ปิดใช้งานแล้วผู้ขายเลือกใหม่ไม่ได้", async () => {
    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    assert.equal(setup.categories.length, 15);
    const freelance = setup.categories.find((category) => category.ec_default_income_type === "SERVICE");
    assert.equal(freelance.income_type_name, "ค่าบริการ / ค่าจ้างทำของ");
    assert.equal(
        setup.categories.find((category) => category.ec_is_asset).ec_name_th,
        "อุปกรณ์คอมพิวเตอร์ (ทรัพย์สิน)",
    );

    const duplicate = await api.callApi("POST", "/V1/purchasing/categories", {
        body: { ec_name_th: freelance.ec_name_th },
    });
    assert.equal(duplicate.status, 400);
    const created = expectStatus(
        await api.callApi("POST", "/V1/purchasing/categories", {
            body: {
                ec_name_th: "ค่าอบรม",
                ec_account_code: "5310",
                ec_default_income_type: "SERVICE",
                ec_sort_order: 20,
            },
        }),
        201,
    );
    expectStatus(
        await api.callApi("PUT", `/V1/purchasing/categories/${created.ec_id}`, {
            body: { ec_name_th: "ค่าอบรม", ec_status: "inactive", ec_sort_order: 20 },
        }),
        200,
    );
    const pickInactive = await as(
        people.buyer,
        "POST",
        "/V1/vendors",
        vendorBody({ vd_name: "ร้าน ข", vd_default_category_id: created.ec_id }),
    );
    assert.equal(pickInactive.status, 400);
    assert.ok(pickInactive.body.fields.vd_default_category_id);
});

test("R-P4 อัตราหัก ณ ที่จ่าย: อัตราวันนี้ · เพิ่มได้เฉพาะวันที่มีผลในอนาคต · ลบได้เฉพาะที่ยังไม่มีผล", async () => {
    let setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    const service = setup.income_types.find((type) => type.wit_code === "SERVICE");
    assert.deepEqual(
        {
            rate: service.current_rate.wr_rate,
            min: service.current_rate.wr_min_payment,
            locked: service.current_rate.is_locked,
        },
        { rate: "3.00", min: "1000.00", locked: true },
    );

    const today = await api.callApi("POST", "/V1/purchasing/wht-rates", {
        body: { wr_income_type: "SERVICE", wr_effective_from: todayBangkok(), wr_rate: "2" },
    });
    assert.equal(today.status, 400, "ย้อนหรือวันนี้ไม่ได้");
    const tomorrow = daysFromToday(1);
    expectStatus(
        await api.callApi("POST", "/V1/purchasing/wht-rates", {
            body: {
                wr_income_type: "SERVICE",
                wr_effective_from: tomorrow,
                wr_rate: "1.5",
                wr_min_payment: "0",
                wr_note: "มาตรการชั่วคราว",
            },
        }),
        201,
    );
    const again = await api.callApi("POST", "/V1/purchasing/wht-rates", {
        body: { wr_income_type: "SERVICE", wr_effective_from: tomorrow, wr_rate: "1" },
    });
    assert.equal(again.status, 409);

    setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    const updated = setup.income_types.find((type) => type.wit_code === "SERVICE");
    assert.equal(updated.current_rate.wr_rate, "3.00", "อัตราใหม่ยังไม่มีผลวันนี้");
    assert.deepEqual(
        updated.rates.map((rate) => [rate.wr_effective_from, rate.is_locked]),
        [
            [tomorrow, false],
            ["2000-01-01", true],
        ],
    );

    const locked = await api.callApi("DELETE", "/V1/purchasing/wht-rates/SERVICE/2000-01-01");
    assert.equal(locked.status, 409);
    expectStatus(await api.callApi("DELETE", `/V1/purchasing/wht-rates/SERVICE/${tomorrow}`), 204);
});

test("ประเภทเงินได้: เพิ่ม (รหัสเป็นตัวพิมพ์ใหญ่) · รหัสซ้ำไม่ได้ · แก้ชื่อ/แถวบน 50 ทวิ", async () => {
    const created = expectStatus(
        await api.callApi("POST", "/V1/purchasing/income-types", {
            body: {
                wit_code: "royalty",
                wit_name_th: "ค่าลิขสิทธิ์",
                wit_form_row: 3,
                wit_form_label: "ค่าแห่งลิขสิทธิ์",
            },
        }),
        201,
    );
    assert.equal(created.wit_code, "ROYALTY");
    const duplicate = await api.callApi("POST", "/V1/purchasing/income-types", {
        body: { wit_code: "ROYALTY", wit_name_th: "ซ้ำ", wit_form_label: "ซ้ำ" },
    });
    assert.equal(duplicate.status, 400);
    const badRow = await api.callApi("PUT", "/V1/purchasing/income-types/ROYALTY", {
        body: { wit_name_th: "ค่าลิขสิทธิ์", wit_form_row: 7, wit_form_label: "x" },
    });
    assert.equal(badRow.status, 400);
    expectStatus(
        await api.callApi("PUT", "/V1/purchasing/income-types/ROYALTY", {
            body: {
                wit_name_th: "ค่าลิขสิทธิ์ซอฟต์แวร์",
                wit_form_row: 3,
                wit_form_label: "ค่าแห่งลิขสิทธิ์",
                wit_status: "inactive",
            },
        }),
        200,
    );
    const setup = expectStatus(await api.callApi("GET", "/V1/purchasing/setup"), 200);
    const royalty = setup.income_types.find((type) => type.wit_code === "ROYALTY");
    assert.equal(royalty.wit_name_th, "ค่าลิขสิทธิ์ซอฟต์แวร์");
    assert.equal(royalty.current_rate, null, "ยังไม่มีอัตรา");
});
