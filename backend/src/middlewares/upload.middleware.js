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

module.exports = { uploadImage, uploadDocument };
