// เทสต์ข้อความ QR พร้อมเพย์ (src/shared/promptpay.mjs) — แบบระบบ 2026-10-14-invoices-1b.md R-B11
const test = require("node:test");
const assert = require("node:assert/strict");
const { crc16, normalizePromptPayId, buildPromptPayPayload } = require("../src/shared/promptpay.mjs");

// แยกข้อความ EMVCo เป็นช่อง [รหัส, ค่า] เพื่อตรวจทีละช่อง (อ่านแบบเดียวกับแอปธนาคาร)
function parseFields(payload) {
    const fields = [];
    let position = 0;
    while (position < payload.length) {
        const id = payload.slice(position, position + 2);
        const length = Number(payload.slice(position + 2, position + 4));
        fields.push([id, payload.slice(position + 4, position + 4 + length)]);
        position += 4 + length;
    }
    return fields;
}

test("CRC16: ค่าตรวจสอบมาตรฐาน CCITT-FALSE ของ \"123456789\" = 29B1", () => {
    assert.equal(crc16("123456789"), "29B1");
});

// ตัวอย่างจากชุดทดสอบของไลบรารี dtinth/promptpay-qr (index.test.js, ตรวจ 14 ต.ค. 2026) — QR ที่แอปธนาคารอ่านได้จริง
// ไลบรารีเรียงช่อง 58 ก่อน 53 ต่างจากเรา (ลำดับช่องไม่มีผลกับการอ่าน) จึงเทียบ CRC และค่าของแต่ละช่องแทนทั้งข้อความ
const REFERENCE_PAYLOADS = [
    "00020101021129370016A000000677010111011300668012345675802TH530376463046197",
    "00020101021129370016A000000677010111021311111111111115802TH530376463047B5A",
    "00020101021129370016A000000677010111021301234567890125802TH530376463040CBD",
    "00020101021129390016A00000067701011103150123456789012345802TH530376463049781",
    "00020101021229370016A000000677010111011300660000000005802TH530376454044.226304E469",
];

test("CRC16: ตรงกับ QR ตัวอย่างของไลบรารีพร้อมเพย์ที่ใช้กันทั่วไปทุกตัว", () => {
    for (const payload of REFERENCE_PAYLOADS) {
        assert.equal(crc16(payload.slice(0, -4)), payload.slice(-4), payload);
    }
});

test("ช่องข้อมูลตรงกับ QR ตัวอย่าง: เบอร์มือถือ / เลข 13 หลัก / e-Wallet / มียอด", () => {
    const cases = [
        [{ promptPayId: "0801234567" }, REFERENCE_PAYLOADS[0]],
        [{ promptPayId: "1111111111111" }, REFERENCE_PAYLOADS[1]],
        [{ promptPayId: "012345678901234" }, REFERENCE_PAYLOADS[3]],
        [{ promptPayId: "000-000-0000", amount: 422n }, REFERENCE_PAYLOADS[4]],
    ];
    const withoutCrc = (fields) => fields.filter(([id]) => id !== "63").sort(([first], [second]) => first.localeCompare(second));
    for (const [input, reference] of cases) {
        assert.deepEqual(withoutCrc(parseFields(buildPromptPayPayload(input))), withoutCrc(parseFields(reference)), reference);
    }
});

test("เลขพร้อมเพย์: รับเบอร์มือถือ/เลข 13 หลัก/e-Wallet (มีขีดได้) · รูปแบบอื่นไม่รับ", () => {
    assert.deepEqual(normalizePromptPayId("081-234-5678"), { kind: "phone", digits: "0812345678" });
    assert.deepEqual(normalizePromptPayId("1 8199 00399 23 5"), { kind: "taxId", digits: "1819900399235" });
    assert.deepEqual(normalizePromptPayId("123456789012345"), { kind: "eWallet", digits: "123456789012345" });
    assert.equal(normalizePromptPayId("12345"), null);
    assert.equal(normalizePromptPayId("1812345678"), null, "10 หลักต้องขึ้นต้นด้วย 0");
    assert.equal(normalizePromptPayId(""), null);
});

test("QR เบอร์มือถือมียอด: ชนิดใช้ครั้งเดียว · 0066 + เบอร์ · ยอด 2 ทศนิยม · CRC ตรง", () => {
    const payload = buildPromptPayPayload({ promptPayId: "0812345678", amount: 104000n });
    const fields = parseFields(payload);
    assert.deepEqual(fields, [
        ["00", "01"],
        ["01", "12"],
        ["29", "0016A000000677010111" + "0113" + "0066812345678"],
        ["53", "764"],
        ["54", "1040.00"],
        ["58", "TH"],
        ["63", payload.slice(-4)],
    ]);
    assert.equal(payload.slice(-4), crc16(payload.slice(0, -4)), "CRC คิดจากทุกตัวอักษรก่อนหน้ารวม 6304");
});

test("QR เลขผู้เสียภาษีไม่มียอด: ชนิดใช้ซ้ำได้ ไม่มีช่อง 54", () => {
    const fields = parseFields(buildPromptPayPayload({ promptPayId: "1819900399235" }));
    assert.deepEqual(fields.slice(0, 3), [
        ["00", "01"],
        ["01", "11"],
        ["29", "0016A000000677010111" + "0213" + "1819900399235"],
    ]);
    assert.ok(!fields.some(([id]) => id === "54"));
});

test("QR: ยอดเศษสตางค์หลักเดียวเติม 0 (5.05 ไม่ใช่ 5.5) · ยอด 0/ติดลบ/เลขผิดถูกปฏิเสธ", () => {
    const fields = parseFields(buildPromptPayPayload({ promptPayId: "0812345678", amount: 505n }));
    assert.deepEqual(fields.find(([id]) => id === "54"), ["54", "5.05"]);
    assert.throws(() => buildPromptPayPayload({ promptPayId: "0812345678", amount: 0n }), /มากกว่า 0/);
    assert.throws(() => buildPromptPayPayload({ promptPayId: "999" }), /เลขพร้อมเพย์/);
});
