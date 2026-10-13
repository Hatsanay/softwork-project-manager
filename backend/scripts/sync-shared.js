// คัดลอกโค้ดที่ใช้ร่วมกัน backend/src/shared/**/*.mjs → frontend/lib/shared/ (2026-10-13, CODING_GUIDELINES หัวข้อ 3.12)
//
// ต้นฉบับอยู่ฝั่ง backend เสมอ — แก้ที่ backend แล้วรัน `npm run sync-shared` (จากโฟลเดอร์ backend)
// สำเนาฝั่ง frontend ต้อง commit ด้วย เพราะ Plesk build หน้าเว็บจากโฟลเดอร์ frontend อย่างเดียว
// ลืมรัน = test/shared-copies.test.js พัง
// ไฟล์ .mjs ในปลายทางที่ไม่มีต้นฉบับแล้ว (ลบ/เปลี่ยนชื่อ) จะถูกลบทิ้งด้วย · รวมโฟลเดอร์ย่อย เช่น schemas/

const fs = require("fs");
const path = require("path");
const { listSharedFiles, SOURCE_FOLDER, COPY_FOLDER } = require("./shared-files");

const sourceFiles = listSharedFiles(SOURCE_FOLDER);
for (const relativePath of sourceFiles) {
    const targetPath = path.join(COPY_FOLDER, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(SOURCE_FOLDER, relativePath), targetPath);
    console.log(`คัดลอก ${relativePath}`);
}

for (const relativePath of listSharedFiles(COPY_FOLDER)) {
    if (sourceFiles.includes(relativePath)) continue;
    fs.unlinkSync(path.join(COPY_FOLDER, relativePath));
    console.log(`ลบ ${relativePath} (ไม่มีต้นฉบับแล้ว)`);
}
