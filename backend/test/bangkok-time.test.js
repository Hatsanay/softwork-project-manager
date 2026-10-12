const test = require("node:test");
const assert = require("node:assert/strict");
const { todayBangkok, compactDateBangkok, currentYearMonthBangkok, nowBangkokText } = require("../src/utils/bangkok-time");

// ทุกเคสใช้เวลา UTC ที่ระบุตายตัว — ผลต้องเหมือนกันไม่ว่าเครื่องที่รันเทสต์ตั้ง timezone อะไร
// (npm test รันชุดนี้ซ้ำอีกรอบด้วย TZ=UTC ด้วย)

test("เที่ยงคืนตรงตามเวลาไทยนับเป็นวันใหม่แล้ว", () => {
    const midnightBangkok = new Date("2026-10-11T17:00:00Z");
    assert.equal(todayBangkok(midnightBangkok), "2026-10-12");
    assert.equal(nowBangkokText(midnightBangkok), "2026-10-12 00:00:00");
});

test("หนึ่งวินาทีก่อนเที่ยงคืนไทยยังเป็นวันเดิม", () => {
    const beforeMidnight = new Date("2026-10-11T16:59:59Z");
    assert.equal(todayBangkok(beforeMidnight), "2026-10-11");
});

test("ช่วงตี 0 ถึง 7 โมงเช้าไทย (วันที่ของ UTC ยังเป็นเมื่อวาน) ได้วันที่ไทย", () => {
    const sixAmBangkok = new Date("2026-10-11T23:00:00Z");
    assert.equal(compactDateBangkok(sixAmBangkok), "20261012");
});

test("ข้ามปีตอนเที่ยงคืนไทย ได้เดือนมกราคมของปีใหม่", () => {
    const newYearBangkok = new Date("2026-12-31T17:00:00Z");
    assert.equal(todayBangkok(newYearBangkok), "2027-01-01");
    assert.deepEqual(currentYearMonthBangkok(newYearBangkok), { year: 2027, month: 1 });
});

test("วันที่ 29 กุมภาพันธ์ของปีอธิกสุรทินถูกต้อง", () => {
    const leapDayBangkok = new Date("2028-02-28T17:00:00Z");
    assert.equal(todayBangkok(leapDayBangkok), "2028-02-29");
});

test("เที่ยงคืนแสดงชั่วโมงเป็น 00 ไม่ใช่ 24", () => {
    const midnightBangkok = new Date("2026-01-14T17:00:00Z");
    assert.match(nowBangkokText(midnightBangkok), / 00:00:00$/);
});
