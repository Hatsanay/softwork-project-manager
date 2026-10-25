// คำถามความต้องการ S-2 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 4)
// ชุดตั้งต้น 5 กลุ่มจาก deploy · กลุ่มผูกหมวด · ถามเฉพาะกลุ่มทั่วไป + กลุ่มของหมวดที่เลือก · ตรวจคำตอบตามชนิด
// แนบไฟล์ผ่าน multipart (รูป/PDF) · คำตอบเก็บข้อความคำถาม ณ วันส่ง (แก้/ลบคำถามทีหลัง คำตอบเดิมยังอ่านได้)
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { startTestServer, createTestImage } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { answerError, applicableGroups, answerText } = require("../src/shared/requirement-answers.mjs");

const PASSWORD = "Staff@2026";
let api;
let adminId;
let staffToken;
const ids = {};

const anonymous = (method, url, body) => api.callApi(method, url, { token: null, body });

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const contact = { contact_name: "คุณมานพ", contact_phone: "0812223344", consent: true };

test.before(async () => {
    api = await startTestServer("order_requirements");
    await api.loginAsAdmin();
    const [[admin]] = await api.pool.query("SELECT user_id FROM tb_users WHERE user_username = 'admin'");
    adminId = admin.user_id;
    const bits = PERMISSION_KEYS.map((key) => (["dashboard", "manageServiceRequests"].includes(key) ? "1" : "0")).join("");
    const role = expectStatus(await api.callApi("POST", "/V1/roles", { body: { role_name: "role-requests", role_permission: bits } }), 201);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901310000001', 'rq.staff', 'rq.staff@example.com', ?, 'rq', 'staff', ?, 0)`,
        [await bcrypt.hash(PASSWORD, 10), role.role_id],
    );
    staffToken = await api.login("rq.staff", PASSWORD);

    ids.web = expectStatus(await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "เว็บไซต์", pc_sort_order: 1, pc_status: "active" } }), 201).pc_id;
    ids.design = expectStatus(await api.callApi("POST", "/V1/product-categories", { body: { pc_name: "ออกแบบ", pc_sort_order: 2, pc_status: "active" } }), 201).pc_id;
    const product = (name, categoryId) => ({
        product_code: null, product_name: name, product_description: null, product_unit: "งาน", product_price: "5000",
        product_category_id: categoryId, product_status: "active", product_is_public: true,
    });
    ids.website = expectStatus(await api.callApi("POST", "/V1/products", { body: product("เว็บไซต์", ids.web) }), 201).product_id;
    ids.logo = expectStatus(await api.callApi("POST", "/V1/products", { body: product("ออกแบบโลโก้", ids.design) }), 201).product_id;
    ids.link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "public", ol_name: "หน้าเว็บ", ol_assignee_id: adminId } }), 201);
});

test.after(async () => {
    await api?.stop();
});

test("กติกาคำตอบ: บังคับ · ตัวเลือก · ใช่/ไม่ใช่ · ตัวเลข · ลิงก์ · ไฟล์ · กลุ่มที่ต้องถาม", () => {
    const single = { rqq_type: "single", rqq_is_required: true, rqq_options: ["ก", "ข"] };
    assert.equal(answerError(single, ""), "กรุณาตอบข้อนี้");
    assert.equal(answerError(single, "ค"), "เลือกจากตัวเลือกที่มี");
    assert.equal(answerError(single, "ก"), null);
    assert.equal(answerError({ rqq_type: "multi", rqq_is_required: false, rqq_options: ["ก", "ข"] }, ["ก", "ค"]), "เลือกจากตัวเลือกที่มี");
    assert.equal(answerError({ rqq_type: "yes_no", rqq_is_required: false }, "maybe"), "เลือก ใช่ หรือ ไม่ใช่");
    assert.equal(answerError({ rqq_type: "number", rqq_is_required: false }, "12.5"), null);
    assert.ok(answerError({ rqq_type: "number", rqq_is_required: false }, "สิบ"));
    assert.ok(answerError({ rqq_type: "url", rqq_is_required: false }, "example.com"));
    assert.equal(answerError({ rqq_type: "file", rqq_is_required: true }, null, 0), "กรุณาแนบไฟล์");
    assert.equal(answerError({ rqq_type: "file", rqq_is_required: false }, null, 6), "แนบได้ไม่เกิน 5 ไฟล์");
    assert.equal(answerText("multi", JSON.stringify(["ก", "ข"])), "ก, ข");
    const groups = [
        { rqg_id: 1, rqg_is_general: true, category_ids: [] },
        { rqg_id: 2, rqg_is_general: false, category_ids: ["WEB"] },
        { rqg_id: 3, rqg_is_general: false, category_ids: ["APP"] },
    ];
    assert.deepEqual(applicableGroups(groups, ["WEB", null]).map((group) => group.rqg_id), [1, 2]);
});

