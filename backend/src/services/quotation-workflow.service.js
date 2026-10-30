// ใบเสนอราคา: การเปลี่ยนสถานะ (2026-10-13 ขั้น 1A-3 — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 2–3)
//
// ทุกฟังก์ชันรับ conn ที่อยู่ใน transaction และล็อกแถวใบด้วย SELECT ... FOR UPDATE ก่อนตรวจสถานะ (R5 — กดซ้ำ/กดพร้อมกัน
// คนที่สองได้ 409 ไม่ทำซ้ำ) · ผิดสถานะตอบ 409 · ไม่มีสิทธิ์ตอบ 403 · ข้อความบอกเหตุผลและสิ่งที่ต้องทำต่อ
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");
const { issueDocumentNumber } = require("../utils/document-number");
const { hasBit } = require("../utils/permissions");
const { buildApprovalPlan } = require("../shared/approval-flow.mjs");
const { convertFromBaht, parseHundredths } = require("../shared/money.mjs");
const { toDecimalText } = require("../shared/quotation-totals.mjs");
const { BASE_CURRENCY } = require("../shared/schemas/quotation.mjs");
const quotationService = require("./quotation.service");
const companyService = require("./company.service");
const approvalRulesService = require("./approval-rules.service");
const signatureService = require("./signature.service");
const exchangeRateService = require("./exchange-rate.service");

const DOCUMENT_TYPE = "QT";

function shiftDate(dateText, dayCount) {
    return exchangeRateService.shiftDate(dateText, dayCount);
}

async function findUserLabel(conn, userId) {
    const [[user]] = await conn.query(
        `SELECT CONCAT(u.user_fname, ' ', u.user_lname) AS full_name, u.user_role_id, r.role_name
         FROM tb_users u LEFT JOIN tb_roles r ON r.role_id = u.user_role_id
         WHERE u.user_id = ?`,
        [userId],
    );
    return user ?? { full_name: "(ผู้ใช้ถูกลบ)", user_role_id: null, role_name: null };
}

// ใบที่อยู่ในฐานข้อมูล → รูปเดียวกับที่ผ่าน quotationDraftSchema (ใช้คำนวณใหม่ตอนส่ง/revision/คัดลอก)
async function loadAsDraft(conn, quotation) {
    const [items] = await conn.query(
        "SELECT * FROM tb_quotation_items WHERE qti_quotation_id = ? ORDER BY qti_order, qti_id",
        [quotation.qt_id],
    );
    const [milestones] = await conn.query(
        "SELECT * FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order, qtm_id",
        [quotation.qt_id],
    );
    return {
        qt_client_id: quotation.qt_client_id,
        qt_branch_id: quotation.qt_branch_id,
        qt_project_id: quotation.qt_project_id,
        qt_title: quotation.qt_title,
        qt_language: quotation.qt_language,
        qt_currency: quotation.qt_currency,
        qt_exchange_rate: quotation.qt_exchange_rate,
        qt_rate_source: quotation.qt_rate_source,
        qt_rate_date: quotation.qt_rate_date_text ?? null,
        qt_rate_bot: quotation.qt_rate_bot,
        qt_rate_override_reason: quotation.qt_rate_override_reason,
        qt_vat_treatment: quotation.qt_vat_treatment,
        qt_valid_days: quotation.qt_valid_days,
        qt_payment_mode: quotation.qt_payment_mode,
        qt_discount_type: quotation.qt_discount_type,
        qt_discount_value: quotation.qt_discount_value,
        qt_terms: quotation.qt_terms,
        qt_internal_note: quotation.qt_internal_note,
        items: items.map((item) => ({
            qti_type: item.qti_type,
            qti_product_id: item.qti_product_id,
            qti_package_id: item.qti_package_id,
            qti_description: item.qti_description,
            qti_quantity: item.qti_quantity,
            qti_unit: item.qti_unit,
            qti_unit_price: item.qti_unit_price,
            qti_list_price: item.qti_list_price,
            qti_discount_type: item.qti_discount_type,
            qti_discount_value: item.qti_discount_value,
        })),
        milestones: milestones.map((milestone) => ({
            qtm_name: milestone.qtm_name,
            qtm_condition: milestone.qtm_condition,
            qtm_percent: milestone.qtm_percent,
            qtm_amount: milestone.qtm_percent === null ? milestone.qtm_amount : null,
        })),
    };
}

