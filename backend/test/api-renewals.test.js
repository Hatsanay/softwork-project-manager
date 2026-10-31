// บริการรายรอบ R-1 (2026-10-31 · docs/plans/2026-10-31-recurring-services.md)
// เพิ่มเอง · สิทธิ์ตามช่องทาง · แท็บใกล้ครบ/เลยกำหนด/พักไว้ · version กันแก้ทับ · anchor วันครบ · พัก/เปิดต่อ/ยกเลิก
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const PASSWORD = "Staff@2026";
let api;
let clientId;
let otherClientId;
const productId = "PRD20991031000101";
const people = {};

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

let userCounter = 400;
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
    return { userId, token: await api.login(name, PASSWORD) };
}

function expectStatus(response, status, note) {
    assert.equal(response.status, status, `${note ?? ""} ${JSON.stringify(response.body)}`);
    return response.body;
}

const as = (person, method, url, body) => api.callApi(method, url, { token: person.token, body });

const directBody = (overrides = {}) => ({
    rnw_client_id: clientId,
    rnw_product_id: productId,
    rnw_label: "shopabc.com",
    rnw_price: "650",
    rnw_cycle_months: 12,
    rnw_next_due_date: daysFromToday(10),
    rnw_channel: "direct",
    ...overrides,
});

test.before(async () => {
    api = await startTestServer("renewals");
    await api.loginAsAdmin();
    clientId = expectStatus(
        await api.callApi("POST", "/V1/clients", { body: { client_name: "ร้านต่ออายุ" } }),
        201,
    ).client_id;
    otherClientId = expectStatus(
        await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าอื่น" } }),
        201,
    ).client_id;
    await api.pool.query(
        `INSERT INTO tb_products (product_id, product_name, product_unit, product_price, product_status, product_renewal_months)
         VALUES (?, 'จดโดเมน .com รายปี', 'ปี', 650, 'active', 12)`,
        [productId],
    );
    people.billing = await createPerson("rn.billing", ["dashboard", "createInvoice", "viewInvoices"]);
    people.fastwork = await createPerson("rn.fastwork", ["dashboard", "manageFastwork"]);
    people.plain = await createPerson("rn.plain", ["dashboard", "viewOwnProjects"]);
});

test.after(async () => {
    await api?.stop();
});

test("เพิ่มเอง: สิทธิ์ตามช่องทาง · ราคา 0 ไม่ได้ · รอบต้องอยู่ในรายการ · โปรเจกต์ต้องเป็นของลูกค้านี้", async () => {
    expectStatus(await as(people.plain, "GET", "/V1/renewals"), 403, "ไม่มีสิทธิ์ออกใบหรือ Fastwork");
    const created = expectStatus(await as(people.billing, "POST", "/V1/renewals", directBody()), 201);
    assert.match(created.rnw_id, /^RNW/);
    expectStatus(
        await as(people.billing, "POST", "/V1/renewals", directBody({ rnw_channel: "fastwork" })),
        403,
        "ฝ่ายบัญชีจัดการ Fastwork ไม่ได้",
    );
    const fastwork = expectStatus(
        await as(
            people.fastwork,
            "POST",
            "/V1/renewals",
            directBody({ rnw_channel: "fastwork", rnw_label: "fw-shop.com" }),
        ),
        201,
    );

    const zero = expectStatus(await as(people.billing, "POST", "/V1/renewals", directBody({ rnw_price: "0" })), 400);
    assert.ok(zero.fields.rnw_price);
    const badCycle = expectStatus(
        await as(people.billing, "POST", "/V1/renewals", directBody({ rnw_cycle_months: 2 })),
        400,
    );
    assert.ok(badCycle.fields.rnw_cycle_months);
    const otherProject = expectStatus(
        await api.callApi("POST", "/V1/projects", {
            body: { project_name: "เว็บของลูกค้าอื่น", client_id: otherClientId },
        }),
        201,
    );
    const wrongProject = expectStatus(
        await as(people.billing, "POST", "/V1/renewals", directBody({ rnw_project_id: otherProject.project_id })),
        400,
    );
    assert.ok(wrongProject.fields.rnw_project_id);

    // เห็นเฉพาะช่องทางที่มีสิทธิ์ · ดูรายละเอียดข้ามช่องทาง = 403
    const billingAll = expectStatus(await as(people.billing, "GET", "/V1/renewals?tab=all"), 200);
    assert.ok(billingAll.data.every((row) => row.rnw_channel === "direct"));
    expectStatus(await as(people.billing, "GET", `/V1/renewals/${fastwork.rnw_id}`), 403);
    const fastworkAll = expectStatus(await as(people.fastwork, "GET", "/V1/renewals?tab=all"), 200);
    assert.deepEqual(fastworkAll.channels, ["fastwork"]);
    assert.ok(fastworkAll.data.every((row) => row.rnw_channel === "fastwork"));

    const options = expectStatus(
        await as(people.billing, "GET", `/V1/renewals/form-options?client_id=${otherClientId}`),
        200,
    );
    assert.ok(
        options.products.some((product) => product.product_id === productId && product.product_renewal_months === 12),
    );
});

