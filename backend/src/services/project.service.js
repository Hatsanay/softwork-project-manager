// สร้างโปรเจกต์ — ที่เดียวของระบบ (2026-10-14 ขั้น 1A-4)
// ใช้ทั้งหน้าสร้างโปรเจกต์ (project.controller.js) และตอนลูกค้าตอบรับใบเสนอราคา (quotation-accept.service.js)
// ผู้สร้างเข้าเป็นสมาชิกพร้อมตำแหน่ง PM (ถ้ามีตำแหน่งชื่อ PM) ให้คุมโปรเจกต์ตัวเองได้เต็มที่ทันที
const { generateDailyId } = require("../utils/generateDailyId");
const { generateShareToken } = require("../utils/shareToken");

/**
 * @param {import("mysql2/promise").Pool | import("mysql2/promise").PoolConnection} conn
 * @param {{ project_name: string, client_id?: string | null, project_description?: string | null, project_status?: string,
 *           project_type?: string, project_start_date?: string | null, project_due_date?: string | null }} project
 * @param {string} creatorId
 * @returns {Promise<{ project_id: string, project_share_token: string }>}
 */
async function insertProject(conn, project, creatorId) {
    const projectId = await generateDailyId("tb_projects", "project_id", "PRO");
    const shareToken = generateShareToken();

    await conn.query(
        `INSERT INTO tb_projects
            (project_id, client_id, project_name, project_description, project_status, project_type,
             project_start_date, project_due_date, project_share_token, project_created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            projectId,
            project.client_id || null,
            project.project_name,
            project.project_description || null,
            project.project_status || "planning",
            project.project_type || "waterfall",
            project.project_start_date || null,
            project.project_due_date || null,
            shareToken,
            creatorId,
        ],
    );

    const memberId = await generateDailyId("tb_project_members", "project_member_id", "MEM");
    await conn.query("INSERT INTO tb_project_members (project_member_id, project_id, user_id) VALUES (?, ?, ?)", [
        memberId,
        projectId,
        creatorId,
    ]);
    const [[pmPosition]] = await conn.query(
        "SELECT position_id FROM tb_project_positions WHERE position_name = 'PM' LIMIT 1",
    );
    if (pmPosition?.position_id) {
        await conn.query("INSERT INTO tb_project_member_positions (project_member_id, position_id) VALUES (?, ?)", [
            memberId,
            pmPosition.position_id,
        ]);
    }

    return { project_id: projectId, project_share_token: shareToken };
}

module.exports = { insertProject };