// findForUpdate คืน DATE เป็น Date object — อ่านวันที่ของอัตราเป็นข้อความแยก
async function lockWithDates(conn, quotationId) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    const [[dates]] = await conn.query(
        "SELECT DATE_FORMAT(qt_rate_date, '%Y-%m-%d') AS rate_date FROM tb_quotations WHERE qt_id = ?",
        [quotationId],
    );
    return { ...quotation, qt_rate_date_text: dates.rate_date };
}

// คำนวณใหม่ทั้งใบด้วยอัตรา VAT ที่ระบุ แล้วเขียนยอด + รายการกลับ (ไม่แตะสถานะ)
async function recalculateAndSave(conn, quotationId, draft, vatRate) {
    const currency = await quotationService.findCurrency(conn, draft.qt_currency);
    const calculation = quotationService.calculateOrThrow(draft, currency, vatRate);
    await conn.query(
        `UPDATE tb_quotations SET qt_subtotal = ?, qt_discount_amount = ?, qt_after_discount = ?, qt_vat_rate = ?, qt_vat_amount = ?,
                qt_total = ?, qt_after_discount_thb = ?, qt_total_thb = ?
         WHERE qt_id = ?`,
        [
            toDecimalText(calculation.subtotal),
            toDecimalText(calculation.discount),
            toDecimalText(calculation.afterDiscount),
            vatRate,
            toDecimalText(calculation.vat),
            toDecimalText(calculation.total),
            toDecimalText(calculation.afterDiscountThb),
            toDecimalText(calculation.totalThb),
            quotationId,
        ],
    );
    await quotationService.replaceChildren(conn, quotationId, draft, calculation);
    return { calculation, currency };
}

// ─── ส่งขออนุมัติ ─────────────────────────────────────────────────────────────────────────────

/**
 * ตรวจครบ → อัปเดตราคาตั้งต้นเป็นราคาปัจจุบัน → คิด VAT ด้วยวันนี้ → ล็อกอัตรา → snapshot แผนอนุมัติ → รอชั้นแรก
 */
