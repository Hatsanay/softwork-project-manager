// คำขอบริการ ฝั่งพนักงาน (2026-10-25 · S-1 ดูรายการ/รายละเอียด · S-3 ตรวจ/ปรับ/ผูกลูกค้า/ยืนยัน/ปฏิเสธ)
//
// ยอดคิดด้วยสูตรเดียวกับหน้าร้าน (shared/order-cart-math.mjs) ไม่เก็บยอดซ้ำ
//   ยอดที่ลูกค้าส่ง = แถวของลูกค้า ราคา/จำนวน ณ วันส่ง
//   ยอดหลังปรับ    = ค่าที่ปรับ (ถ้ามี) แทนค่าเดิม · ไม่นับแถวที่เอาออก · รวมแถวที่ผู้รับผิดชอบเพิ่ม
// ยืนยัน (ลูกค้าตรง): ติ๊กออกใบเสนอราคา = สร้างร่างใบเสนอราคาจากยอดหลังปรับ · ไม่ติ๊ก = เปิดโปรเจกต์ + งานจากรายการทันที
// คำขอจากลิงก์ Fastwork (S-5): ออกใบเสนอราคาภายในได้ (ไม่ส่งลูกค้า) · รับงาน = เปิดงาน Fastwork จากคำขอ
//   ลิงก์ของงานเดิม = "ลูกค้ายืนยันบน Fastwork แล้ว" → งานจากรายการ + งวดเพิ่มในงานเดิม · ทุกการเปลี่ยนแปลงล็อกด้วยเวอร์ชัน
// ราคาเริ่มต้น (2026-11-01 · docs/plans/2026-11-01-starting-price.md): แถว svi_needs_price ต้องยืนยันราคาก่อนออกเอกสารทุกทาง
//   (ยืนยันคำขอ · ใบภายใน · รับงาน · งวดเพิ่ม = 409 PRICE_NOT_CONFIRMED) · เปิดงานตรงแล้วราคาสูงขึ้น = รอลูกค้ายืนยันราคา (awaiting_customer)
const { AppError } = require("../utils/app-error");
const { hasBit } = require("../utils/permissions");
const { nowBangkokText } = require("../utils/bangkok-time");
const { validate } = require("../utils/validate");
const { formatHundredths, parseHundredths } = require("../shared/money.mjs");
const { cartTotals, fixedSubtotal, percentAmount } = require("../shared/order-cart-math.mjs");
const { quotationDraftSchema } = require("../shared/schemas/quotation.mjs");
const quotationService = require("./quotation.service");
const projectService = require("./project.service");
const { acceptQuotation, insertTasksFromRows } = require("./quotation-accept.service");

const STATUSES = new Set(["submitted", "awaiting_customer", "converted", "rejected", "closed"]);
const text = (hundredths) => formatHundredths(hundredths);
const MAX_TITLE_LENGTH = 150;

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

const REQUEST_COLUMNS = `
    r.svr_id, r.svr_status, r.svr_status_reason, r.svr_contact_name, r.svr_contact_phone, r.svr_contact_email, r.svr_contact_line,
    r.svr_company_name, r.svr_tax_id, r.svr_address, r.svr_note, r.svr_vat_rate, r.svr_client_id, r.svr_quotation_id, r.svr_project_id,
    r.svr_version, DATE_FORMAT(r.svr_submitted_at, '%Y-%m-%d %H:%i') AS svr_submitted_at,
    r.svr_price_response, DATE_FORMAT(r.svr_price_response_at, '%Y-%m-%d %H:%i') AS svr_price_response_at, r.svr_price_response_note,
    r.svr_price_skip_reason,
    DATE_FORMAT(r.svr_consent_at, '%Y-%m-%d %H:%i') AS svr_consent_at,
    r.svr_assignee_id, CONCAT(a.user_fname, ' ', a.user_lname) AS assignee_name,
    l.ol_id, l.ol_kind, l.ol_name, l.ol_buyer_name, l.ol_project_id, c.client_name, lp.project_name AS link_project_name,
    q.qt_number, q.qt_status, p.project_name`;

const REQUEST_FROM = `
    FROM tb_service_requests r
    JOIN tb_order_links l ON l.ol_id = r.svr_link_id
    LEFT JOIN tb_users a ON a.user_id = r.svr_assignee_id
    LEFT JOIN tb_clients c ON c.client_id = r.svr_client_id
    LEFT JOIN tb_quotations q ON q.qt_id = r.svr_quotation_id
    LEFT JOIN tb_projects p ON p.project_id = r.svr_project_id
    LEFT JOIN tb_projects lp ON lp.project_id = l.ol_project_id`;

