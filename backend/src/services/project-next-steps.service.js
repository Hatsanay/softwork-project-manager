// ต่อไปต้องทำอะไร: ขั้นถัดไปของโปรเจกต์ (2026-10-31 · docs/plans/2026-10-31-project-next-steps.md)
//
// กฎชุดเดียวของทั้งระบบ — หน้าโปรเจกต์ รายการโปรเจกต์ และแดชบอร์ดใช้ผลเดียวกัน ป้ายจึงตรงกันทุกหน้า
// คิดใหม่จากข้อมูลจริงทุกครั้ง ไม่เก็บสถานะเพิ่ม · โหลดแบบรวมชุด (query ต่อชนิดข้อมูลครั้งเดียว ไม่วนยิงต่อโปรเจกต์)
// เห็นเฉพาะเรื่องที่สิทธิ์ของคนดูถึง (Q4): สมาชิกทั่วไปเห็นเรื่องงาน + ความต้องการลูกค้า · เรื่องเงินต้องมีสิทธิ์เงินของเรื่องนั้น
// ทำได้ = มีปุ่มพาไปทำ · ทำไม่ได้ = บอกว่ารอใคร (waiting_for) · วันที่ทั้งหมดเป็นวันที่ตามเวลาไทย
const { hasBit } = require("../shared/permissions.mjs");
const { formatAmount, parseHundredths } = require("../shared/money.mjs");
const { thaiShortDate } = require("../shared/thai-date.mjs");
const { hasProjectBit, combinePositionPermissions } = require("../utils/projectPermissions");
const { todayBangkok } = require("../utils/bangkok-time");
const invoiceService = require("./invoice.service");
const fastworkService = require("./fastwork.service");
const { openStateOf } = require("./order-link.service");

const LEVEL_ORDER = { urgent: 0, todo: 1, wait: 2, info: 3 };

const STAGE_LABELS = {
    agree: "ตกลงงาน",
    work: "ทำงาน",
    collect: "เก็บเงิน",
    settle: "ปิดยอด",
    pay: "จ่ายส่วนแบ่ง",
    done: "จบ",
};

const money = (value) => parseHundredths(value ?? 0, "จำนวนเงิน");

// ─── โหลดข้อมูล (รวมชุด) ─────────────────────────────────────────────────────────────────

async function loadProjects(conn, projectIds) {
    const [rows] = await conn.query(
        `SELECT project_id, project_name, project_status, project_channel,
                DATE_FORMAT(project_due_date, '%Y-%m-%d') AS project_due_date
         FROM tb_projects WHERE project_id IN (?)`,
        [projectIds],
    );
    return rows;
}

/** งานทุกระดับ (งานหลัก + งานย่อย) · เลยกำหนด = ยังไม่เสร็จ และวันครบก่อนวันนี้ (ครบวันนี้ = ยังไม่เลย) */
async function loadTasks(conn, projectIds) {
    const [rows] = await conn.query(
        `SELECT project_id, task_title, task_status, DATE_FORMAT(task_due_date, '%Y-%m-%d') AS task_due_date
         FROM tb_tasks WHERE project_id IN (?)
         ORDER BY task_due_date IS NULL, task_due_date, task_sort_order`,
        [projectIds],
    );
    return rows;
}

/** ใบเสนอราคาที่ผูกโปรเจกต์: ส่งแล้วรอตอบ + ตอบรับแล้ว (revision เก่าเป็น superseded ไม่ติดมา) */
async function loadQuotations(conn, projectIds) {
    const [quotations] = await conn.query(
        `SELECT qt_id, qt_project_id, qt_status, qt_number,
                DATE_FORMAT(qt_sent_at, '%Y-%m-%d') AS sent_date,
                DATE_FORMAT(qt_valid_until, '%Y-%m-%d') AS valid_until,
                DATE_FORMAT(qt_responded_at, '%Y-%m-%d') AS accepted_date
         FROM tb_quotations WHERE qt_project_id IN (?) AND qt_status IN ('sent', 'accepted')
         ORDER BY qt_responded_at, qt_sent_at, qt_number`,
        [projectIds],
    );
    const acceptedIds = quotations
        .filter((quotation) => quotation.qt_status === "accepted")
        .map((quotation) => quotation.qt_id);
    // งวดของใบที่ตอบรับ + มีใบแจ้งหนี้ที่ไม่ยกเลิกแล้วหรือยัง (ร่าง/รออนุมัติก็นับว่ากำลังออก ไม่เตือนซ้ำ)
    const [milestones] = acceptedIds.length
        ? await conn.query(
              `SELECT m.qtm_id, m.qtm_quotation_id, m.qtm_order, m.qtm_name,
                      EXISTS (SELECT 1 FROM tb_invoice_milestones im JOIN tb_invoices i ON i.inv_id = im.ivm_invoice_id
                              WHERE im.ivm_milestone_id = m.qtm_id AND i.inv_status <> 'cancelled') AS has_invoice
               FROM tb_quotation_milestones m WHERE m.qtm_quotation_id IN (?) ORDER BY m.qtm_quotation_id, m.qtm_order`,
              [acceptedIds],
          )
        : [[]];
    for (const quotation of quotations) {
        quotation.milestones = milestones
            .filter((milestone) => milestone.qtm_quotation_id === quotation.qt_id)
            .map((milestone) => ({ ...milestone, has_invoice: Boolean(Number(milestone.has_invoice)) }));
    }
    return quotations;
}

