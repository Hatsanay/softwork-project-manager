// สำเนาใน frontend/lib/shared/ ต้องตรงกับต้นฉบับ backend/src/shared/ ทุกไบต์ — ถ้าพัง รัน `npm run sync-shared`
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { listSharedFiles, SOURCE_FOLDER, COPY_FOLDER } = require("../scripts/shared-files");

test("frontend มีสำเนาครบทุกไฟล์ และไม่มีไฟล์ค้างที่ต้นฉบับถูกลบไปแล้ว", () => {
    assert.deepEqual(listSharedFiles(COPY_FOLDER), listSharedFiles(SOURCE_FOLDER));
});

test("สำเนาตรงกับต้นฉบับทุกไบต์ (ห้ามแก้ที่สำเนา)", () => {
    for (const relativePath of listSharedFiles(SOURCE_FOLDER)) {
        const copyPath = path.join(COPY_FOLDER, relativePath);
        if (!fs.existsSync(copyPath)) continue; // เทสต์ข้างบนรายงานไฟล์ที่ขาดแล้ว
        const source = fs.readFileSync(path.join(SOURCE_FOLDER, relativePath), "utf8");
        const copy = fs.readFileSync(copyPath, "utf8");
        assert.equal(copy, source, `${relativePath} ไม่ตรงกับต้นฉบับ · รัน npm run sync-shared`);
    }
});