async function findItems(conn, requestIds) {
    if (requestIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT i.svi_id, i.svi_request_id, i.svi_order, i.svi_type, i.svi_product_id, i.svi_package_id, i.svi_name, i.svi_unit, i.svi_unit_price,
                i.svi_quantity, i.svi_adjusted_quantity, i.svi_adjusted_unit_price, i.svi_is_removed, i.svi_added_by_staff, i.svi_is_preset, i.svi_percent,
                i.svi_needs_price, DATE_FORMAT(i.svi_price_confirmed_at, '%Y-%m-%d %H:%i') AS svi_price_confirmed_at,
                CONCAT(u.user_fname, ' ', u.user_lname) AS price_confirmed_by_name, p.product_price_note AS price_note
         FROM tb_service_request_items i
         LEFT JOIN tb_users u ON u.user_id = i.svi_price_confirmed_by
         LEFT JOIN tb_products p ON p.product_id = i.svi_product_id
         WHERE i.svi_request_id IN (?) ORDER BY i.svi_request_id, i.svi_order`,
        [requestIds],
    );
    const byRequest = new Map();
    for (const row of rows) {
        const list = byRequest.get(row.svi_request_id) ?? [];
        list.push({
            ...row,
            svi_is_removed: Boolean(row.svi_is_removed),
            svi_added_by_staff: Boolean(row.svi_added_by_staff),
            svi_is_preset: Boolean(row.svi_is_preset),
            svi_needs_price: Boolean(row.svi_needs_price),
        });
        byRequest.set(row.svi_request_id, list);
    }
    return byRequest;
}

/**
 * แถวหลังปรับ (ไม่รวมที่เอาออก) · หัวข้อชุดเหลือเฉพาะชุดที่ยังมีรายการ
 * แถว % (งานด่วน ฯลฯ): ราคา = % × ผลรวมแถวราคาตายตัวหลังปรับ จำนวน 1 · ใช้ต่อในยอดรวม ใบเสนอราคา และหน้าจอ
 */
function effectiveRows(items) {
    const kept = items
        .filter((row) => !row.svi_is_removed)
        .map((row) => ({
            ...row,
            unit_price: row.svi_adjusted_unit_price ?? row.svi_unit_price,
            quantity: row.svi_adjusted_quantity ?? row.svi_quantity,
        }));
    const base = fixedSubtotal(kept.filter((row) => row.svi_type === "item").map((row) => ({ unitPrice: row.unit_price, quantity: row.quantity, percent: row.svi_percent })));
    for (const row of kept) {
        if (!row.svi_percent) continue;
        row.unit_price = text(percentAmount(base, row.svi_percent));
        row.quantity = "1.00";
    }
    return kept.filter((row) => row.svi_type === "item" || kept.some((item) => item.svi_type === "item" && item.svi_package_id === row.svi_package_id));
}

function totalsOf(lines, vatRate) {
    const totals = cartTotals({ lines, vatRate });
    return { subtotal: text(totals.subtotal), vat: text(totals.vat), total: text(totals.total) };
}

/** แถวราคาเริ่มต้นที่ยังไม่ยืนยันราคา (ไม่นับแถวที่เอาออก) */
function pendingPriceRows(items) {
    return items.filter((row) => row.svi_type === "item" && row.svi_needs_price && !row.svi_is_removed && !row.svi_price_confirmed_at);
}

/** ออกเอกสาร/เปิดงานได้เมื่อยืนยันราคาเริ่มต้นครบ (หน้าคำขอถามด้วยหน้าต่างตรวจราคาก่อนเสมอ ถึงตรงนี้ = หน้าเก่า/ยิงตรง) */
function assertPricesConfirmed(items) {
    const pending = pendingPriceRows(items);
    if (pending.length === 0) return;
    throw new AppError(409, "PRICE_NOT_CONFIRMED", `ตรวจราคาก่อน: ${pending.map((row) => row.svi_name).join(", ")} เป็นราคาเริ่มต้น · กรอกราคาจริงในหน้าต่างตรวจราคา`, {
        prices: pending.map((row) => row.svi_id).join(","),
    });
}

/** แถวของลูกค้าที่ทีมปรับราคาขึ้นจากที่ลูกค้าเห็นตอนเลือก (ต้องให้ลูกค้ายืนยัน · ลดราคาไม่ต้อง) */
function raisedPriceRows(items) {
    return items.filter(
        (row) =>
            row.svi_type === "item" &&
            !row.svi_added_by_staff &&
            !row.svi_is_removed &&
            !row.svi_percent &&
            row.svi_adjusted_unit_price !== null &&
            parseHundredths(row.svi_adjusted_unit_price, "ราคา") > parseHundredths(row.svi_unit_price, "ราคา"),
    );
}

/** ยอดที่ลูกค้าส่ง (แถวลูกค้า ค่า ณ วันส่ง) */
function submittedTotals(items, vatRate) {
    const lines = items
        .filter((row) => row.svi_type === "item" && !row.svi_added_by_staff)
        .map((row) => (row.svi_percent ? { percent: row.svi_percent } : { unitPrice: row.svi_unit_price, quantity: row.svi_quantity }));
    return totalsOf(lines, vatRate);
}

/** ยอดหลังปรับ */
function adjustedTotals(items, vatRate) {
    const lines = effectiveRows(items)
        .filter((row) => row.svi_type === "item")
        .map((row) => ({ unitPrice: row.unit_price, quantity: row.quantity }));
    return totalsOf(lines, vatRate);
}

/** รายการคำขอ ใหม่สุดก่อน · ?status= ?link= กรอง · นับรอตรวจ (ตัวเลขในเมนู) */
async function listRequests(conn, { status, linkId } = {}) {
    const conditions = [];
    const params = [];
    if (STATUSES.has(status)) {
        conditions.push("r.svr_status = ?");
        params.push(status);
    }
    if (Number.isInteger(linkId) && linkId > 0) {
        conditions.push("r.svr_link_id = ?");
        params.push(linkId);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await conn.query(`SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} ${where} ORDER BY r.svr_submitted_at DESC LIMIT 300`, params);
    const items = await findItems(conn, rows.map((row) => row.svr_id));
    const [[{ waiting }]] = await conn.query("SELECT COUNT(*) AS waiting FROM tb_service_requests WHERE svr_status = 'submitted'");
    const [[{ awaitingCustomer }]] = await conn.query("SELECT COUNT(*) AS awaitingCustomer FROM tb_service_requests WHERE svr_status = 'awaiting_customer'");
    return {
        data: rows.map((row) => {
            const list = effectiveRows(items.get(row.svr_id) ?? []);
            return {
                ...row,
                item_count: list.filter((item) => item.svi_type === "heading" || (item.svi_type === "item" && !item.svi_package_id)).length,
                price_pending_count: pendingPriceRows(items.get(row.svr_id) ?? []).length,
                totals: adjustedTotals(items.get(row.svr_id) ?? [], row.svr_vat_rate),
            };
        }),
        waiting_count: Number(waiting),
        awaiting_customer_count: Number(awaitingCustomer),
    };
}

/** ลูกค้าเดิมที่น่าจะเป็นคนเดียวกัน (เบอร์ · อีเมล · เลขผู้เสียภาษี · ชื่อ) */
async function clientMatches(conn, request) {
    const digits = String(request.svr_contact_phone ?? "").replace(/\D/g, "");
    const conditions = [];
    const params = [];
    if (digits.length >= 9) {
        conditions.push("REGEXP_REPLACE(client_phone, '[^0-9]', '') = ?");
        params.push(digits);
    }
    if (request.svr_contact_email) {
        conditions.push("LOWER(client_email) = LOWER(?)");
        params.push(request.svr_contact_email);
    }
    if (request.svr_tax_id) {
        conditions.push("REGEXP_REPLACE(client_tax_id, '[^0-9]', '') = ?");
        params.push(String(request.svr_tax_id).replace(/\D/g, ""));
    }
    for (const name of [request.svr_company_name, request.svr_contact_name]) {
        if (!name || name.trim().length < 3) continue;
        conditions.push("(client_name LIKE ? OR client_company LIKE ? OR client_contact_name LIKE ?)");
        const like = `%${name.trim()}%`;
        params.push(like, like, like);
    }
    if (conditions.length === 0) return [];
    const [rows] = await conn.query(
        `SELECT client_id, client_name, client_company, client_phone, client_email
         FROM tb_clients WHERE ${conditions.join(" OR ")} ORDER BY client_name LIMIT 5`,
        params,
    );
    return rows;
}

async function findRequest(conn, requestId) {
    const [[row]] = await conn.query(`SELECT ${REQUEST_COLUMNS} ${REQUEST_FROM} WHERE r.svr_id = ?`, [requestId]);
    if (!row) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้ กรุณาโหลดหน้าใหม่");
    const items = (await findItems(conn, [requestId])).get(requestId) ?? [];
    // โหลดตอนเรียกใช้ (กันวงจร require กับ order-public.service)
    const { findAnswers } = require("./order-public.service");
    const totals = adjustedTotals(items, row.svr_vat_rate);
    // แถว %: ยอดตอนนี้ (คิดจากแถวอื่นหลังปรับ) ให้หน้าจอแสดง · แถวที่เอาออกแล้ว = ว่าง
    const effectivePrices = new Map(effectiveRows(items).filter((item) => item.svi_percent).map((item) => [item.svi_id, item.unit_price]));
    for (const item of items) {
        if (item.svi_percent) item.percent_amount = effectivePrices.get(item.svi_id) ?? null;
    }
    const answers = await findAnswers(conn, requestId);
    await attachRelatedAnswers(conn, items, answers);
    return {
        request: row,
        items,
        totals,
        submitted_totals: submittedTotals(items, row.svr_vat_rate),
        price_pending_ids: pendingPriceRows(items).map((item) => item.svi_id),
        raised_price_ids: raisedPriceRows(items).map((item) => item.svi_id),
        answers,
        client_matches: row.svr_client_id ? [] : await clientMatches(conn, row),
        fastwork_plan: row.ol_kind === "fastwork" ? await fastworkPlanOf(conn, row, items, totals) : null,
    };
}

/**
 * แถวราคาเริ่มต้น: คำตอบของคำถามที่สินค้านั้นเลือก (รวมข้อลูก) ไว้ข้างช่องราคา เช่น "ชื่อโดเมนที่อยากได้"
 * (สินค้าเลือกคำถาม 2026-11-01 · ไฟล์แนบดูในส่วนความต้องการ)
 */
async function attachRelatedAnswers(conn, items, answers) {
    const priceRows = items.filter((item) => item.svi_needs_price && item.svi_product_id);
    if (priceRows.length === 0 || answers.length === 0) return;
    const [links] = await conn.query("SELECT pq_product_id, pq_question_id FROM tb_product_questions WHERE pq_product_id IN (?)", [
        [...new Set(priceRows.map((item) => item.svi_product_id))],
    ]);
    const parentIds = [...new Set(links.map((link) => link.pq_question_id))];
    const [children] = parentIds.length
        ? await conn.query("SELECT rqq_id, rqq_parent_id FROM tb_requirement_questions WHERE rqq_parent_id IN (?)", [parentIds])
        : [[]];
    for (const item of priceRows) {
        const questionIds = new Set(links.filter((link) => link.pq_product_id === item.svi_product_id).map((link) => link.pq_question_id));
        for (const child of children) if (questionIds.has(child.rqq_parent_id)) questionIds.add(child.rqq_id);
        item.related_answers = answers
            .filter((answer) => questionIds.has(answer.question_id) && answer.answer)
            .map((answer) => ({ question: answer.question, answer: answer.answer }));
    }
}

/**
 * ค่าที่เติมให้ตอนรับงาน Fastwork (S-5): ชื่องาน · ลูกค้า · งวด (จากงวดของใบภายในฉบับล่าสุด หรือ 1 งวด = ยอด)
 * รับงานได้เมื่อยังไม่ผูกงาน และคำขอยังไม่ถูกปิด · ใบภายในยังไม่อนุมัติ = บอกเหตุผล
 */
async function fastworkPlanOf(conn, request, items, totals) {
    const { latestQuotation } = require("./order-public.service");
    const quotation = request.svr_quotation_id ? await latestQuotation(conn, request.svr_quotation_id) : null;
    let milestones = [{ fwm_name: "ทั้งงาน", fwm_amount: totals.total }];
    if (quotation && USABLE_QUOTATION_STATUSES.has(quotation.qt_status)) {
        const [rows] = await conn.query("SELECT qtm_name, qtm_amount FROM tb_quotation_milestones WHERE qtm_quotation_id = ? ORDER BY qtm_order", [quotation.qt_id]);
        milestones = rows.length > 0 ? rows.map((row) => ({ fwm_name: row.qtm_name, fwm_amount: row.qtm_amount })) : [{ fwm_name: "ทั้งงาน", fwm_amount: quotation.qt_total }];
    }
    const isOpen = ["submitted", "converted"].includes(request.svr_status) && !request.svr_project_id;
    let blockedReason = null;
    if (quotation && PENDING_QUOTATION_STATUSES.has(quotation.qt_status)) {
        blockedReason = `ใบเสนอราคาภายใน ${quotation.qt_number} ยังไม่อนุมัติ · อนุมัติก่อน หรือยกเลิกใบแล้วรับงานจากรายการในคำขอ`;
    }
    return {
        mode: request.ol_project_id ? "existing" : "new",
        can_take: isOpen && !blockedReason,
        blocked_reason: isOpen ? blockedReason : null,
        title: titleOf(orderedRows(items)),
        client_id: request.svr_client_id,
        client_name: request.client_name ?? request.ol_buyer_name,
        quotation: quotation ? { qt_id: quotation.qt_id, qt_number: quotation.qt_number, qt_revision: quotation.qt_revision, qt_status: quotation.qt_status } : null,
        milestones,
    };
}

/** ไฟล์แนบของคำตอบ (เปิดได้เฉพาะผู้มีสิทธิ์) */
async function findFile(conn, requestId, fileId) {
    const [[file]] = await conn.query(
        `SELECT f.svf_file_path, f.svf_original_name FROM tb_service_request_files f
         JOIN tb_service_request_answers a ON a.sva_id = f.svf_answer_id
         WHERE f.svf_id = ? AND a.sva_request_id = ?`,
        [fileId, requestId],
    );
    if (!file) throw new AppError(404, "SERVICE_REQUEST_FILE_NOT_FOUND", "ไม่พบไฟล์นี้");
    return file;
}

// ─── ตรวจ / ปรับ / ยืนยัน ─────────────────────────────────────────────────────────────────

/**
 * ล็อกคำขอ · เวอร์ชันไม่ตรง = มีคนแก้ไปก่อน · แก้ได้เฉพาะคำขอที่ยังรอตรวจ
 * allowAwaiting: คำขอที่รอลูกค้ายืนยันราคา ทีมยังแก้รายการ/ราคา/ปฏิเสธได้
 */
async function lockSubmitted(conn, requestId, expectedVersion, { allowAwaiting = false } = {}) {
    const [[request]] = await conn.query(
        `SELECT r.svr_id, r.svr_status, r.svr_version, r.svr_client_id, r.svr_vat_rate, l.ol_kind, l.ol_buyer_name
         FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         WHERE r.svr_id = ? FOR UPDATE`,
        [requestId],
    );
    if (!request) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้ กรุณาโหลดหน้าใหม่");
    if (request.svr_version !== expectedVersion) {
        throw new AppError(409, "SERVICE_REQUEST_CHANGED", "คำขอนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (request.svr_status === "awaiting_customer" && !allowAwaiting) {
        throw new AppError(409, "SERVICE_REQUEST_AWAITING_CUSTOMER", "คำขอนี้รอลูกค้ายืนยันราคาอยู่ · แก้ราคาใหม่ได้ (ลูกค้าต้องยืนยันใหม่) หรือรอลูกค้าตอบ");
    }
    if (request.svr_status !== "submitted" && request.svr_status !== "awaiting_customer") {
        throw new AppError(409, "SERVICE_REQUEST_DONE", "คำขอนี้ดำเนินการไปแล้ว แก้ไม่ได้");
    }
    return request;
}

async function bumpVersion(conn, requestId) {
    await conn.query("UPDATE tb_service_requests SET svr_version = svr_version + 1 WHERE svr_id = ?", [requestId]);
}

async function bindClient(conn, requestId, input) {
    await lockSubmitted(conn, requestId, input.svr_version);
    const [[client]] = await conn.query("SELECT client_id FROM tb_clients WHERE client_id = ?", [input.client_id]);
    if (!client) throw validationError({ client_id: "ไม่พบลูกค้านี้ กรุณาเลือกใหม่" });
    await conn.query("UPDATE tb_service_requests SET svr_client_id = ?, svr_version = svr_version + 1 WHERE svr_id = ?", [input.client_id, requestId]);
    return findRequest(conn, requestId);
}

const sameDecimal = (first, second) => parseHundredths(first, "ค่า") === parseHundredths(second, "ค่า");

/**
 * ปรับรายการ: แถวของลูกค้าเก็บค่าที่ปรับแยก (เหมือนเดิม = ไม่นับว่าปรับ) · แถวที่ผู้รับผิดชอบเพิ่มแทนชุดเดิมทั้งหมด
 * ต้องส่งแถวของลูกค้าครบทุกแถว (ไม่ลบแถวลูกค้า ใช้ is_removed แทน)
 */
async function updateItems(conn, actor, requestId, input) {
    await lockSubmitted(conn, requestId, input.svr_version, { allowAwaiting: true });
    const items = (await findItems(conn, [requestId])).get(requestId) ?? [];
    const customerRows = items.filter((row) => row.svi_type === "item" && !row.svi_added_by_staff);
    const sentIds = new Set(input.items.filter((row) => row.svi_id).map((row) => row.svi_id));
    if (customerRows.some((row) => !sentIds.has(row.svi_id))) {
        throw new AppError(409, "SERVICE_REQUEST_CHANGED", "รายการในคำขอเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    const byId = new Map(customerRows.map((row) => [row.svi_id, row]));
    if (input.items.some((row) => !row.is_removed) === false) throw validationError({ items: "ต้องเหลืออย่างน้อย 1 รายการ" });

    for (const row of input.items) {
        if (!row.svi_id) continue;
        const original = byId.get(row.svi_id);
        if (!original) throw validationError({ items: "บางแถวไม่ใช่รายการของคำขอนี้ กรุณาโหลดหน้าใหม่" });
        // แถว %: ปรับราคา/จำนวนไม่ได้ (คิดจากแถวอื่น) · เอาออก/คืนได้
        if (original.svi_percent) {
            await conn.query("UPDATE tb_service_request_items SET svi_is_removed = ? WHERE svi_id = ?", [row.is_removed ? 1 : 0, row.svi_id]);
            continue;
        }
        const adjustedPrice = sameDecimal(row.unit_price, original.svi_unit_price) ? null : row.unit_price;
        const currentPrice = original.svi_adjusted_unit_price ?? original.svi_unit_price;
        // ราคาเริ่มต้น: แก้ราคาในตาราง = ทีมตรวจราคาแล้ว (หน้าต่างตรวจราคาไม่ถามแถวนี้อีก)
        const isPriceConfirmedNow = original.svi_needs_price && !sameDecimal(row.unit_price, currentPrice);
        await conn.query(
            `UPDATE tb_service_request_items SET svi_adjusted_quantity = ?, svi_adjusted_unit_price = ?, svi_is_removed = ?
                ${isPriceConfirmedNow ? ", svi_price_confirmed_at = ?, svi_price_confirmed_by = ?" : ""}
             WHERE svi_id = ?`,
            [
                sameDecimal(row.quantity, original.svi_quantity) ? null : row.quantity,
                adjustedPrice,
                row.is_removed ? 1 : 0,
                ...(isPriceConfirmedNow ? [nowBangkokText(), actor.user_id] : []),
                row.svi_id,
            ],
        );
    }
    // แถวที่เพิ่มเอง: แทนชุดเดิมทั้งหมด (ต่อท้ายคำขอ)
    await conn.query("DELETE FROM tb_service_request_items WHERE svi_request_id = ? AND svi_added_by_staff = 1", [requestId]);
    const [[{ lastOrder }]] = await conn.query("SELECT COALESCE(MAX(svi_order), 0) AS lastOrder FROM tb_service_request_items WHERE svi_request_id = ?", [requestId]);
    let order = Number(lastOrder);
    for (const row of input.items.filter((item) => !item.svi_id && !item.is_removed)) {
        if (row.package_id) {
            const [[productPackage]] = await conn.query("SELECT pkg_id FROM tb_product_packages WHERE pkg_id = ?", [row.package_id]);
            if (!productPackage) throw validationError({ items: `ไม่พบชุด ${row.name} กรุณาเลือกใหม่` });
        }
        // หัวข้อชุดที่ทีมเพิ่ม: ชื่อชุด + จำนวนชุด (ไม่มีราคา · ยอดมาจากรายการในชุดที่ตามมา)
        if (row.type === "heading") {
            if (!row.package_id) throw validationError({ items: "หัวข้อชุดต้องอ้างชุดรายการ" });
            order += 1;
            await conn.query(
                `INSERT INTO tb_service_request_items
                    (svi_request_id, svi_order, svi_type, svi_package_id, svi_name, svi_unit, svi_unit_price, svi_quantity, svi_added_by_staff)
                 VALUES (?, ?, 'heading', ?, ?, 'ชุด', NULL, ?, 1)`,
                [requestId, order, row.package_id, row.name, row.quantity],
            );
            continue;
        }
        let needsPrice = false;
        if (row.product_id) {
            const [[product]] = await conn.query("SELECT product_id, product_price_mode FROM tb_products WHERE product_id = ?", [row.product_id]);
            if (!product) throw validationError({ items: `ไม่พบสินค้า ${row.name} กรุณาเลือกใหม่` });
            needsPrice = product.product_price_mode === "from";
        }
        order += 1;
        // ทีมเพิ่มสินค้าราคาเริ่มต้นเอง = ทีมใส่ราคาจริงตรงนั้น ถือว่ายืนยันแล้ว
        await conn.query(
            `INSERT INTO tb_service_request_items
                (svi_request_id, svi_order, svi_type, svi_product_id, svi_package_id, svi_name, svi_unit, svi_unit_price, svi_quantity, svi_added_by_staff,
                 svi_needs_price, svi_price_confirmed_at, svi_price_confirmed_by)
             VALUES (?, ?, 'item', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
            [
                requestId, order, row.product_id, row.package_id, row.name, row.unit, row.unit_price, row.quantity,
                needsPrice ? 1 : 0, needsPrice ? nowBangkokText() : null, needsPrice ? actor.user_id : null,
            ],
        );
    }
    await backToTeam(conn, requestId);
    return findRequest(conn, requestId);
}