/** ใบแจ้งหนี้ที่ออกแล้ว · ยอดค้างใช้สูตรกลางเดียวกับหน้าลูกหนี้ (หักรับแล้ว ลดหนี้ คืนเงิน) */
async function loadIssuedInvoices(conn, projectIds) {
    const [rows] = await conn.query(
        `SELECT inv_id, inv_project_id, inv_number, inv_currency, inv_total, inv_paid_amount, inv_credited_amount, inv_refunded_amount,
                DATE_FORMAT(inv_due_date, '%Y-%m-%d') AS inv_due_date
         FROM tb_invoices WHERE inv_project_id IN (?) AND inv_status = 'issued'
         ORDER BY inv_due_date, inv_number`,
        [projectIds],
    );
    return rows.map((invoice) => ({ ...invoice, outstanding: invoiceService.balanceOf(invoice).outstanding }));
}

async function loadShares(conn, projectIds) {
    const [configured] = await conn.query(
        "SELECT DISTINCT shr_project_id FROM tb_project_shares WHERE shr_project_id IN (?)",
        [projectIds],
    );
    const [settled] = await conn.query(
        `SELECT s.sst_project_id, SUM(l.ssl_status = 'unpaid') AS unpaid_count
         FROM tb_share_settlements s LEFT JOIN tb_share_settlement_lines l ON l.ssl_settlement_id = s.sst_id
         WHERE s.sst_status = 'settled' AND s.sst_project_id IN (?) GROUP BY s.sst_project_id`,
        [projectIds],
    );
    return {
        configured: new Set(configured.map((row) => row.shr_project_id)),
        unpaidBySettled: new Map(settled.map((row) => [row.sst_project_id, Number(row.unpaid_count ?? 0)])),
    };
}

/** ค่าใช้จ่ายรออนุมัติ นับเป็นเอกสาร (เอกสารเดียวมีหลายบรรทัดของโปรเจกต์เดียวกัน = 1) */
async function loadPendingExpenses(conn, projectIds) {
    const [rows] = await conn.query(
        `SELECT l.exl_project_id, COUNT(DISTINCT e.ex_id) AS expense_count
         FROM tb_expense_lines l JOIN tb_expenses e ON e.ex_id = l.exl_expense_id
         WHERE l.exl_project_id IN (?) AND e.ex_status = 'pending_approval'
         GROUP BY l.exl_project_id`,
        [projectIds],
    );
    return new Map(rows.map((row) => [row.exl_project_id, Number(row.expense_count)]));
}

/** ลิงก์ความต้องการของงาน (ลิงก์ Fastwork ที่ผูกงาน) ที่ยังเปิดรับ + จำนวนคำขอที่ลูกค้าส่งมาแล้ว */
/** รายการต่ออายุของโปรเจกต์ที่ใช้งานอยู่และครบภายใน 30 วัน (บริการรายรอบ 2026-10-31) */
async function loadRenewals(conn, projectIds, today) {
    const { DUE_SOON_DAYS } = require("./renewal.service");
    const { shiftDays } = require("../shared/renewal-math.mjs");
    const [rows] = await conn.query(
        `SELECT r.rnw_project_id, r.rnw_channel, r.rnw_label, p.product_name, DATE_FORMAT(r.rnw_next_due_date, '%Y-%m-%d') AS due
         FROM tb_renewals r JOIN tb_products p ON p.product_id = r.rnw_product_id
         WHERE r.rnw_project_id IN (?) AND r.rnw_status = 'active' AND r.rnw_next_due_date <= ?
         ORDER BY r.rnw_next_due_date`,
        [projectIds, shiftDays(today, DUE_SOON_DAYS)],
    );
    return rows;
}

async function loadRequirements(conn, projects, today) {
    const projectIds = projects.map((project) => project.project_id);
    const statusById = new Map(projects.map((project) => [project.project_id, project.project_status]));
    const [links] = await conn.query(
        `SELECT ol_project_id, ol_status, DATE_FORMAT(ol_expires_on, '%Y-%m-%d') AS ol_expires_on
         FROM tb_order_links WHERE ol_project_id IN (?)`,
        [projectIds],
    );
    const openLinks = new Map();
    for (const link of links) {
        const state = openStateOf({ ...link, project_status: statusById.get(link.ol_project_id) }, today);
        if (state === "open") openLinks.set(link.ol_project_id, (openLinks.get(link.ol_project_id) ?? 0) + 1);
    }
    const [requests] = await conn.query(
        `SELECT COALESCE(r.svr_project_id, l.ol_project_id) AS project_id, COUNT(*) AS request_count
         FROM tb_service_requests r JOIN tb_order_links l ON l.ol_id = r.svr_link_id
         WHERE (r.svr_project_id IN (?) OR l.ol_project_id IN (?)) AND r.svr_status IN ('submitted', 'converted')
         GROUP BY COALESCE(r.svr_project_id, l.ol_project_id)`,
        [projectIds, projectIds],
    );
    return { openLinks, requestCount: new Map(requests.map((row) => [row.project_id, Number(row.request_count)])) };
}

