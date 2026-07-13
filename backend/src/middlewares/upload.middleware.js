const multer = require("multer");

// เก็บเป็น buffer ในหน่วยความจำแทนการเขียนไฟล์ดิบลงดิสก์ตรงๆ
// เพราะ controller ต้อง resize/compress ด้วย sharp ก่อนค่อยเขียนไฟล์จริง
const storage = multer.memoryStorage();

function imageFileFilter(req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
        return cb(new Error("อนุญาตเฉพาะไฟล์รูปภาพ"));
    }
    cb(null, true);
}

const uploadImage = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

module.exports = { uploadImage };