/** รอลูกค้ายืนยันราคาอยู่แล้วทีมแก้ = กลับมารอตรวจ (ยืนยันคำขออีกครั้ง ลูกค้ายืนยันราคาใหม่) · เวอร์ชัน +1 เสมอ */
async function backToTeam(conn, requestId) {
    await conn.query(
        `UPDATE tb_service_requests SET svr_status = IF(svr_status = 'awaiting_customer', 'submitted', svr_status), svr_version = svr_version + 1
         WHERE svr_id = ?`,
        [requestId],
    );
}

/**
 * ยืนยันราคาแถวราคาเริ่มต้น (หน้าต่าง "ตรวจราคาก่อนสร้างใบ") · ราคาเดิม = ยืนยันว่าใช้ราคาเริ่มต้น (Q2 ข)
 * ส่งได้เฉพาะแถวราคาเริ่มต้นที่ยังอยู่ในคำขอ · แถวที่ยืนยันแล้วส่งซ้ำได้ (แก้ราคาอีกครั้ง)
 */
async function confirmPrices(conn, actor, requestId, input) {
    await lockSubmitted(conn, requestId, input.svr_version, { allowAwaiting: true });
    const items = (await findItems(conn, [requestId])).get(requestId) ?? [];
    const byId = new Map(items.map((row) => [row.svi_id, row]));
    const confirmedAt = nowBangkokText();
    for (const price of input.prices) {
        const row = byId.get(price.svi_id);
        if (!row || row.svi_type !== "item" || !row.svi_needs_price || row.svi_is_removed) {
            throw validationError({ prices: "บางแถวไม่ใช่รายการราคาเริ่มต้นของคำขอนี้ กรุณาโหลดหน้าใหม่" });
        }
        await conn.query(
            "UPDATE tb_service_request_items SET svi_adjusted_unit_price = ?, svi_price_confirmed_at = ?, svi_price_confirmed_by = ? WHERE svi_id = ?",
            [sameDecimal(price.unit_price, row.svi_unit_price) ? null : price.unit_price, confirmedAt, actor.user_id, row.svi_id],
        );
    }
    await backToTeam(conn, requestId);
    return findRequest(conn, requestId);
}

