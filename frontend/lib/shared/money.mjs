// ─── การคำนวณเงินของเอกสารขาย (ใบเสนอราคา / ใบแจ้งหนี้ / ใบเสร็จ) — ที่เดียวของทั้งระบบ ───────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (คำนวณให้ดูสดตอนกรอก) — สูตรเดียวกัน ยอดจึงตรงกันทุกสตางค์
// (docs/plans/2026-10-08-sales-cycle.md หัวข้อ 4)
//
// กติกา:
//   - ห้ามใช้ number กับเงิน (0.1 + 0.2 = 0.30000000000000004) — ทุกค่าเก็บเป็นจำนวนเต็ม BigInt หน่วย "ร้อยส่วน"
//     เช่น 1234.50 บาท = 123450n · จำนวนสินค้าและ % ก็เป็นร้อยส่วนเหมือนกัน (2.5 ชิ้น = 250n, 7% = 700n)
//   - ปัดเศษแบบ "ครึ่งขึ้น" (0.005 → 0.01) ที่: ยอดบรรทัด, ส่วนลด %, VAT, งวดชำระ %, การแปลงเป็นบาท
//   - สกุลเงินที่ไม่มีทศนิยม (เช่น เยน) ปัดให้ลงหน่วยเต็มของสกุลนั้น แต่ยังเก็บเป็นร้อยส่วน ("1500.00")
//   - backend คำนวณใหม่ทุกครั้งที่บันทึก ไม่เชื่อยอดที่หน้าเว็บส่งมา
//
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ — ต้องรันได้ทั้งสองฝั่ง · เทสต์อยู่ที่ backend/test/money.test.js

// ขอบบนของคอลัมน์ DECIMAL(15,2) = 9,999,999,999,999.99
const MAX_HUNDREDTHS = 999_999_999_999_999n;
const ONE_HUNDRED_PERCENT = 10_000n; // 100.00% ในหน่วยร้อยส่วน
const DECIMAL_NUMBER = /^-?\d+(\.\d+)?$/;

/** ข้อมูลตัวเลขที่ผู้ใช้กรอกไม่ถูกต้อง — field คือชื่อช่องภาษาไทย ไว้บอกผู้ใช้ว่าผิดที่ช่องไหน */
export class MoneyInputError extends Error {
    /**
     * @param {string} message
     * @param {string} field
     */
    constructor(message, field) {
        super(message);
        this.name = "MoneyInputError";
        this.field = field;
    }
}

// ─── แปลงไปมาระหว่างข้อความกับร้อยส่วน ──────────────────────────────────────────────────────────

/**
 * แปลงตัวเลขที่ผู้ใช้กรอก ("1,234.567", 7, "0.1") เป็นร้อยส่วนแบบ BigInt โดยไม่ผ่าน float · เกิน 2 ทศนิยมปัดครึ่งขึ้น
 * @param {string | number | null | undefined} value
 * @param {string} field ชื่อช่อง ใช้ในข้อความ error
 * @returns {bigint}
 */
export function parseHundredths(value, field) {
    const text = String(value ?? "")
        .trim()
        .replace(/,/g, "");
    if (!DECIMAL_NUMBER.test(text)) {
        throw new MoneyInputError(`${field}ต้องเป็นตัวเลข`, field);
    }

    const isNegative = text.startsWith("-");
    const [wholePart, fractionPart = ""] = text.replace("-", "").split(".");
    // เก็บทศนิยมหลักที่ 3 ไว้ตัดสินการปัด
    const threeDecimals = (fractionPart + "000").slice(0, 3);

    let hundredths = BigInt(wholePart + threeDecimals.slice(0, 2));
    const shouldRoundUp = Number(threeDecimals[2]) >= 5;
    if (shouldRoundUp) hundredths += 1n;

    return isNegative ? -hundredths : hundredths;
}

/**
 * ร้อยส่วน → ข้อความทศนิยม 2 ตำแหน่ง สำหรับเก็บลง DECIMAL(15,2) และส่งใน API ("1234.50")
 * @param {bigint} hundredths
 * @returns {string}
 */
