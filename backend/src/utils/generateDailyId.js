const pool = require("../config/db");

function getDateYYYYMMDD() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

// PREFIX + yyyymmdd + xxxxxxx (18 ตัว, เลขรัน 7 หลักท้ายรีเซ็ตใหม่ทุกวันต่อตาราง)
// หา running ล่าสุดจากตัวตารางเองเป็นหลัก (ไม่ได้ใช้ tb_maxID มาคำนวณเลขถัดไป เพราะ id ผูกกับวันที่ ไม่ใช่ counter ต่อเนื่องยาวๆ)
// แต่ยังอัปเดต tb_maxID ไว้เป็น bookkeeping คู่ขนานทุกครั้งที่ออก id ใหม่ (เก็บ "id ล่าสุดที่เคยออก" ต่อตาราง ไว้ดูอ้างอิงได้)
async function generateDailyId(table, column, prefix) {
    const date = getDateYYYYMMDD();
    const [rows] = await pool.query(
        `SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
        [`${prefix}${date}%`]
    );
    const running = rows.length > 0
        ? parseInt(rows[0][column].slice(-7), 10) + 1
        : 1;
    const id = prefix + date + String(running).padStart(7, "0");

    await pool.query(
        `INSERT INTO tb_maxID (max_table, max_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE max_id = VALUES(max_id)`,
        [table, id]
    );

    return id;
}

module.exports = { generateDailyId };