// ─── ช่วยประกอบข้อความ ────────────────────────────────────────────────────────────────────

function item(key, level, title, { reason = null, action = null, waitingFor = null, sortDate = null, count = 1 } = {}) {
    return { key, level, title, reason, action, waiting_for: action ? null : waitingFor, count, sort_date: sortDate };
}

/** ยอดค้างรวม: บาททั้งหมด = "12,000.00 บาท" · มีสกุลอื่นปน = บอกเป็นจำนวนใบ (ไม่รวมคนละสกุล) */
function outstandingText(invoices) {
    const isAllBaht = invoices.every((invoice) => invoice.inv_currency === "THB");
    if (!isAllBaht) return `${invoices.length} ใบ`;
    const total = invoices.reduce((sum, invoice) => sum + invoice.outstanding, 0n);
    return `${formatAmount(total)} บาท`;
}

const projectHref = (projectId, section) => `/projects/view?id=${encodeURIComponent(projectId)}#${section}`;

// ─── กฎ ───────────────────────────────────────────────────────────────────────────────

/**
 * เรื่องที่ต้องทำของโปรเจกต์หนึ่ง + ขั้นของวงจร
 * @param {object} facts ข้อมูลของโปรเจกต์นี้ (จาก nextStepsFor)
 * @param {object} can สิทธิ์ของคนดู (viewerAbilities)
 */
