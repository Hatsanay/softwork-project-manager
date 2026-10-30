// ทำจ่าย / ใบสำคัญจ่าย (PV) + หนังสือรับรองหัก ณ ที่จ่าย (50 ทวิ) (2026-10-16 เฟส 2 ขั้น 2-4)
// แบบระบบ: docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.5, 3.6, 4.2 · สูตร: shared/payment-totals.mjs
//
// - บันทึก = ออกเลข PV ทันที (ไม่มีร่าง) · มีหัก ณ ที่จ่าย = ออก 50 ทวิ เลขถัดไปของปีในคราวเดียวกัน
// - **ล็อกรายการที่จ่ายทุกใบในคำสั่งเดียว (เรียงตาม id) ก่อน SELECT ธรรมดาคำสั่งแรกของ transaction** — MySQL (REPEATABLE READ)
//   ถ่ายภาพข้อมูลตอนอ่านธรรมดาครั้งแรก · สองคนจ่ายรายการเดียวกันพร้อมกัน คนที่สองรอแล้วเห็นยอดค้างใหม่ ไม่จ่ายเกิน (R-P1)
// - ลำดับล็อกตอนยกเลิก: ใบสำคัญจ่าย → รายการ (ตอนสร้างล็อกแค่รายการ) — ไม่ล็อกไขว้กัน
// - หัก ณ ที่จ่ายเฉพาะผู้ขายในไทย (บุคคล = ภ.ง.ด.3 · นิติบุคคล = ภ.ง.ด.53) · ใบเบิกพนักงาน/ผู้ขายต่างประเทศไม่หัก
// - อัตราหัก ณ ที่จ่าย = อัตรา ณ วันที่จ่าย (R-P4) เก็บไว้ในแถวของ 50 ทวิ · ข้อมูลผู้รับ/บัญชี snapshot ณ วันจ่าย (R-P6)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber, issueYearlyNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { calculatePayment } = require("../shared/payment-totals.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const { MAX_PAYMENT_BACKDATE_DAYS } = require("../shared/schemas/payment.mjs");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const purchasingSetupService = require("./purchasing-setup.service");
const { whtFormOf } = require("./vendor.service");
const { shiftDate } = require("./exchange-rate.service");

const MAX_LIST_LIMIT = 200;
const EXPENSE_DATE_COLUMNS = `DATE_FORMAT(e.ex_expense_date, '%Y-%m-%d') AS ex_expense_date,
    DATE_FORMAT(e.ex_due_date, '%Y-%m-%d') AS ex_due_date`;

