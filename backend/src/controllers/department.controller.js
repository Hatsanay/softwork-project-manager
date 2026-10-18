// แผนก — รับคำขอ → ตรวจข้อมูล (zod) → เรียก service → ตอบ (กติกาอยู่ที่ services/department.service.js)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { departmentSchema } = require("../shared/schemas/department.mjs");
const departmentService = require("../services/department.service");

async function getAll(req, res, next) {
    try {
        res.json(
            await departmentService.listDepartments(pool, {
                limit: req.query.limit,
                offset: req.query.offset,
                search: String(req.query.search ?? ""),
                status: req.query.status ? String(req.query.status) : undefined,
                branchId: req.query.branch_id ? String(req.query.branch_id) : undefined,
            }),
        );
    } catch (err) {
        next(err);
    }
}

async function getOne(req, res, next) {
    try {
        res.json(await departmentService.getDepartment(pool, req.params.id));
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const department = validate(departmentSchema, req.body);
        res.status(201).json(await withTransaction((conn) => departmentService.createDepartment(conn, department)));
    } catch (err) {
        next(err);
    }
}

async function update(req, res, next) {
    try {
        const department = validate(departmentSchema, req.body);
        res.json(
            await withTransaction((conn) => departmentService.updateDepartment(conn, req.params.id, department)),
        );
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        await withTransaction((conn) => departmentService.deleteDepartment(conn, req.params.id));
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = { getAll, getOne, create, update, remove };
