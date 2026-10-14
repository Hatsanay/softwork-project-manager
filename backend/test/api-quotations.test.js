// ใบเสนอราคา (ขั้น 1A-3) — ร่าง ส่ง อนุมัติหลายชั้น ตีกลับ revision คัดลอก ยกเลิก หมดอายุ · ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว
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
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 10;
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

function as(person, method, url, body) {
    return api.callApi(method, url, { token: person.token, body });
}

function draft(overrides = {}) {
    return {
        qt_client_id: clientId,
        qt_branch_id: HEAD_OFFICE_ID,
        qt_title: "พัฒนาระบบหลังบ้าน",
        qt_currency: "THB",
        qt_valid_days: 30,
        items: [
            { qti_type: "heading", qti_description: "ระบบหลังบ้าน" },
            {
                qti_type: "item",
                qti_description: "ออกแบบฐานข้อมูล",
                qti_quantity: "1",
                qti_unit: "งาน",
                qti_unit_price: "20000",
            },
            {
                qti_type: "item",
                qti_description: "ทำ API",
                qti_quantity: "2",
                qti_unit: "งาน",
                qti_unit_price: "50000",
            },
            { qti_type: "note", qti_description: "ราคานี้ไม่รวมค่าเซิร์ฟเวอร์" },
        ],
        ...overrides,
    };
}

async function createDraft(person, overrides) {
    const created = await as(person, "POST", "/V1/quotations", draft(overrides));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.qt_id;
}

async function detail(person, quotationId) {
    const response = await as(person, "GET", `/V1/quotations/${quotationId}`);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body;
}

test.before(async () => {
    api = await startTestServer("quotations");
    await api.loginAsAdmin();

    people.sales = await createPerson("sales", ["dashboard", "viewQuotations", "createQuotation"]);
    people.manager = await createPerson("manager", ["dashboard", "viewQuotations", "approveQuotation"]);
    people.director = await createPerson("director", [
        "dashboard",
        "viewQuotations",
        "approveQuotation",
        "cancelQuotation",
    ]);
    people.director2 = await createPerson("director2", ["dashboard", "viewQuotations", "approveQuotation"]);
    // ผู้อำนวยการคนที่สองใช้ role เดียวกับคนแรก
    await api.pool.query("UPDATE tb_users SET user_role_id = ? WHERE user_id = ?", [
        people.director.roleId,
        people.director2.userId,
    ]);

    const rules = await api.callApi("PUT", "/V1/company/approval-levels", {
        body: {
            levels: [
                {
                    al_min_amount_thb: "0",
                    al_require_distinct: false,
                    role_ids: [people.manager.roleId, people.director.roleId],
                },
                { al_min_amount_thb: "100000", al_require_distinct: false, role_ids: [people.director.roleId] },
                { al_min_amount_thb: "1000000", al_require_distinct: true, role_ids: [people.director.roleId] },
            ],
        },
    });
    assert.equal(rules.status, 200, JSON.stringify(rules.body));

    const client = await api.callApi("POST", "/V1/clients", { body: { client_name: "บริษัท ลูกค้า จำกัด" } });
    clientId = client.body.client_id;
});

test.after(async () => {
    await api?.stop();
});

test("กติกาอนุมัติ: นับเฉพาะผู้ใช้ที่ role มีสิทธิ์อนุมัติใบเสนอราคา", async () => {
    const settings = await api.callApi("GET", "/V1/company");
    const levelOne = settings.body.approval.levels[0];
    const names = levelOne.eligible_users.map((user) => user.full_name).sort();
    assert.deepEqual(names, ["director ทดสอบ", "director2 ทดสอบ", "manager ทดสอบ"]);
});

