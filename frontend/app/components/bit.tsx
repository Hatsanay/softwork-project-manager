export type MenuItem = {
    key: string;
    label: string;
    href: string;
    hidden?: boolean;
    children?: MenuItem[];
};

// ─── Sidebar menu structure ───────────────────────────────────────────────────
// Leaf order here = bitmask positions. Must stay in sync with PERMISSION_GROUPS below.
export const MENU_DEFS: MenuItem[] = [
    { key: "dashboard", label: "Dashboard", href: "/dashboard" },
    {
        key: "usersManagement", label: "จัดการข้อมูลผู้ใช้งาน", href: "/users",
        children: [
            { key: "usersManagement", label: "จัดการข้อมูลผู้ใช้งาน", href: "/users", hidden: true },
            { key: "createUsers",     label: "สร้างผู้ใช้งาน",       href: "/users/create", hidden: true },
            { key: "editUsers",       label: "แก้ไขผู้ใช้งาน",         href: "/users/edit",   hidden: true },
            { key: "deleteUsers",     label: "ลบผู้ใช้งาน",           href: "/users/delete", hidden: true },
        ],
    },
    {
        key: "viewAllProjects", label: "โปรเจกต์", href: "/projects",
        children: [
            { key: "viewAllProjects", label: "ดูโปรเจกต์ทั้งหมด", href: "/projects", hidden: true },
            { key: "viewOwnProjects", label: "ดูโปรเจกต์ที่ตัวเองเป็นสมาชิก", href: "/projects", hidden: true },
            { key: "createProject",   label: "เพิ่มโปรเจกต์",                 href: "/projects/create", hidden: true },
            { key: "cancelProject",   label: "ยกเลิกโปรเจกต์",               href: "/projects/cancel", hidden: true },
        ],
    },
    // { key: "customers", label: "จัดการลูกค้า", href: "/customers" },
    // { key: "payments",  label: "การชำระเงิน",  href: "/payments" },
    // { key: "reports",   label: "รายงาน",       href: "/reports" },
    {
        key: "settings", label: "ตั้งค่าระบบ", href: "/settings",
        children: [
            { key: "roleManagement", label: "จัดการสิทธิ์", href: "/settings/roles" },
            { key: "createRole",     label: "สร้างสิทธิ์",   href: "/settings/roles/create", hidden: true },
            { key: "editRole",       label: "แก้ไขสิทธิ์",   href: "/settings/roles/edit",   hidden: true },
            { key: "deleteRole",     label: "ลบสิทธิ์",     href: "/settings/roles/delete", hidden: true },
            { key: "departmentManagement", label: "จัดการแผนก", href: "/settings/departments" },
            { key: "createDepartment",     label: "สร้างแผนก",   href: "/settings/departments/create", hidden: true },
            { key: "editDepartment",       label: "แก้ไขแผนก",   href: "/settings/departments/edit",   hidden: true },
            { key: "deleteDepartment",     label: "ลบแผนก",     href: "/settings/departments/delete", hidden: true },
            { key: "projectPositionManagement", label: "ตำแหน่งในโปรเจกต์", href: "/settings/project-positions" },
            { key: "createProjectPosition",     label: "สร้างตำแหน่ง",     href: "/settings/project-positions/create", hidden: true },
            { key: "editProjectPosition",       label: "แก้ไขตำแหน่ง",     href: "/settings/project-positions/edit",   hidden: true },
            { key: "deleteProjectPosition",     label: "ลบตำแหน่ง",       href: "/settings/project-positions/delete", hidden: true },
            // loginLogs อยู่ล่างสุดเสมอ — ห้ามแทรกกลาง ตำแหน่ง bit ผูกกับ role_permission ที่เก็บไว้ใน DB แล้ว
            { key: "loginLogs",      label: "Log ข้อมูล",   href: "/settings/logs" },
        ],
    },
    // เพิ่มบิตใหม่ต่อท้ายสุดของลำดับทั้งหมดเสมอ (append-only) ห้ามแทรกก่อนหน้านี้ ไม่งั้น role_permission เดิมในฐานข้อมูลจะเพี้ยน
    {
        key: "clientManagement", label: "จัดการลูกค้า", href: "/clients",
        children: [
            { key: "clientManagement", label: "จัดการลูกค้า", href: "/clients", hidden: true },
            { key: "createClient",     label: "สร้างลูกค้า",   href: "/clients/create", hidden: true },
            { key: "editClient",       label: "แก้ไขลูกค้า",   href: "/clients/edit",   hidden: true },
            { key: "deleteClient",     label: "ลบลูกค้า",     href: "/clients/delete", hidden: true },
        ],
    },
];

// ─── Permission groups (used by create/edit role page) ────────────────────────
// Each group's bits must match the leaf order in MENU_DEFS exactly.
export type PermGroup = {
    groupLabel: string;
    bits: MenuItem[];
};

