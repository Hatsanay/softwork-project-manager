// deploy_schema.sql ต้องรันได้ทุกสภาพฐานข้อมูล และรันซ้ำกี่ครั้งก็ได้ (กติกาหัวไฟล์ deploy_schema.sql)
//
// - ฐานว่าง → สร้างครบ + ข้อมูลเริ่มต้น · รันซ้ำไม่เปลี่ยนอะไร
// - ฐานที่ใช้งานอยู่บน production (โครงสร้าง ณ deploy 12 / 13 / 15 ต.ค. 2026 เก็บไว้ที่ test/fixtures/) → อัปเกรดได้ ข้อมูลเดิมไม่หาย
// - ทุกกรณี query ตรวจสอบท้ายไฟล์ (ส่วนที่ 6) ต้องไม่มีแถว
// ใช้ฐานข้อมูลชั่วคราว ลบทิ้งตอนจบ ไม่แตะฐานข้อมูลที่ใช้งานอยู่
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const DEPLOY_SCHEMA = fs.readFileSync(
    path.join(__dirname, "..", "..", "database", "query", "deploy_schema.sql"),
    "utf8",
);
const PRODUCTION_SCHEMA_2026_10_12 = fs.readFileSync(
    path.join(__dirname, "fixtures", "deploy-schema-2026-10-12.sql"),
    "utf8",
);
// deploy 13 ต.ค. 2026 (commit 8a8680e) — มีตารางวงจรขาย 1A แล้ว แต่ยังไม่มีคอลัมน์/ตารางของช่วง 1B
const PRODUCTION_SCHEMA_2026_10_13 = fs.readFileSync(
    path.join(__dirname, "fixtures", "deploy-schema-2026-10-13.sql"),
    "utf8",
);
// deploy 15 ต.ค. 2026 (commit 9063c4f) — มีใบแจ้งหนี้/ใบวางบิล (1B) แล้ว แต่ยังไม่มีตารางใบเสร็จ (1C)
const PRODUCTION_SCHEMA_2026_10_15 = fs.readFileSync(
    path.join(__dirname, "fixtures", "deploy-schema-2026-10-15.sql"),
    "utf8",
);
// deploy 16 ต.ค. 2026 (commit 266e56a) — วงจรขายครบ (1A–1D) ยังไม่มีตารางเฟส 2 จัดซื้อ · role_permission ยังเป็น varchar(64)
const PRODUCTION_SCHEMA_2026_10_16 = fs.readFileSync(
    path.join(__dirname, "fixtures", "deploy-schema-2026-10-16.sql"),
    "utf8",
);
// deploy 16 ต.ค. 2026 20:11 (commit 0e97c00) — มีเฟส 2 ขั้น 2-1/2-2 แล้ว แต่ tb_expenses ยังไม่มี ex_merchant_name (ใบเบิก 2-3)
const PRODUCTION_SCHEMA_2026_10_16_2011 = fs.readFileSync(
    path.join(__dirname, "fixtures", "deploy-schema-2026-10-16-2011.sql"),
    "utf8",
);
const SERVER = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
};

// สร้างฐานชั่วคราว ส่ง connection ให้ทำงาน แล้วลบทิ้งเสมอ
async function withTemporaryDatabase(name, work) {
    const databaseName = `tmp_schema_${name}_${process.pid}`;
    const conn = await mysql.createConnection(SERVER);
    try {
        await conn.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await conn.query(`USE \`${databaseName}\``);
        await work(conn);
    } finally {
        await conn.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await conn.end();
    }
}

// รันทั้งไฟล์ แล้วคืนแถวของ query ตรวจสอบตัวสุดท้าย (ส่วนที่ 6)
async function runSchemaFile(conn, sqlText) {
    const [results] = await conn.query(sqlText);
    const resultSets = results.filter((result) => Array.isArray(result));
    return resultSets[resultSets.length - 1];
}

async function countRows(conn, sql) {
    const [[row]] = await conn.query(sql);
    return Number(row.total);
}

