// ลูกค้าตอบรับใบเสนอราคา → โปรเจกต์ + งานจากรายการ (2026-10-14 ขั้น 1A-4 — sales-cycle หัวข้อ 7)
//
// - เลือก: สร้างโปรเจกต์ใหม่ (ผู้กดเป็น PM) / ผูกโปรเจกต์เดิมของลูกค้ารายนี้ / ไม่ผูก
// - "สร้างงานจากรายการ": หัวข้อ = งานหลัก · รายการ = งานย่อยใต้หัวข้อล่าสุด (ก่อนหัวข้อแรก = งานหลักระดับบนสุด) · หมายเหตุไม่สร้างงาน
// - ไม่คัดลอกราคาไปในงาน · ทุกงานเก็บ task_quotation_item_id ไว้อ้างกลับ (ช่วง 1D เทียบความคืบหน้ากับการวางบิล)
// - ทำทั้งหมดใน transaction เดียว — สร้างงานไม่ครบ = ไม่ตอบรับ · ตอบรับแล้วล็อกถาวร
const { AppError } = require("../utils/app-error");
const { generateDailyId } = require("../utils/generateDailyId");
const { hasBit } = require("../utils/permissions");
const quotationService = require("./quotation.service");
const projectService = require("./project.service");

const ACCEPTABLE_STATUSES = ["approved", "sent"];
const MAX_TASK_TITLE_LENGTH = 200;

/**
 * บรรทัดแรกของรายละเอียด ตัดไม่เกิน 200 "ตัวอักษรที่มองเห็น" (R12 — ไม่ตัดกลางสระ/วรรณยุกต์ไทยหรืออีโมจิ)
 * @param {string} description
 */
function taskTitleFrom(description) {
    const firstLine =
        String(description)
            .split(/\r?\n/)
            .find((line) => line.trim() !== "") ?? "งานจากใบเสนอราคา";
    const graphemes = [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(firstLine.trim())].map(
        (part) => part.segment,
    );
    if (graphemes.length <= MAX_TASK_TITLE_LENGTH) return graphemes.join("");
    return graphemes.slice(0, MAX_TASK_TITLE_LENGTH - 1).join("") + "…";
}

function documentLabel(quotation) {
    const revision = quotation.qt_revision > 0 ? ` Rev.${quotation.qt_revision}` : "";
    return `${quotation.qt_number}${revision}`;
}

// ผู้ใช้เข้าถึงโปรเจกต์นี้ได้ไหม (สมาชิก หรือมีสิทธิ์ดูทุกโปรเจกต์) — กันเพิ่มงานลงโปรเจกต์ที่ตัวเองไม่เกี่ยว
async function canUseProject(conn, projectId, actor) {
    if (hasBit(actor.role_permission, "viewAllProjects")) return true;
    const [[member]] = await conn.query("SELECT 1 FROM tb_project_members WHERE project_id = ? AND user_id = ?", [
        projectId,
        actor.user_id,
    ]);
    return Boolean(member);
}

/**
 * โปรเจกต์ของลูกค้ารายนี้ที่ผูกได้ (ยังไม่ยกเลิก และผู้ใช้เข้าถึงได้)
 * @param {import("mysql2/promise").Pool} conn
 */
async function listProjectOptions(conn, quotationId, actor) {
    const [[quotation]] = await conn.query("SELECT qt_client_id FROM tb_quotations WHERE qt_id = ?", [quotationId]);
    if (!quotation) throw quotationService.notFound();
    const [projects] = await conn.query(
        `SELECT project_id, project_name, project_status FROM tb_projects
         WHERE client_id = ? AND project_status <> 'cancelled'
         ORDER BY project_id DESC`,
        [quotation.qt_client_id],
    );
    const usable = [];
    for (const project of projects) {
        if (await canUseProject(conn, project.project_id, actor)) usable.push(project);
    }
    return {
        projects: usable,
        can_create_project: hasBit(actor.role_permission, "createProject"),
    };
}

/**
 * สร้างงานจากแถวรายการ — ใช้ทั้งใบเสนอราคาและคำขอบริการ (2026-10-25)
 * หัวข้อ = งานหลัก · รายการ = งานย่อยใต้หัวข้อล่าสุด (ก่อนหัวข้อแรก = งานหลักระดับบนสุด) · หมายเหตุไม่สร้างงาน
 * @param {{ type: "heading" | "item" | "note", description: string, quotationItemId?: number | null }[]} rows
 * @param {string} sourceNote ต่อท้ายรายละเอียดงาน เช่น "จากใบเสนอราคา QT-..."
 */
