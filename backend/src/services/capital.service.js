// เงินทุนสะสม (2026-10-25 · P-3 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 12)
//
// ยอดเงินทุน = เข้าจากโปรเจกต์ + ฝากเพิ่มเอง − ถอนออก
//   เข้าจากโปรเจกต์: อ่านจาก tb_share_settlements (ปิดยอดที่ยังไม่ยกเลิก) โดยตรง ไม่คัดลอกลงสมุดเงินทุน (ข้อมูลไม่ซ้ำ)
//   ฝาก/ถอน: tb_capital_entries ที่ยังไม่ยกเลิก
// เพดาน VAT: รายได้ปีนี้จาก salesSummary ตัวเดียวกับหน้ารายงาน (ไม่คิดซ้ำ) · ขึ้นเฉพาะตอนยังไม่จด VAT
const { AppError } = require("../utils/app-error");
const { nowBangkokText, todayBangkok } = require("../utils/bangkok-time");
const { divideRoundHalfUp, formatHundredths, parseHundredths } = require("../shared/money.mjs");
const salesReportService = require("./sales-report.service");

const COMPANY_ROW_ID = 1;
const VAT_CEILING = parseHundredths("1800000", "เพดาน VAT");
// ใกล้เพดาน = ตั้งแต่ 80% (เตือนล่วงหน้าให้เตรียมจด VAT)
const VAT_NEAR_PERMILLE = 800n;
// ค่าเฉลี่ยต่อเดือนคิดจากกี่เดือนล่าสุด (รวมเดือนนี้)
const AVERAGE_MONTHS = 6;

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");
const text = (hundredths) => formatHundredths(hundredths);

/** "YYYY-MM" ถอยหลัง/เดินหน้า n เดือน */
function shiftMonth(yearMonth, offset) {
    const [year, month] = yearMonth.split("-").map(Number);
    const index = year * 12 + (month - 1) + offset;
    const shiftedYear = Math.floor(index / 12);
    const shiftedMonth = (index % 12) + 1;
    return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}`;
}

async function findSettings(conn, { forUpdate = false } = {}) {
    const [[settings]] = await conn.query(
        `SELECT cs_capital_goal, DATE_FORMAT(cs_capital_target_date, '%Y-%m-%d') AS cs_capital_target_date,
                DATE_FORMAT(cs_incorporated_on, '%Y-%m-%d') AS cs_incorporated_on,
                DATE_FORMAT(cs_vat_registered_from, '%Y-%m-%d') AS cs_vat_registered_from
         FROM tb_company_settings WHERE cs_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [COMPANY_ROW_ID],
    );
    if (!settings) {
        throw new AppError(503, "COMPANY_SETTINGS_MISSING", "ยังไม่มีข้อมูลบริษัทในฐานข้อมูล แจ้งผู้ดูแลระบบให้รัน database/query/deploy_schema.sql");
    }
    return settings;
}

/** ยอดเข้าทุนจากการปิดยอดส่วนแบ่ง (ยังไม่ยกเลิก) ทุกโปรเจกต์ */
async function findProjectInflows(conn) {
    const [rows] = await conn.query(
        `SELECT s.sst_id, s.sst_project_id AS project_id, p.project_name, p.project_channel,
                DATE_FORMAT(s.sst_settled_date, '%Y-%m-%d') AS settled_date, s.sst_company_amount AS amount
         FROM tb_share_settlements s JOIN tb_projects p ON p.project_id = s.sst_project_id
         WHERE s.sst_status = 'settled'
         ORDER BY s.sst_settled_date DESC, s.sst_id DESC`,
    );
    return rows;
}

async function findEntries(conn) {
    const [rows] = await conn.query(
        `SELECT e.cpe_id, e.cpe_kind, e.cpe_amount, DATE_FORMAT(e.cpe_entry_date, '%Y-%m-%d') AS cpe_entry_date, e.cpe_note,
                e.cpe_status, e.cpe_cancel_reason, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name
         FROM tb_capital_entries e LEFT JOIN tb_users u ON u.user_id = e.cpe_created_by
         ORDER BY e.cpe_entry_date DESC, e.cpe_id DESC`,
    );
    return rows;
}