/**
 * ปฏิเสธ (ลูกค้าตรง) หรือปิดเพราะไม่ได้งาน (Fastwork) · เหตุผลเป็นข้อมูลภายใน
 * Fastwork ที่ออกใบภายในแล้วแต่ผู้ซื้อไม่จ้าง (ยังไม่ผูกงาน) ปิดได้ด้วย
 */
async function finish(conn, requestId, input, status) {
    const [[current]] = await conn.query(
        `SELECT r.svr_status, r.svr_version, r.svr_project_id, l.ol_kind FROM tb_service_requests r
         JOIN tb_order_links l ON l.ol_id = r.svr_link_id WHERE r.svr_id = ? FOR UPDATE`,
        [requestId],
    );
    const isUnhiredFastwork = current?.ol_kind === "fastwork" && current.svr_status === "converted" && !current.svr_project_id;
    if (!(status === "closed" && isUnhiredFastwork && current.svr_version === input.svr_version)) {
        await lockSubmitted(conn, requestId, input.svr_version, { allowAwaiting: true });
    }
    await conn.query(
        "UPDATE tb_service_requests SET svr_status = ?, svr_status_reason = ?, svr_version = svr_version + 1 WHERE svr_id = ?",
        [status, input.reason, requestId],
    );
    return findRequest(conn, requestId);
}

