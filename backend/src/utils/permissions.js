// Flat bit order must stay in sync with PERMISSION_GROUPS in
// frontend/app/components/bit.tsx — same order, same length (TOTAL_BITS).
const PERMISSION_KEYS = [
    "dashboard",
    "usersManagement",
    "createUsers",
    "editUsers",
    "deleteUsers",
    "roleManagement",
    "createRole",
    "editRole",
    "deleteRole",
    "departmentManagement",
    "createDepartment",
    "editDepartment",
    "deleteDepartment",
    "loginLogs",
];

const BIT_INDEX = Object.fromEntries(PERMISSION_KEYS.map((key, i) => [key, i]));

function hasBit(rolePermission, key) {
    const index = BIT_INDEX[key];
    if (index === undefined) return false;
    return rolePermission?.[index] === "1";
}

module.exports = { PERMISSION_KEYS, BIT_INDEX, hasBit };