async function submitForApproval(conn, quotationId, expectedVersion, actor) {
    const quotation = await lockWithDates(conn, quotationId);
    if (quotation.qt_status !== "draft") throw quotationService.wrongStatus("ส่งขออนุมัติได้เฉพาะร่าง");
    quotationService.assertVersion(quotation, expectedVersion);

    const draft = await loadAsDraft(conn, quotation);
    const problems = [];
    const [[client]] = await conn.query("SELECT client_status FROM tb_clients WHERE client_id = ?", [
        draft.qt_client_id,
    ]);
    if (client?.client_status !== "active")
        problems.push("ลูกค้าถูกปิดใช้งาน · เปลี่ยนลูกค้า หรือเปิดใช้งานลูกค้าก่อน");
    const [[branch]] = await conn.query("SELECT branch_status FROM tb_branches WHERE branch_id = ?", [
        draft.qt_branch_id,
    ]);
    if (branch?.branch_status !== "active") problems.push("สาขาถูกปิดใช้งาน · เลือกสาขาอื่น");
    const currency = await quotationService.findCurrency(conn, draft.qt_currency);
    if (currency?.cur_status !== "active")
        problems.push(`สกุลเงิน ${draft.qt_currency} ถูกปิดใช้งาน · เปลี่ยนสกุลเงิน`);
    if (draft.qt_currency !== BASE_CURRENCY && !draft.qt_rate_source) problems.push("ยังไม่มีอัตราแลกเปลี่ยน");
    if (!draft.items.some((item) => item.qti_type === "item")) problems.push("ยังไม่มีแถวรายการที่มีราคา");
    if (draft.qt_payment_mode === "milestones" && draft.milestones.length === 0)
        problems.push("เลือกแบ่งงวดแต่ยังไม่มีงวด");

    // ผู้อนุมัติเทียบกับราคาตั้งต้นล่าสุดเสมอ (หัวข้อ 4.1) — สินค้าที่ถูกปิดใช้งานยังส่งได้ (แถวเป็นสำเนาแล้ว)
    const productIds = [...new Set(draft.items.map((item) => item.qti_product_id).filter(Boolean))];
    if (productIds.length > 0 && currency) {
        const [products] = await conn.query(
            "SELECT product_id, product_price FROM tb_products WHERE product_id IN (?)",
            [productIds],
        );
        const priceById = new Map(products.map((product) => [product.product_id, product.product_price]));
        draft.items = draft.items.map((item) => {
            const bahtPrice = item.qti_product_id ? priceById.get(item.qti_product_id) : undefined;
            if (bahtPrice === undefined) return item;
            const listPrice = convertFromBaht(
                parseHundredths(bahtPrice, "ราคาตั้งต้น"),
                draft.qt_exchange_rate,
                currency.cur_decimals,
            );
            return { ...item, qti_list_price: toDecimalText(listPrice) };
        });
    }

    const today = todayBangkok();
    const vatRate = await quotationService.vatRateFor(conn, today, draft.qt_vat_treatment);
    let calculation = null;
    if (currency) {
        try {
            ({ calculation } = await recalculateAndSave(conn, quotationId, draft, vatRate));
        } catch (err) {
            if (!(err instanceof AppError)) throw err;
            problems.push(...Object.values(err.fields ?? {}).map(String));
        }
    }
    if (calculation) {
        if (calculation.total <= 0n) problems.push("ยอดรวมทั้งสิ้นต้องมากกว่า 0");
        if (calculation.milestonesError) problems.push(`งวดชำระ: ${calculation.milestonesError}`);
    }
    if (problems.length > 0) {
        throw new AppError(400, "QUOTATION_NOT_READY", `ยังส่งขออนุมัติไม่ได้: ${problems.join(" · ")}`, {
            _form: problems.join("\n"),
        });
    }

    const rules = await approvalRulesService.findApprovalRules(conn, DOCUMENT_TYPE);
    const plan = buildApprovalPlan(rules.levels, calculation.afterDiscountThb);
    if (plan.length === 0) {
        throw new AppError(
            409,
            "APPROVAL_RULES_MISSING",
            "ยังไม่ได้ตั้งกติกาอนุมัติ · ให้ผู้ดูแลตั้งที่ ตั้งค่าระบบ › ข้อมูลบริษัท › การอนุมัติ",
        );
    }

    const creator = await findUserLabel(conn, quotation.qt_created_by ?? actor.user_id);
    const creatorSignature = quotation.qt_created_by
        ? await signatureService.findActiveSignature(conn, quotation.qt_created_by)
        : null;
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'pending_approval', qt_approval_round = qt_approval_round + 1,
                qt_approval_current_level = ?, qt_approval_plan = ?, qt_submitted_at = NOW(), qt_returned_reason = NULL,
                qt_created_by_name = ?, qt_created_by_title = ?, qt_creator_signature_id = ?, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [
            plan[0].level,
            JSON.stringify(plan),
            creator.full_name,
            creator.role_name,
            creatorSignature?.sig_id ?? null,
            quotationId,
        ],
    );
    return { qt_id: quotationId, approval_levels: plan.map((level) => level.level) };
}

// ─── อนุมัติ ─────────────────────────────────────────────────────────────────────────────────

async function approvalsThisRound(conn, quotation) {
    const [rows] = await conn.query(
        `SELECT qta_level, qta_user_id FROM tb_quotation_approvals
         WHERE qta_quotation_id = ? AND qta_round = ? AND qta_action = 'approve'`,
        [quotation.qt_id, quotation.qt_approval_round],
    );
    return rows.map((row) => ({ level: row.qta_level, user_id: row.qta_user_id }));
}

