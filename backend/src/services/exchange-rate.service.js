// อัตราแลกเปลี่ยนสำหรับเอกสารขาย (2026-10-13 ขั้น 1A-2 — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 5)
//
// ใช้ "อัตราล่าสุดที่ ธปท. ประกาศ ณ หรือก่อนวันที่เอกสาร" (วันหยุด / วันนี้ที่ยังไม่ประกาศ = ใช้วันทำการก่อนหน้า)
// ค้นย้อนหลังไม่เกิน 10 วัน (ครอบคลุมวันหยุดยาวสงกรานต์/ปีใหม่) — เก่ากว่านั้นถือว่าไม่มี ให้ผู้สร้างกรอกเอง
// ผลที่ดึงมาเก็บแคชใน tb_exchange_rates ทุกชนิดอัตรา (แปลงเป็นบาทต่อ 1 หน่วยแล้ว) และไม่ลบ — ใช้ย้อนตรวจได้
// ดึงจาก ธปท. ไม่ได้ (ไม่มีคีย์/ล่ม/ช้า) ไม่ทำให้คำขอพัง — ตอบ available: false พร้อมเหตุผล ให้หน้าเว็บเปิดช่องกรอกเอง
const { AppError } = require("../utils/app-error");
const { todayBangkok } = require("../utils/bangkok-time");
const { requestBotRates, isBotConfigured, BotRateError, RATE_FIELDS } = require("../utils/bot-exchange-rate");
const { ratePerUnit } = require("../shared/money.mjs");

const BASE_CURRENCY = "THB";
const LOOKBACK_DAYS = 10;

// ชนิดอัตราที่ใช้กับเอกสาร: อัตราซื้อถัวเฉลี่ยเงินโอน — รอนักบัญชียืนยัน (คำถาม B6) · เปลี่ยนที่นี่ที่เดียว
// (แคชเก็บครบทุกชนิดอยู่แล้ว เปลี่ยนชนิดทีหลังไม่ต้องดึงใหม่)
const DOCUMENT_RATE_TYPE = "buying_transfer";
const RATE_COLUMNS = {
    buying_sight: "er_buying_sight",
    buying_transfer: "er_buying_transfer",
    selling: "er_selling",
    mid_rate: "er_mid_rate",
};

// กันยิง ธปท. ซ้ำทุกครั้งที่ผู้ใช้เปิดฟอร์ม (จำในหน่วยความจำของ process — restart แล้วเริ่มใหม่ ไม่เป็นไร)
//   วันนี้/เมื่อวาน: อัตราอาจยังไม่ประกาศ → ลองใหม่ทุก 30 นาที · วันเก่ากว่านั้น: ข้อมูลไม่เปลี่ยนแล้ว ดึงครั้งเดียวพอ
//   ดึงไม่สำเร็จ: ลองใหม่ได้หลัง 2 นาที
const RECENT_RETRY_MS = 30 * 60 * 1000;
const FAILED_RETRY_MS = 2 * 60 * 1000;
const fetchAttempts = new Map();

