// ─── ตรวจเลขประจำตัวผู้เสียภาษี 13 หลักของไทย ─────────────────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// ใช้ได้ทั้งเลขนิติบุคคล (0-1055-xxxxx-xx-x) และเลขบัตรประชาชน — หลักสุดท้ายเป็นเลขตรวจสอบ (check digit)
// คำนวณ: คูณหลักที่ 1-12 ด้วย 13, 12, ..., 2 แล้วรวม → (11 − ผลรวม mod 11) mod 10 ต้องเท่ากับหลักที่ 13
// ช่วยจับการพิมพ์ผิด 1 หลัก/สลับหลัก ก่อนเลขผิดไปอยู่บนใบกำกับภาษี

/**
 * ตัดช่องว่างและขีดที่ผู้ใช้พิมพ์คั่นออก ("0-1055-55000-00-1" → "0105555000001")
 * @param {string} value
 * @returns {string}
 */
export function normalizeThaiTaxId(value) {
    return String(value ?? "").replace(/[\s-]/g, "");
}

/**
 * @param {string} value เลข 13 หลัก (คั่นด้วยขีด/ช่องว่างได้)
 * @returns {boolean}
 */
export function isValidThaiTaxId(value) {
    const digits = normalizeThaiTaxId(value);
    if (!/^\d{13}$/.test(digits)) return false;

    let weightedSum = 0;
    for (let index = 0; index < 12; index++) {
        weightedSum += Number(digits[index]) * (13 - index);
    }
    const checkDigit = (11 - (weightedSum % 11)) % 10;
    return checkDigit === Number(digits[12]);
}
