// ข้อความกำกับบนหน้าต่ออายุบริการ (2026-10-31) · ไม่ใช้ tooltip: ทุกกติกาอยู่บนจอ
import { cycleUnit } from "@/lib/shared/renewal-math.mjs";
import { thaiShortDate } from "@/lib/shared/thai-date.mjs";
import type { Renewal, RenewalChannel, RenewalStatus } from "./_types";

export const RENEWAL_MESSAGES = {
    page: "ค่าบริการที่ต้องเก็บซ้ำทุกรอบ เช่น โฮสติ้ง โดเมน ดูแลรายเดือน · ขึ้นแท็บใกล้ครบเมื่อเหลือ 30 วัน · ออกใบแล้ววันครบขยับไปรอบถัดไป · ค้างจ่ายดูที่ลูกหนี้คงค้าง",
    price: "ก่อน VAT · แก้แล้วมีผลกับรอบที่ยังไม่ออก รอบที่ออกใบแล้วไม่เปลี่ยน",
    nextDue: "วันเริ่มของรอบที่ยังไม่ได้ออกใบ/รับงาน · ปลายเดือนระบบเลื่อนให้เอง (31 ม.ค. → 28 ก.พ. → 31 มี.ค.)",
    label: "ชื่อที่จำง่าย เช่น ชื่อโดเมน หรือชื่อเว็บไซต์ · แสดงในรายการและใบแจ้งหนี้",
    channel: "ลูกค้าตรงออกใบแจ้งหนี้จากระบบ · ผู้ซื้อ Fastwork สั่งต่ออายุบน Fastwork แล้วรับเป็นงานใหม่",
    pause: "พักไว้ = ไม่เตือนจนกว่าจะเปิดต่อ · ตอนเปิดต่อเลือกวันครบใหม่ได้",
    cancel: "ยกเลิก = ไม่ต่ออายุอีก ไม่เตือนอีก · ประวัติรอบที่ผ่านมายังอยู่",
};

export const CHANNEL_LABELS: Record<RenewalChannel, string> = {
    direct: "ลูกค้าตรง",
    fastwork: "Fastwork",
};

export const STATUS_LABELS: Record<RenewalStatus, string> = {
    active: "ใช้งาน",
    paused: "พักไว้",
    cancelled: "ยกเลิก",
};

/** ชื่อที่แสดง: ชื่อที่จำง่าย หรือชื่อสินค้า */
export function renewalTitle(renewal: Pick<Renewal, "rnw_label" | "product_name">) {
    return renewal.rnw_label || renewal.product_name;
}

/** "อีก 12 วัน" · "ครบวันนี้" · "เลยมา 3 วัน" */
export function dueText(daysLeft: number) {
    if (daysLeft === 0) return "ครบวันนี้";
    if (daysLeft > 0) return `อีก ${daysLeft} วัน`;
    return `เลยมา ${-daysLeft} วัน`;
}

/** ช่วงบริการ "1 พ.ย. 2569 - 31 ต.ค. 2570" */
export function periodText(period: { start: string; end: string }) {
    return `${thaiShortDate(period.start)} - ${thaiShortDate(period.end)}`;
}

/** หน่วยท้ายราคา "บาท/ปี" */
export function perCycleText(months: number) {
    return `บาท/${cycleUnit(months)}`;
}