export function formatHundredths(hundredths) {
    const isNegative = hundredths < 0n;
    const absolute = isNegative ? -hundredths : hundredths;
    const whole = absolute / 100n;
    const fraction = String(absolute % 100n).padStart(2, "0");
    return `${isNegative ? "-" : ""}${whole}.${fraction}`;
}

/**
 * ร้อยส่วน → ข้อความสำหรับแสดงผล มีจุลภาคคั่นหลักพัน และทศนิยมตามสกุลเงิน ("1,234.50", เยน "1,235")
 * รับข้อความทศนิยมจาก API ได้ด้วย ("1234.50") · ไม่ผ่าน float จึงแสดงยอดใหญ่ได้ถูกทุกหลัก
 * @param {bigint | string} amount ร้อยส่วน หรือข้อความทศนิยม
 * @param {number} [currencyDecimals]
 * @returns {string}
 */
export function formatAmount(amount, currencyDecimals = 2) {
    const hundredths = typeof amount === "bigint" ? amount : parseHundredths(amount, "จำนวนเงิน");
    const [whole, fraction] = formatHundredths(roundToCurrency(hundredths, currencyDecimals)).split(".");
    const isNegative = whole.startsWith("-");
    const digits = isNegative ? whole.slice(1) : whole;
    const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    const sign = isNegative ? "-" : "";
    if (currencyDecimals === 0) return `${sign}${grouped}`;
    return `${sign}${grouped}.${fraction.slice(0, currencyDecimals)}`;
}

// ─── การปัดเศษ ───────────────────────────────────────────────────────────────────────────────

/**
 * หารแล้วปัดครึ่งขึ้น (เลขติดลบปัดออกจากศูนย์แบบสมมาตร — เผื่อใบลดหนี้ในอนาคต)
 * @param {bigint} numerator
 * @param {bigint} denominator
 * @returns {bigint}
 */
export function divideRoundHalfUp(numerator, denominator) {
    const isNegative = numerator < 0n !== denominator < 0n;
    const absoluteNumerator = numerator < 0n ? -numerator : numerator;
    const absoluteDenominator = denominator < 0n ? -denominator : denominator;
    const rounded = (absoluteNumerator * 2n + absoluteDenominator) / (absoluteDenominator * 2n);
    return isNegative ? -rounded : rounded;
}

/**
 * ปัดให้ลงหน่วยที่เล็กที่สุดของสกุลเงิน — บาท/ดอลลาร์ 2 ทศนิยม (ไม่เปลี่ยน) · เยน 0 ทศนิยม (ปัดเป็นเต็มหน่วย)
 * @param {bigint} hundredths
 * @param {number} currencyDecimals 0, 1 หรือ 2
 * @returns {bigint}
 */
export function roundToCurrency(hundredths, currencyDecimals) {
    if (![0, 1, 2].includes(currencyDecimals)) {
        throw new Error(`ระบบรองรับสกุลเงินที่มีทศนิยม 0-2 ตำแหน่งเท่านั้น (ได้ ${currencyDecimals})`);
    }
    const smallestUnit = 10n ** BigInt(2 - currencyDecimals);
    return divideRoundHalfUp(hundredths, smallestUnit) * smallestUnit;
}

// ─── ตรวจขอบเขต ──────────────────────────────────────────────────────────────────────────────

function assertNotNegative(hundredths, field) {
    if (hundredths < 0n) throw new MoneyInputError(`${field}ต้องไม่ติดลบ`, field);
}

function assertWithinMaximum(hundredths, field) {
    if (hundredths > MAX_HUNDREDTHS) throw new MoneyInputError(`${field}สูงเกินกว่าที่ระบบรองรับ`, field);
}

function parsePercent(value, field) {
    const percent = parseHundredths(value || 0, field);
    if (percent < 0n || percent > ONE_HUNDRED_PERCENT) {
        throw new MoneyInputError(`${field}ต้องอยู่ระหว่าง 0-100`, field);
    }
    return percent;
}

// ─── ยอดต่อบรรทัด ────────────────────────────────────────────────────────────────────────────