test("แท็บ: ใกล้ครบ 30 วัน · เลยกำหนด · ครบวันนี้ยังไม่เลย · วันที่เหลือและช่วงบริการรอบถัดไป", async () => {
    const overdue = expectStatus(
        await as(
            people.billing,
            "POST",
            "/V1/renewals",
            directBody({ rnw_label: "late.com", rnw_next_due_date: daysFromToday(-3) }),
        ),
        201,
    );
    expectStatus(
        await as(
            people.billing,
            "POST",
            "/V1/renewals",
            directBody({ rnw_label: "today.com", rnw_next_due_date: todayBangkok() }),
        ),
        201,
    );
    expectStatus(
        await as(
            people.billing,
            "POST",
            "/V1/renewals",
            directBody({ rnw_label: "far.com", rnw_next_due_date: daysFromToday(45) }),
        ),
        201,
    );

    const dueSoon = expectStatus(await as(people.billing, "GET", "/V1/renewals?tab=due_soon"), 200);
    const labels = dueSoon.data.map((row) => row.rnw_label);
    assert.ok(labels.includes("today.com"), "ครบวันนี้ = ใกล้ครบ ไม่ใช่เลยกำหนด");
    assert.ok(labels.includes("shopabc.com"));
    assert.ok(!labels.includes("far.com"), "เกิน 30 วันยังไม่ขึ้น");
    assert.ok(!labels.includes("late.com"));
    const late = expectStatus(await as(people.billing, "GET", "/V1/renewals?tab=overdue"), 200);
    assert.deepEqual(
        late.data.map((row) => row.rnw_label),
        ["late.com"],
    );
    assert.equal(late.data[0].days_left, -3);
    assert.equal(late.counts.overdue, 1);
    assert.equal(dueSoon.counts.due_soon, dueSoon.total);

    const detail = expectStatus(await as(people.billing, "GET", `/V1/renewals/${overdue.rnw_id}`), 200);
    assert.equal(detail.renewal.next_period.start, daysFromToday(-3));
    assert.deepEqual(detail.cycles, []);
});

