// ─── จำนวนเงินเป็นตัวอักษร (ไทย / อังกฤษ) หลายสกุลเงิน — ท้ายเอกสารขาย ─────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 4 · เทสต์: backend/test/amount-in-words.test.js
//
//   amountInWords("12000.50", THB, "th") → "หนึ่งหมื่นสองพันบาทห้าสิบสตางค์"
//   amountInWords("1500", USD, "th")     → "หนึ่งพันห้าร้อยดอลลาร์สหรัฐถ้วน"
//   amountInWords("1500", USD, "en")     → "One Thousand Five Hundred US Dollars Only"
//
// คำอ่านภาษาไทยตาม BAHTTEXT ของ Excel (ที่นักบัญชีไทยใช้เทียบ): หลักหน่วยเป็น 1 และมีหลักอื่นนำหน้า = "เอ็ด"
// (11 สิบเอ็ด, 101 หนึ่งร้อยเอ็ด, 1,000,001 หนึ่งล้านเอ็ด) · 20 = ยี่สิบ · ไม่มีหน่วยย่อย = "ถ้วน" / "Only"
// ยอดถูกปัดตามทศนิยมของสกุลก่อนอ่าน (เยน 0 ทศนิยม) · ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์

import { formatHundredths, parseHundredths, roundToCurrency } from "./money.mjs";

/**
 * @typedef {object} CurrencyWords ข้อมูลคำอ่านของสกุลเงิน — ตรงกับคอลัมน์ tb_currencies
 * @property {number} cur_decimals
 * @property {string} cur_unit_th      เช่น "บาท", "ดอลลาร์สหรัฐ"
 * @property {string | null} cur_subunit_th  เช่น "สตางค์", "เซนต์"
 * @property {string} cur_unit_en      เช่น "Baht", "US Dollars"
 * @property {string | null} cur_subunit_en  เช่น "Satang", "Cents"
 */

// ─── ภาษาไทย ─────────────────────────────────────────────────────────────────────────────────

const THAI_DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const THAI_POSITIONS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/**
 * อ่านตัวเลขไม่เกิน 6 หลัก (0–999,999) · hasHigherPart = มีหลักล้านนำหน้า (หลักหน่วย 1 ต้องอ่าน "เอ็ด")
 * @param {string} digits
 * @param {boolean} hasHigherPart
 */
function readThaiGroup(digits, hasHigherPart) {
    const trimmed = digits.replace(/^0+/, "");
    let words = "";
    for (let index = 0; index < trimmed.length; index += 1) {
        const digit = Number(trimmed[index]);
        const position = trimmed.length - 1 - index;
        if (digit === 0) continue;

        const isUnits = position === 0;
        const isTens = position === 1;
        const hasOtherDigits = trimmed.length > 1 || hasHigherPart;
        if (isUnits && digit === 1 && hasOtherDigits) {
            words += "เอ็ด";
        } else if (isTens && digit === 1) {
            words += "สิบ";
        } else if (isTens && digit === 2) {
            words += "ยี่สิบ";
        } else {
            words += THAI_DIGITS[digit] + THAI_POSITIONS[position];
        }
    }
    return words;
}

/**
 * อ่านจำนวนเต็มบวกเป็นภาษาไทย แบ่งทีละ 6 หลักต่อด้วย "ล้าน" (ล้านล้าน = ล้าน ล้าน)
 * @param {string} digits เลขจำนวนเต็มไม่ติดลบ
 */
function readThaiNumber(digits) {
    const trimmed = digits.replace(/^0+/, "");
    if (trimmed === "") return THAI_DIGITS[0];

    const groups = [];
    for (let end = trimmed.length; end > 0; end -= 6) {
        groups.unshift(trimmed.slice(Math.max(0, end - 6), end));
    }
    let words = "";
    groups.forEach((group, index) => {
        const isLast = index === groups.length - 1;
        words += readThaiGroup(group, index > 0);
        if (!isLast) words += "ล้าน";
    });
    return words;
}

// ─── ภาษาอังกฤษ ──────────────────────────────────────────────────────────────────────────────

const ENGLISH_ONES = [
    "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
]; // prettier-ignore
const ENGLISH_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const ENGLISH_SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

