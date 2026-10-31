// ส่วนแบ่งกำไรรายโปรเจกต์ (2026-10-24 · P-2 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 4)
//
// กำไรที่แบ่งได้ (ฐานเงินสด Q2): รายได้ที่เงินเข้าจริงก่อน VAT − ค่าธรรมเนียมแพลตฟอร์ม − ค่าใช้จ่ายของโปรเจกต์ (ไม่รวมค่าแรงจากเงินเดือน)
//   รายได้ = ใบเสร็จของใบแจ้งหนี้ในโปรเจกต์ (ส่วนก่อน VAT) − คืนเงินลูกค้าตามใบลดหนี้ + ราคางวด Fastwork ที่เงินเข้าแล้ว
// แบ่ง (Q3-ค): ส่วนตายตัวก่อน → % ของที่เหลือ → ที่เหลือเข้าเงินทุน (shared/profit-share-math.mjs)
// ปิดยอดตอนจบ + เบิกล่วงหน้าได้ (Q4-ก): ปิดยอด = ล็อกตัวเลข · เบิกไปแล้วหักให้ · ติดลบ = ต้องคืน
// ห้ามระหว่างปิดยอดแล้ว: แก้ส่วนแบ่ง · เบิกเพิ่ม · บันทึก/ยกเลิกเงิน Fastwork (ยกเลิกการปิดยอดก่อน ถ้ายังไม่ได้จ่ายใคร)
// แต่ละคนเห็นเฉพาะของตัวเอง แต่เห็นที่มาของตัวเลขครบ (Q6): เงินเข้า ค่าธรรมเนียม ค่าใช้จ่าย รวมส่วนตายตัว (ยอดรวม) % ของตัวเอง เบิกล่วงหน้า
const { AppError } = require("../utils/app-error");
const { nowBangkokText, todayBangkok } = require("../utils/bangkok-time");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { splitProfit } = require("../shared/profit-share-math.mjs");
const { suggestPayoutAmounts } = require("../shared/fastwork-math.mjs");
const { findProjectCost } = require("./project-finance.service");
const fastworkService = require("./fastwork.service");

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");
const text = (hundredths) => formatHundredths(hundredths);
const recipientKey = (row, prefix) => (row[`${prefix}_user_id`] ? `user:${row[`${prefix}_user_id`]}` : `vendor:${row[`${prefix}_vendor_id`]}`);

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

// ─── กำไรที่แบ่งได้ ────────────────────────────────────────────────────────────────────────

/**
 * กำไรที่แบ่งได้ ณ ตอนนี้ พร้อมรายการที่มา (ทุกยอดเป็นสตางค์)
 * @returns {Promise<{ revenue: bigint, platformFee: bigint, expenseCost: bigint, distributable: bigint, revenueItems: object[], expenseItems: object[], pendingPayouts: number, pendingExpenseThb: bigint }>}
 */
async function profitOf(conn, projectId) {
    const revenueItems = [];
    const [receipts] = await conn.query(
        `SELECT r.rc_number, DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS item_date, i.inv_number,
                ROUND(a.rca_amount_thb * i.inv_after_discount_thb / NULLIF(i.inv_total_thb, 0), 2) AS amount_thb
         FROM tb_receipt_allocations a
         JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
         JOIN tb_invoices i ON i.inv_id = a.rca_invoice_id
         WHERE i.inv_project_id = ? AND r.rc_status = 'issued'
         ORDER BY r.rc_receipt_date, r.rc_number`,
        [projectId],
    );
    for (const row of receipts) {
        revenueItems.push({ date: row.item_date, label: `ใบเสร็จ ${row.rc_number} (ใบแจ้งหนี้ ${row.inv_number})`, amount: money(row.amount_thb) });
    }
    const [refunds] = await conn.query(
        `SELECT cn.cn_number, DATE_FORMAT(cn.cn_refund_date, '%Y-%m-%d') AS item_date,
                ROUND(cn.cn_base_thb * (cn.cn_refund_amount + cn.cn_refund_wht) / NULLIF(cn.cn_total, 0), 2) AS amount_thb
         FROM tb_credit_notes cn JOIN tb_invoices i ON i.inv_id = cn.cn_invoice_id
         WHERE i.inv_project_id = ? AND cn.cn_status = 'issued' AND cn.cn_refunded_at IS NOT NULL
         ORDER BY cn.cn_refund_date`,
        [projectId],
    );
    for (const row of refunds) {
        revenueItems.push({ date: row.item_date, label: `คืนเงินลูกค้าตามใบลดหนี้ ${row.cn_number}`, amount: -money(row.amount_thb) });
    }

    let platformFee = 0n;
    let pendingPayouts = 0;
    const fastwork = await fastworkService.projectFastwork(conn, projectId);
    for (const payout of fastwork?.payouts ?? []) {
        if (payout.fwp_status === "pending") pendingPayouts += 1;
        if (payout.fwp_status !== "received") continue;
        const label = payout.fwm_name ? `Fastwork งวด ${payout.fwm_order} ${payout.fwm_name}` : "Fastwork (เงินนอกงวด)";
        revenueItems.push({ date: payout.fwp_received_date, label, amount: money(payout.fwp_gross) });
        platformFee += money(payout.fwp_fee) + money(payout.fwp_fee_vat);
    }
    revenueItems.sort((first, second) => (first.date ?? "").localeCompare(second.date ?? ""));

    const cost = await findProjectCost(conn, projectId);
    const revenue = revenueItems.reduce((sum, item) => sum + item.amount, 0n);
    return {
        revenue,
        platformFee,
        expenseCost: cost.totalThb,
        distributable: revenue - platformFee - cost.totalThb,
        revenueItems,
        expenseItems: cost.expenses.map((expense) => ({
            date: expense.ex_expense_date,
            label: `${expense.ex_number} ${expense.ex_title}`,
            amount: money(expense.amount_thb),
        })),
        pendingPayouts,
        pendingExpenseThb: cost.pendingThb,
    };
}