test("แก้: version กันแก้ทับ · ไม่ย้ายวันครบ = anchor เดิม · พัก → เปิดต่อ → ยกเลิก (ต้องมีเหตุผล) · ยกเลิกแล้วแก้ไม่ได้", async () => {
    const created = expectStatus(
        await as(
            people.billing,
            "POST",
            "/V1/renewals",
            directBody({ rnw_label: "monthend.com", rnw_cycle_months: 1, rnw_next_due_date: "2027-01-31" }),
        ),
        201,
    );
    const id = created.rnw_id;
    let detail = expectStatus(await as(people.billing, "GET", `/V1/renewals/${id}`), 200);
    assert.equal(detail.renewal.rnw_anchor_day, 31);
    assert.deepEqual(detail.renewal.next_period, { start: "2027-01-31", end: "2027-02-27" });

    const update = (version, overrides = {}) =>
        as(people.billing, "PUT", `/V1/renewals/${id}`, {
            rnw_label: "monthend.com",
            rnw_price: "700",
            rnw_cycle_months: 1,
            rnw_next_due_date: "2027-01-31",
            rnw_notes: "ขึ้นราคาปีนี้",
            rnw_version: version,
            ...overrides,
        });
    expectStatus(await update(5), 409, "version ไม่ตรง");
    expectStatus(await update(0), 200);
    detail = expectStatus(await as(people.billing, "GET", `/V1/renewals/${id}`), 200);
    assert.equal(detail.renewal.rnw_price, "700.00");
    assert.equal(detail.renewal.rnw_anchor_day, 31);

    // ย้ายวันครบ = anchor ใหม่
    expectStatus(await update(1, { rnw_next_due_date: "2027-02-15" }), 200);
    detail = expectStatus(await as(people.billing, "GET", `/V1/renewals/${id}`), 200);
    assert.equal(detail.renewal.rnw_anchor_day, 15);

    const noReason = expectStatus(
        await as(people.billing, "POST", `/V1/renewals/${id}/pause`, { reason: "", rnw_version: 2 }),
        400,
    );
    assert.ok(noReason.fields.reason);
    expectStatus(
        await as(people.billing, "POST", `/V1/renewals/${id}/pause`, {
            reason: "ลูกค้าปิดร้านชั่วคราว",
            rnw_version: 2,
        }),
        200,
    );
    const paused = expectStatus(await as(people.billing, "GET", "/V1/renewals?tab=paused"), 200);
    assert.ok(paused.data.some((row) => row.rnw_id === id && row.rnw_end_reason === "ลูกค้าปิดร้านชั่วคราว"));
    const dueSoon = expectStatus(await as(people.billing, "GET", "/V1/renewals?tab=due_soon&search=monthend"), 200);
    assert.equal(dueSoon.total, 0, "พักแล้วไม่โผล่ในใกล้ครบ");
    expectStatus(
        await as(people.billing, "POST", `/V1/renewals/${id}/pause`, { reason: "ซ้ำ", rnw_version: 3 }),
        409,
        "พักซ้ำไม่ได้",
    );

    expectStatus(
        await as(people.billing, "POST", `/V1/renewals/${id}/resume`, {
            rnw_next_due_date: "2027-03-15",
            rnw_version: 3,
        }),
        200,
    );
    detail = expectStatus(await as(people.billing, "GET", `/V1/renewals/${id}`), 200);
    assert.equal(detail.renewal.rnw_status, "active");
    assert.equal(detail.renewal.rnw_paused_on, null);

    expectStatus(
        await as(people.billing, "POST", `/V1/renewals/${id}/cancel`, {
            reason: "ย้ายไปผู้ให้บริการอื่น",
            rnw_version: 4,
        }),
        200,
    );
    expectStatus(await update(5), 409, "ยกเลิกแล้วแก้ไม่ได้");
});

