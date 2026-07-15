const pool = require("../config/db");

// % ความคืบหน้า = weighted (SUM น้ำหนัก task ที่เสร็จ / SUM น้ำหนักทั้งหมด) — cache ไว้ที่ตัวโปรเจกต์
// เรียกทุกครั้งที่ task ถูกสร้าง/ลบ/เปลี่ยนสถานะ/เปลี่ยนน้ำหนัก
// นับเฉพาะ task ระดับบนสุด — subtask ไม่เอามาคำนวณ (ไม่งั้นงานเดียวกันจะถูกนับซ้ำทั้งที่ subtask และที่ task แม่)
async function recomputeProjectProgress(projectId) {
    const [[{ total_weight, done_weight }]] = await pool.query(
        `SELECT
            COALESCE(SUM(task_weight), 0) AS total_weight,
            COALESCE(SUM(CASE WHEN task_status = 'done' THEN task_weight ELSE 0 END), 0) AS done_weight
         FROM tb_tasks WHERE project_id = ? AND task_parent_id IS NULL`,
        [projectId]
    );

    const percent = total_weight > 0 ? (done_weight / total_weight) * 100 : 0;
    await pool.query(
        "UPDATE tb_projects SET project_progress_percent = ? WHERE project_id = ?",
        [percent.toFixed(2), projectId]
    );
    return percent;
}

module.exports = { recomputeProjectProgress };
