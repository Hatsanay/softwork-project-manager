// ─── วันที่แบบไทยสั้น "26 ต.ค. 2569" ─────────────────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// รับวันที่ "YYYY-MM-DD" (วันที่ตามเวลาไทยอยู่แล้ว) · ไม่แปลงเขตเวลา ไม่ใช้ Date ของเครื่อง
// ใช้ในข้อความที่ backend ประกอบให้ (เช่น "ต่อไปต้องทำ" ของโปรเจกต์ 2026-10-31)

const SHORT_MONTHS = [
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
];
const DATE_TEXT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {string | null | undefined} dateText "YYYY-MM-DD"
 * @returns {string} "26 ต.ค. 2569" · ว่าง/ผิดรูปแบบ = "-"
 */
export function thaiShortDate(dateText) {
    const match = DATE_TEXT.exec(dateText ?? "");
    if (!match) return "-";
    const [, year, month, day] = match;
    const monthName = SHORT_MONTHS[Number(month) - 1];
    if (!monthName) return "-";
    return `${Number(day)} ${monthName} ${Number(year) + 543}`;
}
