const crypto = require("crypto");

// URL-safe random token สำหรับ /share/[token] — ต้องเดาไม่ได้ เพราะเป็นเดียวที่กันไม่ให้คนนอกเข้าดูโปรเจกต์
function generateShareToken() {
    return crypto.randomBytes(24).toString("base64url"); // 32 ตัวอักษร
}

module.exports = { generateShareToken };
