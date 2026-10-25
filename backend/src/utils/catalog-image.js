// รูปสินค้า/ชุดสินค้าบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25)
//
// ลูกค้าเปิดบนมือถือเป็นหลัก → ย่อด้านยาวไม่เกิน 1200 พิกเซล เก็บเป็น WebP (เล็ก โหลดเร็ว) · ตรวจชนิดจากเนื้อไฟล์ ไม่รับ SVG
// ไฟล์เก่าไม่ลบ (กันรูปหายจากหน้าที่ลูกค้าเปิดค้างอยู่)
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { AppError } = require("./app-error");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const FOLDER = "catalog";
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const MAX_SIZE = 1200;

/**
 * @param {Buffer} buffer ไฟล์จาก multer
 * @returns {Promise<string>} path เช่น "/uploads/catalog/item-1760000000000-ab12cd.webp"
 */
async function saveCatalogImage(buffer) {
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        metadata = null;
    }
    if (!metadata || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new AppError(400, "VALIDATION", "รูปต้องเป็นไฟล์ PNG, JPG หรือ WebP", { image: "ใช้ไฟล์ PNG, JPG หรือ WebP" });
    }
    const data = await sharp(buffer)
        .rotate()
        .resize({ width: MAX_SIZE, height: MAX_SIZE, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    const filename = `item-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.webp`;
    await fs.mkdir(path.join(UPLOADS_DIR, FOLDER), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, FOLDER, filename), data);
    return `/uploads/${FOLDER}/${filename}`;
}

module.exports = { saveCatalogImage };
