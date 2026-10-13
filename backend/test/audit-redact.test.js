// การปิดบังข้อมูลก่อนเก็บลง audit log (redact ใน auditLog.middleware.js)
const test = require("node:test");
const assert = require("node:assert/strict");
const { redact } = require("../src/middlewares/auditLog.middleware");

test("ความลับถูกปิดบังตามชื่อฟิลด์", () => {
    const result = redact({ user_password: "Secret@123", otp: "123456", name: "สมชาย" });
    assert.deepEqual(result, { user_password: "[ปิดบัง]", otp: "[ปิดบัง]", name: "สมชาย" });
});

test("ลายเซ็นที่วาด (data URL) เหลือแค่ชนิด + ขนาด ไม่เก็บตัวรูป (R8)", () => {
    const base64 = "A".repeat(16384); // ถอดแล้ว 12 KB
    const result = redact({ signature: `data:image/png;base64,${base64}` });
    assert.deepEqual(result, { signature: "[รูปภาพ 12 KB]" });
});

test("data URL ที่ไม่ใช่รูป และ base64 เปล่าๆ ที่ยาว ก็ถูกย่อ (R8)", () => {
    const pdf = `data:application/pdf;base64,${"QUJD".repeat(1000)}`;
    assert.equal(redact(pdf), "[ไฟล์ 3 KB]");
    assert.equal(redact("QUJD".repeat(100)), "[ข้อมูล base64 1 KB]");
});

test("data URL ที่ซ้อนอยู่ในรายการก็ถูกย่อ", () => {
    const result = redact({ items: [{ image: "data:image/jpeg;base64,/9j/4AAQ" }] });
    assert.deepEqual(result, { items: [{ image: "[รูปภาพ 1 KB]" }] });
});

test("Buffer ถูกย่อเป็นขนาด ไม่แตกเป็นรายไบต์", () => {
    assert.equal(redact(Buffer.alloc(2048)), "[ไฟล์ 2 KB]");
});

test("ข้อความธรรมดาไม่ถูกแตะ — ภาษาไทยยาว, ลิงก์, ตัวเลขสั้น", () => {
    const thaiText = "รายละเอียดงานติดตั้งระบบ ".repeat(20);
    assert.equal(redact(thaiText.slice(0, 900)), thaiText.slice(0, 900));
    assert.equal(redact("https://example.com/uploads/a.png"), "https://example.com/uploads/a.png");
    assert.equal(redact("0105555000001"), "0105555000001");
});

test("ข้อความยาวเกิน 1000 ตัวอักษรยังถูกตัดเหมือนเดิม", () => {
    const longText = "ก ".repeat(800);
    assert.equal(redact(longText), `${longText.slice(0, 1000)}…`);
});
