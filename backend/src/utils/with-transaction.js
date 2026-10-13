// ทำงานหลายคำสั่ง SQL เป็นก้อนเดียว — สำเร็จทั้งหมดหรือไม่มีอะไรเปลี่ยนเลย (CODING_GUIDELINES หัวข้อ 3.2)
//
//   const quotation = await withTransaction((conn) => quotationService.approve(conn, quotationId, req.user));
//
// ที่เดียวที่เปิด/ปิด transaction — service รับ conn ไปใช้ ไม่ต้องเขียน begin/commit/rollback/release ซ้ำทุกที่
const pool = require("../config/db");

/**
 * @template T
 * @param {(conn: import("mysql2/promise").PoolConnection) => Promise<T>} work
 * @returns {Promise<T>} ค่าที่ work คืนมา (หลัง commit แล้ว)
 */
async function withTransaction(work) {
    const conn = await pool.getConnection();
    let isConnectionBroken = false;

    try {
        await conn.beginTransaction();
        const result = await work(conn);
        await conn.commit();
        return result;
    } catch (error) {
        try {
            await conn.rollback();
        } catch (rollbackError) {
            // rollback ไม่ได้ = การเชื่อมต่อเสียแล้ว (เช่น DB ตัดสาย) — ห้ามคืนเข้า pool ให้คำขออื่นหยิบไปใช้ต่อ
            // MySQL จะยกเลิกงานที่ค้างใน transaction เองเมื่อสายหลุด · ส่ง error เดิมต่อ เพราะนั่นคือสาเหตุจริง
            console.error("[transaction] rollback ไม่สำเร็จ:", rollbackError.message);
            isConnectionBroken = true;
        }
        throw error;
    } finally {
        if (isConnectionBroken) {
            conn.destroy();
        } else {
            conn.release();
        }
    }
}

module.exports = { withTransaction };