function notFound() {
    return new AppError(404, "PAYMENT_NOT_FOUND", "ไม่พบใบสำคัญจ่ายนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function validationError(fields, message = "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

function outstandingOf(expense) {
    return parseHundredths(expense.ex_total, "ยอดรวม") - parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว");
}

async function insertRow(conn, table, values) {
    const columns = Object.keys(values);
    await conn.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, [
        ...Object.values(values),
    ]);
}

// ─── ล็อกและตรวจรายการที่จ่าย ───────────────────────────────────────────────────────────────────

/** ล็อกทุกรายการในคำสั่งเดียว (เรียงตาม id) — ต้องเป็นคำสั่งอ่านแรกของ transaction (ดูหัวไฟล์) */
async function lockExpenses(conn, expenseIds) {
    const [rows] = await conn.query(
        `SELECT e.ex_id, e.ex_number, e.ex_kind, e.ex_status, e.ex_vendor_id, e.ex_employee_id, e.ex_currency,
                e.ex_subtotal, e.ex_total, e.ex_total_thb, e.ex_paid_amount, e.ex_wht_income_type, ${EXPENSE_DATE_COLUMNS}
         FROM tb_expenses e WHERE e.ex_id IN (?) ORDER BY e.ex_id FOR UPDATE`,
        [expenseIds],
    );
    return new Map(rows.map((row) => [row.ex_id, row]));
}

/** รายการที่จ่ายต้อง: มีอยู่ · อนุมัติแล้ว · ยังค้าง · ของผู้รับรายนี้ · สกุลเดียวกันทุกรายการ */
function assertPayable(expenseIds, expensesById, input) {
    if (expenseIds.some((id) => !expensesById.has(id))) {
        throw validationError({ allocations: "ไม่พบรายการบางรายการ อาจถูกลบไปแล้ว · โหลดหน้าใหม่แล้วเลือกอีกครั้ง" });
    }
    const expenses = expenseIds.map((id) => expensesById.get(id));
    const currencyCode = expenses[0].ex_currency;
    const problems = [];
    for (const expense of expenses) {
        const label = expense.ex_number ?? "รายการที่ยังไม่อนุมัติ";
        const isSamePayee =
            input.pv_payee_kind === "vendor"
                ? expense.ex_kind === "bill" && expense.ex_vendor_id === input.pv_vendor_id
                : expense.ex_kind === "claim" && expense.ex_employee_id === input.pv_employee_id;
        if (expense.ex_status === "cancelled") problems.push(`${label} ถูกยกเลิกแล้ว`);
        else if (expense.ex_status !== "approved") problems.push(`${label} ยังไม่ผ่านการอนุมัติ`);
        else if (outstandingOf(expense) <= 0n) problems.push(`${label} จ่ายครบแล้ว`);
        else if (!isSamePayee) problems.push(`${label} เป็นของผู้รับรายอื่น`);
        else if (expense.ex_currency !== currencyCode)
            problems.push(`${label} เป็นสกุล ${expense.ex_currency} (รายการอื่นเป็น ${currencyCode})`);
    }
    if (problems.length > 0) {
        throw new AppError(
            409,
            "PAYMENT_EXPENSE_UNAVAILABLE",
            `${problems.join(" · ")} · ใบสำคัญจ่ายหนึ่งใบจ่ายได้เฉพาะรายการที่อนุมัติแล้ว ยังค้างจ่าย ของผู้รับรายเดียว สกุลเงินเดียว`,
            { allocations: problems.join("\n") },
        );
    }
    return expenses;
}

/** ฐานก่อน VAT / ยอดบาท ที่จ่ายไปแล้วของแต่ละรายการ (ใบสำคัญจ่ายที่ไม่ยกเลิก) — ให้ครั้งที่ปิดรายการรับเศษพอดี */
async function findPriorShares(conn, expenseIds) {
    const [rows] = await conn.query(
        `SELECT a.pva_expense_id, SUM(a.pva_base_amount) AS base, SUM(a.pva_amount_thb) AS thb
         FROM tb_payment_allocations a JOIN tb_payments p ON p.pv_id = a.pva_payment_id
         WHERE p.pv_status = 'issued' AND a.pva_expense_id IN (?)
         GROUP BY a.pva_expense_id`,
        [expenseIds],
    );
    return new Map(
        rows.map((row) => [
            row.pva_expense_id,
            { base: parseHundredths(row.base, "ฐานที่จ่ายแล้ว"), thb: parseHundredths(row.thb, "ยอดบาทที่จ่ายแล้ว") },
        ]),
    );
}

/**
 * ผู้รับเงิน — ผู้ขาย (ตามทะเบียน) หรือพนักงาน · คืนข้อมูลสำหรับ snapshot และแบบ ภ.ง.ด. (null = ไม่หัก ณ ที่จ่าย)
 */
async function findPayee(conn, input, fields) {
    if (input.pv_payee_kind === "vendor") {
        const [[vendor]] = await conn.query(
            `SELECT vd_id, vd_code, vd_type, vd_country, vd_name, vd_tax_id, vd_branch_code, vd_address, vd_bank_name,
                    vd_bank_account_no, vd_bank_account_name, vd_promptpay_id
             FROM tb_vendors WHERE vd_id = ?`,
            [input.pv_vendor_id],
        );
        if (!vendor) {
            fields.pv_vendor_id = "ไม่พบผู้ขายนี้";
            return null;
        }
        return { snapshot: { kind: "vendor", ...vendor }, whtForm: whtFormOf(vendor) };
    }
    const [[employee]] = await conn.query(
        "SELECT user_id, CONCAT(user_fname, ' ', user_lname) AS full_name, user_email FROM tb_users WHERE user_id = ?",
        [input.pv_employee_id],
    );
    if (!employee) {
        fields.pv_employee_id = "ไม่พบพนักงานนี้";
        return null;
    }
    return { snapshot: { kind: "employee", ...employee }, whtForm: null };
}

/** สาขา · บัญชีที่จ่ายออก · วันที่จ่าย (ไม่ใช่อนาคต · ย้อนได้ไม่เกิน 30 วัน — เทียบเวลาไทย) */
async function checkHeader(conn, input, currencyCode) {
    const fields = {};
    const today = todayBangkok();
    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        input.pv_branch_id,
    ]);
    if (!branch) fields.pv_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active") fields.pv_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    if (input.pv_bank_account_id) {
        const [[account]] = await conn.query("SELECT ba_status, ba_currency FROM tb_bank_accounts WHERE ba_id = ?", [
            input.pv_bank_account_id,
        ]);
        if (!account) fields.pv_bank_account_id = "ไม่พบบัญชีนี้";
        else if (account.ba_status !== "active") fields.pv_bank_account_id = "บัญชีนี้ถูกปิดใช้งานแล้ว";
        else if (account.ba_currency !== currencyCode && account.ba_currency !== BASE_CURRENCY)
            fields.pv_bank_account_id = `บัญชีนี้เป็นสกุล ${account.ba_currency} · จ่าย ${currencyCode} ได้จากบัญชี ${currencyCode} หรือบัญชีบาท`;
    }

    if (input.pv_payment_date > today) fields.pv_payment_date = "วันที่จ่ายต้องไม่เป็นวันในอนาคต";
    else if (input.pv_payment_date < shiftDate(today, -MAX_PAYMENT_BACKDATE_DAYS))
        fields.pv_payment_date = `ย้อนหลังได้ไม่เกิน ${MAX_PAYMENT_BACKDATE_DAYS} วัน`;
    return fields;
}

