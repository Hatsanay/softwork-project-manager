// ชุดคำถามความต้องการ (2026-10-25 · S-2 · เงื่อนไขการถาม 2026-10-26 Q-1 docs/plans/2026-10-26-customer-questions.md)
// กลุ่ม = หัวข้อจัดหน้า: ถามทุกคำขอ / ถามตามสินค้าที่เลือก / เฉพาะลิงก์ที่ถามเพิ่ม + ชนิดลิงก์
// สินค้าเลือกคำถาม (2026-11-01 · docs/plans/2026-11-01-product-questions.md): สินค้า/ชุดเลือกข้อแม่ · ข้อลูกตามข้อแม่ · ชุด = ของชุด + ของสินค้าในชุด
// คำถาม: ข้อลูกถามเมื่อคำตอบข้อแม่ (กลุ่มเดียวกัน อยู่ด้านบน) ตรงค่าที่ตั้ง · ลบ/แก้คำถามได้ คำตอบเดิมยังอ่านได้ (เก็บข้อความ ณ วันส่ง)
const { AppError } = require("../utils/app-error");
const { choiceValuesOf, PARENT_QUESTION_TYPES } = require("../shared/requirement-answers.mjs");

function validationError(fields, message = "ข้อมูลบางช่องใช้ไม่ได้ กรุณาแก้ตามข้อความใต้ช่อง") {
    return new AppError(400, "VALIDATION", message, fields);
}

const GROUP_COLUMNS = `rqg_id, rqg_name, rqg_customer_intro, rqg_description, rqg_trigger, rqg_audience, rqg_sort_order, rqg_status`;
const QUESTION_COLUMNS = `rqq_id, rqq_group_id, rqq_text, rqq_help, rqq_placeholder, rqq_type, rqq_options, rqq_allow_other, rqq_unit, rqq_min, rqq_max,
    rqq_future_only, rqq_file_kind, rqq_is_required, rqq_parent_id, rqq_parent_values, rqq_audience, rqq_skip_when_preset, rqq_prefill,
    rqq_sort_order, rqq_status`;
// คอลัมน์ที่มาจากฟอร์มคำถาม (ลำดับเดียวกับ questionValues)
const QUESTION_INPUT_COLUMNS = [
    "rqq_text",
    "rqq_help",
    "rqq_placeholder",
    "rqq_type",
    "rqq_options",
    "rqq_allow_other",
    "rqq_unit",
    "rqq_min",
    "rqq_max",
    "rqq_future_only",
    "rqq_file_kind",
    "rqq_is_required",
    "rqq_parent_id",
    "rqq_parent_values",
    "rqq_audience",
    "rqq_skip_when_preset",
    "rqq_prefill",
    "rqq_status",
];

// rqg_sort_order / rqq_sort_order เป็น smallint unsigned
const MAX_SORT_ORDER = 9999;

const BOOLEAN_QUESTION_COLUMNS = [
    "rqq_allow_other",
    "rqq_future_only",
    "rqq_is_required",
    "rqq_skip_when_preset",
    "rqq_prefill",
];

/**
 * กลุ่มทั้งหมดพร้อมรายการที่ผูกและคำถาม · activeOnly = ใช้กับหน้าร้าน (เฉพาะกลุ่ม/คำถามที่เปิด)
 * ข้อลูกที่ข้อแม่ปิดใช้งาน จะไม่ขึ้นเอง (visibleQuestionnaire หาข้อแม่ไม่เจอ)
 */
