const pool = require("../config/db");

function getDateYYYYMMDD() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

// yyyymmddxxxxxxx (15 ตัว, running 7 หลัก) — เลขรันรีเซ็ตใหม่ทุกวัน เหมาะกับตารางที่มีข้อมูลเยอะรายวันอย่าง log
// หา running ล่าสุดจากตัวตารางเองแทนการใช้ tb_maxID เพราะ id ผูกกับวันที่ ไม่ใช่ counter ต่อเนื่องยาวๆ แบบ user/role
async function generateDailyId(table, column) {
    const date = getDateYYYYMMDD();
    const [rows] = await pool.query(
        `SELECT ${column} FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
        [`${date}%`]
    );
    const running = rows.length > 0
        ? parseInt(rows[0][column].slice(-7), 10) + 1
        : 1;
    return date + String(running).padStart(7, "0");
}

module.exports = { generateDailyId };
