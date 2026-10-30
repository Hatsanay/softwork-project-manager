// เรียก API อัตราแลกเปลี่ยนเฉลี่ยของธนาคารพาณิชย์ จากธนาคารแห่งประเทศไทย (2026-10-13 ขั้น 1A-2)
// แบบระบบ: docs/plans/2026-10-08-sales-cycle.md หัวข้อ 5 · risk-fixes R14
//
// GET {BOT_API_URL}?start_period=YYYY-MM-DD&end_period=YYYY-MM-DD&currency=USD
//   header "Authorization: <BOT_API_KEY>" (คีย์ตรงๆ ไม่มีคำว่า Bearer) · ขอได้ช่วงละไม่เกิน 31 วัน
//   คำตอบ: result.data.data_detail[] = { period, currency_id, buying_sight, buying_transfer, selling, mid_rate } เป็นข้อความ
//   วันที่ไม่มีข้อมูลบางชนิด ธปท. ส่งเป็น "" · อัตราเป็นราคาต่อหน่วยที่ ธปท. ประกาศ (บางสกุลต่อ 100/1000 หน่วย)
//
// คีย์อยู่ใน .env เท่านั้น — ห้ามใส่ใน error/log (error ที่โยนออกไปมีแค่รหัสกับข้อความภาษาไทย)
// อ่าน env ทุกครั้งที่เรียก (ไม่อ่านตอนโหลดไฟล์) — เปลี่ยน .env แล้ว restart ก็พอ และเทสต์ชี้ไปเซิร์ฟเวอร์จำลองได้
const DEFAULT_BOT_API_URL = "https://gateway.api.bot.or.th/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/";
const REQUEST_TIMEOUT_MS = 5000;
const RATE_FIELDS = ["buying_sight", "buying_transfer", "selling", "mid_rate"];

class BotRateError extends Error {
    /**
     * @param {"NO_API_KEY" | "BOT_TIMEOUT" | "BOT_UNREACHABLE" | "BOT_REJECTED" | "BOT_BAD_RESPONSE"} code
     * @param {string} message ข้อความภาษาไทยที่แสดงให้ผู้ใช้ได้
     */
    constructor(code, message) {
        super(message);
        this.name = "BotRateError";
        this.code = code;
    }
}

function isBotConfigured() {
    return Boolean(process.env.BOT_API_KEY?.trim());
}

function cleanRate(value) {
    const text = String(value ?? "").trim();
    return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0 ? text : null;
}

/**
 * @param {{ currency: string, startDate: string, endDate: string }} options วันที่เป็น "YYYY-MM-DD"
 * @returns {Promise<{ period: string, buying_sight: string|null, buying_transfer: string|null, selling: string|null, mid_rate: string|null }[]>}
 */
async function requestBotRates({ currency, startDate, endDate }) {
    const apiKey = process.env.BOT_API_KEY?.trim();
    if (!apiKey) {
        throw new BotRateError("NO_API_KEY", "ยังไม่ได้ตั้งคีย์ API ของ ธปท. · กรอกอัตราเองได้");
    }

    const url = new URL(process.env.BOT_API_URL?.trim() || DEFAULT_BOT_API_URL);
    url.searchParams.set("start_period", startDate);
    url.searchParams.set("end_period", endDate);
    url.searchParams.set("currency", currency);

    let response;
    try {
        response = await fetch(url, {
            headers: { Authorization: apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (err) {
        if (err?.name === "TimeoutError") {
            throw new BotRateError("BOT_TIMEOUT", "ธปท. ตอบช้าเกิน 5 วินาที · ลองใหม่ภายหลัง หรือกรอกอัตราเอง");
        }
        throw new BotRateError("BOT_UNREACHABLE", "เชื่อมต่อ ธปท. ไม่ได้ · ลองใหม่ภายหลัง หรือกรอกอัตราเอง");
    }

    if (response.status === 401 || response.status === 403) {
        throw new BotRateError(
            "BOT_REJECTED",
            "ธปท. ไม่รับคีย์ API (คีย์ผิดหรือหมดอายุ) · แจ้งผู้ดูแลระบบ ระหว่างนี้กรอกอัตราเองได้",
        );
    }
    if (!response.ok) {
        throw new BotRateError(
            "BOT_UNREACHABLE",
            `ธปท. ตอบกลับผิดปกติ (HTTP ${response.status}) · ลองใหม่ภายหลัง หรือกรอกอัตราเอง`,
        );
    }

    let body;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    const details = body?.result?.data?.data_detail;
    if (!Array.isArray(details)) {
        throw new BotRateError(
            "BOT_BAD_RESPONSE",
            "ข้อมูลจาก ธปท. ไม่อยู่ในรูปแบบที่รู้จัก · แจ้งผู้ดูแลระบบ ระหว่างนี้กรอกอัตราเองได้",
        );
    }

    return details
        .filter((detail) => /^\d{4}-\d{2}-\d{2}$/.test(String(detail?.period ?? "")))
        .filter((detail) => !detail.currency_id || String(detail.currency_id).toUpperCase() === currency)
        .map((detail) => {
            const row = { period: detail.period };
            for (const field of RATE_FIELDS) row[field] = cleanRate(detail[field]);
            return row;
        });
}

module.exports = { requestBotRates, isBotConfigured, BotRateError, RATE_FIELDS };
