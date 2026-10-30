// ค่าใช้จ่าย / บิลผู้ขาย: อ่าน + ร่าง + ไฟล์แนบ (2026-10-16 เฟส 2 ขั้น 2-2 — docs/plans/2026-10-16-purchasing-2.md หัวข้อ 3.4, 4.1)
//
// - ยอดคำนวณใหม่ทุกครั้งที่บันทึก (shared/expense-totals.mjs) ไม่เชื่อยอดจากหน้าเว็บ · กันแก้ทับกันด้วย ex_version
// - VAT ใส่ตามเอกสารผู้ขาย · อัตรา VAT ที่ใช้เสนอ/เตือน = อัตรา ณ วันที่เอกสาร (ไม่ใช่วันนี้ — ยอดไม่เปลี่ยนตามวันที่กดส่ง)
// - หัก ณ ที่จ่ายประมาณการด้วยอัตรา ณ วันที่ค่าใช้จ่าย · ผู้ขายต่างประเทศไม่หัก (ไม่ออก 50 ทวิ — X2)
// - กันบิลซ้ำ (R-P2): ผู้ขายเดียวกัน + เลขเอกสารเดียวกัน ในใบที่ไม่ยกเลิก (รวมร่าง) บันทึกไม่ได้ — ล็อกแถวผู้ขายก่อนตรวจ
//   สองคนบันทึกบิลใบเดียวกันพร้อมกัน คนที่สองรอแล้วเห็นของคนแรก · ลำดับล็อก: ค่าใช้จ่าย → ผู้ขาย เสมอ
// - เปลี่ยนสถานะ (ส่ง/อนุมัติ/ตีกลับ/ยกเลิก/คัดลอก) อยู่ที่ expense-workflow.service.js
// - ไฟล์แนบเก็บแบบส่วนตัว (utils/private-file.js) — service จัดการแถวใน DB · controller เขียน/ลบไฟล์บนดิสก์
// - ใบเบิกเงินพนักงาน (ขั้น 2-3, ex_kind = claim): ทุกคนที่ login เบิกได้ ไม่ต้องมีสิทธิ์ · ผู้เบิก = ผู้บันทึก
//   เห็น/แก้/ส่ง/แนบไฟล์ได้เฉพาะเจ้าของใบ · ผู้มีสิทธิ์ดู/อนุมัติค่าใช้จ่าย/ทำจ่าย เห็นทุกใบ · บาทเท่านั้น ไม่หัก ณ ที่จ่าย
//   ทุกฟังก์ชันที่รับรหัสจาก URL ตรวจว่าเป็นชนิดที่เส้นทางนั้นดูแล (kind) — ใบเบิกเปิดผ่านเส้นทางบิลไม่ได้ และกลับกัน
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../utils/permissions");
const { calculateExpense } = require("../shared/expense-totals.mjs");
const { evaluateApproval } = require("../shared/approval-flow.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const {
    DOC_TYPES_WITH_NUMBER,
    MAX_EXPENSE_ATTACHMENTS,
    MAX_EXPENSE_BACKDATE_DAYS,
    MAX_EXPENSE_FUTURE_DAYS,
} = require("../shared/schemas/expense.mjs");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");
const purchasingSetupService = require("./purchasing-setup.service");
const exchangeRateService = require("./exchange-rate.service");
const { whtFormOf } = require("./vendor.service");
const paymentService = require("./payment.service");

const MAX_LIST_LIMIT = 200;
const DOCUMENT_NAME = "ค่าใช้จ่าย";
const DOCUMENT_TYPE_BY_KIND = { bill: "EX", claim: "EC" };

const DATE_COLUMNS = `
    DATE_FORMAT(e.ex_expense_date, '%Y-%m-%d') AS ex_expense_date,
    DATE_FORMAT(e.ex_due_date, '%Y-%m-%d') AS ex_due_date,
    DATE_FORMAT(e.ex_vendor_doc_date, '%Y-%m-%d') AS ex_vendor_doc_date,
    DATE_FORMAT(e.ex_rate_date, '%Y-%m-%d') AS ex_rate_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "EXPENSE_NOT_FOUND", "ไม่พบรายการค่าใช้จ่ายนี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "EXPENSE_WRONG_STATUS", `${message} · กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

