// ภาพรวมธุรกิจบนแดชบอร์ด (2026-10-31 · docs/plans/2026-10-31-dashboard-business.md)
//
// แต่ละส่วนขึ้นตามสิทธิ์เดิมของหน้านั้น (ไม่มีสิทธิ์ใหม่) · ส่วนที่ไม่มีสิทธิ์ = ไม่มีใน JSON เลย
// ตัวเลขใช้ฟังก์ชันเดิมของหน้านั้น (ภาพรวม Fastwork เงินทุน ลูกหนี้) ตรงกับหน้านั้นเสมอ
// เงินเข้าเดือนนี้ = เงินเข้าบัญชีจริง: ใบเสร็จ (ยอดบาทที่เข้าจริง) + เงิน Fastwork ที่โอนเข้าแล้ว (หลังหักค่าธรรมเนียม) · เดือนตามเวลาไทย
const { hasBit } = require("../utils/permissions");
const { todayBangkok } = require("../utils/bangkok-time");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const fastworkService = require("./fastwork.service");
const capitalService = require("./capital.service");
const receivableService = require("./receivable.service");

// กราฟเงินเข้าย้อนหลัง (รวมเดือนนี้)
const CASH_MONTHS = 6;
// ใบเสนอราคาที่ยืนราคาเหลือไม่เกินกี่วัน = ใกล้หมดอายุ
const EXPIRING_SOON_DAYS = 7;
// งาน Fastwork ที่แสดงบนแดชบอร์ด (ที่เหลือดูในหน้า Fastwork)
const FASTWORK_PROJECT_LIMIT = 5;
// ใครเห็นศูนย์ Fastwork (ตรงกับ fastwork.routes canSeeHub)
const FASTWORK_HUB_BITS = ["manageFastwork", "createProject", "viewAllProjects", "manageProfitShares", "manageCapitalFund"];

/** "YYYY-MM" ของเดือนที่เลื่อนจาก "YYYY-MM-DD" ไป offset เดือน */
function shiftMonth(dateText, offset) {
    const [year, month] = dateText.split("-").map(Number);
    const index = year * 12 + (month - 1) + offset;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** เงินเข้าบัญชีจริงรายเดือน CASH_MONTHS เดือนล่าสุด (เดือนเก่าก่อน) แยกลูกค้าตรง / Fastwork */
async function cashByMonth(conn, today) {
    const firstMonth = shiftMonth(today, -(CASH_MONTHS - 1));
    const fromDate = `${firstMonth}-01`;
    const [receiptRows] = await conn.query(
        `SELECT DATE_FORMAT(rc_receipt_date, '%Y-%m') AS month, SUM(rc_received_thb) AS amount
         FROM tb_receipts WHERE rc_status = 'issued' AND rc_receipt_date >= ? AND rc_receipt_date <= ?
         GROUP BY month`,
        [fromDate, today],
    );
    const [fastworkRows] = await conn.query(
        `SELECT DATE_FORMAT(fwp_received_date, '%Y-%m') AS month, SUM(fwp_net) AS amount
         FROM tb_fastwork_payouts WHERE fwp_status = 'received' AND fwp_received_date >= ? AND fwp_received_date <= ?
         GROUP BY month`,
        [fromDate, today],
    );
    const amountOf = (rows, month) => parseHundredths(rows.find((row) => row.month === month)?.amount ?? "0", "เงินเข้า");
    const months = [];
    for (let offset = -(CASH_MONTHS - 1); offset <= 0; offset++) {
        const month = shiftMonth(today, offset);
        const direct = amountOf(receiptRows, month);
        const fastwork = amountOf(fastworkRows, month);
        months.push({ month, direct: formatHundredths(direct), fastwork: formatHundredths(fastwork), total: formatHundredths(direct + fastwork) });
    }
    return months;
}

/**
 * ส่วนธุรกิจของแดชบอร์ดตามสิทธิ์ของผู้ใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} rolePermission
 */
async function businessSummary(conn, rolePermission) {
    const today = todayBangkok();
    const can = (key) => hasBit(rolePermission, key);
    const result = { today };

    if (can("manageServiceRequests")) {
        const [[{ count }]] = await conn.query("SELECT COUNT(*) AS count FROM tb_service_requests WHERE svr_status = 'submitted'");
        result.requests = { submitted: Number(count) };
    }

    if (can("viewQuotations")) {
        // ส่งแล้ว ยังไม่ตอบ และยังไม่หมดอายุ (เลยวันยืนราคา = หมดอายุแล้ว ไม่นับว่ารอตอบ)
        const [[row]] = await conn.query(
            `SELECT COUNT(*) AS waiting,
                    SUM(CASE WHEN qt_valid_until <= DATE_ADD(?, INTERVAL ? DAY) THEN 1 ELSE 0 END) AS expiring_soon
             FROM tb_quotations WHERE qt_status = 'sent' AND (qt_valid_until IS NULL OR qt_valid_until >= ?)`,
            [today, EXPIRING_SOON_DAYS, today],
        );
        result.quotations = { waiting: Number(row.waiting), expiring_soon: Number(row.expiring_soon ?? 0), expiring_days: EXPIRING_SOON_DAYS };
    }

    if (can("viewReceipts")) {
        const aging = await receivableService.agingByClient(conn);
        const outstanding = parseHundredths(aging.totals.total, "ยอดค้าง");
        const overdue = outstanding - parseHundredths(aging.totals.current, "ยอดค้าง");
        const overdueClients = aging.clients.filter((client) => client.oldest_days_overdue > 0).length;
        result.receivables = { outstanding: formatHundredths(outstanding), overdue: formatHundredths(overdue), overdue_clients: overdueClients };
    }

    if (FASTWORK_HUB_BITS.some(can)) {
        const overview = await fastworkService.overview(conn, { canSeeMoney: can("manageFastwork") });
        result.fastwork = { steps: overview.steps, projects: overview.projects.slice(0, FASTWORK_PROJECT_LIMIT), project_count: overview.projects.length };
    }

    if (can("salesReports")) {
        // เงินที่ยังรอเข้า (ลูกหนี้ · Fastwork รอโอน) อยู่ในส่วนของตัวเอง แสดงแยกบรรทัด ไม่รวมกับเงินเข้าแล้ว
        result.cash = { months: await cashByMonth(conn, today) };
    }

    if (can("manageCapitalFund")) {
        const capital = await capitalService.overview(conn);
        result.capital = { goal: capital.goal.amount, target_date: capital.goal.target_date, percent: capital.goal.percent, balance: capital.totals.balance };
    }

    return result;
}

module.exports = { businessSummary, shiftMonth, CASH_MONTHS };
