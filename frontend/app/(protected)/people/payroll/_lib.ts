// ตัวช่วยของหน้ารอบเงินเดือน/สลิป (ขั้น 4-4) — แยกจาก page.tsx (Next.js ไม่ให้ export อย่างอื่นจากไฟล์หน้า)

// "2026-10" → "ตุลาคม 2569"
export function periodLabel(period: string) {
    return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
    );
}

// เดือนปัจจุบันตามเวลาไทย "YYYY-MM"
export function currentPeriodBangkok() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit" }).format(
        new Date(),
    );
}
