// ข้อมูลจำลองชุด "ช่วงก่อนจดบริษัท" (2026-10-25 · P-4 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 13)
//
// เจ้าของเป็นบุคคลธรรมดา (ยังไม่จด VAT ยังไม่จดบริษัท) รับงานผ่าน Fastwork เป็นหลัก + ลูกค้าตรง 1 งาน
// ทีมไม่มีเงินเดือน แบ่งกำไรรายโปรเจกต์ · ส่วนที่เหลือเก็บเป็นเงินทุนเปิดบริษัท
// อ่านจากบนลงล่างได้เหมือนบันทึกประจำวัน · ยิงผ่าน API จริงทั้งหมด (ยอดเงิน เลขเอกสาร การล็อก ถูกตามกติกาของระบบ)
const bcrypt = require("bcryptjs");
const { setToday } = require("./clock");
const { as, forgetTokens } = require("./api");
const { scheduleFastworkLinks } = require("./order-links");
const data = require("./data");
const sales = require("./sales");
const purchasing = require("./purchasing");
const projects = require("./projects");
const { HEAD_OFFICE_ID } = require("./setup");

const LAST_DAY = "2026-10-23";
const OWNER = "hatsanai";
const EMAIL_DOMAIN = "softwork.fasttiw.com";
const FEE_RATE = 0.17;
const money = (value) => (Math.round(value * 100) / 100).toFixed(2);

// ทีมแบ่งกำไร (ไม่มีเงินเดือน · ไม่ได้เป็นพนักงาน) — ชื่อเดียวกับชุดบริษัท
const TEAM = ["nattapon", "supawadee", "chonthicha"];

