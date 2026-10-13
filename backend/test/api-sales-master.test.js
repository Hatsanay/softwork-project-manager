// ข้อมูลหลักของงานขาย (ขั้น 1A-1d) — ลูกค้าช่องใหม่ · สาขาของผู้ใช้ · สินค้า/บริการ หมวดหมู่ ชุดรายการ
// ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const { startTestServer, SEED_ADMIN } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const VALID_THAI_TAX_ID = "0-1055-55000-00-5";

let api;

function product(overrides) {
    return {
        product_code: null,
        product_name: "ออกแบบเว็บไซต์",
        product_description: null,
        product_unit: "งาน",
        product_price: "15000.00",
        product_category_id: null,
        product_status: "active",
        ...overrides,
    };
}

test.before(async () => {
    api = await startTestServer("sales_master");
    await api.loginAsAdmin();
});

test.after(async () => {
    await api?.stop();
});

// ─── ลูกค้า ──────────────────────────────────────────────────────────────────────────────────

test("ลูกค้า: ส่งแค่ชื่อก็บันทึกได้ (ค่าเริ่มต้นของช่องใหม่ครบ)", async () => {
    const created = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้าเดิม" } });
    assert.equal(created.status, 201);
    const client = await api.callApi("GET", `/V1/clients/${created.body.client_id}`);
    assert.equal(client.body.client_type, "juristic");
    assert.equal(client.body.client_country, "TH");
    assert.equal(client.body.client_currency, "THB");
    assert.equal(client.body.client_language, "th");
    assert.equal(client.body.client_vat_treatment, "standard");
    assert.equal(client.body.client_status, "active");
});

test("ลูกค้า: เลขผู้เสียภาษีไทยตรวจหลักตรวจสอบและตัดขีดออก · นิติบุคคลต้องมีรหัสสาขา", async () => {
    const wrongChecksum = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "ผิด", client_tax_id: "0105555000006", client_branch_code: "00000" },
    });
    assert.equal(wrongChecksum.status, 400);
    assert.ok(wrongChecksum.body.fields.client_tax_id);

    const missingBranch = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "ไม่มีสาขา", client_tax_id: VALID_THAI_TAX_ID },
    });
    assert.equal(missingBranch.status, 400);
    assert.ok(missingBranch.body.fields.client_branch_code);

    const individual = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "บุคคลธรรมดา", client_type: "individual", client_tax_id: VALID_THAI_TAX_ID },
    });
    assert.equal(individual.status, 201);

    const juristic = await api.callApi("POST", "/V1/clients", {
        body: {
            client_name: "บริษัท ลูกค้า จำกัด",
            client_tax_id: VALID_THAI_TAX_ID,
            client_branch_code: "00000",
            client_credit_days: 30,
            client_wht_rate: "3",
        },
    });
    assert.equal(juristic.status, 201);
    const saved = await api.callApi("GET", `/V1/clients/${juristic.body.client_id}`);
    assert.equal(saved.body.client_tax_id, "0105555000005");
    assert.equal(saved.body.client_credit_days, 30);
    assert.equal(saved.body.client_wht_rate, "3.00");

    // ต่างประเทศ: ไม่ตรวจรูปแบบเลขภาษี ไม่บังคับสาขา
    const foreign = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "Foreign Co.", client_country: "us", client_tax_id: "12-3456789", client_currency: "USD" },
    });
    assert.equal(foreign.status, 201);

    const badWht = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "หักเกิน", client_wht_rate: "3.555" },
    });
    assert.equal(badWht.status, 400);
    assert.ok(badWht.body.fields.client_wht_rate);
});

