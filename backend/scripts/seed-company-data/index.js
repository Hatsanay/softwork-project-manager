// ใส่ข้อมูลบริษัทแบบใช้งานจริงลงฐาน dev (ผู้ใช้สั่ง 18 ต.ค. 2026)
//
// ใช้: 1) รัน database/reset_all_data.sql บนฐาน dev (เหลือแค่ admin + ค่าเริ่มต้น)
//      2) cd backend && node scripts/seed-company-data                          (ชุดบริษัทที่จดแล้ว)
//         cd backend && node scripts/seed-company-data --set pre-incorporation  (ชุดช่วงก่อนจด · P-4 2026-10-25)
// ทำไฟล์ข้อมูลจำลอง database/mock_data.sql: npm run mock:export (scripts/mock-data/export.js เรียก seedCompany บนฐานชั่วคราว)
//
// - ยิงผ่าน API ของระบบจริงทั้งหมด (เลขเอกสาร การอนุมัติ ยอดเงิน snapshot ถูกตามกติกา) — รัน backend ในตัวสคริปต์เอง
// - นาฬิกาจำลอง: เดินเหตุการณ์ทีละเดือนตั้งแต่ เม.ย. 2026 ถึงวันนี้ เอกสารจึงได้วันที่/เลขที่ของเดือนนั้นจริง
// - ทุกบัญชีใช้รหัสผ่าน 12345678 (เฉพาะเครื่อง dev)
// - ไม่รันบนฐาน production และไม่รันบนฐานที่มีข้อมูลอยู่แล้ว (ต้อง reset ก่อน)
const path = require("path");
const BACKEND_DIR = path.join(__dirname, "..", "..");
require("dotenv").config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });
// ห้ามส่งอีเมลแจ้งเตือนจริงและห้ามเรียก ธปท. ระหว่างใส่ข้อมูล (แบบเดียวกับเทสต์)
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.BOT_API_KEY = "";
process.env.BOT_API_URL = "";

const { installClock, resetClock } = require("./clock");
installClock();

const PASSWORD = "12345678";
const PRODUCTION_DATABASES = new Set(["dktimeh_softwork_pm_db"]);

/**
 * ใส่ข้อมูลทั้งหมดลงฐานตาม process.env.DB_NAME (ต้องเป็นฐานที่เพิ่ง reset)
 * @param {{ set?: "company" | "pre-incorporation" }} [options]
 */
async function seedCompany({ set = "company" } = {}) {
    if (PRODUCTION_DATABASES.has(process.env.DB_NAME)) {
        throw new Error(`ฐาน ${process.env.DB_NAME} เป็นฐาน production — สคริปต์นี้ใช้กับเครื่อง dev เท่านั้น`);
    }
    // ส่งลิงก์ติดตามงานให้ลูกค้า (ฟีเจอร์อีเมลล้วน) — แทนตัวส่งด้วยตัวที่ไม่ส่งจริง ให้ API ตอบสำเร็จและเกิดประวัติใน audit log
    // ต้องแทนก่อน require app (controller ดึงฟังก์ชันไปเก็บตอนโหลด) · ห้ามส่งอีเมลจริงจากสคริปต์นี้เด็ดขาด
    require("../../src/utils/mailer").sendClientShareLinkEmail = async () => {};
    const app = require("../../src/app");
    const pool = require("../../src/config/db");
    const { generateDailyId } = require("../../src/utils/generateDailyId");
    const { PERMISSION_KEYS } = require("../../src/shared/permissions.mjs");
    const { configureApi } = require("./api");
    const { setupCompany } = require("./setup");
    const { runTimeline } = require("./timeline");
    const { setToday, attachMysqlClock } = require("./clock");
    attachMysqlClock(pool);

    const [[{ users }]] = await pool.query("SELECT COUNT(*) AS users FROM tb_users");
    const [[{ clients }]] = await pool.query("SELECT COUNT(*) AS clients FROM tb_clients");
    if (Number(users) !== 1 || Number(clients) !== 0) {
        throw new Error("ฐานนี้มีข้อมูลอยู่แล้ว — รัน database/reset_all_data.sql ก่อน (ต้องเหลือแค่ผู้ใช้ admin)");
    }

    const server = await new Promise((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
    });
    configureApi(`http://127.0.0.1:${server.address().port}`, PASSWORD);
    console.log(`ฐานข้อมูล ${process.env.DB_NAME} · เริ่มใส่ข้อมูล`);

    try {
        if (set === "pre-incorporation") {
            const { seedPreIncorporation } = require("./pre-incorporation");
            await seedPreIncorporation({ pool, permissionKeys: PERMISSION_KEYS, generateDailyId, password: PASSWORD });
        } else {
            setToday("2026-04-01", 9);
            const ids = await setupCompany({ pool, permissionKeys: PERMISSION_KEYS, generateDailyId, password: PASSWORD });
            console.log("✓ ตั้งค่าบริษัท ผู้ใช้ พนักงาน ลูกค้า ผู้ขาย สินค้า");
            await runTimeline({ ids, pool });
        }
    } finally {
        // audit log บันทึกหลังตอบคำขอ — รอให้เขียนเสร็จก่อนปิดการเชื่อมต่อฐานข้อมูล
        await new Promise((resolve) => setTimeout(resolve, 1500));
        resetClock();
        server.close();
        await pool.end();
    }
    console.log("เสร็จ · เข้าระบบได้ทุกบัญชีด้วยรหัสผ่าน 12345678 (admin, hatsanai, nattapon …)");
}

if (require.main === module) {
    const { setFromArgs } = require("../mock-data/sets");
    seedCompany({ set: setFromArgs().name }).catch((error) => {
        console.error("\nหยุด:", error.message);
        process.exit(1);
    });
}

module.exports = { seedCompany, PASSWORD };