test("ร่าง: ตรวจข้อมูล · คำนวณยอดฝั่ง backend · กันแก้ทับกัน (qt_version)", async () => {
    const noTitle = await as(people.sales, "POST", "/V1/quotations", draft({ qt_title: "" }));
    assert.equal(noTitle.status, 400);
    assert.ok(noTitle.body.fields.qt_title);

    const missingPrice = await as(
        people.sales,
        "POST",
        "/V1/quotations",
        draft({ items: [{ qti_type: "item", qti_description: "ไม่มีราคา", qti_quantity: "1" }] }),
    );
    assert.equal(missingPrice.status, 400);
    assert.ok(missingPrice.body.fields["items.0.qti_unit_price"]);

    const tooMuchDiscount = await as(people.sales, "POST", "/V1/quotations", draft({ qt_discount_value: "999999" }));
    assert.equal(tooMuchDiscount.status, 400);
    assert.ok(tooMuchDiscount.body.fields.qt_discount_value);

    const quotationId = await createDraft(people.sales);
    const saved = await detail(people.sales, quotationId);
    assert.equal(saved.quotation.qt_status, "draft");
    assert.equal(saved.quotation.qt_number, null);
    assert.equal(saved.quotation.qt_subtotal, "120000.00");
    // บริษัทยังไม่จด VAT → VAT 0
    assert.equal(saved.quotation.qt_vat_amount, "0.00");
    assert.equal(saved.quotation.qt_total_thb, "120000.00");
    assert.deepEqual(
        saved.items.map((item) => item.qti_amount),
        ["0.00", "20000.00", "100000.00", "0.00"],
    );
    assert.ok(
        saved.readiness.every((check) => check.ok),
        JSON.stringify(saved.readiness),
    );
    assert.equal(saved.actions.can_edit, true);

    const firstEdit = await as(
        people.sales,
        "PUT",
        `/V1/quotations/${quotationId}`,
        draft({ qt_title: "แก้ครั้งที่ 1", qt_version: 0 }),
    );
    assert.equal(firstEdit.status, 200, JSON.stringify(firstEdit.body));
    const staleEdit = await as(
        people.sales,
        "PUT",
        `/V1/quotations/${quotationId}`,
        draft({ qt_title: "แก้ทับ", qt_version: 0 }),
    );
    assert.equal(staleEdit.status, 409);
    assert.equal(staleEdit.body.code, "QUOTATION_CHANGED");
    const noVersion = await as(people.sales, "PUT", `/V1/quotations/${quotationId}`, draft());
    assert.equal(noVersion.status, 400);

    // ผู้ที่มีแค่สิทธิ์อนุมัติ สร้างร่างไม่ได้
    const managerCreate = await as(people.manager, "POST", "/V1/quotations", draft());
    assert.equal(managerCreate.status, 403);
});

