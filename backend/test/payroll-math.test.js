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

// ─── รอบเงินเดือน (ขั้น 4-4) ──────────────────────────────────────────────────────────────────

const {
    daysInMonth,
    prorateByDays,
    unpaidLeaveDeductionOf,
    incomeTaxOf,
    annualNetIncomeOf,
    monthlyWithholdingOf,
} = require("../src/shared/payroll-math.mjs");

const BRACKETS_2026 = [
    { from: "0.00", rate: "0.00" },
    { from: "150000.00", rate: "5.00" },
    { from: "300000.00", rate: "10.00" },
    { from: "500000.00", rate: "15.00" },
    { from: "750000.00", rate: "20.00" },
    { from: "1000000.00", rate: "25.00" },
    { from: "2000000.00", rate: "30.00" },
    { from: "5000000.00", rate: "35.00" },
];
const TAX_YEAR = { expenseRate: "50.00", expenseCap: "100000.00" };
const PERSONAL_ALLOWANCE = 6_000_000n;
const baht = (amount) => BigInt(Math.round(amount * 100));

test("สัดส่วนวัน: เข้างานกลางเดือน · ขึ้นเงินเดือนกลางเดือน · ทั้งเดือนได้เต็ม", () => {
    assert.equal(daysInMonth("2026-02"), 28);
    assert.equal(daysInMonth("2028-02"), 29);
    assert.equal(prorateByDays([{ amount: baht(30000), days: 31 }], 31), baht(30000), "ทั้งเดือน = เต็ม");
    assert.equal(
        prorateByDays([{ amount: baht(31000), days: 16 }], 31),
        baht(16000),
        "เข้างาน 16 ต.ค.: 31,000 × 16/31",
    );
    assert.equal(
        prorateByDays(
            [
                { amount: baht(30000), days: 14 },
                { amount: baht(36000), days: 16 },
            ],
            30,
        ),
        baht(33200),
        "ขึ้นเงินเดือนวันที่ 15: (30,000×14 + 36,000×16) ÷ 30",
    );
});

test("หักลาไม่รับค่าจ้าง: ÷30 หรือ ÷วันทำงาน · ครึ่งวัน", () => {
    const days = [
        { salary: baht(30000), dayUnits: 100n },
        { salary: baht(30000), dayUnits: 50n },
    ];
    assert.equal(unpaidLeaveDeductionOf(days, 30), baht(1500), "1.5 วัน × 1,000");
    assert.equal(unpaidLeaveDeductionOf(days, 22), 204_545n, "30,000 × 1.5 ÷ 22 = 2,045.45");
    assert.equal(unpaidLeaveDeductionOf([], 30), 0n);
});

test("ภาษีขั้นบันได: ไม่ถึง 150,000 ไม่เสีย · คิดเป็นขั้น", () => {
    assert.equal(incomeTaxOf(baht(150000), BRACKETS_2026), 0n);
    assert.equal(incomeTaxOf(baht(429500), BRACKETS_2026), baht(20450), "7,500 + 12,950");
    assert.equal(
        incomeTaxOf(baht(1200000), BRACKETS_2026),
        baht(165000),
        "7,500 + 20,000 + 37,500 + 50,000 + 50,000 (ส่วนเกิน 1 ล้าน 25%)",
    );
    assert.equal(
        annualNetIncomeOf({
            annualIncome: baht(600000),
            ...TAX_YEAR,
            allowances: PERSONAL_ALLOWANCE,
            ssoAnnual: baht(10500),
        }),
        baht(429500),
        "หักค่าใช้จ่ายเต็มเพดาน 100,000",
    );
});

// จำลองทั้งปีแบบที่รอบเงินเดือนคิด: ประมาณการทั้งปีจากเดือนนี้ → หักเดือนนี้ = ที่ค้าง ÷ เดือนที่เหลือ · ธันวาคม true-up
function simulateYear(monthlySalaries) {
    let incomeBefore = 0n;
    let ssoBefore = 0n;
    let withheldBefore = 0n;
    const withheld = [];
    monthlySalaries.forEach((salary, index) => {
        const remainingMonths = 12 - index;
        const sso = salary === 0n ? 0n : 87_500n;
        const annualIncome = incomeBefore + salary * BigInt(remainingMonths);
        const ssoAnnual = ssoBefore + sso * BigInt(remainingMonths);
        const net = annualNetIncomeOf({ annualIncome, ...TAX_YEAR, allowances: PERSONAL_ALLOWANCE, ssoAnnual });
        const tax = monthlyWithholdingOf({
            annualTax: incomeTaxOf(net, BRACKETS_2026),
            withheldBefore,
            remainingMonths,
        });
        withheld.push(tax);
        incomeBefore += salary;
        ssoBefore += sso;
        withheldBefore += tax;
    });
    const actualNet = annualNetIncomeOf({
        annualIncome: incomeBefore,
        ...TAX_YEAR,
        allowances: PERSONAL_ALLOWANCE,
        ssoAnnual: ssoBefore,
    });
    return { withheld, total: withheldBefore, actualTax: incomeTaxOf(actualNet, BRACKETS_2026) };
}

test("ภาษีทั้งปี 12 เดือน: เงินเดือนคงที่ · ขึ้นเงินเดือนกลางปี · เข้างานกลางปี — ยอดหักรวมเท่าภาษีจริงทั้งปีพอดี (R-H5)", () => {
    const flat = simulateYear(Array(12).fill(baht(50000)));
    assert.equal(flat.total, baht(20450));
    assert.equal(flat.total, flat.actualTax);
    const firstMonth = flat.withheld[0];
    assert.ok(
        flat.withheld.every((tax) => tax - firstMonth <= 2n && firstMonth - tax <= 2n),
        "ทุกเดือนต่างกันไม่เกิน 2 สตางค์ (เศษจากการปัด)",
    );

    const raised = simulateYear([...Array(6).fill(baht(50000)), ...Array(6).fill(baht(70000))]);
    assert.equal(raised.total, raised.actualTax, "ขึ้นเงินเดือน ก.ค.");

    const joined = simulateYear([...Array(4).fill(0n), baht(15000), ...Array(7).fill(baht(40000))]);
    assert.equal(joined.total, joined.actualTax, "เข้างาน พ.ค. (เดือนแรกได้ครึ่งเดือน)");
    assert.ok(joined.withheld.every((tax) => tax >= 0n));
});
