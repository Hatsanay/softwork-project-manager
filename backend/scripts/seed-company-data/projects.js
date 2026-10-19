// โปรเจกต์: สมาชิกและตำแหน่ง · ผู้รับผิดชอบงาน · ความคืบหน้าของงาน · ป้ายสี · checklist · สถานะโปรเจกต์
const { as } = require("./api");

const dateOnly = (value) => (value ? String(value).slice(0, 10) : null);

/** เพิ่มสมาชิก [{ userId, positionIds }] */
async function addMembers(owner, projectId, members) {
    for (const member of members) {
        await as(owner, "POST", `/V1/projects/${projectId}/members`, {
            user_id: member.userId,
            position_ids: member.positionIds,
        });
    }
}

async function listTasks(user, projectId) {
    const tasks = await as(user, "GET", `/V1/projects/${projectId}/tasks`);
    return tasks.data;
}

/** มอบหมายงาน (และงานย่อยใต้งานนั้น) ให้คน — rotation ตามลำดับงานหลัก */
async function assignTasks(owner, projectId, userIdsByRound) {
    const tasks = await listTasks(owner, projectId);
    const topLevel = tasks.filter((task) => !task.task_parent_id);
    for (const [index, task] of topLevel.entries()) {
        const assignees = userIdsByRound[index % userIdsByRound.length];
        const family = [task, ...tasks.filter((child) => child.task_parent_id === task.task_id)];
        for (const member of family) {
            const detail = await as(owner, "GET", `/V1/projects/${projectId}/tasks/${member.task_id}`);
            await as(owner, "PUT", `/V1/projects/${projectId}/tasks/${member.task_id}`, {
                task_title: detail.task_title,
                task_description: detail.task_description,
                assignee_ids: assignees,
                task_start_date: dateOnly(detail.task_start_date),
                task_due_date: dateOnly(detail.task_due_date),
                task_weight: detail.task_weight,
            });
        }
    }
}

/**
 * ความคืบหน้า: งานตามลำดับ — doneCount งานแรกเสร็จ · ถัดไป reviewCount รอตรวจ · ถัดไป inProgressCount กำลังทำ · ที่เหลือยังไม่เริ่ม
 * (นับทั้งงานหลักและงานย่อยเรียงตามที่แสดงบนบอร์ด)
 */
async function setProgress(owner, projectId, { doneCount = 0, reviewCount = 0, inProgressCount = 0 }) {
    const tasks = await listTasks(owner, projectId);
    const ordered = [];
    for (const task of tasks.filter((item) => !item.task_parent_id)) {
        ordered.push(...tasks.filter((child) => child.task_parent_id === task.task_id), task);
    }
    for (const [index, task] of ordered.entries()) {
        let status = "todo";
        if (index < doneCount) status = "done";
        else if (index < doneCount + reviewCount) status = "review";
        else if (index < doneCount + reviewCount + inProgressCount) status = "in_progress";
        if (status === task.task_status) continue;
        // เดินสถานะทีละขั้นเหมือนคนทำงานจริง
        const path = ["in_progress", "review", "done"];
        for (const step of path.slice(0, path.indexOf(status) + 1)) {
            await as(owner, "PUT", `/V1/projects/${projectId}/tasks/${task.task_id}/status`, { task_status: step });
        }
    }
    return ordered.length;
}

/** ทุกงานเสร็จ */
async function completeAllTasks(owner, projectId) {
    const tasks = await listTasks(owner, projectId);
    return setProgress(owner, projectId, { doneCount: tasks.length });
}

/** ป้ายสีของโปรเจกต์ + ติดป้ายให้งานหลักบางงาน */
async function labelTasks(owner, projectId, labels) {
    const tasks = await listTasks(owner, projectId);
    const topLevel = tasks.filter((task) => !task.task_parent_id);
    for (const label of labels) {
        const created = await as(owner, "POST", `/V1/projects/${projectId}/labels`, { pl_name: label.name, pl_color: label.color });
        for (const index of label.taskIndexes) {
            const task = topLevel[index];
            if (!task) continue;
            const detail = await as(owner, "GET", `/V1/projects/${projectId}/tasks/${task.task_id}`);
            const labelIds = [...detail.labels.map((item) => item.pl_id), created.pl_id];
            await as(owner, "PUT", `/V1/projects/${projectId}/tasks/${task.task_id}/labels`, { label_ids: labelIds });
        }
    }
}

/** checklist ในงานหลักลำดับที่ taskIndex — items: [ข้อความ, เสร็จแล้วไหม] */
async function addChecklist(owner, projectId, taskIndex, items) {
    const tasks = await listTasks(owner, projectId);
    const task = tasks.filter((item) => !item.task_parent_id)[taskIndex];
    if (!task) return;
    for (const [text, isDone] of items) {
        const created = await as(owner, "POST", `/V1/projects/${projectId}/tasks/${task.task_id}/checklist`, { tci_text: text });
        const itemId = created.tci_id ?? created.item?.tci_id;
        if (isDone && itemId) {
            await as(owner, "PUT", `/V1/projects/${projectId}/tasks/${task.task_id}/checklist/${itemId}/done`, { tci_is_done: true });
        }
    }
}

/** แก้ข้อมูลโปรเจกต์ (สถานะ วันเริ่ม/กำหนดเสร็จ) — ส่งค่าเดิมที่เหลือกลับไปครบ */
async function updateProject(owner, projectId, changes) {
    const project = await as(owner, "GET", `/V1/projects/${projectId}`);
    const current = project.project ?? project;
    await as(owner, "PUT", `/V1/projects/${projectId}`, {
        project_name: current.project_name,
        client_id: current.client_id,
        project_description: current.project_description,
        project_status: current.project_status,
        project_start_date: dateOnly(current.project_start_date),
        project_due_date: dateOnly(current.project_due_date),
        ...changes,
    });
}

module.exports = { addMembers, listTasks, assignTasks, setProgress, completeAllTasks, labelTasks, addChecklist, updateProject };
