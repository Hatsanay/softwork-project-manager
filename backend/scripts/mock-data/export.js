// สร้างไฟล์ข้อมูลจำลองทั้งระบบ (2026-10-24 · docs/plans/2026-10-24-mock-data.md)
//
// ใช้: cd backend && npm run mock:export          (ใช้เวลาราว 5-10 นาที แสดงความคืบหน้ารายเดือน)
//      KEEP_DB=1 npm run mock:export              เก็บฐานชั่วคราวไว้เปิดดูหน้าเว็บ (ลบเองทีหลัง)
//
// ขั้นตอน:
//   1. สร้างฐานชั่วคราว tmp_mock_<pid> จาก deploy_schema.sql แล้วรัน database/reset_all_data.sql (ตรวจไฟล์ reset ไปในตัว)
//   2. ใส่ข้อมูลบริษัทผ่าน API จริง (scripts/seed-company-data) — ยอดเงิน ภาษี เงินเดือน เลขเอกสาร ถูกตามกติกาของระบบ
//   3. ส่งออกข้อมูลทุกตารางเป็น database/mock_data.sql (ไม่มีโครงสร้าง · ใช้กับโครงสร้างล่าสุดเท่านั้น)
//   4. คัดลอกไฟล์ที่ข้อมูลอ้างถึงไป database/mock_uploads/ (uploads = รูปสาธารณะ · storage = ลายเซ็น/ไฟล์แนบส่วนตัว)
//   5. ลบไฟล์ที่เกิดระหว่างทางออกจาก backend/uploads และลบฐานชั่วคราว
const fs = require("fs");
const os = require("os");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..", "..");
const DATABASE_DIR = path.join(BACKEND_DIR, "..", "database");
const DEPLOY_SCHEMA_PATH = path.join(DATABASE_DIR, "query", "deploy_schema.sql");
const RESET_PATH = path.join(DATABASE_DIR, "reset_all_data.sql");
const OUTPUT_SQL_PATH = path.join(DATABASE_DIR, "mock_data.sql");
const OUTPUT_FILES_DIR = path.join(DATABASE_DIR, "mock_uploads");
const UPLOADS_DIR = path.join(BACKEND_DIR, "uploads");
const PRODUCTION_DATABASE = "dktimeh_softwork_pm_db";
const RESET_GUARD_LINE = `SET @confirm_database = '${PRODUCTION_DATABASE}';`;
const ROWS_PER_INSERT = 100;
// ตารางที่ว่างได้ (มีเหตุผล) — ตารางอื่นว่าง = ข้อมูลจำลองยังไม่ครอบคลุม แจ้งเตือนตอนจบ
const ALLOWED_EMPTY_TABLES = new Map([["tb_error_logs", "ระบบไม่มีข้อผิดพลาดระหว่างใส่ข้อมูล"]]);

// ─── สภาพแวดล้อม: ต้องตั้งก่อน require โค้ดของระบบ (config/db อ่านชื่อฐานตอนโหลด) ──────────────────────
require("dotenv").config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });
const DATABASE_NAME = `tmp_mock_${process.pid}`;
const STORAGE_DIR = path.join(os.tmpdir(), `softwork-mock-${process.pid}`, "storage");
process.env.DB_NAME = DATABASE_NAME;
process.env.SIGNATURE_STORAGE_DIR = path.join(STORAGE_DIR, "signatures");
process.env.DOCUMENT_STORAGE_DIR = STORAGE_DIR;

const mysql = require("mysql2/promise");

function connect(options = {}) {
    return mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true,
        ...options,
    });
}

function elapsed(startedAt) {
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    return `${Math.floor(seconds / 60)} นาที ${seconds % 60} วินาที`;
}

function listFiles(directory) {
    if (!fs.existsSync(directory)) return [];
    return fs
        .readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath ?? entry.path, entry.name));
}