/** อัตราหัก ณ ที่จ่าย ณ วันที่จ่าย ของประเภทเงินได้ที่เกี่ยวข้อง */
async function findRates(conn, incomeTypes, paymentDate) {
    const rates = new Map();
    for (const type of incomeTypes) {
        const rate = await purchasingSetupService.whtRateOn(conn, type, paymentDate);
        if (rate) rates.set(type, rate);
    }
    return rates;
}

async function buildSnapshots(conn, input) {
    const company = await companyService.findCompany(conn);
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone
         FROM tb_branches WHERE branch_id = ?`,
        [input.pv_branch_id],
    );
    const [[bankAccount]] = input.pv_bank_account_id
        ? await conn.query(
              `SELECT ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_currency
               FROM tb_bank_accounts WHERE ba_id = ?`,
              [input.pv_bank_account_id],
          )
        : [[null]];
    return { company: { ...companySnapshot, branch }, bankAccount: bankAccount ?? null };
}

// ─── ทำจ่าย (= ออกใบสำคัญจ่าย + 50 ทวิ) ──────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} input ผ่าน paymentCreateSchema แล้ว
 * @param {{ user_id: string }} actor
 * @returns {Promise<{ pv_id: string, pv_number: string, wt_id: string | null, wt_number: string | null }>}
 */
async function createPayment(conn, input, actor) {
    const expenseIds = input.allocations.map((row) => row.pva_expense_id);
    const expensesById = await lockExpenses(conn, expenseIds);
    const expenses = assertPayable(expenseIds, expensesById, input);
    const currencyCode = expenses[0].ex_currency;
    const currency = await quotationService.findCurrency(conn, currencyCode);
    const isForeign = currencyCode !== BASE_CURRENCY;

    const fields = await checkHeader(conn, input, currencyCode);
    const payee = await findPayee(conn, input, fields);
    // หัก ณ ที่จ่ายเฉพาะผู้ขายในไทย — ใบเบิก/ผู้ขายต่างประเทศ ไม่มีประเภทเงินได้ในการจ่ายครั้งนี้
    const canWithhold = Boolean(payee?.whtForm);
    const incomeTypeOf = (expense) => (canWithhold ? expense.ex_wht_income_type : null);
    const incomeTypes = [...new Set(expenses.map(incomeTypeOf).filter(Boolean))];
    const rates = await findRates(conn, incomeTypes, input.pv_payment_date);
    const prior = await findPriorShares(conn, expenseIds);

    const calculation = calculatePayment({
        allocations: input.allocations.map((row) => {
            const expense = expensesById.get(row.pva_expense_id);
            const shares = prior.get(expense.ex_id) ?? { base: 0n, thb: 0n };
            return {
                expenseId: expense.ex_id,
                amount: parseHundredths(row.pva_amount, "ยอดจ่าย"),
                expenseTotal: parseHundredths(expense.ex_total, "ยอดรวม"),
                expenseSubtotal: parseHundredths(expense.ex_subtotal, "ยอดก่อน VAT"),
                expenseTotalThb: parseHundredths(expense.ex_total_thb, "ยอดบาท"),
                paidBefore: parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว"),
                baseBefore: shares.base,
                thbBefore: shares.thb,
                incomeType: incomeTypeOf(expense),
            };
        }),
        rates,
        withholdings: input.withholdings.map((row) => ({
            income_type: row.income_type,
            amount: parseHundredths(row.amount, "ยอดหัก"),
        })),
        fee: parseHundredths(input.pv_fee_amount, "ค่าธรรมเนียม"),
        isForeign,
        paidThb: input.pv_paid_thb === null ? null : parseHundredths(input.pv_paid_thb, "ยอดบาท"),
        currencyDecimals: currency.cur_decimals,
    });
    Object.assign(fields, calculation.errors);
    if (calculation.netPaid < 0n) fields.allocations = "ยอดหัก ณ ที่จ่ายรวมมากกว่ายอดจ่าย";
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const [[creator]] = await conn.query(
        "SELECT CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?",
        [actor.user_id],
    );
    const snapshots = await buildSnapshots(conn, input);
    const documentNumber = await issueDocumentNumber(conn, "PV", input.pv_payment_date);
    const paymentId = await generateDailyId("tb_payments", "pv_id", "PAY");

    await insertRow(conn, "tb_payments", {
        pv_id: paymentId,
        pv_number: documentNumber,
        pv_status: "issued",
        pv_version: 0,
        pv_payee_kind: input.pv_payee_kind,
        pv_vendor_id: input.pv_payee_kind === "vendor" ? input.pv_vendor_id : null,
        pv_employee_id: input.pv_payee_kind === "employee" ? input.pv_employee_id : null,
        pv_branch_id: input.pv_branch_id,
        pv_currency: currencyCode,
        pv_payment_date: input.pv_payment_date,
        pv_method: input.pv_method,
        pv_bank_account_id: input.pv_bank_account_id,
        pv_reference: input.pv_reference,
        pv_cheque_no: input.pv_method === "cheque" ? input.pv_cheque_no : null,
        pv_cheque_date: input.pv_method === "cheque" ? input.pv_cheque_date : null,
        pv_allocated_total: toDecimalText(calculation.allocatedTotal),
        pv_wht_amount: toDecimalText(calculation.withholdingTotal),
        pv_net_paid: toDecimalText(calculation.netPaid),
        pv_fee_amount: input.pv_fee_amount,
        pv_allocated_thb: toDecimalText(calculation.allocatedThb),
        pv_paid_thb: toDecimalText(calculation.paidThb),
        pv_actual_rate: calculation.actualRate,
        pv_fx_diff_thb: toDecimalText(calculation.fxDiffThb),
        pv_notes: input.pv_notes,
        pv_payee_snapshot: JSON.stringify(payee.snapshot),
        pv_company_snapshot: JSON.stringify(snapshots.company),
        pv_bank_snapshot: snapshots.bankAccount ? JSON.stringify(snapshots.bankAccount) : null,
        pv_created_by: actor.user_id,
        pv_created_by_name: creator?.full_name ?? null,
    });
    for (const [index, line] of calculation.lines.entries()) {
        await insertRow(conn, "tb_payment_allocations", {
            pva_payment_id: paymentId,
            pva_expense_id: line.expenseId,
            pva_order: index + 1,
            pva_amount: toDecimalText(line.amount),
            pva_base_amount: toDecimalText(line.base),
            pva_amount_thb: toDecimalText(line.amountThb),
            pva_wht_income_type: line.incomeType,
        });
        await conn.query(
            "UPDATE tb_expenses SET ex_paid_amount = ex_paid_amount + ?, ex_version = ex_version + 1 WHERE ex_id = ?",
            [toDecimalText(line.amount), line.expenseId],
        );
    }

    const certificate =
        calculation.withholdingTotal > 0n
            ? await issueCertificate(conn, {
                  paymentId,
                  paymentDate: input.pv_payment_date,
                  whtForm: payee.whtForm,
                  groups: calculation.groups.filter((group) => group.withholding > 0n),
                  payerSnapshot: snapshots.company,
                  payeeSnapshot: payee.snapshot,
              })
            : null;
    return {
        pv_id: paymentId,
        pv_number: documentNumber,
        wt_id: certificate?.wt_id ?? null,
        wt_number: certificate?.wt_number ?? null,
    };
}

/** ออก 50 ทวิ ของใบสำคัญจ่าย — เลขถัดไปของปีตามวันที่จ่าย · แถวเงินได้เก็บอัตรา/ข้อความ ณ วันนี้ */
async function issueCertificate(conn, { paymentId, paymentDate, whtForm, groups, payerSnapshot, payeeSnapshot }) {
    const [typeRows] = await conn.query(
        "SELECT wit_code, wit_form_row, wit_form_label FROM tb_wht_income_types WHERE wit_code IN (?)",
        [groups.map((group) => group.incomeType)],
    );
    const typeByCode = new Map(typeRows.map((row) => [row.wit_code, row]));
    const issued = await issueYearlyNumber(conn, "WT", paymentDate);
    const certificateId = await generateDailyId("tb_wht_certificates", "wt_id", "WHT");
    const totalPaid = groups.reduce((sum, group) => sum + group.base, 0n);
    const totalTax = groups.reduce((sum, group) => sum + group.withholding, 0n);
    await insertRow(conn, "tb_wht_certificates", {
        wt_id: certificateId,
        wt_number: issued.number,
        wt_book_no: issued.year,
        wt_sequence: issued.sequence,
        wt_payment_id: paymentId,
        wt_form: whtForm,
        wt_payment_date: paymentDate,
        wt_status: "issued",
        wt_total_paid: toDecimalText(totalPaid),
        wt_total_tax: toDecimalText(totalTax),
        wt_payer_snapshot: JSON.stringify(payerSnapshot),
        wt_payee_snapshot: JSON.stringify(payeeSnapshot),
    });
    for (const group of groups) {
        const type = typeByCode.get(group.incomeType);
        await insertRow(conn, "tb_wht_certificate_lines", {
            wtl_certificate_id: certificateId,
            wtl_income_type: group.incomeType,
            wtl_form_row: type.wit_form_row,
            wtl_form_label: type.wit_form_label,
            wtl_rate: group.rate,
            wtl_paid_amount: toDecimalText(group.base),
            wtl_tax_amount: toDecimalText(group.withholding),
        });
    }
    return { wt_id: certificateId, wt_number: issued.number };
}

// ─── ยกเลิก ─────────────────────────────────────────────────────────────────────────────────

/** ยกเลิก — เลข PV/50 ทวิ ยังอยู่ · 50 ทวิ ยกเลิกตาม · ยอดจ่ายแล้วของทุกรายการลดกลับ (กลับเป็นค้างจ่าย) */
async function cancelPayment(conn, paymentId, reason, expectedVersion, actor) {
    const [[payment]] = await conn.query("SELECT * FROM tb_payments WHERE pv_id = ? FOR UPDATE", [paymentId]);
    if (!payment) throw notFound();
    if (payment.pv_status !== "issued") {
        throw new AppError(409, "PAYMENT_WRONG_STATUS", "ใบสำคัญจ่ายนี้ถูกยกเลิกไปแล้ว · กรุณาโหลดหน้าใหม่");
    }
    if (expectedVersion !== null && expectedVersion !== undefined && payment.pv_version !== expectedVersion) {
        throw new AppError(409, "PAYMENT_CHANGED", "มีคนเปลี่ยนใบนี้ไปก่อนแล้ว · โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด");
    }

    const [allocations] = await conn.query(
        "SELECT pva_expense_id, pva_amount FROM tb_payment_allocations WHERE pva_payment_id = ? ORDER BY pva_expense_id",
        [paymentId],
    );
    const expensesById = await lockExpenses(
        conn,
        allocations.map((allocation) => allocation.pva_expense_id),
    );
    for (const allocation of allocations) {
        const expense = expensesById.get(allocation.pva_expense_id);
        if (parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว") < parseHundredths(allocation.pva_amount, "ยอดตัด")) {
            // ไม่ควรเกิด — หยุดก่อนยอดติดลบ ให้ผู้ดูแลตรวจข้อมูล
            throw new AppError(
                500,
                "PAYMENT_PAID_MISMATCH",
                `ยอดจ่ายแล้วของ ${expense.ex_number} น้อยกว่ายอดในใบสำคัญจ่ายนี้ · ข้อมูลไม่ตรงกัน แจ้งผู้ดูแลระบบ`,
            );
        }
        await conn.query(
            "UPDATE tb_expenses SET ex_paid_amount = ex_paid_amount - ?, ex_version = ex_version + 1 WHERE ex_id = ?",
            [allocation.pva_amount, allocation.pva_expense_id],
        );
    }
    await conn.query(
        `UPDATE tb_payments SET pv_status = 'cancelled', pv_cancelled_by = ?, pv_cancelled_at = NOW(), pv_cancel_reason = ?,
                pv_version = pv_version + 1
         WHERE pv_id = ?`,
        [actor.user_id, reason, paymentId],
    );
    await conn.query(
        "UPDATE tb_wht_certificates SET wt_status = 'cancelled', wt_cancelled_at = NOW() WHERE wt_payment_id = ?",
        [paymentId],
    );
    return { pv_id: paymentId };
}

// ─── ข้อมูลสำหรับฟอร์มทำจ่าย ──────────────────────────────────────────────────────────────────

/**
 * ผู้รับที่มีรายการรอจ่าย (อนุมัติแล้ว ยังค้าง) — ช่องเลือกผู้รับในฟอร์ม
 * @param {import("mysql2/promise").Pool} conn
 */
async function listPayees(conn) {
    const [rows] = await conn.query(
        `SELECT e.ex_kind, e.ex_vendor_id, e.ex_employee_id, e.ex_currency,
                v.vd_name, v.vd_type, v.vd_country, CONCAT(u.user_fname, ' ', u.user_lname) AS employee_name,
                COUNT(*) AS expense_count, SUM(e.ex_total - e.ex_paid_amount) AS outstanding,
                MIN(DATE_FORMAT(e.ex_due_date, '%Y-%m-%d')) AS earliest_due_date
         FROM tb_expenses e
         LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
         LEFT JOIN tb_users u ON u.user_id = e.ex_employee_id
         WHERE e.ex_status = 'approved' AND e.ex_paid_amount < e.ex_total
         GROUP BY e.ex_kind, e.ex_vendor_id, e.ex_employee_id, e.ex_currency, v.vd_name, v.vd_type, v.vd_country, u.user_fname, u.user_lname
         ORDER BY earliest_due_date, v.vd_name, u.user_fname`,
    );
    return rows.map((row) => ({
        payee_kind: row.ex_kind === "claim" ? "employee" : "vendor",
        payee_id: row.ex_kind === "claim" ? row.ex_employee_id : row.ex_vendor_id,
        payee_name: row.ex_kind === "claim" ? row.employee_name : row.vd_name,
        wht_form: row.ex_kind === "claim" ? null : whtFormOf(row),
        currency: row.ex_currency,
        expense_count: Number(row.expense_count),
        outstanding: toDecimalText(parseHundredths(row.outstanding, "ยอดค้าง")),
        earliest_due_date: row.earliest_due_date,
    }));
}

/**
 * รายการรอจ่ายของผู้รับรายหนึ่ง + ฐาน/ยอดบาทที่จ่ายไปแล้ว + อัตราหัก ณ ที่จ่ายวันนี้ (หน้าเว็บแสดงยอดเสนอก่อนยืนยัน)
 * @param {{ payeeKind: "vendor" | "employee", payeeId: string }} options
 */
async function listPayableExpenses(conn, { payeeKind, payeeId }) {
    const today = todayBangkok();
    const column = payeeKind === "employee" ? "e.ex_employee_id" : "e.ex_vendor_id";
    const kind = payeeKind === "employee" ? "claim" : "bill";
    const [rows] = await conn.query(
        `SELECT e.ex_id, e.ex_number, e.ex_title, e.ex_vendor_doc_no, e.ex_currency, e.ex_subtotal, e.ex_vat_amount, e.ex_total,
                e.ex_total_thb, e.ex_paid_amount, e.ex_wht_income_type, e.ex_wht_amount, e.ex_branch_id, ${EXPENSE_DATE_COLUMNS},
                t.wit_name_th AS wht_income_type_name
         FROM tb_expenses e
         LEFT JOIN tb_wht_income_types t ON t.wit_code = e.ex_wht_income_type
         WHERE ${column} = ? AND e.ex_kind = ? AND e.ex_status = 'approved' AND e.ex_paid_amount < e.ex_total
         ORDER BY e.ex_due_date, e.ex_number`,
        [payeeId, kind],
    );
    const prior =
        rows.length > 0
            ? await findPriorShares(
                  conn,
                  rows.map((row) => row.ex_id),
              )
            : new Map();

    let whtForm = null;
    if (payeeKind === "vendor") {
        const [[vendor]] = await conn.query("SELECT vd_type, vd_country, vd_name FROM tb_vendors WHERE vd_id = ?", [
            payeeId,
        ]);
        whtForm = vendor ? whtFormOf(vendor) : null;
    }
    const incomeTypes = whtForm ? [...new Set(rows.map((row) => row.ex_wht_income_type).filter(Boolean))] : [];
    const rates = await findRates(conn, incomeTypes, today);

    return {
        wht_form: whtForm,
        today,
        rates: Object.fromEntries(
            [...rates.entries()].map(([type, rate]) => [type, { rate: rate.rate, min_payment: rate.minPayment }]),
        ),
        data: rows.map((row) => {
            const shares = prior.get(row.ex_id) ?? { base: 0n, thb: 0n };
            return {
                ...row,
                ex_wht_income_type: whtForm ? row.ex_wht_income_type : null,
                outstanding_amount: toDecimalText(outstandingOf(row)),
                base_paid_before: toDecimalText(shares.base),
                thb_paid_before: toDecimalText(shares.thb),
            };
        }),
    };
}

// ─── อ่าน ────────────────────────────────────────────────────────────────────────────────────

const PAYMENT_LIST_TABS = {
    all: "1 = 1",
    issued: "p.pv_status = 'issued'",
    cancelled: "p.pv_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, expenseId?: string, limit?: number, offset?: number }} options
 */
async function listPayments(conn, { tab = "all", search = "", expenseId, limit = 20, offset = 0 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const conditions = [PAYMENT_LIST_TABS[tab] ?? PAYMENT_LIST_TABS.all];
    const params = [];
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            "(p.pv_number LIKE ? OR v.vd_name LIKE ? OR CONCAT(u.user_fname, ' ', u.user_lname) LIKE ? OR w.wt_number LIKE ?)",
        );
        params.push(like, like, like, like);
    }
    if (expenseId) {
        conditions.push(
            "EXISTS (SELECT 1 FROM tb_payment_allocations a WHERE a.pva_payment_id = p.pv_id AND a.pva_expense_id = ?)",
        );
        params.push(expenseId);
    }
    const where = conditions.join(" AND ");
    const from = `FROM tb_payments p
         LEFT JOIN tb_vendors v ON v.vd_id = p.pv_vendor_id
         LEFT JOIN tb_users u ON u.user_id = p.pv_employee_id
         LEFT JOIN tb_wht_certificates w ON w.wt_payment_id = p.pv_id`;
    const [rows] = await conn.query(
        `SELECT p.pv_id, p.pv_number, p.pv_status, p.pv_payee_kind, p.pv_currency, p.pv_method,
                DATE_FORMAT(p.pv_payment_date, '%Y-%m-%d') AS pv_payment_date, p.pv_allocated_total, p.pv_wht_amount,
                p.pv_net_paid, p.pv_fee_amount, COALESCE(v.vd_name, CONCAT(u.user_fname, ' ', u.user_lname)) AS payee_name,
                w.wt_id, w.wt_number,
                (SELECT COUNT(*) FROM tb_payment_allocations a WHERE a.pva_payment_id = p.pv_id) AS expense_count
         ${from}
         WHERE ${where}
         ORDER BY p.pv_payment_date DESC, p.pv_number DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(`SELECT COUNT(*) AS total ${from} WHERE ${where}`, params);
    return {
        data: rows.map((row) => ({ ...row, expense_count: Number(row.expense_count) })),
        total: Number(total),
    };
}

