// ใบแจ้งหนี้: อ่าน + ร่าง (2026-10-14 ขั้น 1B-2 — docs/plans/2026-10-14-invoices-1b.md หัวข้อ 4)
//
// - ใบจากงวดของใบเสนอราคา: ยอด/รายการ/ลูกค้า/สกุลเงินมาจากใบเสนอราคาเสมอ (shared/invoice-totals.mjs) แก้ได้แค่ข้อมูลประกอบ
// - ใบสร้างเอง: แก้ได้ทุกช่อง คำนวณด้วยสูตรเดียวกับใบเสนอราคา (shared/quotation-totals.mjs)
// - ยอดคำนวณใหม่ทุกครั้งที่บันทึก ไม่เชื่อยอดจากหน้าเว็บ · กันแก้ทับกันด้วย inv_version · เปลี่ยนสถานะอยู่ที่ invoice-workflow.service.js
// - งวดหนึ่งอยู่ในใบแจ้งหนี้ที่ไม่ยกเลิกได้ใบเดียว (รวมร่าง) — ตรวจหลังล็อกแถวใบเสนอราคา (R-B1)
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { hasBit } = require("../utils/permissions");
const { calculateQuotation, toDecimalText } = require("../shared/quotation-totals.mjs");
const { calculateMilestoneInvoice, calculateWithholding } = require("../shared/invoice-totals.mjs");
const { divideRoundHalfUp, parseHundredths } = require("../shared/money.mjs");
const { evaluateApproval } = require("../shared/approval-flow.mjs");
const { buildPromptPayPayload, normalizePromptPayId } = require("../shared/promptpay.mjs");
const { invoiceBalance } = require("../shared/credit-note-totals.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const companyService = require("./company.service");
const quotationService = require("./quotation.service");

const MAX_LIST_LIMIT = 200;
const DOCUMENT_NAME = "ใบแจ้งหนี้";
// ข้อความบรรทัดงวดบนใบแจ้งหนี้ ตามภาษาเอกสาร
const MILESTONE_LINE = {
    th: ({ order, name, percent, quotationNumber }) =>
        `งวดที่ ${order} ${name}${percent ? ` (${percent}%)` : ""} ตามใบเสนอราคาเลขที่ ${quotationNumber}`,
    en: ({ order, name, percent, quotationNumber }) =>
        `Installment ${order}: ${name}${percent ? ` (${percent}%)` : ""} per quotation no. ${quotationNumber}`,
};

const DATE_COLUMNS = `
    DATE_FORMAT(i.inv_issue_date, '%Y-%m-%d') AS inv_issue_date,
    DATE_FORMAT(i.inv_due_date, '%Y-%m-%d') AS inv_due_date,
    DATE_FORMAT(i.inv_rate_date, '%Y-%m-%d') AS inv_rate_date`;

// ─── ข้อผิดพลาดที่ใช้บ่อย ───────────────────────────────────────────────────────────────────────

function notFound() {
    return new AppError(404, "INVOICE_NOT_FOUND", "ไม่พบใบแจ้งหนี้นี้ อาจถูกลบไปแล้ว กรุณาโหลดหน้าใหม่");
}

function wrongStatus(message) {
    return new AppError(409, "INVOICE_WRONG_STATUS", `${message} — กรุณาโหลดหน้าใหม่เพื่อดูสถานะล่าสุด`);
}

/**
 * เวอร์ชันที่หน้าเว็บส่งมาต้องตรงกับในฐานข้อมูล — ไม่ส่งมา = ไม่ตรวจ
 * @param {{ inv_version: number }} invoice
 * @param {number | null | undefined} expectedVersion
 */
function assertVersion(invoice, expectedVersion) {
    if (expectedVersion === null || expectedVersion === undefined) return;
    if (invoice.inv_version !== expectedVersion) {
        throw new AppError(
            409,
            "INVOICE_CHANGED",
            "มีคนแก้หรือเปลี่ยนสถานะใบนี้ไปก่อนแล้ว — โหลดหน้าใหม่เพื่อดูข้อมูลล่าสุด (สิ่งที่คุณแก้ยังไม่ถูกบันทึก)",
        );
    }
}

function validationError(fields) {
    return new AppError(400, "VALIDATION", "ข้อมูลบางอย่างใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง", fields);
}

async function findForUpdate(conn, invoiceId) {
    const [[invoice]] = await conn.query("SELECT * FROM tb_invoices WHERE inv_id = ? FOR UPDATE", [invoiceId]);
    if (!invoice) throw notFound();
    return invoice;
}

// ─── ข้อมูลอ้างอิง ────────────────────────────────────────────────────────────────────────────

/** บัญชีหลักที่เปิดใช้งานของสกุลเงินนั้น (ค่าเริ่มต้นของบัญชีรับเงินบนใบ) */
async function findDefaultBankAccountId(conn, currencyCode) {
    const [[account]] = await conn.query(
        "SELECT ba_id FROM tb_bank_accounts WHERE ba_currency = ? AND ba_status = 'active' AND ba_is_default = 1 LIMIT 1",
        [currencyCode],
    );
    return account?.ba_id ?? null;
}

/**
 * สาขา/บัญชีรับเงินที่เลือก ต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน · บัญชีต้องรับสกุลเดียวกับใบ (R-B6)
 * @returns {Promise<Record<string, string>>} ช่องที่ผิด (ว่าง = ผ่าน)
 */
async function checkBranchAndBank(conn, values, existing, currencyCode) {
    const fields = {};
    const isChanged = (column) => !existing || existing[column] !== values[column];

    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        values.inv_branch_id,
    ]);
    if (!branch) fields.inv_branch_id = "ไม่พบสาขานี้";
    else if (branch.branch_status !== "active" && isChanged("inv_branch_id"))
        fields.inv_branch_id = "สาขานี้ถูกปิดใช้งานแล้ว";

    if (values.inv_bank_account_id) {
        const [[account]] = await conn.query("SELECT ba_currency, ba_status FROM tb_bank_accounts WHERE ba_id = ?", [
            values.inv_bank_account_id,
        ]);
        if (!account) fields.inv_bank_account_id = "ไม่พบบัญชีนี้";
        else if (account.ba_currency !== currencyCode)
            fields.inv_bank_account_id = `บัญชีนี้รับเงินสกุล ${account.ba_currency} — เลือกบัญชีที่รับ ${currencyCode}`;
        else if (account.ba_status !== "active" && isChanged("inv_bank_account_id"))
            fields.inv_bank_account_id = "บัญชีนี้ถูกปิดใช้งานแล้ว";
    }
    return fields;
}

// ─── งวดของใบเสนอราคา ────────────────────────────────────────────────────────────────────────

async function findMilestones(conn, quotationId) {
    const [rows] = await conn.query(
        "SELECT * FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order, qtm_id",
        [quotationId],
    );
    return rows;
}

/**
 * งวดที่อยู่ในใบแจ้งหนี้ที่ยังไม่ยกเลิก (รวมร่างและรออนุมัติ) → Map(qtm_id → ใบที่เรียกเก็บ)
 * @param {string | null} [excludeInvoiceId] ไม่นับใบนี้ (ตอนออกใบที่ร่างไว้เอง)
 */
async function findBilledMilestones(conn, quotationId, excludeInvoiceId = null) {
    const [rows] = await conn.query(
        `SELECT m.ivm_milestone_id, i.inv_id, i.inv_number, i.inv_status
         FROM tb_invoice_milestones m
         JOIN tb_invoices i ON i.inv_id = m.ivm_invoice_id
         JOIN tb_quotation_milestones qm ON qm.qtm_id = m.ivm_milestone_id
         WHERE qm.qtm_quotation_id = ? AND i.inv_status <> 'cancelled' AND i.inv_id <> ?`,
        [quotationId, excludeInvoiceId ?? ""],
    );
    return new Map(rows.map((row) => [Number(row.ivm_milestone_id), row]));
}

function describeBilledBy(invoice) {
    if (invoice.inv_status === "issued") return `ใบแจ้งหนี้ ${invoice.inv_number}`;
    return "ใบแจ้งหนี้ร่างที่ยังไม่ออก";
}

/**
 * ใบเสนอราคาที่จะออกบิล — ล็อกแถว (R-B1: สองคนออกงวดเดียวกันพร้อมกัน คนที่สองรอแล้วเห็นของคนแรก)
 * @returns {Promise<object>} แถวใบเสนอราคา + qt_rate_date_text
 */
async function lockBillableQuotation(conn, quotationId) {
    const [[quotation]] = await conn.query(
        `SELECT q.*, DATE_FORMAT(q.qt_rate_date, '%Y-%m-%d') AS qt_rate_date_text
         FROM tb_quotations q WHERE q.qt_id = ? FOR UPDATE`,
        [quotationId],
    );
    if (!quotation) throw quotationService.notFound();
    if (quotation.qt_status !== "accepted") {
        throw new AppError(
            409,
            "QUOTATION_NOT_ACCEPTED",
            "ออกใบแจ้งหนี้ได้เฉพาะใบเสนอราคาที่ลูกค้าตอบรับแล้ว — บันทึกว่าลูกค้าตอบรับที่หน้าใบเสนอราคาก่อน",
        );
    }
    return quotation;
}

/**
 * งวดที่เลือกต้องอยู่ในใบเสนอราคานี้ และยังไม่ถูกเรียกเก็บในใบอื่นที่ไม่ยกเลิก
 */
