// เทสต์กันถอยหลังของ API ทุกเส้นทาง (2026-10-13, docs/plans/2026-10-12-typescript-migration.md ขั้น T1)
//
// ยิงทุกเส้นทางตามลำดับการใช้งานจริง แล้วเทียบ "สถานะ + รูปร่างของคำตอบ" กับต้นแบบใน test/snapshots/api-shapes.json
// ต้นแบบสร้างจากโค้ด JavaScript เดิมก่อนย้ายเป็น TypeScript — หลังย้ายต้องได้เหมือนเดิมทุกเส้น
//
// ตั้งใจเปลี่ยนคำตอบของ API = สร้างต้นแบบใหม่ด้วย UPDATE_API_SNAPSHOT=1 npm test แล้วตรวจ diff ของไฟล์ต้นแบบก่อนส่งมอบ

const test = require("node:test");
const assert = require("node:assert/strict");
const { startTestServer, createTestImage, SEED_ADMIN } = require("./support/test-server");
const { describeShape, readSnapshot, writeSnapshot, SNAPSHOT_PATH } = require("./support/response-shape");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");

const POSITION_BIT_COUNT = 29;
const ROLE_BIT_COUNT = PERMISSION_KEYS.length;
const SHOULD_UPDATE_SNAPSHOT = process.env.UPDATE_API_SNAPSHOT === "1";

let api;
let testImage;
const recorded = {};
const ids = {};

// แทนส่วนที่เปลี่ยนทุกครั้งที่รัน (id, token ลิงก์ลูกค้า) ด้วยชื่อกลาง ต้นแบบจะได้เหมือนเดิมทุกรอบ
function toUrlTemplate(url) {
    const [pathPart, queryPart] = url.split("?");
    const segments = pathPart.split("/").map((segment, index, all) => {
        if (all[index - 1] === "share") return ":token";
        if (/^[A-Z]{3}\d{15}$/.test(segment) || /^\d+$/.test(segment)) return ":id";
        return segment;
    });
    return queryPart ? `${segments.join("/")}?${queryPart}` : segments.join("/");
}

// เรียก API แล้วจดสถานะ + รูปร่างของคำตอบไว้เทียบกับต้นแบบ
async function step(name, method, url, options) {
    const response = await api.callApi(method, url, options);
    recorded[name] = {
        request: `${method} ${toUrlTemplate(url)}`,
        status: response.status,
        body: describeShape(response.body),
    };
    return response;
}

function formWith(fields, imageFieldName = "images") {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    form.append(imageFieldName, testImage, "test.png");
    return form;
}

test.before(async () => {
    api = await startTestServer("routes");
    await api.loginAsAdmin();
    testImage = await createTestImage();
});

test.after(async () => {
    await api?.stop();
});

test("ระบบและการเข้าสู่ระบบ", async () => {
    await step("health", "GET", "/health");
    await step("verify permission", "GET", "/V1/auth/verifyPermission");
});

test("ข้อมูลของตัวเอง", async () => {
    await step("ดูโปรไฟล์ตัวเอง", "GET", "/V1/users/me");
    await step("แก้โปรไฟล์ตัวเอง", "PUT", "/V1/users/me", { body: { user_fname: "System", user_lname: "Admin" } });
    await step("อัปโหลดรูปโปรไฟล์ตัวเอง", "PUT", "/V1/users/me/image", { body: formWith({}, "image") });
    await step("ขอ OTP อีเมล (ไม่มี SMTP)", "POST", "/V1/users/me/email/otp", { body: { email: "admin.new@example.com" } });
    await step("ยืนยัน OTP ผิดรูปแบบ", "POST", "/V1/users/me/email/verify", { body: { email: "admin.new@example.com", otp: "12" } });
});

test("ตั้งค่า: role, แผนก, ตำแหน่งในโปรเจกต์", async () => {
    const role = await step("สร้าง role", "POST", "/V1/roles", {
        body: { role_name: "พนักงานทดสอบ", role_permission: "1" + "0".repeat(ROLE_BIT_COUNT - 1) },
    });
    ids.roleId = role.body.role_id;
    await step("รายการ role", "GET", "/V1/roles");
    await step("ดู role", "GET", `/V1/roles/${ids.roleId}`);
    await step("แก้ role", "PUT", `/V1/roles/${ids.roleId}`, {
        body: { role_name: "พนักงานทดสอบ (แก้)", role_permission: "1" + "0".repeat(ROLE_BIT_COUNT - 1) },
    });

    const department = await step("สร้างแผนก", "POST", "/V1/departments", { body: { dep_name: "แผนกทดสอบ" } });
    ids.departmentId = department.body.dep_id;
    await step("รายการแผนก", "GET", "/V1/departments");
    await step("ดูแผนก", "GET", `/V1/departments/${ids.departmentId}`);
    await step("แก้แผนก", "PUT", `/V1/departments/${ids.departmentId}`, { body: { dep_name: "แผนกทดสอบ (แก้)", dep_status: "active" } });

    const position = await step("สร้างตำแหน่ง", "POST", "/V1/project-positions", {
        body: { position_name: "Developer ทดสอบ", position_permission: "1".repeat(POSITION_BIT_COUNT) },
    });
    ids.positionId = position.body.position_id;
    await step("รายการตำแหน่ง", "GET", "/V1/project-positions");
    await step("ดูตำแหน่ง", "GET", `/V1/project-positions/${ids.positionId}`);
    await step("แก้ตำแหน่ง", "PUT", `/V1/project-positions/${ids.positionId}`, {
        body: { position_name: "Developer ทดสอบ (แก้)", position_permission: "1".repeat(POSITION_BIT_COUNT), position_status: "active" },
    });
});

