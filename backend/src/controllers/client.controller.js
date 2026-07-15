const pool = require("../config/db");
const { generateId } = require("../utils/generateId");

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;

        const [rows] = await pool.query(
            `SELECT client_id, client_name, client_company, client_email, client_phone,
                    client_created_at, client_updated_at
             FROM tb_clients
             WHERE client_name LIKE ? OR client_company LIKE ?
             ORDER BY client_id DESC
             LIMIT ? OFFSET ?`,
            [search, search, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            "SELECT COUNT(*) AS total FROM tb_clients WHERE client_name LIKE ? OR client_company LIKE ?",
            [search, search]
        );

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query("SELECT * FROM tb_clients WHERE client_id = ?", [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบลูกค้านี้" });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { client_name, client_company, client_email, client_phone } = req.body;
        if (!client_name) return res.status(400).json({ message: "กรุณากรอกชื่อลูกค้า" });

        const client_id = await generateId("tb_clients", "CLI");
        await pool.query(
            "INSERT INTO tb_clients (client_id, client_name, client_company, client_email, client_phone) VALUES (?, ?, ?, ?, ?)",
            [client_id, client_name, client_company || null, client_email || null, client_phone || null]
        );

        res.status(201).json({ client_id, client_name });
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const { client_name, client_company, client_email, client_phone } = req.body;
        if (!client_name) return res.status(400).json({ message: "กรุณากรอกชื่อลูกค้า" });

        await pool.query(
            "UPDATE tb_clients SET client_name = ?, client_company = ?, client_email = ?, client_phone = ? WHERE client_id = ?",
            [client_name, client_company || null, client_email || null, client_phone || null, req.params.id]
        );

        res.json({ message: "แก้ไขลูกค้าสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await pool.query("DELETE FROM tb_clients WHERE client_id = ?", [req.params.id]);
        res.status(204).end();
    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED_2" || err.code === "ER_ROW_IS_REFERENCED") {
            return res.status(409).json({ message: "ไม่สามารถลบลูกค้านี้ได้ เพราะมีโปรเจกต์ผูกอยู่" });
        }
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, remove };
