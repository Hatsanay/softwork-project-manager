// สิทธิ์ "ภายในโปรเจกต์ที่ตัวเองอยู่" เท่านั้น — คนละเรื่องกับ bit.tsx (สิทธิ์ใช้งานระบบทั้งระบบ/เมนู)
// จัดกลุ่มเป็น Task / Subtask / โปรเจกต์ ให้แยกแยะง่าย แต่ตอนเก็บ position_permission ยังเป็น flat string เหมือนเดิม
// ลำดับ (ต้องตรงกับ PROJECT_PERMISSION_KEYS ใน backend/src/utils/projectPermissions.js เป๊ะๆ ทั้งลำดับกลุ่มและจำนวนบิต)
// ผ่านการ reorder มาแล้วหลายครั้ง (ไม่ใช่ append-only) — ถ้าจะเพิ่ม/ย้ายบิตอีก ต้อง migrate position_permission
// ของทุกตำแหน่งในฐานข้อมูลให้ตรงกับลำดับใหม่เสมอ ไม่งั้นสิทธิ์เดิมจะเพี้ยน
// ทุกการกระทำ (รวมถึงเปลี่ยนสถานะ) ต้องมีบิตชัดเจนเสมอ ไม่มีสิทธิ์อัตโนมัติจากการเป็นผู้รับผิดชอบอีกต่อไป
export type ProjectPermissionBit = {
    key: string;
    label: string;
    description: string;
};

export type ProjectPermissionGroup = {
    groupLabel: string;
    bits: ProjectPermissionBit[];
};

export const PROJECT_PERMISSION_GROUPS: ProjectPermissionGroup[] = [
    {
        groupLabel: "เกี่ยวกับ Task",
        bits: [
            {
                key: "deleteTask", label: "ลบ task",
                description: "ลบ task (และ subtask ทั้งหมดของมัน) ออกจากโปรเจกต์ได้ ไม่มีข้อยกเว้นแม้เป็นผู้รับผิดชอบเอง",
            },
            {
                key: "editTask", label: "แก้ไข task ทุกอัน",
                description: "แก้ไขข้อมูลของ task ของใครก็ได้ในโปรเจกต์นี้ (ไม่รวมเปลี่ยนสถานะ — ดูบิต \"เปลี่ยนสถานะ task ทุกอัน\" แยกต่างหาก)",
            },
            {
                key: "changeTaskStatus", label: "เปลี่ยนสถานะ task ทุกอัน",
                description: "เปลี่ยนสถานะ task ของใครก็ได้ในโปรเจกต์นี้",
            },
            {
                key: "addTask", label: "เพิ่ม task",
                description: "สร้าง task ระดับบนสุด (และ subtask ของ task ใดก็ได้) ใหม่ในโปรเจกต์นี้",
            },
            {
                key: "editOwnTask", label: "แก้ไข task ของตัวเอง",
                description: "แก้ไขข้อมูล (ไม่ใช่สถานะ) ของ task ที่ตัวเองเป็นผู้รับผิดชอบได้ โดยไม่ต้องมีสิทธิ์ \"แก้ไข task ทุกอัน\"",
            },
            {
                key: "changeOwnTaskStatus", label: "เปลี่ยนสถานะ task ของตัวเอง",
                description: "เปลี่ยนสถานะของ task ที่ตัวเองเป็นผู้รับผิดชอบได้ โดยไม่ต้องมีสิทธิ์ \"เปลี่ยนสถานะ task ทุกอัน\" — ถ้าไม่ติ๊กทั้งสองบิตนี้เลย จะเปลี่ยนสถานะ task ไม่ได้เลยแม้เป็นผู้รับผิดชอบเอง",
            },
        ],
    },
    {
        groupLabel: "เกี่ยวกับ Subtask",
        bits: [
            {
                key: "changeSubtaskStatus", label: "เปลี่ยนสถานะ subtask ทุกอัน",
                description: "เปลี่ยนสถานะ subtask ของใครก็ได้ในโปรเจกต์นี้",
            },
            {
                key: "addOwnSubtask", label: "เพิ่ม subtask ของ task ที่ตัวเองรับผิดชอบ",
                description: "สร้าง subtask ใหม่ใต้ task ที่ตัวเองเป็นผู้รับผิดชอบได้ โดยไม่ต้องมีสิทธิ์ \"เพิ่ม task\" — ใช้ไม่ได้กับการสร้าง task ระดับบนสุด หรือ subtask ของ task คนอื่น",
            },
            {
                key: "changeOwnSubtaskStatus", label: "เปลี่ยนสถานะ subtask ของตัวเอง",
                description: "เปลี่ยนสถานะของ subtask ที่ตัวเองเป็นผู้รับผิดชอบได้ โดยไม่ต้องมีสิทธิ์ \"เปลี่ยนสถานะ subtask ทุกอัน\" — ความรับผิดชอบต่อ task แม่ไม่นับ ต้องเป็นผู้รับผิดชอบของ subtask นั้นเองโดยตรง",
            },
        ],
    },
    {
        groupLabel: "เกี่ยวกับโปรเจกต์",
        bits: [
            {
                key: "deleteProject", label: "ลบโปรเจกต์",
                description: "ลบโปรเจกต์นี้ทั้งหมด รวมถึง task และสมาชิกทั้งหมดในนั้นแบบกู้คืนไม่ได้",
            },
            {
                key: "editProjectInfo", label: "แก้ไขข้อมูลโปรเจกต์",
                description: "แก้ไขชื่อ ลูกค้า คำอธิบาย สถานะ วันที่ของโปรเจกต์ และเปิด/ปิดระบบถ่วงน้ำหนัก task ได้",
            },
            {
                key: "manageMembers", label: "จัดการสมาชิก",
                description: "เพิ่ม/นำสมาชิกออก และกำหนดตำแหน่งของสมาชิกแต่ละคนในโปรเจกต์นี้ได้",
            },
            {
                key: "manageShareLink", label: "จัดการลิงก์ลูกค้า",
                description: "เปิด/ปิดการใช้งาน และสร้างลิงก์สำหรับลูกค้าดูความคืบหน้าใหม่ได้",
            },
        ],
    },
];

// Start index (ใน flat bitmask) ของแต่ละกลุ่ม
export const PROJECT_GROUP_STARTS: number[] = (() => {
    const starts: number[] = [];
    let offset = 0;
    for (const g of PROJECT_PERMISSION_GROUPS) {
        starts.push(offset);
        offset += g.bits.length;
    }
    return starts;
})();

// flat list เอาไว้ให้โค้ดเดิมที่ใช้ findIndex หา bit ตาม key ยังทำงานได้เหมือนเดิม
export const PROJECT_PERMISSION_BITS: ProjectPermissionBit[] = PROJECT_PERMISSION_GROUPS.flatMap((g) => g.bits);

export const TOTAL_PROJECT_BITS = PROJECT_PERMISSION_BITS.length;