test("ผู้ใช้งาน", async () => {
    const user = await step("สร้างผู้ใช้", "POST", "/V1/users", {
        body: { user_fname: "สมาชิก", user_lname: "ทดสอบ", user_username: "member.test", user_role_id: SEED_ADMIN.roleId },
    });
    ids.memberUserId = user.body.user_id;
    await step("รายชื่อผู้ใช้สำหรับเลือก", "GET", "/V1/users/for-select");
    await step("รายการผู้ใช้", "GET", "/V1/users");
    await step("ดูผู้ใช้", "GET", `/V1/users/${ids.memberUserId}`);
    await step("แก้ผู้ใช้", "PUT", `/V1/users/${ids.memberUserId}`, {
        body: {
            user_fname: "สมาชิก", user_lname: "ทดสอบ (แก้)", user_username: "member.test",
            user_email: "member.test@example.com", user_role_id: SEED_ADMIN.roleId, user_status: "active",
        },
    });
    await step("รีเซ็ตรหัสผ่านผู้ใช้", "PUT", `/V1/users/${ids.memberUserId}/reset-password`);
    await step("อัปโหลดรูปผู้ใช้", "PUT", `/V1/users/${ids.memberUserId}/image`, { body: formWith({}, "image") });

    const disposable = await step("สร้างผู้ใช้ที่จะลบ", "POST", "/V1/users", { body: { user_fname: "ลบ", user_lname: "ทิ้ง" } });
    await step("ลบผู้ใช้ที่ไม่เคยใช้งาน", "DELETE", `/V1/users/${disposable.body.user_id}`);
});

test("ลูกค้า", async () => {
    const client = await step("สร้างลูกค้า", "POST", "/V1/clients", {
        body: { client_name: "คุณลูกค้า", client_company: "บริษัท ทดสอบ จำกัด", client_email: "client@example.com", client_phone: "0812345678" },
    });
    ids.clientId = client.body.client_id;
    await step("รายการลูกค้า", "GET", "/V1/clients");
    await step("ดูลูกค้า", "GET", `/V1/clients/${ids.clientId}`);
    await step("แก้ลูกค้า", "PUT", `/V1/clients/${ids.clientId}`, {
        body: { client_name: "คุณลูกค้า (แก้)", client_company: "บริษัท ทดสอบ จำกัด", client_email: "client@example.com", client_phone: "0812345678" },
    });
});

test("โปรเจกต์และสมาชิก", async () => {
    const project = await step("สร้างโปรเจกต์", "POST", "/V1/projects", {
        body: {
            project_name: "โปรเจกต์ทดสอบ", client_id: ids.clientId, project_type: "agile",
            project_start_date: "2026-01-01", project_due_date: "2026-12-31",
        },
    });
    ids.projectId = project.body.project_id;
    const projectUrl = `/V1/projects/${ids.projectId}`;

    await step("รายการโปรเจกต์", "GET", "/V1/projects");
    await step("ดูโปรเจกต์", "GET", projectUrl);
    await step("สิทธิ์ของฉันในโปรเจกต์", "GET", `${projectUrl}/my-permissions`);
    await step("แก้โปรเจกต์", "PUT", projectUrl, {
        body: {
            project_name: "โปรเจกต์ทดสอบ (แก้)", client_id: ids.clientId, project_status: "in_progress",
            project_start_date: "2026-01-01", project_due_date: "2026-12-31",
        },
    });
    await step("เปิดลิงก์ลูกค้า", "PUT", `${projectUrl}/share/toggle`, { body: { project_share_enabled: true } });
    const regenerated = await step("สร้างลิงก์ลูกค้าใหม่", "PUT", `${projectUrl}/share/regenerate`);
    ids.shareToken = regenerated.body.project_share_token;
    await step("ส่งลิงก์ลูกค้าทางอีเมล (ไม่มี SMTP)", "POST", `${projectUrl}/share/send-email`, {
        body: { to: "client@example.com", message: "ทดสอบ" },
    });
    await step("เปิดใช้น้ำหนักงาน", "PUT", `${projectUrl}/task-weight/toggle`, { body: { project_use_task_weight: true } });
    await step("ยกเลิกโปรเจกต์", "PUT", `${projectUrl}/cancel`);
    await step("กู้คืนโปรเจกต์", "PUT", `${projectUrl}/reactivate`);

    const member = await step("เพิ่มสมาชิก", "POST", `${projectUrl}/members`, {
        body: { user_id: ids.memberUserId, position_ids: [ids.positionId] },
    });
    ids.projectMemberId = member.body.project_member_id;
    await step("รายชื่อสมาชิก", "GET", `${projectUrl}/members`);
    await step("แก้ตำแหน่งสมาชิก", "PUT", `${projectUrl}/members/${ids.projectMemberId}`, { body: { position_ids: [] } });
});