test("R-2 ตั้งที่สินค้า/แพ็ก: % เป็นรายรอบไม่ได้ · แพ็กต้องเลือกสินค้าที่ตั้งรอบ · ตอบรับใบ = ตั้งต่ออายุเอง (จำนวน = รอบที่จ่ายแล้ว · แพ็กรวมรอบแรก · สกุลต่างประเทศเป็นบาท)", async () => {
    const { addCycle, anchorDayOf } = await import("../src/shared/renewal-math.mjs");
    await api.pool.query(
        "UPDATE tb_company_settings SET cs_vat_registered_from = '2000-01-01', cs_allow_self_approval = 1",
    );
    const percentRenewal = expectStatus(
        await api.callApi("POST", "/V1/products", {
            body: {
                product_name: "งานด่วน",
                product_price: "0",
                product_status: "active",
                product_price_mode: "percent",
                product_percent: "30",
                product_renewal_months: 12,
            },
        }),
        400,
    );
    assert.ok(percentRenewal.fields.product_renewal_months);
    const hosting = expectStatus(
        await api.callApi("POST", "/V1/products", {
            body: {
                product_name: "Cloud Hosting รายปี",
                product_unit: "ปี",
                product_price: "1290",
                product_status: "active",
                product_renewal_months: 12,
            },
        }),
        201,
    );
    assert.equal(hosting.product_renewal_months, 12);
    const plain = expectStatus(
        await api.callApi("POST", "/V1/products", {
            body: { product_name: "ออกแบบหน้าเว็บ", product_price: "1000", product_status: "active" },
        }),
        201,
    );
    const packageBody = (renewalProductId) => ({
        pkg_name: "เว็บหน้าเดียว",
        pkg_status: "active",
        pkg_renewal_product_id: renewalProductId,
        items: [
            {
                pki_type: "item",
                pki_product_id: plain.product_id,
                pki_description: "ออกแบบหน้าเว็บ",
                pki_quantity: "1",
            },
        ],
    });
    const badPackage = expectStatus(
        await api.callApi("POST", "/V1/product-packages", { body: packageBody(plain.product_id) }),
        400,
    );
    assert.ok(badPackage.fields.pkg_renewal_product_id);
    const onePage = expectStatus(
        await api.callApi("POST", "/V1/product-packages", { body: packageBody(hosting.product_id) }),
        201,
    );

    const today = todayBangkok();
    const anchor = anchorDayOf(today);
    const accept = async (body) => {
        const quotation = expectStatus(
            await api.callApi("POST", "/V1/quotations", {
                body: { qt_client_id: clientId, qt_branch_id: "BRA202601010000001", qt_valid_days: 30, ...body },
            }),
            201,
        );
        expectStatus(await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/submit`, { body: {} }), 200);
        expectStatus(await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/approve`, { body: {} }), 200);
        const accepted = expectStatus(
            await api.callApi("POST", `/V1/quotations/${quotation.qt_id}/accept`, {
                body: { project_mode: "new", create_tasks: false },
            }),
            200,
        );
        const [rows] = await api.pool.query(
            "SELECT rnw_product_id, rnw_price, DATE_FORMAT(rnw_next_due_date, '%Y-%m-%d') AS due, rnw_channel, rnw_project_id, rnw_source FROM tb_renewals WHERE rnw_source_id = ? ORDER BY rnw_price",
            [quotation.qt_id],
        );
        return { accepted, rows };
    };

    // โฮสติ้ง 2 ปี (2 รอบจ่ายแล้ว) ส่วนลดบรรทัด 180 · แพ็กเว็บหน้าเดียว (รวมปีแรก) · งานธรรมดาไม่ตั้ง
    const thb = await accept({
        qt_title: "เว็บหน้าเดียวพร้อมโฮสติ้ง",
        qt_currency: "THB",
        items: [
            { qti_type: "heading", qti_description: "เว็บหน้าเดียว", qti_package_id: onePage.pkg_id },
            {
                qti_type: "item",
                qti_product_id: plain.product_id,
                qti_package_id: onePage.pkg_id,
                qti_description: "ออกแบบหน้าเว็บ",
                qti_quantity: "1",
                qti_unit_price: "1000",
            },
            {
                qti_type: "item",
                qti_product_id: hosting.product_id,
                qti_description: "Cloud Hosting",
                qti_quantity: "2",
                qti_unit_price: "1290",
                qti_discount_type: "amount",
                qti_discount_value: "180",
            },
        ],
    });
    assert.equal(thb.accepted.renewal_count, 2);
    assert.deepEqual(
        thb.rows.map((row) => [
            row.rnw_price,
            row.due,
            row.rnw_channel,
            row.rnw_source,
            row.rnw_project_id === thb.accepted.project_id,
        ]),
        [
            ["1200.00", addCycle(addCycle(today, 12, anchor), 12, anchor), "direct", "quotation", true],
            ["1290.00", addCycle(today, 12, anchor), "direct", "quotation", true],
        ],
        "โฮสติ้ง: (2,580 − 180) ÷ 2 = 1,200 ครบหลัง 2 รอบ · แพ็ก: ราคาสินค้า ครบหลังรอบแรก",
    );

    const usd = await accept({
        qt_title: "โฮสติ้งลูกค้าต่างประเทศ",
        qt_currency: "USD",
        qt_exchange_rate: "35.5",
        qt_rate_source: "manual",
        qt_rate_override_reason: "อัตราคงที่",
        items: [
            {
                qti_type: "item",
                qti_product_id: hosting.product_id,
                qti_description: "Cloud Hosting",
                qti_quantity: "1",
                qti_unit_price: "100",
            },
        ],
    });
    assert.deepEqual(
        usd.rows.map((row) => row.rnw_price),
        ["3550.00"],
        "100 USD × 35.5",
    );
});

