// เส้นทางบอร์ดงานแบบ Trello (2026-10-17) — docs/plans/2026-10-17-project-kanban.md หัวข้อ 2
//
// ลงทะเบียนเข้า router หลักด้วย path เต็ม (เหตุผลเดียวกับ quotation.routes.js)
// path ไม่ชนกับ /projects/:projectId/tasks/:id เดิม — เรียงลำดับการ์ดใช้ /task-order (ไม่ใช่ /tasks/reorder ที่จะถูกจับเป็น :id)
// ป้ายของโปรเจกต์: อ่าน = สมาชิก · แก้ = editProjectInfo · เรียงลำดับการ์ด = editTask (K4-ก)
// ติดป้าย/แก้ checklist/ติ๊ก checklist: สิทธิ์ตามกติกาเดิมของงาน ตรวจใน controller (ต้องรู้ว่าเป็นผู้รับผิดชอบไหม)
const { requireAuth } = require("../middlewares/auth.middleware");
const {
    requireProjectMember,
    requireProjectPermission,
    requireTaskInProject,
} = require("../middlewares/projectPermission.middleware");
const boardController = require("../controllers/task-board.controller");

/**
 * @param {import("express").Router} router
 */
function registerTaskBoardRoutes(router) {
    const member = [requireAuth, requireProjectMember];
    const canManageLabels = requireProjectPermission("editProjectInfo");
    const taskInProject = requireTaskInProject("id");

    router.get("/V1/projects/:projectId/labels", ...member, boardController.listLabels);
    router.post("/V1/projects/:projectId/labels", ...member, canManageLabels, boardController.createLabel);
    router.put("/V1/projects/:projectId/labels/:labelId", ...member, canManageLabels, boardController.updateLabel);
    router.delete("/V1/projects/:projectId/labels/:labelId", ...member, canManageLabels, boardController.deleteLabel);

    router.put(
        "/V1/projects/:projectId/task-order",
        ...member,
        requireProjectPermission("editTask"),
        boardController.reorderTasks,
    );

    router.put("/V1/projects/:projectId/tasks/:id/labels", ...member, taskInProject, boardController.setTaskLabels);
    router.get("/V1/projects/:projectId/tasks/:id/checklist", ...member, taskInProject, boardController.listChecklist);
    router.post(
        "/V1/projects/:projectId/tasks/:id/checklist",
        ...member,
        taskInProject,
        boardController.addChecklistItem,
    );
    router.put(
        "/V1/projects/:projectId/tasks/:id/checklist-order",
        ...member,
        taskInProject,
        boardController.reorderChecklist,
    );
    router.put(
        "/V1/projects/:projectId/tasks/:id/checklist/:itemId",
        ...member,
        taskInProject,
        boardController.updateChecklistItem,
    );
    router.put(
        "/V1/projects/:projectId/tasks/:id/checklist/:itemId/done",
        ...member,
        taskInProject,
        boardController.setChecklistItemDone,
    );
    router.delete(
        "/V1/projects/:projectId/tasks/:id/checklist/:itemId",
        ...member,
        taskInProject,
        boardController.deleteChecklistItem,
    );
}

module.exports = { registerTaskBoardRoutes };
