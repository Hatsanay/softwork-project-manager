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
];

const BIT_INDEX = Object.fromEntries(PERMISSION_KEYS.map((key, i) => [key, i]));

function hasBit(rolePermission, key) {
    const index = BIT_INDEX[key];
    if (index === undefined) return false;
    return rolePermission?.[index] === "1";
}

module.exports = { PERMISSION_KEYS, BIT_INDEX, hasBit };