/**
 * แถวสำหรับใบเสนอราคา/งาน: รายการเดี่ยวก่อน แล้วตามด้วยชุด (หัวข้อ + รายการในชุด)
 * (หัวข้อจัดกลุ่มรายการที่ตามมา · รายการเดี่ยวที่อยู่หลังหัวข้อจะถูกนับเป็นของชุดนั้น)
 */
function orderedRows(items) {
    const rows = effectiveRows(items);
    const standalone = rows.filter((row) => row.svi_type === "item" && !row.svi_package_id);
    const packageRows = rows.filter((row) => row.svi_package_id);
    return [...standalone, ...packageRows];
}

/** ชื่อเรื่อง/ชื่อโปรเจกต์จากสิ่งที่เลือก เช่น "เว็บไซต์ร้าน + แพ็กเว็บเริ่มต้น" */
function titleOf(rows) {
    const names = rows.filter((row) => row.svi_type === "heading" || !row.svi_package_id).map((row) => row.svi_name);
    const title = names.join(" + ") || "บริการตามคำขอ";
    return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;
}

async function headOfficeBranchId(conn) {
    const [[branch]] = await conn.query(
        "SELECT branch_id FROM tb_branches WHERE branch_status = 'active' ORDER BY branch_code = '00000' DESC, branch_code LIMIT 1",
    );
    if (!branch) throw new AppError(409, "NO_BRANCH", "ยังไม่มีสาขาที่ใช้งานในตั้งค่าบริษัท");
    return branch.branch_id;
}

