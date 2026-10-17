// ─── คำนวณเวลาทำงานมาตรฐาน / ประกันสังคม / ค่าแรงต่อชั่วโมง (เฟส 4) ─────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// เงินเป็น BigInt สตางค์ (money.mjs) · ชั่วโมงเป็น BigInt หน่วย 1/100 ชั่วโมง (8.25 ชม. = 825n) — ไม่ผ่าน float
// วันที่เป็นข้อความ "YYYY-MM-DD" ตามเวลาไทย คำนวณด้วย UTC ล้วน (ไม่ขึ้นกับเขตเวลาของเครื่อง)
// แบบระบบ: docs/plans/2026-10-17-people-payroll-4.md หัวข้อ 4.2 (ต้นทุนค่าแรง) และ 4.3 (ประกันสังคม)

import { divideRoundHalfUp, parseHundredths } from "./money.mjs";

const PERCENT_HUNDREDTHS = 10_000n; // อัตรา % เป็นสตางค์ (×100) และหาร 100 อีกชั้น
const SATANG_PER_BAHT = 100n;

/**
 * เพิ่ม/ลดวันจากวันที่ข้อความ
 * @param {string} dateText "YYYY-MM-DD"
 * @param {number} dayCount
 * @returns {string}
 */
export function addDays(dateText, dayCount) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

/**
 * ลำดับวันในสัปดาห์แบบ จันทร์ = 0 … อาทิตย์ = 6 (ตรงกับตัวอักษรใน ps_working_weekdays)
 * @param {string} dateText
 */
export function weekdayIndex(dateText) {
    const [year, month, day] = dateText.split("-").map(Number);
    const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    return (sundayFirst + 6) % 7;
}

/**
 * วันจันทร์ของสัปดาห์ที่วันนั้นอยู่
 * @param {string} dateText
 */
export function weekStartOf(dateText) {
    return addDays(dateText, -weekdayIndex(dateText));
}

/**
 * 7 วันของสัปดาห์ (จันทร์ → อาทิตย์)
 * @param {string} weekStart วันจันทร์
 * @returns {string[]}
 */
export function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

/**
 * วันทำงานของเดือน = วันในสัปดาห์ที่ตั้งเป็นวันทำงาน ไม่รวมวันหยุดบริษัท
 * @param {string} yearMonth "YYYY-MM"
 * @param {string} workingWeekdays 7 ตัว จันทร์→อาทิตย์ เช่น "1111100"
 * @param {Set<string>} holidayDates
 * @returns {string[]}
 */
export function workingDatesOfMonth(yearMonth, workingWeekdays, holidayDates) {
    const [year, month] = yearMonth.split("-").map(Number);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dates = [];
    for (let day = 1; day <= dayCount; day++) {
        const dateText = `${yearMonth}-${String(day).padStart(2, "0")}`;
        const isWorkingWeekday = workingWeekdays[weekdayIndex(dateText)] === "1";
        if (isWorkingWeekday && !holidayDates.has(dateText)) dates.push(dateText);
    }
    return dates;
}

/**
 * ชั่วโมงทำงานมาตรฐานของเดือน (หน่วย 1/100 ชม.) = วันทำงาน × ชั่วโมงต่อวัน (H10)
 * @param {number} workingDayCount
 * @param {string} hoursPerDay ทศนิยม เช่น "8.00"
 * @returns {bigint}
 */
export function standardHoursOf(workingDayCount, hoursPerDay) {
    return BigInt(workingDayCount) * parseHundredths(hoursPerDay, "ชั่วโมงต่อวัน");
}

/**
 * เงินสมทบประกันสังคมต่อเดือน = ฐานค่าจ้าง (จำกัดขั้นต่ำ–เพดาน) × อัตรา ปัดเป็นบาทเต็ม (ครึ่งบาทขึ้น)
 * ⚠ วิธีปัดรอนักบัญชียืนยัน (คำถาม Y1)
 * @param {bigint} wage ค่าจ้างของเดือน (สตางค์)
 * @param {{ rate: string, floor: string, ceiling: string }} ssoRate
 * @returns {bigint} สตางค์ (ลงตัวเป็นบาท)
 */
export function ssoContributionOf(wage, { rate, floor, ceiling }) {
    if (wage <= 0n) return 0n;
    const wageFloor = parseHundredths(floor, "ฐานค่าจ้างขั้นต่ำ");
    const wageCeiling = parseHundredths(ceiling, "ฐานค่าจ้างสูงสุด");
    let base = wage;
    if (base < wageFloor) base = wageFloor;
    if (base > wageCeiling) base = wageCeiling;
    const contribution = divideRoundHalfUp(base * parseHundredths(rate, "อัตรา"), PERCENT_HUNDREDTHS);
    return divideRoundHalfUp(contribution, SATANG_PER_BAHT) * SATANG_PER_BAHT;
}

/**
 * ค่าแรงของชั่วโมงที่ลง = ต้นทุนทั้งเดือน × ชั่วโมงที่ลง ÷ ชั่วโมงมาตรฐาน (หารครั้งเดียว ปัดเศษน้อยที่สุด)
 * ชั่วโมงมาตรฐาน 0 (เช่น เดือนที่ไม่มีวันทำงาน) → 0 — ทั้งหมดเป็นต้นทุนส่วนกลาง (R-H11)
 * @param {bigint} monthlyCost สตางค์
 * @param {bigint} hours หน่วย 1/100 ชม.
 * @param {bigint} standardHours หน่วย 1/100 ชม.
 * @returns {bigint} สตางค์
 */
export function laborCostOf(monthlyCost, hours, standardHours) {
    if (standardHours <= 0n) return 0n;
    return divideRoundHalfUp(monthlyCost * hours, standardHours);
}