// ครบชั้นสุดท้าย: วันที่เอกสาร = วันนี้ · ออกเลข (Rev.0) · snapshot ลูกค้า/บริษัท/สาขา · ลายเซ็นผู้อนุมัติ · ฉบับก่อน → superseded
async function finalizeApproval(conn, quotation, actor, approver) {
    const today = todayBangkok();
    const documentNumber = quotation.qt_number ?? (await issueDocumentNumber(conn, DOCUMENT_TYPE, today));
    const validUntil = shiftDate(today, quotation.qt_valid_days);

    const [[client]] = await conn.query(
        `SELECT client_id, client_name, client_company, client_contact_name, client_email, client_phone, client_type, client_country,
                client_tax_id, client_branch_code, client_address
         FROM tb_clients WHERE client_id = ?`,
        [quotation.qt_client_id],
    );
    const company = await companyService.findCompany(conn);
    const [[branch]] = await conn.query(
        `SELECT branch_id, branch_code, branch_name_th, branch_name_en, branch_address_th, branch_address_en, branch_phone
         FROM tb_branches WHERE branch_id = ?`,
        [quotation.qt_branch_id],
    );
    const { cs_updated_at: _updatedAt, ...companySnapshot } = company;
    const approverSignature = await signatureService.findActiveSignature(conn, actor.user_id);

    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'approved', qt_number = ?, qt_issue_date = ?, qt_valid_until = ?,
                qt_client_snapshot = ?, qt_company_snapshot = ?, qt_approval_current_level = NULL,
                qt_approved_by = ?, qt_approved_by_name = ?, qt_approved_by_title = ?, qt_approver_signature_id = ?,
                qt_approved_at = NOW(), qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [
            documentNumber,
            today,
            validUntil,
            JSON.stringify(client),
            JSON.stringify({ ...companySnapshot, branch }),
            actor.user_id,
            approver.full_name,
            approver.role_name,
            approverSignature?.sig_id ?? null,
            quotation.qt_id,
        ],
    );
    if (quotation.qt_previous_id) {
        await conn.query(
            `UPDATE tb_quotations SET qt_status = 'superseded', qt_version = qt_version + 1
             WHERE qt_id = ? AND qt_status IN (?)`,
            [quotation.qt_previous_id, quotationService.REVISABLE_STATUSES],
        );
    }
    return documentNumber;
}

/**
 * อนุมัติชั้นปัจจุบัน และชั้นถัดไปต่อเนื่องที่ผู้กดมีสิทธิ์ (บันทึกแยกทีละชั้น)
 */
async function approve(conn, quotationId, expectedVersion, actor) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (quotation.qt_status !== "pending_approval") throw quotationService.wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    quotationService.assertVersion(quotation, expectedVersion);

    const company = await companyService.findCompany(conn);
    const evaluation = quotationService.evaluateFor(
        quotation,
        await approvalsThisRound(conn, quotation),
        actor,
        company.cs_allow_self_approval,
    );
    if (!evaluation.canApprove) throw new AppError(403, "APPROVAL_NOT_ALLOWED", evaluation.reason);

    // R19: อัตรา VAT ของวันนี้ต้องเท่ากับตอนส่ง ไม่งั้นยอดที่ผู้อนุมัติก่อนหน้าเห็นไม่ใช่ยอดที่จะลงเอกสาร
    if (evaluation.isFinal) {
        const vatRateToday = await quotationService.vatRateFor(conn, todayBangkok(), quotation.qt_vat_treatment);
        if (parseHundredths(vatRateToday, "VAT") !== parseHundredths(quotation.qt_vat_rate, "VAT")) {
            throw new AppError(
                409,
                "VAT_CHANGED",
                `อัตรา VAT เปลี่ยนจาก ${quotation.qt_vat_rate}% เป็น ${vatRateToday}% ตั้งแต่ส่งขออนุมัติ · ยอดในใบนี้ไม่ถูกต้องแล้ว กรุณาตีกลับให้ผู้สร้างบันทึกใหม่เพื่อคำนวณยอดใหม่`,
            );
        }
    }

    const approver = await findUserLabel(conn, actor.user_id);
    for (const level of evaluation.levels) {
        await conn.query(
            `INSERT INTO tb_quotation_approvals
                (qta_quotation_id, qta_round, qta_level, qta_action, qta_user_id, qta_user_name, qta_role_id, qta_role_name)
             VALUES (?, ?, ?, 'approve', ?, ?, ?, ?)`,
            [
                quotationId,
                quotation.qt_approval_round,
                level,
                actor.user_id,
                approver.full_name,
                approver.user_role_id,
                approver.role_name,
            ],
        );
    }

    if (evaluation.isFinal) {
        const documentNumber = await finalizeApproval(conn, quotation, actor, approver);
        return { qt_id: quotationId, approved_levels: evaluation.levels, is_final: true, qt_number: documentNumber };
    }
    await conn.query(
        "UPDATE tb_quotations SET qt_approval_current_level = ?, qt_version = qt_version + 1 WHERE qt_id = ?",
        [evaluation.nextLevel.level, quotationId],
    );
    return {
        qt_id: quotationId,
        approved_levels: evaluation.levels,
        is_final: false,
        next_level: evaluation.nextLevel.level,
    };
}

