// รหัสแผนก / รหัสพนักงาน (2026-10-18 — docs/plans/2026-10-18-employee-department-codes.md)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
//
//   รหัสแผนก     00000ACC              = รหัสสาขา 5 หลัก (ตามกรมสรรพากร) + ตัวย่อแผนก 3 ตัว
//   รหัสพนักงาน  00000ACC2610180001    = รหัสแผนก 8 + วันเริ่มงาน yymmdd (ปี ค.ศ.) 6 + ลำดับ 4 หลัก = 18 ตัวพอดี
//
// ลำดับเริ่มใหม่ทุกวันเริ่มงาน นับรวมทั้งบริษัท (ออกเลขที่ backend/src/utils/employee-code.js) · ย้ายแผนก/สาขา = รหัสใหม่
// ที่ใช้วันเริ่มงานเดิม (T1-ก) · รหัสที่เคยออกแล้วใช้ซ้ำไม่ได้ตลอดไป (tb_employee_codes)

export const DEPARTMENT_ABBR_LENGTH = 3;
export const EMPLOYEE_CODE_LENGTH = 18;
export const EMPLOYEE_SEQUENCE_DIGITS = 4;
export const MAX_EMPLOYEES_PER_HIRE_DATE = 9999;

export const DEPARTMENT_ABBR_PATTERN = /^[A-Z0-9]{3}$/;
export const DEPARTMENT_CODE_PATTERN = /^\d{5}[A-Z0-9]{3}$/;
export const EMPLOYEE_CODE_PATTERN = /^\d{5}[A-Z0-9]{3}\d{10}$/;

/** ตัวย่อที่ผู้ใช้พิมพ์ → ตัวพิมพ์ใหญ่ ตัดช่องว่าง */
export function normalizeDepartmentAbbr(text) {
    return String(text ?? "")
        .trim()
        .toUpperCase();
}

/** รหัสแผนก = รหัสสาขา + ตัวย่อ */
export function buildDepartmentCode(branchCode, abbr) {
    return `${branchCode}${normalizeDepartmentAbbr(abbr)}`;
}

/** "2026-10-18" → "261018" (ปี ค.ศ. 2 หลัก) */
export function hireDateDigits(dateText) {
    const [year, month, day] = String(dateText).split("-");
    return `${year.slice(2)}${month}${day}`;
}

/** ส่วนหน้าของรหัสพนักงาน (ยังไม่มีลำดับ) — ใช้แสดงตัวอย่างในฟอร์มก่อนบันทึก เช่น "00000ACC261018" */
export function employeeCodePrefix(departmentCode, hireDate) {
    return `${departmentCode}${hireDateDigits(hireDate)}`;
}

/** รหัสพนักงานเต็ม 18 ตัว */
export function buildEmployeeCode(departmentCode, hireDate, sequence) {
    return `${employeeCodePrefix(departmentCode, hireDate)}${String(sequence).padStart(EMPLOYEE_SEQUENCE_DIGITS, "0")}`;
}

/**
 * แยกรหัสพนักงานเป็นส่วนๆ เพื่ออธิบายบนหน้าจอ — รหัสรูปแบบเดิม (ก่อนปรับระบบ) คืน null
 * @returns {{ branchCode: string, abbr: string, departmentCode: string, hireDate: string, sequence: number } | null}
 */
export function describeEmployeeCode(code) {
    if (!EMPLOYEE_CODE_PATTERN.test(String(code ?? ""))) return null;
    // ปี 2 หลัก: เลือกศตวรรษที่ไม่เกินปีหน้า (2026 → 20xx · 99 → 1999 · ใช้ได้ต่อเนื่องหลังปี 2050)
    const nextYear = new Date().getFullYear() + 1;
    const yearIn2000s = 2000 + Number(code.slice(8, 10));
    const year = yearIn2000s > nextYear ? yearIn2000s - 100 : yearIn2000s;
    return {
        branchCode: code.slice(0, 5),
        abbr: code.slice(5, 8),
        departmentCode: code.slice(0, 8),
        hireDate: `${year}-${code.slice(10, 12)}-${code.slice(12, 14)}`,
        sequence: Number(code.slice(14)),
    };
}
