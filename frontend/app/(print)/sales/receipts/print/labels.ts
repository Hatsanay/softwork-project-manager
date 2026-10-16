// ข้อความบนหน้าพิมพ์ใบเสร็จรับเงิน ตามภาษาเอกสาร — ใช้คำร่วมกับใบเสนอราคา แล้วเติม/เปลี่ยนเฉพาะคำของใบเสร็จ
// ยังไม่ใช่ "ใบกำกับภาษี" — หลังจด VAT ต้องตัดสินตามคำตอบนักบัญชี B1 ก่อน (แบบระบบ 1C R-C14)
import { PRINT_LABELS as QUOTATION_LABELS } from "../../quotations/print/labels";

export const RECEIPT_PRINT_LABELS = {
    th: {
        ...QUOTATION_LABELS.th,
        documentTitle: "ใบเสร็จรับเงิน",
        invoiceNumber: "เลขที่ใบแจ้งหนี้",
        invoiceDate: "วันที่ใบแจ้งหนี้",
        invoiceTotal: "ยอดตามใบแจ้งหนี้",
        paidAmount: "จำนวนเงินที่ชำระ",
        allocatedTotal: "รวมรับชำระ",
        withholding: "หัก ณ ที่จ่าย",
        fee: "ค่าธรรมเนียมการโอน",
        received: "รับเงินสุทธิ",
        paidBy: "ชำระโดย",
        transfer: "โอนเข้าบัญชี",
        cheque: "เช็คธนาคาร",
        chequeNo: "เลขที่",
        chequeDate: "ลงวันที่",
        cash: "เงินสด",
        other: "อื่นๆ",
        reference: "อ้างอิง",
        chequeNote: "ใบเสร็จรับเงินนี้จะสมบูรณ์ต่อเมื่อเรียกเก็บเงินตามเช็คได้แล้ว",
        notes: "หมายเหตุ",
        collector: "ผู้รับเงิน",
    },
    en: {
        ...QUOTATION_LABELS.en,
        documentTitle: "RECEIPT",
        invoiceNumber: "Invoice no.",
        invoiceDate: "Invoice date",
        invoiceTotal: "Invoice amount",
        paidAmount: "Amount paid",
        allocatedTotal: "Total received",
        withholding: "Withholding tax",
        fee: "Bank charges",
        received: "Net amount received",
        paidBy: "Paid by",
        transfer: "Bank transfer to",
        cheque: "Cheque",
        chequeNo: "no.",
        chequeDate: "dated",
        cash: "Cash",
        other: "Other",
        reference: "Ref.",
        chequeNote: "This receipt is valid only after the cheque has been cleared.",
        notes: "Notes",
        collector: "Received by",
    },
} as const;

export type ReceiptPrintLabels = (typeof RECEIPT_PRINT_LABELS)["th"] | (typeof RECEIPT_PRINT_LABELS)["en"];
