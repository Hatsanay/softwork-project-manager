// สถานะบัตรพนักงานที่คนอ่าน (2026-10-18) — ใช้ทั้งการ์ดในหน้าพนักงานและแท็บคิวบัตรในหน้ารายการ
// บัตรที่ยังไม่เคยพิมพ์ไม่มีตัวจริง → ยกเลิกแล้วไม่ต้องเก็บคืน · คนพ้นสภาพแล้วบัตรที่พิมพ์ไปต้องเก็บคืน
// วันหมดอายุ: หมดแล้ว / เหลือไม่เกิน CARD_EXPIRY_WARNING_DAYS วัน = ใกล้หมดอายุ (ตรงกับคิว expiring ของ backend)
import type { PillTone } from "@/components/ui/status-pill";
import type { EmployeeCard } from "../_types";

export const CARD_EXPIRY_WARNING_DAYS = 30;

type CardState = Pick<EmployeeCard, "ec_printed_at" | "ec_voided_at" | "ec_returned_at" | "ec_expires_on">;

export type CardStatus = { label: string; tone: PillTone; needsReturn: boolean };

/** วันนี้ตามเวลาไทย "YYYY-MM-DD" (ไม่ใช่เขตเวลาเครื่องผู้ใช้) */
export function todayBangkokText() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

/** "2026-10-18" + 30 วัน → "2026-11-17" (คิดแบบ UTC ไม่โดนเขตเวลา) */
function addDaysText(dateText: string, days: number) {
    const date = new Date(`${dateText}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

export function cardStatusOf(card: CardState, isEmployeeTerminated: boolean, today: string): CardStatus {
    if (card.ec_returned_at) return { label: "ยกเลิก · คืนแล้ว", tone: "neutral", needsReturn: false };
    if (card.ec_voided_at) {
        if (!card.ec_printed_at) return { label: "ยกเลิก · ไม่ได้พิมพ์", tone: "neutral", needsReturn: false };
        return { label: "ยกเลิก · ยังไม่ได้คืน", tone: "danger", needsReturn: true };
    }
    if (isEmployeeTerminated) {
        if (!card.ec_printed_at) return { label: "พ้นสภาพ · ไม่ได้พิมพ์", tone: "neutral", needsReturn: false };
        return { label: "พ้นสภาพ · ยังไม่ได้คืน", tone: "danger", needsReturn: true };
    }
    if (card.ec_expires_on < today) return { label: "หมดอายุ", tone: "danger", needsReturn: false };
    if (!card.ec_printed_at) return { label: "รอพิมพ์", tone: "wait", needsReturn: false };
    if (card.ec_expires_on <= addDaysText(today, CARD_EXPIRY_WARNING_DAYS)) {
        return { label: "ใกล้หมดอายุ", tone: "wait", needsReturn: false };
    }
    return { label: "ใช้อยู่", tone: "success", needsReturn: false };
}

export function cardPrintHref(employeeId: string, cardId: number) {
    return `/people/employees/card/print?id=${encodeURIComponent(employeeId)}&card=${cardId}`;
}

/** ตัวอักษรแรกของชื่อ (แทนรูปบนบัตร) — ข้ามคำนำหน้าและข้อความในวงเล็บ เช่น "นาย[ตัวอย่าง] ธนกร" → "ธ" */
export function nameInitial(name: string) {
    const cleaned = name
        .replace(/\[[^\]]*\]/g, "")
        .trim()
        .replace(/^(นางสาว|นาย|นาง)/, "")
        .trim();
    return cleaned.match(/\p{L}/u)?.[0] ?? "";
}
