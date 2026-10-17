// พนักงานที่ผูกกับบัญชีผู้ใช้ที่ login (เฟส 4) — ใช้ร่วมกันระหว่างลงเวลา (timesheet.service) และการลา (leave.service)
// แยกไฟล์ไว้กันสองบริการเรียกกันเป็นวงกลม (ลงเวลาต้องรู้วันลา · ลาต้องตรวจชั่วโมงที่ลงไว้)

/**
 * พนักงานที่ผูกกับบัญชีนี้ — ถ้ามีหลายช่วง (ออกแล้วกลับมาใหม่) ใช้ช่วงล่าสุด
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} userId
 * @param {{ forUpdate?: boolean }} [options] forUpdate = ล็อกแถวพนักงานก่อนอ่านอย่างอื่น (บันทึก/ส่ง)
 */
async function findLinkedEmployee(conn, userId, { forUpdate = false } = {}) {
    const [[employee]] = await conn.query(
        `SELECT emp_id, emp_code, emp_first_name_th, emp_last_name_th,
                DATE_FORMAT(emp_hire_date, '%Y-%m-%d') AS emp_hire_date,
                DATE_FORMAT(emp_termination_date, '%Y-%m-%d') AS emp_termination_date
         FROM tb_employees WHERE emp_user_id = ?
         ORDER BY emp_hire_date DESC LIMIT 1 ${forUpdate ? "FOR UPDATE" : ""}`,
        [userId],
    );
    return employee ?? null;
}

module.exports = { findLinkedEmployee };
