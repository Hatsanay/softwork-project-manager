// คิดรอบของบริการรายรอบ (2026-10-31) · วันยาก: ปลายเดือน · ปีอธิกสุรทิน · ข้ามปี · ช่องว่างหลังยกเลิกรอบกลาง
const test = require("node:test");
const assert = require("node:assert/strict");

let math;
test.before(async () => {
    math = await import("../src/shared/renewal-math.mjs");
});

test("ปลายเดือน: 31 ม.ค. รายเดือน → 28 ก.พ. → 31 มี.ค. (ไม่เลื่อนเป็น 28 ไปตลอด) · ปีอธิกสุรทินได้ 29", () => {
    const anchor = 31;
    let date = "2027-01-31";
    const path = [];
    for (let index = 0; index < 4; index += 1) {
        date = math.addCycle(date, 1, anchor);
        path.push(date);
    }
    assert.deepEqual(path, ["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
    assert.equal(math.addCycle("2028-01-31", 1, 31), "2028-02-29");
});

test("29 ก.พ. รายปี: 2029 = 28 ก.พ. · ปีอธิกสุรทินถัดไปกลับเป็น 29 · ข้ามปีจาก ธ.ค.", () => {
    assert.equal(math.addCycle("2028-02-29", 12, 29), "2029-02-28");
    assert.equal(math.addCycle("2031-02-28", 12, 29), "2032-02-29");
    assert.equal(math.addCycle("2026-12-15", 1, 15), "2027-01-15");
    assert.equal(math.addCycle("2026-11-30", 3, 30), "2027-02-28");
    assert.equal(math.addCycle("2026-11-01", 24, 1), "2028-11-01");
});

test("ช่วงบริการ: สิ้นสุด = วันก่อนรอบถัดไป · จำนวนวันระหว่างวันที่", () => {
    assert.deepEqual(math.periodOf("2026-11-01", 12, 1), {
        start: "2026-11-01",
        end: "2027-10-31",
        next: "2027-11-01",
    });
    assert.deepEqual(math.periodOf("2027-01-31", 1, 31), {
        start: "2027-01-31",
        end: "2027-02-27",
        next: "2027-02-28",
    });
    assert.equal(math.shiftDays("2027-03-01", -1), "2027-02-28");
    assert.equal(math.daysBetweenDates("2026-10-31", "2026-11-30"), 30);
    assert.equal(math.daysBetweenDates("2026-10-31", "2026-10-21"), -10);
});

test("ช่องว่างหลังยกเลิกรอบกลาง: ออกรอบที่ว่างแล้ว วันครบกระโดดข้ามรอบที่ออกไว้แล้ว", () => {
    const billed = new Set(["2027-02-01", "2027-03-01"]);
    assert.equal(math.nextOpenStart("2027-01-01", 1, 1, billed), "2027-04-01");
    assert.equal(math.nextOpenStart("2027-03-01", 1, 1, new Set()), "2027-04-01");
});

test("ชื่อรอบที่คนอ่าน", () => {
    assert.equal(math.cycleLabel(1), "ทุกเดือน");
    assert.equal(math.cycleLabel(3), "ทุก 3 เดือน");
    assert.equal(math.cycleLabel(12), "ทุกปี");
    assert.equal(math.cycleLabel(24), "ทุก 2 ปี");
    assert.equal(math.cycleUnit(12), "ปี");
    assert.equal(math.cycleUnit(6), "6 เดือน");
});
