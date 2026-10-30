// กติกาของหน้าตั้งค่าบริษัทที่ไม่ต้องใช้ฐานข้อมูล: เลขผู้เสียภาษี, ชุดตรวจข้อมูล, คำเตือนกติกาอนุมัติ
const test = require("node:test");
const assert = require("node:assert/strict");
const { isValidThaiTaxId, normalizeThaiTaxId } = require("../src/shared/thai-tax-id.mjs");
const { approvalLevelsSchema, currencyCreateSchema } = require("../src/shared/schemas/company.mjs");
const { buildApprovalWarnings } = require("../src/services/approval-rules.service");

test("เลขผู้เสียภาษี: ตรวจหลักตรวจสอบ · พิมพ์คั่นด้วยขีด/ช่องว่างได้", () => {
    assert.equal(isValidThaiTaxId("0105555000005"), true);
    assert.equal(isValidThaiTaxId("0-1055-55000-00-5"), true);
    assert.equal(isValidThaiTaxId("0105555000001"), false); // หลักสุดท้ายผิด
    assert.equal(isValidThaiTaxId("0105555000050"), false); // สลับหลัก
    assert.equal(isValidThaiTaxId("010555500000"), false); // 12 หลัก
    assert.equal(isValidThaiTaxId(""), false);
    assert.equal(normalizeThaiTaxId(" 0-1055 55000-00-5 "), "0105555000005");
});

test("กติกาอนุมัติ: ยอดเป็นข้อความ 2 ตำแหน่ง · ชั้นถัดไปต้องมากกว่าชั้นก่อน · ชั้น 1 = 0", () => {
    const valid = approvalLevelsSchema.safeParse({
        levels: [
            { al_min_amount_thb: 0, al_require_distinct: false, role_ids: ["A"] },
            { al_min_amount_thb: "100,000.5", al_require_distinct: true, role_ids: ["B"] },
        ],
    });
    assert.equal(valid.success, true);
    assert.deepEqual(
        valid.data.levels.map((level) => level.al_min_amount_thb),
        ["0.00", "100000.50"],
    );

    const invalid = approvalLevelsSchema.safeParse({
        levels: [
            { al_min_amount_thb: "1", al_require_distinct: true, role_ids: ["A", "A"] },
            { al_min_amount_thb: "1", al_require_distinct: false, role_ids: [] },
        ],
    });
    assert.equal(invalid.success, false);
    const paths = invalid.error.issues.map((issue) => issue.path.join("."));
    assert.ok(paths.includes("levels.1.role_ids"), "ชั้นที่ไม่มี role");
});

test("กติกาอนุมัติ: ตรวจลำดับและชั้น 1 เมื่อข้อมูลรายชั้นถูกรูปแบบแล้ว", () => {
    const result = approvalLevelsSchema.safeParse({
        levels: [
            { al_min_amount_thb: "1", al_require_distinct: true, role_ids: ["A", "A"] },
            { al_min_amount_thb: "1", al_require_distinct: false, role_ids: ["B"] },
        ],
    });
    assert.equal(result.success, false);
    const paths = result.error.issues.map((issue) => issue.path.join("."));
    assert.deepEqual(paths.sort(), [
        "levels.0.al_min_amount_thb",
        "levels.0.al_require_distinct",
        "levels.0.role_ids",
        "levels.1.al_min_amount_thb",
    ]);
});

test("กติกาอนุมัติค่าใช้จ่าย (EX/EC): ชั้น 1 เริ่มเกิน 0 ได้ · ต่ำกว่านั้นผ่านอัตโนมัติ · เอกสารขายยังต้องเริ่มที่ 0", () => {
    const levels = [{ al_min_amount_thb: "3000", al_require_distinct: false, role_ids: ["A"] }];
    assert.equal(approvalLevelsSchema.safeParse({ doc_type: "EX", levels }).success, true);
    assert.equal(approvalLevelsSchema.safeParse({ doc_type: "EC", levels }).success, true);
    const invoice = approvalLevelsSchema.safeParse({ doc_type: "IV", levels });
    assert.equal(invoice.success, false);
    assert.equal(invoice.error.issues[0].path.join("."), "levels.0.al_min_amount_thb");
});

test("สกุลเงิน: รหัสต้องเป็นตัวอักษร 3 ตัว (แปลงเป็นตัวใหญ่ให้)", () => {
    const currency = {
        cur_name_th: "ยูโร",
        cur_name_en: "Euro",
        cur_symbol: "€",
        cur_decimals: 2,
        cur_unit_th: "ยูโร",
        cur_subunit_th: "เซนต์",
        cur_unit_en: "Euros",
        cur_subunit_en: "Cents",
        cur_bot_unit: 1,
        cur_sort_order: 4,
        cur_status: "active",
    };
    assert.equal(currencyCreateSchema.parse({ ...currency, cur_code: " eur " }).cur_code, "EUR");
    assert.equal(currencyCreateSchema.safeParse({ ...currency, cur_code: "EU" }).success, false);
    assert.equal(currencyCreateSchema.safeParse({ ...currency, cur_code: "EUR", cur_bot_unit: 10 }).success, false);
});

test("คำเตือนกติกาอนุมัติ: ชั้นที่ไม่มีผู้อนุมัติ และชั้นคนละคนที่มีผู้อนุมัติคนเดียวซ้ำกับชั้นก่อน", () => {
    const somchai = { user_id: "U1", full_name: "สมชาย" };
    const somsri = { user_id: "U2", full_name: "สมศรี" };

    assert.deepEqual(
        buildApprovalWarnings([
            { al_level: 1, al_require_distinct: false, eligible_users: [somchai] },
            { al_level: 2, al_require_distinct: true, eligible_users: [somsri] },
        ]),
        [],
    );

    const warnings = buildApprovalWarnings([
        { al_level: 1, al_require_distinct: false, eligible_users: [somchai, somsri] },
        { al_level: 2, al_require_distinct: true, eligible_users: [somchai] },
        { al_level: 3, al_require_distinct: false, eligible_users: [] },
    ]);
    assert.equal(warnings.length, 2);
    assert.match(warnings[0], /ชั้น 2.*สมชาย/);
    assert.match(warnings[1], /ชั้น 3/);
});