test("งานและงานย่อย", async () => {
    const tasksUrl = `/V1/projects/${ids.projectId}/tasks`;
    const task = await step("สร้างงาน", "POST", tasksUrl, {
        body: {
            task_title: "งานทดสอบ", task_description: "รายละเอียด", assignee_ids: [SEED_ADMIN.userId],
            task_start_date: "2026-01-05", task_due_date: "2026-01-20", task_weight: 2,
        },
    });
    ids.taskId = task.body.task_id;
    const subtask = await step("สร้างงานย่อย", "POST", tasksUrl, { body: { task_title: "งานย่อยทดสอบ", task_parent_id: ids.taskId } });
    ids.subtaskId = subtask.body.task_id;
    const unassigned = await step("สร้างงานที่ยังไม่มีคนรับ", "POST", tasksUrl, { body: { task_title: "งานรอคนรับ" } });

    await step("รายการงาน", "GET", tasksUrl);
    await step("ดูงาน", "GET", `${tasksUrl}/${ids.taskId}`);
    await step("แก้งาน", "PUT", `${tasksUrl}/${ids.taskId}`, {
        body: { task_title: "งานทดสอบ (แก้)", assignee_ids: [SEED_ADMIN.userId], task_weight: 3 },
    });
    await step("เปลี่ยนสถานะงาน", "PUT", `${tasksUrl}/${ids.taskId}/status`, { body: { task_status: "in_progress" } });
    await step("กดรับงาน (agile)", "POST", `${tasksUrl}/${unassigned.body.task_id}/claim`);
    await step("ประวัติกิจกรรมของโปรเจกต์", "GET", `/V1/projects/${ids.projectId}/activity`);
});

test("ปัญหาของงานและการตอบกลับ", async () => {
    const taskUrl = `/V1/projects/${ids.projectId}/tasks/${ids.taskId}`;
    const issue = await step("แจ้งปัญหา", "POST", `${taskUrl}/issues`, {
        body: formWith({ issue_title: "ปัญหาทดสอบ", issue_description: "รายละเอียดปัญหา", tagged_user_ids: JSON.stringify([ids.memberUserId]) }),
    });
    ids.issueId = issue.body.issue_id;
    const issueUrl = `/V1/projects/${ids.projectId}/issues/${ids.issueId}`;

    await step("รายการปัญหาของงาน", "GET", `${taskUrl}/issues`);
    await step("แก้ปัญหา", "PUT", issueUrl, {
        body: formWith({ issue_title: "ปัญหาทดสอบ (แก้)", issue_description: "แก้แล้ว", keep_image_ids: "[]", tagged_user_ids: "[]" }),
    });
    await step("ตอบกลับปัญหา", "POST", `${issueUrl}/replies`, { body: formWith({ reply_text: "รับทราบ" }) });
    await step("รายการคำตอบของปัญหา", "GET", `${issueUrl}/replies`);
    await step("คำตอบของทุกปัญหาในงาน", "GET", `${taskUrl}/issues/replies`);
    await step("ปิดปัญหา", "PUT", `${issueUrl}/status`, { body: { issue_status: "resolved" } });
});

test("แชทในงานและแชทโปรเจกต์", async () => {
    const taskChatUrl = `/V1/projects/${ids.projectId}/tasks/${ids.taskId}/chat`;
    await step("ส่งแชทในงาน", "POST", taskChatUrl, { body: formWith({ message_text: "สวัสดี" }) });
    await step("อ่านแชทในงาน", "GET", taskChatUrl);

    const projectChatUrl = `/V1/projects/${ids.projectId}/chat`;
    await step("ส่งแชทโปรเจกต์", "POST", projectChatUrl, { body: formWith({ message_text: "ประชุมพรุ่งนี้" }) });
    await step("อ่านแชทโปรเจกต์", "GET", projectChatUrl);
});

