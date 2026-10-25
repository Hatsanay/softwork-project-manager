// ตั้งค่าเริ่มต้นของบริษัท (ก่อนเริ่มใช้ระบบจริง 1 พ.ค. 2026) — ข้อมูลบริษัท แผนก สิทธิ์ ผู้ใช้ พนักงาน ลูกค้า ผู้ขาย สินค้า วันหยุด
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { as } = require("./api");
const data = require("./data");

const HEAD_OFFICE_ID = "BRA202601010000001";
const EMAIL_DOMAIN = "softwork.fasttiw.com";
const HR = "wannipa";
// ช่องตั้งค่าบุคคลทั้งหมด (PUT /V1/people/settings ต้องส่งครบทุกช่อง · ตรงกับ payrollSettingsSchema)
const SETTINGS_FIELDS = [
    "ps_working_weekdays", "ps_hours_per_day", "ps_pay_day", "ps_unpaid_leave_divisor", "ps_timesheet_backdate_days",
    "ps_card_valid_years", "ps_default_schedule_id", "ps_timesheet_enabled", "ps_attendance_start_date", "ps_ot_rate_workday",
    "ps_ot_rate_holiday_work", "ps_ot_rate_holiday_ot", "ps_ot_weekly_cap_hours", "ps_ot_is_sso_wage",
];

/** แก้ตั้งค่าบุคคลบางช่อง (ช่องอื่นส่งค่าเดิมกลับไป) */
async function updatePeopleSettings(changes) {
    const setup = await as(HR, "GET", "/V1/people/setup");
    const settings = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, setup.settings[field]]));
    await as(HR, "PUT", "/V1/people/settings", { ...settings, ...changes });
}

