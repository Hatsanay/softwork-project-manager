// ─── สิทธิ์ของ role (bitmask) — ที่เดียวของทั้งระบบ ─────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// role_permission ในฐานข้อมูลเป็นสตริง "0"/"1" ตัวที่ i = สิทธิ์ PERMISSION_KEYS[i]
// หน้าแก้ role (frontend/app/components/bit.tsx → PERMISSION_GROUPS) ต้องเรียงตามนี้เป๊ะ — test/permission-order.test.js คุมไว้
//
// ลำดับนี้ผ่านการ reorder มาแล้ว (ย้าย viewOwnProjects/createProject/cancelProject มาอยู่ติดกับ viewAllProjects
// ในกลุ่ม "โปรเจกต์" แทนที่จะแยกกลุ่มท้ายสุด) — ถ้าจะเพิ่ม/ย้ายบิตอีก ต้อง migrate role_permission ของทุก role ให้ตรงเสมอ
//
// ไฟล์นี้ห้ามใช้ API ของ Node หรือของเบราว์เซอร์ — ต้องรันได้ทั้งสองฝั่ง

export const PERMISSION_KEYS = [
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
    // วงจรขาย 1A (2026-10-13)
    "companySettings",
    "productManagement",
    // ใบเสนอราคา 1A-3 (2026-10-13)
    "viewQuotations",
    "createQuotation",
    "approveQuotation",
    "cancelQuotation",
    // ใบแจ้งหนี้ + ใบวางบิล 1B (2026-10-14)
    "viewInvoices",
    "createInvoice",
    "approveInvoice",
    "cancelInvoice",
    // ใบเสร็จรับเงิน 1C (2026-10-15) — แยกจากสิทธิ์ใบแจ้งหนี้ (คนขายออกบิล คนการเงินรับเงิน)
    "viewReceipts",
    "createReceipt",
    "cancelReceipt",
    // รายงานขาย + ไฟล์ส่งนักบัญชี 1D (2026-10-15) — ไฟล์มีเลขผู้เสียภาษีและยอดทั้งบริษัท (D3)
    "salesReports",
    // จัดซื้อ / ค่าใช้จ่าย / ทำจ่าย เฟส 2 (2026-10-16) — อนุมัติกับทำจ่ายแยกสิทธิ์ (P3)
    "manageVendors",
    "viewExpenses",
    "createExpense",
    "approveExpense",
    "makePayment",
    "cancelPayment",
    // บุคคล / เงินเดือน เฟส 4 (2026-10-17) — เห็นเงินเดือนได้เฉพาะผู้มีสิทธิ์ (H3) · ลงเวลา/ขอลา/ดูสลิปของตัวเองไม่ต้องมีสิทธิ์
    "manageEmployees",
    "viewPayroll",
    "runPayroll",
    "approvePayroll",
    "approveTimesheet",
    "approveLeave",
    "manageHrSettings",
    // ใบลดหนี้ / ใบเพิ่มหนี้ / ใบสั่งซื้อ (2026-10-18) — บันทึกเงินคืนลูกค้า/รับคืนจากผู้ขาย แยกสิทธิ์จากการออกเอกสาร (R-N8)
    "refundCustomer",
];

/** ตำแหน่งบิตของแต่ละสิทธิ์ เช่น BIT_INDEX.createUsers = 2 */
export const BIT_INDEX = Object.fromEntries(PERMISSION_KEYS.map((key, index) => [key, index]));

const ONLY_ZEROS_AND_ONES = /^[01]*$/;

/**
 * role นี้มีสิทธิ์ key ไหม — key ที่ไม่รู้จักถือว่าไม่มีสิทธิ์
 * @param {string | null | undefined} rolePermission
 * @param {string} key
 * @returns {boolean}
 */
export function hasBit(rolePermission, key) {
    const index = BIT_INDEX[key];
    if (index === undefined) return false;
    return rolePermission?.[index] === "1";
}

/**
 * สตริงสิทธิ์ที่หน้าเว็บส่งมาตอนบันทึก role ต้องยาวเท่าจำนวนบิตพอดี (2026-10-12, risk-fixes R1)
 * หน้าเว็บที่เปิดค้างไว้ตั้งแต่ก่อน deploy รู้จักบิตน้อยกว่า — ถ้ายอมรับสตริงที่สั้นกว่า สิทธิ์ใหม่ของ role นั้นจะหายเงียบๆ
 * @param {unknown} value
 * @returns {boolean}
 */
export function isValidPermissionString(value) {
    if (typeof value !== "string") return false;
    if (value.length !== PERMISSION_KEYS.length) return false;
    return ONLY_ZEROS_AND_ONES.test(value);
}

/**
 * ปรับสตริงสิทธิ์จากฐานข้อมูลให้ยาวเท่าจำนวนบิตปัจจุบัน
 * - สั้นกว่า (role ที่สร้างก่อนมีบิตใหม่): เติม "0" — ไม่ได้สิทธิ์ใหม่โดยอัตโนมัติ ปลอดภัยกว่าได้เกิน
 * - ยาวกว่า (ฐานข้อมูลถูกอัปเดตจากโค้ดเวอร์ชันที่ใหม่กว่านี้ เช่น ย้อน deploy): ตัดบิตที่โค้ดนี้ไม่รู้จักออก
 * @param {string | null | undefined} value
 * @returns {string}
 */
export function normalizePermissionString(value) {
    const bitCount = PERMISSION_KEYS.length;
    const cleaned = String(value ?? "").replace(/[^01]/g, "0");
    return cleaned.padEnd(bitCount, "0").slice(0, bitCount);
}

// role ระบบได้สิทธิ์ครบทุกข้อเสมอ ไม่ขึ้นกับสตริงที่เก็บในฐานข้อมูล (2026-10-12, risk-fixes R24)
export const SYSTEM_ROLE_TYPE = "S";
export const FULL_PERMISSION = "1".repeat(PERMISSION_KEYS.length);

/**
 * สิทธิ์ที่ role นั้นใช้ได้จริง — ใช้ทั้งตอนตรวจสิทธิ์ (requireAuth) และตอนเทียบว่าใครจัดการใครได้
 * @param {string} roleType "S" = role ระบบ, "R" = role ทั่วไป
 * @param {string | null | undefined} storedPermission
 * @returns {string}
 */
export function effectiveRolePermission(roleType, storedPermission) {
    if (roleType === SYSTEM_ROLE_TYPE) return FULL_PERMISSION;
    return normalizePermissionString(storedPermission);
}

/**
 * สิทธิ์ของ "เป้าหมาย" ไม่เกินสิทธิ์ของ "ผู้กระทำ" = ทุกข้อที่เป้าหมายมี ผู้กระทำต้องมีด้วย (2026-10-12, risk-fixes R25)
 * กันการยกระดับสิทธิ์ตัวเอง เช่น มอบ role ที่สูงกว่าตัวเองให้ตัวเอง หรือรีเซ็ตรหัสผ่านของแอดมินแล้วเข้าระบบแทน
 * @param {string | null | undefined} targetPermission
 * @param {string | null | undefined} actorPermission
 * @returns {boolean}
 */
export function isPermissionWithin(targetPermission, actorPermission) {
    const target = normalizePermissionString(targetPermission);
    const actor = normalizePermissionString(actorPermission);
    for (let index = 0; index < target.length; index++) {
        if (target[index] === "1" && actor[index] !== "1") return false;
    }
    return true;
}