async function assertMilestonesAvailable(conn, quotationId, milestoneIds, excludeInvoiceId = null) {
    const milestones = await findMilestones(conn, quotationId);
    const knownIds = new Set(milestones.map((milestone) => Number(milestone.qtm_id)));
    if (milestoneIds.some((id) => !knownIds.has(Number(id)))) {
        throw validationError({ milestone_ids: "งวดที่เลือกไม่อยู่ในใบเสนอราคานี้ — โหลดหน้าใหม่แล้วเลือกอีกครั้ง" });
    }
    const billed = await findBilledMilestones(conn, quotationId, excludeInvoiceId);
    const conflicts = milestones.filter(
        (milestone) => milestoneIds.includes(Number(milestone.qtm_id)) && billed.has(Number(milestone.qtm_id)),
    );
    if (conflicts.length > 0) {
        const detail = conflicts
            .map(
                (milestone) =>
                    `งวดที่ ${milestone.qtm_order} อยู่ใน${describeBilledBy(billed.get(Number(milestone.qtm_id)))}`,
            )
            .join(" · ");
        throw new AppError(
            409,
            "MILESTONE_ALREADY_BILLED",
            `${detail} — งวดหนึ่งเรียกเก็บได้ใบเดียว ถ้าต้องออกใหม่ให้ยกเลิกหรือลบใบเดิมก่อน`,
        );
    }
    return milestones;
}

// ─── คำนวณยอด ────────────────────────────────────────────────────────────────────────────────

function toQuotationItem(item) {
    return {
        qti_type: item.invi_type,
        qti_quantity: item.invi_quantity,
        qti_unit_price: item.invi_unit_price,
        qti_list_price: item.invi_list_price,
        qti_discount_type: item.invi_discount_type,
        qti_discount_value: item.invi_discount_value,
    };
}

// error ของสูตรใบเสนอราคา ("items.2.qti_quantity", "qt_discount_value") → ชื่อช่องของใบแจ้งหนี้
function toInvoiceErrors(errors) {
    return Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [
            field.replace(".qti_", ".invi_").replace(/^qt_/, "inv_"),
            message,
        ]),
    );
}

/**
 * ยอดของใบที่แก้รายการเองได้ (ใบสร้างเอง และใบจากใบเสนอราคาแบบเก็บครั้งเดียวที่คัดลอกรายการเต็ม)
 * @returns {object} รูปเดียวกับ calculateFromMilestones
 */
function calculateFromItems({ items, discountType, discountValue, vatRate, currencyDecimals, exchangeRate, whtRate }) {
    const calculation = calculateQuotation({
        items: items.map(toQuotationItem),
        discountType,
        discountValue,
        vatRate,
        currencyDecimals,
        exchangeRate,
        paymentMode: "single",
        milestones: [],
    });
    if (Object.keys(calculation.errors).length > 0) {
        throw new AppError(
            400,
            "VALIDATION",
            "ตัวเลขบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง",
            toInvoiceErrors(calculation.errors),
        );
    }
    const withholding = calculateWithholding(calculation.afterDiscount, whtRate, currencyDecimals);
    return {
        lines: items.map((item, index) => ({
            ...item,
            invi_discount_amount: item.invi_type === "item" ? calculation.lines[index].discount : 0n,
            invi_amount: item.invi_type === "item" ? calculation.lines[index].amount : 0n,
        })),
        discountType,
        discountValue,
        subtotal: calculation.subtotal,
        discount: calculation.discount,
        afterDiscount: calculation.afterDiscount,
        vat: calculation.vat,
        total: calculation.total,
        afterDiscountThb: calculation.afterDiscountThb,
        totalThb: calculation.totalThb,
        withholding,
        netPayable: calculation.total - withholding,
    };
}

/**
 * ยอดของใบจากงวดของใบเสนอราคา — คิด VAT ด้วยอัตราที่ระบุ (วันนี้) · vatChanged = ต่างจากใบเสนอราคา (R-B4)
 * @param {object} quotation แถวใบเสนอราคา
 * @param {object[]} milestones ทุกงวดของใบเสนอราคา
 * @param {number[]} milestoneIds งวดที่เรียกเก็บในใบนี้
 * @param {{ vatRate: string, exchangeRate: string, whtRate: string | null, currencyDecimals: number }} options
 */
async function calculateForQuotation(conn, quotation, milestones, milestoneIds, options) {
    const { vatRate, exchangeRate, whtRate, currencyDecimals } = options;
    const isSinglePayment = quotation.qt_payment_mode === "single";
    const vatChanged = parseHundredths(vatRate, "VAT") !== parseHundredths(quotation.qt_vat_rate, "VAT");

    // เก็บครั้งเดียว: คัดลอกรายการเต็มของใบเสนอราคา (ผู้ใช้เลือก I2) — ยอดเท่าใบเสนอราคาเมื่อ VAT เท่าเดิม
    if (isSinglePayment) {
        const [quotationItems] = await conn.query(
            "SELECT * FROM tb_quotation_items WHERE qti_quotation_id = ? ORDER BY qti_order, qti_id",
            [quotation.qt_id],
        );
        const items = quotationItems.map((item) => ({
            invi_type: item.qti_type,
            invi_product_id: item.qti_product_id,
            invi_description: item.qti_description,
            invi_quantity: item.qti_quantity,
            invi_unit: item.qti_unit,
            invi_unit_price: item.qti_unit_price,
            invi_list_price: item.qti_list_price,
            invi_discount_type: item.qti_discount_type,
            invi_discount_value: item.qti_discount_value,
        }));
        const calculation = calculateFromItems({
            items,
            discountType: quotation.qt_discount_type,
            discountValue: quotation.qt_discount_value,
            vatRate,
            currencyDecimals,
            exchangeRate,
            whtRate,
        });
        const fullMilestone = milestones[0];
        return {
            ...calculation,
            vatChanged,
            agreedTotal: parseHundredths(quotation.qt_total, "ยอดรวม"),
            links: [
                {
                    milestoneId: Number(fullMilestone.qtm_id),
                    amount: parseHundredths(quotation.qt_total, "ยอดรวม"),
                    base: parseHundredths(quotation.qt_after_discount, "ยอดก่อน VAT"),
                    vat: parseHundredths(quotation.qt_vat_amount, "VAT"),
                },
            ],
        };
    }

    const result = calculateMilestoneInvoice({
        quotation: {
            afterDiscount: parseHundredths(quotation.qt_after_discount, "ยอดก่อน VAT"),
            total: parseHundredths(quotation.qt_total, "ยอดรวม"),
            vatRate: quotation.qt_vat_rate,
        },
        milestones: milestones.map((milestone) => ({
            id: Number(milestone.qtm_id),
            amount: parseHundredths(milestone.qtm_amount, "ยอดงวด"),
        })),
        selectedIds: milestoneIds,
        vatRate,
        currencyDecimals,
        exchangeRate,
        whtRate,
    });
    const milestoneById = new Map(milestones.map((milestone) => [Number(milestone.qtm_id), milestone]));
    const describe = MILESTONE_LINE[quotation.qt_language] ?? MILESTONE_LINE.th;
    const lines = result.lines.map((line) => {
        const milestone = milestoneById.get(Number(line.milestoneId));
        return {
            invi_type: "item",
            invi_product_id: null,
            invi_description: describe({
                order: milestone.qtm_order,
                name: milestone.qtm_name,
                percent: milestone.qtm_percent ? normalizePercent(milestone.qtm_percent) : null,
                quotationNumber: quotation.qt_number,
            }),
            invi_quantity: "1.00",
            invi_unit: null,
            invi_unit_price: toDecimalText(line.base),
            invi_list_price: null,
            invi_discount_type: "amount",
            invi_discount_value: "0.00",
            invi_discount_amount: 0n,
            invi_amount: line.base,
        };
    });
    return {
        lines,
        discountType: "amount",
        discountValue: "0.00",
        subtotal: result.subtotal,
        discount: 0n,
        afterDiscount: result.afterDiscount,
        vat: result.vat,
        total: result.total,
        afterDiscountThb: result.afterDiscountThb,
        totalThb: result.totalThb,
        withholding: result.withholding,
        netPayable: result.netPayable,
        vatChanged,
        agreedTotal: result.agreedTotal,
        links: result.lines.map((line) => ({
            milestoneId: Number(line.milestoneId),
            amount: line.amount,
            base: line.base,
            vat: line.vat,
        })),
    };
}

// "30.00" → "30" · "33.33" → "33.33" (ข้อความบนเอกสาร)
function normalizePercent(text) {
    return String(text).replace(/\.?0+$/, "");
}

// ─── บันทึก ───────────────────────────────────────────────────────────────────────────────────

function totalsValues(calculation, vatRate) {
    return {
        inv_subtotal: toDecimalText(calculation.subtotal),
        inv_discount_type: calculation.discountType,
        inv_discount_value: calculation.discountValue,
        inv_discount_amount: toDecimalText(calculation.discount),
        inv_after_discount: toDecimalText(calculation.afterDiscount),
        inv_vat_rate: vatRate,
        inv_vat_amount: toDecimalText(calculation.vat),
        inv_total: toDecimalText(calculation.total),
        inv_after_discount_thb: toDecimalText(calculation.afterDiscountThb),
        inv_total_thb: toDecimalText(calculation.totalThb),
        inv_wht_amount: toDecimalText(calculation.withholding),
    };
}