const itemsText = (items) => items.map((item) => ({ ...item, amount: text(item.amount) }));

// ─── อ่าน ───────────────────────────────────────────────────────────────────────────────

/** ส่วนแบ่งที่ตั้งไว้ · ชื่อผู้รับดึงจากผู้ใช้/ผู้ขาย ณ ตอนอ่าน (ไม่เก็บซ้ำในตารางส่วนแบ่ง) */
async function findShares(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT s.shr_id, s.shr_user_id, s.shr_vendor_id, s.shr_kind, s.shr_percent, s.shr_amount, s.shr_note,
                IF(s.shr_vendor_id IS NULL, CONCAT(u.user_fname, ' ', u.user_lname), v.vd_name) AS recipient_name
         FROM tb_project_shares s
         LEFT JOIN tb_users u ON u.user_id = s.shr_user_id
         LEFT JOIN tb_vendors v ON v.vd_id = s.shr_vendor_id
         WHERE s.shr_project_id = ? ORDER BY s.shr_order, s.shr_id`,
        [projectId],
    );
    return rows;
}

async function findAdvances(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT a.sha_id, a.sha_user_id, a.sha_vendor_id, a.sha_recipient_name, a.sha_amount, a.sha_status, a.sha_reference,
                a.sha_note, a.sha_cancel_reason, DATE_FORMAT(a.sha_paid_date, '%Y-%m-%d') AS sha_paid_date,
                CONCAT(b.ba_bank_name, ' ', b.ba_account_no) AS bank_account_label
         FROM tb_share_advances a LEFT JOIN tb_bank_accounts b ON b.ba_id = a.sha_bank_account_id
         WHERE a.sha_project_id = ? ORDER BY a.sha_paid_date, a.sha_id`,
        [projectId],
    );
    return rows;
}

async function findActiveSettlement(conn, projectId, { forUpdate = false } = {}) {
    const [[settlement]] = await conn.query(
        `SELECT sst_id, sst_status, DATE_FORMAT(sst_settled_date, '%Y-%m-%d') AS sst_settled_date, sst_revenue, sst_platform_fee,
                sst_expense_cost, sst_distributable, sst_fixed_total, sst_after_fixed, sst_company_amount, sst_note, sst_version,
                DATE_FORMAT(sst_created_at, '%Y-%m-%d %H:%i') AS sst_created_at
         FROM tb_share_settlements WHERE sst_project_id = ? AND sst_status = 'settled' ${forUpdate ? "FOR UPDATE" : ""}`,
        [projectId],
    );
    if (!settlement) return null;
    const [lines] = await conn.query(
        `SELECT l.ssl_id, l.ssl_user_id, l.ssl_vendor_id, l.ssl_recipient_name, l.ssl_kind, l.ssl_percent, l.ssl_amount,
                l.ssl_advanced, l.ssl_due, l.ssl_status, l.ssl_wht, l.ssl_transfer_amount, l.ssl_reference, l.ssl_version,
                DATE_FORMAT(l.ssl_paid_date, '%Y-%m-%d') AS ssl_paid_date, CONCAT(b.ba_bank_name, ' ', b.ba_account_no) AS bank_account_label
         FROM tb_share_settlement_lines l LEFT JOIN tb_bank_accounts b ON b.ba_id = l.ssl_bank_account_id
         WHERE l.ssl_settlement_id = ? ORDER BY l.ssl_id`,
        [settlement.sst_id],
    );
    return { ...settlement, lines };
}