/**
 * ตีกลับ = กลับเป็นร่าง รอบหน้าเริ่มชั้น 1 ใหม่ · ทำได้โดยผู้มีสิทธิ์อนุมัติที่ role อยู่ในชั้นที่รออยู่
 */
async function returnToDraft(conn, quotationId, reason, expectedVersion, actor) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (quotation.qt_status !== "pending_approval") throw quotationService.wrongStatus("ใบนี้ไม่ได้รออนุมัติแล้ว");
    quotationService.assertVersion(quotation, expectedVersion);

    const plan = quotationService.parseJson(quotation.qt_approval_plan) ?? [];
    const currentLevel = plan.find((level) => level.level === quotation.qt_approval_current_level);
    const isInCurrentLevel = Boolean(currentLevel?.roles.some((role) => role.role_id === actor.user_role_id));
    if (!hasBit(actor.role_permission, "approveQuotation") || !isInCurrentLevel) {
        throw new AppError(403, "RETURN_NOT_ALLOWED", "ตีกลับได้เฉพาะผู้อนุมัติของชั้นที่รออยู่");
    }

    const user = await findUserLabel(conn, actor.user_id);
    await conn.query(
        `INSERT INTO tb_quotation_approvals
            (qta_quotation_id, qta_round, qta_level, qta_action, qta_user_id, qta_user_name, qta_role_id, qta_role_name, qta_reason)
         VALUES (?, ?, ?, 'return', ?, ?, ?, ?, ?)`,
        [
            quotationId,
            quotation.qt_approval_round,
            quotation.qt_approval_current_level,
            actor.user_id,
            user.full_name,
            user.user_role_id,
            user.role_name,
            reason,
        ],
    );
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'draft', qt_approval_current_level = NULL, qt_returned_reason = ?, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [reason, quotationId],
    );
    return { qt_id: quotationId };
}

// ─── หลังอนุมัติ ──────────────────────────────────────────────────────────────────────────────

async function markSent(conn, quotationId, expectedVersion) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (quotation.qt_status !== "approved")
        throw quotationService.wrongStatus("บันทึกว่าส่งลูกค้าได้เฉพาะใบที่อนุมัติแล้ว");
    quotationService.assertVersion(quotation, expectedVersion);
    if (await quotationService.fastworkSourceOf(conn, quotation)) throw quotationService.fastworkInternalError();
    await conn.query(
        "UPDATE tb_quotations SET qt_status = 'sent', qt_sent_at = NOW(), qt_version = qt_version + 1 WHERE qt_id = ?",
        [quotationId],
    );
    return { qt_id: quotationId };
}

async function markDeclined(conn, quotationId, reason, expectedVersion) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (!["approved", "sent"].includes(quotation.qt_status)) {
        throw quotationService.wrongStatus("บันทึกว่าลูกค้าปฏิเสธได้เฉพาะใบที่อนุมัติหรือส่งลูกค้าแล้ว");
    }
    quotationService.assertVersion(quotation, expectedVersion);
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'declined', qt_responded_at = NOW(), qt_decline_reason = ?, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [reason, quotationId],
    );
    return { qt_id: quotationId };
}

