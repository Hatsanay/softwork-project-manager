// บันทึกรูปพนักงาน (สำหรับบัตรพนักงาน — 2026-10-18)
// ตรวจชนิดไฟล์จากเนื้อไฟล์จริง · ตัดเป็นสัดส่วนรูปติดบัตร 3:4 (ตรงกลางภาพ) · ย่อเหลือ 600×800 · JPEG
// ไฟล์เก่าไม่ลบ — บัตรที่ออกแล้วเก็บ path รูป ณ ตอนออกไว้ (พิมพ์ซ้ำได้หน้าตาเดิม)
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { AppError } = require("./app-error");

const UPLOADS_DIR = path.join(__dirname, "..", "..", "uploads");
const PHOTO_FOLDER = "employees";
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const PHOTO_WIDTH = 600;
const PHOTO_HEIGHT = 800;

/**
 * @param {Buffer} buffer ไฟล์จาก multer
 * @param {string} employeeId
 * @returns {Promise<string>} path เช่น "/uploads/employees/EMP...-1760000000000.jpg"
 */
async function saveEmployeePhoto(buffer, employeeId) {
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        metadata = null;
    }
    if (!metadata || !ALLOWED_FORMATS.has(metadata.format)) {
        throw new AppError(400, "VALIDATION", "รูปต้องเป็นไฟล์ JPG, PNG หรือ WebP", {
            photo: "ใช้ไฟล์ JPG, PNG หรือ WebP (รูปหน้าตรง)",
        });
    }
    const data = await sharp(buffer)
        .rotate() // หมุนตามข้อมูล EXIF ของรูปถ่ายจากมือถือ
        .resize({ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, fit: "cover", position: "attention" })
        .jpeg({ quality: 85 })
        .toBuffer();

    const filename = `${employeeId}-${Date.now()}.jpg`;
    await fs.mkdir(path.join(UPLOADS_DIR, PHOTO_FOLDER), { recursive: true });
    await fs.writeFile(path.join(UPLOADS_DIR, PHOTO_FOLDER, filename), data);
    return `/uploads/${PHOTO_FOLDER}/${filename}`;
}

module.exports = { saveEmployeePhoto };