function stepsOf(facts, can, today) {
    const { project, tasks, quotations, invoices, fastwork, shares, pendingExpenses, requirements, renewals } = facts;
    if (project.project_status === "cancelled") return { stage: null, items: [] };

    const projectId = project.project_id;
    const isClosed = project.project_status === "completed";
    const isActive = !isClosed && project.project_status !== "on_hold";
    const items = [];

    const openTasks = tasks.filter((task) => task.task_status !== "done");
    const overdueTasks = openTasks.filter((task) => task.task_due_date && task.task_due_date < today);

    const sentQuotations = quotations.filter((quotation) => quotation.qt_status === "sent");
    const acceptedQuotations = quotations.filter((quotation) => quotation.qt_status === "accepted");
    const unbilledMilestones = acceptedQuotations.flatMap((quotation) =>
        quotation.milestones
            .filter((milestone) => !milestone.has_invoice)
            .map((milestone) => ({ ...milestone, quotation })),
    );
    const owedInvoices = invoices.filter((invoice) => invoice.outstanding > 0n);
    const overdueInvoices = owedInvoices.filter((invoice) => invoice.inv_due_date && invoice.inv_due_date < today);
    const waitingInvoices = owedInvoices.filter((invoice) => !overdueInvoices.includes(invoice));

    const fastworkStep = fastwork ? fastworkService.milestoneStepOf(fastwork, shares.unpaidLines) : null;
    // โปรเจกต์ภายใน (ไม่มีใบเสนอราคา/ใบแจ้งหนี้ ไม่ใช่ Fastwork) = ไม่มีขั้นเรื่องเงิน (Q3)
    const hasMoneyFlow = Boolean(fastwork) || quotations.length > 0 || invoices.length > 0;
    const isMoneyCollected = fastworkStep
        ? fastwork.length > 0 && fastworkStep.received.length === fastwork.length
        : hasMoneyFlow && sentQuotations.length === 0 && unbilledMilestones.length === 0 && owedInvoices.length === 0;
    const isShareSettled = shares.unpaidLines !== undefined;
    // งานครบ = งานในโปรเจกต์เสร็จทุกชิ้น และ (Fastwork) ส่งงวดครบ · Fastwork ที่ไม่ได้แบ่งงาน ดูแค่งวด
    const isFastworkDelivered = fastworkStep ? fastwork.length > 0 && fastworkStep.open.length === 0 : true;
    const isWorkDone = isFastworkDelivered && (tasks.length > 0 ? openTasks.length === 0 : Boolean(fastworkStep));

    // ── เร่ง ──
    if (can.money && overdueInvoices.length > 0) {
        const oldest = overdueInvoices[0];
        const days = invoiceService.daysBetween(oldest.inv_due_date, today);
        items.push(
            item("invoice_overdue", "urgent", `ลูกค้าค้างจ่าย ${outstandingText(overdueInvoices)}`, {
                reason: `เลยกำหนดชำระ ${days} วัน (ครบ ${thaiShortDate(oldest.inv_due_date)} · ${oldest.inv_number})`,
                action: can.createReceipt
                    ? {
                          label: "บันทึกรับเงิน",
                          href: `/sales/receipts/new?invoice=${encodeURIComponent(oldest.inv_id)}`,
                      }
                    : { label: "ดูใบแจ้งหนี้", href: `/sales/invoices/view?id=${encodeURIComponent(oldest.inv_id)}` },
                sortDate: oldest.inv_due_date,
                count: overdueInvoices.length,
            }),
        );
    }
    if (isActive && overdueTasks.length > 0) {
        const oldest = overdueTasks[0];
        items.push(
            item("tasks_overdue", "urgent", `มี ${overdueTasks.length} งานเลยกำหนด`, {
                reason: `เก่าสุด: ${oldest.task_title} (ครบ ${thaiShortDate(oldest.task_due_date)} · เลยมา ${invoiceService.daysBetween(oldest.task_due_date, today)} วัน)`,
                action: { label: "ดูงาน", href: projectHref(projectId, "project-tasks") },
                sortDate: oldest.task_due_date,
                count: overdueTasks.length,
            }),
        );
    }
    if (isActive && fastworkStep) {
        const lateMilestones = fastworkStep.open.filter(
            (milestone) => milestone.fwm_due_date && milestone.fwm_due_date < today,
        );
        if (lateMilestones.length > 0) {
            const oldest = lateMilestones[0];
            items.push(
                item("fastwork_overdue", "urgent", `งวด "${oldest.fwm_name}" เลยกำหนดส่ง`, {
                    reason: `ครบ ${thaiShortDate(oldest.fwm_due_date)} · เลยมา ${invoiceService.daysBetween(oldest.fwm_due_date, today)} วัน · ยังไม่ได้กดส่งงานบน Fastwork`,
                    action: { label: "ดูงวดงาน", href: projectHref(projectId, "project-fastwork") },
                    sortDate: oldest.fwm_due_date,
                    count: lateMilestones.length,
                }),
            );
        }
    }
    // งานครบแล้ว = ส่งทันหรือส่งแล้ว ไม่เตือนย้อนหลัง · มีงวด Fastwork เลยกำหนดอยู่แล้ว = เรื่องเดียวกัน ไม่เตือนซ้ำ (พบจากข้อมูลจำลอง 2026-10-31)
    const hasLateMilestone = items.some((entry) => entry.key === "fastwork_overdue");
    if (isActive && !isWorkDone && !hasLateMilestone && project.project_due_date && project.project_due_date < today) {
        items.push(
            item("project_overdue", "urgent", "เลยกำหนดส่งโปรเจกต์", {
                reason: `ครบ ${thaiShortDate(project.project_due_date)} · เลยมา ${invoiceService.daysBetween(project.project_due_date, today)} วัน · ส่งไม่ทันให้คุยกับลูกค้าแล้วแก้กำหนดส่ง`,
                action: can.editProject
                    ? { label: "แก้กำหนดส่ง", href: `/projects/edit?id=${encodeURIComponent(projectId)}` }
                    : null,
                waitingFor: "PM ของโปรเจกต์",
                sortDate: project.project_due_date,
            }),
        );
    }

    // ── ถึงคิวเรา ──
    if (can.fastworkMoney && fastworkStep && fastworkStep.delivered.length > 0) {
        const first = fastworkStep.delivered[0];
        items.push(
            item("fastwork_record", "todo", `ส่งงวด "${first.fwm_name}" แล้ว รอบันทึกเงิน`, {
                reason: "ผู้ซื้อยืนยันงวดบน Fastwork เมื่อไร บันทึกเงินที่การ์ดงวดงาน",
                action: { label: "บันทึกเงิน", href: projectHref(projectId, "project-fastwork") },
                count: fastworkStep.delivered.length,
            }),
        );
    }
    if (can.money && !isClosed) {
        // งานครบแล้วยังมีงวดไม่ออกใบ = ครอบเรื่องงวดแรกด้วย (บอกเรื่องเดียว)
        if (isWorkDone && unbilledMilestones.length > 0) {
            const first = unbilledMilestones[0];
            items.push(
                item(
                    "work_done_not_billed",
                    "todo",
                    `งานครบแล้ว ยังไม่ออกใบแจ้งหนี้ ${unbilledMilestones.length} งวด`,
                    {
                        reason: `งวดถัดไป: ${first.qtm_name} (ใบเสนอราคา ${first.quotation.qt_number})`,
                        action: can.createInvoice
                            ? {
                                  label: "ออกใบแจ้งหนี้",
                                  href: `/sales/invoices/new?quotation=${encodeURIComponent(first.quotation.qt_id)}`,
                              }
                            : null,
                        waitingFor: "ผู้มีสิทธิ์ออกใบแจ้งหนี้",
                        count: unbilledMilestones.length,
                    },
                ),
            );
        } else {
            // มัดจำ: ใบที่มีหลายงวด แต่งวดแรกยังไม่ออกใบ (ใบงวดเดียวรอเก็บตอนงานเสร็จ)
            const depositQuotation = acceptedQuotations.find(
                (quotation) => quotation.milestones.length >= 2 && !quotation.milestones[0].has_invoice,
            );
            if (depositQuotation) {
                items.push(
                    item(
                        "deposit_not_invoiced",
                        "todo",
                        `ยังไม่ออกใบแจ้งหนี้งวดแรก (${depositQuotation.milestones[0].qtm_name})`,
                        {
                            reason: `ลูกค้าตอบรับใบเสนอราคา ${depositQuotation.qt_number} เมื่อ ${thaiShortDate(depositQuotation.accepted_date)}`,
                            action: can.createInvoice
                                ? {
                                      label: "ออกใบแจ้งหนี้",
                                      href: `/sales/invoices/new?quotation=${encodeURIComponent(depositQuotation.qt_id)}`,
                                  }
                                : null,
                            waitingFor: "ผู้มีสิทธิ์ออกใบแจ้งหนี้",
                            sortDate: depositQuotation.accepted_date,
                        },
                    ),
                );
            }
        }
    }
    if (isActive && requirements.openLinks > 0 && requirements.requestCount > 0) {
        items.push(
            item("requirements_review", "todo", "ลูกค้าส่งความต้องการแล้ว อ่านแล้วปิดรับ", {
                reason: `ลิงก์ยังเปิดรับอยู่ ${requirements.openLinks} ลิงก์ · ปิดรับเมื่อเริ่มออกแบบ การแก้ต่อจากนั้นคุยในแชต`,
                action: { label: "ดูความต้องการ", href: projectHref(projectId, "project-requirements") },
            }),
        );
    }
    if (pendingExpenses > 0 && (can.approveExpense || can.viewExpenses)) {
        items.push(
            item(
                "expense_pending",
                can.approveExpense ? "todo" : "wait",
                `ค่าใช้จ่าย ${pendingExpenses} รายการรออนุมัติ`,
                {
                    reason: "อนุมัติแล้วจึงนับเป็นต้นทุนของโปรเจกต์",
                    action: can.approveExpense
                        ? { label: "ไปอนุมัติ", href: "/purchasing/expenses?tab=waiting_me" }
                        : null,
                    waitingFor: "ผู้อนุมัติค่าใช้จ่าย",
                    count: pendingExpenses,
                },
            ),
        );
    }
    // Fastwork ที่ส่งงวดครบแล้ว ไม่ชวนแบ่งงานย้อนหลัง
    if (isActive && tasks.length === 0 && !(fastworkStep && isFastworkDelivered)) {
        items.push(
            item("no_tasks", "todo", "ยังไม่ได้แบ่งงาน", {
                reason: "เพิ่มงานและมอบหมายคน ทีมจะเห็นว่าต้องทำอะไร และระบบนับความคืบหน้าได้",
                action: can.addTask ? { label: "เพิ่มงาน", href: projectHref(projectId, "project-tasks") } : null,
                waitingFor: "PM ของโปรเจกต์",
            }),
        );
    }
    const isReadyToComplete = !isClosed && isWorkDone && (!hasMoneyFlow || isMoneyCollected);
    if (isReadyToComplete) {
        items.push(
            item(
                "ready_to_complete",
                "todo",
                hasMoneyFlow ? "งานครบ เงินครบ ปิดโปรเจกต์ได้" : "งานครบแล้ว ปิดโปรเจกต์ได้",
                {
                    reason: 'เปลี่ยนสถานะเป็น "เสร็จแล้ว" ระบบบันทึกวันที่เสร็จไว้คิด KPI ส่งงานตรงเวลา',
                    action: can.editProject
                        ? { label: "ปิดโปรเจกต์", href: `/projects/edit?id=${encodeURIComponent(projectId)}` }
                        : null,
                    waitingFor: "PM ของโปรเจกต์",
                },
            ),
        );
    }
    if (can.shares && shares.isConfigured && !isShareSettled && isMoneyCollected) {
        items.push(
            item("shares_close", "todo", "เงินเข้าครบ พร้อมปิดยอดส่วนแบ่ง", {
                reason: "ปิดยอดแล้วล็อกตัวเลขของแต่ละคน แล้วบันทึกจ่ายได้",
                action: { label: "ปิดยอด", href: `/fastwork/shares/project?id=${encodeURIComponent(projectId)}` },
            }),
        );
    }
    if (can.shares && isShareSettled && shares.unpaidLines > 0) {
        items.push(
            item("shares_pay", "todo", `ค้างจ่ายส่วนแบ่ง ${shares.unpaidLines} คน`, {
                reason: "ปิดยอดแล้ว · โอนแล้วบันทึกจ่ายทีละคน",
                action: { label: "บันทึกจ่าย", href: `/fastwork/shares/project?id=${encodeURIComponent(projectId)}` },
                count: shares.unpaidLines,
            }),
        );
    }

    // ── รอคนอื่น ──
    if (isActive && requirements.openLinks > 0 && requirements.requestCount === 0) {
        items.push(
            item("requirements_wait", "wait", "รอลูกค้าส่งความต้องการ", {
                reason: `ส่งลิงก์ให้ลูกค้าแล้ว (เปิดรับอยู่ ${requirements.openLinks} ลิงก์)`,
                action: { label: "ดูลิงก์", href: projectHref(projectId, "project-requirements") },
            }),
        );
    }
    if (can.quotations) {
        for (const quotation of sentQuotations) {
            const isExpired = quotation.valid_until && quotation.valid_until < today;
            items.push(
                item("quotation_wait", "wait", `ส่งใบเสนอราคา ${quotation.qt_number} แล้ว ลูกค้ายังไม่ตอบ`, {
                    reason: [
                        quotation.sent_date
                            ? `ส่งเมื่อ ${thaiShortDate(quotation.sent_date)} (${invoiceService.daysBetween(quotation.sent_date, today)} วันแล้ว)`
                            : null,
                        quotation.valid_until
                            ? `${isExpired ? "หมดอายุแล้ว" : "หมดอายุ"} ${thaiShortDate(quotation.valid_until)}`
                            : null,
                    ]
                        .filter(Boolean)
                        .join(" · "),
                    action: {
                        label: "ดูใบเสนอราคา",
                        href: `/sales/quotations/view?id=${encodeURIComponent(quotation.qt_id)}`,
                    },
                    sortDate: quotation.sent_date,
                }),
            );
        }
    }
    if (can.money && waitingInvoices.length > 0) {
        const nearest = waitingInvoices[0];
        items.push(
            item("invoice_wait", "wait", `รอลูกค้าจ่าย ${outstandingText(waitingInvoices)}`, {
                reason: nearest.inv_due_date
                    ? `ครบกำหนด ${thaiShortDate(nearest.inv_due_date)} (${nearest.inv_number})`
                    : nearest.inv_number,
                action: {
                    label: "ดูใบแจ้งหนี้",
                    href: `/sales/invoices/view?id=${encodeURIComponent(nearest.inv_id)}`,
                },
                sortDate: nearest.inv_due_date,
                count: waitingInvoices.length,
            }),
        );
    }
    // ต่ออายุบริการ (2026-10-31): เห็นตามสิทธิ์ของช่องทาง · ปิดโปรเจกต์แล้วยังเตือน (บริการยังใช้งานอยู่)
    const myRenewals = renewals.filter((renewal) => (renewal.rnw_channel === "fastwork" ? can.fastworkMoney : can.createInvoice));
    if (myRenewals.length > 0) {
        const nearest = myRenewals[0];
        const isLate = nearest.due < today;
        const name = nearest.rnw_label || nearest.product_name;
        const days = invoiceService.daysBetween(today, nearest.due);
        items.push(
            item("renewal_due", isLate ? "urgent" : "todo", isLate ? `เลยกำหนดต่ออายุ ${name}` : `ต่ออายุ ${name} ใน ${days} วัน`, {
                reason: `ครบ ${thaiShortDate(nearest.due)}${myRenewals.length > 1 ? ` · รวม ${myRenewals.length} รายการ` : ""} · ${nearest.rnw_channel === "fastwork" ? "แจ้งผู้ซื้อสั่งต่ออายุบน Fastwork" : "ออกใบแจ้งหนี้รอบนี้ได้ที่หน้าต่ออายุ"}`,
                action: { label: "ไปหน้าต่ออายุ", href: `/sales/renewals?tab=${isLate ? "overdue" : "due_soon"}` },
                sortDate: nearest.due,
                count: myRenewals.length,
            }),
        );
    }
    if (can.fastworkMoney && fastworkStep && fastworkStep.pendingPayouts.length > 0) {
        items.push(
            item("fastwork_receive", "wait", `รอ Fastwork โอนเงินงวด "${fastworkStep.pendingPayouts[0].fwm_name}"`, {
                reason: "เงินเข้าบัญชีแล้วกดยืนยันเงินเข้าที่การ์ดงวดงาน",
                action: { label: "ดูงวดงาน", href: projectHref(projectId, "project-fastwork") },
                count: fastworkStep.pendingPayouts.length,
            }),
        );
    }
    if (project.project_status === "on_hold") {
        items.push(
            item("on_hold", "wait", "พักโปรเจกต์อยู่", {
                reason: "ไม่เตือนเรื่องงานระหว่างพัก · กลับมาทำต่อให้เปลี่ยนสถานะเป็นกำลังทำ",
                action: can.editProject
                    ? { label: "เปิดทำต่อ", href: `/projects/edit?id=${encodeURIComponent(projectId)}` }
                    : null,
                waitingFor: "PM ของโปรเจกต์",
            }),
        );
    }

    // ── ไม่มีเรื่องเร่ง/ถึงคิว: บอกงานถัดไป ──
    const hasActionable = items.some((entry) => entry.level === "urgent" || entry.level === "todo");
    if (!hasActionable && isActive && openTasks.length > 0) {
        const nextTask = openTasks.find((task) => task.task_due_date) ?? openTasks[0];
        items.push(
            item("next_task", "info", "ทำงานต่อได้", {
                reason: nextTask.task_due_date
                    ? `งานถัดไป: ${nextTask.task_title} (ครบ ${thaiShortDate(nextTask.task_due_date)}) · ยังไม่เสร็จ ${openTasks.length} งาน`
                    : `ยังไม่เสร็จ ${openTasks.length} งาน`,
                action: { label: "ดูงาน", href: projectHref(projectId, "project-tasks") },
            }),
        );
    }

    items.sort((left, right) => {
        const byLevel = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
        if (byLevel !== 0) return byLevel;
        if (left.sort_date === right.sort_date) return 0;
        if (left.sort_date === null) return 1;
        if (right.sort_date === null) return -1;
        return left.sort_date < right.sort_date ? -1 : 1;
    });

    return {
        stage: stageOf({
            project,
            hasMoneyFlow,
            acceptedQuotations,
            invoices,
            fastworkStep,
            isWorkDone,
            isMoneyCollected,
            shares,
            isShareSettled,
        }),
        items,
    };
}