/** อ่าน 0–999 (ไม่มีคำว่า "and" ตามแบบเช็คอเมริกัน) */
function readEnglishHundreds(number) {
    const hundreds = Math.floor(number / 100);
    const rest = number % 100;
    const parts = [];
    if (hundreds > 0) parts.push(`${ENGLISH_ONES[hundreds]} Hundred`);
    if (rest >= 20) {
        const ones = rest % 10;
        parts.push(ones > 0 ? `${ENGLISH_TENS[Math.floor(rest / 10)]}-${ENGLISH_ONES[ones]}` : ENGLISH_TENS[rest / 10]);
    } else if (rest > 0) {
        parts.push(ENGLISH_ONES[rest]);
    }
    return parts.join(" ");
}

/** @param {string} digits เลขจำนวนเต็มไม่ติดลบ (สูงสุดหลักล้านล้าน — พอสำหรับ DECIMAL(15,2)) */
function readEnglishNumber(digits) {
    const trimmed = digits.replace(/^0+/, "");
    if (trimmed === "") return ENGLISH_ONES[0];

    const groups = [];
    for (let end = trimmed.length; end > 0; end -= 3) {
        groups.unshift(Number(trimmed.slice(Math.max(0, end - 3), end)));
    }
    const parts = [];
    groups.forEach((group, index) => {
        if (group === 0) return;
        const scale = ENGLISH_SCALES[groups.length - 1 - index];
        parts.push(scale ? `${readEnglishHundreds(group)} ${scale}` : readEnglishHundreds(group));
    });
    return parts.join(" ");
}

// ชื่อหน่วยเก็บเป็นพหูพจน์ ("US Dollars", "Cents") — จำนวน 1 ตัด s ท้ายออก ("One US Dollar") · "Baht"/"Yen" ไม่มี s คงเดิม
function englishUnit(unitName, isOne) {
    if (isOne && /[^s]s$/i.test(unitName)) return unitName.slice(0, -1);
    return unitName;
}

// ─── ฟังก์ชันหลัก ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {bigint | string} amount ร้อยส่วน (BigInt) หรือข้อความทศนิยมจาก API ("12000.50")
 * @param {CurrencyWords} currency
 * @param {"th" | "en"} language ภาษาของเอกสาร
 * @returns {string}
 */
export function amountInWords(amount, currency, language) {
    const hundredths = typeof amount === "bigint" ? amount : parseHundredths(amount, "จำนวนเงิน");
    const rounded = roundToCurrency(hundredths, currency.cur_decimals);
    const isNegative = rounded < 0n;
    const [wholeDigits, subunitDigits] = formatHundredths(isNegative ? -rounded : rounded).split(".");
    const hasWhole = BigInt(wholeDigits) > 0n;
    // สกุลที่ไม่มีทศนิยม (หรือไม่มีชื่อหน่วยย่อย) ไม่อ่านหน่วยย่อยเลย
    const subunitCount = currency.cur_decimals > 0 ? Number(subunitDigits) : 0;

    if (language === "en") {
        const subunitName = currency.cur_subunit_en;
        const hasSubunit = subunitCount > 0 && Boolean(subunitName);
        const parts = [];
        if (hasWhole || !hasSubunit) {
            parts.push(`${readEnglishNumber(wholeDigits)} ${englishUnit(currency.cur_unit_en, wholeDigits === "1")}`);
        }
        if (hasSubunit) {
            const subunitWords = `${readEnglishNumber(String(subunitCount))} ${englishUnit(subunitName, subunitCount === 1)}`;
            parts.push(hasWhole ? `and ${subunitWords}` : subunitWords);
        }
        const sign = isNegative ? "Minus " : "";
        return `${sign}${parts.join(" ")} Only`;
    }

    const subunitName = currency.cur_subunit_th;
    const hasSubunit = subunitCount > 0 && Boolean(subunitName);
    let words = "";
    if (hasWhole || !hasSubunit) words += readThaiNumber(wholeDigits) + currency.cur_unit_th;
    words += hasSubunit ? readThaiNumber(String(subunitCount)) + subunitName : "ถ้วน";
    return isNegative ? `ลบ${words}` : words;
}