/**
 * ยอดของรายการหนึ่งบรรทัด = จำนวน × ราคาต่อหน่วย − ส่วนลดบรรทัด (ส่วนลดเป็นบาทหรือ % ของ จำนวน × ราคา)
 * @param {object} line
 * @param {string | number} line.quantity
 * @param {string | number} line.unitPrice
 * @param {"amount" | "percent"} [line.discountType]
 * @param {string | number} [line.discountValue]
 * @param {number} [line.currencyDecimals] ค่าเริ่มต้น 2 (บาท)
 * @returns {{ gross: bigint, discount: bigint, amount: bigint }} ร้อยส่วนทั้งหมด
 */
export function calculateLine({
    quantity,
    unitPrice,
    discountType = "amount",
    discountValue = 0,
    currencyDecimals = 2,
}) {
    const quantityHundredths = parseHundredths(quantity, "จำนวน");
    if (quantityHundredths <= 0n) throw new MoneyInputError("จำนวนต้องมากกว่า 0", "จำนวน");

    const unitPriceHundredths = parseHundredths(unitPrice, "ราคาต่อหน่วย");
    assertNotNegative(unitPriceHundredths, "ราคาต่อหน่วย");
    assertWithinMaximum(unitPriceHundredths, "ราคาต่อหน่วย");

    // จำนวนและราคาเป็นร้อยส่วนทั้งคู่ คูณกันได้หมื่นส่วน → หาร 100 กลับเป็นร้อยส่วน
    const gross = roundToCurrency(divideRoundHalfUp(quantityHundredths * unitPriceHundredths, 100n), currencyDecimals);
    assertWithinMaximum(gross, "ยอดของรายการ");

    let discount;
    if (discountType === "percent") {
        const discountPercent = parsePercent(discountValue, "ส่วนลด (%)");
        discount = roundToCurrency(divideRoundHalfUp(gross * discountPercent, ONE_HUNDRED_PERCENT), currencyDecimals);
    } else {
        discount = roundToCurrency(parseHundredths(discountValue || 0, "ส่วนลด"), currencyDecimals);
        assertNotNegative(discount, "ส่วนลด");
    }
    if (discount > gross) throw new MoneyInputError("ส่วนลดมากกว่ายอดของรายการ", "ส่วนลด");

    return { gross, discount, amount: gross - discount };
}

// ─── ยอดรวมทั้งเอกสาร ─────────────────────────────────────────────────────────────────────────

/**
 * ยอดรวมของเอกสาร — ราคาที่กรอกเป็นราคาก่อน VAT · ส่วนลดท้ายบิลเป็นบาทหรือ % ของรวมเป็นเงิน
 * vatRate = 0 คือไม่คิด VAT (บริษัทยังไม่จด ณ วันที่เอกสาร หรือเลือก VAT 0%)
 * @param {object} document
 * @param {bigint[]} document.lineAmounts ยอดของแต่ละบรรทัด (จาก calculateLine) — ไม่รวมแถวหัวข้อ/หมายเหตุ
 * @param {"amount" | "percent"} [document.discountType]
 * @param {string | number} [document.discountValue]
 * @param {string | number} [document.vatRate] เช่น "7.00"
 * @param {number} [document.currencyDecimals]
 * @returns {{ subtotal: bigint, discount: bigint, afterDiscount: bigint, vatRate: bigint, vat: bigint, total: bigint }}
 */
export function calculateDocumentTotals({
    lineAmounts,
    discountType = "amount",
    discountValue = 0,
    vatRate = 0,
    currencyDecimals = 2,
}) {
    const subtotal = lineAmounts.reduce((sum, amount) => sum + amount, 0n);

    let discount;
    if (discountType === "percent") {
        const discountPercent = parsePercent(discountValue, "ส่วนลดท้ายบิล (%)");
        discount = roundToCurrency(
            divideRoundHalfUp(subtotal * discountPercent, ONE_HUNDRED_PERCENT),
            currencyDecimals,
        );
    } else {
        discount = roundToCurrency(parseHundredths(discountValue || 0, "ส่วนลดท้ายบิล"), currencyDecimals);
        assertNotNegative(discount, "ส่วนลดท้ายบิล");
    }
    if (discount > subtotal) throw new MoneyInputError("ส่วนลดท้ายบิลมากกว่ายอดรวม", "ส่วนลดท้ายบิล");

    const afterDiscount = subtotal - discount;
    const vatRateHundredths = parsePercent(vatRate, "อัตรา VAT");
    const vat = roundToCurrency(
        divideRoundHalfUp(afterDiscount * vatRateHundredths, ONE_HUNDRED_PERCENT),
        currencyDecimals,
    );
    const total = afterDiscount + vat;
    assertWithinMaximum(total, "ยอดรวมทั้งสิ้น");

    return { subtotal, discount, afterDiscount, vatRate: vatRateHundredths, vat, total };
}

