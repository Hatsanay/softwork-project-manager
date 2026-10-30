// ใบเสนอราคา: อ่าน + ร่าง (2026-10-13 ขั้น 1A-3 — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 2, 4, 4.1)
//
// - ยอดเงินคำนวณใหม่ที่นี่ทุกครั้งที่บันทึก (shared/quotation-totals.mjs) ไม่เชื่อยอดจากหน้าเว็บ
// - ร่างแก้ได้ทุกช่อง · กันแก้ทับกันด้วย qt_version (R4) · การเปลี่ยนสถานะอยู่ที่ quotation-workflow.service.js
// - วันที่ (DATE) ส่งออกเป็นข้อความ "YYYY-MM-DD" เสมอ
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../utils/permissions");
const { calculateQuotation, toDecimalText } = require("../shared/quotation-totals.mjs");
const { parseHundredths } = require("../shared/money.mjs");
const { evaluateApproval } = require("../shared/approval-flow.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const companyService = require("./company.service");
const { DOCUMENT_RATE_TYPE } = require("./exchange-rate.service");

const MAX_LIST_LIMIT = 200;
const EDITABLE_STATUS = "draft";
const REVISABLE_STATUSES = ["approved", "sent", "expired", "declined"];
const CANCELLABLE_STATUSES = ["pending_approval", "approved", "sent", "expired", "declined"];
const OPEN_STATUSES = ["draft", "pending_approval"];
const RATE_COLUMN = {
    buying_sight: "er_buying_sight",
    buying_transfer: "er_buying_transfer",
    selling: "er_selling",
    mid_rate: "er_mid_rate",
}[DOCUMENT_RATE_TYPE];

// ชื่องวดของใบเสนอราคาที่เก็บเงินครั้งเดียว (ตามภาษาเอกสาร) — ตรงกับที่ deploy_schema.sql เติมให้ใบเก่า
const FULL_PAYMENT_NAME = { th: "ชำระเต็มจำนวน", en: "Full payment" };

const DATE_COLUMNS = `
    DATE_FORMAT(q.qt_issue_date, '%Y-%m-%d') AS qt_issue_date,
    DATE_FORMAT(q.qt_valid_until, '%Y-%m-%d') AS qt_valid_until,
    DATE_FORMAT(q.qt_rate_date, '%Y-%m-%d') AS qt_rate_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "QUOTATION_NOT_FOUND", "ไม่พบใบเสนอราคานี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "QUOTATION_WRONG_STATUS", `${message} · กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล (R4/R5) — ไม่ส่งมา = ไม่ตรวจ (ใช้กับการกระทำที่ไม่บังคับ)
 * @param {{ qt_version: number }} quotation
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(quotation, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (quotation.qt_version !== expectedVersion) {
        throw new AppError(
            409,
            "QUOTATION_CHANGED",
            "มีคนแก้หรือเปลี่ยนสถานะใบนี้ไปก่อนแล้ว · โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

// ─── ข้อมูลอ้างอิง ────────────────────────────────────────────────────────────────────────────

async function findCurrency(conn, currencyCode) {
    const [[currency]] = await conn.query(
        `SELECT cur_code, cur_name_th, cur_name_en, cur_symbol, cur_decimals, cur_unit_th, cur_subunit_th, cur_unit_en,
                cur_subunit_en, cur_status
         FROM tb_currencies WHERE cur_code = ?`,
        [currencyCode],
    );
    return currency ?? null;
}

/**
 * อัตรา VAT ที่ใบนี้ใช้ ณ วันที่ระบุ — 0 ถ้ายังไม่จด VAT ณ วันนั้น หรือเลือก VAT 0%
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {string} dateText
 * @param {"standard" | "zero"} vatTreatment
 * @returns {Promise<string>} เช่น "7.00"
 */
async function vatRateFor(conn, dateText, vatTreatment) {
    const company = await companyService.findCompany(conn);
    const isRegistered = company.cs_vat_registered_from !== null && company.cs_vat_registered_from <= dateText;
    if (!isRegistered || vatTreatment === "zero") return "0.00";
    return (await companyService.findVatRateOn(conn, dateText)) ?? "0.00";
}

// อัตรา ธปท. ที่บันทึกไว้ของวันนั้น (ชนิดที่ใช้กับเอกสาร) — ใช้ตรวจว่าอัตราที่หน้าเว็บส่งมาเป็นของ ธปท. จริง
async function findCachedBotRate(conn, currencyCode, rateDate) {
    if (!rateDate) return null;
    const [[row]] = await conn.query(
        `SELECT ${RATE_COLUMN} AS rate FROM tb_exchange_rates WHERE er_currency = ? AND er_rate_date = ?`,
        [currencyCode, rateDate],
    );
    return row?.rate ?? null;
}

// "35.1234000000" กับ "35.1234" เป็นค่าเดียวกัน — เทียบเป็นข้อความหลังตัดศูนย์ท้าย ไม่ผ่าน float
function normalizeDecimal(text) {
    const [whole, fraction = ""] = String(text).trim().split(".");
    const trimmedFraction = fraction.replace(/0+$/, "");
    const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
    return trimmedFraction ? `${trimmedWhole}.${trimmedFraction}` : trimmedWhole;
}

function sameDecimal(first, second) {
    if (first === null || second === null) return false;
    return normalizeDecimal(first) === normalizeDecimal(second);
}

/**
 * ตรวจอัตราแลกเปลี่ยนของร่าง — "ธปท." ต้องตรงกับที่ระบบดึงมาจริง (กันส่งตัวเลขเองแต่ติดป้าย ธปท.)
 * @returns {Promise<string | null>} qt_rate_bot ที่จะเก็บ (อัตรา ธปท. ของวันนั้น ถ้ามี)
 */
async function resolveRate(conn, draft) {
    if (draft.qt_currency === BASE_CURRENCY) return null;
    const botRate = await findCachedBotRate(conn, draft.qt_currency, draft.qt_rate_date);
    if (draft.qt_rate_source === "bot" && !sameDecimal(botRate, draft.qt_exchange_rate)) {
        throw new AppError(400, "VALIDATION", "อัตรานี้ไม่ตรงกับอัตรา ธปท. ที่ระบบดึงไว้", {
            qt_exchange_rate: "อัตราไม่ตรงกับของ ธปท. · กดดึงอัตราใหม่ หรือเลือกกรอกเองพร้อมเหตุผล",
        });
    }
    return botRate;
}

/**
 * ลูกค้า/สาขา/สกุลเงิน/โปรเจกต์/สินค้า ต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน (ของเดิมที่ถูกปิดภายหลังคงไว้ได้ แต่ส่งขออนุมัติไม่ได้ — R9)
 * @param {object | null} existing แถวเดิม (แก้ร่าง) หรือ null (สร้างใหม่)
 */
async function assertReferences(conn, draft, existing) {
    const fields = {};
    const isChanged = (column) => !existing || existing[column] !== draft[column];

    const [[client]] = await conn.query("SELECT client_status FROM tb_clients WHERE client_id = ?", [
        draft.qt_client_id,
    ]);
    if (!client) fields.qt_client_id = "ไม่พบลูกค้านี้ อาจถูกลบไปแล้ว";
    else if (client.client_status !== "active" && isChanged("qt_client_id"))
        fields.qt_client_id = "ลูกค้านี้ถูกปิดใช้งานแล้ว";
    if (existing && existing.qt_revision > 0 && isChanged("qt_client_id")) {
        fields.qt_client_id = 'revision ต้องเป็นลูกค้าเดิม · ถ้าจะเสนอลูกค้ารายอื่นให้ใช้ "คัดลอกเป็นใบใหม่"';
    }

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        draft.qt_branch_id,
    ]);
    if (!branch) fields.qt_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active" && isChanged("qt_branch_id"))
        fields.qt_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    const currency = await findCurrency(conn, draft.qt_currency);
    if (!currency) fields.qt_currency = "ไม่พบสกุลเงินนี้";
    else if (currency.cur_status !== "active" && isChanged("qt_currency"))
        fields.qt_currency = "สกุลเงินนี้ถูกปิดใช้งานแล้ว";

    if (draft.qt_project_id) {
        const [[project]] = await conn.query("SELECT 1 FROM tb_projects WHERE project_id = ?", [draft.qt_project_id]);
        if (!project) fields.qt_project_id = "ไม่พบโปรเจกต์นี้ อาจถูกลบไปแล้ว";
    }

    const productIds = [...new Set(draft.items.map((item) => item.qti_product_id).filter(Boolean))];
    if (productIds.length > 0) {
        const [rows] = await conn.query("SELECT product_id FROM tb_products WHERE product_id IN (?)", [productIds]);
        const existingIds = new Set(rows.map((row) => row.product_id));
        draft.items.forEach((item, index) => {
            if (item.qti_product_id && !existingIds.has(item.qti_product_id)) {
                fields[`items.${index}.qti_product_id`] = "สินค้านี้ถูกลบไปแล้ว · ลบแถวนี้หรือเลือกใหม่";
            }
        });
    }

    if (Object.keys(fields).length > 0) {
        throw new AppError(400, "VALIDATION", "ข้อมูลอ้างอิงบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
    }
    return currency;
}

// ชุดรายการถูกลบได้เสมอ — แถวที่อ้างชุดที่ไม่มีแล้วแค่ไม่รู้ว่ามาจากชุดไหน (ไม่ใช่ error)
async function dropMissingPackages(conn, items) {
    const packageIds = [...new Set(items.map((item) => item.qti_package_id).filter(Boolean))];
    if (packageIds.length === 0) return items;
    const [rows] = await conn.query("SELECT pkg_id FROM tb_product_packages WHERE pkg_id IN (?)", [packageIds]);
    const existingIds = new Set(rows.map((row) => row.pkg_id));
    return items.map((item) =>
        item.qti_package_id && !existingIds.has(item.qti_package_id) ? { ...item, qti_package_id: null } : item,
    );
}

/**
 * คำนวณยอดทั้งใบ — ค่าที่ผิด (เช่น ส่วนลดเกินยอด) ตอบ 400 พร้อมช่องที่ผิด
 * @param {object} draft
 * @param {{ cur_decimals: number }} currency
 * @param {string} vatRate
 */
function calculateOrThrow(draft, currency, vatRate) {
    const calculation = calculateQuotation({
        items: draft.items,
        discountType: draft.qt_discount_type,
        discountValue: draft.qt_discount_value,
        vatRate,
        currencyDecimals: currency.cur_decimals,
        exchangeRate: draft.qt_exchange_rate,
        paymentMode: draft.qt_payment_mode,
        milestones: draft.milestones,
    });
    if (Object.keys(calculation.errors).length > 0) {
        throw new AppError(400, "VALIDATION", "ตัวเลขบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", calculation.errors);
    }
    return calculation;
}

function headerValues(draft, calculation, vatRate, rateBot) {
    return {
        qt_client_id: draft.qt_client_id,
        qt_branch_id: draft.qt_branch_id,
        qt_project_id: draft.qt_project_id,
        qt_title: draft.qt_title,
        qt_language: draft.qt_language,
        qt_currency: draft.qt_currency,
        qt_exchange_rate: draft.qt_exchange_rate,
        qt_rate_source: draft.qt_rate_source,
        qt_rate_date: draft.qt_rate_date,
        qt_rate_bot: rateBot,
        qt_rate_override_reason: draft.qt_rate_source === "manual" ? draft.qt_rate_override_reason : null,
        qt_vat_treatment: draft.qt_vat_treatment,
        qt_valid_days: draft.qt_valid_days,
        qt_payment_mode: draft.qt_payment_mode,
        qt_subtotal: toDecimalText(calculation.subtotal),
        qt_discount_type: draft.qt_discount_type,
        qt_discount_value: draft.qt_discount_value,
        qt_discount_amount: toDecimalText(calculation.discount),
        qt_after_discount: toDecimalText(calculation.afterDiscount),
        qt_vat_rate: vatRate,
        qt_vat_amount: toDecimalText(calculation.vat),
        qt_total: toDecimalText(calculation.total),
        qt_after_discount_thb: toDecimalText(calculation.afterDiscountThb),
        qt_total_thb: toDecimalText(calculation.totalThb),
        qt_terms: draft.qt_terms,
        qt_internal_note: draft.qt_internal_note,
    };
}

/**
 * เขียนรายการและงวดใหม่ทั้งชุด (ลบของเดิมก่อน) — อยู่ใน transaction เดียวกับหัวเอกสาร
 */
async function replaceChildren(conn, quotationId, draft, calculation) {
    await conn.query("DELETE FROM tb_quotation_items WHERE qti_quotation_id = ?", [quotationId]);
    await conn.query("DELETE FROM tb_quotation_milestones WHERE qtm_quotation_id = ?", [quotationId]);

    for (const [index, item] of draft.items.entries()) {
        const line = calculation.lines[index];
        const isItemRow = item.qti_type === "item";
        await conn.query(
            `INSERT INTO tb_quotation_items
                (qti_quotation_id, qti_order, qti_type, qti_product_id, qti_package_id, qti_description, qti_quantity, qti_unit,
                 qti_unit_price, qti_list_price, qti_discount_type, qti_discount_value, qti_discount_amount, qti_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                quotationId,
                index + 1,
                item.qti_type,
                item.qti_product_id,
                item.qti_package_id,
                item.qti_description,
                item.qti_quantity,
                item.qti_unit,
                item.qti_unit_price,
                item.qti_list_price,
                item.qti_discount_type,
                item.qti_discount_value,
                isItemRow ? toDecimalText(line.discount) : "0.00",
                isItemRow ? toDecimalText(line.amount) : "0.00",
            ],
        );
    }

    // เก็บเงินครั้งเดียว = งวดเดียว 100% เต็มยอด — ใบเสนอราคาทุกใบมีงวดอย่างน้อย 1 แถวเสมอ ใบแจ้งหนี้ (1B) อ้างงวดได้เหมือนกันทุกกรณี
    if (draft.qt_payment_mode === "single") {
        await conn.query(
            `INSERT INTO tb_quotation_milestones (qtm_quotation_id, qtm_order, qtm_name, qtm_condition, qtm_percent, qtm_amount)
             VALUES (?, 1, ?, NULL, 100, ?)`,
            [quotationId, FULL_PAYMENT_NAME[draft.qt_language] ?? FULL_PAYMENT_NAME.th, toDecimalText(calculation.total)],
        );
        return;
    }

    for (const [index, milestone] of draft.milestones.entries()) {
        // งวดที่ผลรวมยังไม่ตรง (ร่าง) เก็บยอดตามที่กรอก/คิดจาก % แบบยังไม่เกลี่ยเศษ — ส่งขออนุมัติจะบังคับให้ตรง
        const amount = calculation.milestoneAmounts[index] ?? null;
        await conn.query(
            `INSERT INTO tb_quotation_milestones (qtm_quotation_id, qtm_order, qtm_name, qtm_condition, qtm_percent, qtm_amount)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                quotationId,
                index + 1,
                milestone.qtm_name,
                milestone.qtm_condition,
                milestone.qtm_percent,
                amount !== null ? toDecimalText(amount) : (milestone.qtm_amount ?? "0.00"),
            ],
        );
    }
}

async function findForUpdate(conn, quotationId) {
    const [[quotation]] = await conn.query("SELECT * FROM tb_quotations WHERE qt_id = ? FOR UPDATE", [quotationId]);
    if (!quotation) throw notFound();
    return quotation;
}

// ─── ร่าง ────────────────────────────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน quotationDraftSchema แล้ว
 * @param {{ user_id: string }} actor
 */
async function createDraft(conn, draft, actor) {
    const currency = await assertReferences(conn, draft, null);
    const rateBot = await resolveRate(conn, draft);
    const items = await dropMissingPackages(conn, draft.items);
    const preparedDraft = { ...draft, items };
    const vatRate = await vatRateFor(conn, todayBangkok(), draft.qt_vat_treatment);
    const calculation = calculateOrThrow(preparedDraft, currency, vatRate);

    const quotationId = await generateDailyId("tb_quotations", "qt_id", "QUO");
    const values = headerValues(preparedDraft, calculation, vatRate, rateBot);
    const columns = Object.keys(values);
    await conn.query(
        `INSERT INTO tb_quotations (qt_id, qt_root_id, qt_status, qt_version, qt_created_by, ${columns.join(", ")})
         VALUES (?, ?, 'draft', 0, ?, ${columns.map(() => "?").join(", ")})`,
        [quotationId, quotationId, actor.user_id, ...Object.values(values)],
    );
    await replaceChildren(conn, quotationId, preparedDraft, calculation);
    return { qt_id: quotationId };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} quotationId
 * @param {object} draft ผ่าน quotationDraftSchema แล้ว (ต้องมี qt_version)
 */
async function updateDraft(conn, quotationId, draft) {
    const existing = await findForUpdate(conn, quotationId);
    if (existing.qt_status !== EDITABLE_STATUS) throw wrongStatus("ใบนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้");
    if (draft.qt_version === null || draft.qt_version === undefined) {
        throw new AppError(400, "VALIDATION", "หน้าเว็บเป็นเวอร์ชันเก่า กรุณารีเฟรชแล้วลองใหม่", {
            qt_version: "ไม่มีเวอร์ชัน",
        });
    }
    assertVersion(existing, draft.qt_version);

    const currency = await assertReferences(conn, draft, existing);
    const rateBot = await resolveRate(conn, draft);
    const items = await dropMissingPackages(conn, draft.items);
    const preparedDraft = { ...draft, items };
    const vatRate = await vatRateFor(conn, todayBangkok(), draft.qt_vat_treatment);
    const calculation = calculateOrThrow(preparedDraft, currency, vatRate);

    const values = headerValues(preparedDraft, calculation, vatRate, rateBot);
    await conn.query(
        `UPDATE tb_quotations SET ${Object.keys(values)
            .map((column) => `${column} = ?`)
            .join(", ")}, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [...Object.values(values), quotationId],
    );
    await replaceChildren(conn, quotationId, preparedDraft, calculation);
    return { qt_id: quotationId };
}

/**
 * ลบร่างจริง (รายการ/งวด/ประวัติอนุมัติตามไปด้วย) · ร่าง revision ลบได้ เลขยังอยู่กับฉบับก่อน
 */
async function deleteDraft(conn, quotationId, expectedVersion) {
    const existing = await findForUpdate(conn, quotationId);
    if (existing.qt_status !== EDITABLE_STATUS) {
        throw wrongStatus('ลบได้เฉพาะร่าง · ใบที่ส่งขออนุมัติแล้วให้ใช้ "ยกเลิก" แทน');
    }
    assertVersion(existing, expectedVersion);
    await conn.query("DELETE FROM tb_quotations WHERE qt_id = ?", [quotationId]);
}

// ─── หมดอายุ (R11) ─────────────────────────────────────────────────────────────────────────────

/**
 * ใบที่เลยวันยืนราคาเปลี่ยนเป็น expired — UPDATE แบบมีเงื่อนไขครั้งเดียว ทำซ้ำได้ผลเท่าเดิม (สองคำขอพร้อมกันไม่ชนกัน)
 * เรียกก่อนอ่านรายการ/รายละเอียดทุกครั้ง
 */
async function expireOverdue(conn) {
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'expired', qt_expired_at = NOW(), qt_version = qt_version + 1
         WHERE qt_status IN ('approved', 'sent') AND qt_valid_until < ?`,
        [todayBangkok()],
    );
}

// ─── สิทธิ์ของผู้ใช้ที่ดูอยู่ ───────────────────────────────────────────────────────────────────────

function parseJson(value) {
    if (value === null || value === undefined) return null;
    return typeof value === "string" ? JSON.parse(value) : value;
}

/**
 * ผู้ใช้กดอนุมัติใบนี้ได้ไหม (ใช้ทั้งหน้าเอกสาร ป้าย "รอคุณอนุมัติ" และตอนกดจริง)
 */
function evaluateFor(quotation, approvalsThisRound, actor, allowSelfApproval) {
    return evaluateApproval({
        plan: parseJson(quotation.qt_approval_plan) ?? [],
        currentLevel: quotation.qt_approval_current_level,
        approvalsThisRound,
        actor: {
            user_id: actor.user_id,
            role_id: actor.user_role_id,
            can_approve: hasBit(actor.role_permission, "approveQuotation"),
        },
        creatorId: quotation.qt_created_by,
        allowSelfApproval,
    });
}

// ─── อ่านรายการ ───────────────────────────────────────────────────────────────────────────────

const LIST_TABS = {
    all: "q.qt_status <> 'superseded'",
    draft: "q.qt_status = 'draft'",
    pending_approval: "q.qt_status = 'pending_approval'",
    waiting_me: "q.qt_status = 'pending_approval'",
    approved: "q.qt_status = 'approved'",
    sent: "q.qt_status = 'sent'",
    accepted: "q.qt_status = 'accepted'",
    declined: "q.qt_status = 'declined'",
    expired: "q.qt_status = 'expired'",
    cancelled: "q.qt_status = 'cancelled'",
    superseded: "q.qt_status = 'superseded'",
};

async function approvalsOfRound(conn, quotationIds) {
    if (quotationIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT a.qta_quotation_id, a.qta_level, a.qta_user_id
         FROM tb_quotation_approvals a JOIN tb_quotations q ON q.qt_id = a.qta_quotation_id
         WHERE a.qta_quotation_id IN (?) AND a.qta_round = q.qt_approval_round AND a.qta_action = 'approve'`,
        [quotationIds],
    );
    const byQuotation = new Map();
    for (const row of rows) {
        const list = byQuotation.get(row.qta_quotation_id) ?? [];
        list.push({ level: row.qta_level, user_id: row.qta_user_id });
        byQuotation.set(row.qta_quotation_id, list);
    }
    return byQuotation;
}

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, branchId?: string, currency?: string, limit?: number, offset?: number }} options
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function listQuotations(conn, { tab = "all", search = "", branchId, currency, limit = 20, offset = 0 }, actor) {
    await expireOverdue(conn);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const like = `%${search}%`;

    const conditions = [LIST_TABS[tab] ?? LIST_TABS.all];
    const params = [];
    if (search) {
        conditions.push("(q.qt_number LIKE ? OR q.qt_title LIKE ? OR c.client_name LIKE ? OR c.client_company LIKE ?)");
        params.push(like, like, like, like);
    }
    if (branchId) {
        conditions.push("q.qt_branch_id = ?");
        params.push(branchId);
    }
    if (currency) {
        conditions.push("q.qt_currency = ?");
        params.push(String(currency).toUpperCase());
    }
    const where = conditions.join(" AND ");

    const [rows] = await conn.query(
        `SELECT q.qt_id, q.qt_number, q.qt_revision, q.qt_status, q.qt_title, q.qt_currency, q.qt_total, q.qt_total_thb,
                q.qt_after_discount_thb, q.qt_client_id, c.client_name, c.client_company, q.qt_branch_id, b.branch_name_th,
                q.qt_created_by, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name,
                q.qt_approval_current_level, q.qt_approval_plan, q.qt_approval_round, q.qt_updated_at, ${DATE_COLUMNS}
         FROM tb_quotations q
         JOIN tb_clients c ON c.client_id = q.qt_client_id
         JOIN tb_branches b ON b.branch_id = q.qt_branch_id
         LEFT JOIN tb_users u ON u.user_id = q.qt_created_by
         WHERE ${where}
         ORDER BY q.qt_updated_at DESC, q.qt_id DESC`,
        params,
    );

    const company = await companyService.findCompany(conn);
    const pendingIds = rows.filter((row) => row.qt_status === "pending_approval").map((row) => row.qt_id);
    const approvals = await approvalsOfRound(conn, pendingIds);
    const withFlags = rows.map((row) => {
        const isPending = row.qt_status === "pending_approval";
        const waitingForMe =
            isPending &&
            evaluateFor(row, approvals.get(row.qt_id) ?? [], actor, company.cs_allow_self_approval).canApprove;
        const plan = parseJson(row.qt_approval_plan) ?? [];
        const { qt_approval_plan: _plan, ...rest } = row;
        return { ...rest, waiting_for_me: waitingForMe, approval_level_count: plan.length };
    });

    const filtered = tab === "waiting_me" ? withFlags.filter((row) => row.waiting_for_me) : withFlags;
    return { data: filtered.slice(safeOffset, safeOffset + safeLimit), total: filtered.length };
}

// ─── อ่านใบเดียว ─────────────────────────────────────────────────────────────────────────────

/**
 * ใบเสนอราคาพร้อมทุกอย่างที่หน้าเอกสารต้องใช้: รายการ งวด ประวัติอนุมัติ ฉบับทั้งสาย สิ่งที่ผู้ใช้คนนี้ทำได้ และรายการตรวจก่อนส่ง
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} quotationId
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function getQuotationDetail(conn, quotationId, actor) {
    await expireOverdue(conn);
    const [[quotation]] = await conn.query(
        `SELECT q.*, ${DATE_COLUMNS},
                c.client_name, c.client_company, c.client_status, b.branch_code, b.branch_name_th, b.branch_status,
                p.project_name, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_current_name
         FROM tb_quotations q
         JOIN tb_clients c ON c.client_id = q.qt_client_id
         JOIN tb_branches b ON b.branch_id = q.qt_branch_id
         LEFT JOIN tb_projects p ON p.project_id = q.qt_project_id
         LEFT JOIN tb_users u ON u.user_id = q.qt_created_by
         WHERE q.qt_id = ?`,
        [quotationId],
    );
    if (!quotation) throw notFound();

    const [items] = await conn.query(
        `SELECT i.*, pr.product_name, pr.product_code, pr.product_price, pr.product_status
         FROM tb_quotation_items i LEFT JOIN tb_products pr ON pr.product_id = i.qti_product_id
         WHERE i.qti_quotation_id = ? ORDER BY i.qti_order, i.qti_id`,
        [quotationId],
    );
    const [milestones] = await conn.query(
        "SELECT * FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order, qtm_id",
        [quotationId],
    );
    const [approvalHistory] = await conn.query(
        "SELECT * FROM tb_quotation_approvals WHERE qta_quotation_id = ? ORDER BY qta_id",
        [quotationId],
    );
    const [chain] = await conn.query(
        `SELECT qt_id, qt_number, qt_revision, qt_status, DATE_FORMAT(qt_issue_date, '%Y-%m-%d') AS qt_issue_date, qt_total
         FROM tb_quotations WHERE qt_root_id = ? ORDER BY qt_revision`,
        [quotation.qt_root_id],
    );
    let copiedFrom = null;
    if (quotation.qt_copied_from_id) {
        const [[source]] = await conn.query(
            "SELECT qt_id, qt_number, qt_revision, qt_title FROM tb_quotations WHERE qt_id = ?",
            [quotation.qt_copied_from_id],
        );
        copiedFrom = source ?? null;
    }

    const currency = await findCurrency(conn, quotation.qt_currency);
    const company = await companyService.findCompany(conn);
    const approvalsThisRound = approvalHistory
        .filter((row) => row.qta_round === quotation.qt_approval_round && row.qta_action === "approve")
        .map((row) => ({ level: row.qta_level, user_id: row.qta_user_id }));

    const plan = parseJson(quotation.qt_approval_plan) ?? [];
    const approval =
        quotation.qt_status === "pending_approval"
            ? evaluateFor(quotation, approvalsThisRound, actor, company.cs_allow_self_approval)
            : null;
    const fastworkSource = await fastworkSourceOf(conn, quotation);
    const actions = await buildActions(conn, quotation, chain, actor, approval, fastworkSource);
    const readiness = quotation.qt_status === "draft" ? buildReadiness(quotation, items, milestones, currency) : [];

    return {
        quotation: {
            ...quotation,
            qt_approval_plan: plan,
            qt_client_snapshot: parseJson(quotation.qt_client_snapshot),
            qt_company_snapshot: parseJson(quotation.qt_company_snapshot),
        },
        currency,
        items,
        milestones,
        approval_history: approvalHistory,
        approvals_this_round: approvalsThisRound,
        chain,
        copied_from: copiedFrom,
        approval,
        actions,
        readiness,
        fastwork_internal: fastworkSource,
    };
}

/**
 * ปุ่มที่ผู้ใช้คนนี้กดได้ตอนนี้ + เหตุผลถ้ากดไม่ได้ (หน้าเว็บซ่อนปุ่มและแสดงเหตุผลในแถบสถานะ — ห้าม tooltip)
 */
/**
 * ใบเสนอราคาภายในของงาน Fastwork (S-5): ออกจากคำขอของลิงก์ Fastwork (ทุก revision) หรือผูกโปรเจกต์ช่องทาง Fastwork
 * ไม่เก็บธงซ้ำ อ่านจากที่มา · ส่งลูกค้า/บันทึกตอบรับ/ออกใบแจ้งหนี้ไม่ได้ (ราคาและเงินอยู่บน Fastwork)
 * @returns {Promise<{ request_id: string | null } | null>}
 */
async function fastworkSourceOf(conn, quotation) {
    const [[request]] = await conn.query(
        `SELECT r.svr_id FROM tb_service_requests r
         JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         JOIN tb_quotations q ON q.qt_id = r.svr_quotation_id
         WHERE l.ol_kind = 'fastwork' AND q.qt_root_id = ? LIMIT 1`,
        [quotation.qt_root_id],
    );
    if (request) return { request_id: request.svr_id };
    if (!quotation.qt_project_id) return null;
    const [[project]] = await conn.query("SELECT project_channel FROM tb_projects WHERE project_id = ?", [quotation.qt_project_id]);
    return project?.project_channel === "fastwork" ? { request_id: null } : null;
}

function fastworkInternalError() {
    return new AppError(409, "QUOTATION_FASTWORK_INTERNAL", "ใบนี้เป็นเอกสารภายในของงาน Fastwork · ส่งราคาและรับเงินบน Fastwork แล้วรับงานจากหน้าคำขอบริการ");
}

async function buildActions(conn, quotation, chain, actor, approval, fastworkSource = null) {
    const canCreate = hasBit(actor.role_permission, "createQuotation");
    const canCancelPermission = hasBit(actor.role_permission, "cancelQuotation");
    const status = quotation.qt_status;
    const hasOpenRevision = chain.some((row) => OPEN_STATUSES.includes(row.qt_status) && row.qt_id !== quotation.qt_id);

    const currentLevel = (parseJson(quotation.qt_approval_plan) ?? []).find(
        (level) => level.level === quotation.qt_approval_current_level,
    );
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));

    let reviseBlockedReason = null;
    if (status === "accepted")
        reviseBlockedReason = 'ใบที่ลูกค้าตอบรับแล้วออก revision ไม่ได้ · ใช้ "คัดลอกเป็นใบใหม่" สำหรับงานเพิ่ม';
    else if (hasOpenRevision) reviseBlockedReason = "มี revision ที่ยังเป็นร่างหรือรออนุมัติอยู่แล้ว · แก้ฉบับนั้นต่อ";

    return {
        can_edit: canCreate && status === "draft",
        can_delete: canCreate && status === "draft",
        can_submit: canCreate && status === "draft",
        can_approve: Boolean(approval?.canApprove),
        can_return:
            status === "pending_approval" && hasBit(actor.role_permission, "approveQuotation") && isInCurrentLevel,
        can_send: canCreate && status === "approved" && !fastworkSource,
        can_decline: canCreate && ["approved", "sent"].includes(status),
        can_accept: canCreate && ["approved", "sent"].includes(status) && !fastworkSource,
        can_revise: canCreate && REVISABLE_STATUSES.includes(status) && !hasOpenRevision,
        revise_blocked_reason:
            canCreate && (REVISABLE_STATUSES.includes(status) || status === "accepted") ? reviseBlockedReason : null,
        can_copy: canCreate,
        can_cancel: canCancelPermission && CANCELLABLE_STATUSES.includes(status),
    };
}

/**
 * รายการตรวจก่อนส่งขออนุมัติ (ReadinessChecklist) — ข้อที่ไม่ผ่านบอกวิธีแก้
 */
function buildReadiness(quotation, items, milestones, currency) {
    const pricedItems = items.filter((item) => item.qti_type === "item");
    const isForeign = quotation.qt_currency !== BASE_CURRENCY;
    const milestoneTotal = milestones.reduce(
        (sum, milestone) => sum + parseHundredths(milestone.qtm_amount, "งวด"),
        0n,
    );
    const milestonesMatch =
        quotation.qt_payment_mode !== "milestones" ||
        (milestones.length > 0 && milestoneTotal === parseHundredths(quotation.qt_total, "ยอดรวม"));

    return [
        { key: "items", ok: pricedItems.length > 0, message: "มีแถวรายการที่มีราคาอย่างน้อย 1 แถว" },
        { key: "total", ok: parseHundredths(quotation.qt_total, "ยอดรวม") > 0n, message: "ยอดรวมทั้งสิ้นมากกว่า 0" },
        { key: "client", ok: quotation.client_status === "active", message: "ลูกค้ายังเปิดใช้งานอยู่" },
        { key: "branch", ok: quotation.branch_status === "active", message: "สาขายังเปิดใช้งานอยู่" },
        { key: "currency", ok: currency?.cur_status === "active", message: "สกุลเงินยังเปิดใช้งานอยู่" },
        {
            key: "rate",
            ok: !isForeign || Boolean(quotation.qt_rate_source),
            message: "มีอัตราแลกเปลี่ยน (ธปท. หรือกรอกเองพร้อมเหตุผล)",
        },
        { key: "milestones", ok: milestonesMatch, message: "ผลรวมงวดชำระเท่ายอดรวมทั้งสิ้นพอดี" },
    ];
}

module.exports = {
    fastworkSourceOf,
    fastworkInternalError,
    createDraft,
    updateDraft,
    deleteDraft,
    listQuotations,
    getQuotationDetail,
    expireOverdue,
    // ใช้ต่อใน quotation-workflow.service.js
    findForUpdate,
    findCurrency,
    vatRateFor,
    findCachedBotRate,
    sameDecimal,
    assertVersion,
    wrongStatus,
    notFound,
    parseJson,
    evaluateFor,
    replaceChildren,
    calculateOrThrow,
    REVISABLE_STATUSES,
    CANCELLABLE_STATUSES,
    OPEN_STATUSES,
};
