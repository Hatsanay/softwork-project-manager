const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// กันการถอยหลังของบั๊กวันที่เลื่อน 1 วันบน production (2026-10-12, risk-fixes R2)
// getter เหล่านี้คืนค่าตาม timezone ของเครื่อง — ใช้ผ่าน src/utils/bangkok-time.js เท่านั้น
const LOCAL_DATE_GETTER = /\.(getFullYear|getMonth|getDate|getDay|getHours|getMinutes)\(/;
const SOURCE_DIR = path.join(__dirname, "..", "src");
const ALLOWED_FILES = new Set([path.join(SOURCE_DIR, "utils", "bangkok-time.js")]);

function listJavaScriptFiles(directory) {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...listJavaScriptFiles(fullPath));
        else if (/\.(js|ts)$/.test(entry.name)) files.push(fullPath);
    }
    return files;
}

test("โค้ดใน src/ ไม่อ่านวันที่/เวลาจากนาฬิกาของเครื่องตรงๆ (ใช้ bangkok-time แทน)", () => {
    const violations = [];
    for (const file of listJavaScriptFiles(SOURCE_DIR)) {
        if (ALLOWED_FILES.has(file)) continue;
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        lines.forEach((line, index) => {
            if (LOCAL_DATE_GETTER.test(line)) violations.push(`${path.relative(SOURCE_DIR, file)}:${index + 1}  ${line.trim()}`);
        });
    }
    assert.deepEqual(violations, [], `พบการอ่านวันที่จากเวลาเครื่อง ให้ใช้ src/utils/bangkok-time.js แทน:\n${violations.join("\n")}`);
});