test("ชุดคำถาม: ตั้งต้น 5 กลุ่ม · ผูกหมวด · เพิ่ม/แก้/เรียง/ลบ · เลือกตอบต้องมีตัวเลือก 2 ข้อ · แก้ได้เฉพาะ productManagement", async () => {
    const list = expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200);
    assert.deepEqual(list.data.map((group) => group.rqg_name), ["ทั่วไป", "เว็บไซต์", "แอปมือถือ", "ออกแบบ UX/UI", "ระบบงาน"]);
    assert.equal(list.data[0].rqg_is_general, true);
    ids.general = list.data[0];
    ids.webGroup = list.data[1];
    ids.designGroup = list.data[3];

    // ผู้ดูแลคำขอดูได้ แต่แก้ไม่ได้
    expectStatus(await api.callApi("GET", "/V1/requirement-groups", { token: staffToken }), 200);
    const groupBody = (group, categoryIds) => ({
        rqg_name: group.rqg_name, rqg_description: group.rqg_description, rqg_is_general: group.rqg_is_general,
        rqg_sort_order: group.rqg_sort_order, rqg_status: "active", category_ids: categoryIds,
    });
    expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.webGroup.rqg_id}`, { token: staffToken, body: groupBody(ids.webGroup, [ids.web]) }), 403);
    expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.webGroup.rqg_id}`, { body: groupBody(ids.webGroup, [ids.web]) }), 200);
    expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.designGroup.rqg_id}`, { body: groupBody(ids.designGroup, [ids.design]) }), 200);

    const noOptions = expectStatus(
        await api.callApi("POST", `/V1/requirement-groups/${ids.webGroup.rqg_id}/questions`, {
            body: { rqq_text: "สีหลัก", rqq_type: "single", rqq_options: ["ฟ้า"], rqq_status: "active" },
        }),
        400,
    );
    assert.ok(noOptions.fields.rqq_options);
    const added = expectStatus(
        await api.callApi("POST", `/V1/requirement-groups/${ids.webGroup.rqg_id}/questions`, {
            body: { rqq_text: "สีหลักของเว็บ", rqq_type: "single", rqq_options: ["ฟ้า", "เขียว"], rqq_is_required: true, rqq_status: "active" },
        }),
        201,
    );
    ids.colorQuestion = added.rqq_id;
    const after = expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200);
    const webQuestions = after.data.find((group) => group.rqg_id === ids.webGroup.rqg_id).questions;
    assert.equal(webQuestions.at(-1).rqq_text, "สีหลักของเว็บ");
    assert.deepEqual(webQuestions.at(-1).rqq_options, ["ฟ้า", "เขียว"]);
    // ย้ายคำถามใหม่ขึ้นบนสุด · ส่งไม่ครบ = 409
    const order = webQuestions.map((question) => question.rqq_id);
    expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.webGroup.rqg_id}/question-order`, { body: { question_ids: order.slice(1) } }), 409);
    expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.webGroup.rqg_id}/question-order`, { body: { question_ids: [ids.colorQuestion, ...order.slice(0, -1)] } }), 200);
    const reordered = expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200);
    assert.equal(reordered.data.find((group) => group.rqg_id === ids.webGroup.rqg_id).questions[0].rqq_id, ids.colorQuestion);
});

test("ส่งคำขอพร้อมคำตอบ: ถามเฉพาะกลุ่มที่เกี่ยว · ข้อบังคับ · แนบไฟล์ · ลบคำถามทีหลังคำตอบยังอยู่ · พนักงานเปิดไฟล์ได้", async () => {
    const code = ids.link.ol_short_code;
    const shop = expectStatus(await anonymous("GET", `/V1/order/${code}`), 200);
    assert.ok(shop.questionnaire.length >= 2);
    const generalRequired = ids.general.questions.find((question) => question.rqq_is_required);
    const logoFileQuestion = ids.designGroup.questions.find((question) => question.rqq_type === "file");

    // เลือกเว็บไซต์อย่างเดียว: ต้องตอบข้อบังคับของทั่วไป + เว็บไซต์ · ไม่ถามกลุ่มออกแบบ
    const items = [{ kind: "product", id: ids.website, quantity: 1 }];
    const base = { items, contact, seen_total: "5000.00" };
    const missing = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, { ...base, submit_key: crypto.randomUUID() }), 400);
    assert.ok(missing.fields[`answers.${generalRequired.rqq_id}`]);
    assert.ok(missing.fields[`answers.${ids.colorQuestion}`]);
    assert.equal(missing.fields[`answers.${logoFileQuestion.rqq_id}`], undefined, "ไม่ถามกลุ่มที่ไม่เกี่ยว");

    const answers = [
        { question_id: generalRequired.rqq_id, value: "ร้านอาหารทะเล ลูกค้าเป็นนักท่องเที่ยว" },
        { question_id: ids.colorQuestion, value: "ฟ้า" },
    ];
    const wrongChoice = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, { ...base, submit_key: crypto.randomUUID(), answers: [answers[0], { question_id: ids.colorQuestion, value: "แดง" }] }),
        400,
    );
    assert.equal(wrongChoice.fields[`answers.${ids.colorQuestion}`], "เลือกจากตัวเลือกที่มี");

    // แนบไฟล์ในข้อที่ไม่ได้ถาม (กลุ่มออกแบบ) = ไม่ได้
    const strayForm = new FormData();
    strayForm.append("payload", JSON.stringify({ ...base, submit_key: crypto.randomUUID(), answers }));
    strayForm.append(`file_${logoFileQuestion.rqq_id}`, await createTestImage(), "logo.png");
    const stray = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, strayForm), 400);
    assert.ok(stray.fields[`answers.${logoFileQuestion.rqq_id}`]);

    // เว็บไซต์ + โลโก้: ถามกลุ่มออกแบบด้วย · แนบโลโก้ได้
    const bothItems = [...items, { kind: "product", id: ids.logo, quantity: 1 }];
    const form = new FormData();
    form.append("payload", JSON.stringify({ items: bothItems, contact, seen_total: "10000.00", submit_key: crypto.randomUUID(), answers: [...answers, { question_id: ids.designGroup.questions[0].rqq_id, value: "เว็บไซต์" }] }));
    form.append(`file_${logoFileQuestion.rqq_id}`, await createTestImage(), "โลโก้ร้าน.png");
    const sent = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, form), 201);

    // ลบคำถามสีทีหลัง: คำตอบเดิมยังแสดงพร้อมข้อความคำถามเดิม
    expectStatus(await api.callApi("DELETE", `/V1/requirement-questions/${ids.colorQuestion}`), 200);
    const status = expectStatus(await anonymous("GET", `/V1/order/requests/${sent.access_token}`), 200);
    const colorAnswer = status.answers.find((answer) => answer.question === "สีหลักของเว็บ");
    assert.equal(colorAnswer.answer, "ฟ้า");
    assert.equal(colorAnswer.group_name, "เว็บไซต์");
    const logoAnswer = status.answers.find((answer) => answer.type === "file" && answer.files.length > 0);
    assert.equal(logoAnswer.files[0].name, "โลโก้ร้าน.png");

    const detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`, { token: staffToken }), 200);
    assert.ok(detail.answers.some((answer) => answer.group_name === "ออกแบบ UX/UI"));
    const fileId = detail.answers.find((answer) => answer.files.length > 0).files[0].id;
    const response = await fetch(`${api.baseUrl}/api/V1/service-requests/${sent.svr_id}/files/${fileId}`, { headers: { Authorization: `Bearer ${staffToken}` } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/png");
    const anonymousFile = await fetch(`${api.baseUrl}/api/V1/service-requests/${sent.svr_id}/files/${fileId}`);
    assert.equal(anonymousFile.status, 401);
});