async function listGroups(conn, { activeOnly = false } = {}) {
    const [groups] = await conn.query(
        `SELECT ${GROUP_COLUMNS} FROM tb_requirement_groups ${activeOnly ? "WHERE rqg_status = 'active'" : ""} ORDER BY rqg_sort_order, rqg_id`,
    );
    if (groups.length === 0) return [];
    const groupIds = groups.map((group) => group.rqg_id);
    const [questions] = await conn.query(
        `SELECT ${QUESTION_COLUMNS} FROM tb_requirement_questions
         WHERE rqq_group_id IN (?) ${activeOnly ? "AND rqq_status = 'active'" : ""}
         ORDER BY rqq_group_id, rqq_sort_order, rqq_id`,
        [groupIds],
    );
    // หน้าตั้งค่า: บอกว่าข้อนี้มีคนตอบแล้วกี่คำขอ (แก้ข้อความแล้วคำตอบเดิมยังแสดงตามคำถามเดิม) · หน้าร้านไม่ต้องรู้
    const answerCounts = activeOnly
        ? new Map()
        : await countAnswers(
              conn,
              questions.map((question) => question.rqq_id),
          );
    const itemLinks = await loadItemLinks(conn, questions.map((question) => question.rqq_id));
    const withLinks = (question) => ({
        ...questionRow(question),
        product_ids: itemLinks.productIds.get(question.rqq_id) ?? [],
        package_ids: itemLinks.packageIds.get(question.rqq_id) ?? [],
        via_package_ids: itemLinks.viaPackageIds.get(question.rqq_id) ?? [],
    });
    return groups
        .map((group) => ({
            ...group,
            questions: questions
                .filter((question) => question.rqq_group_id === group.rqg_id)
                .map((question) =>
                    activeOnly ? withLinks(question) : { ...withLinks(question), answer_count: answerCounts.get(question.rqq_id) ?? 0 },
                ),
        }))
        .filter((group) => !activeOnly || group.questions.length > 0);
}