/**
 * ขั้นของวงจร: current = ขั้นแรกที่ยังไม่ครบ · แต่ละขั้นบอก is_complete ของตัวเอง (เก็บเงินครบก่อนงานเสร็จได้ เช่น มัดจำเต็ม)
 * โปรเจกต์ภายในไม่มีขั้นเงิน · ไม่ได้ตั้งส่วนแบ่งไม่มีขั้นปิดยอด/จ่าย
 */
function stageOf({
    project,
    hasMoneyFlow,
    acceptedQuotations,
    invoices,
    fastworkStep,
    isWorkDone,
    isMoneyCollected,
    shares,
    isShareSettled,
}) {
    const isClosed = project.project_status === "completed";
    const steps = [];
    if (hasMoneyFlow && !fastworkStep)
        steps.push({ key: "agree", isComplete: acceptedQuotations.length > 0 || invoices.length > 0 });
    steps.push({ key: "work", isComplete: isClosed || isWorkDone });
    if (hasMoneyFlow) steps.push({ key: "collect", isComplete: isMoneyCollected });
    if (shares.isConfigured || isShareSettled) {
        steps.push({ key: "settle", isComplete: isShareSettled });
        steps.push({ key: "pay", isComplete: isShareSettled && shares.unpaidLines === 0 });
    }
    steps.push({ key: "done", isComplete: isClosed });
    const firstOpen = steps.findIndex((step) => !step.isComplete);
    return {
        steps: steps.map((step) => ({ key: step.key, label: STAGE_LABELS[step.key], is_complete: step.isComplete })),
        current: firstOpen === -1 ? steps.length - 1 : firstOpen,
    };
}

