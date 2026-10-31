// งาน Fastwork (2026-10-24 · P-1 · docs/plans/2026-10-24-pre-incorporation.md ข้อ 3, 5.1)
//
// - โปรเจกต์ช่องทาง Fastwork: สร้างจากงานที่รับบน Fastwork ไม่ต้องมีใบเสนอราคา · งวดงานตามที่ตกลงบนแพลตฟอร์ม
// - รายได้ = เงินที่ Fastwork โอนให้ (ไม่ออกใบแจ้งหนี้/ใบเสร็จ เพราะ Fastwork ออกเอกสารให้ลูกค้าเอง)
//   ยอดเข้าบัญชี = ราคางวด − ค่าธรรมเนียม − VAT ค่าธรรมเนียม − หัก ณ ที่จ่าย (คิดใน shared/fastwork-math.mjs)
// - หนึ่งงวดมีรายการเงินที่ยังไม่ยกเลิกได้รายการเดียว (ล็อกแถวงวดตอนบันทึก กันบันทึกซ้ำพร้อมกัน)
// - รอโอน → เงินเข้าแล้ว (แก้ยอดหักให้ตรงที่โอนจริงได้ตอนยืนยัน) · ยกเลิกต้องมีเหตุผล ไม่ลบแถว
// - อัตราค่าธรรมเนียมเก็บ ณ วันที่บันทึกในแต่ละรายการ · เปลี่ยนอัตราในตั้งค่าไม่กระทบรายการเดิม
const { AppError } = require("../utils/app-error");
const { nowBangkokText, todayBangkok } = require("../utils/bangkok-time");
const { addDays } = require("../shared/payroll-math.mjs");
const { parseHundredths, formatHundredths } = require("../shared/money.mjs");
const { payoutNetOf } = require("../shared/fastwork-math.mjs");
const { clientSchema } = require("../shared/schemas/client.mjs");
const { MAX_FASTWORK_MILESTONES } = require("../shared/schemas/fastwork.mjs");
const { insertProject } = require("./project.service");
const clientService = require("./client.service");

const COMPANY_SETTINGS_ID = 1;
// งวดที่ใกล้ครบกำหนดส่ง (ขั้น 3 ของหน้า Fastwork)
const DUE_SOON_DAYS = 7;
const ACTIVE_PAYOUT = "('pending', 'received')";

const money = (value) => parseHundredths(value ?? "0", "ยอดเงิน");

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

function payoutChanged() {
    return new AppError(409, "FASTWORK_PAYOUT_CHANGED", "รายการนี้มีการเปลี่ยนแปลงไปก่อนแล้ว กรุณาโหลดหน้าใหม่");
}

// ─── ตั้งค่า ──────────────────────────────────────────────────────────────────────────────

async function getSettings(conn) {
    const [[settings]] = await conn.query(
        "SELECT cs_fastwork_fee_rate, cs_fastwork_fee_vat_rate, cs_fastwork_wht_rate FROM tb_company_settings WHERE cs_id = ?",
        [COMPANY_SETTINGS_ID],
    );
    return settings ?? { cs_fastwork_fee_rate: "17.00", cs_fastwork_fee_vat_rate: "0.00", cs_fastwork_wht_rate: "0.00" };
}

async function updateSettings(conn, settings) {
    await conn.query(
        "UPDATE tb_company_settings SET cs_fastwork_fee_rate = ?, cs_fastwork_fee_vat_rate = ?, cs_fastwork_wht_rate = ? WHERE cs_id = ?",
        [settings.cs_fastwork_fee_rate, settings.cs_fastwork_fee_vat_rate, settings.cs_fastwork_wht_rate, COMPANY_SETTINGS_ID],
    );
    return getSettings(conn);
}

// ─── โปรเจกต์และงวดงาน ───────────────────────────────────────────────────────────────────

async function lockFastworkProject(conn, projectId) {
    const [[project]] = await conn.query(
        "SELECT project_id, project_channel, project_name FROM tb_projects WHERE project_id = ? FOR UPDATE",
        [projectId],
    );
    if (!project) throw new AppError(404, "PROJECT_NOT_FOUND", "ไม่พบโปรเจกต์นี้ กรุณาโหลดหน้าใหม่");
    if (project.project_channel !== "fastwork") {
        throw new AppError(409, "NOT_FASTWORK_PROJECT", "โปรเจกต์นี้ไม่ใช่งาน Fastwork · งานลูกค้าตรงใช้ใบแจ้งหนี้และใบเสร็จ");
    }
    return project;
}

