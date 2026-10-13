// ลูกค้า — รับคำขอ → ตรวจข้อมูล (clientSchema) → เรียก service → ตอบ (ย้ายมาแบบ route → controller → service 13 ต.ค. 2026)
// รูปร่างคำตอบเหมือนเดิมทุกเส้น (หน้าเดิมและเทสต์ใช้อยู่)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { clientSchema } = require("../shared/schemas/client.mjs");
const clientService = require("../services/client.service");

async function getAll(req, res, next) {
    try {
        const result = await clientService.listClients(pool, {
            limit: req.query.limit,
            offset: req.query.offset,
            search: String(req.query.search ?? ""),
            status: req.query.status,
        });
        res.json(result);
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await clientService.findClient(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const client = validate(clientSchema, req.body);
        res.status(201).json(await withTransaction((conn) => clientService.createClient(conn, client)));
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const client = validate(clientSchema, req.body);
        await withTransaction((conn) => clientService.updateClient(conn, req.params.id, client));
        res.json({ message: "แก้ไขลูกค้าสำเร็จ" });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await withTransaction((conn) => clientService.deleteClient(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, remove };
