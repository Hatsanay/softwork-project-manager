// ─── คำนวณยอดทั้งใบของใบเสนอราคา — ใช้ทั้ง backend (ค่าที่บันทึกจริง) และหน้าเว็บ (สรุปยอดสดตอนกรอก) ─────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 4 · สูตรเงินทั้งหมดอยู่ใน money.mjs ไฟล์นี้แค่ประกอบเข้าด้วยกัน
// ไม่โยน error — คืน errors เป็น { "items.2.qti_quantity": "ข้อความ" } รูปเดียวกับ fields ของ API ให้หน้าเว็บแสดงใต้ช่องได้ทันที
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ · เทสต์: backend/test/quotation-totals.test.js

import {
    MoneyInputError,
    calculateDocumentTotals,
    calculateLine,
    convertToBaht,
    formatHundredths,
    splitIntoMilestones,
} from "./money.mjs";

// ชื่อช่องภาษาไทยที่ money.mjs ใช้ → ชื่อคอลัมน์ของแถว (ให้ error ไปอยู่ใต้ช่องที่ถูก)
const LINE_FIELD_COLUMNS = {
    จำนวน: "qti_quantity",
    ราคาต่อหน่วย: "qti_unit_price",
    ยอดของรายการ: "qti_unit_price",
    ส่วนลด: "qti_discount_value",
    "ส่วนลด (%)": "qti_discount_value",
};

/**
 * @typedef {object} QuotationItemInput
 * @property {"item" | "heading" | "note"} qti_type
 * @property {string | null} [qti_quantity]
 * @property {string | null} [qti_unit_price]
 * @property {string | null} [qti_list_price] ราคาตั้งต้นของสินค้าในสกุลของใบ (ว่าง = ไม่ได้มาจากสินค้า)
 * @property {"amount" | "percent"} [qti_discount_type]
 * @property {string | null} [qti_discount_value]
 */

/**
 * @param {object} input
 * @param {QuotationItemInput[]} input.items
 * @param {"amount" | "percent"} input.discountType ส่วนลดท้ายบิล
 * @param {string} input.discountValue
 * @param {string} input.vatRate อัตรา VAT ที่ใช้ ("7.00" หรือ "0")
 * @param {number} input.currencyDecimals
 * @param {string} input.exchangeRate บาทต่อ 1 หน่วย ("1" สำหรับบาท)
 * @param {"single" | "milestones"} input.paymentMode
 * @param {Array<{ qtm_percent?: string | null, qtm_amount?: string | null }>} input.milestones
 */
export function calculateQuotation({
    items,
    discountType,
    discountValue,
    vatRate,
    currencyDecimals,
    exchangeRate,
    paymentMode,
    milestones,
}) {
    const errors = {};

    const lines = items.map((item, index) => {
        if (item.qti_type !== "item") {
            return { gross: 0n, discount: 0n, amount: 0n, listTotal: null, belowListBy: 0n };
        }
        try {
            const line = calculateLine({
                quantity: item.qti_quantity,
                unitPrice: item.qti_unit_price,
                discountType: item.qti_discount_type ?? "amount",
                discountValue: item.qti_discount_value ?? "0",
                currencyDecimals,
            });
            // ขายต่ำกว่าราคาตั้งต้น: เทียบยอดบรรทัด (หลังส่วนลดบรรทัด) กับ จำนวน × ราคาตั้งต้น
            let listTotal = null;
            let belowListBy = 0n;
            if (item.qti_list_price !== null && item.qti_list_price !== undefined && item.qti_list_price !== "") {
                listTotal = calculateLine({
                    quantity: item.qti_quantity,
                    unitPrice: item.qti_list_price,
                    currencyDecimals,
                }).gross;
                belowListBy = listTotal > line.amount ? listTotal - line.amount : 0n;
            }
            return { ...line, listTotal, belowListBy };
        } catch (err) {
            if (!(err instanceof MoneyInputError)) throw err;
            const column = LINE_FIELD_COLUMNS[err.field] ?? "qti_unit_price";
            errors[`items.${index}.${column}`] = err.message;
            return { gross: 0n, discount: 0n, amount: 0n, listTotal: null, belowListBy: 0n };
        }
    });

    let totals = { subtotal: 0n, discount: 0n, afterDiscount: 0n, vatRate: 0n, vat: 0n, total: 0n };
    try {
        totals = calculateDocumentTotals({
            lineAmounts: lines.map((line) => line.amount),
            discountType,
            discountValue,
            vatRate,
            currencyDecimals,
        });
    } catch (err) {
        if (!(err instanceof MoneyInputError)) throw err;
        errors.qt_discount_value = err.message;
    }

    let afterDiscountThb = 0n;
    let totalThb = 0n;
    try {
        afterDiscountThb = convertToBaht(totals.afterDiscount, exchangeRate);
        totalThb = convertToBaht(totals.total, exchangeRate);
    } catch (err) {
        if (!(err instanceof MoneyInputError)) throw err;
        errors.qt_exchange_rate = err.message;
    }

    // งวดชำระ: ผลรวมไม่ตรงยังบันทึกร่างได้ (milestonesError บอกไว้) แต่ส่งขออนุมัติไม่ได้
    let milestoneAmounts = [];
    let milestonesError = null;
    if (paymentMode === "milestones") {
        try {
            milestoneAmounts = splitIntoMilestones({
                milestones: milestones.map((milestone) => ({
                    percent: milestone.qtm_percent,
                    amount: milestone.qtm_amount,
                })),
                total: totals.total,
                currencyDecimals,
            }).map((milestone) => milestone.amount);
        } catch (err) {
            if (!(err instanceof MoneyInputError)) throw err;
            milestonesError = err.message;
            milestoneAmounts = milestones.map(() => null);
        }
    }

    const belowListLines = lines.filter((line) => line.belowListBy > 0n);
    return {
        errors,
        lines,
        ...totals,
        afterDiscountThb,
        totalThb,
        milestoneAmounts,
        milestonesError,
        belowList: {
            lineCount: belowListLines.length,
            amount: belowListLines.reduce((sum, line) => sum + line.belowListBy, 0n),
        },
    };
}

/** ร้อยส่วน → "1234.50" หรือ null — ไว้ส่งใน API / บันทึกลง DECIMAL */
export function toDecimalText(hundredths) {
    return hundredths === null || hundredths === undefined ? null : formatHundredths(hundredths);
}