function parseJson(value) {
    return quotationService.parseJson(value);
}

/** หนังสือรับรองพร้อมแถวเงินได้ (หน้าพิมพ์/หน้าใบสำคัญจ่ายใช้) */
async function findCertificate(conn, where, value) {
    const [[certificate]] = await conn.query(
        `SELECT w.*, DATE_FORMAT(w.wt_payment_date, '%Y-%m-%d') AS wt_payment_date, p.pv_number, p.pv_status
         FROM tb_wht_certificates w JOIN tb_payments p ON p.pv_id = w.wt_payment_id
         WHERE ${where} = ?`,
        [value],
    );
    if (!certificate) return null;
    const [lines] = await conn.query(
        "SELECT * FROM tb_wht_certificate_lines WHERE wtl_certificate_id = ? ORDER BY wtl_form_row, wtl_id",
        [certificate.wt_id],
    );
    return {
        ...certificate,
        wt_payer_snapshot: parseJson(certificate.wt_payer_snapshot),
        wt_payee_snapshot: parseJson(certificate.wt_payee_snapshot),
        lines,
    };
}

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} paymentId
 * @param {{ role_permission: string }} actor
 */
async function getPaymentDetail(conn, paymentId, actor) {
    const [[payment]] = await conn.query(
        `SELECT p.*, DATE_FORMAT(p.pv_payment_date, '%Y-%m-%d') AS pv_payment_date,
                DATE_FORMAT(p.pv_cheque_date, '%Y-%m-%d') AS pv_cheque_date,
                b.branch_code, b.branch_name_th, CONCAT(c.user_fname, ' ', c.user_lname) AS cancelled_by_name
         FROM tb_payments p
         JOIN tb_branches b ON b.branch_id = p.pv_branch_id
         LEFT JOIN tb_users c ON c.user_id = p.pv_cancelled_by
         WHERE p.pv_id = ?`,
        [paymentId],
    );
    if (!payment) throw notFound();
    const [allocations] = await conn.query(
        `SELECT a.*, e.ex_number, e.ex_kind, e.ex_title, e.ex_vendor_doc_no, e.ex_total, t.wit_name_th AS wht_income_type_name
         FROM tb_payment_allocations a
         JOIN tb_expenses e ON e.ex_id = a.pva_expense_id
         LEFT JOIN tb_wht_income_types t ON t.wit_code = a.pva_wht_income_type
         WHERE a.pva_payment_id = ? ORDER BY a.pva_order`,
        [paymentId],
    );
    const currency = await quotationService.findCurrency(conn, payment.pv_currency);
    const canCancel = hasBit(actor.role_permission, "cancelPayment") && payment.pv_status === "issued";
    return {
        payment: {
            ...payment,
            pv_payee_snapshot: parseJson(payment.pv_payee_snapshot),
            pv_company_snapshot: parseJson(payment.pv_company_snapshot),
            pv_bank_snapshot: parseJson(payment.pv_bank_snapshot),
        },
        currency,
        allocations,
        certificate: await findCertificate(conn, "w.wt_payment_id", paymentId),
        actions: { can_cancel: canCancel },
    };
}