function bitsFor(permissionKeys, keys) {
    if (keys === "ALL") return permissionKeys.map(() => "1").join("");
    return permissionKeys.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

// ─── ตั้งค่าก่อนเริ่ม (1 เม.ย. 2026) ─────────────────────────────────────────────────────────

async function setup({ pool, permissionKeys, generateDailyId, password }) {
    const ids = { users: {}, roles: {}, clients: {}, vendors: {}, products: {}, positions: {} };
    await pool.query("UPDATE tb_users SET user_must_change_password = 0 WHERE user_username = 'admin'");

    // ผู้ประกอบการบุคคลธรรมดา: ชื่อและเลขประจำตัวของเจ้าของ · ไม่จด VAT · ไม่มีวันที่จดบริษัท · อนุมัติเอกสารของตัวเองได้ (ทำคนเดียว)
    await as("admin", "PUT", "/V1/company", {
        ...data.COMPANY,
        cs_name_th: `${data.OWNER.fname} ${data.OWNER.lname}`,
        cs_name_en: "Hatsanai Moya (Softwork)",
        cs_vat_registered_from: null,
        cs_incorporated_on: null,
        cs_allow_self_approval: true,
    });
    await pool.query("UPDATE tb_company_settings SET cs_logo_url = ? WHERE cs_id = 1", [data.COMPANY_LOGO]);
    await as("admin", "PUT", `/V1/company/branches/${HEAD_OFFICE_ID}`, data.HEAD_OFFICE);
    ids.bankAccount = (await as("admin", "POST", "/V1/company/bank-accounts", data.BANK_ACCOUNT)).ba_id;
    // บัญชีแยกเก็บเงินทุน (คำแนะนำในหน้าเงินทุน)
    ids.capitalAccount = (await as("admin", "POST", "/V1/company/bank-accounts", data.EXTRA_BANK_ACCOUNTS[0])).ba_id;
    await as("admin", "PUT", "/V1/fastwork/settings", { cs_fastwork_fee_rate: "17", cs_fastwork_fee_vat_rate: "0", cs_fastwork_wht_rate: "0" });

    // สิทธิ์: เจ้าของทำได้ทุกอย่าง · ทีมเห็นงานของตัวเองและส่วนแบ่งของตัวเอง
    const owner = await as("admin", "POST", "/V1/roles", { role_name: "เจ้าของกิจการ", role_permission: bitsFor(permissionKeys, "ALL") });
    const team = await as("admin", "POST", "/V1/roles", {
        role_name: "ทีมพัฒนา (แบ่งกำไรรายโปรเจกต์)",
        role_permission: bitsFor(permissionKeys, ["dashboard", "viewOwnProjects"]),
    });
    ids.roles = { owner: owner.role_id, team: team.role_id };

    const passwordHash = await bcrypt.hash(password, 10);
    async function createUser({ username, fname, lname, email, phone, roleId }) {
        const userId = await generateDailyId("tb_users", "user_id", "USE");
        await pool.query(
            `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_phone,
                                   user_role_id, user_branch_id, user_status, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
            [userId, username, email, passwordHash, fname, lname, phone, roleId, HEAD_OFFICE_ID],
        );
        ids.users[username] = userId;
    }
    await createUser({ ...data.OWNER, roleId: ids.roles.owner });
    for (const username of TEAM) {
        const person = data.EMPLOYEES.find((employee) => employee.username === username);
        await createUser({
            username,
            fname: person.first,
            lname: person.last,
            email: `${username}@${EMAIL_DOMAIN}`,
            phone: person.phone,
            roleId: ids.roles.team,
        });
    }

    // อนุมัติใบเสนอราคา/ใบแจ้งหนี้โดยเจ้าของ · ค่าใช้จ่ายต่ำกว่า 5,000 อนุมัติอัตโนมัติ
    const ownerOnly = (minimum) => [{ al_min_amount_thb: minimum, al_require_distinct: false, role_ids: [ids.roles.owner] }];
    for (const [docType, levels] of Object.entries({ QT: ownerOnly("0"), IV: ownerOnly("0"), EX: ownerOnly("5000"), CN: ownerOnly("0") })) {
        await as("admin", "PUT", "/V1/company/approval-levels", { doc_type: docType, levels });
    }

    // ตำแหน่งในโปรเจกต์ (ทำงานของตัวเอง)
    const { PROJECT_PERMISSION_KEYS } = require("../../src/utils/projectPermissions");
    const ownWork = ["editOwnTask", "changeOwnTaskStatus", "changeSubtaskStatus", "addOwnSubtask", "changeOwnSubtaskStatus"];
    const projectBits = PROJECT_PERMISSION_KEYS.map((key) => (ownWork.includes(key) ? "1" : "0")).join("");
    ids.positions.developer = (await as("admin", "POST", "/V1/project-positions", { position_name: "นักพัฒนา", position_permission: projectBits })).position_id;
    ids.positions.designer = (await as("admin", "POST", "/V1/project-positions", { position_name: "นักออกแบบ UX/UI", position_permission: projectBits })).position_id;

    for (const [date, name] of data.HOLIDAYS_2026) {
        await as("admin", "POST", "/V1/people/holidays", { hd_date: date, hd_name: name });
    }

    // ลูกค้าตรง (ร้านอาหารบุคคล ไม่หัก ณ ที่จ่าย) · ลูกค้า Fastwork สร้างเองตอนรับงาน (ชื่อที่แสดงบน Fastwork)
    ids.clients.restaurant = (
        await as(OWNER, "POST", "/V1/clients", {
            client_name: "ร้านครัวอันดามัน", client_type: "individual", client_tax_id: data.thaiId("381990077881"),
            client_contact_name: "คุณวิไล ศรีสมุทร", client_email: "krua.andaman@gmail.com", client_phone: "0815553344",
            client_address: "21 ถนนอุตรกิจ ตำบลปากน้ำ อำเภอเมืองกระบี่ จังหวัดกระบี่ 81000", client_credit_days: 7,
            client_wht_rate: "0", client_language: "th",
        })
    ).client_id;
    ids.vendors.cloudHost = (await as(OWNER, "POST", "/V1/vendors", data.VENDORS.cloudHost)).vd_id;
    // ฟรีแลนซ์หาลูกค้า: รับส่วนแบ่งแบบจำนวนเงินตายตัวต่องานที่หามาได้
    ids.vendors.referral = (
        await as(OWNER, "POST", "/V1/vendors", {
            vd_type: "individual", vd_name: "นายเอกชัย ชวนหา", vd_tax_id: data.thaiId("181990045612"),
            vd_address: "9/4 หมู่ 5 ตำบลอ่าวนาง อำเภอเมืองกระบี่ จังหวัดกระบี่ 81180", vd_phone: "0897776655",
            vd_bank_name: "กสิกรไทย", vd_bank_account_no: "0461239876", vd_bank_account_name: "เอกชัย ชวนหา", vd_credit_days: 0,
            vd_notes: "หาลูกค้าให้ รับส่วนแบ่งตายตัวต่องาน",
        })
    ).vd_id;

    const category = await as(OWNER, "POST", "/V1/product-categories", { pc_name: "พัฒนาเว็บไซต์", pc_sort_order: 1, pc_status: "active" });
    ids.categories = { web: category.pc_id };
    for (const product of [
        { key: "website", code: "WEB", name: "พัฒนาเว็บไซต์พร้อมระบบหลังบ้าน", unit: "งาน", price: "28000" },
        { key: "screen", code: "UI", name: "ออกแบบหน้าจอ", unit: "หน้าจอ", price: "1500" },
    ]) {
        const created = await as(OWNER, "POST", "/V1/products", {
            product_code: product.code, product_name: product.name, product_unit: product.unit, product_price: product.price,
            product_category_id: category.pc_id, product_status: "active", product_is_public: true,
        });
        ids.products[product.key] = { id: created.product_id, ...product };
    }

    await as(OWNER, "PUT", "/V1/capital/goal", { cs_capital_goal: "300000", cs_capital_target_date: "2027-04-01" });
    return ids;
}

// ─── ตัวช่วยงาน Fastwork / ส่วนแบ่ง ────────────────────────────────────────────────────────

const events = [];
function on(date, label, run) {
    events.push({ date, label, run, order: events.length });
}

/** รับงานใหม่ → project_id + id ของแต่ละงวด */
async function takeFastworkJob(job) {
    const created = await as(OWNER, "POST", "/V1/fastwork/projects", {
        project_name: job.name,
        client_name: job.buyer,
        project_fastwork_order_no: job.orderNo,
        // วันเริ่ม = วันที่รับงาน (นาฬิกาจำลอง) · กำหนดส่ง = กำหนดของงวดสุดท้าย
        project_start_date: new Date().toISOString().slice(0, 10),
        project_due_date: job.milestones[job.milestones.length - 1][2],
        milestones: job.milestones.map(([name, amount, dueDate]) => ({ fwm_name: name, fwm_amount: String(amount), fwm_due_date: dueDate })),
    });
    const detail = await as(OWNER, "GET", `/V1/fastwork/projects/${created.project_id}`);
    return { projectId: created.project_id, milestoneIds: detail.fastwork.milestones.map((milestone) => milestone.fwm_id) };
}

async function addTeam(projectId, members, ids) {
    await projects.addMembers(
        OWNER,
        projectId,
        members.map(([username, position]) => ({ userId: ids.users[username], positionIds: [ids.positions[position]] })),
    );
}

const deliver = (username, job, index) => as(username, "POST", `/V1/fastwork/projects/${job.projectId}/milestones/${job.milestoneIds[index]}/delivered`, {});

/** ลูกค้ายืนยันงวด → บันทึกรอโอน (ค่าธรรมเนียม 17% ตามที่ระบบเติมให้) → คืน fwp_id */
async function recordPayout(job, index, gross, approvedDate) {
    const created = await as(OWNER, "POST", "/V1/fastwork/payouts", {
        fwp_status: "pending",
        fwp_project_id: job.projectId,
        fwp_milestone_id: job.milestoneIds[index],
        fwp_gross: String(gross),
        fwp_fee_rate: "17",
        fwp_fee: money(gross * FEE_RATE),
        fwp_fee_vat: "0",
        fwp_wht: "0",
        fwp_approved_date: approvedDate,
    });
    return created.fwp_id;
}

async function payoutRow(payoutId, projectId) {
    const list = await as(OWNER, "GET", `/V1/fastwork/payouts?project_id=${projectId}`);
    return list.data.find((row) => row.fwp_id === payoutId);
}

async function receivePayout(job, payoutId, receivedDate, ids) {
    const row = await payoutRow(payoutId, job.projectId);
    await as(OWNER, "POST", `/V1/fastwork/payouts/${payoutId}/receive`, {
        fwp_fee: row.fwp_fee, fwp_fee_vat: row.fwp_fee_vat, fwp_wht: row.fwp_wht, fwp_received_date: receivedDate,
        fwp_bank_account_id: ids.bankAccount, fwp_reference: `FW ${receivedDate.slice(8, 10)}/${receivedDate.slice(5, 7)}`, fwp_version: row.fwp_version,
    });
}

/** ส่งงาน → ยืนยัน → เงินเข้า ของงวดเดียว (ตั้งเหตุการณ์ 3 วัน) */
function milestoneFlow({ state, key, index, gross, deliveredBy, deliveredOn, approvedOn, receivedOn, ids }) {
    on(deliveredOn, `${key} ส่งงานงวด ${index + 1}`, () => deliver(deliveredBy, state[key], index));
    on(approvedOn, `${key} บันทึกเงินรอโอน งวด ${index + 1}`, async () => {
        state[`${key}Payout${index}`] = await recordPayout(state[key], index, gross, approvedOn);
    });
    if (!receivedOn) return;
    on(receivedOn, `${key} เงินเข้า งวด ${index + 1}`, () => receivePayout(state[key], state[`${key}Payout${index}`], receivedOn, ids));
}

function userShare(ids, username, percent, note) {
    return { recipient_type: "user", recipient_id: ids.users[username], kind: "percent", percent: String(percent), note };
}

const setShares = (projectId, shares) => as(OWNER, "PUT", `/V1/profit-shares/projects/${projectId}/shares`, { shares });

async function advance(projectId, ids, username, amount, paidDate, note) {
    await as(OWNER, "POST", `/V1/profit-shares/projects/${projectId}/advances`, {
        recipient_type: "user", recipient_id: ids.users[username], amount: String(amount), paid_date: paidDate,
        bank_account_id: ids.bankAccount, reference: `โอน ${paidDate.slice(8, 10)}/${paidDate.slice(5, 7)}`, note,
    });
}

/** ปิดยอดด้วยตัวเลขที่เห็นตอนนี้ แล้วปิดโปรเจกต์ */
async function settle(projectId, settledDate, note) {
    const detail = await as(OWNER, "GET", `/V1/profit-shares/projects/${projectId}`);
    await as(OWNER, "POST", `/V1/profit-shares/projects/${projectId}/settle`, {
        settled_date: settledDate, note, expected_distributable: detail.profit.distributable,
    });
    await projects.updateProject(OWNER, projectId, { project_status: "completed" });
}

/** จ่ายส่วนแบ่งให้ผู้ใช้ในระบบที่ยังค้าง (ผู้ขาย/ฟรีแลนซ์ข้ามได้ด้วย skipVendors) */
async function payShares(projectId, paidDate, ids, { skipVendors = false } = {}) {
    const detail = await as(OWNER, "GET", `/V1/profit-shares/projects/${projectId}`);
    for (const line of detail.settlement.lines) {
        if (line.ssl_status === "paid") continue;
        if (skipVendors && line.ssl_vendor_id) continue;
        await as(OWNER, "POST", `/V1/profit-shares/lines/${line.ssl_id}/pay`, {
            paid_date: paidDate, bank_account_id: ids.bankAccount, reference: `โอน ${paidDate.slice(8, 10)}/${paidDate.slice(5, 7)}`,
            wht: "0", ssl_version: line.ssl_version,
        });
    }
}

/** บิลค่าใช้จ่ายของโปรเจกต์ (ต่ำกว่าวงเงินอนุมัติ = อนุมัติอัตโนมัติ) */
function projectBill(ids, projectId, { title, description, amount, date, docNo }) {
    return purchasing.recordBill(OWNER, OWNER, {
        ex_vendor_id: ids.vendors.cloudHost, ex_title: title, ex_doc_type: "receipt", ex_expense_date: date,
        ex_vendor_doc_no: docNo, ex_vendor_doc_date: date,
        lines: [{ exl_category_id: 2, exl_project_id: projectId, exl_description: description, exl_quantity: "1", exl_unit_price: String(amount) }],
    });
}

const capitalEntry = (kind, amount, date, note) =>
    as(OWNER, "POST", "/V1/capital/entries", { cpe_kind: kind, cpe_amount: String(amount), cpe_entry_date: date, cpe_note: note });

// ─── เหตุการณ์ เม.ย. ถึง ต.ค. 2026 ─────────────────────────────────────────────────────────

function schedule(ids) {
    const state = {};
    // ลิงก์เลือกบริการแบบ Fastwork (S-5) — ใช้งาน F ที่รับ 20 ต.ค. เป็นงานเดิม
    scheduleFastworkLinks({ on, ids, state, owner: OWNER });

    on("2026-04-01", "เงินทุนตั้งต้น", () => capitalEntry("deposit", 20000, "2026-04-01", "เงินเก็บส่วนตัว ตั้งต้นเงินทุนเปิดบริษัท"));

    // ── A) แลนดิ้งเพจคลินิกความงาม (งวดเดียว) → ปิดยอดและจ่ายครบ
    on("2026-04-06", "A รับงาน", async () => {
        state.A = await takeFastworkJob({
            name: "แลนดิ้งเพจคลินิกความงาม พร้อมฟอร์มนัดหมาย", buyer: "glow_clinic_kbi", orderNo: "FW2604-11820",
            milestones: [["แลนดิ้งเพจ 1 หน้า + ฟอร์มนัดหมายส่งเข้า LINE", 9500, "2026-04-20"]],
        });
        await addTeam(state.A.projectId, [["nattapon", "developer"]], ids);
        await setShares(state.A.projectId, [userShare(ids, "nattapon", 40, "เขียนโค้ด")]);
    });
    milestoneFlow({ state, key: "A", index: 0, gross: 9500, deliveredBy: "nattapon", deliveredOn: "2026-04-18", approvedOn: "2026-04-20", receivedOn: "2026-04-23", ids });
    on("2026-04-24", "A ปิดยอด", () => settle(state.A.projectId, "2026-04-24", "งานแรกบน Fastwork"));
    on("2026-04-25", "A จ่ายส่วนแบ่ง", () => payShares(state.A.projectId, "2026-04-25", ids));

    // ── B) แชตบอตร้านกาแฟ (2 งวด · บันทึกเงินผิดแล้วยกเลิก · เบิกล่วงหน้า · ค่าเซิร์ฟเวอร์) → ปิดยอดและจ่ายครบ
    on("2026-04-20", "B รับงาน", async () => {
        state.B = await takeFastworkJob({
            name: "แชตบอต LINE OA ร้านกาแฟ ระบบสะสมแต้ม", buyer: "brewlab_cafe", orderNo: "FW2604-13377",
            milestones: [
                ["ออกแบบบทสนทนาและเชื่อมต่อ LINE OA", 12000, "2026-05-05"],
                ["ระบบสะสมแต้มและส่งมอบ", 8000, "2026-05-25"],
            ],
        });
        await addTeam(state.B.projectId, [["nattapon", "developer"], ["supawadee", "developer"]], ids);
        await setShares(state.B.projectId, [
            userShare(ids, "nattapon", 35, "ระบบหลังบ้าน"),
            userShare(ids, "supawadee", 25, "บทสนทนาและทดสอบ"),
        ]);
    });
    on("2026-04-22", "B ค่าเซิร์ฟเวอร์แชตบอต", () =>
        projectBill(ids, state.B.projectId, { title: "เซิร์ฟเวอร์แชตบอต 3 เดือน", description: "Cloud server 1 vCPU 3 เดือน", amount: 1200, date: "2026-04-22", docNo: "CH-2604-0912" }),
    );
    on("2026-05-04", "B ส่งงานงวด 1", () => deliver("supawadee", state.B, 0));
    on("2026-05-06", "B บันทึกเงินผิดแล้วยกเลิก", async () => {
        const wrong = await recordPayout(state.B, 0, 1200, "2026-05-06");
        const row = await payoutRow(wrong, state.B.projectId);
        await as(OWNER, "POST", `/V1/fastwork/payouts/${wrong}/cancel`, { reason: "พิมพ์ราคางวดผิด (ขาดเลข 0)", fwp_version: row.fwp_version });
        state.BPayout0 = await recordPayout(state.B, 0, 12000, "2026-05-06");
    });
    on("2026-05-09", "B เงินเข้า งวด 1", () => receivePayout(state.B, state.BPayout0, "2026-05-09", ids));
    on("2026-05-10", "B เบิกล่วงหน้า", () => advance(state.B.projectId, ids, "supawadee", 1500, "2026-05-10", "ขอเบิกค่าเดินทางไปคุยกับร้าน"));
    milestoneFlow({ state, key: "B", index: 1, gross: 8000, deliveredBy: "nattapon", deliveredOn: "2026-05-24", approvedOn: "2026-05-26", receivedOn: "2026-05-29", ids });
    on("2026-05-30", "B ปิดยอด", () => settle(state.B.projectId, "2026-05-30", null));
    on("2026-06-01", "B จ่ายส่วนแบ่ง", () => payShares(state.B.projectId, "2026-06-01", ids));

    // ── C) ระบบจองคิวร้านทำผม (3 งวด · ฟรีแลนซ์หาลูกค้ารับตายตัว 3,000) → ปิดยอด จ่ายทีม ค้างจ่ายฟรีแลนซ์
    on("2026-05-15", "C รับงาน", async () => {
        state.C = await takeFastworkJob({
            name: "ระบบจองคิวร้านทำผม (เว็บแอป)", buyer: "salon_aonang", orderNo: "FW2605-20914",
            milestones: [
                ["ออกแบบหน้าจอและระบบจองคิว", 15000, "2026-06-15"],
                ["ระบบหลังบ้านและแจ้งเตือนทาง LINE", 15000, "2026-07-10"],
                ["ทดสอบกับร้านจริงและส่งมอบ", 10000, "2026-07-31"],
            ],
        });
        await addTeam(state.C.projectId, [["nattapon", "developer"], ["chonthicha", "designer"]], ids);
        await setShares(state.C.projectId, [
            { recipient_type: "vendor", recipient_id: ids.vendors.referral, kind: "fixed", amount: "3000", note: "หาลูกค้า" },
            userShare(ids, "nattapon", 40, "เขียนโค้ด"),
            userShare(ids, "chonthicha", 15, "ออกแบบหน้าจอ"),
        ]);
    });
    milestoneFlow({ state, key: "C", index: 0, gross: 15000, deliveredBy: "chonthicha", deliveredOn: "2026-06-13", approvedOn: "2026-06-15", receivedOn: "2026-06-18", ids });
    on("2026-06-20", "C ค่าโฮสติ้ง", () =>
        projectBill(ids, state.C.projectId, { title: "โฮสติ้งระบบจองคิว 1 ปี", description: "Web hosting 1 ปี + SSL", amount: 2400, date: "2026-06-20", docNo: "CH-2606-1408" }),
    );
    milestoneFlow({ state, key: "C", index: 1, gross: 15000, deliveredBy: "nattapon", deliveredOn: "2026-07-08", approvedOn: "2026-07-10", receivedOn: "2026-07-14", ids });
    milestoneFlow({ state, key: "C", index: 2, gross: 10000, deliveredBy: "nattapon", deliveredOn: "2026-07-30", approvedOn: "2026-08-01", receivedOn: "2026-08-04", ids });
    on("2026-08-05", "C ปิดยอด", () => settle(state.C.projectId, "2026-08-05", "ค่าหาลูกค้าจ่ายเมื่อคุณเอกชัยส่งเลขบัญชีใหม่"));
    on("2026-08-06", "C จ่ายส่วนแบ่งทีม", () => payShares(state.C.projectId, "2026-08-06", ids, { skipVendors: true }));

    // ── G) ลูกค้าตรง: เว็บไซต์ร้านครัวอันดามัน (ใบเสนอราคาไม่มี VAT · 2 งวด) → ปิดยอดและจ่ายครบ
    on("2026-06-02", "G ใบเสนอราคา", async () => {
        state.quotation = await sales.createQuotation(OWNER, {
            qt_client_id: ids.clients.restaurant,
            qt_title: "เว็บไซต์ร้านอาหารพร้อมเมนูออนไลน์",
            qt_payment_mode: "milestones",
            items: [
                sales.productLine(ids.products.website, 1, { description: "เว็บไซต์ร้านอาหาร เมนูออนไลน์ แผนที่ และระบบจองโต๊ะ" }),
                sales.productLine(ids.products.screen, 4),
                sales.note("ราคานี้ไม่มีภาษีมูลค่าเพิ่ม (ผู้ให้บริการยังไม่จดทะเบียน VAT)"),
            ],
            milestones: [
                { qtm_name: "มัดจำเริ่มงาน", qtm_percent: "50" },
                { qtm_name: "ส่งมอบและเปิดใช้งาน", qtm_percent: "50" },
            ],
        });
        await sales.submitAndApprove(OWNER, state.quotation, [OWNER]);
        await sales.sendQuotation(OWNER, state.quotation);
    });
    on("2026-06-04", "G ลูกค้าตอบรับ", async () => {
        state.G = await sales.acceptQuotation(OWNER, state.quotation);
        await addTeam(state.G, [["nattapon", "developer"], ["chonthicha", "designer"]], ids);
        await setShares(state.G, [userShare(ids, "nattapon", 30, "เขียนโค้ด"), userShare(ids, "chonthicha", 20, "ออกแบบ")]);
        state.invoice1 = await sales.invoiceMilestone(OWNER, state.quotation, 0);
    });
    on("2026-06-08", "G รับมัดจำ", async () => {
        const amount = await sales.outstandingOf(OWNER, state.invoice1);
        await sales.receivePayment(OWNER, { clientId: ids.clients.restaurant, date: "2026-06-08", bankAccountId: ids.bankAccount, invoices: [{ id: state.invoice1, amount }], reference: "พร้อมเพย์ 08/06" });
    });
    on("2026-06-10", "G ค่าโดเมนและโฮสติ้ง", () =>
        projectBill(ids, state.G, { title: "โดเมนและโฮสติ้งเว็บร้านอาหาร 1 ปี", description: "Domain .com + hosting 1 ปี", amount: 2400, date: "2026-06-10", docNo: "CH-2606-0877" }),
    );
    on("2026-07-10", "G ใบแจ้งหนี้งวดสุดท้าย", async () => {
        state.invoice2 = await sales.invoiceMilestone(OWNER, state.quotation, 1);
    });
    on("2026-07-14", "G รับเงินงวดสุดท้าย", async () => {
        const amount = await sales.outstandingOf(OWNER, state.invoice2);
        await sales.receivePayment(OWNER, { clientId: ids.clients.restaurant, date: "2026-07-14", bankAccountId: ids.bankAccount, invoices: [{ id: state.invoice2, amount }], reference: "พร้อมเพย์ 14/07" });
    });
    on("2026-07-15", "G ปิดยอด", () => settle(state.G, "2026-07-15", null));
    on("2026-07-16", "G จ่ายส่วนแบ่ง", () => payShares(state.G, "2026-07-16", ids));

    on("2026-07-20", "ถอนเงินทุนซื้ออุปกรณ์", () => capitalEntry("withdraw", 6500, "2026-07-20", "ซื้อจอและคีย์บอร์ดใช้ทำงาน"));

    // ── D) แอปบันทึกรายรับรายจ่าย (2 งวด · เบิกล่วงหน้า · งวดสุดท้ายรอโอน) → ยังไม่ปิดยอด
    on("2026-08-10", "D รับงาน", async () => {
        state.D = await takeFastworkJob({
            name: "แอปบันทึกรายรับรายจ่าย (Flutter)", buyer: "mymoney_note", orderNo: "FW2608-35102",
            milestones: [
                ["แอปเวอร์ชันแรก (บันทึก/สรุปรายเดือน)", 22000, "2026-09-10"],
                ["สำรองข้อมูลบนคลาวด์และขึ้นสโตร์", 18000, "2026-10-15"],
            ],
        });
        await addTeam(state.D.projectId, [["nattapon", "developer"], ["supawadee", "developer"]], ids);
        await setShares(state.D.projectId, [userShare(ids, "nattapon", 40, "แอปมือถือ"), userShare(ids, "supawadee", 20, "ระบบสำรองข้อมูล")]);
    });
    on("2026-08-20", "D ค่าเซิร์ฟเวอร์สำรองข้อมูล", () =>
        projectBill(ids, state.D.projectId, { title: "เซิร์ฟเวอร์สำรองข้อมูล 6 เดือน", description: "Cloud storage 6 เดือน", amount: 1800, date: "2026-08-20", docNo: "CH-2608-2210" }),
    );
    milestoneFlow({ state, key: "D", index: 0, gross: 22000, deliveredBy: "nattapon", deliveredOn: "2026-09-08", approvedOn: "2026-09-10", receivedOn: "2026-09-14", ids });
    on("2026-09-01", "ฝากเงินทุนเพิ่ม", () => capitalEntry("deposit", 10000, "2026-09-01", "เงินเก็บส่วนตัวเพิ่ม"));
    on("2026-09-20", "D เบิกล่วงหน้า", () => advance(state.D.projectId, ids, "nattapon", 4000, "2026-09-20", "เบิกระหว่างรองวดสุดท้าย"));
    milestoneFlow({ state, key: "D", index: 1, gross: 18000, deliveredBy: "supawadee", deliveredOn: "2026-10-15", approvedOn: "2026-10-20", receivedOn: null, ids });

    // ── E) ปรับปรุงเว็บไซต์โฮมสเตย์: ส่งงานแล้ว ยังไม่บันทึกเงิน ยังไม่ตั้งส่วนแบ่ง
    on("2026-10-05", "E รับงาน", async () => {
        state.E = await takeFastworkJob({
            name: "ปรับปรุงเว็บไซต์โฮมสเตย์ ให้จองผ่านมือถือง่ายขึ้น", buyer: "baan_rimlay", orderNo: "FW2610-41876",
            milestones: [["ปรับหน้าเว็บและฟอร์มจอง", 12000, "2026-10-25"]],
        });
        await addTeam(state.E.projectId, [["chonthicha", "designer"], ["nattapon", "developer"]], ids);
    });
    on("2026-10-22", "E ส่งงาน", () => deliver("chonthicha", state.E, 0));

    // ── F) สคริปต์ดึงยอดขาย: เพิ่งเริ่ม
    on("2026-10-20", "F รับงาน", async () => {
        state.F = await takeFastworkJob({
            name: "สคริปต์ดึงยอดขายร้านออนไลน์ลง Google Sheets", buyer: "shopkeeper_th", orderNo: "FW2610-43290",
            milestones: [
                ["ดึงยอดขายรายวันอัตโนมัติ", 6000, "2026-10-30"],
                ["สรุปรายเดือนและกราฟ", 4000, "2026-11-10"],
            ],
        });
        await addTeam(state.F.projectId, [["supawadee", "developer"]], ids);
    });
}

async function seedPreIncorporation(context) {
    setToday("2026-04-01", 9);
    const ids = await setup(context);
    console.log("✓ ตั้งค่าผู้ประกอบการ ทีม ลูกค้า ผู้ขาย เป้าเงินทุน");
    schedule(ids);
    events.sort((first, second) => first.date.localeCompare(second.date) || first.order - second.order);
    let currentMonth = null;
    for (const event of events) {
        if (event.date > LAST_DAY) throw new Error(`${event.label}: วันที่ ${event.date} เกินวันสุดท้ายของเรื่อง ${LAST_DAY}`);
        setToday(event.date, 10);
        // token ออกตามนาฬิกาจำลอง — login ใหม่ทุกเหตุการณ์ (ชุดนี้เหตุการณ์น้อย)
        forgetTokens();
        if (event.date.slice(0, 7) !== currentMonth) {
            currentMonth = event.date.slice(0, 7);
            console.log(`── ${currentMonth}`);
        }
        try {
            await event.run();
        } catch (error) {
            throw new Error(`${event.date} ${event.label}: ${error.message}`);
        }
    }
    console.log(`✓ เหตุการณ์ทั้งหมด ${events.length} รายการ`);
}

module.exports = { seedPreIncorporation };
