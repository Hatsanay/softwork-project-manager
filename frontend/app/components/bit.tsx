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
    // Fastwork (2026-10-24 · P-1): หน้าศูนย์รวมขั้นตอนงาน Fastwork — เห็นเมื่อจัดการ Fastwork / สร้างโปรเจกต์ / ดูโปรเจกต์ทั้งหมด
    {
        key: "fastwork", label: "Fastwork", href: "/fastwork",
        children: [
            { key: "manageFastwork",  label: "Fastwork", href: "/fastwork", hidden: true },
            { key: "createProject",   label: "Fastwork", href: "/fastwork", hidden: true },
            { key: "viewAllProjects", label: "Fastwork", href: "/fastwork", hidden: true },
            { key: "manageProfitShares", label: "Fastwork", href: "/fastwork", hidden: true },
            { key: "manageCapitalFund", label: "Fastwork", href: "/fastwork", hidden: true },
        ],
    },
    // { key: "customers", label: "จัดการลูกค้า", href: "/customers" },
    // { key: "payments",  label: "การชำระเงิน",  href: "/payments" },
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
            { key: "manageServiceRequests", label: "คำขอบริการ", href: "/sales/service-requests" },
            { key: "manageServiceRequests", label: "ลิงก์เลือกบริการ", href: "/sales/order-links" },
            { key: "viewQuotations", label: "ใบเสนอราคา", href: "/sales/quotations" },
            { key: "viewInvoices", label: "ใบแจ้งหนี้", href: "/sales/invoices" },
            { key: "viewInvoices", label: "ใบวางบิล", href: "/sales/billing-notes" },
            { key: "viewInvoices", label: "ใบลดหนี้", href: "/sales/credit-notes" },
            { key: "viewReceipts", label: "ใบเสร็จรับเงิน", href: "/sales/receipts" },
            { key: "viewReceipts", label: "ลูกหนี้คงค้าง", href: "/sales/receivables" },
            // ต่ออายุบริการ (2026-10-31): ลูกค้าตรง = สิทธิ์ออกใบแจ้งหนี้ · ผู้ซื้อ Fastwork = จัดการ Fastwork (เมนูซ่อนที่ href เดียวกัน)
            { key: "createInvoice", label: "ต่ออายุบริการ", href: "/sales/renewals" },
            { key: "manageFastwork", label: "ต่ออายุบริการ", href: "/sales/renewals", hidden: true },
            { key: "productManagement", label: "สินค้า/บริการ", href: "/sales/products" },
        ],
    },
    {
        key: "purchasing",
        label: "จัดซื้อ",
        href: "/purchasing",
        children: [
            // ค่าใช้จ่าย: เห็นเมนูได้ทั้งผู้ดู ผู้บันทึก และผู้อนุมัติ (เมนูซ่อนที่ href เดียวกันทำให้ลิงก์แสดง)
            { key: "viewExpenses", label: "ค่าใช้จ่าย", href: "/purchasing/expenses" },
            { key: "createExpense", label: "ค่าใช้จ่าย", href: "/purchasing/expenses", hidden: true },
            { key: "approveExpense", label: "ค่าใช้จ่าย", href: "/purchasing/expenses", hidden: true },
            // เบิกเงิน: ทุกคนเบิกของตัวเองได้ (ไม่มีบิตเฉพาะ) — ผูกกับ dashboard ที่ทุก role มี
            { key: "dashboard", label: "เบิกเงิน", href: "/purchasing/claims" },
            // ทำจ่าย / 50 ทวิ (ขั้น 2-4): ผู้ทำจ่ายเห็นเมนู · ผู้ดู/ผู้ยกเลิกเห็นผ่านเมนูซ่อนที่ href เดียวกัน
            { key: "makePayment", label: "ใบสำคัญจ่าย", href: "/purchasing/payments" },
            { key: "viewExpenses", label: "ใบสำคัญจ่าย", href: "/purchasing/payments", hidden: true },
            { key: "cancelPayment", label: "ใบสำคัญจ่าย", href: "/purchasing/payments", hidden: true },
            { key: "makePayment", label: "50 ทวิ", href: "/purchasing/wht-certificates" },
            { key: "viewExpenses", label: "50 ทวิ", href: "/purchasing/wht-certificates", hidden: true },
            // เจ้าหนี้คงค้าง + รายงาน ภ.ง.ด. (ขั้น 2-5)
            { key: "viewExpenses", label: "เจ้าหนี้คงค้าง", href: "/purchasing/payables" },
            { key: "makePayment", label: "เจ้าหนี้คงค้าง", href: "/purchasing/payables", hidden: true },
            { key: "viewExpenses", label: "รายงาน ภ.ง.ด.3/53", href: "/purchasing/wht-report" },
            { key: "makePayment", label: "รายงาน ภ.ง.ด.3/53", href: "/purchasing/wht-report", hidden: true },
            { key: "manageVendors", label: "ผู้ขาย", href: "/purchasing/vendors" },
            { key: "companySettings", label: "ตั้งค่าจัดซื้อ", href: "/purchasing/settings" },
        ],
    },
    // บุคคล — เรียงตามคนใช้ (2026-10-19 docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1 · ผู้ใช้สั่งเอาหัวข้อย่อยออก)
    // ของฉัน (ทุกคน · ผูกกับ dashboard ที่ทุก role มี) → รออนุมัติ (ผู้อนุมัติลา/ลงเวลา) → งานฝ่ายบุคคล
    // ผู้จัดการโปรเจกต์ที่ไม่มีบิตอนุมัติลงเวลา อนุมัติของโปรเจกต์ตัวเองได้จากแท็บในหน้าลงเวลา (backend ตัดสินขอบเขต)
    {
        key: "people",
        label: "บุคคล",
        href: "/people",
        children: [
            { key: "dashboard", label: "ภาพรวมของฉัน", href: "/people/me" },
            { key: "dashboard", label: "ลงเวลาทำงาน", href: "/people/attendance" },
            { key: "dashboard", label: "การลา", href: "/people/leave" },
            { key: "dashboard", label: "สลิปเงินเดือน", href: "/people/payslips" },
            // ส่วนแบ่งกำไรรายโปรเจกต์ของตัวเอง (2026-10-24 · P-2) — ทุกคนเห็นของตัวเอง
            { key: "dashboard", label: "ส่วนแบ่งของฉัน", href: "/people/my-shares" },
            { key: "approveLeave", label: "รออนุมัติ", href: "/people/approvals" },
            { key: "approveTimesheet", label: "รออนุมัติ", href: "/people/approvals", hidden: true },
            // ภาพรวมบุคคล: เห็นเมื่อมีสิทธิ์ด้านบุคคลข้อใดข้อหนึ่ง (ตัวเลขแต่ละส่วนตัดตามสิทธิ์ใน backend)
            { key: "manageEmployees", label: "ภาพรวมบุคคล", href: "/people/overview" },
            { key: "viewPayroll", label: "ภาพรวมบุคคล", href: "/people/overview", hidden: true },
            { key: "runPayroll", label: "ภาพรวมบุคคล", href: "/people/overview", hidden: true },
            { key: "approvePayroll", label: "ภาพรวมบุคคล", href: "/people/overview", hidden: true },
            { key: "manageHrSettings", label: "ภาพรวมบุคคล", href: "/people/overview", hidden: true },
            { key: "manageEmployees", label: "ลงเวลาพนักงาน", href: "/people/attendance-board" },
            { key: "approveTimesheet", label: "ลงเวลาพนักงาน", href: "/people/attendance-board", hidden: true },
            { key: "manageEmployees", label: "พนักงาน", href: "/people/employees" },
            // รอบเงินเดือน: เห็นเมื่อมีสิทธิ์ดู/สร้าง/อนุมัติข้อใดข้อหนึ่ง (แถวซ่อนช่วยเปิดเมนูเดียวกัน)
            { key: "viewPayroll", label: "รอบเงินเดือน", href: "/people/payroll" },
            { key: "runPayroll", label: "รอบเงินเดือน", href: "/people/payroll", hidden: true },
            { key: "approvePayroll", label: "รอบเงินเดือน", href: "/people/payroll", hidden: true },
            { key: "manageHrSettings", label: "ตั้งค่าบุคคล", href: "/people/settings" },
        ],
    },
    { key: "salesReports", label: "รายงาน", href: "/reports" },
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
            { key: "viewReceipts",     label: "ดูใบเสร็จรับเงิน ไฟล์ 50 ทวิ และรายงานลูกหนี้คงค้าง",                         href: "/sales/receipts" },
            { key: "createReceipt",    label: "บันทึกรับเงิน/ออกใบเสร็จ และแนบ/แก้ข้อมูล 50 ทวิ",                             href: "/sales/receipts/new" },
            { key: "cancelReceipt",    label: "ยกเลิกใบเสร็จรับเงิน (ยอดรับแล้วของใบแจ้งหนี้ลดกลับ)",                          href: "/sales/receipts/cancel" },
            { key: "salesReports",     label: "ดูรายงานขาย และดาวน์โหลดไฟล์ส่งนักบัญชี (มีเลขผู้เสียภาษีของลูกค้า)",              href: "/reports" },
        ],
    },
    // จัดซื้อ / ค่าใช้จ่าย เฟส 2 — ลำดับบิตต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "จัดซื้อ / ค่าใช้จ่าย",
        bits: [
            { key: "manageVendors",  label: "จัดการผู้ขาย (เพิ่ม/แก้/ปิดใช้งาน รวมเลขบัญชีธนาคารของผู้ขาย)",                  href: "/purchasing/vendors" },
            { key: "viewExpenses",   label: "ดูค่าใช้จ่าย ใบเบิกเงิน ใบสำคัญจ่าย 50 ทวิ และเจ้าหนี้คงค้าง (ทุกใบ)",                href: "/purchasing/expenses" },
            { key: "createExpense",  label: "บันทึกค่าใช้จ่าย/บิลผู้ขาย และแนบไฟล์ (เบิกเงินของตัวเองทำได้ทุกคนไม่ต้องมีสิทธิ์นี้)", href: "/purchasing/expenses/new" },
            { key: "approveExpense", label: "อนุมัติ/ตีกลับค่าใช้จ่ายและใบเบิกเงิน (ต้องมี role อยู่ในชั้นที่รออยู่ด้วย)",            href: "/purchasing/expenses/approve" },
            { key: "makePayment",    label: "ทำจ่ายเงิน และออกหนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ)",                              href: "/purchasing/payments/new" },
            { key: "cancelPayment",  label: "ยกเลิกใบสำคัญจ่าย (50 ทวิ ของใบนั้นยกเลิกด้วย)",                                   href: "/purchasing/payments/cancel" },
        ],
    },
    // บุคคล / เงินเดือน เฟส 4 — ลำดับบิตต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "บุคคล / เงินเดือน",
        bits: [
            { key: "manageEmployees",  label: "จัดการพนักงาน (ทะเบียน ค่าจ้าง เลขประจำตัวประชาชน บัญชีรับเงินเดือน · เห็นเงินเดือนทุกคน)", href: "/people/employees" },
            { key: "viewPayroll",      label: "ดูรอบเงินเดือน สลิปของทุกคน และรายงานเงินเดือน/ภาษี",                                  href: "/people/payroll" },
            { key: "runPayroll",       label: "สร้าง/คิด/แก้รอบเงินเดือน และบันทึกจ่ายเงินเดือน",                                       href: "/people/payroll/new" },
            { key: "approvePayroll",   label: "อนุมัติ/ตีกลับรอบเงินเดือน (ต้องมี role อยู่ในชั้นที่รออยู่ด้วย)",                          href: "/people/payroll/approve" },
            { key: "approveTimesheet", label: "อนุมัติลงเวลา (ขอแก้เวลา · ดูลงเวลาพนักงานทุกคน · ลงชั่วโมงต่อโปรเจกต์ของทุกคนเมื่อเปิดใช้)", href: "/people/attendance-board" },
            { key: "approveLeave",     label: "อนุมัติ/ไม่อนุมัติใบลาของทุกคน และเห็นเหตุผล/ไฟล์แนบของใบลา",                              href: "/people/leave/approve" },
            { key: "manageHrSettings", label: "ตั้งค่าบุคคล (อัตราประกันสังคม ภาษีเงินได้ วันหยุดบริษัท ประเภทลา เวลาทำงาน)",                  href: "/people/settings" },
        ],
    },    // ปรับยอดเอกสาร (2026-10-18) — ลำดับบิตต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "ปรับยอด / คืนเงิน",
        bits: [
            { key: "refundCustomer", label: "บันทึกคืนเงินลูกค้าตามใบลดหนี้ (เงินออกจากบัญชีบริษัท)", href: "/sales/credit-notes/refund" },
        ],
    },
    // งาน Fastwork (2026-10-24 · P-1) — ลำดับบิตต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "Fastwork",
        bits: [
            { key: "manageFastwork", label: "จัดการงาน Fastwork (สร้างงาน บันทึกเงินที่แพลตฟอร์มโอน ตั้งอัตราค่าธรรมเนียม · เห็นยอดเงินทุกงาน)", href: "/fastwork" },
            { key: "manageProfitShares", label: "จัดการส่วนแบ่งกำไร (ตั้งส่วนแบ่ง เบิกล่วงหน้า ปิดยอด บันทึกจ่าย · เห็นส่วนแบ่งของทุกคน)", href: "/fastwork/shares" },
            { key: "manageCapitalFund", label: "จัดการเงินทุนสะสม (ดูยอดเงินทุนและรายได้ปีนี้เทียบเพดาน VAT · ตั้งเป้า · ฝากเพิ่ม/ถอนออก)", href: "/fastwork/capital" },
        ],
    },
    // ลิงก์เลือกบริการ (2026-10-25) — ลำดับบิตต้องตรงกับ PERMISSION_KEYS (append-only)
    {
        groupLabel: "ลิงก์เลือกบริการ",
        bits: [
            { key: "manageServiceRequests", label: "จัดการลิงก์เลือกบริการและคำขอบริการ (สร้าง/ปิดลิงก์ ตรวจ ปรับรายการ ปฏิเสธคำขอ · การอนุมัติ/ส่งใบเสนอราคาใช้สิทธิ์เดิม)", href: "/sales/service-requests" },
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