test("R-2 รับงาน Fastwork พร้อมตั้งต่ออายุ: ช่องทาง Fastwork · ผูกงาน · สินค้าไม่ได้ตั้งรอบ = 400 · รับจากคำขอ + ต่ออายุ = 400", async () => {
    const [[hosting]] = await api.pool.query(
        "SELECT product_id FROM tb_products WHERE product_name = 'Cloud Hosting รายปี'",
    );
    const [[plain]] = await api.pool.query("SELECT product_id FROM tb_products WHERE product_name = 'ออกแบบหน้าเว็บ'");
    const job = (renewals, extra = {}) =>
        as(people.fastwork, "POST", "/V1/fastwork/projects", {
            project_name: "เว็บหน้าเดียว Fastwork",
            client_name: "fw_buyer_renew",
            milestones: [{ fwm_name: "งานทั้งหมด", fwm_amount: "1900" }],
            renewals,
            ...extra,
        });
    const renewal = {
        rnw_product_id: hosting.product_id,
        rnw_label: "fwbuyer.com",
        rnw_price: "1290",
        rnw_cycle_months: 12,
        rnw_next_due_date: daysFromToday(365),
    };
    const created = expectStatus(await job([renewal]), 201);
    assert.equal(created.renewal_count, 1);
    const [[row]] = await api.pool.query(
        "SELECT rnw_channel, rnw_project_id, rnw_label FROM tb_renewals WHERE rnw_source_id = ?",
        [created.project_id],
    );
    assert.deepEqual(row, { rnw_channel: "fastwork", rnw_project_id: created.project_id, rnw_label: "fwbuyer.com" });

    const notRenewal = expectStatus(await job([{ ...renewal, rnw_product_id: plain.product_id }]), 400);
    assert.ok(notRenewal.fields.renewals);
    const withRequest = expectStatus(await job([renewal], { service_request_id: "SVR20990101000001" }), 400);
    assert.ok(withRequest.fields.renewals);
});