/** รวมยอด (สตางค์) จากรายการที่อ่านมาแล้ว */
function totalsOf(projectInflows, entries) {
    const activeEntries = entries.filter((entry) => entry.cpe_status === "active");
    const fromProjects = projectInflows.reduce((sum, row) => sum + money(row.amount), 0n);
    const deposits = activeEntries.filter((entry) => entry.cpe_kind === "deposit").reduce((sum, entry) => sum + money(entry.cpe_amount), 0n);
    const withdrawals = activeEntries.filter((entry) => entry.cpe_kind === "withdraw").reduce((sum, entry) => sum + money(entry.cpe_amount), 0n);
    return { fromProjects, deposits, withdrawals, balance: fromProjects + deposits - withdrawals };
}

async function balanceOf(conn) {
    return totalsOf(await findProjectInflows(conn), await findEntries(conn)).balance;
}

/** เงินเข้าสุทธิรายเดือน 6 เดือนล่าสุด → ค่าเฉลี่ย → เดือนที่คาดว่าถึงเป้า */
function forecastOf({ projectInflows, entries, balance, goal, today }) {
    const thisMonth = today.slice(0, 7);
    const months = [];
    for (let offset = AVERAGE_MONTHS - 1; offset >= 0; offset--) months.push(shiftMonth(thisMonth, -offset));
    const netByMonth = new Map(months.map((month) => [month, 0n]));
    for (const row of projectInflows) {
        const month = row.settled_date.slice(0, 7);
        if (netByMonth.has(month)) netByMonth.set(month, netByMonth.get(month) + money(row.amount));
    }
    for (const entry of entries.filter((row) => row.cpe_status === "active")) {
        const month = entry.cpe_entry_date.slice(0, 7);
        if (!netByMonth.has(month)) continue;
        const signed = entry.cpe_kind === "deposit" ? money(entry.cpe_amount) : -money(entry.cpe_amount);
        netByMonth.set(month, netByMonth.get(month) + signed);
    }
    const sixMonthTotal = [...netByMonth.values()].reduce((sum, amount) => sum + amount, 0n);
    const monthlyAverage = divideRoundHalfUp(sixMonthTotal, BigInt(AVERAGE_MONTHS));

    let remaining = null;
    let reachMonth = null;
    if (goal !== null) {
        remaining = goal - balance;
        if (remaining <= 0n) {
            remaining = 0n;
        } else if (monthlyAverage > 0n) {
            const monthsNeeded = Number((remaining + monthlyAverage - 1n) / monthlyAverage);
            reachMonth = shiftMonth(thisMonth, monthsNeeded);
        }
    }
    return {
        months: months.map((month) => ({ month, net: text(netByMonth.get(month)) })),
        monthly_average: text(monthlyAverage),
        remaining: remaining === null ? null : text(remaining),
        reach_month: reachMonth,
    };
}

/** รายได้ปีนี้เทียบเพดาน VAT · null = จด VAT แล้ว (ไม่ต้องดูเพดาน) */
async function vatCeilingOf(conn, settings, today) {
    const isVatRegistered = settings.cs_vat_registered_from !== null && settings.cs_vat_registered_from <= today;
    if (isVatRegistered) return null;
    const year = today.slice(0, 4);
    const summary = await salesReportService.salesSummary(conn, { from: `${year}-01-01`, to: today });
    const income = money(summary.total_income.amount_thb);
    const fastworkFee = money(summary.fastwork.fee_thb);
    const permille = (income * 1000n) / VAT_CEILING;
    let state = "ok";
    if (income > VAT_CEILING) state = "over";
    else if (permille >= VAT_NEAR_PERMILLE) state = "near";
    return {
        year: Number(year),
        ceiling: text(VAT_CEILING),
        income: text(income),
        direct_sales: summary.net_sales.amount_thb,
        fastwork_gross: summary.fastwork.gross_thb,
        fastwork_fee: text(fastworkFee),
        // รอนักบัญชีตอบ Z4: ถ้านับหลังหักค่าธรรมเนียม Fastwork จะเหลือเท่านี้
        income_after_fastwork_fee: text(income - fastworkFee),
        percent: Number(permille) / 10,
        remaining: text(VAT_CEILING > income ? VAT_CEILING - income : 0n),
        state,
    };
}