test("ฐานว่าง: สร้างครบตามที่ตรวจ + ข้อมูลเริ่มต้นของวงจรขาย · รันซ้ำไม่มีอะไรเปลี่ยน", async () => {
    await withTemporaryDatabase("fresh", async (conn) => {
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "รอบแรก: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "รอบสอง: ส่วนที่ 6 ต้องไม่มีแถว");

        const [currencies] = await conn.query(
            "SELECT cur_code, cur_decimals FROM tb_currencies ORDER BY cur_sort_order",
        );
        assert.deepEqual(currencies, [
            { cur_code: "THB", cur_decimals: 2 },
            { cur_code: "USD", cur_decimals: 2 },
        ]);

        const [branches] = await conn.query("SELECT branch_code, branch_name_th FROM tb_branches");
        assert.deepEqual(branches, [{ branch_code: "00000", branch_name_th: "สำนักงานใหญ่" }]);

        const [[company]] = await conn.query(
            "SELECT cs_id, cs_vat_registered_from, cs_quotation_valid_days, cs_default_credit_days, cs_promptpay_id FROM tb_company_settings",
        );
        assert.deepEqual(company, {
            cs_id: 1,
            cs_vat_registered_from: null,
            cs_quotation_valid_days: 30,
            cs_default_credit_days: 30,
            cs_promptpay_id: null,
        });

        const [[vatRate]] = await conn.query("SELECT vr_rate FROM tb_vat_rates");
        assert.equal(vatRate.vr_rate, "7.00");

        // กติกาอนุมัติเริ่มต้น: ชั้นเดียว ผู้อนุมัติ = role ระบบ · ใบเสนอราคา (QT) / ใบแจ้งหนี้ที่สร้างเอง (IV) / ใบเบิก (EC) ยอดตั้งแต่ 0
        // ค่าใช้จ่าย/บิลผู้ขาย (EX) ตั้งแต่ 3,000 บาท — ต่ำกว่านั้นผ่านอัตโนมัติ (เฟส 2 ข้อ P2)
        const [levels] = await conn.query(
            `SELECT l.al_doc_type, l.al_level, l.al_min_amount_thb, r.alr_role_id
             FROM tb_approval_levels l JOIN tb_approval_level_roles r ON r.alr_doc_type = l.al_doc_type AND r.alr_level = l.al_level
             ORDER BY l.al_doc_type`,
        );
        assert.deepEqual(levels, [
            { al_doc_type: "EC", al_level: 1, al_min_amount_thb: "0.00", alr_role_id: "ROL202601010000001" },
            { al_doc_type: "EX", al_level: 1, al_min_amount_thb: "3000.00", alr_role_id: "ROL202601010000001" },
            { al_doc_type: "IV", al_level: 1, al_min_amount_thb: "0.00", alr_role_id: "ROL202601010000001" },
            { al_doc_type: "QT", al_level: 1, al_min_amount_thb: "0.00", alr_role_id: "ROL202601010000001" },
        ]);
    });
});

test("ข้อมูลเริ่มต้นไม่ทับของที่แอดมินแก้แล้ว เมื่อรันซ้ำตอน deploy ครั้งถัดไป", async () => {
    await withTemporaryDatabase("rerun", async (conn) => {
        await runSchemaFile(conn, DEPLOY_SCHEMA);
        await conn.query(
            "UPDATE tb_company_settings SET cs_name_th = 'บริษัท ทดสอบ จำกัด', cs_quotation_valid_days = 15",
        );
        await conn.query("UPDATE tb_currencies SET cur_status = 'inactive' WHERE cur_code = 'USD'");
        await conn.query("UPDATE tb_branches SET branch_name_th = 'สำนักงานใหญ่ (กรุงเทพ)'");

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), []);

        const [[company]] = await conn.query("SELECT cs_name_th, cs_quotation_valid_days FROM tb_company_settings");
        assert.deepEqual(company, { cs_name_th: "บริษัท ทดสอบ จำกัด", cs_quotation_valid_days: 15 });
        const [[usd]] = await conn.query("SELECT cur_status FROM tb_currencies WHERE cur_code = 'USD'");
        assert.equal(usd.cur_status, "inactive");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_branches"), 1);
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_approval_level_roles"), 4);
    });
});

