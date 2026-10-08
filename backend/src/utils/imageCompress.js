const sharp = require("sharp");

// บีบอัดรูปที่ผู้ใช้อัปโหลด — ที่เดียวของทั้งระบบ (รูปโปรไฟล์ / รูปแนบปัญหา / รูปตอบกลับปัญหา / รูปในแชท)
//
// ใช้ AVIF แทน WebP (2026-10-08) — วัดจริงกับชุดรูปถ่าย + ภาพหน้าจอระบบ เทียบความคมชัดด้วย SSIM กับต้นฉบับ:
//   รูปถ่าย 1600px:     AVIF q52 = 64% ของ WebP q78 เดิม  · SSIM เฉลี่ย 0.9916 (เดิม 0.9895) ต่ำสุด 0.9806 (เดิม 0.9802)
//   ภาพหน้าจอ 1600px:   AVIF q47 = ~85% ของเดิม            · SSIM ไม่ต่ำกว่าเดิม (ตัวหนังสือคมเท่าเดิม)
//   รูปโปรไฟล์ 256px:   AVIF q52 = ~90% ของ WebP q70 เดิม  · SSIM 0.9864 (เดิม 0.9831)
// ภาพหน้าจอ/กราฟิกใช้คุณภาพต่ำกว่ารูปถ่ายได้โดยไม่เสียความคม เพราะพื้นที่สีเรียบบีบได้ดีกว่ามาก
// แยกประเภทจาก format ต้นฉบับ: PNG/GIF/SVG แทบทั้งหมดคือภาพหน้าจอ/กราฟิก ส่วน JPEG/HEIC/อื่นๆ คือรูปถ่าย
//
// effort 3 (จาก 0-9): ช้ากว่า WebP เดิมราว 0.2 วิ/รูป — effort 4 ขึ้นไปได้ไฟล์เล็กลงอีกแค่ 2-5% แต่ช้าลง 3-4 เท่า
// ไม่คุ้มสำหรับเซิร์ฟเวอร์ shared hosting ที่ต้องบีบรูปขณะผู้ใช้รออยู่
//
// AVIF แสดงได้ทุกเบราว์เซอร์หลักแล้ว (Chrome 85+, Firefox 93+, Safari 16.4+/iOS 16.4+)
// ถ้าเข้ารหัส AVIF ไม่สำเร็จด้วยเหตุใดก็ตาม (เช่น libvips บนเซิร์ฟเวอร์ไม่มีตัวเข้ารหัส) ถอยไปใช้ WebP แบบเดิม — อัปโหลดต้องไม่พัง

const PHOTO_QUALITY = 52;
const GRAPHIC_QUALITY = 47;
const AVIF_EFFORT = 3;
const GRAPHIC_FORMATS = new Set(["png", "gif", "svg"]);

/**
 * @param {Buffer} buffer  ไฟล์ต้นฉบับจาก multer (memoryStorage)
 * @param {{ maxSize?: number, square?: number }} options
 *   maxSize = ย่อให้ด้านยาวสุดไม่เกินค่านี้ (คงสัดส่วน ไม่ขยายรูปเล็ก) · square = ครอปเป็นสี่เหลี่ยมจัตุรัสขนาดนี้ (รูปโปรไฟล์)
 * @returns {Promise<{ data: Buffer, ext: "avif" | "webp" }>}
 */
async function compressImage(buffer, { maxSize = 1600, square } = {}) {
    const meta = await sharp(buffer).metadata();
    const isGraphic = GRAPHIC_FORMATS.has(meta.format);

    // .rotate() ไม่ใส่องศา = หมุนตาม EXIF orientation ของกล้อง/มือถือ ก่อนที่ sharp จะตัด metadata ทิ้งตอนเขียนไฟล์
    // (เดิมไม่มีบรรทัดนี้ รูปถ่ายแนวตั้งจากมือถือจึงขึ้นตะแคง)
    const base = () => {
        const img = sharp(buffer).rotate();
        return square
            ? img.resize(square, square, { fit: "cover" })
            : img.resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true });
    };

    try {
        const data = await base()
            .avif({ quality: isGraphic ? GRAPHIC_QUALITY : PHOTO_QUALITY, effort: AVIF_EFFORT })
            .toBuffer();
        return { data, ext: "avif" };
    } catch (err) {
        console.warn("[imageCompress] เข้ารหัส AVIF ไม่สำเร็จ ใช้ WebP แทน:", err.message);
        const data = await base().webp({ quality: square ? 70 : 78 }).toBuffer();
        return { data, ext: "webp" };
    }
}

module.exports = { compressImage };
