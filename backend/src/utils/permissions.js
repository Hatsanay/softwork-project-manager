// Flat bit order must stay in sync with PERMISSION_GROUPS in
// frontend/app/components/bit.tsx — same order, same length (TOTAL_BITS).
// ลำดับนี้ผ่านการ reorder มาแล้ว (ย้าย viewOwnProjects/createProject/cancelProject มาอยู่ติดกับ viewAllProjects
// ในกลุ่ม "โปรเจกต์" แทนที่จะแยกกลุ่มท้ายสุด) — ถ้าจะเพิ่ม/ย้ายบิตอีก ต้อง migrate role_permission ของทุก role ให้ตรงเสมอ
const PERMISSION_KEYS = [
    "dashboard",
    "usersManagement",
    "createUsers",
    "editUsers",
    "deleteUsers",
    "viewAllProjects",
    "viewOwnProjects",
    "createProject",
    "cancelProject",
    "roleManagement",
    "createRole",
    "editRole",
    "deleteRole",
    "departmentManagement",
    "createDepartment",
    "editDepartment",
    "deleteDepartment",
    "projectPositionManagement",
    "createProjectPosition",
    "editProjectPosition",
    "deleteProjectPosition",
    "loginLogs",
    "clientManagement",
    "createClient",
    "editClient",
    "deleteClient",
    // เพิ่มบิตใหม่ต่อท้ายสุดเสมอ (append-only) ห้ามแทรกก่อนหน้านี้ ไม่งั้น role_permission เดิมในฐานข้อมูลจะเพี้ยน
    "viewMemberKpi",
];

const BIT_INDEX = Object.fromEntries(PERMISSION_KEYS.map((key, i) => [key, i]));

const ONLY_ZEROS_AND_ONES = /^[01]*$/;

function hasBit(rolePermission, key) {
    const index = BIT_INDEX[key];
    if (index === undefined) return false;
    return rolePermission?.[index] === "1";
}

// สตริงสิทธิ์ที่หน้าเว็บส่งมาตอนบันทึก role ต้องยาวเท่าจำนวนบิตของ backend พอดี (2026-10-12, risk-fixes R1)
// หน้าเว็บที่เปิดค้างไว้ตั้งแต่ก่อน deploy รู้จักบิตน้อยกว่า — ถ้ายอมรับสตริงที่สั้นกว่า สิทธิ์ใหม่ของ role นั้นจะหายเงียบๆ
function isValidPermissionString(value) {
    if (typeof value !== "string") return false;
    if (value.length !== PERMISSION_KEYS.length) return false;
    return ONLY_ZEROS_AND_ONES.test(value);
}

// ปรับสตริงสิทธิ์จากฐานข้อมูลให้ยาวเท่าจำนวนบิตปัจจุบัน ก่อนส่งให้หน้าแก้ role
// - สั้นกว่า (role ที่สร้างก่อนมีบิตใหม่): เติม "0" — ไม่ได้สิทธิ์ใหม่โดยอัตโนมัติ ปลอดภัยกว่าได้เกิน
// - ยาวกว่า (ฐานข้อมูลถูกอัปเดตจากโค้ดเวอร์ชันที่ใหม่กว่านี้ เช่น ย้อน deploy): ตัดบิตที่โค้ดนี้ไม่รู้จักออก
function normalizePermissionString(value) {
    const bitCount = PERMISSION_KEYS.length;
    const cleaned = String(value ?? "").replace(/[^01]/g, "0");
    return cleaned.padEnd(bitCount, "0").slice(0, bitCount);
}

// role ระบบได้สิทธิ์ครบทุกข้อเสมอ ไม่ขึ้นกับสตริงที่เก็บในฐานข้อมูล (2026-10-12, risk-fixes R24)
const SYSTEM_ROLE_TYPE = "S";
const FULL_PERMISSION = "1".repeat(PERMISSION_KEYS.length);

// สิทธิ์ที่ role นั้นใช้ได้จริง — ใช้ทั้งตอนตรวจสิทธิ์ (requireAuth) และตอนเทียบว่าใครจัดการใครได้
function effectiveRolePermission(roleType, storedPermission) {
    if (roleType === SYSTEM_ROLE_TYPE) return FULL_PERMISSION;
    return normalizePermissionString(storedPermission);
}

// สิทธิ์ของ "เป้าหมาย" ไม่เกินสิทธิ์ของ "ผู้กระทำ" = ทุกข้อที่เป้าหมายมี ผู้กระทำต้องมีด้วย (2026-10-12, risk-fixes R25)
// กันการยกระดับสิทธิ์ตัวเอง เช่น มอบ role ที่สูงกว่าตัวเองให้ตัวเอง หรือรีเซ็ตรหัสผ่านของแอดมินแล้วเข้าระบบแทน
function isPermissionWithin(targetPermission, actorPermission) {
    const target = normalizePermissionString(targetPermission);
    const actor = normalizePermissionString(actorPermission);
    for (let i = 0; i < target.length; i++) {
        if (target[i] === "1" && actor[i] !== "1") return false;
    }
    return true;
}

module.exports = {
    PERMISSION_KEYS,
    BIT_INDEX,
    SYSTEM_ROLE_TYPE,
    FULL_PERMISSION,
    hasBit,
    isValidPermissionString,
    normalizePermissionString,
    effectiveRolePermission,
    isPermissionWithin,
};