test("แดชบอร์ด, log และลิงก์ลูกค้า", async () => {
    await step("แดชบอร์ด: สรุป", "GET", "/V1/dashboard/summary");
    await step("แดชบอร์ด: ค้นหา", "GET", "/V1/dashboard/search?q=" + encodeURIComponent("ทดสอบ"));
    await step("แดชบอร์ด: ภาระงานทีม", "GET", "/V1/dashboard/team-workload");
    await step("แดชบอร์ด: KPI ของฉัน", "GET", "/V1/dashboard/kpis?month=2026-01");
    await step("แดชบอร์ด: KPI รายคน", "GET", "/V1/dashboard/kpis/by-member?month=2026-01");
    await step("แดชบอร์ด: งานของสมาชิก", "GET", `/V1/dashboard/team/${SEED_ADMIN.userId}/tasks`);

    await step("log เข้าสู่ระบบ", "GET", "/V1/logs");
    const auditLogs = await step("audit log", "GET", "/V1/audit-logs");
    await step("ดู audit log", "GET", `/V1/audit-logs/${auditLogs.body.data[0].aud_id}`);
    await step("error log", "GET", "/V1/error-logs");

    await step("ลิงก์ลูกค้า (ไม่ต้อง login)", "GET", `/V1/share/${ids.shareToken}`, { token: null });
});

test("ลบข้อมูล (ไล่จากล่างขึ้นบน)", async () => {
    const projectUrl = `/V1/projects/${ids.projectId}`;
    await step("ลบปัญหา", "DELETE", `${projectUrl}/issues/${ids.issueId}`);
    await step("ลบงานย่อย", "DELETE", `${projectUrl}/tasks/${ids.subtaskId}`);
    await step("ลบสมาชิก", "DELETE", `${projectUrl}/members/${ids.projectMemberId}`);
    await step("ลบโปรเจกต์", "DELETE", projectUrl);
    await step("ลบลูกค้า", "DELETE", `/V1/clients/${ids.clientId}`);
    await step("ลบตำแหน่ง", "DELETE", `/V1/project-positions/${ids.positionId}`);
    await step("ลบแผนก", "DELETE", `/V1/departments/${ids.departmentId}`);
    await step("ลบ role", "DELETE", `/V1/roles/${ids.roleId}`);
    await step("ออกจากระบบ", "POST", "/V1/auth/logout");
});

test("สถานะและรูปร่างของคำตอบทุกเส้นทางตรงกับต้นแบบ", () => {
    const snapshot = readSnapshot();
    if (SHOULD_UPDATE_SNAPSHOT || snapshot === null) {
        writeSnapshot(recorded);
        return;
    }
    for (const [name, expected] of Object.entries(snapshot)) {
        assert.deepEqual(recorded[name], expected, `"${name}" ตอบไม่เหมือนต้นแบบ (${SNAPSHOT_PATH})`);
    }
    assert.deepEqual(Object.keys(recorded).sort(), Object.keys(snapshot).sort(), "รายการขั้นตอนไม่ตรงกับต้นแบบ");
});

// ── ทุกเส้นทางที่ต้อง login ──────────────────────────────────────────────────────
// ไล่จากตาราง route จริงของ express ไม่ต้องเขียนรายการซ้ำ — เพิ่ม route ใหม่แล้วลืมใส่ requireAuth เทสต์นี้จะจับได้
const PUBLIC_ROUTES = new Set(["GET /health", "POST /V1/auth/login", "GET /V1/share/:token"]);

function listRoutes() {
    const router = require("../src/routes");
    const routes = [];
    for (const layer of router.stack) {
        if (!layer.route) continue;
        const handlerNames = layer.route.stack.map((routeLayer) => routeLayer.handle.name);
        for (const method of Object.keys(layer.route.methods)) {
            routes.push({ method: method.toUpperCase(), path: layer.route.path, handlerNames });
        }
    }
    return routes;
}

test("ทุกเส้นทางยกเว้นหน้าสาธารณะต้องผ่าน requireAuth และไม่มี token ได้ 401", async () => {
    const routes = listRoutes();
    assert.ok(routes.length >= 80, `ควรมีอย่างน้อย 80 เส้นทาง แต่พบ ${routes.length}`);

    for (const route of routes) {
        const key = `${route.method} ${route.path}`;
        if (PUBLIC_ROUTES.has(key)) continue;

        assert.ok(route.handlerNames.includes("requireAuth"), `${key} ไม่มี requireAuth`);
        const url = route.path.replace(/:[A-Za-z]+/g, "USE209901010000001");
        const response = await api.callApi(route.method, url, { token: null });
        assert.equal(response.status, 401, `${key} ไม่มี token แต่ได้ ${response.status}`);
    }
});