/** ส่วนแบ่ง + ตัวเลขประมาณการ ณ วันนี้ (ยังไม่ปิดยอด) */
function estimateOf(profit, shares, advances) {
    const split = splitProfit({
        distributable: profit.distributable,
        shares: shares.map((share) => ({ kind: share.shr_kind, percent: share.shr_percent, amount: share.shr_amount })),
    });
    const advancedBy = new Map();
    for (const advance of advances.filter((row) => row.sha_status === "paid")) {
        const key = recipientKey(advance, "sha");
        advancedBy.set(key, (advancedBy.get(key) ?? 0n) + money(advance.sha_amount));
    }
    return {
        split,
        lines: shares.map((share, index) => {
            const advanced = advancedBy.get(recipientKey(share, "shr")) ?? 0n;
            return { share, amount: split.amounts[index], advanced, due: split.amounts[index] - advanced };
        }),
    };
}

/**
 * ถ้าเงินเข้าครบ (คาดการณ์ 2026-10-31): ช่วยตั้งส่วนแบ่งตั้งแต่ยังไม่มีเงินเข้า · ไม่ใช้ตอนปิดยอด (ปิดยอดใช้เงินที่เข้าจริงเสมอ)
 * Fastwork: งวดที่เงินเข้าแล้วนับอยู่ในกำไรตอนนี้ · รอโอน = ยอดและค่าธรรมเนียมที่บันทึกไว้ · ยังไม่บันทึก = ราคางวดหักค่าธรรมเนียมตามอัตราที่ตั้งไว้
 * ลูกค้าตรง: ยอดก่อน VAT ของใบเสนอราคาที่ตอบรับแล้ว ส่วนที่ยังไม่ได้รับเงิน · ค่าใช้จ่าย = เท่าที่บันทึกไว้ (ในอนาคตไม่รู้)
 */
async function expectedOf(conn, projectId, profit, shares) {
    let remainingGross = 0n;
    let remainingFee = 0n;
    const fastwork = await fastworkService.projectFastwork(conn, projectId);
    if (fastwork) {
        const settings = await fastworkService.getSettings(conn);
        const payoutById = new Map(fastwork.payouts.map((payout) => [payout.fwp_id, payout]));
        for (const milestone of fastwork.milestones) {
            if (milestone.state === "received") continue;
            const pendingPayout = milestone.state === "pending" ? payoutById.get(milestone.payout_id) : null;
            if (pendingPayout) {
                remainingGross += money(pendingPayout.fwp_gross);
                remainingFee += money(pendingPayout.fwp_fee) + money(pendingPayout.fwp_fee_vat);
                continue;
            }
            const estimate = suggestPayoutAmounts({
                gross: milestone.fwm_amount,
                feeRate: settings.cs_fastwork_fee_rate,
                feeVatRate: settings.cs_fastwork_fee_vat_rate,
                whtRate: settings.cs_fastwork_wht_rate,
            });
            remainingGross += money(milestone.fwm_amount);
            remainingFee += money(estimate.fee) + money(estimate.fee_vat);
        }
    }
    const [[quoted]] = await conn.query(
        "SELECT COALESCE(SUM(qt_after_discount_thb), 0) AS amount FROM tb_quotations WHERE qt_project_id = ? AND qt_status = 'accepted'",
        [projectId],
    );
    const directReceived = profit.revenue - (fastwork?.received_gross_hundredths ?? 0n);
    const directRemaining = money(quoted.amount) > directReceived ? money(quoted.amount) - directReceived : 0n;
    remainingGross += directRemaining;

    const distributable = profit.distributable + remainingGross - remainingFee;
    const split = splitProfit({
        distributable,
        shares: shares.map((share) => ({ kind: share.shr_kind, percent: share.shr_percent, amount: share.shr_amount })),
    });
    return {
        remaining_revenue: text(remainingGross),
        revenue: text(profit.revenue + remainingGross),
        platform_fee: text(profit.platformFee + remainingFee),
        expense_cost: text(profit.expenseCost),
        distributable: text(distributable),
        fixed_total: text(split.fixedTotal),
        after_fixed: text(split.afterFixed),
        company_amount: text(split.companyAmount),
        lines: shares.map((share, index) => ({ shr_id: share.shr_id, amount: text(split.amounts[index]) })),
    };
}

