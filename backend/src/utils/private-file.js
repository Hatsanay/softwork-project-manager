// ไฟล์เอกสารที่ห้ามเปิดด้วยลิงก์สาธารณะ (2026-10-15 ขั้น 1C — แบบระบบ 2026-10-15-receipts-1c.md R-C9)
//
// เช่น ใบ 50 ทวิ มีเลขผู้เสียภาษีของลูกค้า — เก็บที่ backend/storage/<โฟลเดอร์>/ (ที่เดียวกับไฟล์ลายเซ็น) ซึ่ง
// **ไม่ผ่าน express.static** เปิดได้ทาง API ที่ตรวจสิทธิ์เท่านั้น · ชื่อไฟล์สุ่ม (เดาไม่ได้) · ตรวจชนิดจากเนื้อไฟล์จริง
// backend/storage/ ไม่เข้า git (.gitignore) และไม่ถูกลบตอน deploy · สำรองข้อมูลต้องรวมโฟลเดอร์นี้ · เทสต์ชี้ไปโฟลเดอร์ชั่วคราว
// ได้ด้วย DOCUMENT_STORAGE_DIR
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { AppError } = require("./app-error");

const DEFAULT_STORAGE_DIR = path.join(__dirname, "..", "..", "storage");

function storageDir() {
    return process.env.DOCUMENT_STORAGE_DIR?.trim() || DEFAULT_STORAGE_DIR;
}

// ลายเซ็นต้นไฟล์ (magic bytes) ของชนิดที่รับ
const FILE_TYPES = [
    {
        extension: "pdf",
        contentType: "application/pdf",
        matches: (buffer) => buffer.subarray(0, 5).toString("latin1") === "%PDF-",
    },
    {
        extension: "jpg",
        contentType: "image/jpeg",
        matches: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
    },
    {
        extension: "png",
        contentType: "image/png",
        matches: (buffer) =>
            buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    },
];

/**
 * ชนิดไฟล์จากเนื้อไฟล์ — ไม่ใช่ชนิดที่รับ = null
 * @param {Buffer} buffer
 */
function detectFileType(buffer) {
    if (!buffer || buffer.length < 8) return null;
    return FILE_TYPES.find((type) => type.matches(buffer)) ?? null;
}

/**
 * บันทึกไฟล์ลงโฟลเดอร์ส่วนตัว
 * @param {string} folder เช่น "wht"
 * @param {string} prefix ต้นชื่อไฟล์ เช่น รหัสใบเสร็จ (ช่วยหาไฟล์ตอนกู้ข้อมูล)
 * @param {Buffer} buffer
 * @param {string} fieldName ชื่อช่องในฟอร์ม (ใช้ในข้อความ error)
 * @returns {Promise<string>} path ที่เก็บใน DB เช่น "wht-certificates/RCP202610150000001-3f9a…c2.pdf" (สัมพัทธ์กับ storage/)
 */
async function savePrivateFile(folder, prefix, buffer, fieldName) {
    const fileType = detectFileType(buffer);
    if (!fileType) {
        throw new AppError(400, "VALIDATION", "ไฟล์ต้องเป็น PDF, JPG หรือ PNG", {
            [fieldName]: "ใช้ไฟล์ PDF, JPG หรือ PNG (ไฟล์ที่เปลี่ยนนามสกุลเองใช้ไม่ได้)",
        });
    }
    const filename = `${prefix}-${crypto.randomBytes(12).toString("hex")}.${fileType.extension}`;
    await fs.mkdir(path.join(storageDir(), folder), { recursive: true });
    await fs.writeFile(path.join(storageDir(), folder, filename), buffer);
    return `${folder}/${filename}`;
}

/**
 * path เต็มบนดิสก์จากค่าใน DB — กันค่าที่พาออกนอกโฟลเดอร์ storage (../)
 * @param {string} storedPath
 * @returns {string | null}
 */
function resolvePrivateFile(storedPath) {
    if (!storedPath) return null;
    const root = path.resolve(storageDir());
    const fullPath = path.resolve(root, storedPath);
    if (!fullPath.startsWith(root + path.sep)) return null;
    return fullPath;
}

/** ชนิดเนื้อหาจากนามสกุลที่ระบบตั้งเอง */
function contentTypeOf(storedPath) {
    const extension = path.extname(storedPath ?? "").slice(1);
    return FILE_TYPES.find((type) => type.extension === extension)?.contentType ?? "application/octet-stream";
}

const MAX_FILE_NAME_LENGTH = 200;

/**
 * ชื่อไฟล์เดิมที่ผู้ใช้อัปโหลด — multer อ่านชื่อเป็น latin1 (ชื่อไทยเพี้ยน) จึงแปลงกลับเป็น UTF-8 ถ้าแปลงได้สะอาด
 * ตัดตัวอักษรควบคุม/ตัวคั่น path ออก (ใช้แค่แสดงผลและตั้งชื่อตอนดาวน์โหลด)
 * @param {string} rawName
 * @param {string} fallback ชื่อที่ใช้เมื่อไม่เหลืออะไร
 */
function cleanUploadedFileName(rawName, fallback) {
    const decoded = Buffer.from(rawName ?? "", "latin1").toString("utf8");
    const name = decoded.includes("�") ? (rawName ?? "") : decoded;
    const safe = name.replace(/[\u0000-\u001f\u007f/\\]/g, "").trim();
    return (safe || fallback).slice(0, MAX_FILE_NAME_LENGTH);
}

/** ลบไฟล์ (ไม่มีอยู่แล้วก็ไม่เป็นไร) — เรียกหลัง DB บันทึกสำเร็จเท่านั้น */
async function deletePrivateFile(storedPath) {
    const fullPath = resolvePrivateFile(storedPath);
    if (!fullPath) return;
    await fs.rm(fullPath, { force: true });
}

module.exports = {
    savePrivateFile,
    resolvePrivateFile,
    deletePrivateFile,
    contentTypeOf,
    detectFileType,
    cleanUploadedFileName,
};
