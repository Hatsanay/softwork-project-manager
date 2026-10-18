// แผนก (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md ข้อ 3.1)
//
// - แผนกผูกสาขาเดียว · รหัสแผนก = รหัสสาขา 5 หลัก + ตัวย่อ 3 ตัว (ส่วนหน้าของรหัสพนักงาน) · ชื่อซ้ำได้ข้ามสาขา
// - เปลี่ยนสาขา/ตัวย่อได้เฉพาะตอนแผนกยังไม่มีพนักงาน (รวมที่พ้นสภาพแล้ว) — มีแล้วต้องสร้างแผนกใหม่แล้วใช้ "ย้ายแผนก/สาขา"
//   ให้รหัสพนักงานเปลี่ยนพร้อมออกบัตรใหม่ตามขั้นตอน
// - รหัสสาขาแก้ไม่ได้หลังสร้าง (branchUpdateSchema) → รหัสแผนกที่เก็บไว้ไม่มีวันผิด
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { buildDepartmentCode } = require("../shared/employee-code.mjs");

const MAX_LIST_LIMIT = 200;

function notFound() {
    return new AppError(404, "DEPARTMENT_NOT_FOUND", "ไม่พบแผนกนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

const SELECT_DEPARTMENT = `
    SELECT d.dep_id, d.dep_name, d.dep_branch_id, d.dep_abbr, d.dep_code, d.dep_status, d.dep_created_at, d.dep_updated_at,
           b.branch_code, b.branch_name_th, b.branch_status,
           (SELECT COUNT(*) FROM tb_employees e WHERE e.emp_department_id = d.dep_id) AS employee_count
    FROM tb_department d
    JOIN tb_branches b ON b.branch_id = d.dep_branch_id`;

function toDepartment(row) {
    return { ...row, employee_count: Number(row.employee_count) };
}

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ limit?: number, offset?: number, search?: string, status?: string, branchId?: string }} options
 */
async function listDepartments(conn, { limit = 10, offset = 0, search = "", status, branchId }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const like = `%${search}%`;
    const conditions = ["(d.dep_name LIKE ? OR d.dep_code LIKE ? OR b.branch_name_th LIKE ?)"];
    const params = [like, like, like];
    if (status === "active" || status === "inactive") {
        conditions.push("d.dep_status = ?");
        params.push(status);
    }
    if (branchId) {
        conditions.push("d.dep_branch_id = ?");
        params.push(branchId);
    }
    const where = conditions.join(" AND ");
    const [rows] = await conn.query(`${SELECT_DEPARTMENT} WHERE ${where} ORDER BY d.dep_code LIMIT ? OFFSET ?`, [
        ...params,
        safeLimit,
        safeOffset,
    ]);
    const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM tb_department d JOIN tb_branches b ON b.branch_id = d.dep_branch_id WHERE ${where}`,
        params,
    );
    return { data: rows.map(toDepartment), total: Number(total) };
}

async function getDepartment(conn, departmentId) {
    const [[row]] = await conn.query(`${SELECT_DEPARTMENT} WHERE d.dep_id = ?`, [departmentId]);
    if (!row) throw notFound();
    return toDepartment(row);
}

/** สาขาต้องมีจริง · ที่เลือกใหม่ต้องเปิดใช้งาน */
async function findBranch(conn, branchId, isNewChoice) {
    const [[branch]] = await conn.query("SELECT branch_id, branch_code, branch_status FROM tb_branches WHERE branch_id = ?", [
        branchId,
    ]);
    if (!branch) {
        throw new AppError(400, "VALIDATION", "ไม่พบสาขานี้", { dep_branch_id: "ไม่พบสาขานี้ กรุณาเลือกใหม่" });
    }
    if (isNewChoice && branch.branch_status !== "active") {
        throw new AppError(400, "VALIDATION", "สาขานี้ถูกปิดใช้งาน", { dep_branch_id: "สาขานี้ถูกปิดใช้งาน" });
    }
    return branch;
}

/** รหัสแผนกซ้ำ / ชื่อซ้ำในสาขาเดียวกัน → 409 พร้อมบอกว่าแผนกไหนใช้อยู่ */
async function assertUnique(conn, { departmentCode, name, branchId }, departmentId) {
    const [[sameCode]] = await conn.query("SELECT dep_name FROM tb_department WHERE dep_code = ? AND dep_id <> ?", [
        departmentCode,
        departmentId ?? "",
    ]);
    if (sameCode) {
        throw new AppError(409, "DEPARTMENT_CODE_EXISTS", `รหัส ${departmentCode} ถูกใช้แล้วกับแผนก "${sameCode.dep_name}"`, {
            dep_abbr: `ตัวย่อนี้ใช้แล้วในสาขานี้ (แผนก ${sameCode.dep_name})`,
        });
    }
    const [[sameName]] = await conn.query(
        "SELECT dep_code FROM tb_department WHERE dep_branch_id = ? AND dep_name = ? AND dep_id <> ?",
        [branchId, name, departmentId ?? ""],
    );
    if (sameName) {
        throw new AppError(409, "DEPARTMENT_NAME_EXISTS", `สาขานี้มีแผนกชื่อนี้แล้ว (รหัส ${sameName.dep_code})`, {
            dep_name: "สาขานี้มีแผนกชื่อนี้แล้ว",
        });
    }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} department ผ่าน departmentSchema แล้ว
 */
async function createDepartment(conn, department) {
    const branch = await findBranch(conn, department.dep_branch_id, true);
    const departmentCode = buildDepartmentCode(branch.branch_code, department.dep_abbr);
    await assertUnique(conn, { departmentCode, name: department.dep_name, branchId: branch.branch_id }, null);
    const departmentId = await generateDailyId("tb_department", "dep_id", "DEP");
    await conn.query(
        `INSERT INTO tb_department (dep_id, dep_name, dep_branch_id, dep_abbr, dep_code, dep_status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [departmentId, department.dep_name, branch.branch_id, department.dep_abbr, departmentCode, department.dep_status],
    );
    return { dep_id: departmentId, dep_code: departmentCode };
}