/** ปิดยอดส่วนแบ่งแล้ว = ตัวเลขเงินเข้าถูกล็อก ห้ามเพิ่ม/ยืนยัน/ยกเลิกเงินของโปรเจกต์ (P-2) — อ่านตรงจากตาราง กัน require วนกับ profit-share.service */
async function assertSharesNotSettled(conn, projectId) {
    const [[settled]] = await conn.query(
        "SELECT sst_id FROM tb_share_settlements WHERE sst_project_id = ? AND sst_status = 'settled' LIMIT 1",
        [projectId],
    );
    if (settled) {
        throw new AppError(409, "SHARES_SETTLED", "โปรเจกต์นี้ปิดยอดส่วนแบ่งแล้ว · ยกเลิกการปิดยอดก่อนแก้รายการเงิน (ทำได้เมื่อยังไม่ได้จ่ายใคร)");
    }
}

/** ลูกค้าเดิม หรือสร้างลูกค้าใหม่จากชื่อที่แสดงบน Fastwork (บุคคล · ไม่ต้องมีเลขผู้เสียภาษี/ที่อยู่) */
async function resolveClient(conn, input) {
    if (input.client_id) {
        const [[client]] = await conn.query("SELECT client_id FROM tb_clients WHERE client_id = ?", [input.client_id]);
        if (!client) throw validationError({ client_id: "ไม่พบลูกค้านี้ เลือกใหม่หรือพิมพ์ชื่อลูกค้า" });
        return client.client_id;
    }
    const client = clientSchema.parse({ client_name: input.client_name, client_type: "individual", client_country: "TH" });
    return (await clientService.createClient(conn, client)).client_id;
}

