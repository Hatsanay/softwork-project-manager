// คำถามความต้องการ S-2 (2026-10-25 · docs/plans/2026-10-25-client-order-link.md ข้อ 4)
// ชุดตั้งต้น 5 กลุ่มจาก deploy · กลุ่มผูกหมวด · ถามเฉพาะกลุ่มทั่วไป + กลุ่มของหมวดที่เลือก · ตรวจคำตอบตามชนิด
// แนบไฟล์ผ่าน multipart (รูป/PDF) · คำตอบเก็บข้อความคำถาม ณ วันส่ง (แก้/ลบคำถามทีหลัง คำตอบเดิมยังอ่านได้)
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { startTestServer, createTestImage } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const {
    answerError,
    answerText,
    choiceValuesOf,
    numberRangeText,
    OTHER_OPTION,
    storedOtherText,
    visibleQuestionnaire,
} = require("../src/shared/requirement-answers.mjs");

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

test("กติกาคำตอบ: บังคับ · ตัวเลือก · ใช่/ไม่ใช่ · ตัวเลข · ลิงก์ · ไฟล์", () => {
    const single = { rqq_type: "single", rqq_is_required: true, rqq_options: ["ก", "ข"] };
    assert.equal(answerError(single, ""), "กรุณาตอบข้อนี้");
    assert.equal(answerError(single, "ค"), "เลือกจากตัวเลือกที่มี");
    assert.equal(answerError(single, "ก"), null);
    assert.equal(answerError({ rqq_type: "multi", rqq_is_required: false, rqq_options: ["ก", "ข"] }, ["ก", "ค"]), "เลือกจากตัวเลือกที่มี");
    assert.equal(answerError({ rqq_type: "yes_no", rqq_is_required: false }, "maybe"), "เลือก ใช่ หรือ ไม่ใช่");
    assert.equal(answerError({ rqq_type: "number", rqq_is_required: false }, "12.5"), null);
    assert.ok(answerError({ rqq_type: "number", rqq_is_required: false }, "สิบ"));
    assert.ok(answerError({ rqq_type: "number", rqq_is_required: false }, "-3"), "ตัวเลขติดลบไม่รับ");
    assert.ok(answerError({ rqq_type: "url", rqq_is_required: false }, "example.com"));
    assert.equal(answerError({ rqq_type: "file", rqq_is_required: true }, null, { fileCount: 0 }), "กรุณาแนบไฟล์");
    assert.equal(answerError({ rqq_type: "file", rqq_is_required: false }, null, { fileCount: 6 }), "แนบได้ไม่เกิน 5 ไฟล์");
    assert.equal(answerText("multi", JSON.stringify(["ก", "ข"])), "ก, ข");
});

test("อื่นๆ (ระบุ) · ช่วงตัวเลขพร้อมหน่วย · วันที่ต้องหลังวันนี้", () => {
    const channels = { rqq_type: "multi", rqq_is_required: false, rqq_options: ["LINE", "โทร"], rqq_allow_other: true };
    assert.deepEqual(choiceValuesOf(channels), ["LINE", "โทร", OTHER_OPTION]);
    assert.equal(answerError(channels, ["LINE", OTHER_OPTION], { otherText: "  " }), `พิมพ์รายละเอียดของ "${OTHER_OPTION}"`);
    assert.equal(answerError(channels, ["LINE", OTHER_OPTION], { otherText: "TikTok" }), null);
    assert.ok(answerError(channels, [OTHER_OPTION], { otherText: "ก".repeat(301) }));
    // ไม่ได้เปิด "อื่นๆ" = ตอบ "อื่นๆ" ไม่ได้ · เลือกแล้วเอาออก = ข้อความที่พิมพ์ค้างไม่ถูกเก็บ
    assert.equal(answerError({ ...channels, rqq_allow_other: false }, [OTHER_OPTION]), "เลือกจากตัวเลือกที่มี");
    assert.equal(storedOtherText(channels, ["LINE"], "TikTok"), null);
    assert.equal(storedOtherText(channels, ["LINE", OTHER_OPTION], " TikTok "), "TikTok");
    assert.equal(answerText("multi", JSON.stringify(["LINE", OTHER_OPTION]), "TikTok"), `LINE, ${OTHER_OPTION}: TikTok`);
    assert.equal(answerText("single", OTHER_OPTION, "ร้านเสริมสวย"), `${OTHER_OPTION}: ร้านเสริมสวย`);

    const screens = { rqq_type: "number", rqq_is_required: false, rqq_unit: "หน้าจอ", rqq_min: "1.00", rqq_max: "200.00" };
    assert.equal(answerError(screens, "0"), "ใส่ตัวเลข 1 ถึง 200 หน้าจอ");
    assert.equal(answerError(screens, "201"), "ใส่ตัวเลข 1 ถึง 200 หน้าจอ");
    assert.equal(answerError(screens, "12"), null);
    assert.equal(numberRangeText({ rqq_type: "number", rqq_min: null, rqq_max: "10.00", rqq_unit: null }), " ไม่เกิน 10");

    const deadline = { rqq_type: "date", rqq_is_required: false, rqq_future_only: true };
    assert.equal(answerError(deadline, "2026-10-26", { today: "2026-10-26" }), "เลือกวันหลังวันนี้");
    assert.equal(answerError(deadline, "2026-10-27", { today: "2026-10-26" }), null);
    assert.equal(answerError({ ...deadline, rqq_future_only: false }, "2020-01-01", { today: "2026-10-26" }), null);
});

