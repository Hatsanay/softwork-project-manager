const pool = require("../config/db");

// ลบ log ที่เก่าเกินระยะเก็บ วันละครั้ง (2026-10-08) — ทางเดียวที่ log ถูกลบได้ (ไม่มีปุ่มลบในหน้าเว็บ)
// ค่าเริ่มต้น 2 ปี: พอสำหรับสอบสวนย้อนหลังตามรอบตรวจสอบประจำปี และไม่ปล่อยให้ตารางโตไม่สิ้นสุด
// ตั้งเองได้ด้วย LOG_RETENTION_DAYS ใน .env (ต่ำสุด 90 วัน กันพิมพ์ผิดแล้ว log หายเกือบหมด)
// ลบทีละก้อน (LIMIT) ไม่ลบทีเดียวทั้งหมด กันล็อกตารางนานจนคำขอที่กำลังเขียน log ใหม่ต้องรอ
const DAY_MS = 24 * 60 * 60 * 1000;
const BATCH = 5000;

function retentionDays() {
    const n = Number(process.env.LOG_RETENTION_DAYS);
    return Number.isFinite(n) && n > 0 ? Math.max(90, Math.floor(n)) : 730;
}

async function deleteOld(sql, days) {
    let total = 0;
    for (;;) {
        const [result] = await pool.query(sql, [days, BATCH]);
        total += result.affectedRows;
        if (result.affectedRows < BATCH) return total;
    }
}

async function purgeOldLogs() {
    const days = retentionDays();
    try {
        const audit = await deleteOld("DELETE FROM tb_audit_logs WHERE aud_created_at < NOW() - INTERVAL ? DAY ORDER BY aud_id LIMIT ?", days);
        const errors = await deleteOld("DELETE FROM tb_error_logs WHERE err_last_seen < NOW() - INTERVAL ? DAY LIMIT ?", days);
        const logins = await deleteOld("DELETE FROM tb_login_logs WHERE log_created_at < NOW() - INTERVAL ? DAY LIMIT ?", days);
        if (audit || errors || logins) {
            console.log(`[log-retention] ลบ log เก่ากว่า ${days} วัน: audit ${audit}, error ${errors}, login ${logins}`);
        }
    } catch (err) {
        console.error("[log-retention] ล้มเหลว:", err.message);
    }
}

function startLogRetention() {
    setTimeout(purgeOldLogs, 60 * 1000).unref(); // รอ 1 นาทีหลังเริ่มระบบ ไม่แย่งทรัพยากรตอน start
    setInterval(purgeOldLogs, DAY_MS).unref();
}

module.exports = { startLogRetention, purgeOldLogs, retentionDays };
