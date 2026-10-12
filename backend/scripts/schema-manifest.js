// สร้าง src/schema-manifest.json จาก database/query/deploy_schema.sql (2026-10-12, risk-fixes R16)
//
// backend ใช้ไฟล์นี้ตรวจตอนเริ่มระบบว่าฐานข้อมูลมีตาราง/คอลัมน์ครบตามโค้ดเวอร์ชันนี้หรือยัง (utils/schema-check.js)
// ต้องสร้างเป็นไฟล์แยก เพราะตอน deploy ส่งขึ้น Plesk เฉพาะโฟลเดอร์ backend/ — โฟลเดอร์ database/ ไม่ได้ตามไปด้วย
//
// แก้ deploy_schema.sql แล้วต้องรัน `npm run schema:manifest` ทุกครั้ง
// (ลืม = test/schema-manifest.test.js ล้ม บอกให้รันคำสั่งนี้)

const fs = require("fs");
const path = require("path");

const DEPLOY_SCHEMA_PATH = path.join(__dirname, "..", "..", "database", "query", "deploy_schema.sql");
const MANIFEST_PATH = path.join(__dirname, "..", "src", "schema-manifest.json");

const CREATE_TABLE_LINE = /^CREATE TABLE IF NOT EXISTS `(\w+)` \($/;
const COLUMN_LINE = /^\s+`(\w+)`\s/;
const END_OF_TABLE_LINE = /^\)/;

// อ่านเฉพาะบล็อก CREATE TABLE ในส่วนที่ 1 — กติกาของ deploy_schema.sql บังคับว่าเพิ่มคอลัมน์ต้องแก้ CREATE TABLE ด้วยเสมอ
// บรรทัดที่ไม่ได้ขึ้นต้นด้วย `ชื่อคอลัมน์` (PRIMARY KEY, KEY, CONSTRAINT ...) ข้ามไป
function parseDeploySchema(sqlText) {
    const tables = {};
    let currentTable = null;

    for (const line of sqlText.split(/\r?\n/)) {
        if (currentTable === null) {
            const createMatch = line.match(CREATE_TABLE_LINE);
            if (createMatch) {
                currentTable = createMatch[1];
                tables[currentTable] = [];
            }
            continue;
        }

        if (END_OF_TABLE_LINE.test(line)) {
            tables[currentTable].sort();
            currentTable = null;
            continue;
        }

        const columnMatch = line.match(COLUMN_LINE);
        if (columnMatch) tables[currentTable].push(columnMatch[1]);
    }

    return { tables: sortObjectKeys(tables) };
}

function sortObjectKeys(object) {
    const sorted = {};
    for (const key of Object.keys(object).sort()) sorted[key] = object[key];
    return sorted;
}

function buildManifestText() {
    const sqlText = fs.readFileSync(DEPLOY_SCHEMA_PATH, "utf8");
    const manifest = parseDeploySchema(sqlText);
    return JSON.stringify(manifest, null, 4) + "\n";
}

if (require.main === module) {
    const text = buildManifestText();
    fs.writeFileSync(MANIFEST_PATH, text);
    const tableCount = Object.keys(JSON.parse(text).tables).length;
    console.log(`เขียน ${path.relative(process.cwd(), MANIFEST_PATH)} แล้ว (${tableCount} ตาราง)`);
}

module.exports = { parseDeploySchema, buildManifestText, MANIFEST_PATH };