/**
 * รายการ 50 ทวิ — กรองแบบ (ภ.ง.ด.3/53) และเดือนที่จ่าย (YYYY-MM) ไว้ทำรายการยื่นภาษี (รายงานเต็มในขั้น 2-5)
 * @param {{ form?: string, month?: string, search?: string, limit?: number, offset?: number }} options
 */
async function listCertificates(conn, { form, month, search = "", limit = 50, offset = 0 }) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const conditions = ["1 = 1"];
    const params = [];
    if (form === "PND3" || form === "PND53") {
        conditions.push("w.wt_form = ?");
        params.push(form);
    }
    if (/^\d{4}-\d{2}$/.test(month ?? "")) {
        conditions.push("DATE_FORMAT(w.wt_payment_date, '%Y-%m') = ?");
        params.push(month);
    }
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            "(w.wt_number LIKE ? OR p.pv_number LIKE ? OR JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_name')) LIKE ?)",
        );
        params.push(like, like, like);
    }
    const where = conditions.join(" AND ");
    const [rows] = await conn.query(
        `SELECT w.wt_id, w.wt_number, w.wt_form, w.wt_status, DATE_FORMAT(w.wt_payment_date, '%Y-%m-%d') AS wt_payment_date,
                w.wt_total_paid, w.wt_total_tax, p.pv_id, p.pv_number,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_name')) AS payee_name,
                JSON_UNQUOTE(JSON_EXTRACT(w.wt_payee_snapshot, '$.vd_tax_id')) AS payee_tax_id
         FROM tb_wht_certificates w JOIN tb_payments p ON p.pv_id = w.wt_payment_id
         WHERE ${where}
         ORDER BY w.wt_payment_date DESC, w.wt_number DESC
         LIMIT ? OFFSET ?`,
        [...params, safeLimit, safeOffset],
    );
    const [[{ total }]] = await conn.query(
        `SELECT COUNT(*) AS total FROM tb_wht_certificates w JOIN tb_payments p ON p.pv_id = w.wt_payment_id WHERE ${where}`,
        params,
    );
    return { data: rows, total: Number(total) };
}