async function cancel(conn, quotationId, reason, expectedVersion, actor) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (quotation.qt_status === "draft") throw quotationService.wrongStatus('ร่างใช้ "ลบ" แทนการยกเลิก');
    if (!quotationService.CANCELLABLE_STATUSES.includes(quotation.qt_status)) {
        throw quotationService.wrongStatus(
            "ใบที่ลูกค้าตอบรับแล้ว ถูกยกเลิกแล้ว หรือมี revision ใหม่แทนแล้ว ยกเลิกไม่ได้",
        );
    }
    quotationService.assertVersion(quotation, expectedVersion);
    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'cancelled', qt_cancelled_by = ?, qt_cancelled_at = NOW(), qt_cancel_reason = ?,
                qt_approval_current_level = NULL, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [actor.user_id, reason, quotationId],
    );
    return { qt_id: quotationId };
}

// ─── revision / คัดลอก ────────────────────────────────────────────────────────────────────────

/**
 * อัตราใหม่สำหรับร่างที่เกิดจาก revision/คัดลอก — เรียกนอก transaction (อาจรอ ธปท. ถึง 5 วินาที ไม่ควรถือล็อกไว้)
 * ดึงไม่ได้ = ใช้อัตราเดิมของใบต้นทางเป็น "กรอกเอง" พร้อมเหตุผล ให้ผู้สร้างตรวจก่อนส่ง
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} sourceId
 */
async function prepareFreshRate(pool, sourceId) {
    const [[source]] = await pool.query("SELECT qt_currency, qt_exchange_rate FROM tb_quotations WHERE qt_id = ?", [
        sourceId,
    ]);
    if (!source) throw quotationService.notFound();
    if (source.qt_currency === BASE_CURRENCY) return { rate: "1", source: null, date: null, reason: null };

    const result = await exchangeRateService.findDocumentRate(pool, {
        currencyCode: source.qt_currency,
        requestedDate: todayBangkok(),
    });
    if (result.available) return { rate: result.rate, source: "bot", date: result.rate_date, reason: null };
    return {
        rate: source.qt_exchange_rate,
        source: "manual",
        date: null,
        reason: `ใช้อัตราเดิมจากใบต้นทาง เพราะดึงอัตรา ธปท. ใหม่ไม่ได้ (${result.error?.message ?? "ไม่มีข้อมูล"}) · ตรวจก่อนส่งขออนุมัติ`,
    };
}