/**
 * ชื่อ/สถานะแก้ได้เสมอ · สาขา/ตัวย่อแก้ได้เฉพาะแผนกที่ยังไม่มีพนักงาน
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} departmentId
 * @param {object} department ผ่าน departmentSchema แล้ว
 */
async function updateDepartment(conn, departmentId, department) {
    const [[existing]] = await conn.query(
        "SELECT dep_id, dep_branch_id, dep_abbr, dep_code FROM tb_department WHERE dep_id = ? FOR UPDATE",
        [departmentId],
    );
    if (!existing) throw notFound();
    const isCodeChanged = existing.dep_branch_id !== department.dep_branch_id || existing.dep_abbr !== department.dep_abbr;
    const branch = await findBranch(conn, department.dep_branch_id, existing.dep_branch_id !== department.dep_branch_id);
    const departmentCode = buildDepartmentCode(branch.branch_code, department.dep_abbr);

    if (isCodeChanged) {
        const [[{ employeeCount }]] = await conn.query(
            "SELECT COUNT(*) AS employeeCount FROM tb_employees WHERE emp_department_id = ?",
            [departmentId],
        );
        if (Number(employeeCount) > 0) {
            throw new AppError(
                409,
                "DEPARTMENT_HAS_EMPLOYEES",
                `แผนกนี้มีพนักงาน ${employeeCount} คนแล้ว เปลี่ยนสาขาหรือตัวย่อไม่ได้ · ถ้าต้องการรหัสใหม่ ให้สร้างแผนกใหม่แล้วใช้ "ย้ายแผนก / สาขา" ที่หน้าพนักงาน (รหัสพนักงานเปลี่ยนพร้อมออกบัตรใหม่)`,
                { dep_abbr: "แผนกมีพนักงานแล้ว เปลี่ยนตัวย่อไม่ได้", dep_branch_id: "แผนกมีพนักงานแล้ว เปลี่ยนสาขาไม่ได้" },
            );
        }
    }
    await assertUnique(conn, { departmentCode, name: department.dep_name, branchId: branch.branch_id }, departmentId);
    await conn.query(
        `UPDATE tb_department SET dep_name = ?, dep_branch_id = ?, dep_abbr = ?, dep_code = ?, dep_status = ?
         WHERE dep_id = ?`,
        [department.dep_name, branch.branch_id, department.dep_abbr, departmentCode, department.dep_status, departmentId],
    );
    return { dep_id: departmentId, dep_code: departmentCode };
}

/** ลบได้เฉพาะแผนกที่ไม่มีพนักงาน/ประวัติรหัส/role อ้างอยู่ — ที่ใช้แล้วให้ปิดใช้งานแทน */
async function deleteDepartment(conn, departmentId) {
    const [[existing]] = await conn.query("SELECT dep_id FROM tb_department WHERE dep_id = ? FOR UPDATE", [departmentId]);
    if (!existing) throw notFound();
    const [[usage]] = await conn.query(
        `SELECT (SELECT COUNT(*) FROM tb_employees WHERE emp_department_id = ?) AS employees,
                (SELECT COUNT(*) FROM tb_employee_codes WHERE ecd_department_id = ?) AS codes,
                (SELECT COUNT(*) FROM tb_roles WHERE role_department = ?) AS roles`,
        [departmentId, departmentId, departmentId],
    );
    if (Number(usage.employees) > 0 || Number(usage.codes) > 0) {
        throw new AppError(409, "DEPARTMENT_IN_USE", "ลบแผนกนี้ไม่ได้ เพราะมีพนักงานหรือประวัติรหัสพนักงานอ้างอยู่ · ใช้ปิดใช้งานแทน");
    }
    if (Number(usage.roles) > 0) {
        throw new AppError(409, "DEPARTMENT_IN_USE", "ลบแผนกนี้ไม่ได้ เพราะมีสิทธิ์ (role) ผูกอยู่กับแผนกนี้ · ใช้ปิดใช้งานแทน");
    }
    await conn.query("DELETE FROM tb_department WHERE dep_id = ?", [departmentId]);
}

module.exports = { listDepartments, getDepartment, createDepartment, updateDepartment, deleteDepartment };
