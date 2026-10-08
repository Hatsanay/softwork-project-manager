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
const pool = require("./config/db");

const PORT = process.env.PORT || 3003;

startLogRetention();

app.listen(PORT, async () => {
    console.log(`Backend running on http://localhost:${PORT}`);

    try {
        await pool.query("SELECT 1");
        console.log(`เชื่อมฐานข้อมูล "${process.env.DB_NAME}" สำเร็จ`);
    } catch (err) {
        console.error(`เชื่อมฐานข้อมูล "${process.env.DB_NAME}" ไม่สำเร็จ:`, err.message);
    }
});