test("R-3 ออกใบแจ้งหนี้รอบนี้: ใบรวมลูกค้าเดียว · ขยับวันครบ · กดซ้ำ = 409 · ลบร่าง/ยกเลิกใบ = วันครบถอยกลับ · ช่องว่างหลังยกเลิกรอบกลาง", async () => {
    const { addCycle } = await import("../src/shared/renewal-math.mjs");
    const create = async (overrides) =>
        expectStatus(await api.callApi("POST", "/V1/renewals", { body: directBody(overrides) }), 201).rnw_id;
    const detailOf = async (id) => (await api.callApi("GET", `/V1/renewals/${id}`)).body;
    const invoiceOf = (items) => api.callApi("POST", "/V1/renewals/invoice", { body: { items } });

    const dueA = daysFromToday(5);
    const dueB = daysFromToday(20);
    const hostingId = await create({ rnw_label: "bill-a.com", rnw_next_due_date: dueA, rnw_price: "1290" });
    const domainId = await create({ rnw_label: "bill-b.com", rnw_next_due_date: dueB, rnw_price: "650" });
    const billed = expectStatus(
        await invoiceOf([
            { rnw_id: hostingId, rnw_version: 0 },
            { rnw_id: domainId, rnw_version: 0 },
        ]),
        201,
    );
    assert.equal(billed.renewal_count, 2);
    const invoice = expectStatus(await api.callApi("GET", `/V1/invoices/${billed.inv_id}`), 200);
    assert.equal(invoice.invoice.inv_status, "draft");
    assert.equal(invoice.invoice.inv_source, "manual");
    assert.equal(invoice.invoice.inv_subtotal, "1940.00");
    assert.equal(invoice.renewal_cycles.length, 2);
    assert.ok(invoice.items.some((item) => item.invi_description.includes("bill-a.com")));
    let hosting = await detailOf(hostingId);
    assert.equal(
        hosting.renewal.rnw_next_due_date,
        addCycle(dueA, 12, Number(dueA.slice(8))),
        "ขยับไปรอบถัดไปตอนออกร่าง",
    );
    assert.equal(hosting.cycles[0].rnc_invoice_id, billed.inv_id);

    const again = expectStatus(await invoiceOf([{ rnw_id: hostingId, rnw_version: 0 }]), 409, "กดซ้ำด้วย version เดิม");
    assert.equal(again.code, "ALREADY_BILLED");
    const otherClient = await create({ rnw_client_id: otherClientId, rnw_label: "other.com" });
    expectStatus(
        await invoiceOf([
            { rnw_id: hostingId, rnw_version: hosting.renewal.rnw_version },
            { rnw_id: otherClient, rnw_version: 0 },
        ]),
        409,
        "ต่างลูกค้ารวมใบไม่ได้",
    );
    const fastworkRenewal = await create({ rnw_channel: "fastwork", rnw_label: "fw-bill.com" });
    expectStatus(await invoiceOf([{ rnw_id: fastworkRenewal, rnw_version: 0 }]), 409, "Fastwork ออกใบไม่ได้");

    // ลบร่าง = รอบ void · วันครบกลับ
    expectStatus(
        await api.callApi("DELETE", `/V1/invoices/${billed.inv_id}`, {
            body: { inv_version: invoice.invoice.inv_version },
        }),
        204,
    );
    hosting = await detailOf(hostingId);
    assert.equal(hosting.renewal.rnw_next_due_date, dueA);
    assert.equal(hosting.cycles[0].rnc_status, "void");
    assert.equal(hosting.cycles[0].rnc_invoice_id, null);

    // ออกใหม่ → ออกใบจริง → ยกเลิกใบ = วันครบกลับ
    const reissued = expectStatus(
        await invoiceOf([{ rnw_id: hostingId, rnw_version: hosting.renewal.rnw_version }]),
        201,
    );
    expectStatus(await api.callApi("POST", `/V1/invoices/${reissued.inv_id}/submit`, { body: {} }), 200);
    const pending = expectStatus(await api.callApi("GET", `/V1/invoices/${reissued.inv_id}`), 200);
    if (pending.invoice.inv_status === "pending_approval") {
        expectStatus(await api.callApi("POST", `/V1/invoices/${reissued.inv_id}/approve`, { body: {} }), 200);
    }
    const issued = expectStatus(await api.callApi("GET", `/V1/invoices/${reissued.inv_id}`), 200);
    assert.equal(issued.invoice.inv_status, "issued");
    expectStatus(
        await api.callApi("POST", `/V1/invoices/${reissued.inv_id}/cancel`, {
            body: { reason: "ลูกค้าขอเปลี่ยนรอบ", inv_version: issued.invoice.inv_version },
        }),
        200,
    );
    hosting = await detailOf(hostingId);
    assert.equal(hosting.renewal.rnw_next_due_date, dueA, "ยกเลิกใบ = ต้องออกรอบนี้ใหม่");

    // ช่องว่าง: รายเดือน ออกรอบ 1 (ใบ A) รอบ 2 (ใบ B) แล้วลบใบ A → วันครบกลับรอบ 1 · ออกรอบ 1 ใหม่ → กระโดดไปรอบ 3
    const start = "2027-01-31";
    const monthly = await create({ rnw_label: "monthly.com", rnw_cycle_months: 1, rnw_next_due_date: start });
    const first = expectStatus(await invoiceOf([{ rnw_id: monthly, rnw_version: 0 }]), 201);
    expectStatus(await invoiceOf([{ rnw_id: monthly, rnw_version: 1 }]), 201);
    let monthlyDetail = await detailOf(monthly);
    assert.equal(monthlyDetail.renewal.rnw_next_due_date, "2027-03-31", "31 ม.ค. → 28 ก.พ. → 31 มี.ค.");
    const firstInvoice = expectStatus(await api.callApi("GET", `/V1/invoices/${first.inv_id}`), 200);
    expectStatus(
        await api.callApi("DELETE", `/V1/invoices/${first.inv_id}`, {
            body: { inv_version: firstInvoice.invoice.inv_version },
        }),
        204,
    );
    monthlyDetail = await detailOf(monthly);
    assert.equal(monthlyDetail.renewal.rnw_next_due_date, start);
    expectStatus(await invoiceOf([{ rnw_id: monthly, rnw_version: monthlyDetail.renewal.rnw_version }]), 201);
    monthlyDetail = await detailOf(monthly);
    assert.equal(monthlyDetail.renewal.rnw_next_due_date, "2027-03-31", "ข้ามรอบ ก.พ. ที่ใบที่สองออกไว้แล้ว");
});

