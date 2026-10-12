require("dotenv").config();

// ไม่มี JWT_SECRET = ออก/ตรวจ token ไม่ได้ทั้งระบบ ให้หยุดตั้งแต่ตอนเริ่ม ดีกว่าไปพังตอนมีคน login
if (!process.env.JWT_SECRET) {
    console.error("ไม่ได้ตั้งค่า JWT_SECRET ใน .env — หยุดการทำงาน");
    process.exit(1);
}
if (process.env.JWT_SECRET === "change_me" || process.env.JWT_SECRET.length < 32) {
    console.warn("[security] JWT_SECRET สั้นหรือเป็นค่าตัวอย่าง ควรเปลี่ยนเป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร");
}

const app = require("./app");
const { startLogRetention } = require("./utils/logRetention");
const { checkDatabaseSchema } = require("./utils/schema-check");
const { nowBangkokText } = require("./utils/bangkok-time");
const pool = require("./config/db");

const PORT = process.env.PORT || 3003;
const MAX_CLOCK_DIFFERENCE_SECONDS = 120;

startLogRetention();

// พิมพ์ timezone ของ Node และฐานข้อมูลทุกครั้งที่เริ่มระบบ (2026-10-12, risk-fixes R2)
// ใช้ยืนยันบน production ว่าเวลาที่โค้ดคิดเป็น "เวลาไทย" ตรงกับเวลาของฐานข้อมูลจริง — ต่างกันเกิน 2 นาที = มีอะไรตั้งผิด
async function logTimeSettings() {
    const [[database]] = await pool.query(
        `SELECT @@session.time_zone AS sessionZone, @@system_time_zone AS systemZone,
                DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s') AS databaseNow`
    );
    const nodeTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const codeBangkokNow = nowBangkokText();
    console.log(
        `[time] Node timezone: ${nodeTimeZone} (TZ=${process.env.TZ ?? "ไม่ได้ตั้ง"}) · เวลาไทยตามโค้ด: ${codeBangkokNow} · ` +
        `ฐานข้อมูล: session ${database.sessionZone}, ระบบ ${database.systemZone}, NOW() = ${database.databaseNow}`
    );

    const differenceSeconds = Math.abs(Date.parse(codeBangkokNow) - Date.parse(database.databaseNow)) / 1000;
    if (differenceSeconds > MAX_CLOCK_DIFFERENCE_SECONDS) {
        console.warn(`[time] เวลาไทยของโค้ดกับ NOW() ของฐานข้อมูลต่างกัน ${Math.round(differenceSeconds)} วินาที — ตรวจการตั้งค่า timezone`);
    }
}

app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);

    try {
        await pool.query("SELECT 1");
        console.log(`เชื่อมฐานข้อมูล "${process.env.DB_NAME}" สำเร็จ`);
    } catch (err) {
        console.error(`เชื่อมฐานข้อมูล "${process.env.DB_NAME}" ไม่สำเร็จ:`, err.message);
        return;
    }

    try {
        await logTimeSettings();
        await checkDatabaseSchema();
    } catch (err) {
        console.error("[startup] ตรวจเวลา/โครงสร้างฐานข้อมูลไม่สำเร็จ:", err.message);
    }
});
