const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { buildManifestText, parseDeploySchema, MANIFEST_PATH } = require("../scripts/schema-manifest");
const { findMissingColumns } = require("../src/utils/schema-check");

test("src/schema-manifest.json ตรงกับ deploy_schema.sql ล่าสุด", () => {
    const committed = fs.readFileSync(MANIFEST_PATH, "utf8").replace(/\r\n/g, "\n");
    assert.equal(committed, buildManifestText(), "deploy_schema.sql เปลี่ยนแล้วแต่ยังไม่ได้สร้าง manifest ใหม่ · รัน `npm run schema:manifest`");
});

test("อ่านเฉพาะชื่อคอลัมน์ ข้ามบรรทัด KEY/CONSTRAINT", () => {
    const sql = [
        "CREATE TABLE IF NOT EXISTS `tb_example` (",
        "  `ex_id` varchar(18) NOT NULL,",
        "  `ex_name` varchar(50) NOT NULL,",
        "  PRIMARY KEY (`ex_id`),",
        "  KEY `idx_ex_name` (`ex_name`),",
        "  CONSTRAINT `fk_ex` FOREIGN KEY (`ex_id`) REFERENCES `tb_other` (`id`)",
        ") ENGINE=InnoDB;",
    ].join("\r\n");
    assert.deepEqual(parseDeploySchema(sql), { tables: { tb_example: ["ex_id", "ex_name"] } });
});

test("ตรวจพบคอลัมน์ที่ฐานข้อมูลยังไม่มี (เทียบไม่สนตัวพิมพ์เล็ก-ใหญ่)", () => {
    const existing = new Set(["tb_users.user_id".toLowerCase()]);
    const missing = findMissingColumns(existing);
    assert.ok(missing.includes("tb_users.user_email"));
    assert.ok(!missing.includes("tb_users.user_id"));
});