export const PERMISSION_GROUPS: PermGroup[] = [
    {
        groupLabel: "Dashboard",
        bits: [
            { key: "dashboard", label: "Dashboard", href: "/dashboard" },
        ],
    },
    {
        groupLabel: "จัดการข้อมูลผู้ใช้งาน",
        bits: [
            { key: "usersManagement", label: "จัดการข้อมูลผู้ใช้งาน", href: "/users" },
            { key: "createUsers",     label: "สร้างผู้ใช้งาน",       href: "/users/create", hidden: true },
            { key: "editUsers",       label: "แก้ไขผู้ใช้งาน",         href: "/users/edit",   hidden: true },
            { key: "deleteUsers",     label: "ลบผู้ใช้งาน",           href: "/users/delete", hidden: true },
        ],
    },
    {
        groupLabel: "โปรเจกต์",
        bits: [
            { key: "viewAllProjects", label: "ดูโปรเจกต์ทั้งหมด", href: "/projects" },
            { key: "viewOwnProjects", label: "ดูโปรเจกต์ที่ตัวเองเป็นสมาชิก", href: "/projects", hidden: true },
            { key: "createProject",   label: "เพิ่มโปรเจกต์",                 href: "/projects/create", hidden: true },
            { key: "cancelProject",   label: "ยกเลิกโปรเจกต์",               href: "/projects/cancel", hidden: true },
        ],
    },
    {
        groupLabel: "ตั้งค่าระบบ",
        bits: [
            { key: "roleManagement", label: "จัดการสิทธิ์", href: "/settings/roles" },
            { key: "createRole",     label: "สร้างสิทธิ์",   href: "/settings/roles/create", hidden: true },
            { key: "editRole",       label: "แก้ไขสิทธิ์",   href: "/settings/roles/edit",   hidden: true },
            { key: "deleteRole",     label: "ลบสิทธิ์",     href: "/settings/roles/delete", hidden: true },
            { key: "departmentManagement", label: "จัดการแผนก", href: "/settings/departments" },
            { key: "createDepartment",     label: "สร้างแผนก",   href: "/settings/departments/create", hidden: true },
            { key: "editDepartment",       label: "แก้ไขแผนก",   href: "/settings/departments/edit",   hidden: true },
            { key: "deleteDepartment",     label: "ลบแผนก",     href: "/settings/departments/delete", hidden: true },
            { key: "projectPositionManagement", label: "ตำแหน่งในโปรเจกต์", href: "/settings/project-positions" },
            { key: "createProjectPosition",     label: "สร้างตำแหน่ง",     href: "/settings/project-positions/create", hidden: true },
            { key: "editProjectPosition",       label: "แก้ไขตำแหน่ง",     href: "/settings/project-positions/edit",   hidden: true },
            { key: "deleteProjectPosition",     label: "ลบตำแหน่ง",       href: "/settings/project-positions/delete", hidden: true },
            { key: "loginLogs",      label: "Log ข้อมูล",   href: "/settings/logs" },
        ],
    },
    {
        groupLabel: "จัดการลูกค้า",
        bits: [
            { key: "clientManagement", label: "จัดการลูกค้า", href: "/clients" },
            { key: "createClient",     label: "สร้างลูกค้า",   href: "/clients/create", hidden: true },
            { key: "editClient",       label: "แก้ไขลูกค้า",   href: "/clients/edit",   hidden: true },
            { key: "deleteClient",     label: "ลบลูกค้า",     href: "/clients/delete", hidden: true },
        ],
    },
    // เพิ่มกลุ่มใหม่ต่อท้ายสุดของ array เสมอ (append-only) ห้ามแทรกก่อนหน้านี้ ไม่งั้น role_permission เดิมในฐานข้อมูลจะเพี้ยน
    // บิตนี้ไม่มี leaf คู่กันใน MENU_DEFS เพราะไม่ใช่เมนู/หน้าใหม่ แค่ควบคุมว่าเห็น widget "KPI รายคน" ใน /dashboard ไหม
    {
        groupLabel: "KPI รายคน",
        bits: [
            { key: "viewMemberKpi", label: "ดู KPI รายคน บนแดชบอร์ด", href: "/dashboard" },
        ],
    },
];

// Start index (in flat bitmask) for each group
export const GROUP_STARTS: number[] = (() => {
    const starts: number[] = [];
    let offset = 0;
    for (const g of PERMISSION_GROUPS) {
        starts.push(offset);
        offset += g.bits.length;
    }
    return starts;
})();

export const TOTAL_BITS = PERMISSION_GROUPS.reduce((sum, g) => sum + g.bits.length, 0);

// ─── Sidebar helpers ──────────────────────────────────────────────────────────
export function getLeaves(items: MenuItem[]): MenuItem[] {
    return items.flatMap((item) => (item.children?.length ? item.children : [item]));
}

export function getVisibleItems(items: MenuItem[], bitmask: string): MenuItem[] {
    const leaves = getLeaves(items);
    const visibleHrefs = new Set(
        leaves.filter((_, i) => bitmask[i] === "1").map((l) => l.href)
    );

    return items
        .filter((item) => !item.hidden)
        .flatMap((item) => {
            if (item.children?.length) {
                const visibleChildren = item.children.filter(
                    (c) => !c.hidden && visibleHrefs.has(c.href)
                );
                // children ทั้งหมด hidden → แสดง parent เป็น single link
                if (visibleChildren.length === 0) {
                    return visibleHrefs.has(item.href) ? [{ ...item, children: undefined }] : [];
                }
                return [{ ...item, children: visibleChildren }];
            }
            return visibleHrefs.has(item.href) ? [item] : [];
        });
}
