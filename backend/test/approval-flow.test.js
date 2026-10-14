// เทสต์แผนอนุมัติและการผ่านหลายชั้น (src/shared/approval-flow.mjs) — ตัวอย่างตามแบบระบบหัวข้อ 3
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildApprovalPlan, evaluateApproval } = require("../src/shared/approval-flow.mjs");

const SALES_HEAD = { role_id: "ROL-SALES", role_name: "หัวหน้าฝ่ายขาย" };
const MANAGER = { role_id: "ROL-MANAGER", role_name: "ผู้จัดการ" };
const DIRECTOR = { role_id: "ROL-DIRECTOR", role_name: "กรรมการผู้จัดการ" };

const RULES = [
    { al_level: 1, al_min_amount_thb: "0.00", al_require_distinct: false, roles: [SALES_HEAD, DIRECTOR] },
    { al_level: 2, al_min_amount_thb: "100000.00", al_require_distinct: false, roles: [MANAGER, DIRECTOR] },
    { al_level: 3, al_min_amount_thb: "1000000.00", al_require_distinct: true, roles: [DIRECTOR] },
];

function actor(userId, role, canApprove = true) {
    return { user_id: userId, role_id: role.role_id, can_approve_quotations: canApprove };
}

function evaluate(plan, currentLevel, user, extra = {}) {
    return evaluateApproval({
        plan,
        currentLevel,
        approvalsThisRound: extra.approvals ?? [],
        actor: user,
        creatorId: extra.creatorId ?? "USER-CREATOR",
        allowSelfApproval: extra.allowSelfApproval ?? false,
    });
}

test("แผน: ยอดถึงเกณฑ์ชั้นไหนต้องผ่านชั้นนั้นและทุกชั้นก่อนหน้า (เทียบยอดก่อน VAT เป็นบาท)", () => {
    assert.deepEqual(
        buildApprovalPlan(RULES, "50000.00").map((level) => level.level),
        [1],
    );
    assert.deepEqual(
        buildApprovalPlan(RULES, "250000.00").map((level) => level.level),
        [1, 2],
    );
    // ยอดเท่าเกณฑ์พอดี = ต้องผ่านชั้นนั้น
    assert.deepEqual(
        buildApprovalPlan(RULES, "100000.00").map((level) => level.level),
        [1, 2],
    );
    assert.deepEqual(
        buildApprovalPlan(RULES, 100_000_000n).map((level) => level.level),
        [1, 2, 3],
    );
    const plan = buildApprovalPlan(RULES, "50000");
    assert.deepEqual(plan[0], {
        level: 1,
        min_amount_thb: "0.00",
        require_distinct: false,
        roles: [SALES_HEAD, DIRECTOR],
    });
});

test("ผ่านต่อเนื่อง: กรรมการกดครั้งเดียวผ่านชั้น 1–2 · หยุดที่ชั้น 3 ที่บังคับคนละคน", () => {
    const plan = buildApprovalPlan(RULES, "5000000");
    const result = evaluate(plan, 1, actor("USER-DIRECTOR", DIRECTOR));
    assert.equal(result.canApprove, true);
    assert.deepEqual(result.levels, [1, 2]);
    assert.equal(result.isFinal, false);
    assert.equal(result.nextLevel.level, 3);
    assert.match(result.stopReason, /คนละคน/);

    const approvedByFirstDirector = [
        { level: 1, user_id: "USER-DIRECTOR" },
        { level: 2, user_id: "USER-DIRECTOR" },
    ];
    // กรรมการคนเดิมมาอนุมัติชั้น 3 ไม่ได้
    const sameDirector = evaluate(plan, 3, actor("USER-DIRECTOR", DIRECTOR), { approvals: approvedByFirstDirector });
    assert.equal(sameDirector.canApprove, false);
    assert.match(sameDirector.reason, /คนละคน/);

    // กรรมการอีกคนอนุมัติชั้น 3 ได้ และเป็นชั้นสุดท้าย
    const otherDirector = evaluate(plan, 3, actor("USER-DIRECTOR-2", DIRECTOR), { approvals: approvedByFirstDirector });
    assert.deepEqual(otherDirector.levels, [3]);
    assert.equal(otherDirector.isFinal, true);
});

test("หัวหน้าฝ่ายขายผ่านได้แค่ชั้น 1 · ชั้น 2 ต้องให้ผู้จัดการหรือกรรมการ", () => {
    const plan = buildApprovalPlan(RULES, "250000");
    const result = evaluate(plan, 1, actor("USER-SALES", SALES_HEAD));
    assert.deepEqual(result.levels, [1]);
    assert.equal(result.isFinal, false);
    assert.match(result.stopReason, /ผู้จัดการ, กรรมการผู้จัดการ/);

    const manager = evaluate(plan, 2, actor("USER-MANAGER", MANAGER), {
        approvals: [{ level: 1, user_id: "USER-SALES" }],
    });
    assert.deepEqual(manager.levels, [2]);
    assert.equal(manager.isFinal, true);
});

test("ถูกบล็อก: role ไม่อยู่ในชั้นที่รอ · ไม่มีสิทธิ์อนุมัติ · เป็นผู้สร้าง (ยกเว้นเปิดอนุมัติเอง)", () => {
    const plan = buildApprovalPlan(RULES, "50000");
    const wrongRole = evaluate(plan, 1, actor("USER-MANAGER", MANAGER));
    assert.equal(wrongRole.canApprove, false);
    assert.match(wrongRole.reason, /หัวหน้าฝ่ายขาย, กรรมการผู้จัดการ/);

    const noPermission = evaluate(plan, 1, actor("USER-SALES", SALES_HEAD, false));
    assert.equal(noPermission.canApprove, false);
    assert.match(noPermission.reason, /ไม่มีสิทธิ์/);

    const creator = evaluate(plan, 1, actor("USER-CREATOR", SALES_HEAD));
    assert.equal(creator.canApprove, false);
    assert.match(creator.reason, /ผู้สร้าง/);

    const selfAllowed = evaluate(plan, 1, actor("USER-CREATOR", SALES_HEAD), { allowSelfApproval: true });
    assert.equal(selfAllowed.canApprove, true);
    assert.equal(selfAllowed.isFinal, true);

    const notWaiting = evaluate(plan, 9, actor("USER-SALES", SALES_HEAD));
    assert.equal(notWaiting.canApprove, false);
});
