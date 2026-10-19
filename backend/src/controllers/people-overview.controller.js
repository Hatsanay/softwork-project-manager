// หน้า "ของฉัน" และ "ภาพรวมบุคคล" (2026-10-19 — docs/plans/2026-10-19-people-ux-redesign.md)
const pool = require("../config/db");
const overviewService = require("../services/people-overview.service");

async function getMyProfile(req, res, next) {
    try {
        res.json(await overviewService.getMyProfile(pool, req.user));
    } catch (err) {
        next(err);
    }
}

async function getOverview(req, res, next) {
    try {
        res.json(await overviewService.getOverview(pool, req.user));
    } catch (err) {
        next(err);
    }
}

module.exports = { getMyProfile, getOverview };