/**
 * เขียนรายการ + งวดที่ผูกใหม่ทั้งชุด (ลบของเดิมก่อน) — อยู่ใน transaction เดียวกับหัวเอกสาร
 */
async function replaceChildren(conn, invoiceId, calculation) {
    await conn.query("DELETE FROM tb_invoice_items WHERE invi_invoice_id = ?", [invoiceId]);
    await conn.query("DELETE FROM tb_invoice_milestones WHERE ivm_invoice_id = ?", [invoiceId]);
    for (const [index, line] of calculation.lines.entries()) {
        await conn.query(
            `INSERT INTO tb_invoice_items
                (invi_invoice_id, invi_order, invi_type, invi_product_id, invi_description, invi_quantity, invi_unit,
                 invi_unit_price, invi_list_price, invi_discount_type, invi_discount_value, invi_discount_amount, invi_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                invoiceId,
                index + 1,
                line.invi_type,
                line.invi_product_id,
                line.invi_description,
                line.invi_quantity,
                line.invi_unit,
                line.invi_unit_price,
                line.invi_list_price,
                line.invi_discount_type,
                line.invi_discount_value,
                toDecimalText(line.invi_discount_amount),
                toDecimalText(line.invi_amount),
            ],
        );
    }
    for (const link of calculation.links ?? []) {
        await conn.query(
            `INSERT INTO tb_invoice_milestones (ivm_invoice_id, ivm_milestone_id, ivm_amount, ivm_base, ivm_vat)
             VALUES (?, ?, ?, ?, ?)`,
            [
                invoiceId,
                link.milestoneId,
                toDecimalText(link.amount),
                toDecimalText(link.base),
                toDecimalText(link.vat),
            ],
        );
    }
}

async function insertInvoice(conn, invoiceId, values) {
    const columns = Object.keys(values);
    await conn.query(
        `INSERT INTO tb_invoices (inv_id, ${columns.join(", ")}) VALUES (?, ${columns.map(() => "?").join(", ")})`,
        [invoiceId, ...Object.values(values)],
    );
}

async function updateInvoice(conn, invoiceId, values) {
    await conn.query(
        `UPDATE tb_invoices SET ${Object.keys(values)
            .map((column) => `${column} = ?`)
            .join(", ")}, inv_version = inv_version + 1
         WHERE inv_id = ?`,
        [...Object.values(values), invoiceId],
    );
}

/** ค่าเริ่มต้นของร่างใหม่จากลูกค้า → ตั้งค่าบริษัท (เครดิต หัก ณ ที่จ่าย หมายเหตุตามภาษา บัญชีรับเงิน) */
async function draftDefaults(conn, clientId, currencyCode, language) {
    const [[client]] = await conn.query(
        "SELECT client_credit_days, client_wht_rate, client_status FROM tb_clients WHERE client_id = ?",
        [clientId],
    );
    const company = await companyService.findCompany(conn);
    return {
        client,
        inv_credit_days: client?.client_credit_days ?? company.cs_default_credit_days,
        inv_wht_rate: client?.client_wht_rate ?? null,
        inv_notes: language === "en" ? company.cs_invoice_notes_en : company.cs_invoice_notes_th,
        inv_bank_account_id: await findDefaultBankAccountId(conn, currencyCode),
    };
}

// ─── ร่างจากงวดของใบเสนอราคา ───────────────────────────────────────────────────────────────

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {{ quotation_id: string, milestone_ids: number[] }} input ผ่าน invoiceFromQuotationSchema แล้ว
 * @param {{ user_id: string }} actor
 * @param {{ carryOver?: object, reissuedFromId?: string }} [options] ใช้ตอน "ออกใหม่แทน"
 */
async function createFromQuotation(conn, input, actor, options = {}) {
    const quotation = await lockBillableQuotation(conn, input.quotation_id);
    const milestoneIds = [...new Set(input.milestone_ids.map(Number))];
    const milestones = await assertMilestonesAvailable(conn, quotation.qt_id, milestoneIds);
    if (quotation.qt_payment_mode === "single" && milestones.length !== 1) {
        throw new AppError(
            409,
            "QUOTATION_MILESTONES_INVALID",
            "ใบเสนอราคาแบบเก็บครั้งเดียวต้องมีงวดเดียว — แจ้งผู้ดูแลระบบ",
        );
    }

    const currency = await quotationService.findCurrency(conn, quotation.qt_currency);
    const defaults = await draftDefaults(conn, quotation.qt_client_id, quotation.qt_currency, quotation.qt_language);
    const editable = {
        inv_title: quotation.qt_title,
        inv_branch_id: quotation.qt_branch_id,
        inv_credit_days: defaults.inv_credit_days,
        inv_wht_rate: defaults.inv_wht_rate,
        inv_notes: defaults.inv_notes,
        inv_internal_note: null,
        inv_bank_account_id: defaults.inv_bank_account_id,
        ...options.carryOver,
    };
    const vatRate = await quotationService.vatRateFor(conn, todayBangkok(), quotation.qt_vat_treatment);
    const calculation = await calculateForQuotation(conn, quotation, milestones, milestoneIds, {
        vatRate,
        exchangeRate: quotation.qt_exchange_rate,
        whtRate: editable.inv_wht_rate,
        currencyDecimals: currency.cur_decimals,
    });

    const invoiceId = await generateDailyId("tb_invoices", "inv_id", "INV");
    await insertInvoice(conn, invoiceId, {
        inv_status: "draft",
        inv_version: 0,
        inv_source: "quotation",
        inv_quotation_id: quotation.qt_id,
        inv_project_id: quotation.qt_project_id,
        inv_client_id: quotation.qt_client_id,
        inv_reissued_from_id: options.reissuedFromId ?? null,
        inv_language: quotation.qt_language,
        inv_currency: quotation.qt_currency,
        inv_exchange_rate: quotation.qt_exchange_rate,
        inv_rate_source: quotation.qt_rate_source,
        inv_rate_date: quotation.qt_rate_date_text,
        inv_rate_bot: quotation.qt_rate_bot,
        inv_rate_override_reason: quotation.qt_rate_override_reason,
        inv_vat_treatment: quotation.qt_vat_treatment,
        inv_created_by: actor.user_id,
        ...editable,
        ...totalsValues(calculation, vatRate),
    });
    await replaceChildren(conn, invoiceId, calculation);
    return { inv_id: invoiceId };
}

// ─── ร่างที่สร้างเอง ──────────────────────────────────────────────────────────────────────────

/**
 * ลูกค้า/สกุลเงิน/โปรเจกต์/สินค้า/สาขา/บัญชี ต้องมีอยู่จริง · ที่เลือกใหม่ต้องเปิดใช้งาน
 */
async function assertManualReferences(conn, draft, existing) {
    const isChanged = (column) => !existing || existing[column] !== draft[column];
    const fields = await checkBranchAndBank(conn, draft, existing, draft.inv_currency);

    const [[client]] = await conn.query("SELECT client_status FROM tb_clients WHERE client_id = ?", [
        draft.inv_client_id,
    ]);
    if (!client) fields.inv_client_id = "ไม่พบลูกค้านี้ อาจถูกลบไปแล้ว";
    else if (client.client_status !== "active" && isChanged("inv_client_id"))
        fields.inv_client_id = "ลูกค้านี้ถูกปิดใช้งานแล้ว";

    const currency = await quotationService.findCurrency(conn, draft.inv_currency);
    if (!currency) fields.inv_currency = "ไม่พบสกุลเงินนี้";
    else if (currency.cur_status !== "active" && isChanged("inv_currency"))
        fields.inv_currency = "สกุลเงินนี้ถูกปิดใช้งานแล้ว";

    if (draft.inv_project_id) {
        const [[project]] = await conn.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [
            draft.inv_project_id,
        ]);
        if (!project) fields.inv_project_id = "ไม่พบโปรเจกต์นี้ อาจถูกลบไปแล้ว";
        else if (project.client_id && project.client_id !== draft.inv_client_id)
            fields.inv_project_id = "โปรเจกต์นี้เป็นของลูกค้ารายอื่น";
    }

    const productIds = [...new Set(draft.items.map((item) => item.invi_product_id).filter(Boolean))];
    if (productIds.length > 0) {
        const [rows] = await conn.query("SELECT product_id FROM tb_products WHERE product_id IN (?)", [productIds]);
        const existingIds = new Set(rows.map((row) => row.product_id));
        draft.items.forEach((item, index) => {
            if (item.invi_product_id && !existingIds.has(item.invi_product_id)) {
                fields[`items.${index}.invi_product_id`] = "สินค้านี้ถูกลบไปแล้ว — ลบแถวนี้หรือเลือกใหม่";
            }
        });
    }

    if (Object.keys(fields).length > 0) throw validationError(fields);
    return currency;
}

/** อัตรา "ธปท." ต้องตรงกับที่ระบบดึงไว้ของวันนั้น (กันพิมพ์ตัวเลขเองแต่ติดป้าย ธปท.) */
async function resolveManualRate(conn, draft) {
    if (draft.inv_currency === BASE_CURRENCY) return null;
    const botRate = await quotationService.findCachedBotRate(conn, draft.inv_currency, draft.inv_rate_date);
    if (draft.inv_rate_source === "bot" && !quotationService.sameDecimal(botRate, draft.inv_exchange_rate)) {
        throw validationError({
            inv_exchange_rate: "อัตราไม่ตรงกับของ ธปท. — กดดึงอัตราใหม่ หรือเลือกกรอกเองพร้อมเหตุผล",
        });
    }
    return botRate;
}

function manualHeaderValues(draft, rateBot) {
    return {
        inv_client_id: draft.inv_client_id,
        inv_branch_id: draft.inv_branch_id,
        inv_project_id: draft.inv_project_id,
        inv_title: draft.inv_title,
        inv_language: draft.inv_language,
        inv_currency: draft.inv_currency,
        inv_exchange_rate: draft.inv_exchange_rate,
        inv_rate_source: draft.inv_rate_source,
        inv_rate_date: draft.inv_rate_date,
        inv_rate_bot: rateBot,
        inv_rate_override_reason: draft.inv_rate_source === "manual" ? draft.inv_rate_override_reason : null,
        inv_vat_treatment: draft.inv_vat_treatment,
        inv_credit_days: draft.inv_credit_days,
        inv_wht_rate: draft.inv_wht_rate,
        inv_notes: draft.inv_notes,
        inv_internal_note: draft.inv_internal_note,
        inv_bank_account_id: draft.inv_bank_account_id,
    };
}

async function calculateManual(conn, draft, currency) {
    const vatRate = await quotationService.vatRateFor(conn, todayBangkok(), draft.inv_vat_treatment);
    const calculation = calculateFromItems({
        items: draft.items,
        discountType: draft.inv_discount_type,
        discountValue: draft.inv_discount_value,
        vatRate,
        currencyDecimals: currency.cur_decimals,
        exchangeRate: draft.inv_exchange_rate,
        whtRate: draft.inv_wht_rate,
    });
    return { calculation, vatRate };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน invoiceManualDraftSchema แล้ว
 * @param {{ user_id: string }} actor
 * @param {{ reissuedFromId?: string }} [options]
 */
async function createManual(conn, draft, actor, options = {}) {
    const currency = await assertManualReferences(conn, draft, null);
    const rateBot = await resolveManualRate(conn, draft);
    const { calculation, vatRate } = await calculateManual(conn, draft, currency);

    const invoiceId = await generateDailyId("tb_invoices", "inv_id", "INV");
    await insertInvoice(conn, invoiceId, {
        inv_status: "draft",
        inv_version: 0,
        inv_source: "manual",
        inv_reissued_from_id: options.reissuedFromId ?? null,
        inv_created_by: actor.user_id,
        ...manualHeaderValues(draft, rateBot),
        ...totalsValues(calculation, vatRate),
    });
    await replaceChildren(conn, invoiceId, calculation);
    return { inv_id: invoiceId };
}

// ─── ใบเพิ่มหนี้ (2026-10-18 ขั้น N-2 — docs/plans/2026-10-18-adjustments-po.md หัวข้อ 4.2) ─────────────────────
// ใบแจ้งหนี้สร้างเองชนิด "เพิ่มหนี้" ที่อ้างใบแจ้งหนี้ที่ออกแล้ว · หัวเอกสารคัดลอกจากใบเดิมทุกครั้งที่บันทึก (แก้ไม่ได้)
// ที่เหลือใช้เส้นทางเดียวกับใบสร้างเอง: อนุมัติตามกติกา IV · ได้เลข DN ตอนอนุมัติครบ · รับเงิน/วางบิล/QR/ลดหนี้ได้เหมือนใบแจ้งหนี้

/**
 * ใบแจ้งหนี้ที่ใบเพิ่มหนี้อ้างได้: ชนิดใบแจ้งหนี้ (ไม่ใช่ใบเพิ่มหนี้) ที่ออกแล้วและยังไม่ยกเลิก
 * @param {{ forUpdate?: boolean }} [options] forUpdate = ล็อกแถว (ตอนออกใบเพิ่มหนี้ — snapshot มูลค่าเดิม)
 */
async function findDebitReference(conn, referenceId, { forUpdate = false } = {}) {
    const [[reference]] = await conn.query(
        `SELECT *, DATE_FORMAT(inv_rate_date, '%Y-%m-%d') AS inv_rate_date_text
         FROM tb_invoices WHERE inv_id = ?${forUpdate ? " FOR UPDATE" : ""}`,
        [referenceId],
    );
    if (!reference) throw validationError({ inv_reference_invoice_id: "ไม่พบใบแจ้งหนี้ที่อ้างอิง อาจถูกลบไปแล้ว" });
    if (reference.inv_doc_type !== "invoice") {
        throw new AppError(
            409,
            "DEBIT_REFERENCE_INVALID",
            "ใบเพิ่มหนี้ต้องอ้างใบแจ้งหนี้เดิม (ไม่ใช่ใบเพิ่มหนี้) — เปิดใบแจ้งหนี้เดิมแล้วออกใบเพิ่มหนี้จากใบนั้น",
        );
    }
    if (reference.inv_status !== "issued") {
        throw new AppError(409, "DEBIT_REFERENCE_INVALID", "ออกใบเพิ่มหนี้ได้เฉพาะใบแจ้งหนี้ที่ออกแล้วและยังไม่ยกเลิก");
    }
    return reference;
}

/** ร่างแบบใบสร้างเองที่หัวเอกสารมาจากใบเดิม — ลูกค้า สาขา โปรเจกต์ ภาษา สกุลเงิน การคิด VAT อัตราแลกเปลี่ยน */
function debitNoteDraftFrom(reference, draft) {
    const isBaseCurrency = reference.inv_currency === BASE_CURRENCY;
    return {
        ...draft,
        inv_client_id: reference.inv_client_id,
        inv_branch_id: reference.inv_branch_id,
        inv_project_id: reference.inv_project_id,
        inv_language: reference.inv_language,
        inv_currency: reference.inv_currency,
        inv_vat_treatment: reference.inv_vat_treatment,
        inv_exchange_rate: reference.inv_exchange_rate,
        // สกุลต่างประเทศ: ร่างใช้อัตราของใบเดิม · ตอนออกระบบดึงอัตรา ธปท. ของวันที่ออกให้เอง (แบบใบสร้างเอง)
        inv_rate_source: isBaseCurrency ? null : "manual",
        inv_rate_date: isBaseCurrency ? null : reference.inv_rate_date_text,
        inv_rate_override_reason: isBaseCurrency ? null : `ใช้อัตราของใบแจ้งหนี้ ${reference.inv_number}`,
    };
}

function debitNoteValues(draft, referenceId) {
    return {
        inv_doc_type: "debit_note",
        inv_reference_invoice_id: referenceId,
        inv_adjust_reason_code: draft.inv_adjust_reason_code,
        inv_adjust_reason: draft.inv_adjust_reason,
    };
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {object} draft ผ่าน invoiceDebitNoteDraftSchema แล้ว
 * @param {{ user_id: string }} actor
 * @param {{ reissuedFromId?: string }} [options]
 */
async function createDebitNote(conn, draft, actor, options = {}) {
    const reference = await findDebitReference(conn, draft.inv_reference_invoice_id);
    const merged = debitNoteDraftFrom(reference, draft);
    const currency = await assertManualReferences(conn, merged, null);
    const rateBot = await resolveManualRate(conn, merged);
    const { calculation, vatRate } = await calculateManual(conn, merged, currency);

    const invoiceId = await generateDailyId("tb_invoices", "inv_id", "INV");
    await insertInvoice(conn, invoiceId, {
        inv_status: "draft",
        inv_version: 0,
        inv_source: "manual",
        inv_reissued_from_id: options.reissuedFromId ?? null,
        inv_created_by: actor.user_id,
        ...manualHeaderValues(merged, rateBot),
        ...debitNoteValues(draft, reference.inv_id),
        ...totalsValues(calculation, vatRate),
    });
    await replaceChildren(conn, invoiceId, calculation);
    return { inv_id: invoiceId };
}

/**
 * มูลค่าที่ถูกต้องเดิมของรายการขายนี้ (รวม VAT) = ใบเดิมหลังลดหนี้ + ใบเพิ่มหนี้ที่ออกแล้วก่อนหน้า (หลังลดหนี้)
 * หน้าพิมพ์ใบเพิ่มหนี้แสดง "มูลค่าตามใบเดิม → บวกใบนี้ → มูลค่าที่ถูกต้อง" (มาตรา 86/9)
 * @param {string} excludeId ใบเพิ่มหนี้ที่กำลังดู (ไม่นับตัวเอง)
 */
async function debitOriginalTotal(conn, referenceId, excludeId) {
    const [[row]] = await conn.query(
        `SELECT COALESCE(SUM(${effectiveTotalSql("i")}), 0) AS total
         FROM tb_invoices i
         WHERE i.inv_status = 'issued' AND (i.inv_id = ? OR (i.inv_reference_invoice_id = ? AND i.inv_id <> ?))`,
        [referenceId, referenceId, excludeId],
    );
    return parseHundredths(row.total, "มูลค่าเดิม");
}

/** ใบเพิ่มหนี้ทั้งหมดที่อ้างใบนี้ (รวมร่าง/ยกเลิก) เรียงตามเวลาออก — ร่างอยู่ท้าย */
async function listDebitNotesOf(conn, invoiceId) {
    const [rows] = await conn.query(
        `SELECT inv_id, inv_number, inv_status, inv_total, inv_adjust_reason, DATE_FORMAT(inv_issue_date, '%Y-%m-%d') AS inv_issue_date
         FROM tb_invoices
         WHERE inv_reference_invoice_id = ?
         ORDER BY inv_issued_at IS NULL, inv_issued_at, inv_created_at`,
        [invoiceId],
    );
    return rows;
}

// ─── แก้ / ลบร่าง ─────────────────────────────────────────────────────────────────────────────

/**
 * แหล่งของใบ — controller ใช้เลือกชุดตรวจข้อมูล (ใบจากงวดแก้ได้น้อยกว่าใบสร้างเอง · ใบเพิ่มหนี้แก้หัวเอกสารไม่ได้)
 * @returns {Promise<"quotation" | "manual" | "debit_note">}
 */
async function findSource(conn, invoiceId) {
    const [[invoice]] = await conn.query("SELECT inv_source, inv_doc_type FROM tb_invoices WHERE inv_id = ?", [
        invoiceId,
    ]);
    if (!invoice) throw notFound();
    return invoice.inv_doc_type === "debit_note" ? "debit_note" : invoice.inv_source;
}

function requireVersion(draft) {
    if (draft.inv_version === null || draft.inv_version === undefined) {
        throw new AppError(400, "VALIDATION", "หน้าเว็บเป็นเวอร์ชันเก่า กรุณารีเฟรชแล้วลองใหม่", {
            inv_version: "ไม่มีเวอร์ชัน",
        });
    }
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} invoiceId
 * @param {object} draft ผ่าน invoiceQuotationDraftSchema หรือ invoiceManualDraftSchema แล้ว (ตามแหล่งของใบ)
 */
async function updateDraft(conn, invoiceId, draft) {
    const existing = await findForUpdate(conn, invoiceId);
    if (existing.inv_status !== "draft") throw wrongStatus("ใบนี้ไม่ได้เป็นร่างแล้ว แก้ไขไม่ได้");
    requireVersion(draft);
    assertVersion(existing, draft.inv_version);

    if (existing.inv_doc_type === "debit_note") {
        // ใบที่อ้างอิงเปลี่ยนไม่ได้ — ใช้ของร่างเสมอ (ไม่เชื่อค่าที่ส่งมา)
        const reference = await findDebitReference(conn, existing.inv_reference_invoice_id);
        const merged = debitNoteDraftFrom(reference, draft);
        const currency = await assertManualReferences(conn, merged, existing);
        const rateBot = await resolveManualRate(conn, merged);
        const { calculation, vatRate } = await calculateManual(conn, merged, currency);
        await updateInvoice(conn, invoiceId, {
            ...manualHeaderValues(merged, rateBot),
            ...debitNoteValues(draft, reference.inv_id),
            ...totalsValues(calculation, vatRate),
        });
        await replaceChildren(conn, invoiceId, calculation);
        return { inv_id: invoiceId };
    }

    if (existing.inv_source === "manual") {
        const currency = await assertManualReferences(conn, draft, existing);
        const rateBot = await resolveManualRate(conn, draft);
        const { calculation, vatRate } = await calculateManual(conn, draft, currency);
        await updateInvoice(conn, invoiceId, {
            ...manualHeaderValues(draft, rateBot),
            ...totalsValues(calculation, vatRate),
        });
        await replaceChildren(conn, invoiceId, calculation);
        return { inv_id: invoiceId };
    }

    // ใบจากงวด: ยอดล็อกตามใบเสนอราคา — คิดใหม่เฉพาะหัก ณ ที่จ่าย (อัตราที่แสดงเปลี่ยนได้)
    const fields = await checkBranchAndBank(conn, draft, existing, existing.inv_currency);
    if (Object.keys(fields).length > 0) throw validationError(fields);
    const currency = await quotationService.findCurrency(conn, existing.inv_currency);
    const withholding = calculateWithholding(
        parseHundredths(existing.inv_after_discount, "ยอดก่อน VAT"),
        draft.inv_wht_rate,
        currency.cur_decimals,
    );
    await updateInvoice(conn, invoiceId, {
        inv_title: draft.inv_title,
        inv_branch_id: draft.inv_branch_id,
        inv_credit_days: draft.inv_credit_days,
        inv_wht_rate: draft.inv_wht_rate,
        inv_wht_amount: toDecimalText(withholding),
        inv_notes: draft.inv_notes,
        inv_internal_note: draft.inv_internal_note,
        inv_bank_account_id: draft.inv_bank_account_id,
    });
    return { inv_id: invoiceId };
}

/** ลบร่างจริง (รายการ/งวดที่ผูก/ประวัติอนุมัติตามไปด้วย) — งวดกลับมาออกบิลใหม่ได้ */
async function deleteDraft(conn, invoiceId, expectedVersion) {
    const existing = await findForUpdate(conn, invoiceId);
    if (existing.inv_status !== "draft") {
        throw wrongStatus('ลบได้เฉพาะร่าง — ใบที่ออกแล้วให้ใช้ "ยกเลิก" แทน');
    }
    assertVersion(existing, expectedVersion);
    await conn.query("DELETE FROM tb_invoices WHERE inv_id = ?", [invoiceId]);
}

// ─── สิทธิ์อนุมัติของผู้ใช้ที่ดูอยู่ (ใบสร้างเอง) ─────────────────────────────────────────────────────

function evaluateFor(invoice, approvalsThisRound, actor, allowSelfApproval) {
    return evaluateApproval({
        plan: quotationService.parseJson(invoice.inv_approval_plan) ?? [],
        currentLevel: invoice.inv_approval_current_level,
        approvalsThisRound,
        actor: {
            user_id: actor.user_id,
            role_id: actor.user_role_id,
            can_approve: hasBit(actor.role_permission, "approveInvoice"),
        },
        creatorId: invoice.inv_created_by,
        allowSelfApproval,
        documentName: DOCUMENT_NAME,
    });
}

async function approvalsOfRound(conn, invoiceIds) {
    if (invoiceIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT a.inva_invoice_id, a.inva_level, a.inva_user_id
         FROM tb_invoice_approvals a JOIN tb_invoices i ON i.inv_id = a.inva_invoice_id
         WHERE a.inva_invoice_id IN (?) AND a.inva_round = i.inv_approval_round AND a.inva_action = 'approve'`,
        [invoiceIds],
    );
    const byInvoice = new Map();
    for (const row of rows) {
        const list = byInvoice.get(row.inva_invoice_id) ?? [];
        list.push({ level: row.inva_level, user_id: row.inva_user_id });
        byInvoice.set(row.inva_invoice_id, list);
    }
    return byInvoice;
}

// ─── ยอดคงค้าง (ที่เดียวของทั้งระบบ — R-N2) ─────────────────────────────────────────────────────────

/**
 * ยอดคงค้างของใบในรูป SQL — ทุก query ที่กรอง/รวมยอดค้างต้องใช้ตัวนี้ ห้ามเขียน inv_total - inv_paid_amount เอง
 * สูตรเดียวกับ invoiceBalance ใน shared/credit-note-totals.mjs: ยอดใบ − ลดหนี้ − (รับแล้ว − คืนเงินแล้ว)
 * @param {string} alias ชื่อย่อของตาราง tb_invoices ใน query
 */
function outstandingSql(alias) {
    return `(${alias}.inv_total - ${alias}.inv_credited_amount - ${alias}.inv_paid_amount + ${alias}.inv_refunded_amount)`;
}

/** ยอดหลังลดหนี้ (ฐานของยอดบาท/หัก ณ ที่จ่ายตามสัดส่วน) ในรูป SQL */
function effectiveTotalSql(alias) {
    return `(${alias}.inv_total - ${alias}.inv_credited_amount)`;
}

/**
 * ยอดคงค้างเป็นบาทในรูป SQL = คงค้าง × ยอดบาทหลังลดหนี้ ÷ ยอดหลังลดหนี้ (อัตราของใบ) — ใช้คู่กับเงื่อนไข outstandingSql > 0 เสมอ
 * @param {string} alias
 */
function outstandingThbSql(alias) {
    return `ROUND(${outstandingSql(alias)} * (${alias}.inv_total_thb - ${alias}.inv_credited_thb) / ${effectiveTotalSql(alias)}, 2)`;
}

/** สถานะเงินของใบ (ยอดหลังลดหนี้ · รับสุทธิ · คงค้าง · ต้องคืน) จากแถวของ tb_invoices */
function balanceOf(invoice) {
    return invoiceBalance({
        total: parseHundredths(invoice.inv_total, "ยอดรวม"),
        credited: parseHundredths(invoice.inv_credited_amount ?? 0, "ลดหนี้แล้ว"),
        paid: parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว"),
        refunded: parseHundredths(invoice.inv_refunded_amount ?? 0, "คืนเงินแล้ว"),
    });
}

// ─── วันครบกำหนด ──────────────────────────────────────────────────────────────────────────────

// จำนวนวันระหว่างวันที่สองวัน ("YYYY-MM-DD") — ไม่ขึ้นกับเขตเวลาเครื่อง (R-B10)
function daysBetween(fromDate, toDate) {
    const toUtc = (text) => {
        const [year, month, day] = text.split("-").map(Number);
        return Date.UTC(year, month - 1, day);
    };
    return Math.round((toUtc(toDate) - toUtc(fromDate)) / 86_400_000);
}

/**
 * ใบที่ออกแล้วและยังรับเงินไม่ครบ: ค้างชำระ · เลยวันครบกำหนดแล้ว = เกินกำหนด (คำนวณตอนอ่าน ไม่เก็บ)
 * @returns {{ is_outstanding: boolean, is_overdue: boolean, days_overdue: number, days_until_due: number | null }}
 */
function dueStatus(invoice, today) {
    const isOutstanding = invoice.inv_status === "issued" && balanceOf(invoice).outstanding > 0n;
    if (!isOutstanding || !invoice.inv_due_date) {
        return { is_outstanding: isOutstanding, is_overdue: false, days_overdue: 0, days_until_due: null };
    }
    const daysPastDue = daysBetween(invoice.inv_due_date, today);
    return {
        is_outstanding: true,
        is_overdue: daysPastDue > 0,
        days_overdue: Math.max(daysPastDue, 0),
        days_until_due: daysPastDue > 0 ? null : -daysPastDue,
    };
}

/**
 * สถานะการชำระของใบที่ออกแล้ว (คำนวณตอนอ่าน ไม่เก็บ): ยังไม่ชำระ / ชำระบางส่วน / ชำระครบ /
 * ปิดยอดด้วยใบลดหนี้ (credited) / ลูกค้าจ่ายเกิน รอคืนเงิน (refund_due)
 * @returns {"unpaid" | "partial" | "paid" | "credited" | "refund_due" | null} null = ใบยังไม่ออกหรือยกเลิกแล้ว
 */
function paymentStateOf(invoice) {
    if (invoice.inv_status !== "issued") return null;
    return balanceOf(invoice).state;
}

function outstandingAmountOf(invoice) {
    if (invoice.inv_status !== "issued") return "0.00";
    return toDecimalText(balanceOf(invoice).outstanding);
}

// ─── อ่านรายการ ───────────────────────────────────────────────────────────────────────────────

const LIST_TABS = {
    all: "1 = 1",
    draft: "i.inv_status = 'draft'",
    pending_approval: "i.inv_status = 'pending_approval'",
    waiting_me: "i.inv_status = 'pending_approval'",
    outstanding: `i.inv_status = 'issued' AND ${outstandingSql("i")} > 0`,
    overdue: `i.inv_status = 'issued' AND ${outstandingSql("i")} > 0 AND i.inv_due_date < ?`,
    paid: `i.inv_status = 'issued' AND ${outstandingSql("i")} <= 0`,
    cancelled: "i.inv_status = 'cancelled'",
};

/**
 * @param {import("mysql2/promise").Pool} conn
 * @param {{ tab?: string, search?: string, clientId?: string, quotationId?: string, limit?: number, offset?: number }} options
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function listInvoices(conn, { tab = "all", search = "", clientId, quotationId, limit = 20, offset = 0 }, actor) {
    const today = todayBangkok();
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), MAX_LIST_LIMIT);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const tabCondition = LIST_TABS[tab] ?? LIST_TABS.all;

    const conditions = [tabCondition];
    const params = tabCondition.includes("?") ? [today] : [];
    if (search) {
        const like = `%${search}%`;
        conditions.push(
            "(i.inv_number LIKE ? OR i.inv_title LIKE ? OR c.client_name LIKE ? OR c.client_company LIKE ?)",
        );
        params.push(like, like, like, like);
    }
    if (clientId) {
        conditions.push("i.inv_client_id = ?");
        params.push(clientId);
    }
    if (quotationId) {
        conditions.push("i.inv_quotation_id = ?");
        params.push(quotationId);
    }

    const [rows] = await conn.query(
        `SELECT i.inv_id, i.inv_number, i.inv_status, i.inv_source, i.inv_doc_type, ref.inv_number AS reference_number, i.inv_title, i.inv_currency, i.inv_total, i.inv_total_thb,
                i.inv_paid_amount, i.inv_credited_amount, i.inv_refunded_amount, i.inv_wht_amount, i.inv_client_id,
                c.client_name, c.client_company,
                i.inv_quotation_id, q.qt_number, i.inv_created_by, CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_name,
                i.inv_approval_current_level, i.inv_approval_plan, i.inv_approval_round, i.inv_sent_at, i.inv_updated_at,
                ${DATE_COLUMNS}
         FROM tb_invoices i
         JOIN tb_clients c ON c.client_id = i.inv_client_id
         LEFT JOIN tb_quotations q ON q.qt_id = i.inv_quotation_id
         LEFT JOIN tb_invoices ref ON ref.inv_id = i.inv_reference_invoice_id
         LEFT JOIN tb_users u ON u.user_id = i.inv_created_by
         WHERE ${conditions.join(" AND ")}
         ORDER BY i.inv_updated_at DESC, i.inv_id DESC`,
        params,
    );

    const company = await companyService.findCompany(conn);
    const pendingIds = rows.filter((row) => row.inv_status === "pending_approval").map((row) => row.inv_id);
    const approvals = await approvalsOfRound(conn, pendingIds);
    const withFlags = rows.map((row) => {
        const waitingForMe =
            row.inv_status === "pending_approval" &&
            evaluateFor(row, approvals.get(row.inv_id) ?? [], actor, company.cs_allow_self_approval).canApprove;
        const plan = quotationService.parseJson(row.inv_approval_plan) ?? [];
        const { inv_approval_plan: _plan, ...rest } = row;
        return {
            ...rest,
            ...dueStatus(row, today),
            payment_state: paymentStateOf(row),
            outstanding_amount: outstandingAmountOf(row),
            waiting_for_me: waitingForMe,
            approval_level_count: plan.length,
        };
    });

    const filtered = tab === "waiting_me" ? withFlags.filter((row) => row.waiting_for_me) : withFlags;
    return { data: filtered.slice(safeOffset, safeOffset + safeLimit), total: filtered.length };
}

// ─── งวดที่ออกบิลได้ของใบเสนอราคา ──────────────────────────────────────────────────────────────

/**
 * งวดทั้งหมดของใบเสนอราคา + ยอดก่อน VAT/VAT ของแต่ละงวด + ออกบิลไปแล้วกับใบไหน — หน้าใบเสนอราคาและหน้าเลือกงวดใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} quotationId
 */
async function listBillableMilestones(conn, quotationId) {
    const [[quotation]] = await conn.query(
        `SELECT qt_id, qt_number, qt_status, qt_payment_mode, qt_currency, qt_after_discount, qt_vat_amount, qt_vat_rate, qt_total
         FROM tb_quotations WHERE qt_id = ?`,
        [quotationId],
    );
    if (!quotation) throw quotationService.notFound();
    const milestones = await findMilestones(conn, quotationId);
    const billed = await findBilledMilestones(conn, quotationId);
    const currency = await quotationService.findCurrency(conn, quotation.qt_currency);

    let splits = [];
    if (milestones.length > 0) {
        const preview = calculateMilestoneInvoice({
            quotation: {
                afterDiscount: parseHundredths(quotation.qt_after_discount, "ยอดก่อน VAT"),
                total: parseHundredths(quotation.qt_total, "ยอดรวม"),
                vatRate: quotation.qt_vat_rate,
            },
            milestones: milestones.map((milestone) => ({
                id: Number(milestone.qtm_id),
                amount: parseHundredths(milestone.qtm_amount, "ยอดงวด"),
            })),
            selectedIds: milestones.map((milestone) => Number(milestone.qtm_id)),
            vatRate: quotation.qt_vat_rate,
            currencyDecimals: currency.cur_decimals,
        });
        splits = preview.lines;
    }

    return {
        quotation: {
            qt_id: quotation.qt_id,
            qt_number: quotation.qt_number,
            qt_status: quotation.qt_status,
            qt_payment_mode: quotation.qt_payment_mode,
            qt_currency: quotation.qt_currency,
            qt_total: quotation.qt_total,
        },
        can_bill: quotation.qt_status === "accepted",
        milestones: milestones.map((milestone, index) => {
            const billedBy = billed.get(Number(milestone.qtm_id)) ?? null;
            return {
                qtm_id: Number(milestone.qtm_id),
                qtm_order: milestone.qtm_order,
                qtm_name: milestone.qtm_name,
                qtm_condition: milestone.qtm_condition,
                qtm_percent: milestone.qtm_percent,
                qtm_amount: milestone.qtm_amount,
                base_amount: splits[index] ? toDecimalText(splits[index].base) : null,
                vat_amount: splits[index] ? toDecimalText(splits[index].vat) : null,
                billed_invoice: billedBy
                    ? { inv_id: billedBy.inv_id, inv_number: billedBy.inv_number, inv_status: billedBy.inv_status }
                    : null,
            };
        }),
    };
}

// ─── อ่านใบเดียว ─────────────────────────────────────────────────────────────────────────────

/** ใบลดหนี้ทั้งหมดของใบแจ้งหนี้ (รวมร่าง/ยกเลิก) เรียงตามเวลาออก — ร่างอยู่ท้าย */
async function listCreditNotesOf(conn, invoiceId) {
    const [rows] = await conn.query(
        `SELECT cn_id, cn_number, cn_status, cn_total, cn_wht_amount, cn_reason, cn_refund_required,
                cn_refunded_at IS NOT NULL AS is_refunded, cn_issued_at, DATE_FORMAT(cn_issue_date, '%Y-%m-%d') AS cn_issue_date
         FROM tb_credit_notes
         WHERE cn_invoice_id = ?
         ORDER BY cn_issued_at IS NULL, cn_issued_at, cn_created_at`,
        [invoiceId],
    );
    return rows.map((row) => ({ ...row, is_refunded: Boolean(row.is_refunded) }));
}

/** ใบวางบิลที่ยังไม่ยกเลิกซึ่งมีใบแจ้งหนี้นี้อยู่ (ใบละไม่เกิน 1) */
async function findActiveBillingNote(conn, invoiceId) {
    const [[note]] = await conn.query(
        `SELECT b.bn_id, b.bn_number, b.bn_status
         FROM tb_billing_note_invoices bi JOIN tb_billing_notes b ON b.bn_id = bi.bni_billing_note_id
         WHERE bi.bni_invoice_id = ? AND b.bn_status <> 'cancelled'
         LIMIT 1`,
        [invoiceId],
    );
    return note ?? null;
}

/**
 * บัญชีรับเงิน + พร้อมเพย์ที่แสดงบนใบ — ใบที่ออกแล้วใช้ snapshot · ร่างใช้ค่าปัจจุบัน
 * QR ฝังยอดหลังหัก ณ ที่จ่าย (ผู้ใช้เลือก I5) เฉพาะเงินบาท
 */
async function buildPayment(conn, invoice) {
    const snapshot = quotationService.parseJson(invoice.inv_bank_snapshot);
    let bankAccount;
    let promptPayId;
    if (snapshot) {
        bankAccount = snapshot.bank_account ?? null;
        promptPayId = snapshot.promptpay_id ?? null;
    } else {
        const [[account]] = invoice.inv_bank_account_id
            ? await conn.query(
                  `SELECT ba_id, ba_bank_name, ba_account_name, ba_account_no, ba_bank_branch, ba_swift_code, ba_currency
                   FROM tb_bank_accounts WHERE ba_id = ?`,
                  [invoice.inv_bank_account_id],
              )
            : [[null]];
        bankAccount = account ?? null;
        promptPayId = (await companyService.findCompany(conn)).cs_promptpay_id;
    }

    // ฐานคือยอดหลังลดหนี้ (ขั้น N-1) · หัก ณ ที่จ่ายฐาน = ประมาณการของใบ − ส่วนที่ลดไปกับใบลดหนี้
    const { effectiveTotal: total, outstanding } = balanceOf(invoice);
    const withholding =
        parseHundredths(invoice.inv_wht_amount, "หัก ณ ที่จ่าย") -
        parseHundredths(invoice.inv_credited_wht ?? 0, "หัก ณ ที่จ่ายส่วนที่ลด");
    const netPayable = total - withholding;
    // ยอดใน QR = ส่วนที่ยังค้างหลังหัก ณ ที่จ่ายตามสัดส่วน (ช่วง 1C: รับเงินบางส่วนแล้ว ลูกค้าสแกนต้องไม่จ่ายซ้ำส่วนที่รับไปแล้ว)
    const qrAmount =
        outstanding >= total
            ? netPayable
            : outstanding - (total > 0n ? divideRoundHalfUp(withholding * outstanding, total) : 0n);
    // ใบที่ยกเลิก/ชำระครบไม่มี QR (กันลูกค้าโอนเข้าใบที่ไม่ต้องจ่ายแล้ว) · หน้าพิมพ์แสดง QR เฉพาะใบที่ออกแล้ว
    const canUseQr =
        invoice.inv_status !== "cancelled" &&
        invoice.inv_currency === BASE_CURRENCY &&
        normalizePromptPayId(promptPayId) !== null &&
        qrAmount > 0n;
    const outstandingNet = qrAmount > 0n ? qrAmount : 0n;
    const outstandingOrZero = outstanding > 0n ? outstanding : 0n;
    return {
        bank_account: bankAccount,
        promptpay_id: promptPayId,
        net_payable: toDecimalText(netPayable),
        // ขั้น N-1: ยอดหลังลดหนี้ — หน้าพิมพ์แสดงบรรทัดใบลดหนี้ทีละใบก่อนใบเสร็จ
        effective_total: toDecimalText(total),
        credited: toDecimalText(parseHundredths(invoice.inv_credited_amount ?? 0, "ลดหนี้แล้ว")),
        refund_due: toDecimalText(balanceOf(invoice).refundDue),
        // รับเงินบางส่วนแล้ว — หน้าพิมพ์แสดงยอดคงค้าง · หัก ณ ที่จ่ายส่วนที่เหลือ · คงค้างสุทธิ (= ยอดในคิวอาร์)
        outstanding: toDecimalText(outstandingOrZero),
        outstanding_withholding: toDecimalText(outstandingOrZero - outstandingNet),
        outstanding_net: toDecimalText(outstandingNet),
        qr_amount: toDecimalText(qrAmount > 0n ? qrAmount : 0n),
        qr_payload: canUseQr ? buildPromptPayPayload({ promptPayId, amount: qrAmount }) : null,
    };
}

/**
 * ใบแจ้งหนี้พร้อมทุกอย่างที่หน้าเอกสารต้องใช้
 * @param {import("mysql2/promise").Pool} conn
 * @param {string} invoiceId
 * @param {{ user_id: string, user_role_id: string | null, role_permission: string }} actor
 */
async function getInvoiceDetail(conn, invoiceId, actor) {
    const today = todayBangkok();
    const [[invoice]] = await conn.query(
        `SELECT i.*, ${DATE_COLUMNS},
                c.client_name, c.client_company, c.client_status, b.branch_code, b.branch_name_th, b.branch_status,
                p.project_name, q.qt_number, q.qt_revision, q.qt_title, q.qt_total, q.qt_currency AS qt_currency,
                r.inv_number AS reissued_from_number,
                ref.inv_number AS reference_number, DATE_FORMAT(ref.inv_issue_date, '%Y-%m-%d') AS reference_issue_date,
                ref.inv_total AS reference_total, ref.inv_title AS reference_title, ref.inv_vat_rate AS reference_vat_rate,
                CONCAT(u.user_fname, ' ', u.user_lname) AS created_by_current_name
         FROM tb_invoices i
         JOIN tb_clients c ON c.client_id = i.inv_client_id
         JOIN tb_branches b ON b.branch_id = i.inv_branch_id
         LEFT JOIN tb_projects p ON p.project_id = i.inv_project_id
         LEFT JOIN tb_quotations q ON q.qt_id = i.inv_quotation_id
         LEFT JOIN tb_invoices r ON r.inv_id = i.inv_reissued_from_id
         LEFT JOIN tb_invoices ref ON ref.inv_id = i.inv_reference_invoice_id
         LEFT JOIN tb_users u ON u.user_id = i.inv_created_by
         WHERE i.inv_id = ?`,
        [invoiceId],
    );
    if (!invoice) throw notFound();

    const [items] = await conn.query(
        "SELECT * FROM tb_invoice_items WHERE invi_invoice_id = ? ORDER BY invi_order, invi_id",
        [invoiceId],
    );
    const [milestoneLinks] = await conn.query(
        `SELECT m.*, qm.qtm_order, qm.qtm_name, qm.qtm_percent
         FROM tb_invoice_milestones m JOIN tb_quotation_milestones qm ON qm.qtm_id = m.ivm_milestone_id
         WHERE m.ivm_invoice_id = ? ORDER BY qm.qtm_order`,
        [invoiceId],
    );
    const [approvalHistory] = await conn.query(
        "SELECT * FROM tb_invoice_approvals WHERE inva_invoice_id = ? ORDER BY inva_id",
        [invoiceId],
    );
    // ใบเสร็จที่ตัดใบนี้ (รวมที่ยกเลิก — หน้าเว็บแสดงสถานะ) เรียงตามวันที่รับเงิน
    const [receipts] = await conn.query(
        `SELECT r.rc_id, r.rc_number, r.rc_status, DATE_FORMAT(r.rc_receipt_date, '%Y-%m-%d') AS rc_receipt_date, r.rc_method,
                a.rca_amount
         FROM tb_receipt_allocations a JOIN tb_receipts r ON r.rc_id = a.rca_receipt_id
         WHERE a.rca_invoice_id = ?
         ORDER BY r.rc_receipt_date, r.rc_number`,
        [invoiceId],
    );
    // ใบลดหนี้ของใบนี้ (รวมร่าง/ยกเลิก — หน้าเว็บแสดงสถานะ · หน้าพิมพ์ใช้เฉพาะที่ออกแล้ว) เรียงตามเวลาออก
    const creditNotes = await listCreditNotesOf(conn, invoiceId);
    // ใบเพิ่มหนี้ที่อ้างใบนี้ (ขั้น N-2) · ถ้าใบนี้เป็นใบเพิ่มหนี้: เทียบกับมูลค่าเดิม (ออกแล้ว = ค่าที่บันทึกตอนออก · ร่าง = ค่าปัจจุบัน)
    const debitNotes = await listDebitNotesOf(conn, invoiceId);
    let debitComparison = null;
    if (invoice.inv_doc_type === "debit_note") {
        const originalTotal =
            invoice.inv_original_total !== null
                ? parseHundredths(invoice.inv_original_total, "มูลค่าเดิม")
                : await debitOriginalTotal(conn, invoice.inv_reference_invoice_id, invoiceId);
        const thisTotal = parseHundredths(invoice.inv_total, "ยอดรวม");
        debitComparison = {
            original_total: toDecimalText(originalTotal),
            this_total: toDecimalText(thisTotal),
            correct_total: toDecimalText(originalTotal + thisTotal),
            is_snapshot: invoice.inv_original_total !== null,
        };
    }
    const [[reissuedTo]] = await conn.query(
        "SELECT inv_id, inv_number, inv_status FROM tb_invoices WHERE inv_reissued_from_id = ? ORDER BY inv_created_at DESC LIMIT 1",
        [invoiceId],
    );

    const currency = await quotationService.findCurrency(conn, invoice.inv_currency);
    const company = await companyService.findCompany(conn);
    const approvalsThisRound = approvalHistory
        .filter((row) => row.inva_round === invoice.inv_approval_round && row.inva_action === "approve")
        .map((row) => ({ level: row.inva_level, user_id: row.inva_user_id }));
    const approval =
        invoice.inv_status === "pending_approval"
            ? evaluateFor(invoice, approvalsThisRound, actor, company.cs_allow_self_approval)
            : null;
    const billingNote = await findActiveBillingNote(conn, invoiceId);
    const actions = buildActions(invoice, actor, approval, billingNote, creditNotes, debitNotes);

    return {
        invoice: {
            ...invoice,
            inv_approval_plan: quotationService.parseJson(invoice.inv_approval_plan) ?? [],
            inv_client_snapshot: quotationService.parseJson(invoice.inv_client_snapshot),
            inv_company_snapshot: quotationService.parseJson(invoice.inv_company_snapshot),
            inv_bank_snapshot: quotationService.parseJson(invoice.inv_bank_snapshot),
            ...dueStatus(invoice, today),
            payment_state: paymentStateOf(invoice),
            outstanding_amount: outstandingAmountOf(invoice),
        },
        currency,
        items,
        milestones: milestoneLinks,
        approval_history: approvalHistory,
        approval,
        billing_note: billingNote,
        receipts,
        credit_notes: creditNotes,
        debit_notes: debitNotes,
        debit_comparison: debitComparison,
        reissued_to: reissuedTo ?? null,
        payment: await buildPayment(conn, invoice),
        actions,
        readiness: invoice.inv_status === "draft" ? buildReadiness(invoice, items, currency) : [],
        today,
    };
}

/**
 * ปุ่มที่ผู้ใช้คนนี้กดได้ตอนนี้ + เหตุผลถ้ากดไม่ได้ (หน้าเว็บซ่อนปุ่มและแสดงเหตุผลในแถบสถานะ — ห้าม tooltip)
 */
function buildActions(invoice, actor, approval, billingNote, creditNotes = [], debitNotes = []) {
    const canCreate = hasBit(actor.role_permission, "createInvoice");
    const canCancelPermission = hasBit(actor.role_permission, "cancelInvoice");
    const status = invoice.inv_status;
    const isManual = invoice.inv_source === "manual";
    const hasPayment = parseHundredths(invoice.inv_paid_amount, "ยอดรับแล้ว") > 0n;
    const activeCreditNote = creditNotes.find((creditNote) => creditNote.cn_status !== "cancelled");
    const activeDebitNote = debitNotes.find((debitNote) => debitNote.inv_status !== "cancelled");
    const balance = balanceOf(invoice);

    const currentLevel = (quotationService.parseJson(invoice.inv_approval_plan) ?? []).find(
        (level) => level.level === invoice.inv_approval_current_level,
    );
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));

    let cancelBlockedReason = null;
    if (status === "issued" && billingNote) {
        cancelBlockedReason = `ใบนี้อยู่ในใบวางบิล ${billingNote.bn_number ?? "(ร่าง)"} — ยกเลิกหรือลบใบวางบิลก่อน แล้วค่อยยกเลิกใบนี้`;
    } else if (status === "issued" && hasPayment) {
        cancelBlockedReason = "ใบนี้รับชำระเงินแล้ว — ยกเลิกใบเสร็จก่อน แล้วค่อยยกเลิกใบนี้";
    } else if (status === "issued" && activeCreditNote) {
        cancelBlockedReason = `ใบนี้มีใบลดหนี้ ${activeCreditNote.cn_number ?? "(ร่าง/รออนุมัติ)"} — ยกเลิกหรือลบใบลดหนี้ก่อน แล้วค่อยยกเลิกใบนี้`;
    } else if (status === "issued" && activeDebitNote) {
        cancelBlockedReason = `ใบนี้มีใบเพิ่มหนี้ ${activeDebitNote.inv_number ?? "(ร่าง/รออนุมัติ)"} — ยกเลิกหรือลบใบเพิ่มหนี้ก่อน แล้วค่อยยกเลิกใบนี้`;
    }
    // ใบเพิ่มหนี้ (ขั้น N-2): ออกจากใบแจ้งหนี้ที่ออกแล้วเท่านั้น (ใบเพิ่มหนี้อ้างใบเพิ่มหนี้ไม่ได้)
    let debitBlockedReason = null;
    if (status === "issued" && invoice.inv_doc_type === "debit_note") {
        debitBlockedReason = `ใบนี้เป็นใบเพิ่มหนี้ — ถ้าต้องเรียกเก็บเพิ่มอีก ให้ออกใบเพิ่มหนี้จากใบแจ้งหนี้เดิม ${invoice.reference_number ?? ""}`.trim();
    }
    // ใบลดหนี้ (ขั้น N-1): ใบที่ออกแล้ว ยังมียอดเหลือให้ลด และไม่อยู่ในใบวางบิลที่ยังไม่ยกเลิก (R-N5)
    let creditBlockedReason = null;
    if (status === "issued" && billingNote) {
        creditBlockedReason = `ใบนี้อยู่ในใบวางบิล ${billingNote.bn_number ?? "(ร่าง)"} — ยกเลิกหรือลบใบวางบิลก่อน แล้วออกใบวางบิลใหม่ด้วยยอดหลังลดหนี้`;
    } else if (status === "issued" && balance.effectiveTotal <= 0n) {
        creditBlockedReason = "ใบนี้ลดหนี้ครบยอดแล้ว";
    }
    const canCancelNow = canCancelPermission && status === "issued" && cancelBlockedReason === null;

    return {
        can_edit: canCreate && status === "draft",
        can_delete: canCreate && status === "draft",
        can_issue: canCreate && status === "draft" && !isManual,
        can_submit: canCreate && status === "draft" && isManual,
        can_approve: Boolean(approval?.canApprove),
        can_return:
            status === "pending_approval" && hasBit(actor.role_permission, "approveInvoice") && isInCurrentLevel,
        can_send: canCreate && status === "issued" && !invoice.inv_sent_at,
        can_cancel: canCancelNow,
        can_reissue: canCancelNow && canCreate,
        cancel_blocked_reason: canCancelPermission ? cancelBlockedReason : null,
        // บันทึกรับเงิน (ช่วง 1C — สิทธิ์ของใบเสร็จ ไม่ใช่ของใบแจ้งหนี้)
        can_receive: hasBit(actor.role_permission, "createReceipt") && status === "issued" && balance.outstanding > 0n,
        can_credit: canCreate && status === "issued" && creditBlockedReason === null,
        credit_blocked_reason: canCreate ? creditBlockedReason : null,
        can_debit: canCreate && status === "issued" && debitBlockedReason === null,
        debit_blocked_reason: canCreate ? debitBlockedReason : null,
    };
}