test("ลูกค้าเห็นข้อไหน: ถามทุกคำขอ / ตามที่เลือก (หมวด ชุด สินค้า) / เฉพาะลิงก์ที่ถามเพิ่ม · ชนิดลิงก์ · ล็อกแพ็ก · ข้อลูก", () => {
    const question = (id, extra = {}) => ({ rqq_id: id, rqq_type: "short_text", rqq_audience: "group", rqq_skip_when_preset: false, rqq_parent_id: null, rqq_parent_values: [], ...extra });
    const group = (id, extra) => ({ rqg_id: id, rqg_audience: "all", category_ids: [], package_ids: [], product_ids: [], questions: [question(id * 10)], ...extra });
    const groups = [
        group(1, {
            rqg_trigger: "always",
            questions: [
                question(10),
                question(11, { rqq_audience: "direct" }), // ช่องทางติดต่อ: ไม่ถามใน Fastwork
                question(12, { rqq_skip_when_preset: true }), // งบประมาณ: ไม่ถามเมื่อล็อกแพ็ก
            ],
        }),
        group(2, { rqg_trigger: "selection", category_ids: ["WEB"] }),
        group(3, { rqg_trigger: "selection", package_ids: ["PKG-SYSTEM"] }),
        group(4, { rqg_trigger: "selection", product_ids: ["P-2LANG"] }),
        group(5, { rqg_trigger: "link_only" }),
        group(6, { rqg_trigger: "always", rqg_audience: "fastwork" }),
        group(7, {
            rqg_trigger: "always",
            questions: [
                question(70, { rqq_type: "single", rqq_options: ["มีแล้ว", "ยังไม่มี"] }),
                question(71, { rqq_type: "file", rqq_parent_id: 70, rqq_parent_values: ["มีแล้ว"] }),
                question(72, { rqq_type: "yes_no", rqq_parent_id: 70, rqq_parent_values: ["มีแล้ว"] }),
                question(73, { rqq_parent_id: 72, rqq_parent_values: ["yes"] }), // ข้อลูกของข้อลูก
                question(74, { rqq_type: "multi", rqq_options: ["ก", "ข"] }),
                question(75, { rqq_parent_id: 74, rqq_parent_values: ["ข"] }),
            ],
        }),
    ];
    const visibleIds = (context, answers = {}) =>
        visibleQuestionnaire(groups, { linkKind: "public", ...context }, answers).map((row) => `${row.rqg_id}:${row.questions.map((item) => item.rqq_id).join(",")}`);

    assert.deepEqual(visibleIds({ categoryIds: [null] }), ["1:10,11,12", "7:70,74"]);
    assert.deepEqual(visibleIds({ categoryIds: ["WEB"], packageIds: ["PKG-SYSTEM"], productIds: ["P-2LANG"] }), ["1:10,11,12", "2:20", "3:30", "4:40", "7:70,74"]);
    // ลิงก์ Fastwork: ไม่ถามช่องทางติดต่อ · เห็นกลุ่มเฉพาะ Fastwork · ล็อกแพ็ก = ไม่ถามงบประมาณ
    assert.deepEqual(visibleIds({ linkKind: "fastwork", hasPreset: true }), ["1:10", "6:60", "7:70,74"]);
    // ลิงก์ถามเพิ่มกลุ่มที่ไม่ถามเอง · ไม่ถามกลุ่มชนะทุกเงื่อนไข (รวมถามทุกคำขอ)
    assert.deepEqual(visibleIds({ includeGroupIds: [5], excludeGroupIds: [1, 7] }), ["5:50"]);
    // ข้อลูก: ขึ้นเมื่อข้อแม่ตอบตรง · ข้อลูกของข้อลูกขึ้นเมื่อข้อแม่ของมันขึ้นและตอบตรง · เลือกหลายข้อ = มีค่าใดค่าหนึ่ง
    assert.deepEqual(visibleIds({ excludeGroupIds: [1] }, { 70: "ยังไม่มี", 72: "yes" }), ["7:70,74"]);
    assert.deepEqual(visibleIds({ excludeGroupIds: [1] }, { 70: "มีแล้ว", 72: "yes", 74: ["ก", "ข"] }), ["7:70,71,72,73,74,75"]);
    assert.deepEqual(visibleIds({ excludeGroupIds: [1] }, { 70: "มีแล้ว", 72: "no" }), ["7:70,71,72,74"]);
    // ยังไม่รู้คำตอบ (ข้อความคัดลอกไปถามในแชต) = ข้อลูกขึ้นทั้งหมด
    assert.deepEqual(
        visibleQuestionnaire(groups, { linkKind: "fastwork", excludeGroupIds: [1, 6] }, null).map((row) => row.questions.map((item) => item.rqq_id)),
        [[70, 71, 72, 73, 74, 75]],
    );
    // matched บอกรายการที่ทำให้กลุ่มขึ้น (ใช้เขียน "ถามเพราะคุณเลือก …")
    const web = visibleQuestionnaire(groups, { linkKind: "public", categoryIds: ["WEB", "APP"] }).find((row) => row.rqg_id === 2);
    assert.deepEqual(web.matched, { category_ids: ["WEB"], package_ids: [], product_ids: [] });
});

