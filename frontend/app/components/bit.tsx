export type MenuItem = {
    key: string;
    label: string;
    href: string;
    hidden?: boolean;
    children?: MenuItem[];
};

// ─── Sidebar menu structure ───────────────────────────────────────────────────
// แต่ละเมนูผูกกับบิตสิทธิ์ด้วย key (ไม่ใช่ลำดับ) — key ต้องมีอยู่ใน PERMISSION_GROUPS (backend/test/permission-order.test.js คุม)
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
            { key: "companySettings", label: "ข้อมูลบริษัท", href: "/settings/company" },
            // loginLogs อยู่ล่างสุดเสมอ — ห้ามแทรกกลาง ตำแหน่ง bit ผูกกับ role_permission ที่เก็บไว้ใน DB แล้ว
            { key: "loginLogs",      label: "Log ข้อมูล",   href: "/settings/logs" },
        ],
    },
    // เพิ่มบิตใหม่ต่อท้ายสุดของลำดับทั้งหมดเสมอ (append-only) ห้ามแทรกก่อนหน้านี้ ไม่งั้น role_permission เดิมในฐานข้อมูลจะเพี้ยน
    // (ลำดับเมนูในแถบข้างไม่เกี่ยวกับลำดับบิต — เมนูผูกกับบิตด้วย key)
    {
        key: "sales",
        label: "ขาย",
        href: "/sales",
        children: [
            { key: "viewQuotations", label: "ใบเสนอราคา", href: "/sales/quotations" },
            { key: "viewInvoices", label: "ใบแจ้งหนี้", href: "/sales/invoices" },
            { key: "viewInvoices", label: "ใบวางบิล", href: "/sales/billing-notes" },
            { key: "productManagement", label: "สินค้า/บริการ", href: "/sales/products" },
        ],
    },
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
// ลำดับบิตเรียงตาม PERMISSION_KEYS ใน backend/src/shared/permissions.mjs เป๊ะ (backend/test/permission-order.test.js คุม)
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
    {
        groupLabel: "ข้อมูลบริษัท",
        bits: [
            { key: "companySettings", label: "ตั้งค่าบริษัท (ข้อมูลบริษัท, VAT, สาขา, บัญชีธนาคาร, สกุลเงิน, กติกาอนุมัติ)", href: "/settings/company" },
        ],
    },
    // วงจรขาย — ลำดับบิตในกลุ่มต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "ขาย",
        bits: [
            { key: "productManagement", label: "จัดการสินค้า/บริการ (เพิ่ม/แก้/ลบ/ปิดใช้งาน สินค้า หมวดหมู่ และชุดรายการ)", href: "/sales/products" },
            { key: "viewQuotations",   label: "ดูใบเสนอราคา (ทุกใบ ทุกสาขา)",                                         href: "/sales/quotations" },
            { key: "createQuotation",  label: "สร้าง/แก้ใบเสนอราคา (ร่าง คัดลอก ส่งขออนุมัติ ส่งลูกค้า revision)",       href: "/sales/quotations/new" },
            { key: "approveQuotation", label: "อนุมัติ/ตีกลับใบเสนอราคา (ต้องมี role อยู่ในชั้นที่รออยู่ด้วย)",            href: "/sales/quotations/approve" },
            { key: "cancelQuotation",  label: "ยกเลิกใบเสนอราคา",                                                    href: "/sales/quotations/cancel" },
            { key: "viewInvoices",     label: "ดูใบแจ้งหนี้และใบวางบิล (ทุกใบ ทุกสาขา)",                                href: "/sales/invoices" },
            { key: "createInvoice",    label: "สร้าง/ออกใบแจ้งหนี้และใบวางบิล (ร่าง ออกจากงวดใบเสนอราคา ส่งลูกค้า)",       href: "/sales/invoices/new" },
            { key: "approveInvoice",   label: "อนุมัติ/ตีกลับใบแจ้งหนี้ที่สร้างเอง (ต้องมี role อยู่ในชั้นที่รออยู่ด้วย)",       href: "/sales/invoices/approve" },
            { key: "cancelInvoice",    label: "ยกเลิกใบแจ้งหนี้และใบวางบิล",                                           href: "/sales/invoices/cancel" },
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

// ตำแหน่งบิตของแต่ละสิทธิ์ — หาจาก key ไม่ใช่ลำดับเมนู เพราะบางบิตไม่มีเมนู (เช่น viewMemberKpi)
// ถ้าใช้ลำดับเมนู พอเพิ่มบิตที่มีเมนูต่อท้าย viewMemberKpi เมนูจะไปอ่านบิตผิดตำแหน่ง
const BIT_INDEX_BY_KEY = new Map(
    PERMISSION_GROUPS.flatMap((group) => group.bits).map((bit, index) => [bit.key, index])
);

function hasMenuPermission(bitmask: string, key: string): boolean {
    const index = BIT_INDEX_BY_KEY.get(key);
    if (index === undefined) return false;
    return bitmask[index] === "1";
}

/** มีสิทธิ์ key นี้ไหม (ใช้ได้ทั้ง server และ client component) — แค่ซ่อน/แสดงบนหน้าจอ backend ตรวจสิทธิ์จริงเสมอ */
export function hasPermissionKey(bitmask: string, key: string): boolean {
    return hasMenuPermission(bitmask, key);
}

/**
 * เส้นทางหน้า (breadcrumb) จาก path — หาเมนูที่ href ตรงหรือเป็นต้นทางยาวที่สุด รวมเมนูซ่อน (/users/edit = "แก้ไขผู้ใช้งาน")
 * เช่น /settings/company → ["ตั้งค่าระบบ", "ข้อมูลบริษัท"] · ไม่พบเมนู → []
 */
export function findBreadcrumbs(pathname: string): string[] {
    let best: { labels: string[]; hrefLength: number } | null = null;

    function consider(labels: string[], href: string) {
        const isMatch = pathname === href || pathname.startsWith(`${href}/`);
        if (!isMatch) return;
        if (best && best.hrefLength >= href.length) return;
        best = { labels, hrefLength: href.length };
    }

    for (const item of MENU_DEFS) {
        consider([item.label], item.href);
        for (const child of item.children ?? []) {
            const isSameAsParent = child.label === item.label;
            consider(isSameAsParent ? [item.label] : [item.label, child.label], child.href);
        }
    }
    return best ? (best as { labels: string[] }).labels : [];
}

export function getVisibleItems(items: MenuItem[], bitmask: string): MenuItem[] {
    const leaves = getLeaves(items);
    const visibleHrefs = new Set(
        leaves.filter((leaf) => hasMenuPermission(bitmask, leaf.key)).map((leaf) => leaf.href)
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