/** รายการตรวจก่อนออก/ส่งขออนุมัติ — ข้อที่ไม่ผ่านบอกวิธีแก้ */
function buildReadiness(invoice, items, currency) {
    const pricedItems = items.filter((item) => item.invi_type === "item");
    const isForeign = invoice.inv_currency !== BASE_CURRENCY;
    return [
        { key: "items", ok: pricedItems.length > 0, message: "มีแถวรายการที่มีราคาอย่างน้อย 1 แถว" },
        { key: "total", ok: parseHundredths(invoice.inv_total, "ยอดรวม") > 0n, message: "ยอดรวมทั้งสิ้นมากกว่า 0" },
        { key: "client", ok: invoice.client_status === "active", message: "ลูกค้ายังเปิดใช้งานอยู่" },
        { key: "branch", ok: invoice.branch_status === "active", message: "สาขายังเปิดใช้งานอยู่" },
        { key: "currency", ok: currency?.cur_status === "active", message: "สกุลเงินยังเปิดใช้งานอยู่" },
        {
            key: "rate",
            ok: !isForeign || Boolean(invoice.inv_rate_source),
            message: "มีอัตราแลกเปลี่ยน (ธปท. หรือกรอกเองพร้อมเหตุผล)",
        },
    ];
}

module.exports = {
    createFromQuotation,
    createManual,
    createDebitNote,
    updateDraft,
    deleteDraft,
    findSource,
    listInvoices,
    listBillableMilestones,
    getInvoiceDetail,
    // ใช้ต่อใน invoice-workflow.service.js
    findForUpdate,
    assertVersion,
    wrongStatus,
    validationError,
    lockBillableQuotation,
    assertMilestonesAvailable,
    findMilestones,
    calculateForQuotation,
    calculateManual,
    checkBranchAndBank,
    findActiveBillingNote,
    totalsValues,
    replaceChildren,
    evaluateFor,
    daysBetween,
    paymentStateOf,
    balanceOf,
    outstandingSql,
    outstandingThbSql,
    effectiveTotalSql,
    listCreditNotesOf,
    listDebitNotesOf,
    findDebitReference,
    debitOriginalTotal,
    DOCUMENT_NAME,
};