/** หน้าเงินทุนสะสม */
async function overview(conn) {
    const today = todayBangkok();
    const settings = await findSettings(conn);
    const projectInflows = await findProjectInflows(conn);
    const entries = await findEntries(conn);
    const totals = totalsOf(projectInflows, entries);
    const goal = settings.cs_capital_goal === null ? null : money(settings.cs_capital_goal);
    return {
        today,
        business: {
            incorporated_on: settings.cs_incorporated_on,
            vat_registered_from: settings.cs_vat_registered_from,
        },
        goal: {
            amount: settings.cs_capital_goal,
            target_date: settings.cs_capital_target_date,
            // ร้อยละความคืบหน้า (ทศนิยม 1 ตำแหน่ง · เกินเป้าได้เกิน 100)
            percent: goal === null || goal <= 0n ? null : Number((totals.balance * 1000n) / goal) / 10,
        },
        totals: {
            from_projects: text(totals.fromProjects),
            deposits: text(totals.deposits),
            withdrawals: text(totals.withdrawals),
            balance: text(totals.balance),
        },
        forecast: forecastOf({ projectInflows, entries, balance: totals.balance, goal, today }),
        project_inflows: projectInflows,
        entries,
        vat_ceiling: await vatCeilingOf(conn, settings, today),
    };
}

async function updateGoal(conn, input) {
    await findSettings(conn, { forUpdate: true });
    await conn.query("UPDATE tb_company_settings SET cs_capital_goal = ?, cs_capital_target_date = ? WHERE cs_id = ?", [
        input.cs_capital_goal,
        input.cs_capital_target_date,
        COMPANY_ROW_ID,
    ]);
    return { cs_capital_goal: input.cs_capital_goal, cs_capital_target_date: input.cs_capital_target_date };
}

/** ฝากเพิ่ม / ถอนออก · ล็อกแถวตั้งค่าบริษัทกันถอนพร้อมกันจนยอดติดลบ */
async function createEntry(conn, user, input) {
    await findSettings(conn, { forUpdate: true });
    if (input.cpe_entry_date > todayBangkok()) {
        throw new AppError(400, "VALIDATION", "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", { cpe_entry_date: "วันที่ต้องไม่เกินวันนี้" });
    }
    if (input.cpe_kind === "withdraw") {
        const balance = await balanceOf(conn);
        if (money(input.cpe_amount) > balance) {
            throw new AppError(400, "VALIDATION", "ถอนเกินยอดเงินทุนไม่ได้", {
                cpe_amount: `ถอนได้ไม่เกินยอดเงินทุนตอนนี้ ${text(balance > 0n ? balance : 0n)} บาท`,
            });
        }
    }
    const [result] = await conn.query(
        `INSERT INTO tb_capital_entries (cpe_kind, cpe_amount, cpe_entry_date, cpe_note, cpe_created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [input.cpe_kind, input.cpe_amount, input.cpe_entry_date, input.cpe_note, user.user_id],
    );
    return { cpe_id: result.insertId };
}

/** ยกเลิกรายการที่บันทึกผิด (ไม่ลบ เก็บเหตุผล) */
async function cancelEntry(conn, user, entryId, { reason }) {
    const [[entry]] = await conn.query("SELECT cpe_id, cpe_status FROM tb_capital_entries WHERE cpe_id = ? FOR UPDATE", [entryId]);
    if (!entry) throw new AppError(404, "CAPITAL_ENTRY_NOT_FOUND", "ไม่พบรายการนี้ กรุณาโหลดหน้าใหม่");
    if (entry.cpe_status !== "active") throw new AppError(409, "CAPITAL_ENTRY_CANCELLED", "รายการนี้ยกเลิกไปแล้ว");
    await conn.query(
        "UPDATE tb_capital_entries SET cpe_status = 'cancelled', cpe_cancel_reason = ?, cpe_cancelled_at = ?, cpe_cancelled_by = ? WHERE cpe_id = ?",
        [reason, nowBangkokText(), user.user_id, entryId],
    );
    return { cpe_id: entryId };
}

module.exports = { overview, updateGoal, createEntry, cancelEntry, shiftMonth };