// ─── ทางเข้า ──────────────────────────────────────────────────────────────────────────

/**
 * สิทธิ์ของคนดูที่กฎใช้ · positionPermission = สิทธิ์ในโปรเจกต์นั้น ("" = ไม่ได้เป็นสมาชิก ดูได้เพราะ viewAllProjects)
 */
function viewerAbilities(rolePermission, positionPermission) {
    return {
        money: hasBit(rolePermission, "viewInvoices"),
        createInvoice: hasBit(rolePermission, "createInvoice"),
        createReceipt: hasBit(rolePermission, "createReceipt"),
        quotations: hasBit(rolePermission, "viewQuotations"),
        fastworkMoney: hasBit(rolePermission, "manageFastwork"),
        shares: hasBit(rolePermission, "manageProfitShares"),
        approveExpense: hasBit(rolePermission, "approveExpense"),
        viewExpenses: hasBit(rolePermission, "viewExpenses"),
        addTask: hasProjectBit(positionPermission, "addTask"),
        editProject: hasProjectBit(positionPermission, "editProjectInfo"),
    };
}

/**
 * ต่อไปต้องทำของหลายโปรเจกต์ในคราวเดียว
 * @param {string[]} projectIds
 * @param {{ rolePermission: string, positionPermissionById: Map<string, string> }} viewer
 * @returns {Promise<Map<string, { stage: object | null, items: object[] }>>}
 */