// ─── 1. ฐานชั่วคราว ───────────────────────────────────────────────────────────────────────
async function createDatabase() {
    const resetSql = fs.readFileSync(RESET_PATH, "utf8");
    if (!resetSql.includes(RESET_GUARD_LINE)) {
        throw new Error(`database/reset_all_data.sql ไม่มีบรรทัด ${RESET_GUARD_LINE} — แก้สคริปต์นี้ให้ตรงกับไฟล์ reset`);
    }
    const connection = await connect();
    await connection.query(`CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${DATABASE_NAME}\``);
    await connection.query(fs.readFileSync(DEPLOY_SCHEMA_PATH, "utf8"));
    // ค่าเริ่มต้นจาก reset (role admin อัตราภาษี ฯลฯ) ลงวันที่ตั้งระบบในเรื่อง ไม่ใช่วันที่รันสคริปต์
    await connection.query("SET time_zone = '+07:00'");
    await connection.query("SET TIMESTAMP = ?", [Date.UTC(2026, 3, 1, 1, 0, 0) / 1000]);
    await connection.query(resetSql.replace(RESET_GUARD_LINE, `SET @confirm_database = '${DATABASE_NAME}';`));
    await connection.end();
}

async function dropDatabase() {
    const connection = await connect();
    await connection.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``);
    await connection.end();
}

// ─── 3. ส่งออก SQL ────────────────────────────────────────────────────────────────────────
const SQL_HEADER = `-- ════════════════════════════════════════════════════════════════════════════════
-- ข้อมูลจำลองทั้งระบบของ Softwork (สร้างอัตโนมัติด้วย backend: npm run mock:export · ห้ามแก้ด้วยมือ)
-- บริษัทสมมติ "ซอฟต์เวิร์ก ดิเวลลอปเมนท์" กระบี่ ทำงานจริง เม.ย.–ต.ค. 2026: ขาย จัดซื้อ โปรเจกต์ บุคคล ลงเวลา เงินเดือน
-- รายละเอียด: docs/plans/2026-10-24-mock-data.md
-- ════════════════════════════════════════════════════════════════════════════════
-- ⚠ ทุกบัญชีรหัสผ่าน 12345678 (admin hatsanai siriporn thanawat kamonchanok wannipa nattapon piyapong
--   supawadee chonthicha kittisak weerayut apichart) · ลงบนเว็บที่เปิดสาธารณะ = ใครรู้ชื่อผู้ใช้ก็เข้าได้
--   ใช้สาธิตช่วงสั้นๆ แล้วรัน database/reset_all_data.sql ทันที
-- ข้อมูลบุคคล บริษัทคู่ค้า เลขบัตร เลขบัญชี เป็นของสมมติทั้งหมด (เลข 13 หลักผ่านสูตรตรวจ แต่ไม่ใช่ของใคร)
--
-- ก่อนรัน:
--   1. สำรองฐานข้อมูล · โครงสร้างต้องล่าสุด (รัน database/query/deploy_schema.sql)
--   2. รัน database/reset_all_data.sql ก่อน — ไฟล์นี้ยอมลงเฉพาะฐานที่เหลือแค่ admin (กันทับข้อมูลจริง)
--   3. @confirm_database ด้านล่าง = ชื่อฐานที่จะลง (ค่าเริ่มต้น production) · ฐานอื่นแก้ชื่อบรรทัดเดียว
-- หลังรัน:
--   - คัดลอก database/mock_uploads/uploads/* ไป backend/uploads/ และ database/mock_uploads/storage/* ไป backend/storage/
--     (บน Plesk อัปโหลดผ่าน File Manager) — ไม่คัดลอก = รูปและไฟล์แนบแตก
--   - วันที่ในข้อมูลตายตัวถึงวันที่สร้างไฟล์ · หลังจากนั้นหน้าลงเวลาจะขึ้น "ขาด" เพราะไม่มีการกด → สร้างไฟล์ใหม่ถ้าต้องการให้ถึงวันปัจจุบัน
-- ════════════════════════════════════════════════════════════════════════════════

SET NAMES utf8mb4;
SET time_zone = '+07:00';

SET @confirm_database = '${PRODUCTION_DATABASE}';
SELECT IF(DATABASE() = @confirm_database, 1, (SELECT 1 UNION SELECT 2)) AS database_confirmed;
-- ยอมเฉพาะฐานที่เพิ่ง reset (ผู้ใช้ 1 คน · ไม่มีลูกค้า) — ไม่ผ่าน = หยุดที่ "Subquery returns more than 1 row"
SELECT IF((SELECT COUNT(*) FROM tb_users) = 1 AND (SELECT COUNT(*) FROM tb_clients) = 0, 1, (SELECT 1 UNION SELECT 2)) AS database_is_fresh;

SET FOREIGN_KEY_CHECKS = 0;
SET UNIQUE_CHECKS = 0;
`;