async function getCertificate(conn, certificateId) {
    const certificate = await findCertificate(conn, "w.wt_id", certificateId);
    if (!certificate) throw new AppError(404, "CERTIFICATE_NOT_FOUND", "ไม่พบหนังสือรับรองนี้");
    return certificate;
}

/** ใบสำคัญจ่ายที่ตัดรายการนี้ (รวมที่ยกเลิก — หน้ารายการแสดงสถานะ) */
async function findPaymentsOfExpense(conn, expenseId) {
    const [rows] = await conn.query(
        `SELECT p.pv_id, p.pv_number, p.pv_status, DATE_FORMAT(p.pv_payment_date, '%Y-%m-%d') AS pv_payment_date, p.pv_method,
                a.pva_amount, w.wt_id, w.wt_number
         FROM tb_payment_allocations a
         JOIN tb_payments p ON p.pv_id = a.pva_payment_id
         LEFT JOIN tb_wht_certificates w ON w.wt_payment_id = p.pv_id
         WHERE a.pva_expense_id = ?
         ORDER BY p.pv_payment_date, p.pv_number`,
        [expenseId],
    );
    return rows;
}

module.exports = {
    createPayment,
    cancelPayment,
    listPayees,
    listPayableExpenses,
    listPayments,
    getPaymentDetail,
    listCertificates,
    getCertificate,
    findPaymentsOfExpense,
};