/** "YYYY-MM-DD" ± จำนวนวัน (คิดแบบปฏิทิน ไม่ขึ้นกับเขตเวลาของเครื่อง) */
function shiftDate(dateText, dayCount) {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

function shouldFetch(attemptKey, requestedDate, now = Date.now()) {
    const attempt = fetchAttempts.get(attemptKey);
    if (!attempt) return true;
    if (!attempt.succeeded) return now - attempt.at >= FAILED_RETRY_MS;
    const isRecentDate = requestedDate >= shiftDate(todayBangkok(), -1);
    if (isRecentDate) return now - attempt.at >= RECENT_RETRY_MS;
    return false;
}

async function findCurrency(conn, currencyCode) {
    const [[currency]] = await conn.query("SELECT cur_code, cur_bot_unit FROM tb_currencies WHERE cur_code = ?", [
        currencyCode,
    ]);
    if (!currency) {
        throw new AppError(
            404,
            "CURRENCY_NOT_FOUND",
            `ไม่พบสกุลเงิน ${currencyCode} — เพิ่มได้ที่ ตั้งค่าระบบ › ข้อมูลบริษัท › สกุลเงิน`,
        );
    }
    return currency;
}

// อัตราที่แคชไว้ล่าสุด ณ หรือก่อนวันที่ขอ ภายในช่วงย้อนหลัง
async function findCachedRate(conn, currencyCode, requestedDate) {
    const column = RATE_COLUMNS[DOCUMENT_RATE_TYPE];
    const [[row]] = await conn.query(
        `SELECT DATE_FORMAT(er_rate_date, '%Y-%m-%d') AS rate_date, ${column} AS rate,
                er_buying_sight, er_buying_transfer, er_selling, er_mid_rate
         FROM tb_exchange_rates
         WHERE er_currency = ? AND er_rate_date BETWEEN ? AND ? AND ${column} IS NOT NULL
         ORDER BY er_rate_date DESC
         LIMIT 1`,
        [currencyCode, shiftDate(requestedDate, -LOOKBACK_DAYS), requestedDate],
    );
    return row ?? null;
}

// แปลงหน่วยที่ ธปท. ประกาศ (ต่อ 100/1000) เป็นบาทต่อ 1 หน่วยก่อนเก็บ · อัปเดตทับถ้า ธปท. แก้ตัวเลขย้อนหลัง
async function saveBotRates(conn, currency, botRows) {
    for (const botRow of botRows) {
        const converted = RATE_FIELDS.map((field) =>
            botRow[field] === null ? null : ratePerUnit(botRow[field], currency.cur_bot_unit),
        );
        await conn.query(
            `INSERT INTO tb_exchange_rates
                (er_currency, er_rate_date, er_buying_sight, er_buying_transfer, er_selling, er_mid_rate, er_fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())
             ON DUPLICATE KEY UPDATE
                er_buying_sight = VALUES(er_buying_sight), er_buying_transfer = VALUES(er_buying_transfer),
                er_selling = VALUES(er_selling), er_mid_rate = VALUES(er_mid_rate), er_fetched_at = NOW()`,
            [currency.cur_code, botRow.period, ...converted],
        );
    }
}

/**
 * อัตราแลกเปลี่ยนที่ใช้กับเอกสารวันที่ระบุ
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ currencyCode: string, requestedDate: string }} options
 */
async function findDocumentRate(conn, { currencyCode, requestedDate }) {
    const botConfigured = isBotConfigured();
    const base = {
        currency: currencyCode,
        requested_date: requestedDate,
        rate_type: DOCUMENT_RATE_TYPE,
        bot_configured: botConfigured,
    };

    if (currencyCode === BASE_CURRENCY) {
        return {
            ...base,
            available: true,
            rate: "1.0000000000",
            rate_date: requestedDate,
            source: "base",
            error: null,
        };
    }

    const currency = await findCurrency(conn, currencyCode);
    let cached = await findCachedRate(conn, currencyCode, requestedDate);
    let fetchError = null;

    const isExactDate = cached?.rate_date === requestedDate;
    const attemptKey = `${currencyCode}|${requestedDate}`;
    if (!isExactDate && shouldFetch(attemptKey, requestedDate)) {
        try {
            const botRows = await requestBotRates({
                currency: currencyCode,
                startDate: shiftDate(requestedDate, -LOOKBACK_DAYS),
                endDate: requestedDate,
            });
            await saveBotRates(conn, currency, botRows);
            fetchAttempts.set(attemptKey, { at: Date.now(), succeeded: true });
            cached = await findCachedRate(conn, currencyCode, requestedDate);
        } catch (err) {
            if (!(err instanceof BotRateError)) throw err;
            fetchAttempts.set(attemptKey, { at: Date.now(), succeeded: false });
            fetchError = { code: err.code, message: err.message };
            // บันทึก log บรรทัดเดียว — มีแค่รหัส ไม่มีคีย์ (R14)
            console.warn(`[exchange-rate] ${currencyCode} ${requestedDate}: ${err.code}`);
        }
    }

    if (!cached) {
        const error = fetchError ?? {
            code: "NO_RATE_FOUND",
            message: `ไม่พบอัตรา ${currencyCode} ของ ธปท. ในช่วง ${LOOKBACK_DAYS} วันก่อนวันที่นี้ — กรอกอัตราเองได้`,
        };
        return { ...base, available: false, rate: null, rate_date: null, source: null, error };
    }
    return {
        ...base,
        available: true,
        rate: cached.rate,
        rate_date: cached.rate_date,
        source: "bot",
        // มีอัตราเก่าในแคชแต่ดึงอันใหม่ไม่ได้ — ยังใช้ได้ แต่หน้าเว็บควรบอกวันที่ของอัตราให้ชัด
        error: fetchError,
        all_rates: {
            buying_sight: cached.er_buying_sight,
            buying_transfer: cached.er_buying_transfer,
            selling: cached.er_selling,
            mid_rate: cached.er_mid_rate,
        },
    };
}

// สำหรับเทสต์เท่านั้น — ล้างความจำว่าเคยดึงวันไหนแล้ว
function forgetFetchAttempts() {
    fetchAttempts.clear();
}

module.exports = { findDocumentRate, forgetFetchAttempts, DOCUMENT_RATE_TYPE, LOOKBACK_DAYS, shiftDate };