/**
 * ยืนยันคำขอ (ลูกค้าตรง)
 * @returns {Promise<{ svr_id: string, qt_id?: string, project_id?: string }>}
 */
async function confirm(conn, actor, requestId, input) {
    const request = await lockSubmitted(conn, requestId, input.svr_version);
    const isFastwork = request.ol_kind === "fastwork";
    if (isFastwork && !input.create_quotation) {
        throw new AppError(409, "SERVICE_REQUEST_FASTWORK", "คำขอจาก Fastwork เปิดงานด้วยปุ่ม \"รับงานจากคำขอนี้\" (มีงวดงาน Fastwork)");
    }
    // Fastwork: ใบภายในต้องมีลูกค้า → ไม่ได้ผูก = สร้างลูกค้าบุคคลจากชื่อผู้ซื้อ
    if (isFastwork && !request.svr_client_id) {
        const { resolveClient } = require("./fastwork.service");
        request.svr_client_id = await resolveClient(conn, { client_id: null, client_name: request.ol_buyer_name || "ผู้ซื้อ Fastwork" });
        await conn.query("UPDATE tb_service_requests SET svr_client_id = ? WHERE svr_id = ?", [request.svr_client_id, requestId]);
    }
    if (!request.svr_client_id) throw validationError({ client_id: "ผูกลูกค้าเดิมหรือสร้างลูกค้าใหม่ก่อนยืนยัน" }, "ยังไม่ได้ผูกลูกค้า");
    const items = (await findItems(conn, [requestId])).get(requestId) ?? [];
    assertPricesConfirmed(items);
    const rows = orderedRows(items);
    if (!rows.some((row) => row.svi_type === "item")) throw validationError({ items: "ต้องเหลืออย่างน้อย 1 รายการ" });
    const title = titleOf(rows);
    const sourceNote = `จากคำขอบริการ ${requestId}`;

    if (input.create_quotation) {
        if (!hasBit(actor.role_permission, "createQuotation")) {
            throw new AppError(403, "CANNOT_CREATE_QUOTATION", "คุณไม่มีสิทธิ์สร้างใบเสนอราคา · ไม่ติ๊กออกใบเสนอราคา หรือให้ผู้มีสิทธิ์ยืนยันแทน");
        }
        const draft = validate(quotationDraftSchema, {
            qt_client_id: request.svr_client_id,
            qt_branch_id: await headOfficeBranchId(conn),
            qt_title: title,
            qt_internal_note: isFastwork ? `${sourceNote} · เอกสารภายในของงาน Fastwork (ไม่ส่งลูกค้า)` : sourceNote,
            items: rows.map((row) =>
                row.svi_type === "heading"
                    ? { qti_type: "heading", qti_package_id: row.svi_package_id, qti_description: row.svi_name }
                    : {
                          qti_type: "item",
                          qti_product_id: row.svi_product_id,
                          qti_package_id: row.svi_package_id,
                          qti_description: row.svi_name,
                          qti_quantity: row.quantity,
                          qti_unit: row.svi_unit,
                          qti_unit_price: row.unit_price,
                          qti_list_price: row.svi_unit_price,
                      },
            ),
        });
        const { qt_id: quotationId } = await quotationService.createDraft(conn, draft, actor);
        await conn.query(
            "UPDATE tb_service_requests SET svr_status = 'converted', svr_quotation_id = ?, svr_version = svr_version + 1 WHERE svr_id = ?",
            [quotationId, requestId],
        );
        return { svr_id: requestId, qt_id: quotationId };
    }

    if (!hasBit(actor.role_permission, "createProject")) {
        throw new AppError(403, "CANNOT_CREATE_PROJECT", "คุณไม่มีสิทธิ์สร้างโปรเจกต์ · ติ๊กออกใบเสนอราคาแทน หรือให้ผู้มีสิทธิ์ยืนยัน");
    }
    // ราคาสูงขึ้นจากที่ลูกค้าเห็น (ข้อ 2.7): ให้ลูกค้ายืนยันในหน้าสถานะก่อน · ไม่ให้ยืนยัน = ต้องมีเหตุผล
    if (raisedPriceRows(items).length > 0) {
        if (input.ask_customer_price) {
            await conn.query(
                `UPDATE tb_service_requests SET svr_status = 'awaiting_customer', svr_price_response = NULL, svr_price_response_at = NULL,
                    svr_price_response_note = NULL, svr_price_skip_reason = NULL, svr_version = svr_version + 1
                 WHERE svr_id = ?`,
                [requestId],
            );
            return { svr_id: requestId, awaiting_customer: true };
        }
        if (!input.price_skip_reason) {
            throw validationError({ price_skip_reason: "บอกเหตุผลที่ไม่ให้ลูกค้ายืนยันราคาใหม่ เช่น ลูกค้าตกลงทางโทรศัพท์แล้ว" });
        }
        await conn.query("UPDATE tb_service_requests SET svr_price_skip_reason = ? WHERE svr_id = ?", [input.price_skip_reason, requestId]);
    }
    return openProjectFromRequest(conn, actor, requestId, request.svr_client_id, rows, `ยืนยันเมื่อ ${nowBangkokText().slice(0, 16)}`);
}