function validationError(fields) {
    return new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล — ไม่ส่งมา = ไม่ตรวจ
 * @param {{ ex_version: number }} expense
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(expense, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (expense.ex_version !== expectedVersion) {
        throw new AppError(
            409,
            "EXPENSE_CHANGED",
            "มีคนแก้หรือเปลี่ยนสถานะรายการนี้ไปก่อนแล้ว · โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

/** แถวค่าใช้จ่าย (ล็อกไว้จนจบ transaction) — วันที่เป็นข้อความ "YYYY-MM-DD" */
async function findForUpdate(conn, expenseId) {
    const [[expense]] = await conn.query(
        `SELECT e.*, ${DATE_COLUMNS} FROM tb_expenses e WHERE e.ex_id = ? FOR UPDATE`,
        [expenseId],
    );
    if (!expense) throw notFound();
    return expense;
}

// ─── ใครทำอะไรกับรายการไหนได้ ──────────────────────────────────────────────────────────────────

// สิทธิ์ที่เห็นใบเบิกของทุกคน (ผู้ดูค่าใช้จ่าย ผู้อนุมัติ ผู้ทำจ่าย)
const VIEW_ALL_CLAIMS_PERMISSIONS = ["viewExpenses", "approveExpense", "makePayment"];

function canViewAllClaims(actor) {
    return VIEW_ALL_CLAIMS_PERMISSIONS.some((key) => hasBit(actor.role_permission, key));
}

function isClaimOwner(expense, actor) {
    return expense.ex_kind === "claim" && expense.ex_employee_id === actor.user_id;
}

/** ผู้แก้ร่าง/ส่ง/แนบไฟล์ได้: บิล = สิทธิ์บันทึกค่าใช้จ่าย · ใบเบิก = เจ้าของใบเท่านั้น */
function canWorkAsCreator(expense, actor) {
    if (expense.ex_kind === "claim") return isClaimOwner(expense, actor);
    return hasBit(actor.role_permission, "createExpense");
}

/**
 * รายการต้องเป็นชนิดที่เส้นทางนั้นดูแล และผู้ใช้ต้องเห็นรายการนี้ได้ — ไม่ผ่าน = 404 (ไม่บอกว่ามีรายการนี้อยู่)
 * สิทธิ์ดูบิลตรวจที่เส้นทางแล้ว · ใบเบิก: เจ้าของ หรือผู้มีสิทธิ์เห็นทุกใบ
 */
function assertCanSee(expense, actor, kind) {
    if (expense.ex_kind !== kind) throw notFound();
    if (kind === "claim" && !isClaimOwner(expense, actor) && !canViewAllClaims(actor)) throw notFound();
}

function assertCanWork(expense, actor, kind) {
    assertCanSee(expense, actor, kind);
    if (!canWorkAsCreator(expense, actor)) {
        throw new AppError(403, "EXPENSE_NOT_OWNER", "ใบเบิกแก้/ส่ง/แนบไฟล์ได้เฉพาะผู้เบิกเจ้าของใบ");
    }
}

// ─── ตรวจร่าง ───────────────────────────────────────────────────────────────────────────────

/** จำนวนวันระหว่างวันที่สองวัน ("YYYY-MM-DD") — ไม่ขึ้นกับเขตเวลาเครื่อง */
function daysBetween(fromDate, toDate) {
    const toUtc = (text) => {
        const [year, month, day] = text.split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    };
    return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86_400_000);
}

function checkDateRange(dateText, label, today) {
    if (!dateText) return null;
    const daysAgo = daysBetween(dateText, today);
    if (daysAgo > MAX_EXPENSE_BACKDATE_DAYS) {
        return `${label}ย้อนหลังได้ไม่เกิน ${MAX_EXPENSE_BACKDATE_DAYS} วัน · ตรวจปีที่พิมพ์ (ใช้ ค.ศ.)`;
    }
    if (-daysAgo > MAX_EXPENSE_FUTURE_DAYS) {
        return `${label}ล่วงหน้าได้ไม่เกิน ${MAX_EXPENSE_FUTURE_DAYS} วัน · ตรวจปีที่พิมพ์ (ใช้ ค.ศ.)`;
    }
    return null;
}

/**
 * ผู้ขายของบิล — ล็อกแถว (กันบันทึกบิลซ้ำพร้อมกัน R-P2) · ที่เลือกใหม่ต้องเปิดใช้งาน
 * @returns {Promise<object | null>} null = ไม่พบ (ใส่ข้อความใน fields แล้ว)
 */
async function lockVendor(conn, vendorId, existing, fields) {
    const [[vendor]] = await conn.query(
        "SELECT vd_id, vd_name, vd_type, vd_country, vd_status FROM tb_vendors WHERE vd_id = ? FOR UPDATE",
        [vendorId],
    );
    if (!vendor) {
        fields.ex_vendor_id = "ไม่พบผู้ขายนี้ อาจถูกลบไปแล้ว";
        return null;
    }
    const isChanged = !existing || existing.ex_vendor_id !== vendorId;
    if (vendor.vd_status !== "active" && isChanged) fields.ex_vendor_id = "ผู้ขายนี้ถูกปิดใช้งานแล้ว";
    return vendor;
}

/**
 * บิลผู้ขายใบเดียวกันที่บันทึกไว้แล้ว (ไม่ยกเลิก รวมร่าง) — ต้องล็อกผู้ขายก่อนเรียก
 * @returns {Promise<{ ex_id: string, ex_number: string | null, ex_status: string } | null>}
 */
async function findDuplicateBill(conn, vendorId, vendorDocNo, excludeId) {
    if (!vendorDocNo) return null;
    const [[duplicate]] = await conn.query(
        `SELECT ex_id, ex_number, ex_status FROM tb_expenses
         WHERE ex_vendor_id = ? AND ex_vendor_doc_no = ? AND ex_status <> 'cancelled' AND ex_id <> ?
         LIMIT 1`,
        [vendorId, vendorDocNo, excludeId ?? ""],
    );
    return duplicate ?? null;
}

function describeDuplicate(duplicate) {
    if (duplicate.ex_number) return `บันทึกไว้แล้วเป็น ${duplicate.ex_number}`;
    return duplicate.ex_status === "draft" ? "มีร่างที่ใช้เลขนี้อยู่แล้ว" : "มีรายการรออนุมัติที่ใช้เลขนี้อยู่แล้ว";
}

/**
 * หมวด/โปรเจกต์ของแต่ละบรรทัด — หมวดที่เลือกใหม่ต้องเปิดใช้งาน (หมวดเดิมที่ถูกปิดภายหลังคงไว้ได้)
 */
async function checkLines(conn, lines, existingLines, fields) {
    const categoryIds = [...new Set(lines.map((line) => line.exl_category_id))];
    const projectIds = [...new Set(lines.map((line) => line.exl_project_id).filter(Boolean))];
    const [categories] = categoryIds.length
        ? await conn.query("SELECT ec_id, ec_status FROM tb_expense_categories WHERE ec_id IN (?)", [categoryIds])
        : [[]];
    const [projects] = projectIds.length
        ? await conn.query("SELECT project_id FROM tb_projects WHERE project_id IN (?)", [projectIds])
        : [[]];
    const categoryById = new Map(categories.map((category) => [Number(category.ec_id), category]));
    const existingProjectIds = new Set(projects.map((project) => project.project_id));
    const previousCategoryIds = new Set(existingLines.map((line) => Number(line.exl_category_id)));

    lines.forEach((line, index) => {
        const category = categoryById.get(line.exl_category_id);
        if (!category) fields[`lines.${index}.exl_category_id`] = "ไม่พบหมวดนี้ · เลือกใหม่";
        else if (category.ec_status !== "active" && !previousCategoryIds.has(line.exl_category_id))
            fields[`lines.${index}.exl_category_id`] = "หมวดนี้ถูกปิดใช้งานแล้ว";
        if (line.exl_project_id && !existingProjectIds.has(line.exl_project_id))
            fields[`lines.${index}.exl_project_id`] = "ไม่พบโปรเจกต์นี้ อาจถูกลบไปแล้ว";
    });
}

/**
 * ประเภทเงินได้ + อัตรา ณ วันที่ค่าใช้จ่าย · ผู้ขายต่างประเทศ = ไม่หัก
 * @returns {Promise<{ incomeType: string | null, rate: string | null, minPayment: string | null }>}
 */
async function resolveWithholding(conn, draft, vendor, existing, fields) {
    const none = { incomeType: null, rate: null, minPayment: null };
    if (!draft.ex_wht_income_type || !vendor || whtFormOf(vendor) === null) return none;

    const [[incomeType]] = await conn.query("SELECT wit_status FROM tb_wht_income_types WHERE wit_code = ?", [
        draft.ex_wht_income_type,
    ]);
    const isChanged = !existing || existing.ex_wht_income_type !== draft.ex_wht_income_type;
    if (!incomeType) {
        fields.ex_wht_income_type = "ไม่พบประเภทเงินได้นี้";
        return none;
    }
    if (incomeType.wit_status !== "active" && isChanged) {
        fields.ex_wht_income_type = "ประเภทเงินได้นี้ถูกปิดใช้งานแล้ว";
        return none;
    }
    const rate = await purchasingSetupService.whtRateOn(conn, draft.ex_wht_income_type, draft.ex_expense_date);
    if (!rate) {
        fields.ex_wht_income_type = "ประเภทเงินได้นี้ยังไม่มีอัตราที่มีผล ณ วันที่ค่าใช้จ่าย · ตั้งที่ ตั้งค่าจัดซื้อ";
        return none;
    }
    return { incomeType: draft.ex_wht_income_type, rate: rate.rate, minPayment: rate.minPayment };
}

/** อัตรา "ธปท." ต้องตรงกับที่ระบบดึงไว้ของวันนั้น (กันพิมพ์ตัวเลขเองแต่ติดป้าย ธปท.) */
async function checkRate(conn, draft, fields) {
    if (draft.ex_currency === BASE_CURRENCY) return;
    const botRate = await quotationService.findCachedBotRate(conn, draft.ex_currency, draft.ex_rate_date);
    if (draft.ex_rate_source === "bot" && !quotationService.sameDecimal(botRate, draft.ex_exchange_rate)) {
        fields.ex_exchange_rate = "อัตราไม่ตรงกับของ ธปท. · กดดึงอัตราใหม่ หรือเลือกกรอกเองพร้อมเหตุผล";
    }
}

/**
 * ตรวจร่างทั้งหมด + คำนวณยอด → ค่าที่จะบันทึก (หัวเอกสาร + บรรทัด)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน expenseBillDraftSchema แล้ว
 * @param {object | null} existing แถวเดิมที่ล็อกแล้ว (แก้ร่าง) หรือ null (สร้างใหม่)
 */
async function prepareBillDraft(conn, draft, existing) {
    const fields = {};
    const today = todayBangkok();
    const isChanged = (column) => !existing || existing[column] !== draft[column];

    // ล็อกผู้ขายก่อน SELECT ธรรมดาคำสั่งแรกของ transaction — MySQL (REPEATABLE READ) ถ่ายภาพข้อมูลตอนอ่านธรรมดาครั้งแรก
    // ถ้าอ่านก่อนล็อก การตรวจบิลซ้ำจะไม่เห็นบิลที่อีกคนเพิ่ง commit ระหว่างรอล็อก (R-P2)
    const vendor = await lockVendor(conn, draft.ex_vendor_id, existing, fields);
    const existingLines = existing ? await findLines(conn, existing.ex_id) : [];

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        draft.ex_branch_id,
    ]);
    if (!branch) fields.ex_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active" && isChanged("ex_branch_id"))
        fields.ex_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    const currency = await quotationService.findCurrency(conn, draft.ex_currency);
    if (!currency) fields.ex_currency = "ไม่พบสกุลเงินนี้";
    else if (currency.cur_status !== "active" && isChanged("ex_currency"))
        fields.ex_currency = "สกุลเงินนี้ถูกปิดใช้งานแล้ว";

    const expenseDateProblem = checkDateRange(draft.ex_expense_date, "วันที่ค่าใช้จ่าย", today);
    if (expenseDateProblem) fields.ex_expense_date = expenseDateProblem;
    const docDateProblem = checkDateRange(draft.ex_vendor_doc_date, "วันที่ในเอกสาร", today);
    if (docDateProblem) fields.ex_vendor_doc_date = docDateProblem;

    await checkRate(conn, draft, fields);
    await checkLines(conn, draft.lines, existingLines, fields);
    const withholding = await resolveWithholding(conn, draft, vendor, existing, fields);

    if (vendor && draft.ex_vendor_doc_no) {
        const duplicate = await findDuplicateBill(conn, vendor.vd_id, draft.ex_vendor_doc_no, existing?.ex_id);
        if (duplicate) {
            fields.ex_vendor_doc_no = `เลขเอกสาร ${draft.ex_vendor_doc_no} ของผู้ขายนี้${describeDuplicate(duplicate)} · บิลใบเดียวบันทึกได้ครั้งเดียว (กันจ่ายซ้ำ)`;
        }
    }
    if (Object.keys(fields).length > 0) throw validationError(fields);

    // VAT ตามเอกสารผู้ขาย: อัตราที่ใช้เสนอ/เตือน = อัตรา ณ วันที่เอกสาร (ไม่มีวันที่เอกสาร = วันที่ค่าใช้จ่าย)
    const documentDate = draft.ex_vendor_doc_date ?? draft.ex_expense_date;
    const officialVatRate = (await companyService.findVatRateOn(conn, documentDate)) ?? "0.00";
    const calculation = calculateExpense({
        lines: draft.lines,
        vatAmount: draft.ex_vat_amount,
        vatRate: officialVatRate,
        whtRate: withholding.rate,
        whtMinPayment: withholding.minPayment,
        exchangeRate: draft.ex_exchange_rate,
        currencyDecimals: currency.cur_decimals,
    });
    if (Object.keys(calculation.errors).length > 0) {
        throw new AppError(400, "VALIDATION", "ตัวเลขบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", calculation.errors);
    }

    // ขอคืนภาษีซื้อได้ = บริษัทจด VAT ณ วันที่เอกสาร + ใบกำกับภาษีเต็มรูป + มี VAT (คำถาม X3)
    const company = await companyService.findCompany(conn);
    const isVatRegistered = company.cs_vat_registered_from !== null && company.cs_vat_registered_from <= documentDate;
    const isVatClaimable = isVatRegistered && draft.ex_doc_type === "tax_invoice" && calculation.vat > 0n;
    const botRate =
        draft.ex_currency === BASE_CURRENCY
            ? null
            : await quotationService.findCachedBotRate(conn, draft.ex_currency, draft.ex_rate_date);

    const header = {
        ex_vendor_id: draft.ex_vendor_id,
        ex_title: draft.ex_title,
        ex_branch_id: draft.ex_branch_id,
        ex_vendor_doc_no: draft.ex_vendor_doc_no,
        ex_vendor_doc_date: draft.ex_vendor_doc_date,
        ex_doc_type: draft.ex_doc_type,
        ex_expense_date: draft.ex_expense_date,
        ex_credit_days: draft.ex_credit_days,
        ex_due_date: exchangeRateService.shiftDate(draft.ex_expense_date, draft.ex_credit_days),
        ex_currency: draft.ex_currency,
        ex_exchange_rate: draft.ex_exchange_rate,
        ex_rate_source: draft.ex_rate_source,
        ex_rate_date: draft.ex_rate_date,
        ex_rate_override_reason: draft.ex_rate_source === "manual" ? draft.ex_rate_override_reason : null,
        ex_subtotal: toDecimalText(calculation.subtotal),
        ex_vat_rate: calculation.vat > 0n ? officialVatRate : "0.00",
        ex_vat_amount: toDecimalText(calculation.vat),
        ex_vat_claimable: isVatClaimable ? 1 : 0,
        ex_total: toDecimalText(calculation.total),
        ex_subtotal_thb: toDecimalText(calculation.subtotalThb),
        ex_total_thb: toDecimalText(calculation.totalThb),
        ex_wht_income_type: withholding.incomeType,
        ex_wht_rate: withholding.rate,
        ex_wht_amount: toDecimalText(calculation.withholding),
        ex_notes: draft.ex_notes,
    };
    const lines = draft.lines.map((line, index) => ({
        ...line,
        exl_amount: toDecimalText(calculation.lineAmounts[index]),
    }));
    return { header, lines, botRate };
}

/**
 * ใบเบิกของผู้เบิกคนเดียวกันที่ใช้ใบเสร็จเลขเดียวกันวันเดียวกัน (ไม่ยกเลิก รวมร่าง) — ต้องล็อกแถวผู้เบิกก่อนเรียก
 * เลขใบเสร็จร้านค้าซ้ำกันข้ามร้านได้ (เช่น 0001) จึงเทียบวันที่ด้วย
 */
async function findDuplicateClaim(conn, employeeId, receiptNo, expenseDate, excludeId) {
    if (!receiptNo) return null;
    const [[duplicate]] = await conn.query(
        `SELECT ex_id, ex_number, ex_status FROM tb_expenses
         WHERE ex_kind = 'claim' AND ex_employee_id = ? AND ex_vendor_doc_no = ? AND ex_expense_date = ?
           AND ex_status <> 'cancelled' AND ex_id <> ?
         LIMIT 1`,
        [employeeId, receiptNo, expenseDate, excludeId ?? ""],
    );
    return duplicate ?? null;
}

/**
 * ตรวจร่างใบเบิก + คำนวณยอด (บาท ไม่หัก ณ ที่จ่าย · ครบกำหนดจ่ายตั้งตอนอนุมัติ)
 * @param {object} draft ผ่าน expenseClaimDraftSchema แล้ว
 * @param {string} employeeId ผู้เบิก
 */
async function prepareClaimDraft(conn, draft, existing, employeeId) {
    const fields = {};
    const today = todayBangkok();

    // ล็อกแถวผู้เบิกก่อน SELECT ธรรมดาคำสั่งแรก (กดบันทึกใบเสร็จใบเดียวกันสองครั้งพร้อมกัน — เหตุผลเดียวกับบิล R-P2)
    await conn.query("SELECT user_id FROM tb_users WHERE user_id = ? FOR UPDATE", [employeeId]);
    const existingLines = existing ? await findLines(conn, existing.ex_id) : [];

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        draft.ex_branch_id,
    ]);
    const isBranchChanged = !existing || existing.ex_branch_id !== draft.ex_branch_id;
    if (!branch) fields.ex_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active" && isBranchChanged) fields.ex_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    const expenseDateProblem = checkDateRange(draft.ex_expense_date, "วันที่จ่าย", today);
    if (expenseDateProblem) fields.ex_expense_date = expenseDateProblem;
    const docDateProblem = checkDateRange(draft.ex_vendor_doc_date, "วันที่ในใบเสร็จ", today);
    if (docDateProblem) fields.ex_vendor_doc_date = docDateProblem;
    await checkLines(conn, draft.lines, existingLines, fields);

    const duplicate = await findDuplicateClaim(
        conn,
        employeeId,
        draft.ex_vendor_doc_no,
        draft.ex_expense_date,
        existing?.ex_id,
    );
    if (duplicate) {
        fields.ex_vendor_doc_no = `ใบเสร็จเลข ${draft.ex_vendor_doc_no} วันเดียวกันนี้${describeDuplicate(duplicate)} · ใบเสร็จใบเดียวเบิกได้ครั้งเดียว`;
    }
    if (Object.keys(fields).length > 0) throw validationError(fields);

    const documentDate = draft.ex_vendor_doc_date ?? draft.ex_expense_date;
    const officialVatRate = (await companyService.findVatRateOn(conn, documentDate)) ?? "0.00";
    const calculation = calculateExpense({
        lines: draft.lines,
        vatAmount: draft.ex_vat_amount,
        vatRate: officialVatRate,
    });
    if (Object.keys(calculation.errors).length > 0) {
        throw new AppError(400, "VALIDATION", "ตัวเลขบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", calculation.errors);
    }
    const company = await companyService.findCompany(conn);
    const isVatRegistered = company.cs_vat_registered_from !== null && company.cs_vat_registered_from <= documentDate;

    const header = {
        ex_title: draft.ex_title,
        ex_branch_id: draft.ex_branch_id,
        ex_merchant_name: draft.ex_merchant_name,
        ex_vendor_doc_no: draft.ex_vendor_doc_no,
        ex_vendor_doc_date: draft.ex_vendor_doc_date,
        ex_doc_type: draft.ex_doc_type,
        ex_expense_date: draft.ex_expense_date,
        ex_credit_days: 0,
        ex_due_date: draft.ex_expense_date,
        ex_subtotal: toDecimalText(calculation.subtotal),
        ex_vat_rate: calculation.vat > 0n ? officialVatRate : "0.00",
        ex_vat_amount: toDecimalText(calculation.vat),
        ex_vat_claimable: isVatRegistered && draft.ex_doc_type === "tax_invoice" && calculation.vat > 0n ? 1 : 0,
        ex_total: toDecimalText(calculation.total),
        ex_subtotal_thb: toDecimalText(calculation.subtotal),
        ex_total_thb: toDecimalText(calculation.total),
        ex_notes: draft.ex_notes,
    };
    const lines = draft.lines.map((line, index) => ({
        ...line,
        exl_amount: toDecimalText(calculation.lineAmounts[index]),
    }));
    return { header, lines };
}