/** หน้าจัดการส่วนแบ่งของโปรเจกต์ */
async function projectShares(conn, projectId) {
    const [[project]] = await conn.query(
        `SELECT p.project_id, p.project_name, p.project_status, p.project_channel, c.client_name
         FROM tb_projects p LEFT JOIN tb_clients c ON c.client_id = p.client_id WHERE p.project_id = ?`,
        [projectId],
    );
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "ไม่พบโปรเจกต์นี้ กรุณาโหลดหน้าใหม่");
    const profit = await profitOf(conn, projectId);
    const shares = await findShares(conn, projectId);
    const advances = await findAdvances(conn, projectId);
    const settlement = await findActiveSettlement(conn, projectId);
    const estimate = estimateOf(profit, shares, advances);
    // สมาชิกโปรเจกต์ = ตัวเลือกผู้รับที่เติมให้ (ไม่ต้องค้นชื่อเอง)
    const [members] = await conn.query(
        `SELECT u.user_id, CONCAT(u.user_fname, ' ', u.user_lname) AS full_name
         FROM tb_project_members m JOIN tb_users u ON u.user_id = m.user_id WHERE m.project_id = ? ORDER BY u.user_fname`,
        [projectId],
    );
    return {
        project,
        profit: {
            revenue: text(profit.revenue),
            platform_fee: text(profit.platformFee),
            expense_cost: text(profit.expenseCost),
            distributable: text(profit.distributable),
            revenue_items: itemsText(profit.revenueItems),
            expense_items: itemsText(profit.expenseItems),
            pending_payouts: profit.pendingPayouts,
            pending_expense: text(profit.pendingExpenseThb),
        },
        shares,
        estimate: {
            fixed_total: text(estimate.split.fixedTotal),
            after_fixed: text(estimate.split.afterFixed),
            company_amount: text(estimate.split.companyAmount),
            lines: estimate.lines.map((line) => ({
                shr_id: line.share.shr_id,
                amount: text(line.amount),
                advanced: text(line.advanced),
                due: text(line.due),
            })),
        },
        // ถ้าเงินเข้าครบ (คาดการณ์) · remaining_revenue = 0 คือเงินเข้าครบแล้ว
        expected: await expectedOf(conn, projectId, profit, shares),
        advances,
        settlement,
        // ปิดยอดแล้วแต่ตัวเลขตอนนี้ต่างจากตอนปิด (เช่น มีค่าใช้จ่ายมาทีหลัง) → เตือนให้ยกเลิกการปิดยอดแล้วปิดใหม่ (ถ้ายังไม่ได้จ่าย)
        changed_since_settlement: settlement ? money(settlement.sst_distributable) !== profit.distributable : false,
        members,
        today: todayBangkok(),
    };
}

// ─── ตั้งส่วนแบ่ง / เบิกล่วงหน้า ───────────────────────────────────────────────────────────────

async function lockProject(conn, projectId) {
    const [[project]] = await conn.query("SELECT project_id FROM tb_projects WHERE project_id = ? FOR UPDATE", [projectId]);
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "ไม่พบโปรเจกต์นี้ กรุณาโหลดหน้าใหม่");
}

async function assertNotSettled(conn, projectId) {
    if (await findActiveSettlement(conn, projectId)) {
        throw new AppError(409, "SHARES_SETTLED", "โปรเจกต์นี้ปิดยอดส่วนแบ่งแล้ว · ยกเลิกการปิดยอดก่อน (ทำได้เมื่อยังไม่ได้จ่ายใคร)");
    }
}

/** ผู้รับยังใช้งานอยู่ไหม (ผู้ใช้หรือผู้ขายที่ยังไม่ปิดใช้งาน) */
async function isActiveRecipient(conn, type, id) {
    if (type === "user") {
        const [[user]] = await conn.query(
            "SELECT user_id FROM tb_users WHERE user_id = ? AND user_status = 'active'",
            [id],
        );
        return Boolean(user);
    }
    const [[vendor]] = await conn.query("SELECT vd_id FROM tb_vendors WHERE vd_id = ? AND vd_status = 'active'", [id]);
    return Boolean(vendor);
}

