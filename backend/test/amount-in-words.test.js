// เทสต์จำนวนเงินเป็นตัวอักษร (src/shared/amount-in-words.mjs) — คำอ่านไทยเทียบกับ BAHTTEXT ของ Excel
const test = require("node:test");
const assert = require("node:assert/strict");
const { amountInWords } = require("../src/shared/amount-in-words.mjs");

const THB = {
    cur_decimals: 2,
    cur_unit_th: "บาท",
    cur_subunit_th: "สตางค์",
    cur_unit_en: "Baht",
    cur_subunit_en: "Satang",
};
const USD = {
    cur_decimals: 2,
    cur_unit_th: "ดอลลาร์สหรัฐ",
    cur_subunit_th: "เซนต์",
    cur_unit_en: "US Dollars",
    cur_subunit_en: "Cents",
};
const JPY = { cur_decimals: 0, cur_unit_th: "เยน", cur_subunit_th: null, cur_unit_en: "Yen", cur_subunit_en: null };

test("ไทย: ตัวอย่างตามแบบระบบ", () => {
    assert.equal(amountInWords("12000.50", THB, "th"), "หนึ่งหมื่นสองพันบาทห้าสิบสตางค์");
    assert.equal(amountInWords("1500", USD, "th"), "หนึ่งพันห้าร้อยดอลลาร์สหรัฐถ้วน");
});

test("ไทย: เอ็ด ยี่สิบ สิบ ตามกติกา BAHTTEXT", () => {
    const cases = {
        0: "ศูนย์บาทถ้วน",
        1: "หนึ่งบาทถ้วน",
        10: "สิบบาทถ้วน",
        11: "สิบเอ็ดบาทถ้วน",
        20: "ยี่สิบบาทถ้วน",
        21: "ยี่สิบเอ็ดบาทถ้วน",
        101: "หนึ่งร้อยเอ็ดบาทถ้วน",
        110: "หนึ่งร้อยสิบบาทถ้วน",
        1001: "หนึ่งพันเอ็ดบาทถ้วน",
        1000000: "หนึ่งล้านบาทถ้วน",
        1000001: "หนึ่งล้านเอ็ดบาทถ้วน",
        1000010: "หนึ่งล้านสิบบาทถ้วน",
        21000000: "ยี่สิบเอ็ดล้านบาทถ้วน",
        1234567.89: "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์",
        1000000000000: "หนึ่งล้านล้านบาทถ้วน",
        9999999999999.99:
            "เก้าล้านเก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้าล้านเก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้าบาทเก้าสิบเก้าสตางค์",
    };
    for (const [amount, expected] of Object.entries(cases)) {
        assert.equal(amountInWords(amount, THB, "th"), expected, amount);
    }
});

test("ไทย: มีแต่สตางค์ · สตางค์อ่านแยก (1 สตางค์ = หนึ่ง ไม่ใช่เอ็ด)", () => {
    assert.equal(amountInWords("0.50", THB, "th"), "ห้าสิบสตางค์");
    assert.equal(amountInWords("0.01", THB, "th"), "หนึ่งสตางค์");
    assert.equal(amountInWords("1.01", THB, "th"), "หนึ่งบาทหนึ่งสตางค์");
    assert.equal(amountInWords("5.21", THB, "th"), "ห้าบาทยี่สิบเอ็ดสตางค์");
});

test("สกุลไม่มีทศนิยม: ปัดเป็นเต็มหน่วยก่อนอ่าน ไม่อ่านหน่วยย่อย", () => {
    assert.equal(amountInWords("1500.50", JPY, "th"), "หนึ่งพันห้าร้อยเอ็ดเยนถ้วน");
    assert.equal(amountInWords("1500.49", JPY, "en"), "One Thousand Five Hundred Yen Only");
});

test("อังกฤษ: ตัวอย่างตามแบบระบบ + หน่วยย่อย", () => {
    assert.equal(amountInWords("1500", USD, "en"), "One Thousand Five Hundred US Dollars Only");
    assert.equal(amountInWords("12000.50", THB, "en"), "Twelve Thousand Baht and Fifty Satang Only");
    assert.equal(amountInWords("0.75", USD, "en"), "Seventy-Five Cents Only");
    assert.equal(amountInWords("0", USD, "en"), "Zero US Dollars Only");
});

test("อังกฤษ: เอกพจน์เมื่อเป็น 1 · หลักใหญ่ · เลขภายในกลุ่ม", () => {
    assert.equal(amountInWords("1.01", USD, "en"), "One US Dollar and One Cent Only");
    assert.equal(amountInWords("1", THB, "en"), "One Baht Only");
    assert.equal(amountInWords("115", THB, "en"), "One Hundred Fifteen Baht Only");
    assert.equal(amountInWords("1000001", THB, "en"), "One Million One Baht Only");
    assert.equal(
        amountInWords("9999999999999.99", USD, "en"),
        "Nine Trillion Nine Hundred Ninety-Nine Billion Nine Hundred Ninety-Nine Million Nine Hundred Ninety-Nine Thousand " +
            "Nine Hundred Ninety-Nine US Dollars and Ninety-Nine Cents Only",
    );
});

test("รับร้อยส่วนแบบ BigInt ได้ · ยอดติดลบ (ใบลดหนี้ในอนาคต) มีคำว่า ลบ / Minus", () => {
    assert.equal(amountInWords(123450n, THB, "th"), "หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์");
    assert.equal(amountInWords("-100", THB, "th"), "ลบหนึ่งร้อยบาทถ้วน");
    assert.equal(amountInWords("-100", THB, "en"), "Minus One Hundred Baht Only");
});