async function insertTasksFromRows(conn, projectId, rows, sourceNote) {
    // โปรเจกต์เดิม: ต่อท้ายงานที่มีอยู่
    const [[{ lastOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(task_sort_order), 0) AS lastOrder FROM tb_tasks WHERE project_id = ?",
        [projectId],
    );
    let sortOrder = Number(lastOrder);
    let currentHeadingTaskId = null;
    let taskCount = 0;
    for (const row of rows) {
        if (row.type === "note") continue;
        const isHeading = row.type === "heading";
        const taskId = await generateDailyId("tb_tasks", "task_id", "TAS");
        sortOrder += 1;
        await conn.query(
            `INSERT INTO tb_tasks
                (task_id, project_id, task_parent_id, task_title, task_description, task_sort_order, task_quotation_item_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                taskId,
                projectId,
                isHeading ? null : currentHeadingTaskId,
                taskTitleFrom(row.description),
                `${row.description}\n\n${sourceNote}`,
                sortOrder,
                row.quotationItemId ?? null,
            ],
        );
        if (isHeading) currentHeadingTaskId = taskId;
        taskCount += 1;
    }
    return taskCount;
}

async function createTasksFromItems(conn, quotation, projectId) {
    const [items] = await conn.query(
        "SELECT qti_id, qti_type, qti_description FROM tb_quotation_items WHERE qti_quotation_id = ? ORDER BY qti_order, qti_id",
        [quotation.qt_id],
    );
    const rows = items.map((item) => ({ type: item.qti_type, description: item.qti_description, quotationItemId: item.qti_id }));
    return insertTasksFromRows(conn, projectId, rows, `จากใบเสนอราคา ${documentLabel(quotation)}`);
}

/**
 * @param {import("mysql2/promise").PoolConnection} conn
 * @param {string} quotationId
 * @param {{ project_mode: "new" | "existing" | "none", project_id?: string | null, create_tasks: boolean, qt_version?: number | null }} choice
 * @param {{ user_id: string, role_permission: string }} actor ลูกค้ากดเองในลิงก์ = ผู้รับคำขอ (เป็น PM ของโปรเจกต์ใหม่)
 * @param {{ isCustomerAcceptance?: boolean, isFastworkTakeJob?: boolean }} [options]
 *   isCustomerAcceptance: ลูกค้ากดยอมรับเองในลิงก์เลือกบริการ (2026-10-25 · S-4) ไม่ตรวจสิทธิ์สร้างโปรเจกต์ของผู้รับคำขอ
 *   isFastworkTakeJob: รับงาน Fastwork จากคำขอ (S-5) · ใบภายในของงาน Fastwork ตอบรับได้ทางนี้ทางเดียว
 */
async function acceptQuotation(conn, quotationId, choice, actor, { isCustomerAcceptance = false, isFastworkTakeJob = false } = {}) {
    const quotation = await quotationService.findForUpdate(conn, quotationId);
    if (!isFastworkTakeJob && (await quotationService.fastworkSourceOf(conn, quotation))) throw quotationService.fastworkInternalError();
    if (!ACCEPTABLE_STATUSES.includes(quotation.qt_status)) {
        throw quotationService.wrongStatus(
            "บันทึกว่าลูกค้าตอบรับได้เฉพาะใบที่อนุมัติแล้วหรือส่งลูกค้าแล้ว (ใบที่หมดอายุให้ออก revision ก่อน)",
        );
    }
    quotationService.assertVersion(quotation, choice.qt_version);

    let projectId = null;
    if (choice.project_mode === "new") {
        if (!isCustomerAcceptance && !hasBit(actor.role_permission, "createProject")) {
            throw new AppError(
                403,
                "CANNOT_CREATE_PROJECT",
                "คุณไม่มีสิทธิ์สร้างโปรเจกต์ — เลือกผูกโปรเจกต์เดิม หรือไม่ผูก แล้วให้ผู้มีสิทธิ์สร้างโปรเจกต์ภายหลัง",
            );
        }
        const created = await projectService.insertProject(
            conn,
            {
                project_name: quotation.qt_title,
                client_id: quotation.qt_client_id,
                project_description: `สร้างจากใบเสนอราคา ${documentLabel(quotation)} ที่ลูกค้าตอบรับ`,
            },
            actor.user_id,
        );
        projectId = created.project_id;
    } else if (choice.project_mode === "existing") {
        const [[project]] = await conn.query(
            "SELECT client_id, project_status FROM tb_projects WHERE project_id = ? FOR UPDATE",
            [choice.project_id],
        );
        if (!project || project.project_status === "cancelled") {
            throw new AppError(400, "VALIDATION", "ไม่พบโปรเจกต์นี้ หรือถูกยกเลิกไปแล้ว", {
                project_id: "เลือกโปรเจกต์ใหม่",
            });
        }
        if (project.client_id !== quotation.qt_client_id) {
            throw new AppError(400, "VALIDATION", "โปรเจกต์นี้เป็นของลูกค้ารายอื่น", {
                project_id: "เลือกได้เฉพาะโปรเจกต์ของลูกค้าในใบนี้",
            });
        }
        if (!(await canUseProject(conn, choice.project_id, actor))) {
            throw new AppError(
                403,
                "PROJECT_NOT_ACCESSIBLE",
                "คุณไม่ได้เป็นสมาชิกโปรเจกต์นี้ — ให้ PM ของโปรเจกต์เป็นคนผูก หรือเพิ่มคุณเป็นสมาชิกก่อน",
            );
        }
        projectId = choice.project_id;
    }

    const taskCount = projectId && choice.create_tasks ? await createTasksFromItems(conn, quotation, projectId) : 0;

    await conn.query(
        `UPDATE tb_quotations SET qt_status = 'accepted', qt_responded_at = NOW(), qt_project_id = ?, qt_version = qt_version + 1
         WHERE qt_id = ?`,
        [projectId, quotationId],
    );
    return { qt_id: quotationId, project_id: projectId, task_count: taskCount };
}

module.exports = { acceptQuotation, listProjectOptions, taskTitleFrom, insertTasksFromRows };