/** ตั้งส่วนแบ่งทั้งชุด — คนที่เบิกล่วงหน้าไปแล้วเอาออกไม่ได้ */
async function saveShares(conn, user, projectId, input) {
    await lockProject(conn, projectId);
    await assertNotSettled(conn, projectId);
    const advances = (await findAdvances(conn, projectId)).filter((row) => row.sha_status === "paid");
    const keptKeys = new Set(input.shares.map((share) => `${share.recipient_type}:${share.recipient_id}`));
    for (const advance of advances) {
        if (!keptKeys.has(recipientKey(advance, "sha"))) {
            throw validationError({ shares: `เอา ${advance.sha_recipient_name} ออกไม่ได้ เพราะเบิกล่วงหน้าไปแล้ว (ยกเลิกการเบิกก่อน)` });
        }
    }
    const rows = [];
    for (const [index, share] of input.shares.entries()) {
        const isActive = await isActiveRecipient(conn, share.recipient_type, share.recipient_id);
        if (!isActive) throw validationError({ [`shares.${index}.recipient_id`]: "ไม่พบผู้รับนี้ หรือปิดใช้งานแล้ว" });
        rows.push([
            projectId,
            share.recipient_type === "user" ? share.recipient_id : null,
            share.recipient_type === "vendor" ? share.recipient_id : null,
            share.kind,
            share.percent,
            share.amount,
            share.note,
            index + 1,
            user.user_id,
        ]);
    }
    await conn.query("DELETE FROM tb_project_shares WHERE shr_project_id = ?", [projectId]);
    if (rows.length > 0) {
        await conn.query(
            `INSERT INTO tb_project_shares
                (shr_project_id, shr_user_id, shr_vendor_id, shr_kind, shr_percent, shr_amount, shr_note, shr_order, shr_created_by)
             VALUES ?`,
            [rows],
        );
    }
    return { project_id: projectId, share_count: rows.length };
}

async function assertBankAccount(conn, bankAccountId, field) {
    const [[account]] = await conn.query("SELECT ba_id FROM tb_bank_accounts WHERE ba_id = ? AND ba_status = 'active'", [bankAccountId]);
    if (!account) throw validationError({ [field]: "ไม่พบบัญชีนี้ หรือบัญชีปิดใช้งานแล้ว" });
}

function assertNotFuture(dateText, field, label) {
    if (dateText > todayBangkok()) throw validationError({ [field]: `${label}ต้องไม่เกินวันนี้` });
}