test("ลูกค้า: เลือกสกุลเงินที่ปิดใช้งานไม่ได้ แต่ลูกค้าที่ใช้อยู่แล้วแก้ข้อมูลอื่นได้", async () => {
    const created = await api.callApi("POST", "/V1/clients", {
        body: { client_name: "ลูกค้าดอลลาร์", client_currency: "USD" },
    });
    assert.equal(created.status, 201);
    await api.pool.query("UPDATE tb_currencies SET cur_status = 'inactive' WHERE cur_code = 'USD'");
    try {
        const newClient = await api.callApi("POST", "/V1/clients", {
            body: { client_name: "ใหม่", client_currency: "USD" },
        });
        assert.equal(newClient.status, 400);
        assert.ok(newClient.body.fields.client_currency);

        const keepCurrency = await api.callApi("PUT", `/V1/clients/${created.body.client_id}`, {
            body: { client_name: "ลูกค้าดอลลาร์ (แก้)", client_currency: "USD" },
        });
        assert.equal(keepCurrency.status, 200);

        const unknown = await api.callApi("POST", "/V1/clients", {
            body: { client_name: "ไม่มีสกุล", client_currency: "XYZ" },
        });
        assert.equal(unknown.status, 400);
    } finally {
        await api.pool.query("UPDATE tb_currencies SET cur_status = 'active' WHERE cur_code = 'USD'");
    }
});

test("ลูกค้า: ที่มีโปรเจกต์แล้วลบไม่ได้ · กรองเฉพาะที่เปิดใช้งานได้", async () => {
    const created = await api.callApi("POST", "/V1/clients", { body: { client_name: "ลูกค้ามีโปรเจกต์" } });
    const project = await api.callApi("POST", "/V1/projects", {
        body: { project_name: "โปรเจกต์ของลูกค้า", client_id: created.body.client_id },
    });
    assert.equal(project.status, 201, JSON.stringify(project.body));

    const remove = await api.callApi("DELETE", `/V1/clients/${created.body.client_id}`);
    assert.equal(remove.status, 409);
    assert.equal(remove.body.code, "CLIENT_IN_USE");

    const close = await api.callApi("PUT", `/V1/clients/${created.body.client_id}`, {
        body: { client_name: "ลูกค้ามีโปรเจกต์", client_status: "inactive" },
    });
    assert.equal(close.status, 200);

    const activeOnly = await api.callApi("GET", "/V1/clients?status=active&limit=1000");
    assert.ok(activeOnly.body.data.every((client) => client.client_status === "active"));
    assert.ok(!activeOnly.body.data.some((client) => client.client_id === created.body.client_id));

    const missing = await api.callApi("DELETE", "/V1/clients/CLI209901010000001");
    assert.equal(missing.status, 404);
});

// ─── สาขาของผู้ใช้ ───────────────────────────────────────────────────────────────────────────