async function exportSql() {
    const connection = await connect({
        database: DATABASE_NAME,
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
        jsonStrings: true,
        timezone: "+07:00",
    });
    await connection.query("SET time_zone = '+07:00'");
    const [tables] = await connection.query(
        "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
        [DATABASE_NAME],
    );
    const [generated] = await connection.query(
        "SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND (EXTRA LIKE '%VIRTUAL GENERATED%' OR EXTRA LIKE '%STORED GENERATED%')",
        [DATABASE_NAME],
    );
    const generatedColumns = new Set(generated.map((row) => `${row.table_name}.${row.column_name}`));

    const parts = [SQL_HEADER, "-- ─── ล้างทุกตาราง (ค่าเริ่มต้นจาก reset ถูกแทนด้วยชุดของข้อมูลจำลอง) ───"];
    for (const { name } of tables) parts.push(`TRUNCATE TABLE \`${name}\`;`);

    const rowCounts = new Map();
    const uploadPaths = new Set();
    for (const { name } of tables) {
        const [rows, fields] = await connection.query(`SELECT * FROM \`${name}\``);
        rowCounts.set(name, rows.length);
        if (rows.length === 0) continue;
        const columns = fields.map((field) => field.name).filter((column) => !generatedColumns.has(`${name}.${column}`));
        const columnList = columns.map((column) => `\`${column}\``).join(", ");
        parts.push(`\n-- ${name} (${rows.length} แถว)`);
        for (let start = 0; start < rows.length; start += ROWS_PER_INSERT) {
            const values = rows.slice(start, start + ROWS_PER_INSERT).map((row) => {
                for (const column of columns) {
                    const value = row[column];
                    if (typeof value === "string" && value.startsWith("/uploads/")) uploadPaths.add(value);
                }
                return `(${columns.map((column) => connection.escape(row[column])).join(", ")})`;
            });
            parts.push(`INSERT INTO \`${name}\` (${columnList}) VALUES\n${values.join(",\n")};`);
        }
    }

    parts.push("\nSET UNIQUE_CHECKS = 1;\nSET FOREIGN_KEY_CHECKS = 1;");
    parts.push(
        "\n-- ─── ตรวจผล ───\nSELECT (SELECT COUNT(*) FROM tb_users) AS users, (SELECT COUNT(*) FROM tb_employees) AS employees,\n" +
            "       (SELECT COUNT(*) FROM tb_quotations) AS quotations, (SELECT COUNT(*) FROM tb_invoices) AS invoices,\n" +
            "       (SELECT COUNT(*) FROM tb_attendance_punches) AS punches, (SELECT COUNT(*) FROM tb_payroll_runs) AS payroll_runs;\n",
    );
    fs.writeFileSync(OUTPUT_SQL_PATH, parts.join("\n"));
    await connection.end();
    return { rowCounts, uploadPaths };
}

