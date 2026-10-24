// กันลืม database/reset_all_data.sql (2026-10-24 · docs/plans/2026-10-24-mock-data.md ข้อ 4)
// - ทุกตารางใน deploy_schema.sql ต้องถูกล้าง · เพิ่มตารางใหม่แล้วไม่เติม TRUNCATE = เทสต์ล้ม
// - ข้อมูลเริ่มต้นต้องเหมือนส่วนที่ 5 ของ deploy_schema.sql ทุกคำสั่ง ยกเว้นรหัสผ่าน admin
//   (reset ใช้ 12345678 ให้สคริปต์ใส่ข้อมูลจำลอง login ได้ · deploy_schema ใช้ Admin@12345)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { parseDeploySchema } = require("../scripts/schema-manifest");

const DATABASE_DIR = path.join(__dirname, "..", "..", "database");
const deploySql = fs.readFileSync(path.join(DATABASE_DIR, "query", "deploy_schema.sql"), "utf8").replace(/\r\n/g, "\n");
const resetSql = fs.readFileSync(path.join(DATABASE_DIR, "reset_all_data.sql"), "utf8").replace(/\r\n/g, "\n");

/** โค้ด SQL ไม่รวมบรรทัดคอมเมนต์/บรรทัดว่าง · แถว admin ตัด hash รหัสผ่านออก */
function codeLinesOf(sqlText) {
    return sqlText
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"))
        .map((line) => line.replace(/'\$2a\$10\$[^']+'/, "'<password hash>'"));
}

function sectionBetween(sqlText, startMarker, endMarker) {
    const start = sqlText.indexOf(startMarker);
    const end = sqlText.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `หาช่วง "${startMarker}" ไม่เจอ`);
    return sqlText.slice(start, end);
}

test("reset_all_data.sql ล้างทุกตารางใน deploy_schema.sql (ไม่ขาด ไม่เกิน)", () => {
    const tables = Object.keys(parseDeploySchema(deploySql).tables).sort();
    const truncated = [...resetSql.matchAll(/^TRUNCATE TABLE `([^`]+)`;/gm)].map((match) => match[1]).sort();
    const missing = tables.filter((table) => !truncated.includes(table));
    const extra = truncated.filter((table) => !tables.includes(table));
    assert.deepEqual(missing, [], `ตารางที่ยังไม่ได้เติม TRUNCATE ใน database/reset_all_data.sql: ${missing.join(", ")}`);
    assert.deepEqual(extra, [], `TRUNCATE ตารางที่ไม่มีแล้ว: ${extra.join(", ")}`);
});

test("ข้อมูลเริ่มต้นใน reset_all_data.sql เหมือนส่วนที่ 5 ของ deploy_schema.sql", () => {
    const deployDefaults = codeLinesOf(sectionBetween(deploySql, "-- ─── ส่วนที่ 5", "-- ─── ส่วนที่ 6"));
    const resetDefaults = codeLinesOf(sectionBetween(resetSql, "-- ─── ส่วนที่ 5", "-- ─── 3. ตรวจผล"));
    assert.deepEqual(resetDefaults, deployDefaults, "แก้ส่วนที่ 5 ของ deploy_schema.sql แล้ว ให้คัดลอกไปที่ database/reset_all_data.sql ด้วย");
});

test("reset_all_data.sql ตรวจชื่อฐานก่อนลบ และใส่สกุลเงินก่อนส่วนที่ 5", () => {
    const guardIndex = resetSql.indexOf("SET @confirm_database");
    const firstTruncate = resetSql.indexOf("TRUNCATE TABLE");
    assert.ok(guardIndex >= 0 && guardIndex < firstTruncate, "บรรทัดตรวจชื่อฐานต้องอยู่ก่อน TRUNCATE");
    assert.ok(resetSql.indexOf("INSERT INTO tb_currencies") < resetSql.indexOf("-- ─── ส่วนที่ 5"));
});