async function createGroup(conn, input) {
    // กลุ่มใหม่ต่อท้ายเสมอ (หน้าตั้งค่าเรียงด้วยปุ่มขึ้น/ลง ไม่มีช่องลำดับแล้ว · 2026-10-26 Q-2)
    const [[{ nextOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(rqg_sort_order), 0) + 1 AS nextOrder FROM tb_requirement_groups",
    );
    const sortOrder = Math.min(Number(nextOrder), MAX_SORT_ORDER);
    const [result] = await conn.query(
        `INSERT INTO tb_requirement_groups (rqg_name, rqg_customer_intro, rqg_description, rqg_trigger, rqg_audience, rqg_sort_order, rqg_status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            input.rqg_name,
            input.rqg_customer_intro,
            input.rqg_description,
            input.rqg_trigger,
            input.rqg_audience,
            sortOrder,
            input.rqg_status,
        ],
    );
    return { rqg_id: result.insertId };
}

async function updateGroup(conn, groupId, input) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    await conn.query(
        `UPDATE tb_requirement_groups
         SET rqg_name = ?, rqg_customer_intro = ?, rqg_description = ?, rqg_trigger = ?, rqg_audience = ?, rqg_sort_order = ?, rqg_status = ?
         WHERE rqg_id = ?`,
        [
            input.rqg_name,
            input.rqg_customer_intro,
            input.rqg_description,
            input.rqg_trigger,
            input.rqg_audience,
            input.rqg_sort_order,
            input.rqg_status,
            groupId,
        ],
    );
    return { rqg_id: groupId };
}

/** ลบกลุ่ม = ลบคำถามในกลุ่มด้วย · คำตอบในคำขอเดิมยังอยู่ (เก็บข้อความไว้แล้ว) */
async function deleteGroup(conn, groupId) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    // ข้อลูกอ้างข้อแม่แบบ RESTRICT · ทั้งกลุ่มหายพร้อมกันได้ ตัดการอ้างก่อนให้ cascade ลบคำถามได้
    await conn.query("UPDATE tb_requirement_questions SET rqq_parent_id = NULL WHERE rqq_group_id = ?", [groupId]);
    await conn.query("DELETE FROM tb_requirement_groups WHERE rqg_id = ?", [groupId]);
    return { rqg_id: groupId };
}

async function createQuestion(conn, groupId, input) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    // คำถามใหม่อยู่ท้ายกลุ่มเสมอ → ข้อแม่ (ข้อไหนก็ได้ในกลุ่ม) อยู่ด้านบนแน่นอน
    await assertParentAllowed(conn, groupId, null, input);
    const [[{ nextOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(rqq_sort_order), 0) + 1 AS nextOrder FROM tb_requirement_questions WHERE rqq_group_id = ?",
        [groupId],
    );
    const [result] = await conn.query(
        `INSERT INTO tb_requirement_questions (rqq_group_id, ${QUESTION_INPUT_COLUMNS.join(", ")}, rqq_sort_order)
         VALUES (?, ${QUESTION_INPUT_COLUMNS.map(() => "?").join(", ")}, ?)`,
        [groupId, ...questionValues(input), nextOrder],
    );
    return { rqq_id: result.insertId };
}

async function updateQuestion(conn, questionId, input) {
    const current = await findQuestionRow(conn, questionId, { forUpdate: true });
    await assertParentAllowed(conn, current.rqq_group_id, current, input);
    await assertChildrenStillValid(conn, current, input);
    await conn.query(
        `UPDATE tb_requirement_questions SET ${QUESTION_INPUT_COLUMNS.map((column) => `${column} = ?`).join(", ")} WHERE rqq_id = ?`,
        [...questionValues(input), questionId],
    );
    // กลายเป็นข้อลูก = ถามตามข้อแม่ ไม่ผูกสินค้าเองอีก (หน้าแก้คำถามบอกก่อนบันทึก)
    if (input.rqq_parent_id) await unlinkItems(conn, questionId);
    return { rqq_id: questionId };
}

async function deleteQuestion(conn, questionId) {
    const question = await findQuestionRow(conn, questionId, { forUpdate: true });
    const children = await childQuestionsOf(conn, question.rqq_id);
    if (children.length > 0) {
        throw new AppError(
            409,
            "REQUIREMENT_QUESTION_HAS_CHILDREN",
            `ลบไม่ได้: ข้อ ${children.map((child) => `"${child.rqq_text}"`).join(", ")} ถามตามคำตอบของข้อนี้ · แก้ข้อนั้นให้ถามทุกครั้ง หรือลบข้อนั้นก่อน`,
        );
    }
    await conn.query("DELETE FROM tb_requirement_questions WHERE rqq_id = ?", [questionId]);
    return { rqq_id: questionId };
}

/** เรียงคำถามในกลุ่มใหม่ (ต้องส่งครบทุกข้อของกลุ่ม) · ข้อลูกต้องอยู่ใต้ข้อแม่เสมอ */
async function reorderQuestions(conn, groupId, questionIds) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    const [rows] = await conn.query(
        "SELECT rqq_id, rqq_text, rqq_parent_id FROM tb_requirement_questions WHERE rqq_group_id = ?",
        [groupId],
    );
    const existing = new Set(rows.map((row) => row.rqq_id));
    if (questionIds.length !== existing.size || questionIds.some((id) => !existing.has(id))) {
        throw new AppError(409, "REQUIREMENT_ORDER_STALE", "คำถามในกลุ่มเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    const positionOf = new Map(questionIds.map((id, index) => [id, index]));
    const childAboveParent = rows.find(
        (row) => row.rqq_parent_id && positionOf.get(row.rqq_id) < positionOf.get(row.rqq_parent_id),
    );
    if (childAboveParent) {
        throw new AppError(
            409,
            "REQUIREMENT_CHILD_ABOVE_PARENT",
            `ข้อ "${childAboveParent.rqq_text}" ถามตามคำตอบของข้อด้านบน จึงต้องอยู่ใต้ข้อนั้นเสมอ`,
        );
    }
    for (const [index, questionId] of questionIds.entries()) {
        await conn.query("UPDATE tb_requirement_questions SET rqq_sort_order = ? WHERE rqq_id = ?", [
            index + 1,
            questionId,
        ]);
    }
    return { rqg_id: groupId };
}

/** เรียงกลุ่มใหม่ (ต้องส่งครบทุกกลุ่ม) · ลำดับ = ลำดับที่ลูกค้าเห็น */
async function reorderGroups(conn, groupIds) {
    const [rows] = await conn.query("SELECT rqg_id FROM tb_requirement_groups FOR UPDATE");
    const existing = new Set(rows.map((row) => row.rqg_id));
    if (groupIds.length !== existing.size || groupIds.some((id) => !existing.has(id))) {
        throw new AppError(409, "REQUIREMENT_ORDER_STALE", "กลุ่มคำถามเปลี่ยนไปแล้ว กรุณาโหลดหน้าใหม่");
    }
    for (const [index, groupId] of groupIds.entries()) {
        await conn.query("UPDATE tb_requirement_groups SET rqg_sort_order = ? WHERE rqg_id = ?", [index + 1, groupId]);
    }
    return { group_ids: groupIds };
}

/**
 * คัดลอกกลุ่ม (คำถาม เงื่อนไขข้อแม่ รายการที่ผูก) · สำเนาปิดใช้งานไว้ก่อน ลูกค้าไม่เห็นคำถามซ้ำระหว่างที่แก้
 * @returns {Promise<{ rqg_id: number }>}
 */
async function copyGroup(conn, groupId) {
    await findGroupRow(conn, groupId, { forUpdate: true });
    const source = (await listGroups(conn)).find((group) => group.rqg_id === groupId);
    const copy = await createGroup(conn, {
        ...source,
        rqg_name: copyName(source.rqg_name, 100),
        rqg_status: "inactive",
    });
    await insertQuestionCopies(conn, copy.rqg_id, source.questions);
    return copy;
}

/** คัดลอกคำถามไว้ท้ายกลุ่มเดิม (เงื่อนไขข้อแม่ติดไปด้วย ข้อแม่ยังอยู่ด้านบน) · ข้อลูกของข้อนี้ไม่ถูกคัดลอก */
async function copyQuestion(conn, questionId) {
    const question = await findQuestionRow(conn, questionId, { forUpdate: true });
    const [[{ nextOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(rqq_sort_order), 0) + 1 AS nextOrder FROM tb_requirement_questions WHERE rqq_group_id = ?",
        [question.rqq_group_id],
    );
    const [result] = await conn.query(
        `INSERT INTO tb_requirement_questions (rqq_group_id, ${QUESTION_INPUT_COLUMNS.join(", ")}, rqq_sort_order)
         VALUES (?, ${QUESTION_INPUT_COLUMNS.map(() => "?").join(", ")}, ?)`,
        [
            question.rqq_group_id,
            ...questionValues({ ...question, rqq_text: copyName(question.rqq_text, 300) }),
            nextOrder,
        ],
    );
    return { rqq_id: result.insertId };
}

/**
 * ย้ายคำถามไปท้ายกลุ่มอื่น · ข้อลูก (และลูกของลูก) ย้ายตามโดยลำดับเดิม
 * ข้อที่ย้ายมีข้อแม่ในกลุ่มเดิม → ล้างเงื่อนไข (ข้อแม่ต้องอยู่กลุ่มเดียวกัน) · หน้าเว็บบอกก่อนกดยืนยัน
 * @returns {Promise<{ rqq_id: number, moved_count: number, cleared_condition: boolean }>}
 */
async function moveQuestion(conn, questionId, targetGroupId) {
    const question = await findQuestionRow(conn, questionId, { forUpdate: true });
    await findGroupRow(conn, targetGroupId, { forUpdate: true });
    if (question.rqq_group_id === targetGroupId) {
        throw validationError({ group_id: "ข้อนี้อยู่ในกลุ่มนี้แล้ว เลือกกลุ่มอื่น" });
    }
    const [sourceRows] = await conn.query(
        "SELECT rqq_id, rqq_parent_id FROM tb_requirement_questions WHERE rqq_group_id = ? ORDER BY rqq_sort_order, rqq_id",
        [question.rqq_group_id],
    );
    const movingIds = withDescendants(question.rqq_id, sourceRows);
    const [[{ lastOrder }]] = await conn.query(
        "SELECT COALESCE(MAX(rqq_sort_order), 0) AS lastOrder FROM tb_requirement_questions WHERE rqq_group_id = ?",
        [targetGroupId],
    );
    const clearedCondition = question.rqq_parent_id !== null;
    if (clearedCondition) {
        await conn.query(
            "UPDATE tb_requirement_questions SET rqq_parent_id = NULL, rqq_parent_values = NULL WHERE rqq_id = ?",
            [questionId],
        );
    }
    for (const [index, id] of movingIds.entries()) {
        await conn.query("UPDATE tb_requirement_questions SET rqq_group_id = ?, rqq_sort_order = ? WHERE rqq_id = ?", [
            targetGroupId,
            Math.min(Number(lastOrder) + index + 1, MAX_SORT_ORDER),
            id,
        ]);
    }
    return { rqq_id: questionId, moved_count: movingIds.length, cleared_condition: clearedCondition };
}

// ─── ช่วย ─────────────────────────────────────────────────────────────────────────

/** "สำเนา ชื่อเดิม" ตัดให้ไม่เกินความยาวคอลัมน์ */
function copyName(name, maxLength) {
    return `สำเนา ${name}`.slice(0, maxLength);
}

/** ข้อนี้ + ข้อลูกทุกชั้นในกลุ่ม เรียงตามลำดับเดิม (ข้อลูกอยู่ใต้ข้อแม่เสมอ จึงไล่จากบนลงล่างครั้งเดียวพอ) */
function withDescendants(questionId, rowsInOrder) {
    const ids = new Set([questionId]);
    for (const row of rowsInOrder) {
        if (row.rqq_parent_id && ids.has(row.rqq_parent_id)) ids.add(row.rqq_id);
    }
    return rowsInOrder.filter((row) => ids.has(row.rqq_id)).map((row) => row.rqq_id);
}

/** คัดลอกคำถามทั้งชุดเข้ากลุ่มใหม่ · ข้อแม่ชี้ไปข้อที่คัดลอกใหม่ (ข้อแม่อยู่ด้านบนเสมอ จึงมีรหัสใหม่ก่อนข้อลูก) */
async function insertQuestionCopies(conn, groupId, questions) {
    const newIdOf = new Map();
    for (const [index, question] of questions.entries()) {
        const input = {
            ...question,
            rqq_parent_id: question.rqq_parent_id ? (newIdOf.get(question.rqq_parent_id) ?? null) : null,
        };
        const [result] = await conn.query(
            `INSERT INTO tb_requirement_questions (rqq_group_id, ${QUESTION_INPUT_COLUMNS.join(", ")}, rqq_sort_order)
             VALUES (?, ${QUESTION_INPUT_COLUMNS.map(() => "?").join(", ")}, ?)`,
            [groupId, ...questionValues(input), index + 1],
        );
        newIdOf.set(question.rqq_id, result.insertId);
    }
}

async function countAnswers(conn, questionIds) {
    if (questionIds.length === 0) return new Map();
    const [rows] = await conn.query(
        `SELECT sva_question_id, COUNT(DISTINCT sva_request_id) AS total FROM tb_service_request_answers
         WHERE sva_question_id IN (?) GROUP BY sva_question_id`,
        [questionIds],
    );
    return new Map(rows.map((row) => [row.sva_question_id, Number(row.total)]));
}

function questionValues(input) {
    return QUESTION_INPUT_COLUMNS.map((column) => {
        const value = input[column];
        if (column === "rqq_options") return value ? JSON.stringify(value) : null;
        if (column === "rqq_parent_values") return input.rqq_parent_id ? JSON.stringify(value) : null;
        if (BOOLEAN_QUESTION_COLUMNS.includes(column)) return value ? 1 : 0;
        return value;
    });
}

/** แถวคำถามจากฐานข้อมูล → รูปที่ส่งออก API (boolean จริง · ตัวเลือก/ค่าข้อแม่เป็น array เสมอเมื่อมี) */
function questionRow(question) {
    const row = { ...question, rqq_parent_values: question.rqq_parent_values ?? [] };
    for (const column of BOOLEAN_QUESTION_COLUMNS) row[column] = Boolean(question[column]);
    return row;
}

/**
 * สินค้า/ชุดที่เลือกแต่ละข้อ · via_package_ids = ชุดที่มีสินค้าที่เลือกข้อนี้อยู่ข้างใน (ชุดได้คำถามของสินค้าในชุด · Q2)
 * @returns {Promise<{ productIds: Map<number, string[]>, packageIds: Map<number, string[]>, viaPackageIds: Map<number, string[]> }>}
 */
async function loadItemLinks(conn, questionIds) {
    const productIds = new Map();
    const packageIds = new Map();
    const viaPackageIds = new Map();
    if (questionIds.length === 0) return { productIds, packageIds, viaPackageIds };
    const push = (map, key, value) => map.set(key, [...new Set([...(map.get(key) ?? []), value])]);
    const [productRows] = await conn.query(
        "SELECT pq_question_id, pq_product_id FROM tb_product_questions WHERE pq_question_id IN (?)",
        [questionIds],
    );
    for (const row of productRows) push(productIds, row.pq_question_id, row.pq_product_id);
    const [packageRows] = await conn.query(
        "SELECT kq_question_id, kq_package_id FROM tb_package_questions WHERE kq_question_id IN (?)",
        [questionIds],
    );
    for (const row of packageRows) push(packageIds, row.kq_question_id, row.kq_package_id);
    const [viaRows] = await conn.query(
        `SELECT DISTINCT pq.pq_question_id, i.pki_package_id
         FROM tb_product_questions pq JOIN tb_product_package_items i ON i.pki_product_id = pq.pq_product_id
         WHERE pq.pq_question_id IN (?)`,
        [questionIds],
    );
    for (const row of viaRows) push(viaPackageIds, row.pq_question_id, row.pki_package_id);
    return { productIds, packageIds, viaPackageIds };
}

async function unlinkItems(conn, questionId) {
    await conn.query("DELETE FROM tb_product_questions WHERE pq_question_id = ?", [questionId]);
    await conn.query("DELETE FROM tb_package_questions WHERE kq_question_id = ?", [questionId]);
}

// ตารางผูกของสินค้า/ชุด · ชื่อตาราง/คอลัมน์มาจากค่าคงที่นี้เท่านั้น (ไม่ใช่ input)
const ITEM_LINKS = {
    product: { itemTable: "tb_products", itemColumn: "product_id", table: "tb_product_questions", idColumn: "pq_product_id", questionColumn: "pq_question_id" },
    package: { itemTable: "tb_product_packages", itemColumn: "pkg_id", table: "tb_package_questions", idColumn: "kq_package_id", questionColumn: "kq_question_id" },
};

/**
 * สินค้า/ชุดเลือกคำถาม (แทนชุดเดิมทั้งหมด) · เลือกได้เฉพาะข้อแม่ (ข้อลูกตามข้อแม่ไปเอง)
 * @param {"product" | "package"} kind
 * @param {number[]} questionIds
 */
async function setItemQuestions(conn, kind, itemId, questionIds) {
    const link = ITEM_LINKS[kind];
    const [[item]] = await conn.query(`SELECT ${link.itemColumn} FROM ${link.itemTable} WHERE ${link.itemColumn} = ? FOR UPDATE`, [itemId]);
    if (!item) throw new AppError(404, "ITEM_NOT_FOUND", kind === "product" ? "ไม่พบสินค้านี้" : "ไม่พบชุดรายการนี้");
    const unique = [...new Set(questionIds)];
    if (unique.length > 0) {
        const [rows] = await conn.query("SELECT rqq_id, rqq_parent_id FROM tb_requirement_questions WHERE rqq_id IN (?)", [unique]);
        if (rows.length !== unique.length) throw validationError({ question_ids: "บางคำถามถูกลบไปแล้ว กรุณาโหลดหน้าใหม่" });
        if (rows.some((row) => row.rqq_parent_id !== null)) {
            throw validationError({ question_ids: "เลือกได้เฉพาะข้อที่ไม่มีเงื่อนไข (ข้อที่ถามต่อตามคำตอบจะขึ้นตามข้อแม่เอง)" });
        }
    }
    await conn.query(`DELETE FROM ${link.table} WHERE ${link.idColumn} = ?`, [itemId]);
    if (unique.length > 0) {
        await conn.query(`INSERT INTO ${link.table} (${link.idColumn}, ${link.questionColumn}) VALUES ?`, [unique.map((id) => [itemId, id])]);
    }
    return { item_id: itemId, question_count: unique.length };
}

async function findGroupRow(conn, groupId, { forUpdate = false } = {}) {
    const [[group]] = await conn.query(
        `SELECT rqg_id FROM tb_requirement_groups WHERE rqg_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [groupId],
    );
    if (!group) throw new AppError(404, "REQUIREMENT_GROUP_NOT_FOUND", "ไม่พบกลุ่มคำถามนี้ กรุณาโหลดหน้าใหม่");
    return group;
}

async function findQuestionRow(conn, questionId, { forUpdate = false } = {}) {
    const [[question]] = await conn.query(
        `SELECT ${QUESTION_COLUMNS} FROM tb_requirement_questions WHERE rqq_id = ? ${forUpdate ? "FOR UPDATE" : ""}`,
        [questionId],
    );
    if (!question) throw new AppError(404, "REQUIREMENT_QUESTION_NOT_FOUND", "ไม่พบคำถามนี้ กรุณาโหลดหน้าใหม่");
    return questionRow(question);
}

async function childQuestionsOf(conn, questionId) {
    const [rows] = await conn.query(
        `SELECT ${QUESTION_COLUMNS} FROM tb_requirement_questions WHERE rqq_parent_id = ?`,
        [questionId],
    );
    return rows.map(questionRow);
}

/**
 * ข้อแม่ต้อง: อยู่กลุ่มเดียวกัน · อยู่ด้านบนของข้อนี้ · ชนิดเลือกตอบหรือใช่/ไม่ใช่ · ค่าที่ตั้งมีในตัวเลือกของข้อแม่
 * @param {object | null} current ข้อนี้ก่อนแก้ (null = ข้อใหม่ ซึ่งอยู่ท้ายกลุ่ม)
 */
async function assertParentAllowed(conn, groupId, current, input) {
    if (input.rqq_parent_id === null) return;
    const fail = (message) => validationError({ rqq_parent_id: message });
    if (current && input.rqq_parent_id === current.rqq_id) throw fail("เลือกข้อแม่เป็นข้อนี้เองไม่ได้");
    const [[parent]] = await conn.query(`SELECT ${QUESTION_COLUMNS} FROM tb_requirement_questions WHERE rqq_id = ?`, [
        input.rqq_parent_id,
    ]);
    if (!parent || parent.rqq_group_id !== groupId) throw fail("ข้อที่เลือกต้องอยู่ในกลุ่มเดียวกัน กรุณาเลือกใหม่");
    const isAbove =
        !current ||
        parent.rqq_sort_order < current.rqq_sort_order ||
        (parent.rqq_sort_order === current.rqq_sort_order && parent.rqq_id < current.rqq_id);
    if (!isAbove) throw fail("ข้อที่เลือกต้องอยู่ด้านบนของข้อนี้ (เลื่อนข้อนี้ลงก่อน)");
    if (!PARENT_QUESTION_TYPES.includes(parent.rqq_type))
        throw fail("เลือกได้เฉพาะข้อชนิด เลือกหนึ่งข้อ / เลือกได้หลายข้อ / ใช่-ไม่ใช่");
    const allowed = choiceValuesOf(questionRow(parent));
    if (!input.rqq_parent_values.every((value) => allowed.includes(value))) {
        throw validationError({ rqq_parent_values: "คำตอบที่เลือกไม่มีในตัวเลือกของข้อด้านบนแล้ว กรุณาเลือกใหม่" });
    }
}

/** แก้ข้อที่มีข้อลูก: ชนิดต้องยังเป็นข้อแม่ได้ และตัวเลือกที่ข้อลูกใช้อยู่ต้องยังอยู่ */
async function assertChildrenStillValid(conn, current, input) {
    const children = await childQuestionsOf(conn, current.rqq_id);
    if (children.length === 0) return;
    const names = (list) => list.map((child) => `"${child.rqq_text}"`).join(", ");
    if (!PARENT_QUESTION_TYPES.includes(input.rqq_type)) {
        throw validationError({
            rqq_type: `เปลี่ยนชนิดไม่ได้: ข้อ ${names(children)} ถามตามคำตอบของข้อนี้ · แก้ข้อนั้นก่อน`,
        });
    }
    const allowed = choiceValuesOf(input);
    const broken = children.filter((child) => !child.rqq_parent_values.every((value) => allowed.includes(value)));
    if (broken.length > 0) {
        throw validationError({ rqq_options: `ตัวเลือกที่เอาออกยังถูกใช้อยู่ในข้อ ${names(broken)} · แก้ข้อนั้นก่อน` });
    }
}

module.exports = {
    listGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    reorderGroups,
    copyGroup,
    copyQuestion,
    moveQuestion,
    setItemQuestions,
};