test("R-4 รับงานต่ออายุ Fastwork: บันทึกรอบ + ขยับวันครบ · รับซ้ำ = 409 · ยกเลิกงาน = วันครบกลับ · แดชบอร์ด + ต่อไปต้องทำของโปรเจกต์", async () => {
    const [[hosting]] = await api.pool.query(
        "SELECT product_id FROM tb_products WHERE product_name = 'Cloud Hosting รายปี'",
    );
    const original = expectStatus(
        await as(people.fastwork, "POST", "/V1/fastwork/projects", {
            project_name: "เว็บที่ต้องต่ออายุ",
            client_name: "renew_buyer",
            milestones: [{ fwm_name: "งานทั้งหมด", fwm_amount: "1900" }],
            renewals: [
                {
                    rnw_product_id: hosting.product_id,
                    rnw_label: "renew-buyer.com",
                    rnw_price: "1290",
                    rnw_cycle_months: 12,
                    rnw_next_due_date: daysFromToday(-2),
                },
            ],
        }),
        201,
    );
    const [[renewal]] = await api.pool.query("SELECT rnw_id, rnw_client_id FROM tb_renewals WHERE rnw_source_id = ?", [
        original.project_id,
    ]);

    // ต่อไปต้องทำของโปรเจกต์ต้นทาง: เลยกำหนดต่ออายุ (คนจัดการ Fastwork เห็น)
    const steps = expectStatus(await as(people.fastwork, "GET", `/V1/projects/${original.project_id}/next-steps`), 200);
    const renewalStep = steps.items.find((entry) => entry.key === "renewal_due");
    assert.equal(renewalStep.level, "urgent");
    assert.ok(renewalStep.title.includes("renew-buyer.com"));
    const dashboard = expectStatus(await as(people.fastwork, "GET", "/V1/dashboard/business"), 200);
    assert.ok(dashboard.renewals.overdue >= 1);
    const plainDashboard = expectStatus(await as(people.plain, "GET", "/V1/dashboard/business"), 200);
    assert.equal(plainDashboard.renewals, undefined, "ไม่มีสิทธิ์ = ไม่มีส่วนนี้");

    const takeRenewal = (version) =>
        as(people.fastwork, "POST", "/V1/fastwork/projects", {
            project_name: "ต่ออายุ renew-buyer.com",
            client_id: renewal.rnw_client_id,
            milestones: [{ fwm_name: "ต่ออายุ 1 ปี", fwm_amount: "1290" }],
            renewal_id: renewal.rnw_id,
            renewal_version: version,
        });
    const job = expectStatus(await takeRenewal(0), 201);
    let detail = expectStatus(await as(people.fastwork, "GET", `/V1/renewals/${renewal.rnw_id}`), 200);
    assert.equal(detail.cycles[0].rnc_project_id, job.project_id);
    assert.ok(detail.renewal.rnw_next_due_date > daysFromToday(300), "ขยับไปปีหน้า");
    expectStatus(await takeRenewal(0), 409, "รับซ้ำด้วย version เดิม");

    // ยกเลิกงานต่ออายุ = รอบ void วันครบกลับ
    expectStatus(await api.callApi("PUT", `/V1/projects/${job.project_id}/cancel`, { body: {} }), 200);
    detail = expectStatus(await as(people.fastwork, "GET", `/V1/renewals/${renewal.rnw_id}`), 200);
    assert.equal(detail.renewal.rnw_next_due_date, daysFromToday(-2));
    assert.equal(detail.cycles[0].rnc_status, "void");
});