async function insertDraftFrom(
    conn,
    draft,
    { quotationId, rootId, previousId, copiedFromId, number, revision, createdBy },
) {
    const vatRate = await quotationService.vatRateFor(conn, todayBangkok(), draft.qt_vat_treatment);
    const currency = await quotationService.findCurrency(conn, draft.qt_currency);
    const calculation = quotationService.calculateOrThrow(draft, currency, vatRate);
    await conn.query(
        `INSERT INTO tb_quotations
            (qt_id, qt_number, qt_revision, qt_root_id, qt_previous_id, qt_copied_from_id, qt_status, qt_version,
             qt_client_id, qt_branch_id, qt_project_id, qt_title, qt_language, qt_currency, qt_exchange_rate, qt_rate_source,
             qt_rate_date, qt_rate_bot, qt_rate_override_reason, qt_vat_treatment, qt_valid_days, qt_payment_mode,
             qt_subtotal, qt_discount_type, qt_discount_value, qt_discount_amount, qt_after_discount, qt_vat_rate, qt_vat_amount,
             qt_total, qt_after_discount_thb, qt_total_thb, qt_terms, qt_internal_note, qt_created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            quotationId,
            number,
            revision,
            rootId,
            previousId,
            copiedFromId,
            draft.qt_client_id,
            draft.qt_branch_id,
            draft.qt_project_id,
            draft.qt_title,
            draft.qt_language,
            draft.qt_currency,
            draft.qt_exchange_rate,
            draft.qt_rate_source,
            draft.qt_rate_date,
            draft.qt_rate_bot,
            draft.qt_rate_override_reason,
            draft.qt_vat_treatment,
            draft.qt_valid_days,
            draft.qt_payment_mode,
            toDecimalText(calculation.subtotal),
            draft.qt_discount_type,
            draft.qt_discount_value,
            toDecimalText(calculation.discount),
            toDecimalText(calculation.afterDiscount),
            vatRate,
            toDecimalText(calculation.vat),
            toDecimalText(calculation.total),
            toDecimalText(calculation.afterDiscountThb),
            toDecimalText(calculation.totalThb),
            draft.qt_terms,
            draft.qt_internal_note,
            createdBy,
        ],
    );
    await quotationService.replaceChildren(conn, quotationId, draft, calculation);
}

function withRate(draft, freshRate) {
    return {
        ...draft,
        qt_exchange_rate: freshRate.rate,
        qt_rate_source: freshRate.source,
        qt_rate_date: freshRate.date,
        qt_rate_bot: freshRate.source === "bot" ? freshRate.rate : null,
        qt_rate_override_reason: freshRate.reason,
    };
}

/**
 * ออก revision: ร่างใหม่เลขเดิม Rev.N+1 คัดลอกรายการ+งวด · มีร่าง/รออนุมัติค้างในสายได้ทีละใบ · ใบที่ตอบรับแล้วออกไม่ได้
 */
async function revise(conn, quotationId, freshRate, actor) {
    const source = await lockWithDates(conn, quotationId);
    if (source.qt_status === "accepted") {
        throw quotationService.wrongStatus('ใบที่ลูกค้าตอบรับแล้วออก revision ไม่ได้ · ใช้ "คัดลอกเป็นใบใหม่"');
    }
    if (!quotationService.REVISABLE_STATUSES.includes(source.qt_status)) {
        throw quotationService.wrongStatus("ออก revision ได้เฉพาะใบที่อนุมัติ ส่งลูกค้า หมดอายุ หรือถูกปฏิเสธ");
    }
    // ล็อกทั้งสาย — สองคนกดออก revision พร้อมกัน คนที่สองเห็นร่างของคนแรกแล้วถูกปฏิเสธ
    const [chain] = await conn.query(
        "SELECT qt_id, qt_status, qt_revision FROM tb_quotations WHERE qt_root_id = ? FOR UPDATE",
        [source.qt_root_id],
    );
    if (chain.some((row) => quotationService.OPEN_STATUSES.includes(row.qt_status))) {
        throw new AppError(
            409,
            "REVISION_ALREADY_OPEN",
            "มี revision ที่ยังเป็นร่างหรือรออนุมัติอยู่แล้ว · เปิดแก้ฉบับนั้นต่อ",
        );
    }

    const nextRevision = Math.max(...chain.map((row) => row.qt_revision)) + 1;
    const draft = withRate(await loadAsDraft(conn, source), freshRate);
    const newId = await generateDailyId("tb_quotations", "qt_id", "QUO");
    await insertDraftFrom(conn, draft, {
        quotationId: newId,
        rootId: source.qt_root_id,
        previousId: source.qt_id,
        copiedFromId: null,
        number: source.qt_number,
        revision: nextRevision,
        createdBy: actor.user_id,
    });
    return { qt_id: newId, qt_revision: nextRevision };
}

/**
 * คัดลอกเป็นใบใหม่ (สายใหม่ ไม่มีเลข Rev.0) — ใช้กับงานเพิ่มหลังตอบรับ หรือเสนอลูกค้ารายอื่น · สาขา = สาขาของผู้คัดลอก
 */
async function copy(conn, quotationId, freshRate, actor) {
    const [[source]] = await conn.query("SELECT * FROM tb_quotations WHERE qt_id = ?", [quotationId]);
    if (!source) throw quotationService.notFound();

    const [[actorBranch]] = await conn.query(
        `SELECT b.branch_id FROM tb_users u JOIN tb_branches b ON b.branch_id = u.user_branch_id
         WHERE u.user_id = ? AND b.branch_status = 'active'`,
        [actor.user_id],
    );
    const draft = withRate(await loadAsDraft(conn, source), freshRate);
    draft.qt_branch_id = actorBranch?.branch_id ?? source.qt_branch_id;

    const newId = await generateDailyId("tb_quotations", "qt_id", "QUO");
    await insertDraftFrom(conn, draft, {
        quotationId: newId,
        rootId: newId,
        previousId: null,
        copiedFromId: source.qt_id,
        number: null,
        revision: 0,
        createdBy: actor.user_id,
    });
    return { qt_id: newId };
}

module.exports = {
    submitForApproval,
    approve,
    returnToDraft,
    markSent,
    markDeclined,
    cancel,
    prepareFreshRate,
    revise,
    copy,
};