test("อัปเกรดจากโครงสร้าง deploy 16 ต.ค. 2026 20:11 (มีค่าใช้จ่ายแล้ว): ได้ช่องร้านค้าของใบเบิก · ค่าใช้จ่ายเดิมไม่หาย · รันซ้ำได้", async () => {
    await withTemporaryDatabase("upgrade10162011", async (conn) => {
        assert.deepEqual(
            await runSchemaFile(conn, PRODUCTION_SCHEMA_2026_10_16_2011),
            [],
            "ฐานตั้งต้นต้องสมบูรณ์ตามเวอร์ชันเก่า",
        );
        await conn.query("INSERT INTO tb_vendors (vd_id, vd_name) VALUES ('VND202610160000001', 'ผู้ขาย')");
        await conn.query(
            `INSERT INTO tb_expenses (ex_id, ex_vendor_id, ex_branch_id, ex_title, ex_expense_date, ex_due_date, ex_total)
             VALUES ('EXP202610160000001', 'VND202610160000001', 'BRA202601010000001', 'ค่าเซิร์ฟเวอร์', '2026-10-16', '2026-10-16', 1200)`,
        );

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "หลังอัปเกรด: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "อัปเกรดแล้วรันซ้ำ: ส่วนที่ 6 ต้องไม่มีแถว");

        const [[expense]] = await conn.query("SELECT ex_title, ex_total, ex_kind, ex_merchant_name FROM tb_expenses");
        assert.deepEqual(expense, {
            ex_title: "ค่าเซิร์ฟเวอร์",
            ex_total: "1200.00",
            ex_kind: "bill",
            ex_merchant_name: null,
        });
    });
});

test("อัปเกรดจากโครงสร้าง deploy 16 ต.ค. 2026: ได้ตารางเฟส 2 + ข้อมูลเริ่มต้น + กติกาอนุมัติค่าใช้จ่าย · ช่องสิทธิ์ขยายเป็น 255 สิทธิ์เดิมไม่หาย · รันซ้ำไม่ทับที่แก้", async () => {
    await withTemporaryDatabase("upgrade1016", async (conn) => {
        assert.deepEqual(
            await runSchemaFile(conn, PRODUCTION_SCHEMA_2026_10_16),
            [],
            "ฐานตั้งต้นต้องสมบูรณ์ตามเวอร์ชันเก่า",
        );
        await conn.query(
            "INSERT INTO tb_roles (role_id, role_name, role_permission, role_type) VALUES ('ROL202610160000001', 'บัญชี', ?, 'R')",
            ["10".repeat(20) + "1"],
        );

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "หลังอัปเกรด: ส่วนที่ 6 ต้องไม่มีแถว");
        const [[column]] = await conn.query(
            "SELECT CHARACTER_MAXIMUM_LENGTH AS length FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tb_roles' AND COLUMN_NAME = 'role_permission'",
        );
        assert.equal(Number(column.length), 255);
        const [[role]] = await conn.query("SELECT role_permission FROM tb_roles WHERE role_id = 'ROL202610160000001'");
        assert.equal(role.role_permission, "10".repeat(20) + "1", "สิทธิ์เดิมไม่เปลี่ยน");

        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_wht_income_types"), 6);
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_wht_rates"), 6);
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_expense_categories"), 15);
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_expenses"), 0);
        const [[expenseRule]] = await conn.query(
            "SELECT al_min_amount_thb FROM tb_approval_levels WHERE al_doc_type = 'EX' AND al_level = 1",
        );
        assert.equal(
            expenseRule.al_min_amount_thb,
            "3000.00",
            "ได้กติกาเริ่มต้นของค่าใช้จ่าย (ต่ำกว่า 3,000 ผ่านอัตโนมัติ)",
        );
        const [[service]] = await conn.query(
            "SELECT wr_rate, wr_min_payment FROM tb_wht_rates WHERE wr_income_type = 'SERVICE'",
        );
        assert.deepEqual(service, { wr_rate: "3.00", wr_min_payment: "1000.00" });

        // ผู้ดูแลแก้ข้อมูลเริ่มต้นแล้ว deploy รอบถัดไปไม่ทับ/ไม่เพิ่มซ้ำ
        await conn.query("UPDATE tb_expense_categories SET ec_name_th = 'ค่าจ้างภายนอก' WHERE ec_sort_order = 1");
        await conn.query("DELETE FROM tb_expense_categories WHERE ec_sort_order = 99");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "รันซ้ำ: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_expense_categories"), 14);
        assert.equal(
            await countRows(
                conn,
                "SELECT COUNT(*) AS total FROM tb_expense_categories WHERE ec_name_th = 'ค่าจ้างภายนอก'",
            ),
            1,
        );
    });
});