test("อนุมัติหลายชั้น: ผู้จัดการผ่านชั้น 1 · ผู้อำนวยการผ่านชั้น 2 (ชั้นสุดท้าย) → ได้เลขที่ วันที่ ยืนราคาถึง snapshot", async () => {
    const quotationId = await createDraft(people.sales);
    const submitted = await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`, { qt_version: 0 });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.deepEqual(submitted.body.approval_levels, [1, 2]);

    const submitTwice = await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
    assert.equal(submitTwice.status, 409);
    const editPending = await as(people.sales, "PUT", `/V1/quotations/${quotationId}`, draft({ qt_version: 1 }));
    assert.equal(editPending.status, 409);

    // ป้าย "รอคุณอนุมัติ" ขึ้นเฉพาะคนที่ role อยู่ในชั้นที่รอ
    const managerWaiting = await as(people.manager, "GET", "/V1/quotations?tab=waiting_me");
    assert.ok(managerWaiting.body.data.some((row) => row.qt_id === quotationId));
    const directorWaiting = await as(people.director, "GET", "/V1/quotations?tab=waiting_me");
    assert.ok(
        directorWaiting.body.data.some((row) => row.qt_id === quotationId),
        "ผู้อำนวยการอยู่ในชั้น 1 ด้วย",
    );

    const salesApprove = await as(people.sales, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(salesApprove.status, 403);

    const managerApprove = await as(people.manager, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(managerApprove.status, 200, JSON.stringify(managerApprove.body));
    assert.deepEqual(managerApprove.body.approved_levels, [1]);
    assert.equal(managerApprove.body.is_final, false);

    const managerAgain = await as(people.manager, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(managerAgain.status, 403);
    assert.equal(managerAgain.body.code, "APPROVAL_NOT_ALLOWED");

    const preview = await detail(people.director, quotationId);
    assert.equal(preview.approval.canApprove, true);
    assert.deepEqual(preview.approval.levels, [2]);
    assert.equal(preview.approval.isFinal, true);

    // กดพร้อมกันสองครั้ง (R5) → สำเร็จครั้งเดียว
    const version = preview.quotation.qt_version;
    const [first, second] = await Promise.all([
        as(people.director, "POST", `/V1/quotations/${quotationId}/approve`, { qt_version: version }),
        as(people.director, "POST", `/V1/quotations/${quotationId}/approve`, { qt_version: version }),
    ]);
    const statuses = [first.status, second.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    const success = first.status === 200 ? first : second;
    assert.equal(success.body.is_final, true);
    assert.match(success.body.qt_number, new RegExp(`^QT-${todayBangkok().replace(/-/g, "")}-\\d{6}$`));

    const approved = await detail(people.sales, quotationId);
    assert.equal(approved.quotation.qt_status, "approved");
    assert.equal(approved.quotation.qt_issue_date, todayBangkok());
    assert.equal(approved.quotation.qt_valid_until, daysFromToday(30));
    assert.equal(approved.quotation.qt_client_snapshot.client_name, "บริษัท ลูกค้า จำกัด");
    assert.equal(approved.quotation.qt_company_snapshot.branch.branch_code, "00000");
    assert.equal(approved.quotation.qt_approved_by_name, "director ทดสอบ");
    assert.equal(approved.quotation.qt_created_by_name, "sales ทดสอบ");
    assert.deepEqual(
        approved.approval_history.map((row) => [row.qta_level, row.qta_action, row.qta_user_name]),
        [
            [1, "approve", "manager ทดสอบ"],
            [2, "approve", "director ทดสอบ"],
        ],
    );

    // ลูกค้าแก้ชื่อทีหลัง เอกสารที่อนุมัติแล้วไม่เปลี่ยน
    await api.callApi("PUT", `/V1/clients/${clientId}`, { body: { client_name: "บริษัท ลูกค้า (ชื่อใหม่) จำกัด" } });
    const afterRename = await detail(people.sales, quotationId);
    assert.equal(afterRename.quotation.qt_client_snapshot.client_name, "บริษัท ลูกค้า จำกัด");
    await api.callApi("PUT", `/V1/clients/${clientId}`, { body: { client_name: "บริษัท ลูกค้า จำกัด" } });

    const editApproved = await as(
        people.sales,
        "PUT",
        `/V1/quotations/${quotationId}`,
        draft({ qt_version: approved.quotation.qt_version }),
    );
    assert.equal(editApproved.status, 409);
    const deleteApproved = await as(people.sales, "DELETE", `/V1/quotations/${quotationId}`);
    assert.equal(deleteApproved.status, 409);
});

test("ชั้นที่บังคับคนละคน: ผู้อำนวยการคนเดิมกดผ่านชั้น 1–2 แล้วต้องให้อีกคนอนุมัติชั้น 3", async () => {
    const quotationId = await createDraft(people.sales, {
        items: [{ qti_type: "item", qti_description: "ระบบ ERP", qti_quantity: "1", qti_unit_price: "2000000" }],
    });
    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);

    const firstPass = await as(people.director, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.deepEqual(firstPass.body.approved_levels, [1, 2]);
    assert.equal(firstPass.body.next_level, 3);

    const sameDirector = await as(people.director, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(sameDirector.status, 403);
    assert.match(sameDirector.body.message, /คนละคน/);

    const otherDirector = await as(people.director2, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(otherDirector.status, 200, JSON.stringify(otherDirector.body));
    assert.equal(otherDirector.body.is_final, true);
});

test("ตีกลับ: ต้องมีเหตุผล → กลับเป็นร่าง · ส่งใหม่เริ่มชั้น 1 รอบที่ 2", async () => {
    const quotationId = await createDraft(people.sales, {
        items: [{ qti_type: "item", qti_description: "งานเล็ก", qti_quantity: "1", qti_unit_price: "5000" }],
    });
    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);

    const noReason = await as(people.manager, "POST", `/V1/quotations/${quotationId}/return`, {});
    assert.equal(noReason.status, 400);
    const returned = await as(people.manager, "POST", `/V1/quotations/${quotationId}/return`, { reason: "ราคาต่ำไป" });
    assert.equal(returned.status, 200);

    const afterReturn = await detail(people.sales, quotationId);
    assert.equal(afterReturn.quotation.qt_status, "draft");
    assert.equal(afterReturn.quotation.qt_returned_reason, "ราคาต่ำไป");

    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
    const resubmitted = await detail(people.sales, quotationId);
    assert.equal(resubmitted.quotation.qt_approval_round, 2);
    assert.equal(resubmitted.quotation.qt_approval_current_level, 1);
    assert.equal(resubmitted.quotation.qt_returned_reason, null);
});

test("R19: อัตรา VAT เปลี่ยนระหว่างรออนุมัติ → อนุมัติชั้นสุดท้ายไม่ได้ ต้องตีกลับคำนวณใหม่", async () => {
    const quotationId = await createDraft(people.sales, {
        items: [{ qti_type: "item", qti_description: "งาน", qti_quantity: "1", qti_unit_price: "10000" }],
    });
    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
    // บริษัทจด VAT ระหว่างที่ใบรออยู่
    await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = '2020-01-01' WHERE cs_id = 1");
    try {
        const blocked = await as(people.manager, "POST", `/V1/quotations/${quotationId}/approve`);
        assert.equal(blocked.status, 409);
        assert.equal(blocked.body.code, "VAT_CHANGED");

        await as(people.manager, "POST", `/V1/quotations/${quotationId}/return`, { reason: "VAT เปลี่ยน" });
        await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
        const recalculated = await detail(people.sales, quotationId);
        assert.equal(recalculated.quotation.qt_vat_rate, "7.00");
        assert.equal(recalculated.quotation.qt_total, "10700.00");
        const approved = await as(people.manager, "POST", `/V1/quotations/${quotationId}/approve`);
        assert.equal(approved.status, 200);
    } finally {
        await api.pool.query("UPDATE tb_company_settings SET cs_vat_registered_from = NULL WHERE cs_id = 1");
    }
});

test("revision: เลขเดิม Rev.1 · มีร่างค้างได้ทีละใบ · อนุมัติแล้วฉบับเก่าเป็น superseded", async () => {
    const quotationId = await createDraft(people.sales);
    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
    await as(people.director, "POST", `/V1/quotations/${quotationId}/approve`);
    const original = await detail(people.sales, quotationId);
    assert.equal(original.quotation.qt_status, "approved");

    const sent = await as(people.sales, "POST", `/V1/quotations/${quotationId}/send`);
    assert.equal(sent.status, 200);

    const revision = await as(people.sales, "POST", `/V1/quotations/${quotationId}/revise`);
    assert.equal(revision.status, 201, JSON.stringify(revision.body));
    assert.equal(revision.body.qt_revision, 1);
    const twice = await as(people.sales, "POST", `/V1/quotations/${quotationId}/revise`);
    assert.equal(twice.status, 409);
    assert.equal(twice.body.code, "REVISION_ALREADY_OPEN");

    const revisionDraft = await detail(people.sales, revision.body.qt_id);
    assert.equal(revisionDraft.quotation.qt_number, original.quotation.qt_number);
    assert.equal(revisionDraft.items.length, 4);
    assert.equal(revisionDraft.chain.length, 2);

    // revision เปลี่ยนลูกค้าไม่ได้
    const otherClient = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าอื่น" } });
    const changeClient = await as(
        people.sales,
        "PUT",
        `/V1/quotations/${revision.body.qt_id}`,
        draft({ qt_client_id: otherClient.body.client_id, qt_version: 0 }),
    );
    assert.equal(changeClient.status, 400);
    assert.ok(changeClient.body.fields.qt_client_id);

    await as(people.sales, "POST", `/V1/quotations/${revision.body.qt_id}/submit`);
    const approveRevision = await as(people.director, "POST", `/V1/quotations/${revision.body.qt_id}/approve`);
    assert.equal(approveRevision.body.qt_number, original.quotation.qt_number);

    const oldVersion = await detail(people.sales, quotationId);
    assert.equal(oldVersion.quotation.qt_status, "superseded");
    const allTab = await as(people.sales, "GET", "/V1/quotations?tab=all&limit=200");
    assert.ok(!allTab.body.data.some((row) => row.qt_id === quotationId), "ฉบับที่ถูกแทนไม่แสดงในแท็บทั้งหมด");
});

test("คัดลอกเป็นใบใหม่: ร่างใหม่ไม่มีเลข Rev.0 อ้างกลับใบต้นทาง", async () => {
    const quotationId = await createDraft(people.sales);
    const copied = await as(people.sales, "POST", `/V1/quotations/${quotationId}/copy`);
    assert.equal(copied.status, 201);
    const copy = await detail(people.sales, copied.body.qt_id);
    assert.equal(copy.quotation.qt_number, null);
    assert.equal(copy.quotation.qt_revision, 0);
    assert.equal(copy.quotation.qt_root_id, copied.body.qt_id);
    assert.equal(copy.copied_from.qt_id, quotationId);
    assert.equal(copy.items.length, 4);
});

test("ปฏิเสธ · ยกเลิก · ลบร่าง · หมดอายุ", async () => {
    const declinedId = await createDraft(people.sales);
    await as(people.sales, "POST", `/V1/quotations/${declinedId}/submit`);
    await as(people.director, "POST", `/V1/quotations/${declinedId}/approve`);
    const noReason = await as(people.sales, "POST", `/V1/quotations/${declinedId}/decline`, {});
    assert.equal(noReason.status, 400);
    const declined = await as(people.sales, "POST", `/V1/quotations/${declinedId}/decline`, {
        reason: "ราคาสูงกว่าที่อื่น",
    });
    assert.equal(declined.status, 200);

    const draftId = await createDraft(people.sales);
    const cancelDraft = await as(people.director, "POST", `/V1/quotations/${draftId}/cancel`, { reason: "ไม่ใช้" });
    assert.equal(cancelDraft.status, 409);
    const salesCancel = await as(people.sales, "POST", `/V1/quotations/${declinedId}/cancel`, { reason: "x" });
    assert.equal(salesCancel.status, 403);
    const cancelled = await as(people.director, "POST", `/V1/quotations/${declinedId}/cancel`, {
        reason: "ลูกค้าเลิกโครงการ",
    });
    assert.equal(cancelled.status, 200);
    const cancelledDetail = await detail(people.sales, declinedId);
    assert.equal(cancelledDetail.quotation.qt_status, "cancelled");
    assert.ok(cancelledDetail.quotation.qt_number, "เลขที่คงอยู่หลังยกเลิก");

    const removed = await as(people.sales, "DELETE", `/V1/quotations/${draftId}`);
    assert.equal(removed.status, 204);
    const gone = await as(people.sales, "GET", `/V1/quotations/${draftId}`);
    assert.equal(gone.status, 404);

    const expiringId = await createDraft(people.sales);
    await as(people.sales, "POST", `/V1/quotations/${expiringId}/submit`);
    await as(people.director, "POST", `/V1/quotations/${expiringId}/approve`);
    await api.pool.query("UPDATE tb_quotations SET qt_valid_until = ? WHERE qt_id = ?", [
        daysFromToday(-1),
        expiringId,
    ]);
    const expiredTab = await as(people.sales, "GET", "/V1/quotations?tab=expired");
    assert.ok(expiredTab.body.data.some((row) => row.qt_id === expiringId));
    // หมดอายุแล้วออก revision ได้
    const revision = await as(people.sales, "POST", `/V1/quotations/${expiringId}/revise`);
    assert.equal(revision.status, 201);
});

test("สกุลต่างประเทศ: อัตรา ธปท. ต้องตรงกับที่ระบบดึงไว้ · กรอกเองต้องมีเหตุผล · ยอดบาทคิดจากอัตราของใบ", async () => {
    const fakeBot = await as(
        people.sales,
        "POST",
        "/V1/quotations",
        draft({ qt_currency: "USD", qt_exchange_rate: "30", qt_rate_source: "bot", qt_rate_date: daysFromToday(-1) }),
    );
    assert.equal(fakeBot.status, 400);
    assert.ok(fakeBot.body.fields.qt_exchange_rate);

    const manualNoReason = await as(
        people.sales,
        "POST",
        "/V1/quotations",
        draft({ qt_currency: "USD", qt_exchange_rate: "35.5", qt_rate_source: "manual" }),
    );
    assert.equal(manualNoReason.status, 400);
    assert.ok(manualNoReason.body.fields.qt_rate_override_reason);

    // อัตราที่ ธปท. ดึงไว้จริงในแคช
    await api.pool.query(
        "INSERT INTO tb_exchange_rates (er_currency, er_rate_date, er_buying_transfer) VALUES ('USD', ?, '34.5678000000')",
        [daysFromToday(-1)],
    );
    const botRate = await as(
        people.sales,
        "POST",
        "/V1/quotations",
        draft({
            qt_currency: "USD",
            qt_exchange_rate: "34.5678",
            qt_rate_source: "bot",
            qt_rate_date: daysFromToday(-1),
        }),
    );
    assert.equal(botRate.status, 201, JSON.stringify(botRate.body));
    const saved = await detail(people.sales, botRate.body.qt_id);
    assert.equal(saved.quotation.qt_rate_bot, "34.5678000000");
    // 120,000 USD × 34.5678 = 4,148,136 บาท → แผนอนุมัติจะถึงชั้น 3
    assert.equal(saved.quotation.qt_after_discount_thb, "4148136.00");
    assert.equal(saved.currency.cur_code, "USD");
});

async function approvedQuotation(overrides) {
    const quotationId = await createDraft(people.sales, overrides);
    await as(people.sales, "POST", `/V1/quotations/${quotationId}/submit`);
    const approved = await as(people.director, "POST", `/V1/quotations/${quotationId}/approve`);
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    return quotationId;
}

test("ตอบรับ → สร้างโปรเจกต์ใหม่ + งาน: หัวข้อ = งานหลัก · รายการ = งานย่อย · หมายเหตุไม่สร้าง · ล็อกถาวร", async () => {
    people.seller = await createPerson("seller", [
        "dashboard",
        "viewQuotations",
        "createQuotation",
        "createProject",
        "viewOwnProjects",
    ]);
    const quotationId = await approvedQuotation({
        items: [
            { qti_type: "item", qti_description: "วิเคราะห์ความต้องการ", qti_quantity: "1", qti_unit_price: "10000" },
            ...draft().items,
        ],
    });

    const noPermission = await as(people.sales, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "new",
        create_tasks: true,
    });
    assert.equal(noPermission.status, 403);
    assert.equal(noPermission.body.code, "CANNOT_CREATE_PROJECT");

    const accepted = await as(people.seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "new",
        create_tasks: true,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.task_count, 4);
    const projectId = accepted.body.project_id;

    const [[project]] = await api.pool.query("SELECT project_name, client_id FROM tb_projects WHERE project_id = ?", [
        projectId,
    ]);
    assert.equal(project.project_name, "พัฒนาระบบหลังบ้าน");
    assert.equal(project.client_id, clientId);
    const [[pm]] = await api.pool.query(
        `SELECT pp.position_name FROM tb_project_members m
         JOIN tb_project_member_positions mp ON mp.project_member_id = m.project_member_id
         JOIN tb_project_positions pp ON pp.position_id = mp.position_id
         WHERE m.project_id = ? AND m.user_id = ?`,
        [projectId, people.seller.userId],
    );
    assert.equal(pm.position_name, "PM");

    const [tasks] = await api.pool.query(
        "SELECT task_id, task_parent_id, task_title, task_description, task_quotation_item_id FROM tb_tasks WHERE project_id = ? ORDER BY task_sort_order",
        [projectId],
    );
    assert.deepEqual(
        tasks.map((task) => task.task_title),
        ["วิเคราะห์ความต้องการ", "ระบบหลังบ้าน", "ออกแบบฐานข้อมูล", "ทำ API"],
    );
    assert.equal(tasks[0].task_parent_id, null, "รายการก่อนหัวข้อแรก = งานหลักระดับบนสุด");
    assert.equal(tasks[1].task_parent_id, null);
    assert.equal(tasks[2].task_parent_id, tasks[1].task_id);
    assert.equal(tasks[3].task_parent_id, tasks[1].task_id);
    assert.ok(tasks.every((task) => task.task_quotation_item_id !== null));
    assert.match(tasks[2].task_description, /จากใบเสนอราคา QT-/);
    assert.ok(!tasks.some((task) => /20000|50000/.test(task.task_description)), "ไม่คัดลอกราคาไปในงาน");

    const saved = await detail(people.seller, quotationId);
    assert.equal(saved.quotation.qt_status, "accepted");
    assert.equal(saved.quotation.qt_project_id, projectId);
    assert.equal(saved.actions.can_revise, false);
    assert.match(saved.actions.revise_blocked_reason, /คัดลอกเป็นใบใหม่/);

    const acceptAgain = await as(people.seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "none",
    });
    assert.equal(acceptAgain.status, 409);
    const revise = await as(people.seller, "POST", `/V1/quotations/${quotationId}/revise`);
    assert.equal(revise.status, 409);
    const cancel = await as(people.director, "POST", `/V1/quotations/${quotationId}/cancel`, { reason: "x" });
    assert.equal(cancel.status, 409);
    const copy = await as(people.seller, "POST", `/V1/quotations/${quotationId}/copy`);
    assert.equal(copy.status, 201, "งานเพิ่มหลังตอบรับใช้คัดลอกเป็นใบใหม่");

    // ใบที่สอง ผูกโปรเจกต์เดิม → งานต่อท้ายงานที่มี
    const secondId = await approvedQuotation({
        qt_title: "งานเพิ่ม",
        items: [
            {
                qti_type: "item",
                qti_description: "เพิ่มรายงานยอดขาย\nรายละเอียดบรรทัดสอง",
                qti_quantity: "1",
                qti_unit_price: "8000",
            },
        ],
    });
    const options = await as(people.seller, "GET", `/V1/quotations/${secondId}/project-options`);
    assert.ok(options.body.projects.some((row) => row.project_id === projectId));
    assert.equal(options.body.can_create_project, true);

    const salesExisting = await as(people.sales, "POST", `/V1/quotations/${secondId}/accept`, {
        project_mode: "existing",
        project_id: projectId,
        create_tasks: true,
    });
    assert.equal(salesExisting.status, 403, "ไม่ได้เป็นสมาชิกโปรเจกต์");

    const linked = await as(people.seller, "POST", `/V1/quotations/${secondId}/accept`, {
        project_mode: "existing",
        project_id: projectId,
        create_tasks: true,
    });
    assert.equal(linked.status, 200, JSON.stringify(linked.body));
    const [[lastTask]] = await api.pool.query(
        "SELECT task_title, task_sort_order FROM tb_tasks WHERE project_id = ? ORDER BY task_sort_order DESC LIMIT 1",
        [projectId],
    );
    assert.equal(lastTask.task_title, "เพิ่มรายงานยอดขาย");
    assert.equal(lastTask.task_sort_order, 5);

    // ผู้ลบต้องเป็นสมาชิก — ใช้ PM ของโปรเจกต์
    const deleteProject = await as(people.seller, "DELETE", `/V1/projects/${projectId}`);
    assert.equal(deleteProject.status, 409);
    assert.equal(deleteProject.body.code, "PROJECT_HAS_QUOTATIONS");
});

test("ตอบรับแบบไม่ผูกโปรเจกต์ · ผูกโปรเจกต์ของลูกค้ารายอื่นไม่ได้", async () => {
    const otherClient = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าอีกราย" } });
    const otherProject = await api.callApi("POST", "/V1/projects", {
        body: { project_name: "โปรเจกต์ของลูกค้าอื่น", client_id: otherClient.body.client_id },
    });
    const quotationId = await approvedQuotation();
    const wrongClient = await as(people.seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "existing",
        project_id: otherProject.body.project_id,
    });
    assert.equal(wrongClient.status, 400);
    const missingProject = await as(people.seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "existing",
    });
    assert.equal(missingProject.status, 400);

    const noProject = await as(people.seller, "POST", `/V1/quotations/${quotationId}/accept`, {
        project_mode: "none",
        create_tasks: true,
    });
    assert.equal(noProject.status, 200);
    assert.equal(noProject.body.project_id, null);
    assert.equal(noProject.body.task_count, 0);
});

test("ชื่องานตัดที่ 200 ตัวอักษรที่มองเห็น ไม่ตัดกลางสระ/วรรณยุกต์ไทย", () => {
    const { taskTitleFrom } = require("../src/services/quotation-accept.service");
    const longThai = "กี่".repeat(250);
    const title = taskTitleFrom(longThai);
    assert.equal([...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(title)].length, 200);
    assert.ok(title.endsWith("กี่…"));
    assert.equal(taskTitleFrom("\n\n  บรรทัดแรก  \nบรรทัดสอง"), "บรรทัดแรก");
});

test("ทุกการกระทำเข้า audit log ด้วยชื่อการกระทำภาษาไทย", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/quotations%' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of [
        "สร้างร่างใบเสนอราคา",
        "แก้ร่างใบเสนอราคา",
        "ส่งใบเสนอราคาขออนุมัติ",
        "อนุมัติใบเสนอราคา",
        "ตีกลับใบเสนอราคา",
        "ออก revision ใบเสนอราคา",
        "คัดลอกเป็นใบเสนอราคาใหม่",
        "ยกเลิกใบเสนอราคา",
        "ลบร่างใบเสนอราคา",
        "บันทึกว่าลูกค้าตอบรับใบเสนอราคา",
    ]) {
        assert.ok(actions.has(expected), `ไม่พบ "${expected}" (มี: ${[...actions].join(", ")})`);
    }
});
