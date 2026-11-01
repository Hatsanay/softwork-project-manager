// บริการรายรอบ: รายการต่ออายุ (2026-10-31 · docs/plans/2026-10-31-recurring-services.md ขั้น R-1)
//
// สิทธิ์ตามช่องทาง (ไม่เพิ่มบิตใหม่): ลูกค้าตรง = createInvoice · Fastwork = manageFastwork · เห็นเฉพาะช่องทางที่ตัวเองมีสิทธิ์
// วันครบรอบถัดไป = วันเริ่มของรอบที่ยังไม่ออก · วันครบใช้ anchor day (shared/renewal-math.mjs) · วันนี้ = เวลาไทย
// แก้/พัก/เปิดต่อ/ยกเลิก: ล็อกแถว + rnw_version กันแก้ทับกัน
const { hasBit } = require("../shared/permissions.mjs");
const { convertToBaht, divideRoundHalfUp, formatHundredths, parseHundredths } = require("../shared/money.mjs");
const {
    addCycle,
    anchorDayOf,
    daysBetweenDates,
    nextOpenStart,
    periodOf,
    shiftDays,
} = require("../shared/renewal-math.mjs");
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { todayBangkok } = require("../utils/bangkok-time");

// ใกล้ครบ = เหลือไม่เกินกี่วัน (Q4)
const DUE_SOON_DAYS = 30;
const CHANNEL_BITS = { direct: "createInvoice", fastwork: "manageFastwork" };
const TABS = ["due_soon", "overdue", "paused", "all"];

const RENEWAL_COLUMNS = `
    r.rnw_id, r.rnw_client_id, r.rnw_project_id, r.rnw_product_id, r.rnw_label, r.rnw_price, r.rnw_cycle_months,
    r.rnw_anchor_day, DATE_FORMAT(r.rnw_next_due_date, '%Y-%m-%d') AS rnw_next_due_date, r.rnw_channel, r.rnw_status,
    DATE_FORMAT(r.rnw_paused_on, '%Y-%m-%d') AS rnw_paused_on, r.rnw_end_reason, r.rnw_source, r.rnw_source_id, r.rnw_notes,
    r.rnw_version, DATE_FORMAT(r.rnw_created_at, '%Y-%m-%d %H:%i') AS rnw_created_at,
    c.client_name, c.client_status, p.product_name, p.product_unit, p.product_status, pj.project_name`;
const RENEWAL_FROM = `
    FROM tb_renewals r
    JOIN tb_clients c ON c.client_id = r.rnw_client_id
    JOIN tb_products p ON p.product_id = r.rnw_product_id
    LEFT JOIN tb_projects pj ON pj.project_id = r.rnw_project_id`;

/** ช่องทางที่ผู้ใช้จัดการได้ */
function channelsOf(rolePermission) {
    return Object.entries(CHANNEL_BITS)
        .filter(([, key]) => hasBit(rolePermission, key))
        .map(([channel]) => channel);
}

function assertChannel(actor, channel) {
    if (channelsOf(actor.role_permission).includes(channel)) return;
    const message =
        channel === "fastwork"
            ? "รายการของผู้ซื้อ Fastwork ต้องมีสิทธิ์จัดการงาน Fastwork"
            : "รายการของลูกค้าตรงต้องมีสิทธิ์สร้างใบแจ้งหนี้";
    throw new AppError(403, "RENEWAL_CHANNEL_FORBIDDEN", message);
}

function notFound() {
    return new AppError(404, "RENEWAL_NOT_FOUND", "ไม่พบรายการต่ออายุนี้");
}