async function nextStepsFor(conn, projectIds, viewer) {
    const result = new Map();
    if (projectIds.length === 0) return result;
    const today = todayBangkok();
    const projects = await loadProjects(conn, projectIds);
    if (projects.length === 0) return result;
    const ids = projects.map((project) => project.project_id);
    const fastworkIds = projects
        .filter((project) => project.project_channel === "fastwork")
        .map((project) => project.project_id);

    const tasks = await loadTasks(conn, ids);
    const quotations = await loadQuotations(conn, ids);
    const invoices = await loadIssuedInvoices(conn, ids);
    const fastworkMilestones = await fastworkService.findMilestoneStates(conn, fastworkIds);
    const shares = await loadShares(conn, ids);
    const pendingExpenses = await loadPendingExpenses(conn, ids);
    const requirements = await loadRequirements(conn, projects, today);
    const renewals = await loadRenewals(conn, ids, today);

    for (const project of projects) {
        const projectId = project.project_id;
        const facts = {
            project,
            tasks: tasks.filter((task) => task.project_id === projectId),
            quotations: quotations.filter((quotation) => quotation.qt_project_id === projectId),
            invoices: invoices.filter((invoice) => invoice.inv_project_id === projectId),
            fastwork:
                project.project_channel === "fastwork"
                    ? fastworkMilestones.filter((milestone) => milestone.fwm_project_id === projectId)
                    : null,
            shares: {
                isConfigured: shares.configured.has(projectId),
                unpaidLines: shares.unpaidBySettled.get(projectId),
            },
            pendingExpenses: pendingExpenses.get(projectId) ?? 0,
            renewals: renewals.filter((renewal) => renewal.rnw_project_id === projectId),
            requirements: {
                openLinks: requirements.openLinks.get(projectId) ?? 0,
                requestCount: requirements.requestCount.get(projectId) ?? 0,
            },
        };
        const can = viewerAbilities(viewer.rolePermission, viewer.positionPermissionById.get(projectId) ?? "");
        result.set(projectId, { project_name: project.project_name, ...stepsOf(facts, can, today) });
    }
    return result;
}

