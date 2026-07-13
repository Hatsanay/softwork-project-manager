const pool = require("../config/db");

// สร้าง id แบบ prefix + running number จาก tb_maxID (หนึ่งแถวต่อหนึ่งตาราง)
// ล็อกแถวด้วย FOR UPDATE ในทรานแซกชันเดียวกัน กันสอง request ชนกันได้ id ซ้ำ
async function generateId(maxTable, prefix, totalLength = 15) {
    const padLength = totalLength - prefix.length;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.query(
            "SELECT max_id FROM tb_maxID WHERE max_table = ? FOR UPDATE",
            [maxTable]
        );

        const nextNumber = rows.length > 0
            ? parseInt(rows[0].max_id.slice(prefix.length), 10) + 1
            : 1;
        const nextId = prefix + String(nextNumber).padStart(padLength, "0");

        await conn.query(
            `INSERT INTO tb_maxID (max_table, max_id) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE max_id = VALUES(max_id)`,
            [maxTable, nextId]
        );

        await conn.commit();
        return nextId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { generateId };
