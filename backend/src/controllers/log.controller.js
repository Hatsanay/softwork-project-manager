const pool = require("../config/db");

// ทุก endpoint ในไฟล์นี้อ่านอย่างเดียว — ไม่มีการแก้/ลบ log จากหน้าเว็บโดยตั้งใจ (2026-10-08)
// เดิมมี DELETE /logs "ลบ log ทั้งหมด" ซึ่งทำให้ใครที่มีสิทธิ์เมนูนี้ลบร่องรอยของตัวเองได้ ขัดกับจุดประสงค์ของ log
// ของเก่าถูกลบอัตโนมัติตามระยะเก็บเท่านั้น (utils/logRetention.js)

const pageParams = (q) => ({
    limit: Math.min(Number(q.limit) || 20, 200),
    offset: Math.max(Number(q.offset) || 0, 0),
});

// ── การเข้าสู่ระบบ (tb_login_logs) ────────────────────────────────────────────────────────────────────
async function getAll(req, res, next) {
    try {
        const { limit, offset } = pageParams(req.query);
        const search = `%${req.query.search ?? ""}%`;
        const where = ["(log_email LIKE ? OR log_fullname LIKE ? OR log_ip_address LIKE ?)"];
        const params = [search, search, search];
        if (["login", "logout", "login_failed"].includes(req.query.action)) { where.push("log_action = ?"); params.push(req.query.action); }
        if (req.query.from) { where.push("log_created_at >= ?"); params.push(req.query.from); }
        if (req.query.to) { where.push("log_created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(req.query.to); }

        // ใช้ log_fullname ที่ snapshot ไว้ตอนเขียน log ตรงๆ ไม่ join ไป tb_users
        // เพราะถ้า user ถูกลบไปแล้ว join จะหาไม่เจอ ชื่อจะหายจาก log ทั้งที่ log_email ยังอยู่
        const [rows] = await pool.query(
            `SELECT log_id, log_email, log_fullname AS by_fullname, log_action,
                    log_ip_address, log_user_agent, log_created_at
             FROM tb_login_logs
             WHERE ${where.join(" AND ")}
             ORDER BY log_id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM tb_login_logs WHERE ${where.join(" AND ")}`, params);

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

// ── ประวัติการใช้งาน (tb_audit_logs) ──────────────────────────────────────────────────────────────────
const AUDIT_EVENTS = ["create", "update", "delete", "action", "view", "denied", "error"];

async function getAuditLogs(req, res, next) {
    try {
        const { limit, offset } = pageParams(req.query);
        const where = ["1=1"];
        const params = [];
        const q = String(req.query.search ?? "").trim();
        if (q) {
            // ค้นได้ทั้งชื่อ/ชื่อผู้ใช้ของผู้กระทำ, การกระทำ, path, id ของข้อมูล, request id และ IP
            where.push(`(aud_user_fullname LIKE ? OR aud_user_username LIKE ? OR aud_action LIKE ? OR aud_path LIKE ?
                         OR aud_entity_id = ? OR aud_project_id = ? OR aud_request_id = ? OR aud_ip = ?)`);
            const like = `%${q}%`;
            params.push(like, like, like, like, q, q, q, q);
        }
        if (AUDIT_EVENTS.includes(req.query.event)) { where.push("aud_event = ?"); params.push(req.query.event); }
        if (req.query.result === "success") where.push("aud_success = 1");
        if (req.query.result === "failed") where.push("aud_success = 0");
        if (req.query.entity_type) { where.push("aud_entity_type = ?"); params.push(req.query.entity_type); }
        if (req.query.user_id) { where.push("aud_user_id = ?"); params.push(req.query.user_id); }
        if (req.query.from) { where.push("aud_created_at >= ?"); params.push(req.query.from); }
        if (req.query.to) { where.push("aud_created_at < DATE_ADD(?, INTERVAL 1 DAY)"); params.push(req.query.to); }

        const [rows] = await pool.query(
            `SELECT aud_id, aud_request_id, aud_user_id, aud_user_username, aud_user_fullname, aud_role_name,
                    aud_event, aud_action, aud_method, aud_path, aud_entity_type, aud_entity_id, aud_project_id,
                    aud_status, aud_success, aud_error, aud_ip, aud_duration_ms, aud_created_at,
                    (aud_changes IS NOT NULL) AS has_changes
             FROM tb_audit_logs
             WHERE ${where.join(" AND ")}
             ORDER BY aud_id DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );
        const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM tb_audit_logs WHERE ${where.join(" AND ")}`, params);
        res.json({ data: rows.map((r) => ({ ...r, has_changes: !!r.has_changes, aud_success: !!r.aud_success })), total });
    } catch (err) {
        next(err);
    }
}

// รายละเอียดเต็มหนึ่งรายการ (ค่าก่อน/หลัง, payload, user-agent) — แยกจากรายการเพื่อไม่ให้หน้ารายการต้องโหลด JSON ก้อนใหญ่ทุกแถว
async function getAuditLog(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT * FROM tb_audit_logs WHERE aud_id = ?", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบรายการนี้" });
        const row = rows[0];
        const parse = (v) => { if (v == null || typeof v === "object") return v; try { return JSON.parse(v); } catch { return v; } };
        res.json({ ...row, aud_success: !!row.aud_success, aud_changes: parse(row.aud_changes), aud_payload: parse(row.aud_payload) });
    } catch (err) {
        next(err);
    }
}

// ── ข้อผิดพลาดของระบบ (tb_error_logs) ─────────────────────────────────────────────────────────────────
async function getErrorLogs(req, res, next) {
    try {
        const { limit, offset } = pageParams(req.query);
        const search = `%${req.query.search ?? ""}%`;
        const [rows] = await pool.query(
            `SELECT err_id, err_fingerprint, err_message, err_stack, err_status, err_method, err_path, err_count,
                    err_first_seen, err_last_seen, err_last_request_id, err_last_user_id, err_last_ip
             FROM tb_error_logs
             WHERE err_message LIKE ? OR err_path LIKE ? OR err_last_request_id = ?
             ORDER BY err_last_seen DESC
             LIMIT ? OFFSET ?`,
            [search, search, String(req.query.search ?? ""), limit, offset]
        );
        const [[{ total }]] = await pool.query(
            "SELECT COUNT(*) AS total FROM tb_error_logs WHERE err_message LIKE ? OR err_path LIKE ? OR err_last_request_id = ?",
            [search, search, String(req.query.search ?? "")]
        );
        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

module.exports = { getAll, getAuditLogs, getAuditLog, getErrorLogs };
