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

/**
 * วันทำงานในช่วงวันที่ (รวมหัวท้าย) — วันในสัปดาห์ที่ตั้งเป็นวันทำงาน ไม่รวมวันหยุดบริษัท (ใช้คิดวันลา — ขั้น 4-3)
 * @param {string} startDate "YYYY-MM-DD"
 * @param {string} endDate "YYYY-MM-DD" (ต้องไม่ก่อน startDate)
 * @param {string} workingWeekdays 7 ตัว จันทร์→อาทิตย์
 * @param {Set<string>} holidayDates
 * @returns {string[]}
 */
export function workingDatesBetween(startDate, endDate, workingWeekdays, holidayDates) {
    const dates = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
        const isWorkingWeekday = workingWeekdays[weekdayIndex(date)] === "1";
        if (isWorkingWeekday && !holidayDates.has(date)) dates.push(date);
    }
    return dates;
}

/**
 * จำนวนวันระหว่างสองวัน (ไม่รวมวันแรก) — "2026-01-01" ถึง "2026-01-02" = 1
 * @param {string} fromDate
 * @param {string} toDate
 */
export function daysBetween(fromDate, toDate) {
    const toTime = (dateText) => {
        const [year, month, day] = dateText.split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    };
    return Math.round((toTime(toDate) - toTime(fromDate)) / 86_400_000);
}

// ─── รอบเงินเดือน (ขั้น 4-4) — แบบระบบหัวข้อ 4.3 · ตัวเลขทุกตัวรอนักบัญชียืนยัน (Y1–Y4) ───────────────────────────

const PERCENT_RATE_DIVISOR = 10_000n; // อัตรา % เก็บเป็น 1/100 (5.00% = 500n) และหาร 100 อีกชั้น

/**
 * จำนวนวันในเดือน
 * @param {string} yearMonth "YYYY-MM"
 */
