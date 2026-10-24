// สวิตช์ลงชั่วโมงต่อโปรเจกต์ (2026-10-23) — ผู้ใช้สั่งปิด ใช้ลงเวลาเข้า-ออกแทน · เปิดกลับได้ที่ตั้งค่าบุคคล (Q6 ข)
// แยกไฟล์เพื่อให้ ลงชั่วโมง · ลา · รอบเงินเดือน · ภาพรวม เรียกได้โดยไม่ require วนกัน
// ปิดแล้ว: บันทึก/ส่ง/อนุมัติ/ตีกลับไม่ได้ · ไม่ขึ้นในรออนุมัติ/ภาพรวม · รอบเงินเดือนไม่เตือน · ลาไม่ตรวจชั่วโมงที่ลงไว้
// ข้อมูลเก่ายังอยู่และเปิดดูได้ (ต้นทุนโปรเจกต์เดือนที่ผ่านมาไม่เปลี่ยน)
const { AppError } = require("../utils/app-error");

async function isTimesheetEnabled(conn) {
    const [[settings]] = await conn.query("SELECT ps_timesheet_enabled FROM tb_payroll_settings WHERE ps_id = 1");
    return settings?.ps_timesheet_enabled === 1;
}

async function assertTimesheetEnabled(conn) {
    if (await isTimesheetEnabled(conn)) return;
    throw new AppError(
        409,
        "TIMESHEET_DISABLED",
        "ปิดการลงชั่วโมงต่อโปรเจกต์แล้ว (ใช้ลงเวลาเข้า-ออกงานแทน) · เปิดกลับได้ที่ ตั้งค่าบุคคล > เวลาทำงาน",
    );
}

module.exports = { isTimesheetEnabled, assertTimesheetEnabled };
