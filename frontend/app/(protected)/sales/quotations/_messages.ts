// ข้อความของหน้าใบเสนอราคา (ป้ายสถานะ + ข้อความกำกับ) — ที่เดียว แก้ถ้อยคำได้โดยไม่ต้องไล่หาในหน้า
// ร่างข้อความตาม docs/plans/2026-10-08-sales-cycle.md หัวข้อ 8.1
import type { PillTone } from "@/components/ui/status-pill";
import type { QuotationStatus } from "./_types";

export const STATUS_LABELS: Record<QuotationStatus, { label: string; tone: PillTone }> = {
    draft: { label: "ร่าง", tone: "neutral" },
    pending_approval: { label: "รออนุมัติ", tone: "wait" },
    approved: { label: "อนุมัติแล้ว", tone: "info" },
    sent: { label: "ส่งลูกค้าแล้ว", tone: "info" },
    accepted: { label: "ลูกค้าตอบรับ", tone: "success" },
    declined: { label: "ลูกค้าปฏิเสธ", tone: "danger" },
    expired: { label: "หมดอายุ", tone: "neutral" },
    cancelled: { label: "ยกเลิก", tone: "danger" },
    superseded: { label: "มีฉบับใหม่แทน", tone: "neutral" },
};

export const QUOTATION_MESSAGES = {
    listDescription:
        "ทุกใบต้องผ่านการอนุมัติก่อนส่งลูกค้า · ได้เลขที่และวันที่เอกสารเมื่ออนุมัติครบทุกชั้น · แก้หลังอนุมัติ = ออก revision (เลขเดิม Rev.ใหม่)",
    formDescription:
        "ร่างยังไม่มีเลขที่และวันที่ — ได้ในวันที่อนุมัติครบทุกชั้น · ยอดทุกบรรทัดคำนวณซ้ำที่เซิร์ฟเวอร์ตอนบันทึก",
    validDays: (days: number) =>
        `วันที่เอกสารและเลขที่จะได้ในวันที่อนุมัติครบทุกชั้น · ยืนราคา ${days} วันนับจากวันนั้น`,
    branch: "สาขาที่ออกเอกสาร (ค่าเริ่มต้น = สาขาของคุณ) — ไม่จำกัดว่าใครเห็นใบนี้",
    language: "ภาษาบนหน้าพิมพ์ที่ส่งลูกค้า (หัวเอกสาร วันที่ จำนวนเงินตัวอักษร)",
    vatNotRegistered: "บริษัทยังไม่จด VAT — ใบนี้ไม่คิด VAT",
    vatStandard: (rate: string) => `VAT ${rate}% ตามวันที่เอกสาร`,
    vatZero: "VAT 0% ใช้กับการส่งออกบริการตามเงื่อนไขกรมสรรพากรเท่านั้น",
    rateBot: (rate: string, currency: string, date: string) =>
        `อัตรา ธปท. วันที่ ${date} = ${rate} บาท/${currency} · แก้ได้ถ้าตกลงอัตรากับลูกค้า (ต้องใส่เหตุผล ผู้อนุมัติจะเห็น) · อัตราล็อกเมื่อส่งขออนุมัติ`,
    rateManual: "อัตราที่กรอกเองต้องใส่เหตุผล ผู้อนุมัติทุกชั้นจะเห็นทั้งอัตรานี้และอัตรา ธปท.",
    discount: "ส่วนลด % คิดจาก จำนวน × ราคา ของบรรทัดนั้น / จากยอดรวมก่อนลด · ปัดเศษครึ่งขึ้นตามทศนิยมของสกุลเงิน",
    milestones: "ผลรวมทุกงวดต้องเท่ายอดรวมทั้งสิ้นพอดี · งวดสุดท้ายรับเศษจากการปัด",
    internalNote: "ไม่พิมพ์บนเอกสารที่ส่งลูกค้า — เห็นเฉพาะคนในระบบ (เช่น ผู้อนุมัติ)",
    picker: "กดเพื่อเพิ่มลงใบ เพิ่มได้หลายรายการ แผงไม่ปิด · ใบเก็บสำเนาของรายการไว้ แก้สินค้าทีหลังใบนี้ไม่เปลี่ยน",
    pickerPackages: "กดครั้งเดียวได้ทุกแถวในชุด ราคาใช้ราคาปัจจุบันของสินค้า แก้ต่อในใบได้",
    belowList: (amount: string) => `ต่ำกว่าราคาตั้งต้น −${amount}`,
    approvalPreview:
        "ระบบเลือกจำนวนชั้นจากยอดก่อน VAT (คิดเป็นบาท) — ยอดถึงเกณฑ์ชั้นไหน ต้องผ่านชั้นนั้นและทุกชั้นก่อนหน้า",
} as const;
