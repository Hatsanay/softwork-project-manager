const pool = require("../config/db");

function getDateYYYYMMDD() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
}

function runningOf(id) {
    return parseInt(id.slice(-7), 10);
}

// PREFIX + yyyymmdd + xxxxxxx (18 ตัว, เลขรัน 7 หลักท้ายรีเซ็ตใหม่ทุกวันต่อตาราง)
//
// ต้องกันสอง request ที่สร้างข้อมูลตารางเดียวกันพร้อมกันได้ id ซ้ำกัน (เดิม SELECT เลขล่าสุดแล้วค่อย insert ทีหลัง
// ไม่มีล็อก สอง request อ่านเลขเดียวกันได้ แล้วตัวที่สองพังด้วย duplicate key)
// ตอนนี้ใช้แถวของตารางนั้นใน tb_maxID เป็นตัวล็อก (SELECT ... FOR UPDATE ใน transaction) ให้ออก id ทีละคนต่อตาราง
// และนับ id ที่ "ออกไปแล้วแต่ caller ยังไม่ได้ insert" ด้วย (จาก tb_maxID) ไม่ใช่ดูจากตัวตารางอย่างเดียว
// ยังเทียบกับเลขล่าสุดในตัวตารางเองด้วยเสมอ เผื่อมีแถวที่ insert มือ/seed ตรงๆ โดยไม่ผ่านฟังก์ชันนี้
async function generateDailyId(table, column, prefix) {
    const date = getDateYYYYMMDD();
    const todayPrefix = `${prefix}${date}`;

    const conn = await pool.getConnection();
    try {
        // สร้างแถวล็อกไว้ก่อนถ้ายังไม่มี (ครั้งแรกของตารางนั้น) — IGNORE ถ้ามีอยู่แล้ว
        await conn.query("INSERT IGNORE INTO tb_maxID (max_table, max_id) VALUES (?, '')", [table]);

        await conn.beginTransaction();
        const [[lockRow]] = await conn.query(
            "SELECT max_id FROM tb_maxID WHERE max_table = ? FOR UPDATE",
            [table]
        );
        const [tableRows] = await conn.query(
            `SELECT ${column} AS id FROM ${table} WHERE ${column} LIKE ? ORDER BY ${column} DESC LIMIT 1`,
            [`${todayPrefix}%`]
        );

        let last = 0;
        if (lockRow?.max_id?.startsWith(todayPrefix)) last = runningOf(lockRow.max_id);
        if (tableRows[0]) last = Math.max(last, runningOf(tableRows[0].id));

        const id = todayPrefix + String(last + 1).padStart(7, "0");
        await conn.query("UPDATE tb_maxID SET max_id = ? WHERE max_table = ?", [id, table]);
        await conn.commit();
        return id;
    } catch (err) {
        await conn.rollback().catch(() => {});
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { generateDailyId };
