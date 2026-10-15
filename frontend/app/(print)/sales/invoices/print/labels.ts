// ข้อความบนหน้าพิมพ์ใบแจ้งหนี้ ตามภาษาเอกสาร — ใช้คำร่วมกับใบเสนอราคา แล้วเติม/เปลี่ยนเฉพาะคำของใบแจ้งหนี้
import { PRINT_LABELS as QUOTATION_LABELS } from "../../quotations/print/labels";

export const INVOICE_PRINT_LABELS = {
    th: {
        ...QUOTATION_LABELS.th,
        documentTitle: "ใบแจ้งหนี้",
        dueDate: "ครบกำหนด",
        reference: "อ้างอิงใบเสนอราคา",
        withholding: "หัก ณ ที่จ่าย",
        withholdingNote: "(ประมาณ)",
        netPayable: "ยอดชำระสุทธิ",
        notes: "หมายเหตุ",
        payTo: "ชำระเงินโดยโอนเข้าบัญชี",
        accountName: "ชื่อบัญชี",
        accountNo: "เลขที่บัญชี",
        bankBranch: "สาขา",
        promptPay: "หรือสแกนจ่ายพร้อมเพย์",
        promptPayAmount: "ยอดในคิวอาร์",
        issuer: "ผู้ออกใบแจ้งหนี้",
        receiver: "ผู้รับใบแจ้งหนี้",
        notIssuedDate: "ได้ตอนออกใบ",
    },
    en: {
        ...QUOTATION_LABELS.en,
        documentTitle: "INVOICE",
        dueDate: "Due date",
        reference: "Quotation ref.",
        withholding: "Withholding tax",
        withholdingNote: "(estimated)",
        netPayable: "Net amount payable",
        notes: "Notes",
        payTo: "Please transfer to",
        accountName: "Account name",
        accountNo: "Account no.",
        bankBranch: "Branch",
        promptPay: "or scan to pay via PromptPay",
        promptPayAmount: "QR amount",
        issuer: "Issued by",
        receiver: "Received by",
        notIssuedDate: "On issue",
    },
} as const;

export type InvoicePrintLabels = (typeof INVOICE_PRINT_LABELS)["th"] | (typeof INVOICE_PRINT_LABELS)["en"];