test("ชุดคำถาม: ตั้งต้น 5 กลุ่ม · ผูกหมวด · เพิ่ม/แก้/เรียง/ลบ · เลือกตอบต้องมีตัวเลือก 2 ข้อ · แก้ได้เฉพาะ productManagement", async () => {
    const list = expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200);
    assert.deepEqual(list.data.map((group) => group.rqg_name), ["ทั่วไป", "เว็บไซต์", "แอปมือถือ", "ออกแบบ UX/UI", "ระบบงาน"]);
    // ชุดตั้งต้น: ทั่วไป = ถามทุกคำขอ · ที่เหลือยังไม่ผูกอะไร = ถามเฉพาะลิงก์ที่ถามเพิ่ม
    assert.deepEqual(list.data.map((group) => group.rqg_trigger), ["always", "link_only", "link_only", "link_only", "link_only"]);
    ids.general = list.data[0];
    ids.webGroup = list.data[1];
    ids.designGroup = list.data[3];

    // ผู้ดูแลคำขอดูได้ แต่แก้ไม่ได้
    expectStatus(await api.callApi("GET", "/V1/requirement-groups", { token: staffToken }), 200);
    const groupBody = (group, categoryIds) => ({
        rqg_name: group.rqg_name, rqg_description: group.rqg_description, rqg_trigger: "selection",
        rqg_sort_order: group.rqg_sort_order, rqg_status: "active", category_ids: categoryIds,
    });
    // ถามตามที่เลือกแต่ไม่ผูกอะไร = บอกให้เลือก (ไม่ปล่อยกลุ่มที่ไม่มีใครเห็น)
    const unbound = expectStatus(await api.callApi("PUT", `/V1/requirement-groups/${ids.webGroup.rqg_id}`, { body: groupBody(ids.webGroup, []) }), 400);
    assert.ok(unbound.fields.category_ids);
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
    // ชุดตั้งต้น (Q-5): ข้อไฟล์โลโก้ถามเมื่อตอบว่ามีโลโก้/สีประจำแบรนด์แล้ว
    const brandQuestion = ids.designGroup.questions.find((question) => question.rqq_text === "มีโลโก้/สีประจำแบรนด์แล้วไหม");
    const designAnswers = [
        { question_id: ids.designGroup.questions[0].rqq_id, value: "เว็บไซต์" },
        { question_id: brandQuestion.rqq_id, value: "มีครบ" },
    ];
    form.append("payload", JSON.stringify({ items: bothItems, contact, seen_total: "10000.00", submit_key: crypto.randomUUID(), answers: [...answers, ...designAnswers] }));
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
    assert.match(response.headers.get("content-disposition"), /^inline;/);
    const anonymousFile = await fetch(`${api.baseUrl}/api/V1/service-requests/${sent.svr_id}/files/${fileId}`);
    assert.equal(anonymousFile.status, 401);
});

// ─── Q-1 (2026-10-26 · docs/plans/2026-10-26-customer-questions.md) ───

const SVG_WITH_SCRIPT = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

async function addQuestion(groupId, body) {
    return expectStatus(await api.callApi("POST", `/V1/requirement-groups/${groupId}/questions`, { body: { rqq_status: "active", ...body } }), 201).rqq_id;
}