test("อัปเกรดฐานข้อมูลที่ใช้งานอยู่ (โครงสร้าง deploy 15 ต.ค. 2026 มีใบแจ้งหนี้แล้ว) ได้ · ได้ตารางใบเสร็จ · ยอดรับแล้วเดิมไม่หาย", async () => {
    await withTemporaryDatabase("upgrade1015", async (conn) => {
        assert.deepEqual(
            await runSchemaFile(conn, PRODUCTION_SCHEMA_2026_10_15),
            [],
            "ฐานตั้งต้นต้องสมบูรณ์ตามเวอร์ชันเก่า",
        );

        await conn.query("INSERT INTO tb_clients (client_id, client_name) VALUES ('CLI202610150000001', 'ลูกค้า')");
        await conn.query(
            `INSERT INTO tb_invoices (inv_id, inv_number, inv_status, inv_source, inv_client_id, inv_branch_id, inv_title, inv_total, inv_created_by)
             VALUES ('INV202610150000001', 'IV-20261015-000001', 'issued', 'manual', 'CLI202610150000001', 'BRA202601010000001', 'งานเว็บ', 1070, 'USE202601010000001')`,
        );

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "หลังอัปเกรด: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "อัปเกรดแล้วรันซ้ำ: ส่วนที่ 6 ต้องไม่มีแถว");

        const [[invoice]] = await conn.query("SELECT inv_status, inv_total, inv_paid_amount FROM tb_invoices");
        assert.deepEqual(invoice, { inv_status: "issued", inv_total: "1070.00", inv_paid_amount: "0.00" });
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_receipts"), 0);
    });
});

