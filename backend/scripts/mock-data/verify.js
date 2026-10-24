// ตรวจไฟล์ข้อมูลจำลองแบบที่ผู้ใช้ลงจริง (2026-10-24 · docs/plans/2026-10-24-mock-data.md)
//
// ใช้: cd backend && npm run mock:verify
// - ฐานใหม่จาก deploy_schema.sql → database/reset_all_data.sql → database/mock_data.sql (แทนชื่อฐานในบรรทัดตรวจ)
// - เปิดระบบบนฐานนั้นในสคริปต์ แล้วเรียกหน้าหลักของทุกฝ่ายในนามผู้ใช้จริง ต้องตอบ 200 และมีข้อมูล
// - ตรวจว่าไฟล์รูป/ไฟล์แนบที่ข้อมูลอ้างถึงมีอยู่ใน database/mock_uploads ครบ
// - ลบฐานทิ้งตอนจบ
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..", "..");
const DATABASE_DIR = path.join(BACKEND_DIR, "..", "database");
const PRODUCTION_DATABASE = "dktimeh_softwork_pm_db";
const GUARD_LINE = `SET @confirm_database = '${PRODUCTION_DATABASE}';`;
const PASSWORD = "12345678";
// ข้อมูลจำลองจบวันที่ 23 ต.ค. 2026 — เวลาที่เลยจากนี้ = เวลาจริงตอนรันสคริปต์หลุดเข้ามา (นาฬิกาจำลองไม่ครอบ)
const LATER_THAN_DATA = "2026-10-24 00:00:00";
// คอลัมน์เวลาที่ตั้งใจเป็นอนาคต (OT ที่ขอล่วงหน้า)
const FUTURE_BY_DESIGN = new Set(["tb_overtime_requests.ot_start_at", "tb_overtime_requests.ot_end_at"]);

require("dotenv").config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });
const DATABASE_NAME = `tmp_mockcheck_${process.pid}`;
process.env.DB_NAME = DATABASE_NAME;
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.BOT_API_KEY = "";
process.env.BOT_API_URL = "";
process.env.SIGNATURE_STORAGE_DIR = path.join(DATABASE_DIR, "mock_uploads", "storage", "signatures");
process.env.DOCUMENT_STORAGE_DIR = path.join(DATABASE_DIR, "mock_uploads", "storage");

const mysql = require("mysql2/promise");

function connect() {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true,
    });
}

function withDatabaseName(sqlText, fileName) {
    if (!sqlText.includes(GUARD_LINE)) throw new Error(`${fileName} ไม่มีบรรทัด ${GUARD_LINE}`);
    return sqlText.replace(GUARD_LINE, `SET @confirm_database = '${DATABASE_NAME}';`);
}