/** เปิดโปรเจกต์ + งานจากรายการของคำขอ (ทีมยืนยัน หรือลูกค้ายืนยันราคาใหม่ในหน้าสถานะ) */
async function openProjectFromRequest(conn, actor, requestId, clientId, rows, whenText) {
    const title = titleOf(rows);
    const sourceNote = `จากคำขอบริการ ${requestId}`;
    const project = await projectService.insertProject(
        conn,
        { project_name: title, client_id: clientId, project_description: `${sourceNote} (${whenText})` },
        actor.user_id,
    );
    await insertTasksFromRows(
        conn,
        project.project_id,
        rows.map((row) => ({ type: row.svi_type, description: row.svi_name })),
        sourceNote,
    );
    await conn.query(
        "UPDATE tb_service_requests SET svr_status = 'converted', svr_project_id = ?, svr_version = svr_version + 1 WHERE svr_id = ?",
        [project.project_id, requestId],
    );
    return { svr_id: requestId, project_id: project.project_id };
}

// ─── Fastwork: รับงานจากคำขอ (S-5) ────────────────────────────────────────────────────

const USABLE_QUOTATION_STATUSES = new Set(["approved", "sent"]);
const PENDING_QUOTATION_STATUSES = new Set(["draft", "pending_approval"]);

/**
 * ผูกคำขอ Fastwork กับงาน Fastwork: งานจากรายการ (ใบภายในที่อนุมัติแล้ว = ตอบรับใบเข้างาน · ไม่มี/ใช้ไม่ได้ = จากรายการในคำขอ)
 * isNewProject = เปิดงานใหม่จากหน้ารับงาน (ลิงก์ต้องไม่ผูกงาน) · ไม่ใช่ = งานเดิมของลิงก์
 */
async function attachFastworkRequest(conn, actor, requestId, projectId, { isNewProject, expectedVersion = null }) {
    const [[request]] = await conn.query(
        `SELECT r.svr_id, r.svr_status, r.svr_version, r.svr_client_id, r.svr_quotation_id, r.svr_project_id, l.ol_kind, l.ol_project_id
         FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         WHERE r.svr_id = ? FOR UPDATE`,
        [requestId],
    );
    if (!request) throw validationError({ service_request_id: "ไม่พบคำขอนี้ กรุณาโหลดหน้าใหม่" });
    if (request.ol_kind !== "fastwork") throw validationError({ service_request_id: "คำขอนี้ไม่ได้มาจากลิงก์ Fastwork" });
    if (expectedVersion !== null && request.svr_version !== expectedVersion) {
        throw new AppError(409, "SERVICE_REQUEST_CHANGED", "คำขอนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
    }
    if (!["submitted", "converted"].includes(request.svr_status) || request.svr_project_id) {
        throw new AppError(409, "SERVICE_REQUEST_DONE", "คำขอนี้รับงานหรือปิดไปแล้ว");
    }
    if (isNewProject && request.ol_project_id) {
        throw new AppError(409, "SERVICE_REQUEST_HAS_PROJECT", "คำขอนี้มาจากลิงก์ของงานเดิม · ใช้ปุ่ม \"ลูกค้ายืนยันบน Fastwork แล้ว\" ในหน้าคำขอ");
    }
    const [[project]] = await conn.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [projectId]);
    const sourceNote = `จากคำขอบริการ ${requestId}`;
    assertPricesConfirmed((await findItems(conn, [requestId])).get(requestId) ?? []);

    const { latestQuotation } = require("./order-public.service");
    const quotation = request.svr_quotation_id ? await latestQuotation(conn, request.svr_quotation_id, { forUpdate: true }) : null;
    if (quotation && PENDING_QUOTATION_STATUSES.has(quotation.qt_status)) {
        throw new AppError(409, "QUOTATION_NOT_APPROVED", `ใบเสนอราคาภายใน ${quotation.qt_number} ยังไม่อนุมัติ · อนุมัติก่อน หรือยกเลิกใบแล้วรับงานจากรายการในคำขอ`);
    }
    if (quotation && USABLE_QUOTATION_STATUSES.has(quotation.qt_status)) {
        const [[quotationClient]] = await conn.query("SELECT qt_client_id FROM tb_quotations WHERE qt_id = ?", [quotation.qt_id]);
        if (quotationClient.qt_client_id !== project.client_id) {
            throw validationError({ client_id: "ใช้ลูกค้าเดียวกับใบเสนอราคาภายในของคำขอนี้" });
        }
        await acceptQuotation(
            conn,
            quotation.qt_id,
            { project_mode: "existing", project_id: projectId, create_tasks: true, qt_version: quotation.qt_version },
            actor,
            { isFastworkTakeJob: true },
        );
    } else {
        const items = (await findItems(conn, [requestId])).get(requestId) ?? [];
        await insertTasksFromRows(conn, projectId, orderedRows(items).map((row) => ({ type: row.svi_type, description: row.svi_name })), sourceNote);
    }
    await conn.query(
        `UPDATE tb_service_requests SET svr_status = 'converted', svr_project_id = ?, svr_client_id = COALESCE(svr_client_id, ?), svr_version = svr_version + 1
         WHERE svr_id = ?`,
        [projectId, project.client_id, requestId],
    );
    return { svr_id: requestId, project_id: projectId };
}

