// อัตราแลกเปลี่ยน (2026-10-13 ขั้น 1A-2) — รับคำขอ → ตรวจ → เรียก service → ตอบ
const pool = require("../config/db");
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { isBotConfigured } = require("../utils/bot-exchange-rate");
const { isRealDateText } = require("../shared/schemas/common.mjs");
const exchangeRateService = require("../services/exchange-rate.service");

const EARLIEST_DATE = "2000-01-01";

// GET /exchange-rates?currency=USD&date=2026-10-12 (ไม่ส่ง date = วันนี้เวลาไทย)
async function getDocumentRate(req, res, next) {
    try {
        const currencyCode = String(req.query.currency ?? "")
            .trim()
            .toUpperCase();
        if (!/^[A-Z]{3}$/.test(currencyCode)) {
            throw new AppError(400, "VALIDATION", "กรุณาระบุรหัสสกุลเงิน 3 ตัวอักษร เช่น USD", {
                currency: "รหัสสกุลเงินไม่ถูกต้อง",
            });
        }

        const today = todayBangkok();
        const requestedDate = req.query.date ? String(req.query.date) : today;
        if (!isRealDateText(requestedDate)) {
            throw new AppError(400, "VALIDATION", "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD", { date: "วันที่ไม่ถูกต้อง" });
        }
        if (requestedDate > today || requestedDate < EARLIEST_DATE) {
            throw new AppError(400, "VALIDATION", "ขอดูอัตราได้ตั้งแต่ปี 2000 ถึงวันนี้เท่านั้น", {
                date: "วันที่ต้องไม่เกินวันนี้",
            });
        }

        res.json(await exchangeRateService.findDocumentRate(pool, { currencyCode, requestedDate }));
    } catch (err) {
        next(err);
    }
}

// GET /exchange-rates/status — หน้าตั้งค่าใช้บอกว่าตั้งคีย์ ธปท. แล้วหรือยัง (ไม่ส่งตัวคีย์ออกไป)
function getStatus(req, res) {
    res.json({
        bot_configured: isBotConfigured(),
        rate_type: exchangeRateService.DOCUMENT_RATE_TYPE,
        lookback_days: exchangeRateService.LOOKBACK_DAYS,
    });
}

module.exports = { getDocumentRate, getStatus };
