const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error.middleware");
const { auditLog, maskSecretPath } = require("./middlewares/auditLog.middleware");

// require แบบกันพลาด — ถ้า deploy แล้วลืมกด NPM install บน Plesk ระบบยังรันได้ แค่ไม่บีบอัด response
let compression = null;
try {
    compression = require("compression");
} catch {
    console.warn("[app] ไม่พบแพ็กเกจ compression (ยังไม่ได้ npm install?) — ข้ามการบีบอัด response");
}

const app = express();

// production รันหลัง nginx/Passenger ของ Plesk หนึ่งชั้น — ให้ req.ip เป็น IP ของผู้เรียกจริงจาก X-Forwarded-For
// (ใช้กับ rate limit ของ login และ log การเข้าสู่ระบบ)
app.set("trust proxy", 1);
app.disable("x-powered-by");

// security headers พื้นฐาน — backend ตอบแค่ JSON กับไฟล์รูป ไม่มี HTML ให้ฝังหรือรันสคริปต์
app.use((req, res, next) => {
    res.set({
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; frame-ancestors 'none'",
        "Cross-Origin-Resource-Policy": "cross-origin", // ให้หน้า frontend (คนละโดเมน) โหลดรูปจาก /uploads ได้
    });
    next();
});

if (compression) app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
// ต้องอยู่หลังตัวอ่าน body (เก็บ payload ได้) และก่อน routes ทั้งหมด (อ่านค่า "ก่อนแก้" ได้ก่อน controller ทำงาน)
// ตั้ง req.id / header X-Request-Id ให้ทุกคำขอด้วย — ใช้ร้อย console log, audit log และ error log เข้าหากัน
app.use(auditLog);
morgan.token("id", (req) => req.id ?? "-");
morgan.token("safe-url", (req) => maskSecretPath(req.originalUrl)); // ไม่พิมพ์ token ลิงก์ลูกค้าลง console
app.use(morgan(":id :method :safe-url :status :response-time ms"));

// เสิร์ฟรูปที่อัปโหลดไว้ static ที่ /uploads/<subfolder>/<filename> ตรงกับ *_url ที่เก็บใน DB
// ชื่อไฟล์สุ่มใหม่ทุกครั้งที่อัปโหลด (ไม่เคยเขียนทับไฟล์เดิม) จึงให้ browser cache ได้ยาวและไม่ต้องถามซ้ำ
app.use(
    "/uploads",
    express.static(path.join(__dirname, "..", "uploads"), {
        maxAge: "30d",
        immutable: true,
        index: false,
        // Express รุ่นนี้ยังไม่รู้จัก .avif (ส่งเป็น application/octet-stream) — ร่วมกับ X-Content-Type-Options: nosniff
        // เบราว์เซอร์อาจไม่ยอมแสดงรูป จึงต้องบอกชนิดไฟล์เอง
        setHeaders: (res, filePath) => {
            if (filePath.endsWith(".avif")) res.setHeader("Content-Type", "image/avif");
        },
    })
);

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
