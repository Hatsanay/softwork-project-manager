// ชุดคำถามความต้องการ (2026-10-25 · S-2 · docs/plans/2026-10-25-client-order-link.md ข้อ 4)
// กลุ่มผูกหมวดสินค้าและ/หรือชุดบริการ (หลายอันได้) · กลุ่มทั่วไปถามทุกคำขอ · ลบคำถาม/กลุ่มได้ คำตอบเดิมยังอ่านได้ (เก็บข้อความคำถาม ณ วันส่ง)
const { AppError } = require("../utils/app-error");

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

const QUESTION_COLUMNS = `rqq_id, rqq_group_id, rqq_text, rqq_help, rqq_type, rqq_options, rqq_is_required, rqq_sort_order, rqq_status`;

/**
 * กลุ่มทั้งหมดพร้อมหมวดและคำถาม · activeOnly = ใช้กับหน้าร้าน (เฉพาะกลุ่ม/คำถามที่เปิด)
 */
async function listGroups(conn, { activeOnly = false } = {}) {
    const [groups] = await conn.query(
        `SELECT rqg_id, rqg_name, rqg_description, rqg_is_general, rqg_sort_order, rqg_status
         FROM tb_requirement_groups ${activeOnly ? "WHERE rqg_status = 'active'" : ""}
         ORDER BY rqg_sort_order, rqg_id`,
    );
    if (groups.length === 0) return [];
    const groupIds = groups.map((group) => group.rqg_id);
    const [categoryRows] = await conn.query(
        "SELECT rgc_group_id, rgc_category_id FROM tb_requirement_group_categories WHERE rgc_group_id IN (?)",
        [groupIds],
    );
    const [packageRows] = await conn.query(
        "SELECT rgp_group_id, rgp_package_id FROM tb_requirement_group_packages WHERE rgp_group_id IN (?)",
        [groupIds],
    );
    const [questions] = await conn.query(
        `SELECT ${QUESTION_COLUMNS} FROM tb_requirement_questions
         WHERE rqq_group_id IN (?) ${activeOnly ? "AND rqq_status = 'active'" : ""}
         ORDER BY rqq_group_id, rqq_sort_order, rqq_id`,
        [groupIds],
    );
    return groups
        .map((group) => ({
            ...group,
            rqg_is_general: Boolean(group.rqg_is_general),
            category_ids: categoryRows.filter((row) => row.rgc_group_id === group.rqg_id).map((row) => row.rgc_category_id),
            package_ids: packageRows.filter((row) => row.rgp_group_id === group.rqg_id).map((row) => row.rgp_package_id),
            questions: questions
                .filter((question) => question.rqq_group_id === group.rqg_id)
                .map((question) => ({ ...question, rqq_is_required: Boolean(question.rqq_is_required) })),
        }))
        .filter((group) => !activeOnly || group.questions.length > 0);
}

async function assertCategories(conn, categoryIds) {
    if (categoryIds.length === 0) return;
    const [rows] = await conn.query("SELECT pc_id FROM tb_product_categories WHERE pc_id IN (?)", [categoryIds]);
    if (rows.length !== new Set(categoryIds).size) throw validationError({ category_ids: "บางหมวดถูกลบไปแล้ว กรุณาเลือกใหม่" });
}

async function saveGroupCategories(conn, groupId, categoryIds) {
    await conn.query("DELETE FROM tb_requirement_group_categories WHERE rgc_group_id = ?", [groupId]);
    const unique = [...new Set(categoryIds)];
    if (unique.length === 0) return;
    await conn.query("INSERT INTO tb_requirement_group_categories (rgc_group_id, rgc_category_id) VALUES ?", [unique.map((id) => [groupId, id])]);
}

async function saveGroupPackages(conn, groupId, packageIds) {
    await conn.query("DELETE FROM tb_requirement_group_packages WHERE rgp_group_id = ?", [groupId]);
    const unique = [...new Set(packageIds)];
    if (unique.length === 0) return;
    const [rows] = await conn.query("SELECT pkg_id FROM tb_product_packages WHERE pkg_id IN (?)", [unique]);
    if (rows.length !== unique.length) throw validationError({ package_ids: "บางชุดถูกลบไปแล้ว กรุณาเลือกใหม่" });
    await conn.query("INSERT INTO tb_requirement_group_packages (rgp_group_id, rgp_package_id) VALUES ?", [unique.map((id) => [groupId, id])]);
}

async function findGroupRow(conn, groupId, { forUpdate = false } = {}) {
    const [[group]] = await conn.query(`SELECT rqg_id FROM tb_requirement_groups WHERE rqg_id = ? ${forUpdate ? "FOR UPDATE" : ""}`, [groupId]);
    if (!group) throw new AppError(404, "REQUIREMENT_GROUP_NOT_FOUND", "ไม่พบกลุ่มคำถามนี้ กรุณาโหลดหน้าใหม่");
    return group;
}

