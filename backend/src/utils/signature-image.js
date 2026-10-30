// แปลงรูปลายเซ็นให้พร้อมพิมพ์บนเอกสาร (2026-10-13 ขั้น 1A-2 — sales-cycle หัวข้อ 6, risk-fixes R13)
//
// รับรูปถ่าย/สแกนลายเซ็นบนกระดาษขาว หรือรูปที่เซ็นบนจอ → พื้นขาวกลายเป็นโปร่งใส คงสีหมึกเดิม (หมึกน้ำเงินยังเป็นน้ำเงิน)
// → ตัดขอบว่างรอบลายเซ็น → ย่อให้พอดีช่องเซ็นบน A4 → เก็บ PNG แบบไม่เสียรายละเอียด (ไม่ใช้ AVIF/JPEG ที่ทำขอบเบลอ)
// ตรวจชนิดไฟล์จากเนื้อไฟล์จริง (sharp อ่าน header) ไม่เชื่อนามสกุล · ไม่รับ SVG (ฝังสคริปต์ได้)
const sharp = require("sharp");
const { AppError } = require("./app-error");

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const WORKING_SIZE = { width: 1600, height: 800 }; // ย่อรูปถ่ายใหญ่ก่อนประมวลผล (เร็วขึ้น ไม่เสียความคมที่ขนาดพิมพ์)
const OUTPUT_SIZE = { width: 600, height: 240 }; // ช่องเซ็นบน A4 กว้างราว 5 ซม. — 600 พิกเซลพอที่ 300 dpi
// ความสว่างที่ถือว่าเป็น "กระดาษ" (โปร่งใสทั้งหมด) และ "หมึก" (ทึบทั้งหมด) — ระหว่างนั้นค่อยๆ จาง ขอบเส้นจึงเนียน
const PAPER_LUMINANCE = 215;
const INK_LUMINANCE = 120;
const MINIMUM_INK_PIXELS = 80;

function invalidImage(message) {
    return new AppError(400, "VALIDATION", message, { signature: message });
}

/**
 * @param {Buffer} buffer ไฟล์จาก multer
 * @returns {Promise<Buffer>} PNG พื้นโปร่งใส
 */
async function prepareSignatureImage(buffer) {
    let metadata;
    try {
        metadata = await sharp(buffer).metadata();
    } catch {
        metadata = null;
    }
    if (!metadata || !ALLOWED_FORMATS.has(metadata.format)) {
        throw invalidImage("ลายเซ็นต้องเป็นไฟล์ PNG, JPG หรือ WebP");
    }

    // รูปที่เซ็นบนจอมีพื้นโปร่งใส — วางบนพื้นขาวก่อน จะได้คิดแบบเดียวกับรูปถ่ายบนกระดาษ
    const { data, info } = await sharp(buffer)
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ ...WORKING_SIZE, fit: "inside", withoutEnlargement: true })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const pixelCount = info.width * info.height;
    const rgba = Buffer.alloc(pixelCount * 4);
    let inkPixels = 0;
    for (let pixel = 0; pixel < pixelCount; pixel += 1) {
        const red = data[pixel * 3];
        const green = data[pixel * 3 + 1];
        const blue = data[pixel * 3 + 2];
        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;

        let alpha = 0;
        if (luminance <= INK_LUMINANCE) {
            alpha = 255;
        } else if (luminance < PAPER_LUMINANCE) {
            alpha = Math.round(((PAPER_LUMINANCE - luminance) / (PAPER_LUMINANCE - INK_LUMINANCE)) * 255);
        }
        if (alpha > 0) inkPixels += 1;

        rgba[pixel * 4] = red;
        rgba[pixel * 4 + 1] = green;
        rgba[pixel * 4 + 2] = blue;
        rgba[pixel * 4 + 3] = alpha;
    }

    if (inkPixels < MINIMUM_INK_PIXELS) {
        throw invalidImage("ไม่พบลายเซ็นในรูป · ใช้รูปลายเซ็นหมึกเข้มบนกระดาษขาว หรือเซ็นบนจอใหม่");
    }

    // trim ต้องอ่านจาก PNG ที่มีอยู่จริง (ทำต่อจาก raw ในคำสั่งเดียวไม่ได้กับบางเวอร์ชันของ sharp)
    const transparentPng = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
        .png()
        .toBuffer();
    return sharp(transparentPng)
        .trim()
        .resize({ ...OUTPUT_SIZE, fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
}

module.exports = { prepareSignatureImage };
