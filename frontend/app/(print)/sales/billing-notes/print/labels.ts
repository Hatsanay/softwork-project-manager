// ข้อความบนหน้าพิมพ์ใบวางบิล ตามภาษาเอกสาร — ใช้คำร่วมกับใบเสนอราคา แล้วเติม/เปลี่ยนเฉพาะคำของใบวางบิล
import { PRINT_LABELS as QUOTATION_LABELS } from "../../quotations/print/labels";

export const BILLING_NOTE_PRINT_LABELS = {
    th: {
        ...QUOTATION_LABELS.th,
        documentTitle: "ใบวางบิล",
        paymentDate: "วันนัดชำระ",
        invoiceNumber: "เลขที่ใบแจ้งหนี้",
        invoiceDate: "วันที่",
        dueDate: "ครบกำหนด",
        withholdingNote: "ยอดรวมยังไม่หักภาษี ณ ที่จ่าย",
        notes: "หมายเหตุ",
        biller: "ผู้วางบิล",
        receiver: "ผู้รับวางบิล",
        notIssuedDate: "ได้ตอนออกใบ",
        blankDate: "......../......../........",
    },
    en: {
        ...QUOTATION_LABELS.en,
        documentTitle: "BILLING NOTE",
        paymentDate: "Payment date",
        invoiceNumber: "Invoice no.",
        invoiceDate: "Date",
        dueDate: "Due date",
        withholdingNote: "Total before withholding tax",
        notes: "Notes",
        biller: "Billed by",
        receiver: "Received by",
        notIssuedDate: "On issue",
        blankDate: "......../......../........",
    },
} as const;

export type BillingNotePrintLabels =
    (typeof BILLING_NOTE_PRINT_LABELS)["th"] | (typeof BILLING_NOTE_PRINT_LABELS)["en"];
