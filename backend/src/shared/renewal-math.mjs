// ─── คิดรอบของบริการรายรอบ (2026-10-31 · docs/plans/2026-10-31-recurring-services.md ข้อ 7) ─────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// วันที่เป็นข้อความ "YYYY-MM-DD" (วันที่ตามเวลาไทยอยู่แล้ว) · คิดด้วย Date.UTC ไม่ขึ้นกับเขตเวลาเครื่อง
// วันครบใช้ anchorDay เสมอ: 31 ม.ค. → 28 ก.พ. → 31 มี.ค. (ไม่บวกต่อจากวันที่ถูกตัด ไม่เลื่อนเป็น 28 ไปตลอด)

/** รอบที่เลือกได้ (เดือน) */
export const RENEWAL_CYCLES = [1, 3, 6, 12, 24];

const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_CYCLE_STEPS = 1200;

function parts(dateText) {
    const match = DATE_TEXT.exec(dateText ?? "");
    if (!match) throw new Error(`วันที่ไม่ถูกต้อง: ${dateText}`);
    return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

const pad = (value) => String(value).padStart(2, "0");
const toText = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;

/** จำนวนวันของเดือน (month 1-12) */
export function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * วันครบรอบถัดไป: เลื่อน months เดือน แล้วใช้วันที่ anchorDay (เดือนสั้นกว่า = วันสุดท้ายของเดือน)
 * @param {string} dateText วันเริ่มรอบนี้
 * @param {number} months รอบ (เดือน)
 * @param {number} anchorDay วันที่ของเดือนที่ครบ 1-31
 */
export function addCycle(dateText, months, anchorDay) {
    const { year, month } = parts(dateText);
    const monthIndex = month - 1 + months;
    const nextYear = year + Math.floor(monthIndex / 12);
    const nextMonth = (monthIndex % 12) + 1;
    return toText(nextYear, nextMonth, Math.min(anchorDay, daysInMonth(nextYear, nextMonth)));
}

/** เลื่อนวันที่ทีละวัน (บวก/ลบ) */
export function shiftDays(dateText, days) {
    const { year, month, day } = parts(dateText);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));
    return toText(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** จำนวนวันจาก fromDate ถึง toDate (ติดลบ = toDate อยู่ก่อน) */
export function daysBetweenDates(fromDate, toDate) {
    const from = parts(fromDate);
    const to = parts(toDate);
    return Math.round(
        (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000,
    );
}

/**
 * ช่วงบริการของรอบที่เริ่ม start: สิ้นสุด = วันก่อนรอบถัดไปเริ่ม (1 พ.ย. 2569 - 31 ต.ค. 2570)
 * @returns {{ start: string, end: string, next: string }}
 */
export function periodOf(start, months, anchorDay) {
    const next = addCycle(start, months, anchorDay);
    return { start, end: shiftDays(next, -1), next };
}

/**
 * วันเริ่มของรอบแรกหลัง start ที่ยังไม่มีรอบที่ออกแล้วครอบ (ออกช่องว่างที่ยกเลิกไปแล้ว วันครบกระโดดข้ามรอบที่ออกไว้แล้ว)
 * @param {Set<string>} billedStarts วันเริ่มของรอบที่ยังออกอยู่ (ไม่รวมที่ยกเลิก)
 */
export function nextOpenStart(start, months, anchorDay, billedStarts) {
    let candidate = addCycle(start, months, anchorDay);
    for (let step = 0; step < MAX_CYCLE_STEPS && billedStarts.has(candidate); step += 1) {
        candidate = addCycle(candidate, months, anchorDay);
    }
    return candidate;
}

/** วันที่ของเดือนจากวันที่ (ใช้ตั้ง anchorDay ตอนเพิ่ม/แก้วันครบ) */
export function anchorDayOf(dateText) {
    return parts(dateText).day;
}

/** ชื่อรอบที่คนอ่าน: 1 → "ทุกเดือน" · 12 → "ทุกปี" · 24 → "ทุก 2 ปี" */
export function cycleLabel(months) {
    if (months === 1) return "ทุกเดือน";
    if (months === 12) return "ทุกปี";
    if (months % 12 === 0) return `ทุก ${months / 12} ปี`;
    return `ทุก ${months} เดือน`;
}

/** หน่วยรอบสั้น: "เดือน" · "ปี" · "3 เดือน" · "2 ปี" (ใช้ต่อท้ายราคา "650.00 บาท/ปี") */
export function cycleUnit(months) {
    if (months === 1) return "เดือน";
    if (months === 12) return "ปี";
    if (months % 12 === 0) return `${months / 12} ปี`;
    return `${months} เดือน`;
}