export function daysInMonth(yearMonth) {
    const [year, month] = yearMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * ยอดตามสัดส่วนวัน (เข้า/ออกกลางเดือน · ขึ้นเงินเดือนกลางเดือน) = Σ (ยอดต่อเดือน × วัน) ÷ วันในเดือน — หารครั้งเดียว (Y4)
 * @param {Array<{ amount: bigint, days: number }>} parts ยอดต่อเดือนของแต่ละช่วง + จำนวนวันปฏิทินของช่วง
 * @param {number} totalDays วันในเดือน
 * @returns {bigint} สตางค์
 */
export function prorateByDays(parts, totalDays) {
    const numerator = parts.reduce((sum, part) => sum + part.amount * BigInt(part.days), 0n);
    return divideRoundHalfUp(numerator, BigInt(totalDays));
}

/**
 * หักลาไม่รับค่าจ้าง = Σ (เงินเดือน ณ วันที่ลา × หน่วยวัน) ÷ ตัวหาร (Y3: 30 หรือวันทำงานของเดือน)
 * @param {Array<{ salary: bigint, dayUnits: bigint }>} leaveDays dayUnits หน่วย 1/100 วัน (เต็มวัน 100n · ครึ่งวัน 50n)
 * @param {number} divisor
 * @returns {bigint} สตางค์
 */
export function unpaidLeaveDeductionOf(leaveDays, divisor) {
    if (divisor <= 0) return 0n;
    const numerator = leaveDays.reduce((sum, day) => sum + day.salary * day.dayUnits, 0n);
    return divideRoundHalfUp(numerator, BigInt(divisor) * 100n);
}

/**
 * ภาษีเงินได้บุคคลธรรมดาขั้นบันไดจากเงินได้สุทธิทั้งปี — คิดเต็มแล้วปัดครั้งเดียว
 * @param {bigint} netIncome สตางค์
 * @param {Array<{ from: string, rate: string }>} brackets ขั้นแรกเริ่ม 0 · rate เป็น % เช่น "5.00"
 * @returns {bigint} สตางค์
 */
export function incomeTaxOf(netIncome, brackets) {
    if (netIncome <= 0n) return 0n;
    const steps = brackets
        .map((bracket) => ({
            from: parseHundredths(bracket.from, "ขั้นภาษี"),
            rate: parseHundredths(bracket.rate, "อัตราภาษี"),
        }))
        .sort((first, second) => (first.from < second.from ? -1 : 1));
    let numerator = 0n;
    steps.forEach((step, index) => {
        if (netIncome <= step.from) return;
        const upper = steps[index + 1]?.from ?? netIncome;
        const top = netIncome < upper ? netIncome : upper;
        numerator += (top - step.from) * step.rate;
    });
    return divideRoundHalfUp(numerator, PERCENT_RATE_DIVISOR);
}

/**
 * เงินได้สุทธิทั้งปี = เงินได้ − ค่าใช้จ่าย (ร้อยละ ไม่เกินเพดาน) − ลดหย่อน − ประกันสังคมที่จ่าย (ไม่ติดลบ)
 * @param {{ annualIncome: bigint, expenseRate: string, expenseCap: string, allowances: bigint, ssoAnnual: bigint }} input
 * @returns {bigint}
 */
export function annualNetIncomeOf({ annualIncome, expenseRate, expenseCap, allowances, ssoAnnual }) {
    const expense = divideRoundHalfUp(
        annualIncome * parseHundredths(expenseRate, "อัตราหักค่าใช้จ่าย"),
        PERCENT_RATE_DIVISOR,
    );
    const cap = parseHundredths(expenseCap, "เพดานหักค่าใช้จ่าย");
    const net = annualIncome - (expense < cap ? expense : cap) - allowances - ssoAnnual;
    return net > 0n ? net : 0n;
}

/**
 * ภาษีหัก ณ ที่จ่ายเดือนนี้ (H9) = (ภาษีทั้งปี − ที่หักแล้ว) ÷ เดือนที่เหลือรวมเดือนนี้ · เดือนสุดท้าย = ส่วนที่เหลือทั้งหมด (true-up)
 * ติดลบ = 0 (หักเกินไปแล้ว — คืนตอนยื่นภาษีเอง)
 * @param {{ annualTax: bigint, withheldBefore: bigint, remainingMonths: number }} input remainingMonths ≥ 1
 * @returns {bigint}
 */
export function monthlyWithholdingOf({ annualTax, withheldBefore, remainingMonths }) {
    const outstanding = annualTax - withheldBefore;
    if (outstanding <= 0n) return 0n;
    if (remainingMonths <= 1) return outstanding;
    return divideRoundHalfUp(outstanding, BigInt(remainingMonths));
}

// ─── ลงเวลาในรอบเงินเดือน (ลงเวลา A-4 · 2026-10-24) — รอนักบัญชียืนยัน (Y6/Y7) ─────────────────────────

/**
 * ค่าจ้างตามนาทีพร้อมอัตรา = Σ (เงินเดือน × นาที) × อัตรา ÷ (30 × ชั่วโมงต่อวัน × 60)
 * ค่าจ้างต่อชั่วโมงของพนักงานรายเดือน = เงินเดือน ÷ 30 ÷ ชั่วโมงทำงานต่อวัน (พ.ร.บ.คุ้มครองแรงงาน ม.68)
 * ใช้ทั้งหักสาย/ออกก่อน (อัตรา 1.00 = เวลาที่ไม่ได้ทำงานจริง ไม่ใช่ค่าปรับ · ม.76) และ OT (1.50 / 1.00 / 3.00)
 * รวมทุกวันแล้วปัดครั้งเดียว — เงินเดือนเปลี่ยนกลางเดือนใช้อัตราของแต่ละวัน
 * @param {Array<{ salary: bigint, minutes: number }>} parts เงินเดือน (สตางค์) ณ วันนั้น + นาที
 * @param {string} rateText เท่า เช่น "1.50"
 * @param {string} hoursPerDayText ชั่วโมงทำงานต่อวัน เช่น "8.00"
 * @returns {bigint} สตางค์
 */
export function minuteWageOf(parts, rateText, hoursPerDayText) {
    const rate = parseHundredths(rateText, "อัตรา");
    const hoursPerDay = parseHundredths(hoursPerDayText, "ชั่วโมงทำงานต่อวัน");
    if (hoursPerDay <= 0n) return 0n;
    const numerator = parts.reduce((sum, part) => sum + part.salary * BigInt(part.minutes), 0n) * rate;
    return divideRoundHalfUp(numerator, 30n * hoursPerDay * 60n);
}