test("อัปเกรดฐานข้อมูลที่ใช้งานอยู่ (โครงสร้าง deploy 13 ต.ค. 2026 มีวงจรขาย 1A แล้ว) ได้ ตั้งค่าและกติกาเดิมไม่หาย", async () => {
    await withTemporaryDatabase("upgrade1013", async (conn) => {
        assert.deepEqual(
            await runSchemaFile(conn, PRODUCTION_SCHEMA_2026_10_13),
            [],
            "ฐานตั้งต้นต้องสมบูรณ์ตามเวอร์ชันเก่า",
        );

        // ของที่แอดมินตั้งไว้แล้วบน production: ชื่อบริษัท + กติกาอนุมัติใบเสนอราคา 2 ชั้น
        await conn.query("UPDATE tb_company_settings SET cs_name_th = 'บริษัท ทดสอบ จำกัด'");
        await conn.query(
            "INSERT INTO tb_approval_levels (al_doc_type, al_level, al_min_amount_thb) VALUES ('QT', 2, 100000)",
        );
        await conn.query(
            "INSERT INTO tb_approval_level_roles (alr_doc_type, alr_level, alr_role_id) VALUES ('QT', 2, 'ROL202601010000001')",
        );

        // ใบเสนอราคาเก็บเงินครั้งเดียวที่บันทึกก่อน 1B ไม่มีแถวงวด
        await conn.query("INSERT INTO tb_clients (client_id, client_name) VALUES ('CLI202610130000001', 'ลูกค้า')");
        await conn.query(
            `INSERT INTO tb_quotations (qt_id, qt_root_id, qt_client_id, qt_branch_id, qt_title, qt_language, qt_payment_mode, qt_total, qt_created_by)
             VALUES ('QUO202610130000001', 'QUO202610130000001', 'CLI202610130000001', 'BRA202601010000001', 'งานเว็บ', 'en', 'single', 1070, 'USE202601010000001')`,
        );

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "หลังอัปเกรด: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "อัปเกรดแล้วรันซ้ำ: ส่วนที่ 6 ต้องไม่มีแถว");

        const [milestones] = await conn.query(
            "SELECT qtm_order, qtm_name, qtm_percent, qtm_amount FROM tb_quotation_milestones WHERE qtm_quotation_id = 'QUO202610130000001'",
        );
        assert.deepEqual(
            milestones,
            [{ qtm_order: 1, qtm_name: "Full payment", qtm_percent: "100.00", qtm_amount: "1070.00" }],
            "ได้งวดเต็มจำนวน 1 แถว (รันซ้ำไม่เพิ่ม)",
        );

        const [[company]] = await conn.query(
            "SELECT cs_name_th, cs_default_credit_days, cs_promptpay_id FROM tb_company_settings",
        );
        assert.deepEqual(company, {
            cs_name_th: "บริษัท ทดสอบ จำกัด",
            cs_default_credit_days: 30,
            cs_promptpay_id: null,
        });
        assert.equal(
            await countRows(conn, "SELECT COUNT(*) AS total FROM tb_approval_levels WHERE al_doc_type = 'QT'"),
            2,
            "กติกาใบเสนอราคาที่ตั้งไว้ต้องอยู่ครบ",
        );
        assert.equal(
            await countRows(conn, "SELECT COUNT(*) AS total FROM tb_approval_level_roles WHERE alr_doc_type = 'IV'"),
            1,
            "ได้กติกาเริ่มต้นของใบแจ้งหนี้ที่สร้างเอง",
        );
    });
});

test("อัปเกรดฐานข้อมูลที่ใช้งานอยู่ (โครงสร้าง deploy 12 ต.ค. 2026) ได้ ข้อมูลเดิมไม่หาย", async () => {
    await withTemporaryDatabase("upgrade", async (conn) => {
        assert.deepEqual(
            await runSchemaFile(conn, PRODUCTION_SCHEMA_2026_10_12),
            [],
            "ฐานตั้งต้นต้องสมบูรณ์ตามเวอร์ชันเก่า",
        );

        // ข้อมูลที่มีอยู่จริงบน production: ลูกค้า โปรเจกต์ งาน (ผู้ใช้/role มาจาก seed)
        await conn.query(
            "INSERT INTO tb_clients (client_id, client_name, client_company) VALUES ('CLI202610010000001', 'คุณสมชาย', 'บริษัท ลูกค้า จำกัด')",
        );
        await conn.query(
            `INSERT INTO tb_projects (project_id, client_id, project_name, project_share_token, project_created_by)
             VALUES ('PRO202610010000001', 'CLI202610010000001', 'เว็บไซต์', 'token-upgrade-test', 'USE202601010000001')`,
        );
        await conn.query(
            "INSERT INTO tb_tasks (task_id, project_id, task_title) VALUES ('TAS202610010000001', 'PRO202610010000001', 'ออกแบบหน้าแรก')",
        );

        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "หลังอัปเกรด: ส่วนที่ 6 ต้องไม่มีแถว");
        assert.deepEqual(await runSchemaFile(conn, DEPLOY_SCHEMA), [], "อัปเกรดแล้วรันซ้ำ: ส่วนที่ 6 ต้องไม่มีแถว");

        // ลูกค้าเดิมได้ค่าเริ่มต้นของฟิลด์ใหม่ (และ FK สกุลเงินเพิ่มได้ เพราะมี THB ก่อน)
        const [[client]] = await conn.query(
            "SELECT client_name, client_type, client_country, client_currency, client_language, client_vat_treatment, client_status FROM tb_clients",
        );
        assert.deepEqual(client, {
            client_name: "คุณสมชาย",
            client_type: "juristic",
            client_country: "TH",
            client_currency: "THB",
            client_language: "th",
            client_vat_treatment: "standard",
            client_status: "active",
        });

        const [[task]] = await conn.query("SELECT task_title, task_quotation_item_id FROM tb_tasks");
        assert.deepEqual(task, { task_title: "ออกแบบหน้าแรก", task_quotation_item_id: null });

        const [[admin]] = await conn.query("SELECT user_username, user_branch_id FROM tb_users");
        assert.deepEqual(admin, { user_username: "admin", user_branch_id: null });
    });
});

