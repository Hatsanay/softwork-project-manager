// รายชื่อไฟล์โค้ดร่วม (.mjs) — ใช้ทั้งสคริปต์ sync-shared และเทสต์ที่ตรวจว่าสำเนาตรงกัน
const fs = require("fs");
const path = require("path");

const SOURCE_FOLDER = path.join(__dirname, "..", "src", "shared");
const COPY_FOLDER = path.join(__dirname, "..", "..", "frontend", "lib", "shared");

/**
 * ไฟล์ .mjs ทั้งหมดในโฟลเดอร์ (รวมโฟลเดอร์ย่อย) เป็น path แบบ "schemas/company.mjs" เรียงตามชื่อ
 * @param {string} folder
 * @returns {string[]}
 */
function listSharedFiles(folder) {
    if (!fs.existsSync(folder)) return [];
    return fs
        .readdirSync(folder, { recursive: true })
        .map((relativePath) => String(relativePath).split(path.sep).join("/"))
        .filter((relativePath) => relativePath.endsWith(".mjs"))
        .sort();
}

module.exports = { listSharedFiles, SOURCE_FOLDER, COPY_FOLDER };