// ─── บันทึก ───────────────────────────────────────────────────────────────────────────────────

async function replaceLines(conn, expenseId, lines) {
    await conn.query("DELETE FROM tb_expense_lines WHERE exl_expense_id = ?", [expenseId]);
    for (const [index, line] of lines.entries()) {
        await conn.query(
            `INSERT INTO tb_expense_lines
                (exl_expense_id, exl_order, exl_category_id, exl_project_id, exl_description, exl_quantity, exl_unit_price, exl_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                expenseId,
                index + 1,
                line.exl_category_id,
                line.exl_project_id,
                line.exl_description,
                line.exl_quantity,
                line.exl_unit_price,
                line.exl_amount,
            ],
        );
    }
}

async function findLines(conn, expenseId) {
    const [lines] = await conn.query(
        "SELECT * FROM tb_expense_lines WHERE exl_expense_id = ? ORDER BY exl_order, exl_id",
        [expenseId],
    );
    return lines;
}

async function findUserName(conn, userId) {
    const [[user]] = await conn.query(
        "SELECT CONCAT(user_fname, ' ', user_lname) AS full_name FROM tb_users WHERE user_id = ?",
        [userId],
    );
    return user?.full_name ?? null;
}

/**
 * สร้างร่างบิลผู้ขาย
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน expenseBillDraftSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createBillDraft(conn, draft, actor) {
    const { header, lines } = await prepareBillDraft(conn, draft, null);
    const expenseId = await generateDailyId("tb_expenses", "ex_id", "EXP");
    const values = {
        ex_kind: "bill",
        ex_status: "draft",
        ex_version: 0,
        ...header,
        ex_created_by: actor.user_id,
        ex_created_by_name: await findUserName(conn, actor.user_id),
    };
    const columns = Object.keys(values);
    await conn.query(
        `INSERT INTO tb_expenses (ex_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        [expenseId, ...Object.values(values)],
    );
    await replaceLines(conn, expenseId, lines);
    return { ex_id: expenseId };
}

/**
 * สร้างร่างใบเบิก — ผู้เบิก = ผู้บันทึกเสมอ (เบิกแทนคนอื่นไม่ได้)
 * @param {object} draft ผ่าน expenseClaimDraftSchema แล้ว
 */
async function createClaimDraft(conn, draft, actor) {
    const { header, lines } = await prepareClaimDraft(conn, draft, null, actor.user_id);
    const expenseId = await generateDailyId("tb_expenses", "ex_id", "EXP");
    const values = {
        ex_kind: "claim",
        ex_status: "draft",
        ex_version: 0,
        ex_employee_id: actor.user_id,
        ex_currency: BASE_CURRENCY,
        ex_exchange_rate: "1",
        ...header,
        ex_created_by: actor.user_id,
        ex_created_by_name: await findUserName(conn, actor.user_id),
    };
    const columns = Object.keys(values);
    await conn.query(
        `INSERT INTO tb_expenses (ex_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        [expenseId, ...Object.values(values)],
    );
    await replaceLines(conn, expenseId, lines);
    return { ex_id: expenseId };
}

function requireVersion(draft) {
    if (draft.ex_version === null || draft.ex_version === undefined) {
        throw new AppError(400, "VALIDATION", "หน้าเว็บเป็นเวอร์ชันเก่า กรุณารีเฟรชแล้วลองใหม่", {
            ex_version: "ไม่มีเวอร์ชัน",
        });
    }
}

/**
 * แก้ร่าง — ได้เฉพาะสถานะร่าง (รวมที่ถูกตีกลับ)
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} expenseId
 * @param {object} draft ผ่าน expenseBillDraftSchema (บิล) หรือ expenseClaimDraftSchema (ใบเบิก) แล้ว
 * @param {{ user_id: string, role_permission: string }} actor
 * @param {"bill" | "claim"} kind ชนิดที่เส้นทางนั้นดูแล
 */
async function updateDraft(conn, expenseId, draft, actor, kind) {
    const existing = await findForUpdate(conn, expenseId);
    assertCanWork(existing, actor, kind);
    if (existing.ex_status !== "draft") throw wrongStatus("รายการนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้");
    requireVersion(draft);
    assertVersion(existing, draft.ex_version);

    const { header, lines } =
        kind === "claim"
            ? await prepareClaimDraft(conn, draft, existing, existing.ex_employee_id)
            : await prepareBillDraft(conn, draft, existing);
    await conn.query(
        `UPDATE tb_expenses SET ${Object.keys(header)
            .map((column) => `${column} = ?`)
            .join(", ")}, ex_version = ex_version + 1
         WHERE ex_id = ?`,
        [...Object.values(header), expenseId],
    );
    await replaceLines(conn, expenseId, lines);
    return { ex_id: expenseId };
}

/**
 * ลบร่างจริง (บรรทัด/ไฟล์แนบ/ประวัติตีกลับตามไปด้วย) — ร่างยังไม่มีเลข จึงลบได้โดยเลขไม่ข้าม
 * @returns {Promise<{ filePaths: string[] }>} ไฟล์แนบที่ controller ต้องลบจากดิสก์หลัง commit
 */
async function deleteDraft(conn, expenseId, expectedVersion, actor, kind) {
    const existing = await findForUpdate(conn, expenseId);
    assertCanWork(existing, actor, kind);
    if (existing.ex_status !== "draft") {
        throw wrongStatus('ลบได้เฉพาะร่าง · รายการที่อนุมัติแล้วให้ใช้ "ยกเลิก" แทน');
    }
    assertVersion(existing, expectedVersion);
    const [files] = await conn.query("SELECT exf_file_path FROM tb_expense_attachments WHERE exf_expense_id = ?", [
        expenseId,
    ]);
    await conn.query("DELETE FROM tb_expenses WHERE ex_id = ?", [expenseId]);
    return { filePaths: files.map((file) => file.exf_file_path) };
}

// ─── ไฟล์แนบ ─────────────────────────────────────────────────────────────────────────────────

/**
 * แนบไฟล์ได้จนกว่าจะยกเลิก (ใบกำกับตัวจริงมักมาถึงหลังอนุมัติ) · ไม่เกิน MAX_EXPENSE_ATTACHMENTS ไฟล์
 * @param {{ storedPath: string, fileName: string, fileSize: number }} file บันทึกลงดิสก์แล้ว
 */
async function addAttachment(conn, expenseId, file, actor, kind) {
    const expense = await findForUpdate(conn, expenseId);
    assertCanWork(expense, actor, kind);
    if (expense.ex_status === "cancelled") throw wrongStatus("รายการนี้ถูกยกเลิกแล้ว แนบไฟล์เพิ่มไม่ได้");
    const [[{ total }]] = await conn.query(
        "SELECT COUNT(*) AS total FROM tb_expense_attachments WHERE exf_expense_id = ?",
        [expenseId],
    );
    if (Number(total) >= MAX_EXPENSE_ATTACHMENTS) {
        throw new AppError(
            409,
            "EXPENSE_ATTACHMENT_LIMIT",
            `แนบได้ไม่เกิน ${MAX_EXPENSE_ATTACHMENTS} ไฟล์ต่อรายการ · รวมหลายหน้าเป็น PDF ไฟล์เดียวแทน`,
        );
    }
    const [result] = await conn.query(
        `INSERT INTO tb_expense_attachments (exf_expense_id, exf_file_path, exf_file_name, exf_file_size, exf_uploaded_by)
         VALUES (?, ?, ?, ?, ?)`,
        [expenseId, file.storedPath, file.fileName, file.fileSize, actor.user_id],
    );
    return { exf_id: Number(result.insertId), exf_file_name: file.fileName };
}

/**
 * ลบไฟล์แนบได้เฉพาะตอนเป็นร่าง — ส่งแล้วไฟล์เป็นหลักฐานที่ผู้อนุมัติดู (แนบเพิ่มได้ ลบไม่ได้)
 * @returns {Promise<{ oldPath: string }>}
 */
async function removeAttachment(conn, expenseId, attachmentId, actor, kind) {
    const expense = await findForUpdate(conn, expenseId);
    assertCanWork(expense, actor, kind);
    if (expense.ex_status !== "draft") {
        throw wrongStatus("ลบไฟล์แนบได้เฉพาะตอนเป็นร่าง · ส่งแล้วไฟล์เป็นหลักฐานของรายการ (แนบไฟล์ที่ถูกต้องเพิ่มได้)");
    }
    const [[file]] = await conn.query(
        "SELECT exf_file_path FROM tb_expense_attachments WHERE exf_id = ? AND exf_expense_id = ?",
        [attachmentId, expenseId],
    );
    if (!file) throw new AppError(404, "EXPENSE_ATTACHMENT_NOT_FOUND", "ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว");
    await conn.query("DELETE FROM tb_expense_attachments WHERE exf_id = ?", [attachmentId]);
    return { oldPath: file.exf_file_path };
}

async function findAttachment(conn, expenseId, attachmentId, actor, kind) {
    const [[expense]] = await conn.query("SELECT ex_kind, ex_employee_id FROM tb_expenses WHERE ex_id = ?", [
        expenseId,
    ]);
    if (!expense) throw notFound();
    assertCanSee(expense, actor, kind);
    const [[file]] = await conn.query(
        "SELECT exf_file_path, exf_file_name FROM tb_expense_attachments WHERE exf_id = ? AND exf_expense_id = ?",
        [attachmentId, expenseId],
    );
    if (!file) throw new AppError(404, "EXPENSE_ATTACHMENT_NOT_FOUND", "ไม่พบไฟล์แนบนี้ อาจถูกลบไปแล้ว");
    return { storedPath: file.exf_file_path, fileName: file.exf_file_name };
}

// ─── สิทธิ์อนุมัติของผู้ใช้ที่ดูอยู่ ──────────────────────────────────────────────────────────────

function evaluateFor(expense, approvalsThisRound, actor, allowSelfApproval) {
    return evaluateApproval({
        plan: quotationService.parseJson(expense.ex_approval_plan) ?? [],
        currentLevel: expense.ex_approval_current_level,
        approvalsThisRound,
        actor: {
            user_id: actor.user_id,
            role_id: actor.user_role_id,
            can_approve: hasBit(actor.role_permission, "approveExpense"),
        },
        creatorId: expense.ex_created_by,
        // ใบเบิกเงิน: ผู้เบิกอนุมัติของตัวเองไม่ได้เสมอ ไม่ขึ้นกับตั้งค่า (R-P11 — ขั้น 2-3)
        allowSelfApproval: expense.ex_kind === "claim" ? false : allowSelfApproval,
        documentName: DOCUMENT_NAME,
    });
}

async function approvalsOfRound(conn, expenseIds) {
    if (expenseIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT a.expa_expense_id, a.expa_level, a.expa_user_id
         FROM tb_expense_approvals a JOIN tb_expenses e ON e.ex_id = a.expa_expense_id
         WHERE a.expa_expense_id IN (?) AND a.expa_round = e.ex_approval_round AND a.expa_action = 'approve'`,
        [expenseIds],
    );
    const byExpense = new Map();
    for (const row of rows) {
        const list = byExpense.get(row.expa_expense_id) ?? [];
        list.push({ level: row.expa_level, user_id: row.expa_user_id });
        byExpense.set(row.expa_expense_id, list);
    }
    return byExpense;
}

// ─── สถานะการจ่าย (คำนวณตอนอ่าน ไม่เก็บ) ────────────────────────────────────────────────────────

/**
 * @returns {"unpaid" | "partial" | "paid" | null} null = ยังไม่อนุมัติหรือยกเลิกแล้ว
 */
function paymentStateOf(expense) {
    if (expense.ex_status !== "approved") return null;
    const paid = parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว");
    if (paid <= 0n) return "unpaid";
    return paid >= parseHundredths(expense.ex_total, "ยอดรวม") ? "paid" : "partial";
}

/** ยอดค้างจ่าย + เกินกำหนดไหม (วันครบกำหนดเทียบวันนี้ตามเวลาไทย) */
function dueStatus(expense, today) {
    const outstanding =
        expense.ex_status === "approved"
            ? parseHundredths(expense.ex_total, "ยอดรวม") - parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว")
            : 0n;
    const isOutstanding = outstanding > 0n;
    const daysPastDue = isOutstanding ? daysBetween(expense.ex_due_date, today) : 0;
    return {
        outstanding_amount: toDecimalText(outstanding > 0n ? outstanding : 0n),
        is_outstanding: isOutstanding,
        is_overdue: isOutstanding && daysPastDue > 0,
        days_overdue: Math.max(daysPastDue, 0),
        days_until_due: isOutstanding && daysPastDue <= 0 ? -daysPastDue : null,
    };
}

// ─── อ่านรายการ ───────────────────────────────────────────────────────────────────────────────

const LIST_TABS = {
    all: "1 = 1",
    draft: "e.ex_status = 'draft'",
    pending_approval: "e.ex_status = 'pending_approval'",
    waiting_me: "e.ex_status = 'pending_approval'",
    unpaid: "e.ex_status = 'approved' AND e.ex_paid_amount < e.ex_total",
    overdue: "e.ex_status = 'approved' AND e.ex_paid_amount < e.ex_total AND e.ex_due_date < ?",
    paid: "e.ex_status = 'approved' AND e.ex_paid_amount >= e.ex_total",
    cancelled: "e.ex_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ kind?: string, scope?: string, tab?: string, search?: string, vendorId?: string, projectId?: string, limit?: number, offset?: number }} options
 *   scope (ใบเบิก): "mine" = ของฉัน (ค่าเริ่มต้น) · "all" = ทุกคน (ต้องมีสิทธิ์ดู/อนุมัติค่าใช้จ่าย/ทำจ่าย)
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function listExpenses(
    conn,
    { kind = "bill", scope = "mine", tab = "all", search = "", vendorId, projectId, limit = 20, offset = 0 },
    actor,
) {
    const today = todayBangkok();
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const tabCondition = LIST_TABS[tab] ?? LIST_TABS.all;

    const conditions = ["e.ex_kind = ?", tabCondition];
    const params = [kind === "claim" ? "claim" : "bill"];
    if (tabCondition.includes("?")) params.push(today);
    if (kind === "claim" && scope === "all" && !canViewAllClaims(actor)) {
        throw new AppError(403, "FORBIDDEN", "ดูใบเบิกของทุกคนได้เฉพาะผู้มีสิทธิ์ดู/อนุมัติค่าใช้จ่ายหรือทำจ่าย");
    }
    if (kind === "claim" && scope !== "all") {
        conditions.push("e.ex_employee_id = ?");
        params.push(actor.user_id);
    }
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            "(e.ex_number LIKE ? OR e.ex_title LIKE ? OR e.ex_vendor_doc_no LIKE ? OR v.vd_name LIKE ? OR e.ex_merchant_name LIKE ? OR CONCAT(emp.user_fname, ' ', emp.user_lname) LIKE ?)",
        );
        params.push(like, like, like, like, like, like);
    }
    if (vendorId) {
        conditions.push("e.ex_vendor_id = ?");
        params.push(vendorId);
    }
    if (projectId) {
        conditions.push(
            "EXISTS (SELECT 1 FROM tb_expense_lines l WHERE l.exl_expense_id = e.ex_id AND l.exl_project_id = ?)",
        );
        params.push(projectId);
    }

    const [rows] = await conn.query(
        `SELECT e.ex_id, e.ex_number, e.ex_kind, e.ex_status, e.ex_title, e.ex_vendor_id, v.vd_name, e.ex_vendor_doc_no,
                e.ex_doc_type, e.ex_currency, e.ex_subtotal, e.ex_vat_amount, e.ex_total, e.ex_total_thb, e.ex_paid_amount,
                e.ex_wht_amount, e.ex_created_by, e.ex_created_by_name, e.ex_auto_approved, e.ex_approval_current_level,
                e.ex_approval_plan, e.ex_approval_round, e.ex_returned_reason, e.ex_updated_at,
                e.ex_employee_id, e.ex_merchant_name, CONCAT(emp.user_fname, ' ', emp.user_lname) AS employee_name,
                (SELECT COUNT(*) FROM tb_expense_attachments f WHERE f.exf_expense_id = e.ex_id) AS attachment_count,
                ${DATE_COLUMNS}
         FROM tb_expenses e
         LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
         LEFT JOIN tb_users emp ON emp.user_id = e.ex_employee_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY e.ex_updated_at DESC, e.ex_id DESC`,
        params,
    );

    const company = await companyService.findCompany(conn);
    const pendingIds = rows.filter((row) => row.ex_status === "pending_approval").map((row) => row.ex_id);
    const approvals = await approvalsOfRound(conn, pendingIds);
    const withFlags = rows.map((row) => {
        const waitingForMe =
            row.ex_status === "pending_approval" &&
            evaluateFor(row, approvals.get(row.ex_id) ?? [], actor, company.cs_allow_self_approval).canApprove;
        const plan = quotationService.parseJson(row.ex_approval_plan) ?? [];
        const { ex_approval_plan: _plan, ...rest } = row;
        return {
            ...rest,
            attachment_count: Number(row.attachment_count),
            ex_auto_approved: row.ex_auto_approved === 1,
            ...dueStatus(row, today),
            payment_state: paymentStateOf(row),
            waiting_for_me: waitingForMe,
            approval_level_count: plan.length,
        };
    });

    const filtered = tab === "waiting_me" ? withFlags.filter((row) => row.waiting_for_me) : withFlags;
    return { data: filtered.slice(safeOffset, safeOffset + safeLimit), total: filtered.length };
}

// ─── ตัวเลือกโปรเจกต์ของบรรทัด ─────────────────────────────────────────────────────────────────

/**
 * โปรเจกต์ที่ผูกค่าใช้จ่ายได้ (ช่องค้นหาในฟอร์ม) — ผู้บันทึกค่าใช้จ่ายอาจไม่ได้เป็นสมาชิกโปรเจกต์ จึงคืนแค่ชื่อ/ลูกค้า/สถานะ
 * ไม่รวมโปรเจกต์ที่ยกเลิก (ของเดิมที่ผูกไว้แล้วหน้าเว็บแสดงจากรายละเอียดบรรทัด)
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} search
 */
async function listProjectOptions(conn, search = "") {
    const like = `%${search}%`;
    const [rows] = await conn.query(
        `SELECT p.project_id, p.project_name, p.project_status, c.client_name
         FROM tb_projects p LEFT JOIN tb_clients c ON c.client_id = p.client_id
         WHERE p.project_status <> 'cancelled' AND (p.project_name LIKE ? OR c.client_name LIKE ?)
         ORDER BY p.project_status = 'completed', p.project_name
         LIMIT 20`,
        [like, like],
    );
    return rows;
}

// ─── อ่านใบเดียว ─────────────────────────────────────────────────────────────────────────────

/**
 * บิลที่อาจซ้ำ (ไม่บล็อก — แสดงเตือน): ไม่มีเลขเอกสาร แต่ผู้ขาย + วันที่ + ยอดรวม ตรงกับรายการอื่นที่ไม่ยกเลิก (R-P2)
 */
async function findPossibleDuplicates(conn, expense) {
    if (expense.ex_kind !== "bill" || expense.ex_vendor_doc_no || expense.ex_status === "cancelled") return [];
    const [rows] = await conn.query(
        `SELECT ex_id, ex_number, ex_status, ex_title FROM tb_expenses
         WHERE ex_vendor_id = ? AND ex_expense_date = ? AND ex_total = ? AND ex_status <> 'cancelled' AND ex_id <> ?
         ORDER BY ex_created_at LIMIT 5`,
        [expense.ex_vendor_id, expense.ex_expense_date, expense.ex_total, expense.ex_id],
    );
    return rows;
}

/**
 * รายการค่าใช้จ่ายพร้อมทุกอย่างที่หน้าเอกสารต้องใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} expenseId
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function getExpenseDetail(conn, expenseId, actor, kind = "bill") {
    const today = todayBangkok();
    const [[expense]] = await conn.query(
        `SELECT e.*, ${DATE_COLUMNS},
                v.vd_name, v.vd_code, v.vd_type, v.vd_country, v.vd_tax_id, v.vd_branch_code, v.vd_status,
                b.branch_code, b.branch_name_th, b.branch_status, t.wit_name_th AS wht_income_type_name,
                CONCAT(c.user_fname, ' ', c.user_lname) AS cancelled_by_name,
                CONCAT(emp.user_fname, ' ', emp.user_lname) AS employee_name
         FROM tb_expenses e
         LEFT JOIN tb_vendors v ON v.vd_id = e.ex_vendor_id
         JOIN tb_branches b ON b.branch_id = e.ex_branch_id
         LEFT JOIN tb_wht_income_types t ON t.wit_code = e.ex_wht_income_type
         LEFT JOIN tb_users c ON c.user_id = e.ex_cancelled_by
         LEFT JOIN tb_users emp ON emp.user_id = e.ex_employee_id
         WHERE e.ex_id = ?`,
        [expenseId],
    );
    if (!expense) throw notFound();
    assertCanSee(expense, actor, kind);

    const [lines] = await conn.query(
        `SELECT l.*, c.ec_name_th AS category_name, c.ec_is_asset, p.project_name
         FROM tb_expense_lines l
         JOIN tb_expense_categories c ON c.ec_id = l.exl_category_id
         LEFT JOIN tb_projects p ON p.project_id = l.exl_project_id
         WHERE l.exl_expense_id = ? ORDER BY l.exl_order, l.exl_id`,
        [expenseId],
    );
    const [attachments] = await conn.query(
        `SELECT f.exf_id, f.exf_file_name, f.exf_file_size, f.exf_uploaded_at, CONCAT(u.user_fname, ' ', u.user_lname) AS uploaded_by_name
         FROM tb_expense_attachments f LEFT JOIN tb_users u ON u.user_id = f.exf_uploaded_by
         WHERE f.exf_expense_id = ? ORDER BY f.exf_id`,
        [expenseId],
    );
    const [approvalHistory] = await conn.query(
        "SELECT * FROM tb_expense_approvals WHERE expa_expense_id = ? ORDER BY expa_id",
        [expenseId],
    );

    const currency = await quotationService.findCurrency(conn, expense.ex_currency);
    const company = await companyService.findCompany(conn);
    const approvalsThisRound = approvalHistory
        .filter((row) => row.expa_round === expense.ex_approval_round && row.expa_action === "approve")
        .map((row) => ({ level: row.expa_level, user_id: row.expa_user_id }));
    const approval =
        expense.ex_status === "pending_approval"
            ? evaluateFor(expense, approvalsThisRound, actor, company.cs_allow_self_approval)
            : null;

    // ข้อความช่วยตรวจ (ไม่บล็อก): VAT ต่างจากที่ระบบคิด · ยอดต่ำกว่าเกณฑ์หัก ณ ที่จ่าย
    const documentDate = expense.ex_vendor_doc_date ?? expense.ex_expense_date;
    const officialVatRate = (await companyService.findVatRateOn(conn, documentDate)) ?? "0.00";
    const whtRate = expense.ex_wht_income_type
        ? await purchasingSetupService.whtRateOn(conn, expense.ex_wht_income_type, expense.ex_expense_date)
        : null;
    const check = calculateExpense({
        lines,
        vatAmount: expense.ex_vat_amount,
        vatRate: officialVatRate,
        whtRate: whtRate?.rate ?? null,
        whtMinPayment: whtRate?.minPayment ?? null,
        exchangeRate: expense.ex_exchange_rate,
        currencyDecimals: currency?.cur_decimals ?? 2,
    });

    return {
        expense: {
            ...expense,
            ex_approval_plan: quotationService.parseJson(expense.ex_approval_plan) ?? [],
            ex_vat_claimable: expense.ex_vat_claimable === 1,
            ex_auto_approved: expense.ex_auto_approved === 1,
            wht_form: expense.vd_country ? whtFormOf(expense) : null,
            ...dueStatus(expense, today),
            payment_state: paymentStateOf(expense),
        },
        currency,
        lines: lines.map((line) => ({
            ...line,
            exl_category_id: Number(line.exl_category_id),
            ec_is_asset: line.ec_is_asset === 1,
        })),
        attachments,
        approval_history: approvalHistory,
        approval,
        checks: {
            official_vat_rate: officialVatRate,
            suggested_vat: toDecimalText(check.suggestedVat),
            is_vat_different: check.isVatDifferent,
            wht_min_payment: whtRate?.minPayment ?? null,
            is_below_wht_minimum: check.isBelowWithholdingMinimum,
            net_payable: toDecimalText(
                parseHundredths(expense.ex_total, "ยอดรวม") - parseHundredths(expense.ex_wht_amount, "หัก ณ ที่จ่าย"),
            ),
        },
        possible_duplicates: await findPossibleDuplicates(conn, expense),
        // ใบสำคัญจ่ายที่ตัดรายการนี้ (ขั้น 2-4) — เจ้าของใบเบิกเห็นว่าได้เงินคืนแล้วหรือยัง
        payments: await paymentService.findPaymentsOfExpense(conn, expenseId),
        actions: buildActions(expense, actor, approval, attachments.length),
        readiness: expense.ex_status === "draft" ? buildReadiness(expense, lines, currency, attachments.length) : [],
        today,
    };
}

/**
 * ปุ่มที่ผู้ใช้คนนี้กดได้ตอนนี้ + เหตุผลถ้ากดไม่ได้ (หน้าเว็บซ่อนปุ่มและแสดงเหตุผลในแถบสถานะ — ห้าม tooltip)
 * ยกเลิก: ผู้มีสิทธิ์อนุมัติค่าใช้จ่าย · หรือผู้บันทึก (บิล = สิทธิ์บันทึก · ใบเบิก = เจ้าของ) เมื่อรายการผ่านอัตโนมัติเพราะยอดต่ำกว่าวงเงิน
 */
function buildActions(expense, actor, approval, attachmentCount) {
    const canCreate = canWorkAsCreator(expense, actor);
    const canApprove = hasBit(actor.role_permission, "approveExpense");
    const status = expense.ex_status;
    const hasPayment = parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว") > 0n;

    const currentLevel = (quotationService.parseJson(expense.ex_approval_plan) ?? []).find(
        (level) => level.level === expense.ex_approval_current_level,
    );
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));
    const hasCancelPermission = canApprove || (canCreate && expense.ex_auto_approved === 1);
    const cancelBlockedReason =
        status === "approved" && hasPayment
            ? "รายการนี้จ่ายเงินแล้ว · ยกเลิกใบสำคัญจ่ายก่อน แล้วค่อยยกเลิกรายการนี้"
            : null;

    return {
        can_edit: canCreate && status === "draft",
        can_delete: canCreate && status === "draft",
        can_submit: canCreate && status === "draft",
        can_approve: Boolean(approval?.canApprove),
        can_return: status === "pending_approval" && canApprove && isInCurrentLevel,
        can_cancel: hasCancelPermission && status === "approved" && cancelBlockedReason === null,
        cancel_blocked_reason: hasCancelPermission ? cancelBlockedReason : null,
        can_copy: canCreate && expense.ex_kind === "bill",
        can_attach: canCreate && status !== "cancelled" && attachmentCount < MAX_EXPENSE_ATTACHMENTS,
        can_remove_attachment: canCreate && status === "draft",
        // ทำจ่าย (ขั้น 2-4 — สิทธิ์ของใบสำคัญจ่าย P3 แยกจากผู้อนุมัติ)
        can_pay:
            hasBit(actor.role_permission, "makePayment") &&
            status === "approved" &&
            parseHundredths(expense.ex_paid_amount, "ยอดจ่ายแล้ว") < parseHundredths(expense.ex_total, "ยอดรวม"),
    };
}