test("ข้อลูก + อื่นๆ (ระบุ) + ตัวเลข/วันที่ + ไฟล์งานออกแบบ: ตรวจเฉพาะข้อที่ขึ้น · SVG ดาวน์โหลดเท่านั้น", async () => {
    const shopGroup = expectStatus(
        await api.callApi("POST", "/V1/requirement-groups", {
            body: { rqg_name: "ข้อมูลร้าน", rqg_customer_intro: "ใช้ออกแบบเว็บให้ตรงกับร้าน", rqg_trigger: "selection", rqg_status: "active", product_ids: [ids.website] },
        }),
        201,
    );
    const hasLogo = await addQuestion(shopGroup.rqg_id, { rqq_text: "มีโลโก้แล้วไหม", rqq_type: "single", rqq_options: ["มีแล้ว", "ยังไม่มี"], rqq_is_required: true });
    const logoFile = await addQuestion(shopGroup.rqg_id, {
        rqq_text: "ไฟล์โลโก้", rqq_type: "file", rqq_file_kind: "design", rqq_is_required: true, rqq_parent_id: hasLogo, rqq_parent_values: ["มีแล้ว"],
    });
    const channels = await addQuestion(shopGroup.rqg_id, { rqq_text: "ช่องทางติดต่อในเว็บ", rqq_type: "multi", rqq_options: ["LINE", "โทร"], rqq_allow_other: true });
    const pages = await addQuestion(shopGroup.rqg_id, { rqq_text: "กี่หน้า", rqq_type: "number", rqq_unit: "หน้า", rqq_min: "1", rqq_max: "20" });
    const deadline = await addQuestion(shopGroup.rqg_id, { rqq_text: "อยากให้เสร็จภายใน", rqq_type: "date", rqq_future_only: true });

    const code = ids.link.ol_short_code;
    const shop = expectStatus(await anonymous("GET", `/V1/order/${code}`), 200);
    assert.deepEqual(shop.question_rules, { include_group_ids: [], exclude_group_ids: [] });
    const generalRequired = ids.general.questions.find((question) => question.rqq_is_required);
    const base = { items: [{ kind: "product", id: ids.website, quantity: 1 }], contact, seen_total: "5000.00" };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    const answers = (extra) => [{ question_id: generalRequired.rqq_id, value: "ร้านกาแฟ" }, ...extra];

    // ตอบผิดทุกแบบในครั้งเดียว: ข้อลูกขึ้นแล้ว (มีโลโก้) แต่ไม่แนบ · อื่นๆ ไม่พิมพ์ · ตัวเลขเกินช่วง · วันที่วันนี้
    const wrong = expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, {
            ...base,
            submit_key: crypto.randomUUID(),
            answers: answers([
                { question_id: hasLogo, value: "มีแล้ว" },
                { question_id: channels, value: ["LINE", OTHER_OPTION], other_text: "" },
                { question_id: pages, value: "50" },
                { question_id: deadline, value: today },
            ]),
        }),
        400,
    );
    assert.equal(wrong.fields[`answers.${logoFile}`], "กรุณาแนบไฟล์");
    assert.match(wrong.fields[`answers.${channels}`], /พิมพ์รายละเอียด/);
    assert.equal(wrong.fields[`answers.${pages}`], "ใส่ตัวเลข 1 ถึง 20 หน้า");
    assert.equal(wrong.fields[`answers.${deadline}`], "เลือกวันหลังวันนี้");

    // ยังไม่มีโลโก้: ไม่ถามข้อไฟล์ (ข้อบังคับที่ไม่ขึ้นไม่ต้องตอบ) · แนบไฟล์มาในข้อนั้น = ไม่ได้
    const strayForm = new FormData();
    strayForm.append("payload", JSON.stringify({ ...base, submit_key: crypto.randomUUID(), answers: answers([{ question_id: hasLogo, value: "ยังไม่มี" }]) }));
    strayForm.append(`file_${logoFile}`, new Blob([SVG_WITH_SCRIPT], { type: "image/svg+xml" }), "logo.svg");
    const stray = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, strayForm), 400);
    assert.match(stray.fields[`answers.${logoFile}`], /แนบไฟล์ในข้อนี้ไม่ได้/);
    expectStatus(
        await anonymous("POST", `/V1/order/${code}/requests`, { ...base, submit_key: crypto.randomUUID(), answers: answers([{ question_id: hasLogo, value: "ยังไม่มี" }]) }),
        201,
    );

    // ข้อรูป/PDF ไม่รับ SVG (ตรวจจากเนื้อไฟล์)
    const photoFile = await addQuestion(shopGroup.rqg_id, { rqq_text: "รูปหน้าร้าน", rqq_type: "file", rqq_file_kind: "document" });
    const svgAsDocument = new FormData();
    svgAsDocument.append("payload", JSON.stringify({ ...base, submit_key: crypto.randomUUID(), answers: answers([{ question_id: hasLogo, value: "ยังไม่มี" }]) }));
    svgAsDocument.append(`file_${photoFile}`, new Blob([SVG_WITH_SCRIPT], { type: "image/svg+xml" }), "logo.svg");
    const rejected = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, svgAsDocument), 400);
    assert.match(rejected.fields[`answers.${photoFile}`], /PDF JPG หรือ PNG/);

    // ตอบครบ: ข้อไฟล์งานออกแบบรับ SVG · อื่นๆ เก็บข้อความ · พนักงานเปิดไฟล์ = ดาวน์โหลด (ไม่เปิดในแท็บ)
    const form = new FormData();
    form.append(
        "payload",
        JSON.stringify({
            ...base,
            submit_key: crypto.randomUUID(),
            answers: answers([
                { question_id: hasLogo, value: "มีแล้ว" },
                { question_id: channels, value: ["LINE", OTHER_OPTION], other_text: "TikTok" },
                { question_id: pages, value: "5" },
            ]),
        }),
    );
    form.append(`file_${logoFile}`, new Blob([SVG_WITH_SCRIPT], { type: "image/svg+xml" }), "โลโก้.svg");
    const sent = expectStatus(await anonymous("POST", `/V1/order/${code}/requests`, form), 201);
    const detail = expectStatus(await api.callApi("GET", `/V1/service-requests/${sent.svr_id}`, { token: staffToken }), 200);
    assert.equal(detail.answers.find((answer) => answer.question === "ช่องทางติดต่อในเว็บ").answer, `LINE, ${OTHER_OPTION}: TikTok`);
    const svgFile = detail.answers.find((answer) => answer.question === "ไฟล์โลโก้").files[0];
    assert.equal(svgFile.is_viewable, false);
    const download = await fetch(`${api.baseUrl}/api/V1/service-requests/${sent.svr_id}/files/${svgFile.id}`, { headers: { Authorization: `Bearer ${staffToken}` } });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), "application/octet-stream");
    assert.match(download.headers.get("content-disposition"), /^attachment;/);
    assert.equal(download.headers.get("x-content-type-options"), "nosniff");

    expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${shopGroup.rqg_id}`), 200);
});

test("กติกาข้อแม่: กลุ่มเดียวกัน · ชนิดเลือกตอบ · ค่าต้องมีจริง · ข้อลูกอยู่ใต้ข้อแม่ · ลบ/แก้ข้อแม่ที่ข้อลูกใช้อยู่ไม่ได้", async () => {
    const createGroup = async (name) =>
        expectStatus(await api.callApi("POST", "/V1/requirement-groups", { body: { rqg_name: name, rqg_trigger: "link_only", rqg_status: "active" } }), 201).rqg_id;
    const groupId = await createGroup("กติกาข้อแม่");
    const otherGroupId = await createGroup("กลุ่มอื่น");
    const parentId = await addQuestion(groupId, { rqq_text: "มีเว็บเดิมไหม", rqq_type: "yes_no" });
    const textId = await addQuestion(groupId, { rqq_text: "ชื่อร้าน", rqq_type: "short_text" });
    const choiceId = await addQuestion(groupId, { rqq_text: "สีหลัก", rqq_type: "single", rqq_options: ["ฟ้า", "เขียว"] });
    const outsider = await addQuestion(otherGroupId, { rqq_text: "ข้อของกลุ่มอื่น", rqq_type: "yes_no" });

    const addChild = (parent, values) =>
        api.callApi("POST", `/V1/requirement-groups/${groupId}/questions`, {
            body: { rqq_text: "ลิงก์เว็บเดิม", rqq_type: "url", rqq_status: "active", rqq_parent_id: parent, rqq_parent_values: values },
        });
    assert.ok(expectStatus(await addChild(outsider, ["yes"]), 400).fields.rqq_parent_id, "ข้อแม่ต่างกลุ่ม");
    assert.ok(expectStatus(await addChild(textId, ["ร้าน"]), 400).fields.rqq_parent_id, "ข้อแม่ต้องเป็นชนิดเลือกตอบ");
    assert.ok(expectStatus(await addChild(parentId, ["maybe"]), 400).fields.rqq_parent_values, "ค่าต้องมีในตัวเลือก");
    assert.ok(expectStatus(await addChild(parentId, []), 400).fields.rqq_parent_values, "ต้องเลือกค่าอย่างน้อย 1");
    const childId = expectStatus(await addChild(parentId, ["yes"]), 201).rqq_id;
    const colorChild = expectStatus(
        await api.callApi("POST", `/V1/requirement-groups/${groupId}/questions`, {
            body: { rqq_text: "ทำไมเลือกเขียว", rqq_type: "short_text", rqq_status: "active", rqq_parent_id: choiceId, rqq_parent_values: ["เขียว"] },
        }),
        201,
    ).rqq_id;

    // เรียงจนข้อลูกอยู่เหนือข้อแม่ไม่ได้
    const reorder = (order) => api.callApi("PUT", `/V1/requirement-groups/${groupId}/question-order`, { body: { question_ids: order } });
    assert.equal(expectStatus(await reorder([childId, parentId, textId, choiceId, colorChild]), 409).code, "REQUIREMENT_CHILD_ABOVE_PARENT");
    expectStatus(await reorder([parentId, childId, textId, choiceId, colorChild]), 200);

    // ข้อแม่: ลบไม่ได้ · เปลี่ยนเป็นชนิดข้อความไม่ได้ · เอาตัวเลือกที่ข้อลูกใช้ออกไม่ได้ · เพิ่มตัวเลือกได้
    assert.equal(expectStatus(await api.callApi("DELETE", `/V1/requirement-questions/${parentId}`), 409).code, "REQUIREMENT_QUESTION_HAS_CHILDREN");
    const asText = expectStatus(await api.callApi("PUT", `/V1/requirement-questions/${parentId}`, { body: { rqq_text: "มีเว็บเดิมไหม", rqq_type: "short_text", rqq_status: "active" } }), 400);
    assert.match(asText.fields.rqq_type, /ลิงก์เว็บเดิม/);
    const editColor = (options) =>
        api.callApi("PUT", `/V1/requirement-questions/${choiceId}`, { body: { rqq_text: "สีหลัก", rqq_type: "single", rqq_options: options, rqq_status: "active" } });
    assert.match(expectStatus(await editColor(["ฟ้า", "แดง"]), 400).fields.rqq_options, /ทำไมเลือกเขียว/);
    expectStatus(await editColor(["ฟ้า", "เขียว", "แดง"]), 200);

    // ลบทั้งกลุ่มได้ (ข้อแม่-ข้อลูกหายพร้อมกัน)
    expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${groupId}`), 200);
    expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${otherGroupId}`), 200);
    const [[left]] = await api.pool.query("SELECT COUNT(*) AS total FROM tb_requirement_questions WHERE rqq_group_id IN (?)", [[groupId, otherGroupId]]);
    assert.equal(Number(left.total), 0);
});

test("Q-2 เรียงกลุ่ม · คัดลอกกลุ่ม (สำเนาปิดไว้ · ข้อแม่ชี้ข้อใหม่) · คัดลอกคำถาม · ย้ายคำถามพร้อมข้อลูก · นับคนตอบ", async () => {
    const createGroup = async (name) =>
        expectStatus(await api.callApi("POST", "/V1/requirement-groups", { body: { rqg_name: name, rqg_trigger: "link_only", rqg_status: "active" } }), 201).rqg_id;
    const sourceId = await createGroup("ต้นฉบับ");
    const targetId = await createGroup("ปลายทาง");
    const parentId = await addQuestion(sourceId, { rqq_text: "มีโลโก้ไหม", rqq_type: "yes_no" });
    const childId = await addQuestion(sourceId, { rqq_text: "ไฟล์โลโก้", rqq_type: "file", rqq_parent_id: parentId, rqq_parent_values: ["yes"] });
    const secondChildId = await addQuestion(sourceId, { rqq_text: "สีโลโก้", rqq_type: "short_text", rqq_parent_id: parentId, rqq_parent_values: ["yes"] });
    const otherId = await addQuestion(sourceId, { rqq_text: "ข้ออื่น", rqq_type: "short_text" });
    const groupsNow = async () => expectStatus(await api.callApi("GET", "/V1/requirement-groups"), 200).data;

    // เรียงกลุ่ม: ส่งไม่ครบ = 409 · ส่งครบ = ลำดับตามที่ส่ง · ผู้ดูแลคำขออย่างเดียวเรียงไม่ได้
    const allIds = (await groupsNow()).map((group) => group.rqg_id);
    expectStatus(await api.callApi("PUT", "/V1/requirement-group-order", { body: { group_ids: allIds.slice(1) } }), 409);
    expectStatus(await api.callApi("PUT", "/V1/requirement-group-order", { token: staffToken, body: { group_ids: allIds } }), 403);
    const reversed = [...allIds].reverse();
    expectStatus(await api.callApi("PUT", "/V1/requirement-group-order", { body: { group_ids: reversed } }), 200);
    assert.deepEqual((await groupsNow()).map((group) => group.rqg_id), reversed);

    // คัดลอกกลุ่ม: ชื่อ "สำเนา" · ปิดใช้งาน · คำถามครบ · ข้อลูกชี้ข้อแม่ตัวใหม่
    const copied = expectStatus(await api.callApi("POST", `/V1/requirement-groups/${sourceId}/copy`), 201);
    const copyGroup = (await groupsNow()).find((group) => group.rqg_id === copied.rqg_id);
    assert.equal(copyGroup.rqg_name, "สำเนา ต้นฉบับ");
    assert.equal(copyGroup.rqg_status, "inactive");
    assert.deepEqual(copyGroup.questions.map((question) => question.rqq_text), ["มีโลโก้ไหม", "ไฟล์โลโก้", "สีโลโก้", "ข้ออื่น"]);
    assert.equal(copyGroup.questions[1].rqq_parent_id, copyGroup.questions[0].rqq_id);
    assert.deepEqual(copyGroup.questions[1].rqq_parent_values, ["yes"]);

    // คัดลอกคำถาม: ท้ายกลุ่มเดิม เงื่อนไขติดไปด้วย
    const questionCopy = expectStatus(await api.callApi("POST", `/V1/requirement-questions/${childId}/copy`), 201);
    const afterCopy = (await groupsNow()).find((group) => group.rqg_id === sourceId).questions;
    assert.equal(afterCopy.at(-1).rqq_id, questionCopy.rqq_id);
    assert.equal(afterCopy.at(-1).rqq_text, "สำเนา ไฟล์โลโก้");
    assert.equal(afterCopy.at(-1).rqq_parent_id, parentId);

    // ย้ายข้อแม่: ข้อลูกทุกข้อ (รวมสำเนา) ย้ายตามไปท้ายกลุ่มปลายทาง · ข้ออื่นอยู่ที่เดิม
    expectStatus(await api.callApi("POST", `/V1/requirement-questions/${parentId}/move`, { body: { group_id: sourceId } }), 400);
    const moved = expectStatus(await api.callApi("POST", `/V1/requirement-questions/${parentId}/move`, { body: { group_id: targetId } }), 200);
    assert.equal(moved.moved_count, 4);
    assert.equal(moved.cleared_condition, false);
    const target = (await groupsNow()).find((group) => group.rqg_id === targetId).questions;
    assert.deepEqual(target.map((question) => question.rqq_id), [parentId, childId, secondChildId, questionCopy.rqq_id]);
    assert.deepEqual((await groupsNow()).find((group) => group.rqg_id === sourceId).questions.map((question) => question.rqq_id), [otherId]);

    // ย้ายข้อลูกกลับ: ข้อแม่อยู่อีกกลุ่ม → ล้างเงื่อนไข (ถามทุกครั้ง)
    const movedChild = expectStatus(await api.callApi("POST", `/V1/requirement-questions/${childId}/move`, { body: { group_id: sourceId } }), 200);
    assert.equal(movedChild.cleared_condition, true);
    const backInSource = (await groupsNow()).find((group) => group.rqg_id === sourceId).questions.find((question) => question.rqq_id === childId);
    assert.equal(backInSource.rqq_parent_id, null);
    assert.deepEqual(backInSource.rqq_parent_values, []);

    // นับคนตอบ: ข้อที่ยังไม่มีคนตอบ = 0
    assert.equal(backInSource.answer_count, 0);
    const answered = (await groupsNow()).flatMap((group) => group.questions).find((question) => question.rqq_id === ids.general.questions.find((row) => row.rqq_is_required).rqq_id);
    assert.ok(answered.answer_count >= 1);

    for (const groupId of [sourceId, targetId, copied.rqg_id]) expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${groupId}`), 200);
});