// ─── 4. ไฟล์ ──────────────────────────────────────────────────────────────────────────────
function copyFiles(uploadPaths) {
    fs.rmSync(OUTPUT_FILES_DIR, { recursive: true, force: true });
    const missing = [];
    for (const uploadPath of uploadPaths) {
        const relative = uploadPath.replace(/^\/uploads\//, "");
        const source = path.join(UPLOADS_DIR, relative);
        if (!fs.existsSync(source)) {
            missing.push(uploadPath);
            continue;
        }
        const target = path.join(OUTPUT_FILES_DIR, "uploads", relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(source, target);
    }
    for (const file of listFiles(STORAGE_DIR)) {
        const target = path.join(OUTPUT_FILES_DIR, "storage", path.relative(STORAGE_DIR, file));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(file, target);
    }
    return { copied: listFiles(OUTPUT_FILES_DIR).length, missing };
}

async function main() {
    if (process.env.DB_NAME === PRODUCTION_DATABASE) throw new Error("ห้ามรันบนฐาน production");
    const startedAt = Date.now();
    const uploadsBefore = new Set(listFiles(UPLOADS_DIR));
    console.log(`1/4 สร้างฐานชั่วคราว ${DATABASE_NAME} (deploy_schema + reset_all_data)`);
    await createDatabase();
    try {
        console.log("2/4 ใส่ข้อมูลบริษัทผ่าน API (ราว 5-10 นาที)");
        // ระบบพิมพ์ log ทุกคำขอ (morgan) หลายพันบรรทัด — ซ่อนไว้ ให้เห็นเฉพาะความคืบหน้ารายเดือนและข้อผิดพลาด
        const requestLogLine = /^[0-9a-f-]{36} (GET|POST|PUT|PATCH|DELETE) /;
        const writeToConsole = process.stdout.write.bind(process.stdout);
        process.stdout.write = (chunk, ...rest) => (requestLogLine.test(String(chunk)) ? true : writeToConsole(chunk, ...rest));
        const { seedCompany } = require("../seed-company-data");
        await seedCompany();

        console.log(`3/4 ส่งออก ${path.relative(path.join(BACKEND_DIR, ".."), OUTPUT_SQL_PATH)}`);
        const { rowCounts, uploadPaths } = await exportSql();
        console.log("4/4 คัดลอกไฟล์ที่ข้อมูลอ้างถึง → database/mock_uploads/");
        const files = copyFiles(uploadPaths);

        const totalRows = [...rowCounts.values()].reduce((sum, count) => sum + count, 0);
        const sizeMb = (fs.statSync(OUTPUT_SQL_PATH).size / 1024 / 1024).toFixed(1);
        console.log(`\nเสร็จใน ${elapsed(startedAt)} · ${rowCounts.size} ตาราง ${totalRows.toLocaleString()} แถว · ${sizeMb} MB · ไฟล์ ${files.copied} ไฟล์`);
        const empty = [...rowCounts].filter(([table, count]) => count === 0 && !ALLOWED_EMPTY_TABLES.has(table)).map(([table]) => table);
        if (empty.length > 0) console.log(`⚠ ตารางที่ยังไม่มีข้อมูล (${empty.length}): ${empty.join(" ")}`);
        if (files.missing.length > 0) console.log(`⚠ ข้อมูลอ้างไฟล์ที่ไม่มีอยู่ (${files.missing.length}): ${files.missing.join(" ")}`);
    } finally {
        if (process.env.KEEP_DB === "1") {
            // เปิดดูหน้าเว็บบนฐานนี้ได้ (รูปยังอยู่ใน backend/uploads · ลายเซ็น/ไฟล์แนบส่วนตัวอยู่ใน mock_uploads/storage)
            console.log(`เก็บฐาน ${DATABASE_NAME} และไฟล์ใน backend/uploads ไว้ตาม KEEP_DB=1 (ลบเองทีหลัง)`);
        } else {
            for (const file of listFiles(UPLOADS_DIR)) {
                if (!uploadsBefore.has(file)) fs.rmSync(file, { force: true });
            }
            await dropDatabase();
        }
        fs.rmSync(path.dirname(STORAGE_DIR), { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error("\nหยุด:", error.message);
    process.exit(1);
});