test("กติกาของ foreign key: ของที่ถูกเอกสารอ้างอยู่ลบไม่ได้ · ลบใบเสนอราคาแล้วรายการตามไปด้วย", async () => {
    await withTemporaryDatabase("constraints", async (conn) => {
        await runSchemaFile(conn, DEPLOY_SCHEMA);
        await conn.query("INSERT INTO tb_clients (client_id, client_name) VALUES ('CLI202610010000001', 'ลูกค้า')");
        await conn.query(
            "INSERT INTO tb_products (product_id, product_name, product_price) VALUES ('PRD202610010000001', 'ออกแบบ', 50000)",
        );
        await conn.query(
            `INSERT INTO tb_quotations (qt_id, qt_root_id, qt_client_id, qt_branch_id, qt_title, qt_created_by)
             VALUES ('QUO202610010000001', 'QUO202610010000001', 'CLI202610010000001', 'BRA202601010000001', 'งานเว็บ', 'USE202601010000001')`,
        );
        await conn.query(
            `INSERT INTO tb_quotation_items (qti_quotation_id, qti_order, qti_product_id, qti_description, qti_quantity, qti_unit_price, qti_amount)
             VALUES ('QUO202610010000001', 1, 'PRD202610010000001', 'ออกแบบ', 1, 50000, 50000)`,
        );

        const referencedRows = [
            ["สินค้าที่อยู่ในใบเสนอราคา", "DELETE FROM tb_products WHERE product_id = 'PRD202610010000001'"],
            ["ลูกค้าที่มีใบเสนอราคา", "DELETE FROM tb_clients WHERE client_id = 'CLI202610010000001'"],
            ["สาขาที่มีใบเสนอราคา", "DELETE FROM tb_branches WHERE branch_id = 'BRA202601010000001'"],
            ["ผู้ใช้ที่สร้างใบเสนอราคา", "DELETE FROM tb_users WHERE user_id = 'USE202601010000001'"],
            ["สกุลเงินที่ใช้อยู่", "DELETE FROM tb_currencies WHERE cur_code = 'THB'"],
            [
                "role ที่อยู่ในกติกาอนุมัติ",
                "UPDATE tb_users SET user_role_id = NULL; DELETE FROM tb_roles WHERE role_id = 'ROL202601010000001'",
            ],
        ];
        for (const [description, sql] of referencedRows) {
            await assert.rejects(conn.query(sql), { code: "ER_ROW_IS_REFERENCED_2" }, description);
        }

        // ใบแจ้งหนี้อ้างงวดของใบเสนอราคา: ลบใบเสนอราคา/งวดที่ออกบิลแล้วไม่ได้ · ลบใบแจ้งหนี้แล้วรายการ/งวดที่ผูกหายตาม
        await conn.query(
            "INSERT INTO tb_quotation_milestones (qtm_quotation_id, qtm_order, qtm_name, qtm_amount) VALUES ('QUO202610010000001', 1, 'งวดเดียว', 50000)",
        );
        await conn.query(
            `INSERT INTO tb_invoices (inv_id, inv_source, inv_quotation_id, inv_client_id, inv_branch_id, inv_title, inv_created_by)
             VALUES ('INV202610010000001', 'quotation', 'QUO202610010000001', 'CLI202610010000001', 'BRA202601010000001', 'งานเว็บ', 'USE202601010000001')`,
        );
        await conn.query(
            `INSERT INTO tb_invoice_items (invi_invoice_id, invi_order, invi_description, invi_quantity, invi_unit_price, invi_amount)
             VALUES ('INV202610010000001', 1, 'งวดเดียว', 1, 50000, 50000)`,
        );
        await conn.query(
            `INSERT INTO tb_invoice_milestones (ivm_invoice_id, ivm_milestone_id, ivm_amount, ivm_base, ivm_vat)
             SELECT 'INV202610010000001', qtm_id, 50000, 50000, 0 FROM tb_quotation_milestones`,
        );
        await assert.rejects(
            conn.query("DELETE FROM tb_quotation_milestones"),
            { code: "ER_ROW_IS_REFERENCED_2" },
            "งวดที่ออกบิลแล้ว",
        );
        await assert.rejects(
            conn.query("DELETE FROM tb_quotations WHERE qt_id = 'QUO202610010000001'"),
            { code: "ER_ROW_IS_REFERENCED_2" },
            "ใบเสนอราคาที่มีใบแจ้งหนี้",
        );
        await conn.query("DELETE FROM tb_invoices WHERE inv_id = 'INV202610010000001'");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_invoice_items"), 0);
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_invoice_milestones"), 0);

        await conn.query("DELETE FROM tb_quotations WHERE qt_id = 'QUO202610010000001'");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_quotation_items"), 0);

        // ใบเสร็จอ้างใบแจ้งหนี้: ลบใบแจ้งหนี้ที่มีใบเสร็จไม่ได้ · ลบใบเสร็จ (ไม่มีในระบบจริง) แล้วรายการตัดหนี้หายตาม
        await conn.query(
            `INSERT INTO tb_invoices (inv_id, inv_number, inv_status, inv_source, inv_client_id, inv_branch_id, inv_title, inv_total, inv_created_by)
             VALUES ('INV202610010000002', 'IV-20261001-000002', 'issued', 'manual', 'CLI202610010000001', 'BRA202601010000001', 'งานแอป', 1000, 'USE202601010000001')`,
        );
        await conn.query(
            `INSERT INTO tb_receipts (rc_id, rc_number, rc_client_id, rc_branch_id, rc_receipt_date, rc_method, rc_allocated_total, rc_received_amount, rc_created_by)
             VALUES ('RCP202610010000001', 'RE-20261001-000001', 'CLI202610010000001', 'BRA202601010000001', '2026-10-01', 'cash', 1000, 1000, 'USE202601010000001')`,
        );
        await conn.query(
            "INSERT INTO tb_receipt_allocations (rca_receipt_id, rca_invoice_id, rca_amount) VALUES ('RCP202610010000001', 'INV202610010000002', 1000)",
        );
        await assert.rejects(
            conn.query("DELETE FROM tb_invoices WHERE inv_id = 'INV202610010000002'"),
            { code: "ER_ROW_IS_REFERENCED_2" },
            "ใบแจ้งหนี้ที่มีใบเสร็จ",
        );
        await assert.rejects(
            conn.query(
                `INSERT INTO tb_receipts (rc_id, rc_number, rc_client_id, rc_branch_id, rc_receipt_date, rc_method)
                 VALUES ('RCP202610010000002', 'RE-20261001-000001', 'CLI202610010000001', 'BRA202601010000001', '2026-10-01', 'cash')`,
            ),
            { code: "ER_DUP_ENTRY" },
            "เลขใบเสร็จซ้ำไม่ได้",
        );
        await conn.query("DELETE FROM tb_receipts WHERE rc_id = 'RCP202610010000001'");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_receipt_allocations"), 0);
    });
});
