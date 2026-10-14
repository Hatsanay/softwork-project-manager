// รูปร่างของคำตอบ API = ชื่อฟิลด์ + ชนิดข้อมูล โดยไม่สนค่าจริง (2026-10-13)
//
// ใช้ตรวจว่าการย้าย backend เป็น TypeScript (และการแก้ใหญ่ครั้งต่อๆ ไป) ไม่ได้เปลี่ยนสิ่งที่หน้าเว็บได้รับ
// เช่น ฟิลด์หาย ชื่อเปลี่ยน หรือยอดเงิน DECIMAL ที่เคยเป็นสตริงกลายเป็นตัวเลข
// รายการ (array) ดูแค่ชิ้นแรก — ทุกชิ้นในรายการเดียวกันมีรูปร่างเหมือนกัน

const fs = require("fs");
const path = require("path");

const MAX_DEPTH = 4;
const SNAPSHOT_PATH = path.join(__dirname, "..", "snapshots", "api-shapes.json");

// object ที่ใช้ id เป็นชื่อฟิลด์ (เช่น { ISS20261013xxxxxxx: [...] }) — id มีวันที่ฝังอยู่ เปลี่ยนทุกวันที่รันเทสต์
// แทนด้วยชื่อกลาง ":id" ให้ต้นแบบเหมือนเดิมทุกวัน (เดิมเทสต์พังเมื่อรันข้ามวัน)
function shapeKey(key) {
    return /^[A-Z]{3}\d{15}$/.test(key) ? ":id" : key;
}

function describeShape(value, depth = 0) {
    if (value === null) return "null";
    if (Array.isArray(value)) {
        if (value.length === 0) return [];
        return [describeShape(value[0], depth + 1)];
    }
    if (typeof value === "object") {
        if (depth >= MAX_DEPTH) return "object";
        const shape = {};
        for (const key of Object.keys(value).sort()) shape[shapeKey(key)] = describeShape(value[key], depth + 1);
        return shape;
    }
    return typeof value;
}

function readSnapshot() {
    if (!fs.existsSync(SNAPSHOT_PATH)) return null;
    return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, "utf8"));
}

function writeSnapshot(results) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(results, null, 4) + "\n");
}

module.exports = { describeShape, readSnapshot, writeSnapshot, SNAPSHOT_PATH };
