// ตรวจตอนเริ่มระบบว่าฐานข้อมูลมีตาราง/คอลัมน์ครบตามโค้ดเวอร์ชันนี้ (2026-10-12, risk-fixes R16)
//
// กันเหตุการณ์ "deploy โค้ดใหม่แล้วลืมรัน deploy_schema.sql" ซึ่งเดิมจะไปพังกลางทางเป็น error 500 ที่ไม่บอกอะไร
// ตรวจแล้วขาด: log บอกชัดว่าขาดอะไร + error middleware ตอบ 503 พร้อมบอกให้รัน deploy_schema.sql (ไม่หยุดระบบ
// เพราะหน้าอื่นที่ไม่ได้ใช้ตารางใหม่ยังใช้งานได้)
// รายการที่ต้องมีมาจาก src/schema-manifest.json ซึ่งสร้างจาก deploy_schema.sql (scripts/schema-manifest.js)

const pool = require("../config/db");
const manifest = require("../schema-manifest.json");

const MAX_ITEMS_IN_LOG = 15;

let status = { isChecked: false, isOutdated: false, missing: [] };

function findMissingColumns(existingColumns) {
    const missing = [];
    for (const [table, columns] of Object.entries(manifest.tables)) {
        for (const column of columns) {
            if (!existingColumns.has(`${table}.${column}`.toLowerCase())) missing.push(`${table}.${column}`);
        }
    }
    return missing;
}

async function checkDatabaseSchema() {
    const [rows] = await pool.query(
        "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()"
    );
    const existingColumns = new Set(rows.map((row) => `${row.tableName}.${row.columnName}`.toLowerCase()));
    const missing = findMissingColumns(existingColumns);

    status = { isChecked: true, isOutdated: missing.length > 0, missing };

    if (status.isOutdated) {
        const shown = missing.slice(0, MAX_ITEMS_IN_LOG).join(", ");
        const more = missing.length > MAX_ITEMS_IN_LOG ? ` และอีก ${missing.length - MAX_ITEMS_IN_LOG} รายการ` : "";
        console.error(
            `[schema] ฐานข้อมูลยังไม่อัปเดตให้ตรงกับโค้ดเวอร์ชันนี้ — ขาด ${missing.length} รายการ: ${shown}${more}\n` +
            "[schema] รัน database/query/deploy_schema.sql บนฐานข้อมูลนี้ แล้ว restart backend"
        );
    } else {
        console.log("[schema] โครงสร้างฐานข้อมูลครบตามโค้ดเวอร์ชันนี้");
    }
    return status;
}

function getSchemaStatus() {
    return status;
}

module.exports = { checkDatabaseSchema, getSchemaStatus, findMissingColumns };