// [ผู้ใช้, เส้นทาง, ตรวจผล (คืนข้อความปัญหา หรือ null)]
const nonEmpty = (pick) => (body) => ((pick(body) ?? []).length > 0 ? null : "ไม่มีข้อมูล");
const CHECKS = [
    ["hatsanai", "/V1/dashboard/summary", () => null],
    ["hatsanai", "/V1/projects", nonEmpty((body) => body.data ?? body)],
    ["siriporn", "/V1/invoices", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/credit-notes", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/billing-notes", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/receipts", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/expenses", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/payments", nonEmpty((body) => body.data)],
    ["kamonchanok", "/V1/receivables/aging", () => null],
    ["kamonchanok", "/V1/payables/aging", () => null],
    ["hatsanai", "/V1/reports/sales?from=2026-04-01&to=2026-10-31", () => null],
    ["kamonchanok", "/V1/reports/withholding?month=2026-09&form=PND53", () => null],
    ["wannipa", "/V1/payroll/runs", nonEmpty((body) => body.data)],
    ["wannipa", "/V1/attendance/board?date=2026-10-22", nonEmpty((body) => body.rows)],
    ["wannipa", "/V1/attendance/summary?month=2026-09", nonEmpty((body) => body.rows)],
    ["supawadee", "/V1/attendance/me?month=2026-09", nonEmpty((body) => body.days)],
    ["supawadee", "/V1/leave/me?year=2026", nonEmpty((body) => body.requests)],
    ["nattapon", "/V1/timesheet/approvals", () => null],
];

async function main() {
    const startedAt = Date.now();
    console.log(`สร้างฐาน ${DATABASE_NAME}: deploy_schema → reset_all_data → mock_data`);
    const connection = await connect();
    await connection.query(`CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    const problems = [];
    try {
        await connection.query(`USE \`${DATABASE_NAME}\``);
        await connection.query(fs.readFileSync(path.join(DATABASE_DIR, "query", "deploy_schema.sql"), "utf8"));
        await connection.query(withDatabaseName(fs.readFileSync(path.join(DATABASE_DIR, "reset_all_data.sql"), "utf8"), "reset_all_data.sql"));
        await connection.query(withDatabaseName(fs.readFileSync(path.join(DATABASE_DIR, "mock_data.sql"), "utf8"), "mock_data.sql"));

        // ลงซ้ำบนฐานที่มีข้อมูลแล้วต้องหยุดเอง (กันทับข้อมูลจริง)
        const isBlocked = await connection
            .query(withDatabaseName(fs.readFileSync(path.join(DATABASE_DIR, "mock_data.sql"), "utf8"), "mock_data.sql"))
            .then(() => false)
            .catch((error) => error.message.includes("more than 1 row"));
        if (!isBlocked) problems.push("mock_data.sql ลงซ้ำบนฐานที่มีข้อมูลแล้วได้ (ควรหยุด)");

        const [emptyTables] = await connection.query(
            `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [DATABASE_NAME],
        );
        for (const { name } of emptyTables) {
            const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${name}\``);
            if (Number(total) === 0 && name !== "tb_error_logs") problems.push(`ตาราง ${name} ว่าง`);
        }

        // เวลาที่ MySQL ใส่เอง (created_at ฯลฯ) ต้องเป็นเวลาจำลอง ไม่ใช่วันที่รันสคริปต์
        const [datetimeColumns] = await connection.query(
            `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = ? AND DATA_TYPE IN ('datetime', 'timestamp')`,
            [DATABASE_NAME],
        );
        for (const { table_name: table, column_name: column } of datetimeColumns) {
            if (FUTURE_BY_DESIGN.has(`${table}.${column}`)) continue;
            const [[{ total }]] = await connection.query(`SELECT COUNT(*) AS total FROM \`${table}\` WHERE \`${column}\` >= ?`, [
                LATER_THAN_DATA,
            ]);
            if (Number(total) > 0) problems.push(`${table}.${column} มี ${total} แถวเลยวันสุดท้ายของข้อมูล (เวลาจริงหลุดเข้ามา)`);
        }

        // ไฟล์ที่ข้อมูลอ้างถึง
        const [paths] = await connection.query(
            `SELECT cs_logo_url AS file FROM tb_company_settings WHERE cs_logo_url IS NOT NULL
             UNION ALL SELECT image_url FROM tb_project_chat_images UNION ALL SELECT image_url FROM tb_task_chat_images
             UNION ALL SELECT image_url FROM tb_task_issue_images UNION ALL SELECT image_url FROM tb_task_issue_reply_images`,
        );
        for (const { file } of paths) {
            const local = path.join(DATABASE_DIR, "mock_uploads", file.replace(/^\//, ""));
            if (!fs.existsSync(local)) problems.push(`ไม่มีไฟล์ ${file} ใน mock_uploads`);
        }
        const [signatures] = await connection.query("SELECT sig_file_path AS file FROM tb_user_signatures");
        for (const { file } of signatures) {
            if (!fs.existsSync(path.join(process.env.SIGNATURE_STORAGE_DIR, file))) problems.push(`ไม่มีลายเซ็น ${file}`);
        }

        // เปิดระบบบนฐานนี้ แล้วเรียกหน้าหลัก
        const app = require("../../src/app");
        const pool = require("../../src/config/db");
        const server = await new Promise((resolve) => {
            const listening = app.listen(0, () => resolve(listening));
        });
        const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
        const tokens = new Map();
        const tokenOf = async (username) => {
            if (!tokens.has(username)) {
                const response = await fetch(`${baseUrl}/V1/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: username, user_password: PASSWORD }),
                });
                const body = await response.json();
                if (response.status !== 200) throw new Error(`login ${username}: ${response.status} ${JSON.stringify(body)}`);
                tokens.set(username, body.token);
            }
            return tokens.get(username);
        };
        const writeToConsole = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk, ...rest) => (/^[0-9a-f-]{36} (GET|POST) /.test(String(chunk)) ? true : writeToConsole(chunk, ...rest));
        for (const [username, url, check] of CHECKS) {
            const response = await fetch(`${baseUrl}${url}`, { headers: { Authorization: `Bearer ${await tokenOf(username)}` } });
            const body = await response.json().catch(() => null);
            const problem = response.status !== 200 ? `HTTP ${response.status} ${body?.message ?? ""}` : check(body);
            console.log(`${problem ? "✗" : "✓"} ${username.padEnd(12)} ${url}${problem ? ` · ${problem}` : ""}`);
            if (problem) problems.push(`${url}: ${problem}`);
        }
        process.stdout.write = writeToConsole;
        server.close();
        await new Promise((resolve) => setTimeout(resolve, 1000));
        await pool.end();
    } finally {
        await connection.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``);
        await connection.end();
    }
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    if (problems.length > 0) {
        console.log(`\n✗ พบปัญหา ${problems.length} ข้อ (${seconds} วินาที):\n- ${problems.join("\n- ")}`);
        process.exit(1);
    }
    console.log(`\n✓ mock_data.sql ลงได้ ทุกตารางมีข้อมูล ไฟล์ครบ และหน้าหลักทุกฝ่ายเปิดได้ (${seconds} วินาที)`);
}

main().catch((error) => {
    console.error("\nหยุด:", error.message);
    process.exit(1);
});