/** ลูกค้ายืนยันบน Fastwork แล้ว (ลิงก์ของงานเดิม): งวดเพิ่มต่อท้ายงวดเดิม + งานจากรายการ */
async function acceptOnFastwork(conn, actor, requestId, input) {
    if (!hasBit(actor.role_permission, "manageFastwork")) {
        throw new AppError(403, "CANNOT_MANAGE_FASTWORK", "เพิ่มงวดงาน Fastwork ต้องมีสิทธิ์จัดการงาน Fastwork");
    }
    const [[link]] = await conn.query(
        "SELECT l.ol_project_id FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id WHERE r.svr_id = ?",
        [requestId],
    );
    if (!link) throw new AppError(404, "SERVICE_REQUEST_NOT_FOUND", "ไม่พบคำขอนี้ กรุณาโหลดหน้าใหม่");
    if (!link.ol_project_id) {
        throw new AppError(409, "SERVICE_REQUEST_NO_PROJECT", "คำขอนี้ยังไม่มีงาน · ใช้ปุ่ม \"รับงานจากคำขอนี้\" เพื่อเปิดงาน Fastwork ใหม่");
    }
    const fastworkService = require("./fastwork.service");
    await fastworkService.lockFastworkProject(conn, link.ol_project_id);
    const [[project]] = await conn.query("SELECT project_status FROM tb_projects WHERE project_id = ?", [link.ol_project_id]);
    if (["completed", "cancelled"].includes(project.project_status)) {
        throw new AppError(409, "PROJECT_CLOSED", "งานนี้ปิดแล้ว เพิ่มงวดไม่ได้");
    }
    const result = await attachFastworkRequest(conn, actor, requestId, link.ol_project_id, { isNewProject: false, expectedVersion: input.svr_version });
    const [[{ lastOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(fwm_order), 0) AS lastOrder FROM tb_fastwork_milestones WHERE fwm_project_id = ?",
        [link.ol_project_id],
    );
    await fastworkService.insertMilestones(conn, link.ol_project_id, input.milestones, actor, Number(lastOrder) + 1);
    // เอกสารงาน Fastwork (2026-11-01): ไม่ได้รับผ่านใบภายในที่อนุมัติแล้ว = ระบบออกใบเสนอราคาของงวดที่เพิ่ม
    const [[usedQuotation]] = await conn.query(
        `SELECT q.qt_id FROM tb_service_requests r JOIN tb_quotations root ON root.qt_id = r.svr_quotation_id
         JOIN tb_quotations q ON q.qt_root_id = root.qt_root_id
         WHERE r.svr_id = ? AND q.qt_status = 'accepted' AND q.qt_project_id = ? LIMIT 1`,
        [requestId, link.ol_project_id],
    );
    if (!usedQuotation) await require("./fastwork-document.service").issueForAddedMilestones(conn, actor, link.ol_project_id, input.milestones);
    return result;
}

// ─── การ์ดความต้องการในหน้าโปรเจกต์ (S-4, S-5) ───────────────────────────────────────────

/**
 * คำขอที่เป็นที่มาของโปรเจกต์: เปิดโปรเจกต์จากคำขอโดยตรง · ผ่านใบเสนอราคา (ทุก revision) ที่ผูกโปรเจกต์นี้
 * · ส่งจากลิงก์ Fastwork ของงานนี้ (ยังไม่ถูกปิด/ปฏิเสธ)
 */
async function findProjectRequestIds(conn, projectId) {
    const [rows] = await conn.query(
        `SELECT r.svr_id FROM tb_service_requests r
         JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         LEFT JOIN tb_quotations q ON q.qt_id = r.svr_quotation_id
         WHERE r.svr_project_id = ?
            OR q.qt_root_id IN (SELECT x.qt_root_id FROM tb_quotations x WHERE x.qt_project_id = ?)
            OR (l.ol_project_id = ? AND r.svr_status IN ('submitted', 'converted'))
         ORDER BY r.svr_submitted_at`,
        [projectId, projectId, projectId],
    );
    return rows.map((row) => row.svr_id);
}

/** ลิงก์ Fastwork ของงานนี้ที่ยังเปิดรับ (ไว้บอกในการ์ด + ปุ่มปิดรับ) */
async function openProjectLinkCount(conn, projectId) {
    const { openStateOf } = require("./order-link.service");
    const { todayBangkok } = require("../utils/bangkok-time");
    const [links] = await conn.query(
        `SELECT l.ol_status, DATE_FORMAT(l.ol_expires_on, '%Y-%m-%d') AS ol_expires_on, p.project_status
         FROM tb_order_links l JOIN tb_projects p ON p.project_id = l.ol_project_id WHERE l.ol_project_id = ?`,
        [projectId],
    );
    const today = todayBangkok();
    return links.filter((link) => openStateOf(link, today) === "open").length;
}

/** ปิดรับความต้องการ: ปิดลิงก์ทุกอันของงานนี้ (เริ่มออกแบบแล้ว · แก้ต่อคุยในแชต Fastwork) */
async function closeProjectLinks(conn, projectId) {
    const [result] = await conn.query("UPDATE tb_order_links SET ol_status = 'disabled' WHERE ol_project_id = ? AND ol_status = 'active'", [projectId]);
    return { closed: result.affectedRows };
}

/** ความต้องการจากลูกค้าของโปรเจกต์ (สมาชิกเห็น · ไม่มีราคา เพราะสมาชิกบางคนไม่มีสิทธิ์ดูยอดเงิน) */
async function projectRequirements(conn, projectId) {
    return { data: await projectRequirementList(conn, projectId), open_link_count: await openProjectLinkCount(conn, projectId) };
}

async function projectRequirementList(conn, projectId) {
    const requestIds = await findProjectRequestIds(conn, projectId);
    if (requestIds.length === 0) return [];
    const [requests] = await conn.query(
        `SELECT svr_id, svr_contact_name, svr_company_name, svr_note, DATE_FORMAT(svr_submitted_at, '%Y-%m-%d %H:%i') AS svr_submitted_at
         FROM tb_service_requests WHERE svr_id IN (?) ORDER BY svr_submitted_at`,
        [requestIds],
    );
    const items = await findItems(conn, requestIds);
    const { findAnswers } = require("./order-public.service");
    const result = [];
    for (const request of requests) {
        result.push({
            ...request,
            items: effectiveRows(items.get(request.svr_id) ?? []).map((row) => ({
                type: row.svi_type,
                name: row.svi_name,
                quantity: row.quantity,
                unit: row.svi_unit,
                in_package: Boolean(row.svi_package_id) && row.svi_type === "item",
            })),
            answers: await findAnswers(conn, request.svr_id),
        });
    }
    return result;
}

async function findProjectFile(conn, projectId, fileId) {
    const requestIds = await findProjectRequestIds(conn, projectId);
    if (requestIds.length === 0) throw new AppError(404, "SERVICE_REQUEST_FILE_NOT_FOUND", "ไม่พบไฟล์นี้");
    const [[file]] = await conn.query(
        `SELECT f.svf_file_path, f.svf_original_name FROM tb_service_request_files f
         JOIN tb_service_request_answers a ON a.sva_id = f.svf_answer_id
         WHERE f.svf_id = ? AND a.sva_request_id IN (?)`,
        [fileId, requestIds],
    );
    if (!file) throw new AppError(404, "SERVICE_REQUEST_FILE_NOT_FOUND", "ไม่พบไฟล์นี้");
    return file;
}

module.exports = {
    attachFastworkRequest,
    acceptOnFastwork,
    closeProjectLinks,
    projectRequirements,
    findProjectFile,
    listRequests,
    findRequest,
    findFile,
    bindClient,
    updateItems,
    finish,
    findItems,
    confirm,
    confirmPrices,
    openProjectFromRequest,
    orderedRows,
    effectiveRows,
};
