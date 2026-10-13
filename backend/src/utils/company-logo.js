// บันทึกไฟล์โลโก้บริษัท (2026-10-13)
//
// ต่างจากรูปทั่วไป (imageCompress → AVIF แบบบีบเสียรายละเอียด): โลโก้ไปอยู่บนเอกสารที่พิมพ์ จึงเก็บ PNG แบบไม่เสียรายละเอียด
// และคงพื้นโปร่งใส · ตรวจชนิดไฟล์จากเนื้อไฟล์จริง ไม่ใช่นามสกุล · ไม่รับ SVG (ฝังสคริปต์ได้)
// ไฟล์เก่าไม่ลบ — เอกสารที่อนุมัติแล้วเก็บ path โลโก้ ณ ตอนนั้นไว้
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { AppError } = require("./app-error");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const LOGO_FOLDER = "company";
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const MAX_LOGO_SIZE = 800; // พิกเซลด้านยาวสุด — พอสำหรับหัวกระดาษ A4 ที่ความละเอียดพิมพ์

/**
 * @param {Buffer} buffer ไฟล์จาก multer
 * @returns {Promise<string>} path สำหรับเก็บใน cs_logo_url เช่น "/uploads/company/logo-1760000000000.png"
 */
async function saveCompanyLogo(buffer) {
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        metadata = null;
    }
    if (!metadata || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new AppError(400, "VALIDATION", "โลโก้ต้องเป็นไฟล์ PNG, JPG หรือ WebP", {
            logo: "ใช้ไฟล์ PNG, JPG หรือ WebP (แนะนำ PNG พื้นโปร่งใส)",
        });
    }

    const data = await sharp(buffer)
        .rotate() // หมุนตามข้อมูล EXIF ของรูปถ่าย
        .resize({ width: MAX_LOGO_SIZE, height: MAX_LOGO_SIZE, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();

    const filename = `logo-${Date.now()}.png`;
    await fs.mkdir(path.join(UPLOADS_DIR, LOGO_FOLDER), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, LOGO_FOLDER, filename), data);
    return `/uploads/${LOGO_FOLDER}/${filename}`;
}

module.exports = { saveCompanyLogo };
