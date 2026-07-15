// สิทธิ์ "ภายในโปรเจกต์ที่ตัวเองอยู่" เท่านั้น — คนละเรื่องกับ permissions.js (สิทธิ์ใช้งานระบบทั้งระบบ)
// ต้องตรงกับ PROJECT_PERMISSION_GROUPS ใน frontend/app/components/project-position-bits.ts ทั้งลำดับและจำนวน
// ลำดับนี้ผ่านการ reorder มาแล้วหลายครั้ง (ไม่ใช่ append-only) — ถ้าจะเพิ่ม/ย้ายบิตอีก ต้อง migrate
// position_permission ของทุกแถวใน tb_project_positions ให้ตรงกับลำดับใหม่เสมอ ไม่งั้นสิทธิ์เดิมจะเพี้ยน
// การเปลี่ยนสถานะ task/subtask ตอนนี้ผูกกับบิตชัดเจนแล้ว (ไม่ใช่สิทธิ์อัตโนมัติแบบเดิมอีกต่อไป)
const PROJECT_PERMISSION_KEYS = [
    // เกี่ยวกับ Task (เรียงใหญ่ไปเล็ก)
    "deleteTask",
    "editTask",
    "changeTaskStatus",
    "addTask",
    "editOwnTask",
    "changeOwnTaskStatus",
    // เกี่ยวกับ Subtask (เรียงใหญ่ไปเล็ก)
    "changeSubtaskStatus",
    "addOwnSubtask",
    "changeOwnSubtaskStatus",
    // เกี่ยวกับโปรเจกต์ (เรียงใหญ่ไปเล็ก)
    "deleteProject",
    "editProjectInfo",
    "manageMembers",
    "manageShareLink",
];

const PROJECT_BIT_INDEX = Object.fromEntries(PROJECT_PERMISSION_KEYS.map((key, i) => [key, i]));

function hasProjectBit(positionPermission, key) {
    const index = PROJECT_BIT_INDEX[key];
    if (index === undefined) return false;
    return positionPermission?.[index] === "1";
}

module.exports = { PROJECT_PERMISSION_KEYS, PROJECT_BIT_INDEX, hasProjectBit };
