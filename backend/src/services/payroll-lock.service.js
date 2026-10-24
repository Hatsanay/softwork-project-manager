// ล็อกเดือนที่ปิดรอบเงินเดือนแล้ว (R-H7) — ใช้กับลงเวลา ลา OT กะ และคำขอแก้เวลา
// แยกจาก payroll.service.js (2026-10-24 ลงเวลา A-4): รอบเงินเดือนเรียกลงเวลา และลงเวลาเรียกล็อกนี้ — ถ้าอยู่ไฟล์เดียวกันจะ require วนกัน
// payroll.service.js ส่งต่อ (re-export) ฟังก์ชันชุดนี้ไว้เหมือนเดิม
const { AppError } = require("../utils/app-error");

const CLOSED_STATUSES = ["approved", "paid"];

/**
 * เดือนที่รอบเงินเดือนอนุมัติ/จ่ายแล้ว จากวันที่ที่ส่งมา
 * @param {string[]} dates "YYYY-MM-DD"
 * @returns {Promise<string[]>} "YYYY-MM" ที่ล็อก
 */
async function findClosedPeriods(conn, dates) {
    const periods = [...new Set(dates.filter(Boolean).map((date) => date.slice(0, 7)))];
    if (periods.length === 0) return [];
    const [rows] = await conn.query(
        "SELECT DISTINCT pr_period FROM tb_payroll_runs WHERE pr_period IN (?) AND pr_status IN (?) ORDER BY pr_period",
        [periods, CLOSED_STATUSES],
    );
    return rows.map((row) => row.pr_period);
}

/**
 * ห้ามแก้ข้อมูลที่อยู่ในเดือนที่ปิดรอบเงินเดือนแล้ว
 * @param {string[]} dates
 * @param {string} what เช่น "ลงเวลา"
 */
async function assertPeriodsOpen(conn, dates, what) {
    const closed = await findClosedPeriods(conn, dates);
    if (closed.length === 0) return;
    throw new AppError(
        409,
        "PAYROLL_PERIOD_CLOSED",
        `${what}ในเดือน ${closed.join(", ")} แก้ไม่ได้ เพราะรอบเงินเดือนของเดือนนั้นอนุมัติแล้ว · ถ้าผิดให้แจ้งฝ่ายบุคคลปรับในรอบถัดไป`,
    );
}

module.exports = { CLOSED_STATUSES, findClosedPeriods, assertPeriodsOpen };
