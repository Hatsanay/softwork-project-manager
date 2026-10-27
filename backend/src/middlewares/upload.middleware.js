const multer = require("multer");

// เก็บเป็น buffer ในหน่วยความจำแทนการเขียนไฟล์ดิบลงดิสก์ตรงๆ
// เพราะ controller ต้อง resize/compress ด้วย sharp ก่อนค่อยเขียนไฟล์จริง
const storage = multer.memoryStorage();

function imageFileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
        const err = new Error("อนุญาตเฉพาะไฟล์รูปภาพ");
        err.isUploadValidation = true; // errorHandler ตอบ 400 แทน 500
        return cb(err);
    }
    cb(null, true);
}

const uploadImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10 MB ต่อไฟล์, สูงสุด 5 ไฟล์ต่อ request
});

// เอกสารแนบ (PDF/รูป) เช่น ใบ 50 ทวิ — ไฟล์เดียวต่อคำขอ · ชนิดไฟล์ตรวจจากเนื้อไฟล์อีกชั้นใน utils/private-file.js
function documentFileFilter(req, file, cb) {
    const isAllowed = file.mimetype === "application/pdf" || file.mimetype === "image/jpeg" || file.mimetype === "image/png";
    if (!isAllowed) {
        const err = new Error("อนุญาตเฉพาะไฟล์ PDF, JPG หรือ PNG");
        err.isUploadValidation = true;
        return cb(err);
    }
    cb(null, true);
}

const uploadDocument = multer({
    storage,
    fileFilter: documentFileFilter,
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

// ไฟล์แนบของคำตอบในลิงก์เลือกบริการ (2026-10-25) — หลายคำถาม คำถามละไม่เกิน 5 ไฟล์ (ตรวจใน service)
// 2026-10-26 Q-1: ข้อที่ตั้งรับไฟล์งานออกแบบรับ AI PSD SVG ZIP ไฟล์ละ 20 MB · ด่านนี้กรองหยาบจากชนิด/นามสกุล
// ข้อไหนรับอะไร ขนาดต่อข้อ และขนาดรวม ตรวจใน service (รู้ชนิดของแต่ละคำถาม) · ชนิดจริงตรวจจากเนื้อไฟล์อีกชั้นตอนบันทึก
const ORDER_FILE_MIME_TYPES = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/svg+xml",
    "image/vnd.adobe.photoshop",
    "application/postscript",
    "application/illustrator",
    "application/zip",
    "application/x-zip-compressed",
    "application/octet-stream",
];
const ORDER_FILE_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "ai", "psd", "svg", "zip"];

function orderFileFilter(req, file, cb) {
    const extension = String(file.originalname ?? "").split(".").pop().toLowerCase();
    const isAllowed = ORDER_FILE_MIME_TYPES.includes(file.mimetype) && ORDER_FILE_EXTENSIONS.includes(extension);
    if (!isAllowed) {
        const err = new Error("อนุญาตเฉพาะไฟล์ PDF JPG PNG หรือไฟล์งานออกแบบ AI PSD SVG ZIP");
        err.isUploadValidation = true;
        return cb(err);
    }
    cb(null, true);
}

const uploadOrderFiles = multer({
    storage,
    fileFilter: orderFileFilter,
    limits: { fileSize: 20 * 1024 * 1024, files: 15 },
});

module.exports = { uploadImage, uploadDocument, uploadOrderFiles };