async function insertMilestones(conn, projectId, milestones, user, startOrder = 1) {
    for (const [index, milestone] of milestones.entries()) {
        await conn.query(
            `INSERT INTO tb_fastwork_milestones (fwm_project_id, fwm_order, fwm_name, fwm_amount, fwm_due_date, fwm_created_by)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [projectId, startOrder + index, milestone.fwm_name, milestone.fwm_amount, milestone.fwm_due_date, user.user_id],
        );
    }
}

/**
 * ลูกค้าจ้างเพิ่มในงานเดิม (2026-10-31 · จากตัวคิดราคา): งวดใหม่ต่อท้ายงวดเดิม + งานในโปรเจกต์ (ถ้าส่งมา)
 * งานที่ปิดแล้วเพิ่มไม่ได้ (เปิดงานใหม่แทน) · ปิดยอดส่วนแบ่งแล้วเพิ่มงวดได้ แต่บันทึกเงินไม่ได้จนกว่าจะยกเลิกการปิดยอด → คืน shares_settled ให้หน้าเว็บเตือน
 */
async function addMilestones(conn, user, projectId, input) {
    await lockFastworkProject(conn, projectId);
    const [[project]] = await conn.query("SELECT project_status FROM tb_projects WHERE project_id = ?", [projectId]);
    if (["completed", "cancelled"].includes(project.project_status)) {
        throw new AppError(409, "PROJECT_CLOSED", "งานนี้ปิดแล้ว เพิ่มงวดไม่ได้ · ลูกค้าจ้างเพิ่มหลังจบงาน ให้รับเป็นงานใหม่");
    }
    const [[{ lastOrder, milestoneCount }]] = await conn.query(
        "SELECT COALESCE(MAX(fwm_order), 0) AS lastOrder, COUNT(*) AS milestoneCount FROM tb_fastwork_milestones WHERE fwm_project_id = ?",
        [projectId],
    );
    if (Number(milestoneCount) + input.milestones.length > MAX_FASTWORK_MILESTONES) {
        throw validationError({ milestones: `งานหนึ่งมีงวดได้ไม่เกิน ${MAX_FASTWORK_MILESTONES} งวด (ตอนนี้มี ${milestoneCount} งวด)` });
    }
    await insertMilestones(conn, projectId, input.milestones, user, Number(lastOrder) + 1);
    // require ตอนใช้: quotation-accept → quotation.service → fastwork.service วนกัน
    const { insertTasksFromRows } = require("./quotation-accept.service");
    const taskCount = input.tasks.length > 0 ? await insertTasksFromRows(conn, projectId, input.tasks, "จ้างเพิ่มผ่าน Fastwork (ตัวคิดราคา)") : 0;
    const [[settled]] = await conn.query(
        "SELECT sst_id FROM tb_share_settlements WHERE sst_project_id = ? AND sst_status = 'settled' LIMIT 1",
        [projectId],
    );
    return { project_id: projectId, milestone_count: input.milestones.length, task_count: taskCount, shares_settled: Boolean(settled) };
}

/** สร้างโปรเจกต์จากงาน Fastwork — ผู้สร้างเป็น PM (insertProject) · สถานะกำลังทำ (รับงานแล้ว) */
async function createProject(conn, user, input) {
    const clientId = await resolveClient(conn, input);
    const { project_id: projectId } = await insertProject(
        conn,
        {
            project_name: input.project_name,
            client_id: clientId,
            project_description: input.project_description,
            project_status: "in_progress",
            project_type: input.project_type,
            project_start_date: input.project_start_date ?? todayBangkok(),
            project_due_date: input.project_due_date,
        },
        user.user_id,
    );
    await conn.query(
        "UPDATE tb_projects SET project_channel = 'fastwork', project_fastwork_order_no = ?, project_fastwork_url = ? WHERE project_id = ?",
        [input.project_fastwork_order_no, input.project_fastwork_url, projectId],
    );
    await insertMilestones(conn, projectId, input.milestones, user);
    if (input.service_request_id) {
        // โหลดตอนเรียกใช้ (กันวงจร require กับ service-request.service)
        const serviceRequestService = require("./service-request.service");
        await serviceRequestService.attachFastworkRequest(conn, user, input.service_request_id, projectId, { isNewProject: true });
    }
    // งานจากสินค้าที่เลือก (2026-10-31) · schema กันส่งพร้อมคำขอแล้ว (คำขอสร้างงานให้เอง)
    let taskCount = 0;
    if (input.tasks.length > 0) {
        const { insertTasksFromRows } = require("./quotation-accept.service");
        taskCount = await insertTasksFromRows(conn, projectId, input.tasks, "จากสินค้าที่เลือกตอนรับงาน Fastwork");
    }
    return { project_id: projectId, client_id: clientId, task_count: taskCount };
}

/** แก้เลขคำสั่งซื้อ/ลิงก์ + งวดงานทั้งชุด — งวดที่มีเงินบันทึกแล้วลบไม่ได้ */
async function updateProject(conn, user, projectId, input) {
    await lockFastworkProject(conn, projectId);
    const [existing] = await conn.query(
        `SELECT m.fwm_id, m.fwm_name,
                (SELECT COUNT(*) FROM tb_fastwork_payouts p WHERE p.fwp_milestone_id = m.fwm_id AND p.fwp_status IN ${ACTIVE_PAYOUT}) AS active_payouts
         FROM tb_fastwork_milestones m WHERE m.fwm_project_id = ? FOR UPDATE`,
        [projectId],
    );
    const keptIds = new Set(input.milestones.map((milestone) => milestone.fwm_id).filter(Boolean));
    for (const milestone of existing) {
        if (keptIds.has(milestone.fwm_id)) continue;
        if (Number(milestone.active_payouts) > 0) {
            throw new AppError(409, "MILESTONE_HAS_PAYOUT", `ลบงวด "${milestone.fwm_name}" ไม่ได้ เพราะบันทึกเงินของงวดนี้แล้ว (ยกเลิกรายการเงินก่อน)`);
        }
        await conn.query("DELETE FROM tb_fastwork_milestones WHERE fwm_id = ?", [milestone.fwm_id]);
    }
    const existingIds = new Set(existing.map((milestone) => milestone.fwm_id));
    for (const [index, milestone] of input.milestones.entries()) {
        if (milestone.fwm_id === null) {
            await insertMilestones(conn, projectId, [milestone], user, index + 1);
            continue;
        }
        if (!existingIds.has(milestone.fwm_id)) throw validationError({ milestones: "งวดบางงวดไม่ใช่ของโปรเจกต์นี้ กรุณาโหลดหน้าใหม่" });
        await conn.query(
            "UPDATE tb_fastwork_milestones SET fwm_order = ?, fwm_name = ?, fwm_amount = ?, fwm_due_date = ? WHERE fwm_id = ?",
            [index + 1, milestone.fwm_name, milestone.fwm_amount, milestone.fwm_due_date, milestone.fwm_id],
        );
    }
    await conn.query("UPDATE tb_projects SET project_fastwork_order_no = ?, project_fastwork_url = ? WHERE project_id = ?", [
        input.project_fastwork_order_no,
        input.project_fastwork_url,
        projectId,
    ]);
    return { project_id: projectId };
}

/** ส่งงานงวดนี้บน Fastwork แล้ว / ยกเลิกการส่ง (ยกเลิกไม่ได้ถ้าบันทึกเงินแล้ว) */
async function setDelivered(conn, user, projectId, milestoneId, isDelivered) {
    const [[milestone]] = await conn.query(
        `SELECT m.fwm_id, m.fwm_project_id,
                (SELECT COUNT(*) FROM tb_fastwork_payouts p WHERE p.fwp_milestone_id = m.fwm_id AND p.fwp_status IN ${ACTIVE_PAYOUT}) AS active_payouts
         FROM tb_fastwork_milestones m WHERE m.fwm_id = ? FOR UPDATE`,
        [milestoneId],
    );
    if (!milestone || milestone.fwm_project_id !== projectId) {
        throw new AppError(404, "MILESTONE_NOT_FOUND", "ไม่พบงวดนี้ในโปรเจกต์นี้ กรุณาโหลดหน้าใหม่");
    }
    if (!isDelivered && Number(milestone.active_payouts) > 0) {
        throw new AppError(409, "MILESTONE_HAS_PAYOUT", "ลูกค้ายืนยันงวดนี้และบันทึกเงินแล้ว ยกเลิกการส่งงานไม่ได้");
    }
    await conn.query("UPDATE tb_fastwork_milestones SET fwm_delivered_at = ?, fwm_delivered_by = ? WHERE fwm_id = ?", [
        isDelivered ? nowBangkokText() : null,
        isDelivered ? user.user_id : null,
        milestoneId,
    ]);
    return { fwm_id: milestoneId, project_id: milestone.fwm_project_id };
}

// ─── รายการเงิน ──────────────────────────────────────────────────────────────────────────

const PAYOUT_COLUMNS = `p.fwp_id, p.fwp_project_id, p.fwp_milestone_id, p.fwp_status, p.fwp_gross, p.fwp_fee_rate, p.fwp_fee,
    p.fwp_fee_vat, p.fwp_wht, p.fwp_wht_certificate_no, p.fwp_net, p.fwp_reference, p.fwp_note, p.fwp_cancel_reason, p.fwp_version,
    p.fwp_bank_account_id, DATE_FORMAT(p.fwp_approved_date, '%Y-%m-%d') AS fwp_approved_date,
    DATE_FORMAT(p.fwp_received_date, '%Y-%m-%d') AS fwp_received_date,
    DATE_FORMAT(p.fwp_cancelled_at, '%Y-%m-%d %H:%i') AS fwp_cancelled_at,
    DATE_FORMAT(p.fwp_created_at, '%Y-%m-%d %H:%i') AS fwp_created_at,
    pr.project_name, pr.project_fastwork_order_no, c.client_name, m.fwm_order, m.fwm_name,
    CONCAT(b.ba_bank_name, ' ', b.ba_account_no) AS bank_account_label`;

const PAYOUT_FROM = `FROM tb_fastwork_payouts p
    JOIN tb_projects pr ON pr.project_id = p.fwp_project_id
    LEFT JOIN tb_clients c ON c.client_id = pr.client_id
    LEFT JOIN tb_fastwork_milestones m ON m.fwm_id = p.fwp_milestone_id
    LEFT JOIN tb_bank_accounts b ON b.ba_id = p.fwp_bank_account_id`;

/** รายการเงิน Fastwork (ล่าสุดก่อน · รอโอนขึ้นก่อนเสมอ) */
async function listPayouts(conn, { status = null, projectId = null } = {}) {
    const conditions = [];
    const params = [];
    if (status) {
        conditions.push("p.fwp_status = ?");
        params.push(status);
    }
    if (projectId) {
        conditions.push("p.fwp_project_id = ?");
        params.push(projectId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await conn.query(
        `SELECT ${PAYOUT_COLUMNS} ${PAYOUT_FROM} ${where}
         ORDER BY p.fwp_status = 'pending' DESC, COALESCE(p.fwp_received_date, p.fwp_approved_date) DESC, p.fwp_id DESC`,
        params,
    );
    return rows;
}

async function findPayout(conn, payoutId) {
    const [[row]] = await conn.query(`SELECT ${PAYOUT_COLUMNS} ${PAYOUT_FROM} WHERE p.fwp_id = ?`, [payoutId]);
    if (!row) throw new AppError(404, "FASTWORK_PAYOUT_NOT_FOUND", "ไม่พบรายการเงินนี้ กรุณาโหลดหน้าใหม่");
    return row;
}

async function assertBankAccount(conn, bankAccountId) {
    const [[account]] = await conn.query("SELECT ba_id FROM tb_bank_accounts WHERE ba_id = ? AND ba_status = 'active'", [
        bankAccountId,
    ]);
    if (!account) throw validationError({ fwp_bank_account_id: "ไม่พบบัญชีนี้ หรือบัญชีปิดใช้งานแล้ว" });
}

/** วันที่ลูกค้ายืนยัน/วันที่เงินเข้า ต้องไม่เกินวันนี้ (เงินเข้าในอนาคตไม่มีจริง) และเงินเข้าไม่ก่อนวันยืนยัน */
function assertPayoutDates({ approvedDate, receivedDate }) {
    const today = todayBangkok();
    if (approvedDate > today) throw validationError({ fwp_approved_date: "วันที่ลูกค้ายืนยันงวดต้องไม่เกินวันนี้" });
    if (receivedDate === null) return;
    if (receivedDate > today) throw validationError({ fwp_received_date: "วันที่เงินเข้าต้องไม่เกินวันนี้" });
    if (receivedDate < approvedDate) throw validationError({ fwp_received_date: "วันที่เงินเข้าต้องไม่ก่อนวันที่ลูกค้ายืนยันงวด" });
}

function netOrError(gross, amounts) {
    const net = payoutNetOf({ gross, fee: amounts.fwp_fee, feeVat: amounts.fwp_fee_vat, wht: amounts.fwp_wht });
    if (net === null) throw validationError({ fwp_fee: "ค่าธรรมเนียม + VAT + หัก ณ ที่จ่าย รวมกันเกินราคางวด" });
    return net;
}

/** บันทึกเงินจาก Fastwork (รอโอน หรือเงินเข้าแล้ว) */
async function createPayout(conn, user, input) {
    await lockFastworkProject(conn, input.fwp_project_id);
    await assertSharesNotSettled(conn, input.fwp_project_id);
    if (input.fwp_milestone_id !== null) {
        const [[milestone]] = await conn.query(
            "SELECT fwm_id, fwm_project_id, fwm_name FROM tb_fastwork_milestones WHERE fwm_id = ? FOR UPDATE",
            [input.fwp_milestone_id],
        );
        if (!milestone || milestone.fwm_project_id !== input.fwp_project_id) {
            throw validationError({ fwp_milestone_id: "งวดนี้ไม่ใช่ของโปรเจกต์ที่เลือก" });
        }
        const [[active]] = await conn.query(
            `SELECT fwp_id FROM tb_fastwork_payouts WHERE fwp_milestone_id = ? AND fwp_status IN ${ACTIVE_PAYOUT} LIMIT 1`,
            [input.fwp_milestone_id],
        );
        if (active) {
            throw validationError({ fwp_milestone_id: `งวด "${milestone.fwm_name}" บันทึกเงินไปแล้ว (ยกเลิกรายการเดิมก่อนถ้าบันทึกผิด)` });
        }
    }
    const net = netOrError(input.fwp_gross, input);
    const isReceived = input.fwp_status === "received";
    assertPayoutDates({ approvedDate: input.fwp_approved_date, receivedDate: isReceived ? input.fwp_received_date : null });
    if (isReceived) await assertBankAccount(conn, input.fwp_bank_account_id);
    const [result] = await conn.query(
        `INSERT INTO tb_fastwork_payouts
            (fwp_project_id, fwp_milestone_id, fwp_status, fwp_gross, fwp_fee_rate, fwp_fee, fwp_fee_vat, fwp_wht,
             fwp_wht_certificate_no, fwp_net, fwp_approved_date, fwp_received_date, fwp_bank_account_id, fwp_reference,
             fwp_note, fwp_received_by, fwp_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            input.fwp_project_id,
            input.fwp_milestone_id,
            input.fwp_status,
            input.fwp_gross,
            input.fwp_fee_rate,
            input.fwp_fee,
            input.fwp_fee_vat,
            input.fwp_wht,
            input.fwp_wht_certificate_no,
            net,
            input.fwp_approved_date,
            isReceived ? input.fwp_received_date : null,
            isReceived ? input.fwp_bank_account_id : null,
            isReceived ? input.fwp_reference : null,
            input.fwp_note,
            isReceived ? user.user_id : null,
            user.user_id,
        ],
    );
    // ลูกค้ายืนยันงวดแล้ว = ส่งงานแล้วแน่นอน (เผื่อไม่ได้กดส่งงานไว้ก่อน)
    if (input.fwp_milestone_id !== null) {
        await conn.query(
            "UPDATE tb_fastwork_milestones SET fwm_delivered_at = COALESCE(fwm_delivered_at, ?), fwm_delivered_by = COALESCE(fwm_delivered_by, ?) WHERE fwm_id = ?",
            [nowBangkokText(), user.user_id, input.fwp_milestone_id],
        );
    }
    return findPayout(conn, result.insertId);
}

async function lockPayout(conn, payoutId, expectedVersion) {
    const [[row]] = await conn.query(
        `SELECT fwp_id, fwp_project_id, fwp_status, fwp_gross, fwp_version, DATE_FORMAT(fwp_approved_date, '%Y-%m-%d') AS fwp_approved_date
         FROM tb_fastwork_payouts WHERE fwp_id = ? FOR UPDATE`,
        [payoutId],
    );
    if (!row) throw new AppError(404, "FASTWORK_PAYOUT_NOT_FOUND", "ไม่พบรายการเงินนี้ กรุณาโหลดหน้าใหม่");
    if (row.fwp_version !== expectedVersion) throw payoutChanged();
    await assertSharesNotSettled(conn, row.fwp_project_id);
    return row;
}

/** ยืนยันเงินเข้า (รอโอน → เข้าแล้ว) */
async function receivePayout(conn, user, payoutId, input) {
    const row = await lockPayout(conn, payoutId, input.fwp_version);
    if (row.fwp_status !== "pending") {
        throw new AppError(409, "FASTWORK_PAYOUT_NOT_PENDING", "รายการนี้ไม่ได้รอโอนแล้ว กรุณาโหลดหน้าใหม่");
    }
    const net = netOrError(row.fwp_gross, input);
    assertPayoutDates({ approvedDate: row.fwp_approved_date, receivedDate: input.fwp_received_date });
    await assertBankAccount(conn, input.fwp_bank_account_id);
    await conn.query(
        `UPDATE tb_fastwork_payouts
         SET fwp_status = 'received', fwp_fee = ?, fwp_fee_vat = ?, fwp_wht = ?, fwp_wht_certificate_no = ?, fwp_net = ?,
             fwp_received_date = ?, fwp_bank_account_id = ?, fwp_reference = ?, fwp_received_by = ?, fwp_version = fwp_version + 1
         WHERE fwp_id = ?`,
        [
            input.fwp_fee,
            input.fwp_fee_vat,
            input.fwp_wht,
            input.fwp_wht_certificate_no,
            net,
            input.fwp_received_date,
            input.fwp_bank_account_id,
            input.fwp_reference,
            user.user_id,
            payoutId,
        ],
    );
    return findPayout(conn, payoutId);
}

/** ยกเลิก (คืนเงินลูกค้า/ข้อพิพาท/บันทึกผิด) — เก็บแถวไว้พร้อมเหตุผล */
async function cancelPayout(conn, user, payoutId, input) {
    const row = await lockPayout(conn, payoutId, input.fwp_version);
    if (row.fwp_status === "cancelled") {
        throw new AppError(409, "FASTWORK_PAYOUT_CANCELLED", "รายการนี้ยกเลิกไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    await conn.query(
        `UPDATE tb_fastwork_payouts
         SET fwp_status = 'cancelled', fwp_cancel_reason = ?, fwp_cancelled_at = ?, fwp_cancelled_by = ?, fwp_version = fwp_version + 1
         WHERE fwp_id = ?`,
        [input.reason, nowBangkokText(), user.user_id, payoutId],
    );
    return findPayout(conn, payoutId);
}

// ─── ภาพรวมของโปรเจกต์ (หน้าโปรเจกต์ · การเงินโปรเจกต์) ─────────────────────────────────────────

/**
 * งวดงาน + รายการเงินของโปรเจกต์ Fastwork · ยอดเงินรวม (เป็นบาท · ไม่ใช่ Fastwork = null)
 * สถานะงวด: received เงินเข้าแล้ว · pending ลูกค้ายืนยัน รอโอน · delivered ส่งงานแล้ว รอลูกค้ายืนยัน · open ยังไม่ส่ง
 */
async function projectFastwork(conn, projectId) {
    const [[project]] = await conn.query(
        "SELECT project_channel, project_fastwork_order_no, project_fastwork_url FROM tb_projects WHERE project_id = ?",
        [projectId],
    );
    if (!project || project.project_channel !== "fastwork") return null;
    const [milestones] = await conn.query(
        `SELECT fwm_id, fwm_order, fwm_name, fwm_amount, DATE_FORMAT(fwm_due_date, '%Y-%m-%d') AS fwm_due_date,
                DATE_FORMAT(fwm_delivered_at, '%Y-%m-%d %H:%i') AS fwm_delivered_at
         FROM tb_fastwork_milestones WHERE fwm_project_id = ? ORDER BY fwm_order, fwm_id`,
        [projectId],
    );
    const payouts = await listPayouts(conn, { projectId });
    const activeByMilestone = new Map(
        payouts.filter((payout) => payout.fwp_status !== "cancelled" && payout.fwp_milestone_id).map((payout) => [payout.fwp_milestone_id, payout]),
    );

    let contract = 0n;
    let receivedGross = 0n;
    let pendingGross = 0n;
    let fee = 0n;
    let feeVat = 0n;
    let wht = 0n;
    let netReceived = 0n;
    for (const milestone of milestones) contract += money(milestone.fwm_amount);
    for (const payout of payouts) {
        if (payout.fwp_status === "pending") pendingGross += money(payout.fwp_gross);
        if (payout.fwp_status !== "received") continue;
        receivedGross += money(payout.fwp_gross);
        fee += money(payout.fwp_fee);
        feeVat += money(payout.fwp_fee_vat);
        wht += money(payout.fwp_wht);
        netReceived += money(payout.fwp_net);
    }
    return {
        order_no: project.project_fastwork_order_no,
        url: project.project_fastwork_url,
        milestones: milestones.map((milestone) => {
            const payout = activeByMilestone.get(milestone.fwm_id) ?? null;
            let state = milestone.fwm_delivered_at ? "delivered" : "open";
            if (payout) state = payout.fwp_status;
            return { ...milestone, state, payout_id: payout?.fwp_id ?? null };
        }),
        payouts,
        totals: {
            contract: formatHundredths(contract),
            received_gross: formatHundredths(receivedGross),
            pending_gross: formatHundredths(pendingGross),
            not_yet_paid: formatHundredths(contract - receivedGross - pendingGross),
            fee: formatHundredths(fee),
            fee_vat: formatHundredths(feeVat),
            wht: formatHundredths(wht),
            net_received: formatHundredths(netReceived),
        },
        // ต้นทุนจากแพลตฟอร์ม (ค่าธรรมเนียม + VAT ค่าธรรมเนียม ของรายการที่เงินเข้าแล้ว) — ใช้ในกำไรโปรเจกต์
        platform_cost_hundredths: fee + feeVat,
        received_gross_hundredths: receivedGross,
    };
}

// ─── หน้า Fastwork (ศูนย์รวมขั้นตอน) ─────────────────────────────────────────────────────────

/**
 * ตัวเลขงานค้างของแต่ละขั้น + งาน Fastwork ที่กำลังทำ
 * @param {{ canSeeMoney: boolean }} options ยอดเงินเฉพาะผู้จัดการเงิน Fastwork
 */
async function overview(conn, { canSeeMoney }) {
    const today = todayBangkok();
    const [projects] = await conn.query(
        `SELECT p.project_id, p.project_name, p.project_status, p.project_fastwork_order_no, c.client_name,
                DATE_FORMAT(p.project_due_date, '%Y-%m-%d') AS project_due_date
         FROM tb_projects p LEFT JOIN tb_clients c ON c.client_id = p.client_id
         WHERE p.project_channel = 'fastwork' AND p.project_status NOT IN ('completed', 'cancelled')
         ORDER BY p.project_due_date IS NULL, p.project_due_date, p.project_created_at`,
    );
    const projectIds = projects.map((project) => project.project_id);
    const [milestones] = projectIds.length
        ? await conn.query(
              `SELECT m.fwm_id, m.fwm_project_id, m.fwm_order, m.fwm_name, m.fwm_amount,
                      DATE_FORMAT(m.fwm_due_date, '%Y-%m-%d') AS fwm_due_date, m.fwm_delivered_at IS NOT NULL AS is_delivered,
                      (SELECT p.fwp_status FROM tb_fastwork_payouts p
                       WHERE p.fwp_milestone_id = m.fwm_id AND p.fwp_status IN ${ACTIVE_PAYOUT} LIMIT 1) AS payout_status
               FROM tb_fastwork_milestones m WHERE m.fwm_project_id IN (?) ORDER BY m.fwm_project_id, m.fwm_order`,
              [projectIds],
          )
        : [[]];
    const [[pending]] = await conn.query(
        "SELECT COUNT(*) AS payout_count, COALESCE(SUM(fwp_net), 0) AS net_total FROM tb_fastwork_payouts WHERE fwp_status = 'pending'",
    );
    // ส่วนแบ่ง (P-2): งาน Fastwork ที่กำลังทำแต่ยังไม่ตั้งส่วนแบ่ง · ส่วนแบ่งที่ปิดยอดแล้วยังค้างจ่าย
    const [shareCounts] = projectIds.length
        ? await conn.query("SELECT DISTINCT shr_project_id FROM tb_project_shares WHERE shr_project_id IN (?)", [projectIds])
        : [[]];
    const projectsWithShares = new Set(shareCounts.map((row) => row.shr_project_id));
    const [settledRows] = projectIds.length
        ? await conn.query(
              `SELECT s.sst_project_id, SUM(l.ssl_status = 'unpaid') AS unpaid_count
               FROM tb_share_settlements s LEFT JOIN tb_share_settlement_lines l ON l.ssl_settlement_id = s.sst_id
               WHERE s.sst_status = 'settled' AND s.sst_project_id IN (?) GROUP BY s.sst_project_id`,
              [projectIds],
          )
        : [[]];
    const unpaidBySettledProject = new Map(settledRows.map((row) => [row.sst_project_id, Number(row.unpaid_count ?? 0)]));
    const [[unpaid]] = await conn.query(
        `SELECT COUNT(*) AS line_count FROM tb_share_settlement_lines l JOIN tb_share_settlements s ON s.sst_id = l.ssl_settlement_id
         WHERE s.sst_status = 'settled' AND l.ssl_status = 'unpaid'`,
    );

    const dueSoonLimit = addDays(today, DUE_SOON_DAYS);
    let dueSoon = 0;
    let awaitingRecord = 0;
    const rows = projects.map((project) => {
        const own = milestones.filter((milestone) => milestone.fwm_project_id === project.project_id);
        const open = own.filter((milestone) => !milestone.payout_status && !Number(milestone.is_delivered));
        const delivered = own.filter((milestone) => !milestone.payout_status && Number(milestone.is_delivered));
        const pendingPayouts = own.filter((milestone) => milestone.payout_status === "pending");
        const received = own.filter((milestone) => milestone.payout_status === "received");
        dueSoon += open.filter((milestone) => milestone.fwm_due_date && milestone.fwm_due_date <= dueSoonLimit).length;
        awaitingRecord += delivered.length;
        // ขั้นถัดไปของโปรเจกต์นี้ (ลำดับเดียวกับการ์ดในหน้า Fastwork)
        let nextStep = "work";
        if (pendingPayouts.length > 0) nextStep = "receive";
        else if (delivered.length > 0) nextStep = "record";
        else if (open.length === 0 && own.length > 0) nextStep = "close";
        const nextOpen = open[0] ?? null;
        return {
            ...project,
            milestone_count: own.length,
            received_count: received.length,
            next_step: nextStep,
            next_milestone: nextOpen ? { fwm_name: nextOpen.fwm_name, fwm_due_date: nextOpen.fwm_due_date } : null,
            contract_amount: canSeeMoney ? formatHundredths(own.reduce((sum, milestone) => sum + money(milestone.fwm_amount), 0n)) : null,
        };
    });

    // ปิดยอดส่วนแบ่งแล้ว: ค้างจ่าย = ขั้นจ่ายส่วนแบ่ง · จ่ายครบ = เสร็จ
    for (const row of rows) {
        if (!unpaidBySettledProject.has(row.project_id)) continue;
        row.next_step = unpaidBySettledProject.get(row.project_id) > 0 ? "pay" : "done";
    }
    return {
        today,
        steps: {
            active_projects: projects.length,
            milestones_due_soon: dueSoon,
            milestones_awaiting_record: awaitingRecord,
            payouts_pending: Number(pending.payout_count),
            payouts_pending_net: canSeeMoney ? formatHundredths(money(pending.net_total)) : null,
            projects_ready_to_close: rows.filter((row) => row.next_step === "close").length,
            projects_without_shares: projectIds.filter((projectId) => !projectsWithShares.has(projectId)).length,
            share_lines_unpaid: Number(unpaid.line_count),
        },
        due_soon_days: DUE_SOON_DAYS,
        projects: rows,
    };
}

module.exports = {
    lockFastworkProject,
    insertMilestones,
    resolveClient,
    getSettings,
    updateSettings,
    createProject,
    updateProject,
    addMilestones,
    setDelivered,
    listPayouts,
    findPayout,
    createPayout,
    receivePayout,
    cancelPayout,
    projectFastwork,
    overview,
};