// ─── งวดชำระ ────────────────────────────────────────────────────────────────────────────────

/**
 * แบ่งยอดเอกสารเป็นงวด — แต่ละงวดระบุเป็น % หรือจำนวนเงินก็ได้
 * งวด % ปัดครึ่งขึ้น แล้ว "งวดสุดท้าย" รับเศษที่เหลือ ให้ผลรวมเท่ายอดเอกสารพอดีเสมอ
 * (ไม่งั้น 3 งวด × 33.33% จะขาดไป 1 สตางค์) · ผลรวมที่ผิดเกินเศษปัด = ผู้ใช้กรอกผิดจริง → error
 * @param {object} input
 * @param {Array<{ percent?: string | number | null, amount?: string | number | null }>} input.milestones
 * @param {bigint} input.total ยอดรวมทั้งสิ้นของเอกสาร
 * @param {number} [input.currencyDecimals]
 * @returns {Array<{ percent: bigint | null, amount: bigint }>}
 */
export function splitIntoMilestones({ milestones, total, currencyDecimals = 2 }) {
    if (milestones.length === 0) throw new MoneyInputError("ต้องมีงวดชำระอย่างน้อย 1 งวด", "งวดชำระ");

    const smallestUnit = 10n ** BigInt(2 - currencyDecimals);
    const results = milestones.map((milestone, index) => {
        const field = `งวดที่ ${index + 1}`;
        const isPercent = milestone.percent !== undefined && milestone.percent !== null && milestone.percent !== "";

        if (isPercent) {
            const percent = parsePercent(milestone.percent, `${field} (%)`);
            if (percent === 0n) throw new MoneyInputError(`${field}: % ต้องมากกว่า 0`, field);
            const amount = roundToCurrency(divideRoundHalfUp(total * percent, ONE_HUNDRED_PERCENT), currencyDecimals);
            return { percent, amount };
        }

        const amount = roundToCurrency(parseHundredths(milestone.amount, field), currencyDecimals);
        if (amount <= 0n) throw new MoneyInputError(`${field}: จำนวนเงินต้องมากกว่า 0`, field);
        return { percent: null, amount };
    });

    // ทุกงวดเป็น % → ต้องรวมได้ 100% พอดี (ยอดเอกสารเล็กๆ เศษปัดอาจกลบความผิดได้ จึงเช็ค % ตรงๆ)
    const percentMilestones = results.filter((milestone) => milestone.percent !== null);
    const isAllPercent = percentMilestones.length === results.length;
    if (isAllPercent) {
        const percentSum = percentMilestones.reduce((runningSum, milestone) => runningSum + milestone.percent, 0n);
        if (percentSum !== ONE_HUNDRED_PERCENT) {
            throw new MoneyInputError(
                `ผลรวม % ของงวดชำระต้องเท่ากับ 100% (ตอนนี้ ${formatHundredths(percentSum)}%)`,
                "งวดชำระ",
            );
        }
    }

    const amountSum = results.reduce((runningSum, milestone) => runningSum + milestone.amount, 0n);
    const difference = total - amountSum;

    // ยอมให้ต่างได้ไม่เกิน "หน่วยเล็กสุดของสกุลเงิน × จำนวนงวดที่เป็น %" (เศษจากการปัด) — มากกว่านั้นคือกรอกผิด
    const allowedDifference = smallestUnit * BigInt(percentMilestones.length);
    const absoluteDifference = difference < 0n ? -difference : difference;
    if (absoluteDifference > allowedDifference) {
        throw new MoneyInputError(
            `ผลรวมงวดชำระ (${formatHundredths(amountSum)}) ไม่เท่ากับยอดรวมทั้งสิ้น (${formatHundredths(total)})`,
            "งวดชำระ",
        );
    }

    const lastMilestone = results[results.length - 1];
    lastMilestone.amount += difference;
    if (lastMilestone.amount <= 0n) {
        throw new MoneyInputError(`งวดที่ ${results.length}: จำนวนเงินหลังปัดเศษต้องมากกว่า 0`, "งวดชำระ");
    }
    return results;
}

