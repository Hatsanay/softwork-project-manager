// บอร์ดงานแบบ Trello (2026-10-17) — ป้ายสี · ป้ายของงาน · checklist · เรียงลำดับการ์ด
// รับคำขอ → ตรวจข้อมูล (zod) → ตรวจสิทธิ์ตามกติกาเดิมของงาน → เรียก service → ตอบ
// สิทธิ์: ป้ายของโปรเจกต์ = editProjectInfo (route) · ติดป้าย/แก้ checklist = แก้ไขงานนั้นได้ · ติ๊ก checklist = เปลี่ยนสถานะงานนั้นได้
//         เรียงลำดับการ์ด = editTask (route — K4-ก)
const pool = require("../config/db");
const { validate } = require("../utils/validate");
const { withTransaction } = require("../utils/with-transaction");
const { AppError } = require("../utils/app-error");
const {
    projectLabelSchema,
    taskLabelsSchema,
    checklistItemSchema,
    checklistDoneSchema,
    checklistOrderSchema,
    taskOrderSchema,
} = require("../shared/schemas/task-board.mjs");
const boardService = require("../services/task-board.service");
const { canEditTask, canChangeStatus, writeTaskLog } = require("./task.controller");

const CHECKLIST_LOG_TEXT_LENGTH = 120;

async function assertCanEdit(req) {
    if (await canEditTask(req.projectPermission, req.task.task_id, req.user.user_id)) return;
    throw new AppError(
        403,
        "TASK_EDIT_NOT_ALLOWED",
        "แก้ไขงานนี้ไม่ได้ · ต้องเป็นผู้รับผิดชอบงานนี้ หรือมีสิทธิ์แก้ไขงานในตำแหน่งของคุณ",
    );
}

async function assertCanChangeStatus(req) {
    if (await canChangeStatus(req.projectPermission, req.task, req.user.user_id)) return;
    throw new AppError(
        403,
        "TASK_STATUS_NOT_ALLOWED",
        "ติ๊ก checklist ไม่ได้ · ต้องเป็นผู้รับผิดชอบงานนี้ หรือมีสิทธิ์เปลี่ยนสถานะงานในตำแหน่งของคุณ",
    );
}

function shortText(text) {
    return text.length > CHECKLIST_LOG_TEXT_LENGTH ? `${text.slice(0, CHECKLIST_LOG_TEXT_LENGTH)}…` : text;
}

// ประวัติงานใช้ action "edited" เดิม + ข้อความ (log_action เป็น ENUM — ไม่แก้ตารางเดิม)
function logTaskEdit(req, message) {
    return writeTaskLog({ task_id: req.task.task_id, user_id: req.user.user_id, action: "edited", message });
}

// ─── ป้ายของโปรเจกต์ ─────────────────────────────────────────────────────────────────────────

async function listLabels(req, res, next) {
    try {
        res.json({ data: await boardService.listLabels(pool, req.params.projectId) });
    } catch (err) {
        next(err);
    }
}

async function createLabel(req, res, next) {
    try {
        const label = validate(projectLabelSchema, req.body);
        res.status(201).json(
            await withTransaction((conn) => boardService.createLabel(conn, req.params.projectId, label, req.user)),
        );
    } catch (err) {
        next(err);
    }
}

async function updateLabel(req, res, next) {
    try {
        const label = validate(projectLabelSchema, req.body);
        res.json(
            await withTransaction((conn) =>
                boardService.updateLabel(conn, req.params.projectId, Number(req.params.labelId), label),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function deleteLabel(req, res, next) {
    try {
        res.json(
            await withTransaction((conn) =>
                boardService.deleteLabel(conn, req.params.projectId, Number(req.params.labelId)),
            ),
        );
    } catch (err) {
        next(err);
    }
}

async function setTaskLabels(req, res, next) {
    try {
        const { label_ids: labelIds } = validate(taskLabelsSchema, req.body);
        await assertCanEdit(req);
        const labelNames = await withTransaction((conn) => boardService.setTaskLabels(conn, req.task, labelIds));
        await logTaskEdit(req, labelNames.length > 0 ? `ป้าย: ${labelNames.join(", ")}` : "เอาป้ายออกทั้งหมด");
        res.json({ task_id: req.task.task_id, label_ids: labelIds });
    } catch (err) {
        next(err);
    }
}

// ─── checklist ────────────────────────────────────────────────────────────────────────────

async function listChecklist(req, res, next) {
    try {
        res.json({ data: await boardService.listChecklist(pool, req.task.task_id) });
    } catch (err) {
        next(err);
    }
}

async function addChecklistItem(req, res, next) {
    try {
        const { tci_text: text } = validate(checklistItemSchema, req.body);
        await assertCanEdit(req);
        const created = await withTransaction((conn) =>
            boardService.addChecklistItem(conn, req.task.task_id, text, req.user),
        );
        await logTaskEdit(req, `เพิ่ม checklist: ${shortText(text)}`);
        res.status(201).json(created);
    } catch (err) {
        next(err);
    }
}

async function updateChecklistItem(req, res, next) {
    try {
        const { tci_text: text } = validate(checklistItemSchema, req.body);
        await assertCanEdit(req);
        const { before } = await withTransaction((conn) =>
            boardService.updateChecklistItem(conn, req.task.task_id, Number(req.params.itemId), text),
        );
        await logTaskEdit(req, `แก้ checklist: ${shortText(before)} → ${shortText(text)}`);
        res.json({ tci_id: Number(req.params.itemId) });
    } catch (err) {
        next(err);
    }
}

async function setChecklistItemDone(req, res, next) {
    try {
        const { tci_is_done: isDone } = validate(checklistDoneSchema, req.body);
        await assertCanChangeStatus(req);
        const result = await withTransaction((conn) =>
            boardService.setChecklistItemDone(conn, req.task.task_id, Number(req.params.itemId), isDone, req.user),
        );
        if (result.changed) {
            await logTaskEdit(req, `${isDone ? "ติ๊กเสร็จ" : "เอาติ๊กออก"} checklist: ${shortText(result.text)}`);
        }
        res.json({ tci_id: Number(req.params.itemId), tci_is_done: isDone });
    } catch (err) {
        next(err);
    }
}

async function deleteChecklistItem(req, res, next) {
    try {
        await assertCanEdit(req);
        const { text } = await withTransaction((conn) =>
            boardService.deleteChecklistItem(conn, req.task.task_id, Number(req.params.itemId)),
        );
        await logTaskEdit(req, `ลบ checklist: ${shortText(text)}`);
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

async function reorderChecklist(req, res, next) {
    try {
        const { item_ids: itemIds } = validate(checklistOrderSchema, req.body);
        await assertCanEdit(req);
        await withTransaction((conn) => boardService.reorderChecklist(conn, req.task.task_id, itemIds));
        res.json({ task_id: req.task.task_id });
    } catch (err) {
        next(err);
    }
}

// ─── เรียงลำดับการ์ด ────────────────────────────────────────────────────────────────────────

async function reorderTasks(req, res, next) {
    try {
        const order = validate(taskOrderSchema, req.body);
        await withTransaction((conn) => boardService.reorderTasks(conn, req.params.projectId, order));
        res.json({ task_status: order.task_status });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    setTaskLabels,
    listChecklist,
    addChecklistItem,
    updateChecklistItem,
    setChecklistItemDone,
    deleteChecklistItem,
    reorderChecklist,
    reorderTasks,
};
