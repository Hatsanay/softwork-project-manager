// ─── ข้อความใน QR พร้อมเพย์ (Thai QR Payment ตามมาตรฐาน EMVCo) สำหรับพิมพ์บนใบแจ้งหนี้ ─────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ไฟล์นี้สร้างแค่ "ข้อความ" ใน QR — หน้าเว็บนำไปวาดเป็นรูปด้วยไลบรารี qrcode · เทสต์: backend/test/promptpay.test.js
// แบบระบบ: docs/plans/2026-10-14-invoices-1b.md (I5, R-B11) · ใช้กับเงินบาทเท่านั้น
//
// โครงข้อความ: ทุกช่องเป็น [รหัส 2 หลัก][ความยาว 2 หลัก][ค่า]
//   00 รุ่นรูปแบบ "01" · 01 ชนิด QR ("11" ใช้ซ้ำได้ ไม่มียอด / "12" ใช้ครั้งเดียว มียอด)
//   29 บัญชีพร้อมเพย์: 00 = A000000677010111 · 01 เบอร์มือถือ (0066 + เบอร์ไม่มี 0 หน้า) / 02 เลขประจำตัว 13 หลัก / 03 e-Wallet 15 หลัก
//   53 สกุลเงิน "764" (บาท) · 54 ยอดเงิน · 58 ประเทศ "TH" · 63 CRC16 (CCITT-FALSE) ของทั้งข้อความรวม "6304"

const PROMPTPAY_AID = "A000000677010111";

function field(id, value) {
    return id + String(value.length).padStart(2, "0") + value;
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, เริ่ม 0xFFFF) — ค่าตรวจสอบท้าย QR ที่แอปธนาคารใช้ตรวจว่าอ่านครบ
 * @param {string} text ตัวอักษร ASCII
 * @returns {string} เลขฐานสิบหก 4 หลัก ตัวพิมพ์ใหญ่
 */
export function crc16(text) {
    let crc = 0xffff;
    for (let index = 0; index < text.length; index += 1) {
        crc ^= text.charCodeAt(index) << 8;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
            crc &= 0xffff;
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * ตรวจและจัดรูปเลขพร้อมเพย์ (รับขีด/เว้นวรรคได้)
 * @param {string} promptPayId
 * @returns {{ kind: "phone" | "taxId" | "eWallet", digits: string } | null} null = รูปแบบไม่ถูก
 */
export function normalizePromptPayId(promptPayId) {
    const digits = String(promptPayId ?? "").replace(/[\s-]/g, "");
    if (!/^\d+$/.test(digits)) return null;
    if (digits.length === 10 && digits.startsWith("0")) return { kind: "phone", digits };
    if (digits.length === 13) return { kind: "taxId", digits };
    if (digits.length === 15) return { kind: "eWallet", digits };
    return null;
}

/**
 * สร้างข้อความ QR พร้อมเพย์
 * @param {object} input
 * @param {string} input.promptPayId เบอร์มือถือ 10 หลัก / เลขผู้เสียภาษีหรือบัตรประชาชน 13 หลัก / e-Wallet 15 หลัก
 * @param {bigint | null} [input.amount] ยอดเงินบาท หน่วยสตางค์ — ว่าง = QR ไม่ระบุยอด (ผู้จ่ายกรอกเอง)
 * @returns {string}
 */
export function buildPromptPayPayload({ promptPayId, amount = null }) {
    const account = normalizePromptPayId(promptPayId);
    if (!account) throw new Error("เลขพร้อมเพย์ต้องเป็นเบอร์มือถือ 10 หลัก เลขประจำตัว 13 หลัก หรือ e-Wallet 15 หลัก");

    let target;
    if (account.kind === "phone") {
        target = field("01", ("0066" + account.digits.slice(1)).padStart(13, "0"));
    } else if (account.kind === "taxId") {
        target = field("02", account.digits);
    } else {
        target = field("03", account.digits);
    }

    const hasAmount = amount !== null && amount !== undefined;
    if (hasAmount && amount <= 0n) throw new Error("ยอดเงินใน QR ต้องมากกว่า 0");

    let payload =
        field("00", "01") +
        field("01", hasAmount ? "12" : "11") +
        field("29", field("00", PROMPTPAY_AID) + target) +
        field("53", "764");
    if (hasAmount) {
        const baht = amount / 100n;
        const satang = String(amount % 100n).padStart(2, "0");
        payload += field("54", `${baht}.${satang}`);
    }
    payload += field("58", "TH") + "6304";
    return payload + crc16(payload);
}
