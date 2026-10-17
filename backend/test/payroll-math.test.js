// คำนวณวันทำงาน / ชั่วโมงมาตรฐาน / ประกันสังคม / ค่าแรงต่อชั่วโมง (เฟส 4 ขั้น 4-2) — BigInt ล้วน ไม่ขึ้นกับเขตเวลาเครื่อง
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    addDays,
    weekStartOf,
    weekDates,
    workingDatesOfMonth,
    standardHoursOf,
    ssoContributionOf,
    laborCostOf,
} = require("../src/shared/payroll-math.mjs");

const SSO_2026 = { rate: "5.00", floor: "1650.00", ceiling: "17500.00" };

test("สัปดาห์เริ่มวันจันทร์ · วันอาทิตย์อยู่สัปดาห์ก่อนหน้า · ข้ามเดือน/ปีได้", () => {
    assert.equal(weekStartOf("2026-10-19"), "2026-10-19", "จันทร์คือวันเริ่มเอง");
    assert.equal(weekStartOf("2026-10-25"), "2026-10-19", "อาทิตย์อยู่สัปดาห์เดียวกับจันทร์ก่อนหน้า");
    assert.equal(weekStartOf("2027-01-01"), "2026-12-28");
    assert.deepEqual(weekDates("2026-12-28"), [
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
    ]);
    assert.equal(addDays("2028-02-28", 1), "2028-02-29", "ปีอธิกสุรทิน");
});

test("วันทำงานของเดือนไม่รวมวันหยุดบริษัท · ชั่วโมงมาตรฐาน = วันทำงาน × ชั่วโมงต่อวัน", () => {
    const mondayToFriday = workingDatesOfMonth("2026-10", "1111100", new Set());
    assert.equal(mondayToFriday.length, 22);
    const withHolidays = workingDatesOfMonth("2026-10", "1111100", new Set(["2026-10-13", "2026-10-23", "2026-10-24"]));
    assert.equal(withHolidays.length, 20, "วันหยุดที่ตรงวันเสาร์ไม่ลดวันทำงาน");
    assert.equal(workingDatesOfMonth("2026-10", "1111110", new Set()).length, 27, "ทำงานวันเสาร์ด้วย");
    assert.equal(standardHoursOf(withHolidays.length, "8.00"), 16000n);
    assert.equal(standardHoursOf(20, "7.50"), 15000n);
});

test("ประกันสังคม: จำกัดฐานขั้นต่ำ–เพดาน แล้วปัดเป็นบาทเต็ม (ครึ่งบาทขึ้น)", () => {
    assert.equal(ssoContributionOf(3_000_000n, SSO_2026), 87_500n, "เกินเพดาน = 17,500 × 5% = 875");
    assert.equal(ssoContributionOf(1_234_500n, SSO_2026), 61_700n, "12,345 × 5% = 617.25 → 617");
    assert.equal(ssoContributionOf(1_235_000n, SSO_2026), 61_800n, "12,350 × 5% = 617.50 → 618");
    assert.equal(ssoContributionOf(100_000n, SSO_2026), 8_300n, "ต่ำกว่าขั้นต่ำใช้ 1,650 × 5% = 82.50 → 83");
    assert.equal(ssoContributionOf(0n, SSO_2026), 0n, "ไม่มีค่าจ้าง = ไม่หัก");
});

test("ค่าแรง = ต้นทุนเดือน × ชั่วโมงที่ลง ÷ ชั่วโมงมาตรฐาน · ชั่วโมงมาตรฐาน 0 = ค่าแรง 0 (R-H11)", () => {
    assert.equal(laborCostOf(3_287_500n, 4_000n, 16_000n), 821_875n, "32,875 × 40/160 = 8,218.75");
    assert.equal(laborCostOf(3_000_000n, 100n, 17_600n), 17_045n, "30,000 × 1/176 = 170.4545… → 170.45");
    assert.equal(laborCostOf(3_000_000n, 800n, 0n), 0n);
});