test("ผู้ใช้: เลือกสาขาเริ่มต้นได้ · สาขาที่ปิดแล้วเลือกใหม่ไม่ได้ · ไม่ส่งฟิลด์ = ไม่เปลี่ยน", async () => {
    const openBranch = await api.callApi("POST", "/V1/company/branches", {
        body: { branch_code: "00001", branch_name_th: "สาขาเปิด", branch_status: "active" },
    });
    const closedBranch = await api.callApi("POST", "/V1/company/branches", {
        body: { branch_code: "00002", branch_name_th: "สาขาปิด", branch_status: "inactive" },
    });
    assert.equal(openBranch.status, 201);
    assert.equal(closedBranch.status, 201);

    const created = await api.callApi("POST", "/V1/users", {
        body: {
            user_fname: "พนักงาน",
            user_lname: "สาขา",
            user_role_id: SEED_ADMIN.roleId,
            user_branch_id: openBranch.body.branch_id,
        },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const userId = created.body.user_id;
    const afterCreate = await api.callApi("GET", `/V1/users/${userId}`);
    assert.equal(afterCreate.body.user_branch_id, openBranch.body.branch_id);

    const baseUpdate = {
        user_fname: "พนักงาน",
        user_lname: "สาขา",
        user_username: afterCreate.body.user_username,
        user_role_id: SEED_ADMIN.roleId,
        user_status: "active",
    };
    const toClosed = await api.callApi("PUT", `/V1/users/${userId}`, {
        body: { ...baseUpdate, user_branch_id: closedBranch.body.branch_id },
    });
    assert.equal(toClosed.status, 400);

    const toMissing = await api.callApi("PUT", `/V1/users/${userId}`, {
        body: { ...baseUpdate, user_branch_id: "BRA209901010000001" },
    });
    assert.equal(toMissing.status, 400);

    const withoutField = await api.callApi("PUT", `/V1/users/${userId}`, { body: baseUpdate });
    assert.equal(withoutField.status, 200);
    const afterOldClient = await api.callApi("GET", `/V1/users/${userId}`);
    assert.equal(afterOldClient.body.user_branch_id, openBranch.body.branch_id);

    // สาขาเดิมถูกปิดทีหลัง — ผู้ใช้ยังบันทึกโดยคงสาขาเดิมได้
    await api.pool.query("UPDATE tb_branches SET branch_status = 'inactive' WHERE branch_id = ?", [
        openBranch.body.branch_id,
    ]);
    const keepClosed = await api.callApi("PUT", `/V1/users/${userId}`, {
        body: { ...baseUpdate, user_branch_id: openBranch.body.branch_id },
    });
    assert.equal(keepClosed.status, 200);

    const clear = await api.callApi("PUT", `/V1/users/${userId}`, { body: { ...baseUpdate, user_branch_id: "" } });
    assert.equal(clear.status, 200);
    const afterClear = await api.callApi("GET", `/V1/users/${userId}`);
    assert.equal(afterClear.body.user_branch_id, null);
});

// ─── สินค้า/บริการ ───────────────────────────────────────────────────────────────────────────

test("สินค้า: รหัสห้ามซ้ำ · ราคาทศนิยมไม่เกิน 2 ตำแหน่ง · หมวดต้องมีอยู่จริง", async () => {
    const created = await api.callApi("POST", "/V1/products", { body: product({ product_code: "WEB-01" }) });
    assert.equal(created.status, 201);
    assert.equal(created.body.product_price, "15000.00");

    const duplicate = await api.callApi("POST", "/V1/products", {
        body: product({ product_code: "WEB-01", product_name: "ซ้ำ" }),
    });
    assert.equal(duplicate.status, 409);
    assert.ok(duplicate.body.fields.product_code);

    // ไม่มีรหัส หลายตัวได้ (unique ยอมให้ NULL ซ้ำ)
    const noCode1 = await api.callApi("POST", "/V1/products", { body: product({ product_name: "ไม่มีรหัส 1" }) });
    const noCode2 = await api.callApi("POST", "/V1/products", {
        body: product({ product_code: "", product_name: "ไม่มีรหัส 2" }),
    });
    assert.equal(noCode1.status, 201);
    assert.equal(noCode2.status, 201);

    const badPrice = await api.callApi("POST", "/V1/products", { body: product({ product_price: "10.555" }) });
    assert.equal(badPrice.status, 400);
    assert.ok(badPrice.body.fields.product_price);

    const badCategory = await api.callApi("POST", "/V1/products", {
        body: product({ product_name: "หมวดผิด", product_category_id: "PCA209901010000001" }),
    });
    assert.equal(badCategory.status, 400);
    assert.ok(badCategory.body.fields.product_category_id);

    const keepOwnCode = await api.callApi("PUT", `/V1/products/${created.body.product_id}`, {
        body: product({ product_code: "WEB-01", product_price: "18000" }),
    });
    assert.equal(keepOwnCode.status, 200);
    assert.equal(keepOwnCode.body.product_price, "18000.00");

    const search = await api.callApi("GET", "/V1/products?search=WEB-01");
    assert.equal(search.body.total, 1);
});

test("หมวดหมู่: ชื่อห้ามซ้ำ · ลบหมวดแล้วสินค้ากลายเป็นไม่มีหมวด", async () => {
    const category = await api.callApi("POST", "/V1/product-categories", {
        body: { pc_name: "บริการรายเดือน", pc_sort_order: 1, pc_status: "active" },
    });
    assert.equal(category.status, 201);
    const duplicate = await api.callApi("POST", "/V1/product-categories", {
        body: { pc_name: "บริการรายเดือน", pc_sort_order: 2, pc_status: "active" },
    });
    assert.equal(duplicate.status, 409);

    const inCategory = await api.callApi("POST", "/V1/products", {
        body: product({ product_name: "ดูแลระบบรายเดือน", product_category_id: category.body.pc_id }),
    });
    assert.equal(inCategory.body.category_name, "บริการรายเดือน");

    const list = await api.callApi("GET", "/V1/product-categories");
    assert.equal(list.body.data.find((row) => row.pc_id === category.body.pc_id).product_count, 1);

    const filtered = await api.callApi("GET", `/V1/products?category_id=${category.body.pc_id}`);
    assert.equal(filtered.body.total, 1);

    const remove = await api.callApi("DELETE", `/V1/product-categories/${category.body.pc_id}`);
    assert.equal(remove.status, 204);
    const after = await api.callApi("GET", `/V1/products/${inCategory.body.product_id}`);
    assert.equal(after.body.product_category_id, null);
});

// ─── ชุดรายการ ───────────────────────────────────────────────────────────────────────────────

test("ชุดรายการ: ตรวจแถว · บันทึกแทนทั้งชุด · สินค้าที่อยู่ในชุดลบไม่ได้", async () => {
    const hosting = await api.callApi("POST", "/V1/products", {
        body: product({ product_name: "โฮสติ้ง", product_price: "3000" }),
    });

    const noPricedItem = await api.callApi("POST", "/V1/product-packages", {
        body: {
            pkg_name: "มีแต่หัวข้อ",
            pkg_status: "active",
            items: [{ pki_type: "heading", pki_description: "หัวข้อ" }],
        },
    });
    assert.equal(noPricedItem.status, 400);
    assert.ok(noPricedItem.body.fields.items);

    const missingPrice = await api.callApi("POST", "/V1/product-packages", {
        body: {
            pkg_name: "ไม่มีราคา",
            pkg_status: "active",
            items: [{ pki_type: "item", pki_description: "งานพิเศษ", pki_quantity: "1" }],
        },
    });
    assert.equal(missingPrice.status, 400);
    assert.ok(missingPrice.body.fields["items.0.pki_unit_price"]);

    const deletedProduct = await api.callApi("POST", "/V1/product-packages", {
        body: {
            pkg_name: "สินค้าถูกลบ",
            pkg_status: "active",
            items: [
                { pki_type: "item", pki_product_id: "PRD209901010000001", pki_description: "หาย", pki_quantity: "1" },
            ],
        },
    });
    assert.equal(deletedProduct.status, 400);
    assert.ok(deletedProduct.body.fields["items.0.pki_product_id"]);

    const created = await api.callApi("POST", "/V1/product-packages", {
        body: {
            pkg_name: "แพ็กเกจเว็บไซต์",
            pkg_status: "active",
            items: [
                { pki_type: "heading", pki_description: "ค่าพัฒนา", pki_quantity: "5", pki_unit_price: "99" },
                {
                    pki_type: "item",
                    pki_product_id: hosting.body.product_id,
                    pki_description: "โฮสติ้ง 1 ปี",
                    pki_quantity: "12",
                    pki_unit: "เดือน",
                },
                { pki_type: "item", pki_description: "จดโดเมน", pki_quantity: "1", pki_unit_price: "500" },
                { pki_type: "note", pki_description: "ราคานี้ไม่รวมค่าเนื้อหา" },
            ],
        },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const packageId = created.body.pkg_id;

    const saved = await api.callApi("GET", `/V1/product-packages/${packageId}`);
    assert.deepEqual(
        saved.body.items.map((item) => [item.pki_order, item.pki_type]),
        [
            [1, "heading"],
            [2, "item"],
            [3, "item"],
            [4, "note"],
        ],
    );
    // หัวข้อไม่เก็บจำนวน/ราคาที่ค้างมา
    assert.equal(saved.body.items[0].pki_quantity, null);
    assert.equal(saved.body.items[0].pki_unit_price, null);
    assert.equal(saved.body.items[1].product_name, "โฮสติ้ง");

    const updated = await api.callApi("PUT", `/V1/product-packages/${packageId}`, {
        body: {
            pkg_name: "แพ็กเกจเว็บไซต์ (ย่อ)",
            pkg_status: "active",
            items: [
                {
                    pki_type: "item",
                    pki_product_id: hosting.body.product_id,
                    pki_description: "โฮสติ้ง",
                    pki_quantity: "1",
                },
            ],
        },
    });
    assert.equal(updated.status, 200);
    const afterUpdate = await api.callApi("GET", `/V1/product-packages/${packageId}`);
    assert.equal(afterUpdate.body.items.length, 1);

    const list = await api.callApi("GET", "/V1/product-packages");
    assert.equal(list.body.data.find((row) => row.pkg_id === packageId).item_count, 1);

    const removeProduct = await api.callApi("DELETE", `/V1/products/${hosting.body.product_id}`);
    assert.equal(removeProduct.status, 409);
    assert.equal(removeProduct.body.code, "PRODUCT_IN_USE");

    const removePackage = await api.callApi("DELETE", `/V1/product-packages/${packageId}`);
    assert.equal(removePackage.status, 204);
    const [[{ itemCount }]] = await api.pool.query(
        "SELECT COUNT(*) AS itemCount FROM tb_product_package_items WHERE pki_package_id = ?",
        [packageId],
    );
    assert.equal(itemCount, 0);

    const removeProductAfter = await api.callApi("DELETE", `/V1/products/${hosting.body.product_id}`);
    assert.equal(removeProductAfter.status, 204);
});

test("ผู้ใช้ที่ไม่มีสิทธิ์จัดการสินค้า: ค้นดูได้ (ทำใบเสนอราคา) แต่เพิ่ม/แก้/ลบไม่ได้", async () => {
    const dashboardOnly = PERMISSION_KEYS.map((key) => (key === "dashboard" ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", {
        body: { role_name: "พนักงานขาย", role_permission: dashboardOnly },
    });
    const passwordHash = await bcrypt.hash("Sales@2026", 10);
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES ('USE209901010000008', 'sales.test', 'sales@example.com', ?, 'พนักงาน', 'ขาย', ?, 0)`,
        [passwordHash, role.body.role_id],
    );
    const salesToken = await api.login("sales.test", "Sales@2026");

    for (const url of ["/V1/products", "/V1/product-categories", "/V1/product-packages"]) {
        const view = await api.callApi("GET", url, { token: salesToken });
        assert.equal(view.status, 200, url);
    }
    const create = await api.callApi("POST", "/V1/products", {
        token: salesToken,
        body: product({ product_name: "ห้ามสร้าง" }),
    });
    assert.equal(create.status, 403);
    const createCategory = await api.callApi("POST", "/V1/product-categories", {
        token: salesToken,
        body: { pc_name: "ห้ามสร้าง", pc_sort_order: 0, pc_status: "active" },
    });
    assert.equal(createCategory.status, 403);
});

test("ทุกการแก้ไขสินค้าเข้า audit log ด้วยชื่อการกระทำภาษาไทย", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT DISTINCT aud_action FROM tb_audit_logs WHERE aud_path LIKE '/product%' AND aud_success = 1",
    );
    const actions = rows.map((row) => row.aud_action);
    for (const expected of [
        "เพิ่มสินค้า/บริการ",
        "แก้ไขสินค้า/บริการ",
        "ลบสินค้า/บริการ",
        "เพิ่มหมวดสินค้า",
        "ลบหมวดสินค้า",
        "เพิ่มชุดรายการ",
        "แก้ไขชุดรายการ",
        "ลบชุดรายการ",
    ]) {
        assert.ok(actions.includes(expected), `ไม่พบ "${expected}" ใน audit log (มี: ${actions.join(", ")})`);
    }
});