/** ต่อไปต้องทำของผู้ใช้คนหนึ่ง · ปุ่มตามตำแหน่งที่ถือในแต่ละโปรเจกต์ (ไม่ได้เป็นสมาชิก = ไม่มีสิทธิ์ในโปรเจกต์) */
async function nextStepsForUser(conn, user, projectIds) {
    if (projectIds.length === 0) return new Map();
    const [positionRows] = await conn.query(
        `SELECT pm.project_id, pp.position_permission
         FROM tb_project_members pm
         LEFT JOIN tb_project_member_positions pmp ON pmp.project_member_id = pm.project_member_id
         LEFT JOIN tb_project_positions pp ON pp.position_id = pmp.position_id
         WHERE pm.user_id = ? AND pm.project_id IN (?)`,
        [user.user_id, projectIds],
    );
    const permissionsByProject = new Map();
    for (const row of positionRows) {
        permissionsByProject.set(row.project_id, [
            ...(permissionsByProject.get(row.project_id) ?? []),
            row.position_permission,
        ]);
    }
    const positionPermissionById = new Map(
        [...permissionsByProject].map(([projectId, permissions]) => [
            projectId,
            combinePositionPermissions(permissions),
        ]),
    );
    return nextStepsFor(conn, projectIds, { rolePermission: user.role_permission, positionPermissionById });
}

/**
 * สิ่งที่ต้องทำรวมทุกโปรเจกต์ (แดชบอร์ด · Q1): เฉพาะเรื่องเร่ง/ถึงคิวที่ผู้ใช้กดทำได้เอง (มีปุ่ม)
 * โปรเจกต์ที่เห็น = เดียวกับรายการโปรเจกต์ (ดูทุกโปรเจกต์ หรือเป็นสมาชิก) ไม่รวมที่ยกเลิก
 * @returns {Promise<{ items: object[], total: number, waiting_count: number }>}
 */
async function todoForUser(conn, user, limit) {
    const seesAll = hasBit(user.role_permission, "viewAllProjects");
    const canSeeOwn = seesAll || hasBit(user.role_permission, "viewOwnProjects");
    if (!canSeeOwn) return { items: [], total: 0, waiting_count: 0 };
    const [projects] = seesAll
        ? await conn.query("SELECT project_id FROM tb_projects WHERE project_status <> 'cancelled'")
        : await conn.query(
              `SELECT p.project_id FROM tb_projects p JOIN tb_project_members pm ON pm.project_id = p.project_id AND pm.user_id = ?
               WHERE p.project_status <> 'cancelled'`,
              [user.user_id],
          );
    const stepsById = await nextStepsForUser(
        conn,
        user,
        projects.map((project) => project.project_id),
    );
    const actionable = [];
    let waitingCount = 0;
    for (const [projectId, steps] of stepsById) {
        for (const entry of steps.items) {
            const isActionable = (entry.level === "urgent" || entry.level === "todo") && entry.action;
            if (isActionable) actionable.push({ ...entry, project_id: projectId, project_name: steps.project_name });
            else if (entry.level !== "info") waitingCount += 1;
        }
    }
    actionable.sort((left, right) => {
        const byLevel = LEVEL_ORDER[left.level] - LEVEL_ORDER[right.level];
        if (byLevel !== 0) return byLevel;
        if (left.sort_date === right.sort_date) return 0;
        if (left.sort_date === null) return 1;
        if (right.sort_date === null) return -1;
        return left.sort_date < right.sort_date ? -1 : 1;
    });
    return { items: actionable.slice(0, limit), total: actionable.length, waiting_count: waitingCount };
}

module.exports = { nextStepsFor, nextStepsForUser, todoForUser };