/** เบิกล่วงหน้า (จ่ายแล้ว) — ผู้รับต้องอยู่ในรายชื่อส่วนแบ่ง */
async function createAdvance(conn, user, projectId, input) {
    await lockProject(conn, projectId);
    await assertNotSettled(conn, projectId);
    const shares = await findShares(conn, projectId);
    const share = shares.find((row) => recipientKey(row, "shr") === `${input.recipient_type}:${input.recipient_id}`);
    if (!share) throw validationError({ recipient_id: "ผู้รับต้องอยู่ในรายชื่อส่วนแบ่งของโปรเจกต์นี้ก่อน" });
    assertNotFuture(input.paid_date, "paid_date", "วันที่จ่าย");
    await assertBankAccount(conn, input.bank_account_id, "bank_account_id");
    const [result] = await conn.query(
        `INSERT INTO tb_share_advances
            (sha_project_id, sha_user_id, sha_vendor_id, sha_recipient_name, sha_amount, sha_paid_date, sha_bank_account_id,
             sha_reference, sha_note, sha_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectId,
            share.shr_user_id,
            share.shr_vendor_id,
            share.recipient_name,
            input.amount,
            input.paid_date,
            input.bank_account_id,
            input.reference,
            input.note,
            user.user_id,
        ],
    );
    return { sha_id: result.insertId };
}

async function cancelAdvance(conn, user, advanceId, { reason }) {
    const [[advance]] = await conn.query("SELECT sha_id, sha_project_id, sha_status FROM tb_share_advances WHERE sha_id = ? FOR UPDATE", [
        advanceId,
    ]);
    if (!advance) throw new AppError(404, "ADVANCE_NOT_FOUND", "ไม่พบรายการเบิกนี้ กรุณาโหลดหน้าใหม่");
    if (advance.sha_status !== "paid") throw new AppError(409, "ADVANCE_CANCELLED", "รายการนี้ยกเลิกไปแล้ว");
    await assertNotSettled(conn, advance.sha_project_id);
    await conn.query(
        "UPDATE tb_share_advances SET sha_status = 'cancelled', sha_cancel_reason = ?, sha_cancelled_at = ?, sha_cancelled_by = ? WHERE sha_id = ?",
        [reason, nowBangkokText(), user.user_id, advanceId],
    );
    return { sha_id: advanceId };
}

// ─── ปิดยอด / จ่าย ────────────────────────────────────────────────────────────────────────

/** ปิดยอด: คิดกำไรและส่วนแบ่ง ณ ตอนนี้แล้วล็อก · ตัวเลขต้องตรงกับที่ผู้ใช้เห็น */
async function settle(conn, user, projectId, input) {
    await lockProject(conn, projectId);
    await assertNotSettled(conn, projectId);
    assertNotFuture(input.settled_date, "settled_date", "วันที่ปิดยอด");
    const shares = await findShares(conn, projectId);
    if (shares.length === 0) throw new AppError(409, "NO_SHARES", "ยังไม่ได้ตั้งส่วนแบ่งของโปรเจกต์นี้ · ตั้งส่วนแบ่งก่อนปิดยอด");
    const profit = await profitOf(conn, projectId);
    if (profit.pendingPayouts > 0) {
        throw new AppError(409, "PAYOUTS_PENDING", `ยังมีเงิน Fastwork รอโอน ${profit.pendingPayouts} รายการ · ยืนยันเงินเข้า (หรือยกเลิก) ก่อนปิดยอด`);
    }
    if (money(input.expected_distributable) !== profit.distributable) {
        throw new AppError(409, "PROFIT_CHANGED", "กำไรที่แบ่งได้เปลี่ยนไประหว่างที่ดูอยู่ (มีเงินเข้า/ค่าใช้จ่ายใหม่) กรุณาโหลดหน้าใหม่แล้วตรวจอีกครั้ง");
    }
    const advances = await findAdvances(conn, projectId);
    const estimate = estimateOf(profit, shares, advances);
    const [result] = await conn.query(
        `INSERT INTO tb_share_settlements
            (sst_project_id, sst_settled_date, sst_revenue, sst_platform_fee, sst_expense_cost, sst_distributable, sst_fixed_total,
             sst_after_fixed, sst_company_amount, sst_note, sst_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectId,
            input.settled_date,
            text(profit.revenue),
            text(profit.platformFee),
            text(profit.expenseCost),
            text(profit.distributable),
            text(estimate.split.fixedTotal),
            text(estimate.split.afterFixed),
            text(estimate.split.companyAmount),
            input.note,
            user.user_id,
        ],
    );
    for (const line of estimate.lines) {
        const isSettledAlready = line.due === 0n;
        await conn.query(
            `INSERT INTO tb_share_settlement_lines
                (ssl_settlement_id, ssl_user_id, ssl_vendor_id, ssl_recipient_name, ssl_kind, ssl_percent, ssl_amount, ssl_advanced, ssl_due,
                 ssl_status, ssl_transfer_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                result.insertId,
                line.share.shr_user_id,
                line.share.shr_vendor_id,
                line.share.recipient_name,
                line.share.shr_kind,
                line.share.shr_percent,
                text(line.amount),
                text(line.advanced),
                text(line.due),
                isSettledAlready ? "paid" : "unpaid",
                isSettledAlready ? "0.00" : null,
            ],
        );
    }
    return { sst_id: result.insertId };
}

/** ยกเลิกการปิดยอด — ได้เฉพาะเมื่อยังไม่ได้จ่าย/รับคืนจากใคร */
async function cancelSettlement(conn, user, settlementId, input) {
    const [[settlement]] = await conn.query(
        "SELECT sst_id, sst_project_id, sst_status, sst_version FROM tb_share_settlements WHERE sst_id = ? FOR UPDATE",
        [settlementId],
    );
    if (!settlement) throw new AppError(404, "SETTLEMENT_NOT_FOUND", "ไม่พบการปิดยอดนี้ กรุณาโหลดหน้าใหม่");
    if (settlement.sst_version !== input.sst_version) {
        throw new AppError(409, "SETTLEMENT_CHANGED", "การปิดยอดนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (settlement.sst_status !== "settled") throw new AppError(409, "SETTLEMENT_CANCELLED", "การปิดยอดนี้ยกเลิกไปแล้ว");
    const [[{ paidCount }]] = await conn.query(
        "SELECT COUNT(*) AS paidCount FROM tb_share_settlement_lines WHERE ssl_settlement_id = ? AND ssl_status = 'paid' AND ssl_due <> 0",
        [settlementId],
    );
    if (Number(paidCount) > 0) {
        throw new AppError(409, "SETTLEMENT_HAS_PAYMENTS", `ยกเลิกการปิดยอดไม่ได้ เพราะจ่าย/รับคืนไปแล้ว ${paidCount} คน`);
    }
    await conn.query(
        `UPDATE tb_share_settlements SET sst_status = 'cancelled', sst_cancel_reason = ?, sst_cancelled_at = ?, sst_cancelled_by = ?,
                sst_version = sst_version + 1 WHERE sst_id = ?`,
        [input.reason, nowBangkokText(), user.user_id, settlementId],
    );
    return { sst_id: settlementId, project_id: settlement.sst_project_id };
}

/** บันทึกจ่ายส่วนแบ่ง (ต้องจ่ายบวก) หรือรับเงินคืน (ต้องจ่ายติดลบ — หัก ณ ที่จ่ายไม่ได้) */
async function payLine(conn, user, lineId, input) {
    const [[line]] = await conn.query(
        `SELECT l.ssl_id, l.ssl_due, l.ssl_status, l.ssl_version, s.sst_status, DATE_FORMAT(s.sst_settled_date, '%Y-%m-%d') AS settled_date
         FROM tb_share_settlement_lines l JOIN tb_share_settlements s ON s.sst_id = l.ssl_settlement_id
         WHERE l.ssl_id = ? FOR UPDATE`,
        [lineId],
    );
    if (!line) throw new AppError(404, "SHARE_LINE_NOT_FOUND", "ไม่พบส่วนแบ่งนี้ กรุณาโหลดหน้าใหม่");
    if (line.ssl_version !== input.ssl_version) throw new AppError(409, "SHARE_LINE_CHANGED", "รายการนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
    if (line.sst_status !== "settled") throw new AppError(409, "SETTLEMENT_CANCELLED", "การปิดยอดนี้ถูกยกเลิกแล้ว กรุณาโหลดหน้าใหม่");
    if (line.ssl_status === "paid") throw new AppError(409, "SHARE_LINE_PAID", "รายการนี้บันทึกจ่ายไปแล้ว");
    assertNotFuture(input.paid_date, "paid_date", "วันที่โอน");
    if (input.paid_date < line.settled_date) throw validationError({ paid_date: "วันที่โอนต้องไม่ก่อนวันปิดยอด" });
    await assertBankAccount(conn, input.bank_account_id, "bank_account_id");
    const due = money(line.ssl_due);
    const wht = money(input.wht);
    if (due < 0n && wht > 0n) throw validationError({ wht: "รับเงินคืนไม่มีหัก ณ ที่จ่าย" });
    if (wht > due && due > 0n) throw validationError({ wht: "หัก ณ ที่จ่ายเกินยอดที่ต้องจ่าย" });
    await conn.query(
        `UPDATE tb_share_settlement_lines
         SET ssl_status = 'paid', ssl_wht = ?, ssl_transfer_amount = ?, ssl_paid_date = ?, ssl_bank_account_id = ?, ssl_reference = ?,
             ssl_paid_by = ?, ssl_paid_at = ?, ssl_version = ssl_version + 1
         WHERE ssl_id = ?`,
        [text(wht), text(due - wht), input.paid_date, input.bank_account_id, input.reference, user.user_id, nowBangkokText(), lineId],
    );
    return { ssl_id: lineId };
}

// ─── รายการโปรเจกต์ / ของฉัน ─────────────────────────────────────────────────────────────────

/**
 * โปรเจกต์ที่เกี่ยวกับส่วนแบ่ง (งาน Fastwork ทุกงาน + โปรเจกต์ที่ตั้งส่วนแบ่ง/ปิดยอดแล้ว)
 * สถานะ: unset ยังไม่ตั้ง · open ตั้งแล้วยังไม่ปิดยอด · unpaid ปิดยอดแล้วค้างจ่าย · paid จ่ายครบ
 */
async function listProjects(conn) {
    const [rows] = await conn.query(
        `SELECT p.project_id, p.project_name, p.project_status, p.project_channel, c.client_name,
                (SELECT COUNT(*) FROM tb_project_shares s WHERE s.shr_project_id = p.project_id) AS share_count,
                st.sst_id, DATE_FORMAT(st.sst_settled_date, '%Y-%m-%d') AS sst_settled_date, st.sst_distributable, st.sst_company_amount,
                (SELECT COUNT(*) FROM tb_share_settlement_lines l WHERE l.ssl_settlement_id = st.sst_id AND l.ssl_status = 'unpaid') AS unpaid_count,
                (SELECT COUNT(*) FROM tb_fastwork_milestones m WHERE m.fwm_project_id = p.project_id) AS milestone_count,
                (SELECT COUNT(*) FROM tb_fastwork_payouts f WHERE f.fwp_project_id = p.project_id AND f.fwp_status = 'received') AS received_count,
                (SELECT COUNT(*) FROM tb_fastwork_payouts f WHERE f.fwp_project_id = p.project_id AND f.fwp_status = 'pending') AS pending_count
         FROM tb_projects p
         LEFT JOIN tb_clients c ON c.client_id = p.client_id
         LEFT JOIN tb_share_settlements st ON st.sst_project_id = p.project_id AND st.sst_status = 'settled'
         WHERE p.project_channel = 'fastwork'
            OR EXISTS (SELECT 1 FROM tb_project_shares s WHERE s.shr_project_id = p.project_id)
            OR EXISTS (SELECT 1 FROM tb_share_settlements x WHERE x.sst_project_id = p.project_id)
         ORDER BY p.project_created_at DESC`,
    );
    return rows.map((row) => {
        let state = "unset";
        if (row.sst_id) state = Number(row.unpaid_count) > 0 ? "unpaid" : "paid";
        else if (Number(row.share_count) > 0) state = "open";
        const milestoneCount = Number(row.milestone_count);
        return {
            project_id: row.project_id,
            project_name: row.project_name,
            project_status: row.project_status,
            project_channel: row.project_channel,
            client_name: row.client_name,
            share_count: Number(row.share_count),
            state,
            settled_date: row.sst_settled_date,
            distributable: row.sst_distributable,
            company_amount: row.sst_company_amount,
            unpaid_count: Number(row.unpaid_count),
            // พร้อมปิดยอด: งาน Fastwork ที่เงินเข้าครบทุกงวดและไม่มีรอโอน
            is_ready_to_settle:
                !row.sst_id && milestoneCount > 0 && Number(row.received_count) >= milestoneCount && Number(row.pending_count) === 0,
        };
    });
}

/**
 * ส่วนแบ่งของฉันทุกโปรเจกต์ — ที่มาของตัวเลขครบ แต่ไม่เปิดเผยยอดของคนอื่น (ส่วนตายตัวแสดงเป็นยอดรวม)
 * ยังไม่ปิดยอด = ประมาณการ ณ วันนี้ · ปิดยอดแล้ว = ตัวเลข ณ วันปิดยอด
 */
async function mine(conn, user) {
    const [shareRows] = await conn.query("SELECT DISTINCT shr_project_id AS project_id FROM tb_project_shares WHERE shr_user_id = ?", [user.user_id]);
    const [lineRows] = await conn.query(
        `SELECT DISTINCT s.sst_project_id AS project_id FROM tb_share_settlement_lines l
         JOIN tb_share_settlements s ON s.sst_id = l.ssl_settlement_id
         WHERE l.ssl_user_id = ? AND s.sst_status = 'settled'`,
        [user.user_id],
    );
    const projectIds = [...new Set([...shareRows, ...lineRows].map((row) => row.project_id))];
    const results = [];
    for (const projectId of projectIds) {
        const data = await projectShares(conn, projectId);
        const myAdvances = data.advances.filter((row) => row.sha_user_id === user.user_id && row.sha_status === "paid");
        if (data.settlement) {
            const line = data.settlement.lines.find((row) => row.ssl_user_id === user.user_id);
            if (!line) continue;
            results.push({
                project: data.project,
                state: line.ssl_status === "paid" ? "paid" : "settled",
                numbers: {
                    revenue: data.settlement.sst_revenue,
                    platform_fee: data.settlement.sst_platform_fee,
                    expense_cost: data.settlement.sst_expense_cost,
                    distributable: data.settlement.sst_distributable,
                    fixed_total: data.settlement.sst_fixed_total,
                    after_fixed: data.settlement.sst_after_fixed,
                },
                settled_date: data.settlement.sst_settled_date,
                mine: {
                    kind: line.ssl_kind,
                    percent: line.ssl_percent,
                    amount: line.ssl_amount,
                    advanced: line.ssl_advanced,
                    due: line.ssl_due,
                    wht: line.ssl_wht,
                    transfer_amount: line.ssl_transfer_amount,
                    paid_date: line.ssl_paid_date,
                    reference: line.ssl_reference,
                },
                // รายการที่มา (ปัจจุบัน) — ตัวเลขข้างบนเป็นของวันปิดยอด
                revenue_items: data.profit.revenue_items,
                expense_items: data.profit.expense_items,
                advances: myAdvances,
            });
            continue;
        }
        const index = data.shares.findIndex((share) => share.shr_user_id === user.user_id);
        if (index < 0) continue;
        const share = data.shares[index];
        const line = data.estimate.lines[index];
        results.push({
            project: data.project,
            state: "estimate",
            numbers: {
                revenue: data.profit.revenue,
                platform_fee: data.profit.platform_fee,
                expense_cost: data.profit.expense_cost,
                distributable: data.profit.distributable,
                fixed_total: data.estimate.fixed_total,
                after_fixed: data.estimate.after_fixed,
            },
            settled_date: null,
            mine: {
                kind: share.shr_kind,
                percent: share.shr_percent,
                amount: line.amount,
                advanced: line.advanced,
                due: line.due,
                wht: null,
                transfer_amount: null,
                paid_date: null,
                reference: null,
            },
            revenue_items: data.profit.revenue_items,
            expense_items: data.profit.expense_items,
            pending_payouts: data.profit.pending_payouts,
            advances: myAdvances,
        });
    }
    return { data: results, today: todayBangkok() };
}

module.exports = {
    profitOf,
    projectShares,
    saveShares,
    createAdvance,
    cancelAdvance,
    settle,
    cancelSettlement,
    payLine,
    listProjects,
    mine,
    findActiveSettlement,
};
