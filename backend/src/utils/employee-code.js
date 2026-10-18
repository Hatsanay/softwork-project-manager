// ออกรหัสพนักงาน (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
// รหัสแผนก + วันเริ่มงาน yymmdd + ลำดับ 4 หลัก · ลำดับนับรวมทั้งบริษัทต่อวันเริ่มงาน เก็บใน tb_document_sequences ชนิด EMP
// ออกเลขใน transaction เดียวกับการบันทึกพนักงาน (แถวลำดับถูกล็อกจนจบ transaction — บันทึกพร้อมกันไม่ได้เลขซ้ำ R1)
// เลขที่ออกไปแล้วไม่นำกลับมาใช้ (แก้ข้อมูล/ย้ายแผนก = เลขใหม่เสมอ) · กันชนกับประวัติรหัสอีกชั้น
const { AppError } = require("./app-error");
const { buildEmployeeCode, MAX_EMPLOYEES_PER_HIRE_DATE } = require("../shared/employee-code.mjs");

const SEQUENCE_TYPE = "EMP";

async function nextSequence(conn, compactHireDate) {
    await conn.query(
        `INSERT INTO tb_document_sequences (ds_doc_type, ds_date, ds_last)
         VALUES (?, ?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE ds_last = LAST_INSERT_ID(ds_last + 1)`,
        [SEQUENCE_TYPE, compactHireDate],
    );
    const [[row]] = await conn.query("SELECT LAST_INSERT_ID() AS sequence");
    return Number(row.sequence);
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn connection ที่อยู่ใน transaction
 * @param {string} departmentCode รหัสแผนก 8 ตัว
 * @param {string} hireDate "YYYY-MM-DD"
 * @returns {Promise<string>} รหัสพนักงาน 18 ตัว
 */
async function issueEmployeeCode(conn, departmentCode, hireDate) {
    const compactHireDate = hireDate.replaceAll("-", "");
    for (;;) {
        const sequence = await nextSequence(conn, compactHireDate);
        if (sequence > MAX_EMPLOYEES_PER_HIRE_DATE) {
            throw new AppError(
                409,
                "EMPLOYEE_CODE_EXHAUSTED",
                `วันเริ่มงาน ${hireDate} ออกรหัสครบ ${MAX_EMPLOYEES_PER_HIRE_DATE} รหัสแล้ว · ตรวจวันเริ่มงานอีกครั้ง`,
            );
        }
        const code = buildEmployeeCode(departmentCode, hireDate, sequence);
        const [[used]] = await conn.query("SELECT ecd_id FROM tb_employee_codes WHERE ecd_code = ?", [code]);
        if (!used) return code;
    }
}

module.exports = { issueEmployeeCode };
