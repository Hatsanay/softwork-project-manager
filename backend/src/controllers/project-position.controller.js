const pool = require("../config/db");
const { generateDailyId } = require("../utils/generateDailyId");

async function getAll(req, res, next) {
    try {
        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;
        const search = `%${req.query.search ?? ""}%`;
        const status = req.query.status === "active" || req.query.status === "inactive"
            ? req.query.status
            : null;

        const statusClause = status ? "AND position_status = ?" : "";
        const whereParams = status ? [search, status] : [search];

        const [rows] = await pool.query(
            `SELECT position_id, position_name, position_permission, position_status,
                    position_created_at, position_updated_at
             FROM tb_project_positions
             WHERE position_name LIKE ? ${statusClause}
             ORDER BY position_id DESC
             LIMIT ? OFFSET ?`,
            [...whereParams, limit, offset]
        );
        const [[{ total }]] = await pool.query(
            `SELECT COUNT(*) AS total FROM tb_project_positions WHERE position_name LIKE ? ${statusClause}`,
            whereParams
        );

        res.json({ data: rows, total });
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        const [rows] = await pool.query(
            `SELECT position_id, position_name, position_permission, position_status,
                    position_created_at, position_updated_at
             FROM tb_project_positions WHERE position_id = ?`,
            [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ message: "ไม่พบตำแหน่งนี้" });
        res.json(rows[0]);
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const { position_name, position_permission } = req.body;
        if (!position_name || !position_permission) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        const position_id = await generateDailyId("tb_project_positions", "position_id", "POS");
        await pool.query(
            "INSERT INTO tb_project_positions (position_id, position_name, position_permission) VALUES (?, ?, ?)",
            [position_id, position_name, position_permission]
        );

        res.status(201).json({ position_id });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "ชื่อตำแหน่งนี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const { position_name, position_permission, position_status } = req.body;
        if (!position_name || !position_permission) {
            return res.status(400).json({ message: "กรอกข้อมูลไม่ครบ" });
        }

        await pool.query(
            "UPDATE tb_project_positions SET position_name = ?, position_permission = ?, position_status = ? WHERE position_id = ?",
            [position_name, position_permission, position_status === "inactive" ? "inactive" : "active", req.params.id]
        );

        res.json({ message: "แก้ไขตำแหน่งสำเร็จ" });
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "ชื่อตำแหน่งนี้ถูกใช้งานแล้ว" });
        }
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await pool.query("DELETE FROM tb_project_positions WHERE position_id = ?", [req.params.id]);
        res.status(204).end();
    } catch (err) {
        if (err.code === "ER_ROW_IS_REFERENCED_2" || err.code === "ER_ROW_IS_REFERENCED") {
            return res.status(409).json({ message: "ไม่สามารถลบตำแหน่งนี้ได้ เพราะมีคนถือตำแหน่งนี้อยู่ในโปรเจกต์" });
        }
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, remove };