test("Q-3 ลิงก์ถามเพิ่ม/ไม่ถามกลุ่ม: ตั้งในลิงก์ · ห้ามซ้ำสองฝั่ง · backend ใช้ตอนส่ง · ไม่ถามชนะถามทุกคำขอ", async () => {
    const extraGroup = expectStatus(await api.callApi("POST", "/V1/requirement-groups", { body: { rqg_name: "ระบบงาน (เฉพาะลิงก์)", rqg_trigger: "link_only", rqg_status: "active" } }), 201);
    const extraQuestion = await addQuestion(extraGroup.rqg_id, { rqq_text: "ผู้ใช้กี่คน", rqq_type: "number", rqq_is_required: true });
    const linkBody = (rules) => ({ ol_kind: "public", ol_name: "ลิงก์ทดสอบกลุ่ม", ol_assignee_id: adminId, question_rules: rules });
    const overlap = expectStatus(
        await api.callApi("POST", "/V1/order-links", { body: linkBody({ include_group_ids: [extraGroup.rqg_id], exclude_group_ids: [extraGroup.rqg_id] }) }),
        400,
    );
    assert.ok(overlap.fields.question_rules);
    assert.ok(expectStatus(await api.callApi("POST", "/V1/order-links", { body: linkBody({ include_group_ids: [999999], exclude_group_ids: [] }) }), 400).fields.question_rules);
    const rules = { include_group_ids: [extraGroup.rqg_id], exclude_group_ids: [ids.general.rqg_id] };
    const link = expectStatus(await api.callApi("POST", "/V1/order-links", { body: linkBody(rules) }), 201);
    assert.deepEqual(link.question_rules, rules);
    const listed = expectStatus(await api.callApi("GET", "/V1/order-links"), 200).data.find((row) => row.ol_id === link.ol_id);
    assert.deepEqual(listed.question_rules, rules);
    const shop = expectStatus(await anonymous("GET", `/V1/order/${link.ol_short_code}`), 200);
    assert.deepEqual(shop.question_rules, { include_group_ids: [extraGroup.rqg_id], exclude_group_ids: [ids.general.rqg_id] });

    const body = (answers) => ({ items: [{ kind: "product", id: ids.logo, quantity: 1 }], contact, seen_total: "5000.00", submit_key: crypto.randomUUID(), answers });
    const missing = expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, body([])), 400);
    assert.ok(missing.fields[`answers.${extraQuestion}`], "กลุ่มที่ลิงก์ถามเพิ่มต้องตอบ");
    const generalRequired = ids.general.questions.find((question) => question.rqq_is_required);
    assert.equal(missing.fields[`answers.${generalRequired.rqq_id}`], undefined, "กลุ่มที่ลิงก์ไม่ถาม ไม่ต้องตอบแม้เป็นถามทุกคำขอ");
    expectStatus(await anonymous("POST", `/V1/order/${link.ol_short_code}/requests`, body([{ question_id: extraQuestion, value: "12" }])), 201);
});