/**
 * รายการตรวจก่อนส่ง — ข้อที่ไม่ผ่านบอกวิธีแก้
 * ใบเบิก: ต้องแนบรูปใบเสร็จอย่างน้อย 1 ไฟล์ ยกเว้นใบรับรองแทนใบเสร็จ (คำถาม X4) · ไม่มีผู้ขาย/สกุลเงินต่างประเทศ
 */
function buildReadiness(expense, lines, currency, attachmentCount) {
    if (expense.ex_kind === "claim") {
        return [
            { key: "lines", ok: lines.length > 0, message: "มีรายการอย่างน้อย 1 บรรทัด" },
            { key: "total", ok: parseHundredths(expense.ex_total, "ยอดรวม") > 0n, message: "ยอดรวมมากกว่า 0" },
            { key: "branch", ok: expense.branch_status === "active", message: "สาขายังเปิดใช้งานอยู่" },
            {
                key: "attachment",
                ok: expense.ex_doc_type === "substitute_receipt" || attachmentCount > 0,
                message: "แนบรูปใบเสร็จอย่างน้อย 1 ไฟล์ (ใบรับรองแทนใบเสร็จไม่ต้องแนบ)",
            },
        ];
    }
    const isForeign = expense.ex_currency !== BASE_CURRENCY;
    const needsNumber = DOC_TYPES_WITH_NUMBER.includes(expense.ex_doc_type);
    return [
        { key: "lines", ok: lines.length > 0, message: "มีรายการอย่างน้อย 1 บรรทัด" },
        { key: "total", ok: parseHundredths(expense.ex_total, "ยอดรวม") > 0n, message: "ยอดรวมมากกว่า 0" },
        { key: "vendor", ok: expense.vd_status === "active", message: "ผู้ขายยังเปิดใช้งานอยู่" },
        { key: "branch", ok: expense.branch_status === "active", message: "สาขายังเปิดใช้งานอยู่" },
        { key: "currency", ok: currency?.cur_status === "active", message: "สกุลเงินยังเปิดใช้งานอยู่" },
        {
            key: "rate",
            ok: !isForeign || Boolean(expense.ex_rate_source),
            message: "มีอัตราแลกเปลี่ยน (ธปท. หรือกรอกเองพร้อมเหตุผล)",
        },
        {
            key: "vendor_doc",
            ok: !needsNumber || (Boolean(expense.ex_vendor_doc_no) && Boolean(expense.ex_vendor_doc_date)),
            message: "มีเลขที่และวันที่ของเอกสารผู้ขาย (ใบรับรองแทนใบเสร็จ/ไม่มีเอกสาร ไม่ต้องมี)",
        },
    ];
}

module.exports = {
    createBillDraft,
    createClaimDraft,
    updateDraft,
    deleteDraft,
    addAttachment,
    removeAttachment,
    findAttachment,
    listExpenses,
    listProjectOptions,
    getExpenseDetail,
    // ใช้ต่อใน expense-workflow.service.js
    findForUpdate,
    findLines,
    assertVersion,
    wrongStatus,
    notFound,
    evaluateFor,
    buildReadiness,
    findDuplicateBill,
    findDuplicateClaim,
    describeDuplicate,
    assertCanSee,
    assertCanWork,
    canWorkAsCreator,
    DOCUMENT_TYPE_BY_KIND,
};