// ─── แปลงเป็นบาท ────────────────────────────────────────────────────────────────────────────

// อัตราแลกเปลี่ยนเก็บใน DECIMAL(20,10) — 10 ตำแหน่งพอสำหรับสกุลที่ ธปท. ประกาศต่อ 100/1000 หน่วย
// (เช่น 2.1234567 บาทต่อ 1000 รูเปียห์ = 0.0021234567 ต่อ 1 หน่วย หารแล้วไม่เสียความแม่นยำ)
const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);
const RATE_TEXT = /^\d+(\.\d{1,10})?$/;

/**
 * แปลงยอดสกุลต่างประเทศเป็นบาท — ใช้ภายใน (เกณฑ์อนุมัติ, รายงาน) ไม่แสดงบนเอกสารที่ส่งลูกค้า
 * @param {bigint} hundredths ยอดในสกุลของเอกสาร
 * @param {string | number} exchangeRate บาทต่อ 1 หน่วยสกุลนั้น ทศนิยมได้ถึง 10 ตำแหน่ง (เช่น "35.123456")
 * @returns {bigint} บาท หน่วยร้อยส่วน (สตางค์)
 */
export function convertToBaht(hundredths, exchangeRate) {
    const rateText = String(exchangeRate ?? "").trim();
    if (!RATE_TEXT.test(rateText) || Number(rateText) <= 0) {
        throw new MoneyInputError(
            `อัตราแลกเปลี่ยนต้องเป็นตัวเลขมากกว่า 0 (ทศนิยมไม่เกิน ${RATE_DECIMALS} ตำแหน่ง)`,
            "อัตราแลกเปลี่ยน",
        );
    }
    const [wholePart, fractionPart = ""] = rateText.split(".");
    const scaledRate = BigInt(wholePart + fractionPart.padEnd(RATE_DECIMALS, "0"));

    const baht = divideRoundHalfUp(hundredths * scaledRate, RATE_SCALE);
    assertWithinMaximum(baht, "ยอดที่แปลงเป็นบาท");
    return baht;
}

/**
 * อัตราที่ ธปท. ประกาศต่อหลายหน่วย (เช่น บาทต่อ 100 เยน) → บาทต่อ 1 หน่วย ทศนิยม 10 ตำแหน่ง ปัดครึ่งขึ้น · ไม่ผ่าน float
 * @param {string} announcedRate ข้อความทศนิยมตามที่ ธปท. ส่งมา เช่น "22.6155"
 * @param {number} unitCount ประกาศต่อกี่หน่วย (1, 100, 1000)
 * @returns {string} เช่น "0.2261550000"
 */
export function ratePerUnit(announcedRate, unitCount) {
    const text = String(announcedRate ?? "").trim();
    if (!/^\d+(\.\d+)?$/.test(text)) {
        throw new MoneyInputError("อัตราที่ ธปท. ส่งมาไม่ใช่ตัวเลข", "อัตราแลกเปลี่ยน");
    }
    if (!Number.isInteger(unitCount) || unitCount < 1) {
        throw new MoneyInputError("จำนวนหน่วยที่ ธปท. ประกาศต้องเป็นจำนวนเต็มตั้งแต่ 1", "อัตราแลกเปลี่ยน");
    }
    const [wholePart, fractionPart = ""] = text.split(".");
    // เก็บหลักเกินมา 1 ตำแหน่งไว้ตัดสินการปัดของทศนิยมที่ ธปท. ส่งมายาวกว่า 10 ตำแหน่ง
    const scaledTimesTen = BigInt(wholePart + fractionPart.padEnd(RATE_DECIMALS + 1, "0").slice(0, RATE_DECIMALS + 1));
    const scaled = divideRoundHalfUp(scaledTimesTen, 10n * BigInt(unitCount));

    const whole = scaled / RATE_SCALE;
    const fraction = String(scaled % RATE_SCALE).padStart(RATE_DECIMALS, "0");
    return `${whole}.${fraction}`;
}
