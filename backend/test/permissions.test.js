const test = require("node:test");
const assert = require("node:assert/strict");
const { PERMISSION_KEYS, isValidPermissionString, normalizePermissionString } = require("../src/utils/permissions");

const BIT_COUNT = PERMISSION_KEYS.length;

test("สตริงสิทธิ์ที่ยาวเท่าจำนวนบิตพอดีและมีแต่ 0/1 ผ่าน", () => {
    assert.equal(isValidPermissionString("1".repeat(BIT_COUNT)), true);
    assert.equal(isValidPermissionString("0".repeat(BIT_COUNT)), true);
});

test("สตริงสิทธิ์ที่สั้นกว่า (หน้าเว็บเวอร์ชันเก่า) ถูกปฏิเสธ — ไม่งั้นสิทธิ์ใหม่จะหายเงียบๆ", () => {
    assert.equal(isValidPermissionString("1".repeat(BIT_COUNT - 1)), false);
});

test("สตริงสิทธิ์ที่ยาวเกิน หรือมีตัวอักษรอื่น หรือไม่ใช่สตริง ถูกปฏิเสธ", () => {
    assert.equal(isValidPermissionString("1".repeat(BIT_COUNT + 1)), false);
    assert.equal(isValidPermissionString("2".repeat(BIT_COUNT)), false);
    assert.equal(isValidPermissionString(undefined), false);
    assert.equal(isValidPermissionString(Number("1".repeat(BIT_COUNT))), false);
});

test("role เก่าที่สตริงสั้นกว่าถูกเติม 0 — ไม่ได้สิทธิ์ใหม่โดยอัตโนมัติ", () => {
    const normalized = normalizePermissionString("111");
    assert.equal(normalized.length, BIT_COUNT);
    assert.equal(normalized, "111" + "0".repeat(BIT_COUNT - 3));
});

test("สตริงที่ยาวกว่าจำนวนบิตของโค้ดนี้ถูกตัดบิตที่ไม่รู้จักออก", () => {
    const normalized = normalizePermissionString("1".repeat(BIT_COUNT + 6));
    assert.equal(normalized, "1".repeat(BIT_COUNT));
});

test("ค่าว่างกลายเป็นไม่มีสิทธิ์ทุกข้อ", () => {
    assert.equal(normalizePermissionString(null), "0".repeat(BIT_COUNT));
});

// ── R24/R25 ──
const { FULL_PERMISSION, effectiveRolePermission, isPermissionWithin } = require("../src/utils/permissions");

test("role ระบบได้สิทธิ์ครบทุกข้อเสมอ ไม่ว่าค่าที่เก็บไว้เป็นอะไร", () => {
    assert.equal(effectiveRolePermission("S", "0".repeat(BIT_COUNT)), FULL_PERMISSION);
    assert.equal(effectiveRolePermission("S", null), FULL_PERMISSION);
});

test("role ปกติใช้สิทธิ์ตามที่เก็บไว้ (ปรับความยาวให้ตรง)", () => {
    assert.equal(effectiveRolePermission("R", "1"), "1" + "0".repeat(BIT_COUNT - 1));
});

test("สิทธิ์ของเป้าหมายไม่เกินผู้กระทำ: ทุกข้อที่เป้าหมายมี ผู้กระทำต้องมีด้วย", () => {
    assert.equal(isPermissionWithin("1100", "1110"), true);
    assert.equal(isPermissionWithin("1110", "1110"), true);
    assert.equal(isPermissionWithin("0001", "1110"), false);
    assert.equal(isPermissionWithin("", "0"), true, "ไม่มีสิทธิ์อะไรเลย = ไม่เกินใคร");
    assert.equal(isPermissionWithin(FULL_PERMISSION, FULL_PERMISSION), true);
});