function versionChanged() {
    return new AppError(409, "RENEWAL_CHANGED", "รายการนี้มีการแก้ไขไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
}

/** ใส่ช่วงบริการของรอบถัดไป + จำนวนวันที่เหลือ (ติดลบ = เลยกำหนด) */
function withDueInfo(row, today) {
    const period = periodOf(row.rnw_next_due_date, row.rnw_cycle_months, row.rnw_anchor_day);
    return {
        ...row,
        next_period: { start: period.start, end: period.end },
        days_left: daysBetweenDates(today, row.rnw_next_due_date),
    };
}

/** เงื่อนไขของแต่ละแท็บ · ใกล้ครบ = ยังไม่เลย และเหลือไม่เกิน 30 วัน */
function tabCondition(tab) {
    if (tab === "due_soon")
        return { sql: "r.rnw_status = 'active' AND r.rnw_next_due_date BETWEEN ? AND ?", needsWindow: true };
    if (tab === "overdue") return { sql: "r.rnw_status = 'active' AND r.rnw_next_due_date < ?", needsToday: true };
    if (tab === "paused") return { sql: "r.rnw_status = 'paused'" };
    return { sql: "1 = 1" };
}

/**
 * รายการตามแท็บ + ตัวเลขบนแท็บ (นับเฉพาะช่องทางที่ผู้ใช้เห็น)
 * @param {{ tab?: string, search?: string, channel?: string, limit?: number, offset?: number }} filters
 */
async function listRenewals(conn, actor, { tab = "due_soon", search = "", channel = "", limit = 25, offset = 0 } = {}) {
    const channels = channelsOf(actor.role_permission);
    if (channels.length === 0) throw new AppError(403, "FORBIDDEN", "ไม่มีสิทธิ์ดูรายการต่ออายุ");
    const today = todayBangkok();
    const windowEnd = shiftDays(today, DUE_SOON_DAYS);
    const visibleChannels = channel && channels.includes(channel) ? [channel] : channels;
    const keyword = `%${String(search).trim()}%`;
    const baseWhere = "r.rnw_channel IN (?) AND (r.rnw_label LIKE ? OR c.client_name LIKE ? OR p.product_name LIKE ?)";
    const baseParams = [visibleChannels, keyword, keyword, keyword];
    const paramsOf = (condition) => {
        if (condition.needsWindow) return [today, windowEnd];
        if (condition.needsToday) return [today];
        return [];
    };

    const counts = {};
    for (const key of TABS) {
        const condition = tabCondition(key);
        const [[row]] = await conn.query(
            `SELECT COUNT(*) AS total ${RENEWAL_FROM} WHERE ${baseWhere} AND ${condition.sql}`,
            [...baseParams, ...paramsOf(condition)],
        );
        counts[key] = Number(row.total);
    }

    const selectedTab = TABS.includes(tab) ? tab : "due_soon";
    const condition = tabCondition(selectedTab);
    const [rows] = await conn.query(
        `SELECT ${RENEWAL_COLUMNS} ${RENEWAL_FROM}
         WHERE ${baseWhere} AND ${condition.sql}
         ORDER BY r.rnw_status = 'cancelled', r.rnw_next_due_date, r.rnw_id
         LIMIT ? OFFSET ?`,
        [...baseParams, ...paramsOf(condition), Number(limit) || 25, Number(offset) || 0],
    );
    return {
        data: rows.map((row) => withDueInfo(row, today)),
        total: counts[selectedTab],
        counts,
        channels,
        today,
        due_soon_days: DUE_SOON_DAYS,
    };
}

async function findRenewal(conn, renewalId, { forUpdate = false } = {}) {
    const [[row]] = await conn.query(
        `SELECT ${RENEWAL_COLUMNS} ${RENEWAL_FROM} WHERE r.rnw_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [renewalId],
    );
    if (!row) throw notFound();
    return row;
}

/** รายละเอียด + ประวัติรอบ (เลขใบแจ้งหนี้/ชื่องานต่ออายุ ลิงก์ไปได้) */
async function getRenewal(conn, actor, renewalId) {
    const renewal = await findRenewal(conn, renewalId);
    assertChannel(actor, renewal.rnw_channel);
    const [cycles] = await conn.query(
        `SELECT n.rnc_id, DATE_FORMAT(n.rnc_period_start, '%Y-%m-%d') AS rnc_period_start,
                DATE_FORMAT(n.rnc_period_end, '%Y-%m-%d') AS rnc_period_end, n.rnc_amount, n.rnc_status,
                n.rnc_invoice_id, i.inv_number, i.inv_status, n.rnc_project_id, pj.project_name,
                DATE_FORMAT(n.rnc_created_at, '%Y-%m-%d %H:%i') AS rnc_created_at
         FROM tb_renewal_cycles n
         LEFT JOIN tb_invoices i ON i.inv_id = n.rnc_invoice_id
         LEFT JOIN tb_projects pj ON pj.project_id = n.rnc_project_id
         WHERE n.rnc_renewal_id = ?
         ORDER BY n.rnc_period_start DESC, n.rnc_id DESC`,
        [renewalId],
    );
    return { renewal: withDueInfo(renewal, todayBangkok()), cycles };
}

/**
 * ตัวเลือกในฟอร์มเพิ่มเอง: สินค้าที่ตั้งเป็นรายรอบ (เติมราคา/รอบ) · โปรเจกต์ของลูกค้าที่เลือก (เติมช่องทาง)
 * @param {string | null} clientId
 */
async function formOptions(conn, clientId) {
    const [products] = await conn.query(
        `SELECT product_id, product_name, product_unit, product_price, product_renewal_months
         FROM tb_products
         WHERE product_status = 'active' AND product_price_mode <> 'percent' AND product_renewal_months IS NOT NULL
         ORDER BY product_name`,
    );
    // แพ็กที่รวมรอบแรกของบริการไว้ (หน้ารับงาน Fastwork ใช้เสนอรายการต่ออายุจากตะกร้า)
    const [packages] = await conn.query(
        "SELECT pkg_id, pkg_renewal_product_id FROM tb_product_packages WHERE pkg_renewal_product_id IS NOT NULL AND pkg_status = 'active'",
    );
    const [projects] = clientId
        ? await conn.query(
              `SELECT project_id, project_name, project_channel, project_status FROM tb_projects
               WHERE client_id = ? AND project_status <> 'cancelled' ORDER BY project_created_at DESC`,
              [clientId],
          )
        : [[]];
    return { products, packages, projects };
}

async function assertReferences(conn, input) {
    const fields = {};
    const [[client]] = await conn.query("SELECT client_id FROM tb_clients WHERE client_id = ?", [input.rnw_client_id]);
    if (!client) fields.rnw_client_id = "ไม่พบลูกค้านี้ กรุณาเลือกใหม่";
    const [[product]] = await conn.query("SELECT product_status FROM tb_products WHERE product_id = ?", [
        input.rnw_product_id,
    ]);
    if (!product) fields.rnw_product_id = "ไม่พบสินค้านี้ กรุณาเลือกใหม่";
    else if (product.product_status !== "active") fields.rnw_product_id = "สินค้านี้ปิดใช้งานแล้ว เลือกสินค้าอื่น";
    if (input.rnw_project_id) {
        const [[project]] = await conn.query("SELECT client_id FROM tb_projects WHERE project_id = ?", [
            input.rnw_project_id,
        ]);
        if (!project) fields.rnw_project_id = "ไม่พบโปรเจกต์นี้";
        else if (project.client_id !== input.rnw_client_id)
            fields.rnw_project_id = "เลือกได้เฉพาะโปรเจกต์ของลูกค้ารายนี้";
    }
    if (Object.keys(fields).length > 0) {
        throw new AppError(
            400,
            "VALIDATION",
            `ข้อมูลไม่ถูกต้อง ${Object.keys(fields).length} ช่อง กรุณาแก้ตามข้อความใต้ช่อง`,
            fields,
        );
    }
}

/**
 * เพิ่มรายการต่ออายุ (เอง หรือจากระบบตอนรับงาน/ตอบรับใบ)
 * @param {{ source?: "quotation" | "fastwork" | "manual", sourceId?: string | null }} [origin]
 */
async function insertRenewal(conn, actorId, input, { source = "manual", sourceId = null } = {}) {
    const renewalId = await generateDailyId("tb_renewals", "rnw_id", "RNW");
    await conn.query(
        `INSERT INTO tb_renewals
            (rnw_id, rnw_client_id, rnw_project_id, rnw_product_id, rnw_label, rnw_price, rnw_cycle_months, rnw_anchor_day,
             rnw_next_due_date, rnw_channel, rnw_source, rnw_source_id, rnw_notes, rnw_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            renewalId,
            input.rnw_client_id,
            input.rnw_project_id ?? null,
            input.rnw_product_id,
            input.rnw_label ?? null,
            input.rnw_price,
            input.rnw_cycle_months,
            anchorDayOf(input.rnw_next_due_date),
            input.rnw_next_due_date,
            input.rnw_channel,
            source,
            sourceId,
            input.rnw_notes ?? null,
            actorId,
        ],
    );
    return renewalId;
}

async function createRenewal(conn, actor, input) {
    assertChannel(actor, input.rnw_channel);
    await assertReferences(conn, input);
    const renewalId = await insertRenewal(conn, actor.user_id, input);
    return { rnw_id: renewalId };
}

async function lockForChange(conn, actor, renewalId, expectedVersion) {
    const renewal = await findRenewal(conn, renewalId, { forUpdate: true });
    assertChannel(actor, renewal.rnw_channel);
    if (Number(renewal.rnw_version) !== expectedVersion) throw versionChanged();
    return renewal;
}

function wrongStatus(message) {
    return new AppError(409, "RENEWAL_WRONG_STATUS", message);
}

async function updateRenewal(conn, actor, renewalId, input) {
    const renewal = await lockForChange(conn, actor, renewalId, input.rnw_version);
    if (renewal.rnw_status === "cancelled") throw wrongStatus("รายการนี้ยกเลิกแล้ว แก้ไม่ได้ (เพิ่มรายการใหม่แทน)");
    // ย้ายวันครบ = ตั้ง anchor ใหม่ตามวันที่เลือก · ไม่ย้าย = anchor เดิม (กันวันที่ถูกตัดตอนเดือนสั้นกลายเป็น anchor)
    const isDueChanged = input.rnw_next_due_date !== renewal.rnw_next_due_date;
    await conn.query(
        `UPDATE tb_renewals SET rnw_label = ?, rnw_price = ?, rnw_cycle_months = ?, rnw_next_due_date = ?, rnw_anchor_day = ?,
                rnw_notes = ?, rnw_version = rnw_version + 1
         WHERE rnw_id = ?`,
        [
            input.rnw_label,
            input.rnw_price,
            input.rnw_cycle_months,
            input.rnw_next_due_date,
            isDueChanged ? anchorDayOf(input.rnw_next_due_date) : renewal.rnw_anchor_day,
            input.rnw_notes,
            renewalId,
        ],
    );
    return { rnw_id: renewalId };
}

async function pauseRenewal(conn, actor, renewalId, input) {
    const renewal = await lockForChange(conn, actor, renewalId, input.rnw_version);
    if (renewal.rnw_status !== "active") throw wrongStatus("พักได้เฉพาะรายการที่ใช้งานอยู่");
    await conn.query(
        "UPDATE tb_renewals SET rnw_status = 'paused', rnw_paused_on = ?, rnw_end_reason = ?, rnw_version = rnw_version + 1 WHERE rnw_id = ?",
        [todayBangkok(), input.reason, renewalId],
    );
    return { rnw_id: renewalId };
}

async function resumeRenewal(conn, actor, renewalId, input) {
    const renewal = await lockForChange(conn, actor, renewalId, input.rnw_version);
    if (renewal.rnw_status !== "paused") throw wrongStatus("เปิดต่อได้เฉพาะรายการที่พักไว้");
    await conn.query(
        `UPDATE tb_renewals SET rnw_status = 'active', rnw_paused_on = NULL, rnw_end_reason = NULL,
                rnw_next_due_date = ?, rnw_anchor_day = ?, rnw_version = rnw_version + 1
         WHERE rnw_id = ?`,
        [input.rnw_next_due_date, anchorDayOf(input.rnw_next_due_date), renewalId],
    );
    return { rnw_id: renewalId };
}

async function cancelRenewal(conn, actor, renewalId, input) {
    const renewal = await lockForChange(conn, actor, renewalId, input.rnw_version);
    if (renewal.rnw_status === "cancelled") throw wrongStatus("รายการนี้ยกเลิกไปแล้ว");
    await conn.query(
        "UPDATE tb_renewals SET rnw_status = 'cancelled', rnw_end_reason = ?, rnw_version = rnw_version + 1 WHERE rnw_id = ?",
        [input.reason, renewalId],
    );
    return { rnw_id: renewalId };
}

/**
 * ลูกค้าตอบรับใบเสนอราคา → ตั้งต่ออายุให้เอง (R-2 · แผนข้อ 5.1)
 * - แถวที่สินค้าตั้งรอบไว้: จำนวนที่ซื้อ = จำนวนรอบที่จ่ายแล้ว (ปัดลง ขั้นต่ำ 1) · ราคาต่อรอบ = ยอดบรรทัดหลังส่วนลดบรรทัด ÷ จำนวน
 *   แปลงเป็นบาทด้วยอัตราของใบ · วันครบแรก = วันตอบรับ + รอบ × จำนวน
 * - แพ็กที่รวมรอบแรกของบริการไว้: 1 รายการต่อแพ็ก · ราคาสินค้าตอนนั้น · วันครบแรก = วันตอบรับ + 1 รอบ
 * ส่วนลดท้ายใบ (ทั้งใบ) ไม่นำมาคิด เพราะรอบถัดไปไม่ได้ลดตาม · แก้ราคาได้ที่หน้าต่ออายุ
 * @returns {Promise<number>} จำนวนรายการที่ตั้ง
 */
async function createFromQuotation(conn, quotation, projectId, actorId, channel) {
    const [items] = await conn.query(
        `SELECT i.qti_product_id, i.qti_package_id, i.qti_quantity, i.qti_amount, p.product_renewal_months
         FROM tb_quotation_items i JOIN tb_products p ON p.product_id = i.qti_product_id
         WHERE i.qti_quotation_id = ? AND i.qti_type = 'item' AND p.product_renewal_months IS NOT NULL
         ORDER BY i.qti_order`,
        [quotation.qt_id],
    );
    const [packages] = await conn.query(
        `SELECT DISTINCT k.pkg_id, p.product_id, p.product_price, p.product_renewal_months
         FROM tb_quotation_items i
         JOIN tb_product_packages k ON k.pkg_id = i.qti_package_id
         JOIN tb_products p ON p.product_id = k.pkg_renewal_product_id
         WHERE i.qti_quotation_id = ? AND p.product_renewal_months IS NOT NULL`,
        [quotation.qt_id],
    );
    const today = todayBangkok();
    const anchorDay = anchorDayOf(today);
    const base = {
        rnw_client_id: quotation.qt_client_id,
        rnw_project_id: projectId,
        rnw_label: null,
        rnw_channel: channel,
        rnw_notes: null,
    };
    const origin = { source: "quotation", sourceId: quotation.qt_id };

    for (const item of items) {
        const months = Number(item.product_renewal_months);
        const quantityHundredths = parseHundredths(item.qti_quantity ?? "1", "จำนวน");
        const paidCycles = Math.max(1, Math.floor(Number(item.qti_quantity ?? 1)));
        const perUnit = divideRoundHalfUp(parseHundredths(item.qti_amount, "ยอดบรรทัด") * 100n, quantityHundredths);
        const priceThb = convertToBaht(perUnit, quotation.qt_exchange_rate);
        if (priceThb <= 0n) continue;
        let firstDue = today;
        for (let cycle = 0; cycle < paidCycles; cycle += 1) firstDue = addCycle(firstDue, months, anchorDay);
        await insertRenewal(
            conn,
            actorId,
            {
                ...base,
                rnw_product_id: item.qti_product_id,
                rnw_price: formatHundredths(priceThb),
                rnw_cycle_months: months,
                rnw_next_due_date: firstDue,
            },
            origin,
        );
    }
    for (const productPackage of packages) {
        const months = Number(productPackage.product_renewal_months);
        await insertRenewal(
            conn,
            actorId,
            {
                ...base,
                rnw_product_id: productPackage.product_id,
                rnw_price: productPackage.product_price,
                rnw_cycle_months: months,
                rnw_next_due_date: addCycle(today, months, anchorDay),
            },
            origin,
        );
    }
    return items.length + packages.length;
}

// ─── ออกใบแจ้งหนี้รอบนี้ (R-3 · แผนข้อ 5.3) ─────────────────────────────────────────────────────

/** วันเริ่มของรอบที่ยังออกอยู่ (ไม่รวมที่ยกเลิก) ของรายการหนึ่ง */
async function billedStartsOf(conn, renewalId) {
    const [rows] = await conn.query(
        "SELECT DATE_FORMAT(rnc_period_start, '%Y-%m-%d') AS start FROM tb_renewal_cycles WHERE rnc_renewal_id = ? AND rnc_status = 'billed'",
        [renewalId],
    );
    return new Set(rows.map((row) => row.start));
}

/**
 * บันทึกรอบที่ออก แล้วขยับวันครบไปรอบแรกที่ยังไม่มีรอบครอบ (Q1: ขยับตอนออกใบ · ร่างก็นับ เพื่อกันออกซ้ำ)
 * @param {{ invoiceId?: string | null, projectId?: string | null }} link
 */
async function recordCycle(conn, actorId, renewal, link) {
    const months = Number(renewal.rnw_cycle_months);
    const anchorDay = Number(renewal.rnw_anchor_day);
    const period = periodOf(renewal.rnw_next_due_date, months, anchorDay);
    await conn.query(
        `INSERT INTO tb_renewal_cycles (rnc_renewal_id, rnc_period_start, rnc_period_end, rnc_invoice_id, rnc_project_id, rnc_amount, rnc_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            renewal.rnw_id,
            period.start,
            period.end,
            link.invoiceId ?? null,
            link.projectId ?? null,
            renewal.rnw_price,
            actorId,
        ],
    );
    const billedStarts = await billedStartsOf(conn, renewal.rnw_id);
    await conn.query("UPDATE tb_renewals SET rnw_next_due_date = ?, rnw_version = rnw_version + 1 WHERE rnw_id = ?", [
        nextOpenStart(period.start, months, anchorDay, billedStarts),
        renewal.rnw_id,
    ]);
    return period;
}

/**
 * ล็อกรายการที่จะออกรอบนี้ (เรียงตาม id กัน deadlock) · ต้องใช้งานอยู่ · version ตรง (กดซ้ำ/สองคนพร้อมกัน = 409)
 * @param {{ rnw_id: string, rnw_version: number }[]} items
 */
async function lockForBilling(conn, actor, items, channel) {
    const sorted = [...items].sort((left, right) => left.rnw_id.localeCompare(right.rnw_id));
    const renewals = [];
    for (const item of sorted) {
        const renewal = await findRenewal(conn, item.rnw_id, { forUpdate: true });
        assertChannel(actor, renewal.rnw_channel);
        if (renewal.rnw_channel !== channel) {
            throw wrongStatus(
                channel === "direct"
                    ? "รายการของผู้ซื้อ Fastwork ออกใบแจ้งหนี้ไม่ได้ (รับเป็นงานต่ออายุแทน)"
                    : "รายการของลูกค้าตรงต้องออกใบแจ้งหนี้",
            );
        }
        if (Number(renewal.rnw_version) !== item.rnw_version) {
            throw new AppError(409, "ALREADY_BILLED", "รอบนี้ออกไปแล้วหรือมีการแก้ไขก่อนหน้า กรุณาโหลดหน้าใหม่");
        }
        if (renewal.rnw_status !== "active") throw wrongStatus("ออกได้เฉพาะรายการที่ใช้งานอยู่ (เปิดต่อก่อนถ้าพักไว้)");
        renewals.push(renewal);
    }
    return renewals;
}

/** คำอธิบายบรรทัดในใบ: "Cloud Hosting รายปี · shopabc.com · 1 พ.ย. 2569 - 31 ต.ค. 2570" */
function invoiceLineText(renewal, period) {
    const { thaiShortDate } = require("../shared/thai-date.mjs");
    return [renewal.product_name, renewal.rnw_label, `${thaiShortDate(period.start)} - ${thaiShortDate(period.end)}`]
        .filter(Boolean)
        .join(" · ");
}

/**
 * ออกร่างใบแจ้งหนี้รอบนี้ของหลายรายการ (ลูกค้าเดียวกัน) เป็นใบเดียว → บันทึกรอบ + ขยับวันครบ
 * ร่างผ่านการอนุมัติใบสร้างเองตามเดิม · VAT/เครดิต/บัญชีรับเงินตามค่าเริ่มของใบสร้างเอง
 * @param {{ items: { rnw_id: string, rnw_version: number }[] }} input
 */
async function invoiceRenewals(conn, actor, input) {
    // โหลดตอนเรียกใช้ (กันวงจร require: invoice.service ใช้ renewal.service ตอนลบร่าง)
    const invoiceService = require("./invoice.service");
    const { validate } = require("../utils/validate");
    const { invoiceManualDraftSchema } = require("../shared/schemas/invoice.mjs");
    const renewals = await lockForBilling(conn, actor, input.items, "direct");
    const clientIds = new Set(renewals.map((renewal) => renewal.rnw_client_id));
    if (clientIds.size > 1) throw wrongStatus("ออกใบรวมได้เฉพาะรายการของลูกค้ารายเดียวกัน");

    const first = renewals[0];
    const defaults = await invoiceService.draftDefaults(conn, first.rnw_client_id, "THB", "th");
    const [[branch]] = await conn.query(
        `SELECT b.branch_id FROM tb_branches b
         LEFT JOIN tb_users u ON u.user_branch_id = b.branch_id AND u.user_id = ?
         WHERE b.branch_status = 'active'
         ORDER BY u.user_id IS NULL, b.branch_code
         LIMIT 1`,
        [actor.user_id],
    );
    const periods = renewals.map((renewal) =>
        periodOf(renewal.rnw_next_due_date, Number(renewal.rnw_cycle_months), Number(renewal.rnw_anchor_day)),
    );
    const projectIds = new Set(renewals.map((renewal) => renewal.rnw_project_id).filter(Boolean));
    const draft = validate(invoiceManualDraftSchema, {
        inv_title: `ต่ออายุบริการ ${first.client_name}`,
        inv_branch_id: branch?.branch_id ?? "",
        inv_client_id: first.rnw_client_id,
        // ผูกโปรเจกต์เมื่อทุกรายการมาจากโปรเจกต์เดียวกัน
        inv_project_id: projectIds.size === 1 ? [...projectIds][0] : null,
        inv_credit_days: defaults.inv_credit_days,
        inv_wht_rate: defaults.inv_wht_rate,
        inv_notes: defaults.inv_notes,
        inv_bank_account_id: defaults.inv_bank_account_id,
        inv_internal_note: "ออกจากหน้าต่ออายุบริการ",
        items: renewals.map((renewal, index) => ({
            invi_type: "item",
            invi_product_id: renewal.rnw_product_id,
            invi_description: invoiceLineText(renewal, periods[index]),
            invi_quantity: "1",
            invi_unit: renewal.product_unit,
            invi_unit_price: renewal.rnw_price,
        })),
    });
    const created = await invoiceService.createManual(conn, draft, actor);
    for (const renewal of renewals) {
        await recordCycle(conn, actor.user_id, renewal, { invoiceId: created.inv_id });
    }
    return { inv_id: created.inv_id, renewal_count: renewals.length };
}

/**
 * ใบแจ้งหนี้ถูกยกเลิก/ลบร่าง (U13) → รอบที่ผูกเป็น void · วันครบถอยกลับไปรอบแรกที่ยังไม่มีรอบครอบ
 * เรียกก่อนลบร่าง (ON DELETE SET NULL จะตัดลิงก์ใบออก แต่รอบยังเป็นประวัติ)
 */
async function voidCycles(conn, column, documentId) {
    const [cycles] = await conn.query(
        `SELECT rnc_id, rnc_renewal_id, DATE_FORMAT(rnc_period_start, '%Y-%m-%d') AS start
         FROM tb_renewal_cycles WHERE ${column} = ? AND rnc_status = 'billed' FOR UPDATE`,
        [documentId],
    );
    for (const cycle of cycles) {
        await conn.query("UPDATE tb_renewal_cycles SET rnc_status = 'void' WHERE rnc_id = ?", [cycle.rnc_id]);
        // ช่องว่างที่เกิดก่อนวันครบปัจจุบัน = ต้องออกรอบนี้ใหม่ก่อน
        await conn.query(
            `UPDATE tb_renewals SET rnw_next_due_date = LEAST(rnw_next_due_date, ?), rnw_version = rnw_version + 1
             WHERE rnw_id = ?`,
            [cycle.start, cycle.rnc_renewal_id],
        );
    }
    return cycles.length;
}

const voidByInvoice = (conn, invoiceId) => voidCycles(conn, "rnc_invoice_id", invoiceId);
const voidByProject = (conn, projectId) => voidCycles(conn, "rnc_project_id", projectId);

/** รอบต่ออายุที่ใบแจ้งหนี้นี้เก็บ (แสดง "จากรายการต่ออายุ" ในหน้าใบ) */
async function cyclesOfInvoice(conn, invoiceId) {
    const [rows] = await conn.query(
        `SELECT n.rnc_renewal_id AS rnw_id, r.rnw_label, p.product_name, n.rnc_status,
                DATE_FORMAT(n.rnc_period_start, '%Y-%m-%d') AS rnc_period_start, DATE_FORMAT(n.rnc_period_end, '%Y-%m-%d') AS rnc_period_end
         FROM tb_renewal_cycles n JOIN tb_renewals r ON r.rnw_id = n.rnc_renewal_id JOIN tb_products p ON p.product_id = r.rnw_product_id
         WHERE n.rnc_invoice_id = ? ORDER BY n.rnc_id`,
        [invoiceId],
    );
    return rows;
}

/** แดชบอร์ด (Q4): ใกล้ครบภายใน 30 วัน + เลยกำหนด · นับเฉพาะช่องทางที่ผู้ใช้มีสิทธิ์ · ไม่มีสิทธิ์ = null */
async function dueCounts(conn, rolePermission) {
    const channels = channelsOf(rolePermission);
    if (channels.length === 0) return null;
    const today = todayBangkok();
    const [[row]] = await conn.query(
        `SELECT SUM(rnw_next_due_date BETWEEN ? AND ?) AS due_soon, SUM(rnw_next_due_date < ?) AS overdue
         FROM tb_renewals WHERE rnw_status = 'active' AND rnw_channel IN (?)`,
        [today, shiftDays(today, DUE_SOON_DAYS), today, channels],
    );
    return { due_soon: Number(row.due_soon ?? 0), overdue: Number(row.overdue ?? 0), due_soon_days: DUE_SOON_DAYS };
}

/** ยอดเงินในรูปข้อความ "1234.50" → ใช้เทียบ/รวมแบบ bigint */
const priceOf = (renewal) => parseHundredths(renewal.rnw_price, "ราคาต่อรอบ");

module.exports = {
    DUE_SOON_DAYS,
    channelsOf,
    listRenewals,
    getRenewal,
    formOptions,
    createRenewal,
    insertRenewal,
    createFromQuotation,
    invoiceRenewals,
    recordCycle,
    lockForBilling,
    voidByInvoice,
    voidByProject,
    cyclesOfInvoice,
    dueCounts,
    updateRenewal,
    pauseRenewal,
    resumeRenewal,
    cancelRenewal,
    findRenewal,
    priceOf,
};