async function createGroup(conn, input) {
    await assertCategories(conn, input.category_ids);
    const [result] = await conn.query(
        "INSERT INTO tb_requirement_groups (rqg_name, rqg_description, rqg_is_general, rqg_sort_order, rqg_status) VALUES (?, ?, ?, ?, ?)",
        [input.rqg_name, input.rqg_description, input.rqg_is_general ? 1 : 0, input.rqg_sort_order, input.rqg_status],
    );
    await saveGroupCategories(conn, result.insertId, input.category_ids);
    await saveGroupPackages(conn, result.insertId, input.package_ids);
    return { rqg_id: result.insertId };
}

async function updateGroup(conn, groupId, input) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    await assertCategories(conn, input.category_ids);
    await conn.query(
        "UPDATE tb_requirement_groups SET rqg_name = ?, rqg_description = ?, rqg_is_general = ?, rqg_sort_order = ?, rqg_status = ? WHERE rqg_id = ?",
        [input.rqg_name, input.rqg_description, input.rqg_is_general ? 1 : 0, input.rqg_sort_order, input.rqg_status, groupId],
    );
    await saveGroupCategories(conn, groupId, input.category_ids);
    await saveGroupPackages(conn, groupId, input.package_ids);
    return { rqg_id: groupId };
}

/** ลบกลุ่ม = ลบคำถามในกลุ่มด้วย · คำตอบในคำขอเดิมยังอยู่ (เก็บข้อความไว้แล้ว) */
async function deleteGroup(conn, groupId) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    await conn.query("DELETE FROM tb_requirement_groups WHERE rqg_id = ?", [groupId]);
    return { rqg_id: groupId };
}

async function createQuestion(conn, groupId, input) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    const [[{ nextOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(rqq_sort_order), 0) + 1 AS nextOrder FROM tb_requirement_questions WHERE rqq_group_id = ?",
        [groupId],
    );
    const [result] = await conn.query(
        `INSERT INTO tb_requirement_questions (rqq_group_id, rqq_text, rqq_help, rqq_type, rqq_options, rqq_is_required, rqq_sort_order, rqq_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [groupId, input.rqq_text, input.rqq_help, input.rqq_type, input.rqq_options ? JSON.stringify(input.rqq_options) : null, input.rqq_is_required ? 1 : 0, nextOrder, input.rqq_status],
    );
    return { rqq_id: result.insertId };
}

async function updateQuestion(conn, questionId, input) {
    const [result] = await conn.query(
        `UPDATE tb_requirement_questions SET rqq_text = ?, rqq_help = ?, rqq_type = ?, rqq_options = ?, rqq_is_required = ?, rqq_status = ?
         WHERE rqq_id = ?`,
        [input.rqq_text, input.rqq_help, input.rqq_type, input.rqq_options ? JSON.stringify(input.rqq_options) : null, input.rqq_is_required ? 1 : 0, input.rqq_status, questionId],
    );
    if (result.affectedRows === 0) throw new AppError(404, "REQUIREMENT_QUESTION_NOT_FOUND", "ไม่พบคำถามนี้ กรุณาโหลดหน้าใหม่");
    return { rqq_id: questionId };
}

async function deleteQuestion(conn, questionId) {
    const [result] = await conn.query("DELETE FROM tb_requirement_questions WHERE rqq_id = ?", [questionId]);
    if (result.affectedRows === 0) throw new AppError(404, "REQUIREMENT_QUESTION_NOT_FOUND", "ไม่พบคำถามนี้ กรุณาโหลดหน้าใหม่");
    return { rqq_id: questionId };
}

/** เรียงคำถามในกลุ่มใหม่ (ต้องส่งครบทุกข้อของกลุ่ม) */
async function reorderQuestions(conn, groupId, questionIds) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    const [rows] = await conn.query("SELECT rqq_id FROM tb_requirement_questions WHERE rqq_group_id = ?", [groupId]);
    const existing = new Set(rows.map((row) => row.rqq_id));
    if (questionIds.length !== existing.size || questionIds.some((id) => !existing.has(id))) {
        throw new AppError(409, "REQUIREMENT_ORDER_STALE", "คำถามในกลุ่มเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    for (const [index, questionId] of questionIds.entries()) {
        await conn.query("UPDATE tb_requirement_questions SET rqq_sort_order = ? WHERE rqq_id = ?", [index + 1, questionId]);
    }
    return { rqg_id: groupId };
}

module.exports = { listGroups, createGroup, updateGroup, deleteGroup, createQuestion, updateQuestion, deleteQuestion, reorderQuestions };
