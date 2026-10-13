// deploy_schema.sql ต้องรันได้ทุกสภาพฐานข้อมูล และรันซ้ำกี่ครั้งก็ได้ (กติกาหัวไฟล์ deploy_schema.sql)
//
// - ฐานว่าง → สร้างครบ + ข้อมูลเริ่มต้น · รันซ้ำไม่เปลี่ยนอะไร
// - ฐานที่ใช้งานอยู่บน production (โครงสร้าง ณ deploy 12 ต.ค. 2026 เก็บไว้ที่ test/fixtures/) → อัปเกรดได้ ข้อมูลเดิมไม่หาย
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
            "SELECT cs_id, cs_vat_registered_from, cs_quotation_valid_days FROM tb_company_settings",
        );
        assert.deepEqual(company, { cs_id: 1, cs_vat_registered_from: null, cs_quotation_valid_days: 30 });

        const [[vatRate]] = await conn.query("SELECT vr_rate FROM tb_vat_rates");
        assert.equal(vatRate.vr_rate, "7.00");

        // กติกาอนุมัติเริ่มต้น: ชั้นเดียว ยอด 0 ผู้อนุมัติ = role ระบบ
        const [levels] = await conn.query(
            `SELECT l.al_level, l.al_min_amount_thb, r.alr_role_id
             FROM tb_approval_levels l JOIN tb_approval_level_roles r ON r.alr_doc_type = l.al_doc_type AND r.alr_level = l.al_level`,
        );
        assert.deepEqual(levels, [{ al_level: 1, al_min_amount_thb: "0.00", alr_role_id: "ROL202601010000001" }]);
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
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_approval_level_roles"), 1);
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

        await conn.query("DELETE FROM tb_quotations WHERE qt_id = 'QUO202610010000001'");
        assert.equal(await countRows(conn, "SELECT COUNT(*) AS total FROM tb_quotation_items"), 0);
    });
});