test("Q-4 ลูกค้าเดิมไม่ต้องตอบซ้ำ: เฉพาะลิงก์เฉพาะลูกค้า · เฉพาะข้อที่เปิดเติม · คำตอบล่าสุด · ไม่มีในลิงก์สาธารณะ", async () => {
    const client = expectStatus(await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านกาแฟริมทะเล", client_phone: "0817778899" } }), 201).client_id;
    const group = expectStatus(await api.callApi("POST", "/V1/requirement-groups", { body: { rqg_name: "ข้อมูลธุรกิจ", rqg_trigger: "always", rqg_status: "active" } }), 201);
    const business = await addQuestion(group.rqg_id, { rqq_text: "ร้านขายอะไร", rqq_type: "short_text", rqq_prefill: true });
    const channels = await addQuestion(group.rqg_id, { rqq_text: "ลูกค้ามาจากช่องทางไหน", rqq_type: "multi", rqq_options: ["หน้าร้าน", "ออนไลน์"], rqq_allow_other: true, rqq_prefill: true });
    const deadline = await addQuestion(group.rqg_id, { rqq_text: "อยากได้เมื่อไหร่", rqq_type: "short_text" });
    const generalRequired = ids.general.questions.find((question) => question.rqq_is_required);
    const personalLink = async () =>
        expectStatus(await api.callApi("POST", "/V1/order-links", { body: { ol_kind: "personal", ol_client_id: client, ol_assignee_id: adminId } }), 201);
    const send = (code, answers) =>
        anonymous("POST", `/V1/order/${code}/requests`, {
            items: [{ kind: "product", id: ids.logo, quantity: 1 }],
            contact,
            seen_total: "5000.00",
            submit_key: crypto.randomUUID(),
            answers: [{ question_id: generalRequired.rqq_id, value: "ร้านกาแฟ" }, ...answers],
        });

    const first = await personalLink();
    assert.deepEqual(expectStatus(await anonymous("GET", `/V1/order/${first.ol_short_code}`), 200).answer_prefill, {}, "ครั้งแรกยังไม่มีคำตอบเดิม");
    expectStatus(await send(first.ol_short_code, [
        { question_id: business, value: "กาแฟและเบเกอรี่" },
        { question_id: channels, value: ["หน้าร้าน", OTHER_OPTION], other_text: "Grab" },
        { question_id: deadline, value: "สิ้นเดือน" },
    ]), 201);

    // ลิงก์ใหม่ของลูกค้าคนเดิม: เติมเฉพาะข้อที่เปิดเติม (ไม่เติม "อยากได้เมื่อไหร่")
    const second = await personalLink();
    const prefill = expectStatus(await anonymous("GET", `/V1/order/${second.ol_short_code}`), 200).answer_prefill;
    assert.deepEqual(prefill, {
        // ชุดตั้งต้น (Q-5): "ธุรกิจทำอะไร" ของกลุ่มทั่วไปเปิดเติมคำตอบเดิม
        [generalRequired.rqq_id]: { value: "ร้านกาแฟ", other_text: null },
        [business]: { value: "กาแฟและเบเกอรี่", other_text: null },
        [channels]: { value: ["หน้าร้าน", OTHER_OPTION], other_text: "Grab" },
    });
    // ลิงก์สาธารณะไม่เติม (ไม่รู้ว่าใคร)
    assert.deepEqual(expectStatus(await anonymous("GET", `/V1/order/${ids.link.ol_short_code}`), 200).answer_prefill, {});
    expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${group.rqg_id}`), 200);
});

test("Q-4 คำถามเปลี่ยนระหว่างตอบ: มีข้อบังคับที่หน้าร้านไม่เคยแสดง = 409 QUESTIONNAIRE_CHANGED · ไม่ส่งรายการข้อที่เห็น = 400 ปกติ", async () => {
    const group = expectStatus(await api.callApi("POST", "/V1/requirement-groups", { body: { rqg_name: "ข้อใหม่ระหว่างตอบ", rqg_trigger: "always", rqg_status: "active" } }), 201);
    const added = await addQuestion(group.rqg_id, { rqq_text: "ข้อที่เพิ่งเพิ่ม", rqq_type: "short_text", rqq_is_required: true });
    const generalRequired = ids.general.questions.find((question) => question.rqq_is_required);
    const body = (extra) => ({
        items: [{ kind: "product", id: ids.logo, quantity: 1 }],
        contact,
        seen_total: "5000.00",
        submit_key: crypto.randomUUID(),
        answers: [{ question_id: generalRequired.rqq_id, value: "ร้านกาแฟ" }],
        ...extra,
    });
    const changed = expectStatus(await anonymous("POST", `/V1/order/${ids.link.ol_short_code}/requests`, body({ seen_question_ids: [generalRequired.rqq_id] })), 409);
    assert.equal(changed.code, "QUESTIONNAIRE_CHANGED");
    assert.ok(changed.fields[`answers.${added}`]);
    // หน้าร้านเห็นข้อนั้นแล้วแต่ยังไม่ตอบ = ผิดตามปกติ
    expectStatus(await anonymous("POST", `/V1/order/${ids.link.ol_short_code}/requests`, body({ seen_question_ids: [generalRequired.rqq_id, added] })), 400);
    expectStatus(await anonymous("POST", `/V1/order/${ids.link.ol_short_code}/requests`, body({})), 400);
    expectStatus(await api.callApi("DELETE", `/V1/requirement-groups/${group.rqg_id}`), 200);
});