/** ลายเซ็นลายมือ (PNG) — เส้นโค้งต่างกันตามชื่อ ไม่ใช่ลายเซ็นของใครจริง */
async function signatureImage(seedText) {
    const codes = [...seedText].map((character) => character.charCodeAt(0));
    let path = "M 20 70";
    codes.forEach((code, index) => {
        const x = 40 + index * 34;
        const high = 20 + (code % 30);
        const low = 80 + (code % 25);
        path += ` C ${x - 10} ${high}, ${x + 6} ${low}, ${x + 18} ${50 + (code % 20)}`;
    });
    const width = 60 + codes.length * 34;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="120">
        <path d="${path}" fill="none" stroke="#1e3a8a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 30 100 Q ${width / 2} 88 ${width - 20} 98" fill="none" stroke="#1e3a8a" stroke-width="2"/>
    </svg>`;
    return sharp(Buffer.from(svg)).png().toBuffer();
}

function bitsFor(permissionKeys, keys) {
    if (keys === "ALL") return permissionKeys.map(() => "1").join("");
    return permissionKeys.map((key) => (keys.includes(key) ? "1" : "0")).join("");
}

/**
 * @param {{ pool: import("mysql2/promise").Pool, permissionKeys: string[], generateDailyId: Function, password: string }} context
 * @returns {Promise<object>} ids ทุกอย่างที่ขั้นถัดไปต้องใช้
 */
async function setupCompany({ pool, permissionKeys, generateDailyId, password }) {
    const ids = { headOffice: HEAD_OFFICE_ID, departments: {}, roles: {}, users: {}, employees: {}, clients: {}, vendors: {} };

    // admin จาก reset_all_data.sql ถูกบังคับเปลี่ยนรหัสตอนเข้าครั้งแรก — บนเครื่อง dev ปลดไว้ให้สคริปต์ใช้งานได้
    await pool.query("UPDATE tb_users SET user_must_change_password = 0 WHERE user_username = 'admin'");

    // ── บริษัท สำนักงานใหญ่ บัญชีธนาคาร
    await as("admin", "PUT", "/V1/company", data.COMPANY);
    await pool.query("UPDATE tb_company_settings SET cs_logo_url = ? WHERE cs_id = 1", [data.COMPANY_LOGO]);
    await as("admin", "PUT", `/V1/company/branches/${HEAD_OFFICE_ID}`, data.HEAD_OFFICE);
    const bank = await as("admin", "POST", "/V1/company/bank-accounts", data.BANK_ACCOUNT);
    ids.bankAccount = bank.ba_id;

    // ── แผนก
    for (const [abbr, name] of Object.entries(data.DEPARTMENTS)) {
        const department = await as("admin", "POST", "/V1/departments", {
            dep_name: name,
            dep_branch_id: HEAD_OFFICE_ID,
            dep_abbr: abbr,
        });
        ids.departments[abbr] = department.dep_id;
    }

    // ── สิทธิ์
    for (const [key, role] of Object.entries(data.ROLES)) {
        const created = await as("admin", "POST", "/V1/roles", {
            role_name: role.name,
            role_permission: bitsFor(permissionKeys, role.keys),
        });
        ids.roles[key] = created.role_id;
    }

    // ── บัญชีผู้ใช้ (ใส่ตรงในฐาน dev: รหัสผ่านเดียวกันทุกคน · ไม่บังคับเปลี่ยนรหัส · มีอีเมลแล้ว)
    const passwordHash = await bcrypt.hash(password, 10);
    async function createUser({ username, fname, lname, email, phone, role }) {
        const userId = await generateDailyId("tb_users", "user_id", "USE");
        await pool.query(
            `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_phone,
                                   user_role_id, user_branch_id, user_status, user_must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0)`,
            [userId, username, email, passwordHash, fname, lname, phone, ids.roles[role], HEAD_OFFICE_ID],
        );
        ids.users[username] = userId;
    }
    await createUser(data.OWNER);
    for (const employee of data.EMPLOYEES.filter((item) => item.username)) {
        await createUser({
            username: employee.username,
            fname: employee.first,
            lname: employee.last,
            email: `${employee.username}@${EMAIL_DOMAIN}`,
            phone: employee.phone,
            role: employee.role,
        });
    }

    // ── กติกาอนุมัติ
    const approvalRules = {
        QT: [
            { al_min_amount_thb: "0", al_require_distinct: false, role_ids: [ids.roles.salesManager, ids.roles.md] },
            { al_min_amount_thb: "300000", al_require_distinct: false, role_ids: [ids.roles.md] },
        ],
        IV: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [ids.roles.md, ids.roles.salesManager] }],
        EX: [{ al_min_amount_thb: "3000", al_require_distinct: false, role_ids: [ids.roles.md] }],
        EC: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [ids.roles.md, ids.roles.accountant] }],
        PR: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [ids.roles.md] }],
        CN: [{ al_min_amount_thb: "0", al_require_distinct: false, role_ids: [ids.roles.md] }],
    };
    for (const [docType, levels] of Object.entries(approvalRules)) {
        await as("admin", "PUT", "/V1/company/approval-levels", { doc_type: docType, levels });
    }

    // ── ตำแหน่งในโปรเจกต์ (PM มีจากค่าเริ่มต้นแล้ว)
    const { PROJECT_PERMISSION_KEYS } = require("../../src/utils/projectPermissions");
    const projectBits = (keys) => PROJECT_PERMISSION_KEYS.map((key) => (keys.includes(key) ? "1" : "0")).join("");
    const ownWork = [
        "editOwnTask", "changeOwnTaskStatus", "changeSubtaskStatus", "addOwnSubtask", "changeOwnSubtaskStatus",
        "addIssueTask", "addOwnIssueTask", "editOwnIssueTask", "changeOwnIssueStatusTask", "deleteOwnIssueTask",
        "addIssueSubtask", "addOwnIssueSubtask", "editOwnIssueSubtask", "changeOwnIssueStatusSubtask", "deleteOwnIssueSubtask",
    ];
    const positions = {
        developer: ["นักพัฒนา", ownWork],
        designer: ["นักออกแบบ UX/UI", ownWork],
        tester: ["ผู้ทดสอบระบบ", [...ownWork, "changeIssueStatusTask", "changeIssueStatusSubtask", "editIssueTask", "editIssueSubtask"]],
        accountManager: ["ผู้ดูแลลูกค้า", ["addIssueTask", "addIssueSubtask", "addOwnIssueTask", "addOwnIssueSubtask"]],
    };
    ids.positions = {};
    for (const [key, [name, keys]] of Object.entries(positions)) {
        const created = await as("admin", "POST", "/V1/project-positions", {
            position_name: name,
            position_permission: projectBits(keys),
        });
        ids.positions[key] = created.position_id;
    }
    const [[pm]] = await pool.query("SELECT position_id FROM tb_project_positions WHERE position_name = 'PM'");
    ids.positions.pm = pm.position_id;

    // ── วันหยุด
    for (const [date, name] of data.HOLIDAYS_2026) {
        await as("wannipa", "POST", "/V1/people/holidays", { hd_date: date, hd_name: name });
    }

    // ── ลูกค้า ผู้ขาย สินค้า
    for (const [key, client] of Object.entries(data.CLIENTS)) {
        const created = await as("siriporn", "POST", "/V1/clients", client);
        ids.clients[key] = created.client_id;
    }
    for (const [key, vendor] of Object.entries(data.VENDORS)) {
        const created = await as("kamonchanok", "POST", "/V1/vendors", vendor);
        ids.vendors[key] = created.vd_id;
    }
    const categoryIds = [];
    for (const [index, name] of data.PRODUCT_CATEGORIES.entries()) {
        const created = await as("siriporn", "POST", "/V1/product-categories", { pc_name: name, pc_sort_order: index + 1, pc_status: "active" });
        categoryIds.push(created.pc_id);
    }
    ids.categories = categoryIds;
    ids.products = {};
    for (const product of data.PRODUCTS) {
        const created = await as("siriporn", "POST", "/V1/products", {
            product_code: product.code,
            product_name: product.name,
            product_unit: product.unit,
            product_price: product.price,
            product_category_id: categoryIds[product.category],
            product_status: "active",
            product_is_public: Boolean(product.isPublic),
        });
        ids.products[product.key] = { id: created.product_id, ...product };
    }
    const website = ids.products;
    ids.packages = {};
    ids.packages.corporateWebsite = (await as("siriporn", "POST", "/V1/product-packages", {
        pkg_name: "เว็บไซต์องค์กรพร้อมระบบหลังบ้าน",
        pkg_description: "เว็บไซต์ 8 หน้า รองรับมือถือ ระบบจัดการเนื้อหา โฮสติ้งและโดเมนปีแรก",
        pkg_category_id: categoryIds[0],
        pkg_status: "active",
        pkg_is_public: true,
        items: [
            { pki_type: "heading", pki_description: "ออกแบบและพัฒนา" },
            { pki_type: "item", pki_product_id: website.uxui.id, pki_description: website.uxui.name, pki_quantity: "8", pki_unit: "หน้าจอ", pki_unit_price: "2500" },
            { pki_type: "item", pki_product_id: website.webDev.id, pki_description: website.webDev.name, pki_quantity: "12", pki_unit: "Man-day", pki_unit_price: "4500" },
            { pki_type: "heading", pki_description: "ติดตั้งและเปิดใช้งาน" },
            { pki_type: "item", pki_product_id: website.deploy.id, pki_description: website.deploy.name, pki_quantity: "1", pki_unit: "งาน", pki_unit_price: "8000" },
            { pki_type: "item", pki_product_id: website.hosting.id, pki_description: website.hosting.name, pki_quantity: "1", pki_unit: "ปี", pki_unit_price: "18000" },
            { pki_type: "item", pki_product_id: website.domain.id, pki_description: website.domain.name, pki_quantity: "1", pki_unit: "ปี", pki_unit_price: "650" },
        ],
    })).pkg_id;

    // ── พนักงานที่เริ่มงานก่อนเริ่มใช้ระบบ
    for (const employee of data.EMPLOYEES.filter((item) => !item.hireAt)) {
        await addEmployee(employee, ids);
    }

    // ── ข้อมูลจำลองชุดเต็ม (2026-10-24): บัญชีธนาคารเพิ่ม · ลายเซ็น · ลงชั่วโมงต่อโปรเจกต์ · ค่าลดหย่อน
    ids.bankAccounts = { main: bank.ba_id };
    for (const account of data.EXTRA_BANK_ACCOUNTS) {
        const created = await as("admin", "POST", "/V1/company/bank-accounts", account);
        ids.bankAccounts[account.ba_currency === "USD" ? "usd" : "savings"] = created.ba_id;
    }
    for (const username of data.SIGNERS) {
        const form = new FormData();
        form.append("signature", new Blob([await signatureImage(username)], { type: "image/png" }), "signature.png");
        form.append("method", "draw");
        form.append("password", password);
        await as(username, "PUT", "/V1/users/me/signature", form);
    }
    // บริษัทลงชั่วโมงต่อโปรเจกต์ตั้งแต่ พ.ค. (คิดต้นทุนค่าแรงโปรเจกต์) · ลงเวลาเข้า-ออกงานเริ่ม 1 มิ.ย. (ตั้งใน timeline)
    await updatePeopleSettings({ ps_timesheet_enabled: true });
    for (const [key, profile] of Object.entries(data.TAX_PROFILES)) {
        await as(HR, "PUT", `/V1/employees/${ids.employees[key]}/tax-profiles/2026`, profile);
    }
    return ids;
}

/** เพิ่มพนักงาน + รายการประจำ + ปรับเงินเดือนล่วงหน้า (ถ้ามี) — ทำโดยฝ่ายบุคคล */
async function addEmployee(employee, ids) {
    const created = await as("wannipa", "POST", "/V1/employees", {
        emp_user_id: employee.username ? ids.users[employee.username] : null,
        emp_title: employee.title,
        emp_first_name_th: employee.first,
        emp_last_name_th: employee.last,
        emp_first_name_en: employee.firstEn ?? null,
        emp_last_name_en: employee.lastEn ?? null,
        emp_nickname: employee.nickname,
        emp_national_id: employee.nationalId,
        emp_birth_date: employee.birth,
        emp_address: employee.address,
        emp_phone: employee.phone,
        emp_email: employee.username ? `${employee.username}@${EMAIL_DOMAIN}` : null,
        emp_department_id: ids.departments[employee.dept],
        emp_position: employee.position,
        emp_hire_date: employee.hire,
        emp_bank_name: employee.bank,
        emp_bank_account_no: employee.account,
        emp_bank_account_name: `${employee.first} ${employee.last}`,
        emp_sso_enrolled: true,
        // ไม่มีบัญชีเข้าระบบ = กดเข้า/ออกงานไม่ได้ จึงไม่ต้องลงเวลา (ไม่งั้นทุกวันขึ้นขาดและถูกหักเงิน)
        emp_attendance_required: employee.attendance ?? Boolean(employee.username),
        ecm_base_salary: employee.salary,
    });
    ids.employees[employee.key] = created.emp_id;
    for (const item of employee.recurring ?? []) {
        await as("wannipa", "POST", `/V1/employees/${created.emp_id}/recurring-items`, {
            eri_kind: item.kind,
            eri_label: item.label,
            eri_amount: item.amount,
            eri_is_taxable: item.taxable,
            eri_is_sso_wage: item.ssoWage,
            eri_effective_from: item.from,
            eri_effective_to: item.to ?? null,
        });
    }
    if (employee.raise) {
        await as("wannipa", "POST", `/V1/employees/${created.emp_id}/compensations`, {
            ecm_effective_from: employee.raise.from,
            ecm_base_salary: employee.raise.salary,
            ecm_note: employee.raise.note,
        });
    }
    return created.emp_id;
}

module.exports = { setupCompany, addEmployee, updatePeopleSettings, HEAD_OFFICE_ID };
