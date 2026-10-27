// คำถามความต้องการ: ลูกค้าเห็นข้อไหน + ตรวจคำตอบ (2026-10-25 · S-2 · ปรับ 2026-10-26 Q-1 docs/plans/2026-10-26-customer-questions.md)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// หน้าร้าน ตัวคิดราคา Fastwork และ backend ใช้ไฟล์นี้ไฟล์เดียว: ลูกค้าเห็นข้อเดียวกับที่ backend ตรวจตอนส่งเสมอ
//
// เงื่อนไขมี 2 ชั้น (ข้อ 2 ของแบบ):
//   กลุ่ม  = ถามเมื่อลูกค้าเลือกอะไร (ทุกคำขอ · หมวด/ชุด/สินค้า · เฉพาะลิงก์ที่ถามเพิ่ม) + ชนิดลิงก์
//   คำถาม = ถามเมื่อคำตอบข้อก่อนหน้าในกลุ่มเดียวกันเป็นค่าที่ตั้ง + ชนิดลิงก์ + ไม่ถามเมื่อทีมงานเลือกรายการให้แล้ว

export const QUESTION_TYPES = ["short_text", "long_text", "single", "multi", "yes_no", "number", "date", "url", "file"];
export const QUESTION_TYPE_LABEL = {
    short_text: "ข้อความสั้น",
    long_text: "ข้อความยาว",
    single: "เลือกหนึ่งข้อ",
    multi: "เลือกได้หลายข้อ",
    yes_no: "ใช่ / ไม่ใช่",
    number: "ตัวเลข",
    date: "วันที่",
    url: "ลิงก์",
    file: "แนบไฟล์",
};

// ถามกลุ่มเมื่อไหร่ · always = ทุกคำขอ · selection = เมื่อลูกค้าเลือกหมวด/ชุด/สินค้าที่ผูกไว้ · link_only = เฉพาะลิงก์ที่เลือกถามเพิ่ม
export const GROUP_TRIGGERS = ["always", "selection", "link_only"];
export const GROUP_TRIGGER_LABEL = {
    always: "ถามทุกคำขอ",
    selection: "ถามเมื่อลูกค้าเลือกรายการที่ผูกไว้",
    link_only: "ไม่ถามเอง ใช้เฉพาะลิงก์ที่เลือกถามเพิ่ม",
};

// ชนิดลิงก์ที่ถาม · direct = ลิงก์ลูกค้าตรง (เฉพาะลูกค้า + สาธารณะ) · คำถามใช้ "group" = ตามกลุ่ม
export const GROUP_AUDIENCES = ["all", "direct", "fastwork"];
export const QUESTION_AUDIENCES = ["group", "direct", "fastwork"];
export const AUDIENCE_LABEL = {
    all: "ลิงก์ทุกแบบ",
    group: "ตามกลุ่ม",
    direct: "เฉพาะลิงก์ลูกค้าตรง",
    fastwork: "เฉพาะลิงก์ Fastwork",
};

// ข้อแม่ (ข้อที่ทำให้ข้อถัดไปขึ้น) ต้องเป็นชนิดที่มีตัวเลือกชัด
export const PARENT_QUESTION_TYPES = ["single", "multi", "yes_no"];
export const YES_NO_VALUES = { yes: "ใช่", no: "ไม่ใช่" };

// ตัวเลือก "อื่นๆ (ระบุ)" · เก็บเป็นตัวเลือกชื่อนี้ ส่วนข้อความที่ลูกค้าพิมพ์เก็บแยก (sva_other_text)
export const OTHER_OPTION = "อื่นๆ";
export const MAX_OTHER_TEXT_LENGTH = 300;

// ไฟล์ · document = รูป/PDF เปิดดูในหน้าได้ · design = เพิ่มไฟล์งานออกแบบ ดาวน์โหลดได้อย่างเดียว (SVG ฝังสคริปต์ได้)
export const FILE_KINDS = ["document", "design"];
export const MAX_FILES_PER_QUESTION = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DESIGN_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TOTAL_FILE_BYTES = 60 * 1024 * 1024;
export const FILE_KIND_ACCEPT = {
    document: "image/png,image/jpeg,application/pdf",
    design: "image/png,image/jpeg,application/pdf,.ai,.psd,.svg,.zip",
};
export const FILE_KIND_HINT = {
    document: "รูป (JPG/PNG) หรือ PDF ไฟล์ละไม่เกิน 10 MB",
    design: "รูป PDF หรือไฟล์งานออกแบบ (AI PSD SVG ZIP) ไฟล์ละไม่เกิน 20 MB",
};

const MAX_LENGTH = { short_text: 300, long_text: 3000, url: 500 };
// เวลาที่ลูกค้าใช้ตอบต่อข้อ (วินาที) โดยประมาณ · ข้อความยาวคิดนานสุด · ไฟล์ต้องหาไฟล์ในเครื่อง
const SECONDS_PER_QUESTION = { long_text: 60, file: 30 };
const DEFAULT_SECONDS_PER_QUESTION = 15;

/** ขนาดไฟล์สูงสุดของข้อนี้ (ไบต์) */
export function maxFileBytesOf(question) {
    return question.rqq_file_kind === "design" ? MAX_DESIGN_FILE_BYTES : MAX_FILE_BYTES;
}

/** ตัวเลือกที่ลูกค้ากดได้ (รวม "อื่นๆ" ถ้าเปิด) · ใช่/ไม่ใช่ = ค่า yes/no */
export function choiceValuesOf(question) {
    if (question.rqq_type === "yes_no") return Object.keys(YES_NO_VALUES);
    const options = question.rqq_options ?? [];
    return question.rqq_allow_other ? [...options, OTHER_OPTION] : options;
}

/**
 * กลุ่มและคำถามที่ลูกค้าคนนี้ต้องเห็น เรียงตามลำดับ (ใช้ทั้งหน้าร้าน ตัวคิดราคา Fastwork และ backend ตอนส่ง)
 * @param {object[]} groups กลุ่มที่ใช้งาน พร้อมคำถามที่ใช้งาน (requirement.service listGroups activeOnly)
 * @param {{
 *   linkKind: "personal" | "public" | "fastwork",
 *   categoryIds?: string[], packageIds?: string[], productIds?: string[],
 *   hasPreset?: boolean,
 *   includeGroupIds?: number[], excludeGroupIds?: number[],
 * }} context สิ่งที่ลูกค้าเลือก (รวมรายการที่ทีมเลือกให้) + การตั้งค่ากลุ่มของลิงก์
 * @param {Record<number, string | string[] | null | undefined> | null} [answers] คำตอบตอนนี้ (ใช้ตัดสินข้อที่ขึ้นตามคำตอบ)
 *   null = ยังไม่รู้คำตอบ (ข้อความคัดลอกไปถามในแชต Fastwork) → ข้อลูกขึ้นทั้งหมด ผู้เรียกเขียนเงื่อนไขกำกับเอง
 * @returns {object[]} สำเนาของกลุ่ม (questions = เฉพาะข้อที่ขึ้น) + matched = รายการที่ทำให้กลุ่มนี้ขึ้น
 */
export function visibleQuestionnaire(groups, context, answers = {}) {
    const chosen = {
        categoryIds: new Set((context.categoryIds ?? []).filter(Boolean)),
        packageIds: new Set((context.packageIds ?? []).filter(Boolean)),
        productIds: new Set((context.productIds ?? []).filter(Boolean)),
    };
    const included = new Set(context.includeGroupIds ?? []);
    const excluded = new Set(context.excludeGroupIds ?? []);
    const result = [];
    for (const group of groups) {
        if (excluded.has(group.rqg_id)) continue;
        if (!isAudienceAllowed(group.rqg_audience, context.linkKind)) continue;
        const matched = matchedSelection(group, chosen);
        const isAsked =
            group.rqg_trigger === "always" ||
            (group.rqg_trigger === "selection" && matched.isAny) ||
            included.has(group.rqg_id);
        if (!isAsked) continue;
        const questions = visibleQuestionsOf(group, context, answers);
        if (questions.length === 0) continue;
        result.push({ ...group, questions, matched: matched.ids });
    }
    return result;
}

/**
 * สรุปชุดคำถามที่ลูกค้าเห็น: จำนวนข้อ · ต้องตอบกี่ข้อ · ราวกี่นาที (Q-2 ดูมุมมองลูกค้า · Q-4 หัวขั้นตอบคำถาม)
 * เวลาเป็นค่าประมาณ ปัดขึ้นเป็นนาที ต่ำสุด 1 นาที ไม่ใช่สัญญา
 * @param {object[]} groups ผลของ visibleQuestionnaire
 * @returns {{ questionCount: number, requiredCount: number, minutes: number }}
 */
export function questionnaireSummary(groups) {
    const questions = groups.flatMap((group) => group.questions);
    const seconds = questions.reduce(
        (sum, question) => sum + (SECONDS_PER_QUESTION[question.rqq_type] ?? DEFAULT_SECONDS_PER_QUESTION),
        0,
    );
    return {
        questionCount: questions.length,
        requiredCount: questions.filter((question) => question.rqq_is_required).length,
        minutes: questions.length === 0 ? 0 : Math.max(1, Math.ceil(seconds / 60)),
    };
}

/**
 * ตรวจคำตอบหนึ่งข้อ → ข้อความผิด หรือ null (เรียกเฉพาะข้อที่ลูกค้าเห็น · ข้อที่ไม่ขึ้นไม่ต้องตอบ)
 * @param {object} question
 * @param {unknown} value คำตอบ (multi = array ของข้อความ)
 * @param {{ fileCount?: number, otherText?: string | null, today?: string }} [extra]
 *   fileCount = จำนวนไฟล์ (ชนิด file) · otherText = ข้อความใน "อื่นๆ" · today = วันนี้เวลาไทย YYYY-MM-DD (ชนิด date ที่ต้องเป็นอนาคต)
 */
export function answerError(question, value, { fileCount = 0, otherText = null, today = null } = {}) {
    const isRequired = Boolean(question.rqq_is_required);
    if (question.rqq_type === "file") {
        if (isRequired && fileCount === 0) return "กรุณาแนบไฟล์";
        if (fileCount > MAX_FILES_PER_QUESTION) return `แนบได้ไม่เกิน ${MAX_FILES_PER_QUESTION} ไฟล์`;
        return null;
    }
    if (isBlank(value)) return isRequired ? "กรุณาตอบข้อนี้" : null;
    switch (question.rqq_type) {
        case "short_text":
        case "long_text":
            if (typeof value !== "string") return "คำตอบไม่ถูกต้อง";
            return value.trim().length > MAX_LENGTH[question.rqq_type]
                ? `ยาวได้ไม่เกิน ${MAX_LENGTH[question.rqq_type]} ตัวอักษร`
                : null;
        case "single":
        case "multi":
            return choiceError(question, value, otherText);
        case "yes_no":
            return value in YES_NO_VALUES ? null : "เลือก ใช่ หรือ ไม่ใช่";
        case "number":
            return numberError(question, value);
        case "date":
            return dateError(question, value, today);
        case "url": {
            const text = String(value).trim();
            if (text.length > MAX_LENGTH.url) return `ยาวได้ไม่เกิน ${MAX_LENGTH.url} ตัวอักษร`;
            return /^https?:\/\/\S+\.\S+/i.test(text) ? null : "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://";
        }
        default:
            return "ชนิดคำถามไม่ถูกต้อง";
    }
}

/** คำตอบที่จะเก็บ (ข้อความ) · ว่าง = null · multi = JSON array */
export function storedAnswer(question, value) {
    if (question.rqq_type === "file" || isBlank(value)) return null;
    if (question.rqq_type === "multi") return JSON.stringify(value);
    return String(value).trim();
}

/** ข้อความ "อื่นๆ" ที่จะเก็บ · ไม่ได้เลือก "อื่นๆ" = null (ข้อความที่พิมพ์ค้างไว้ไม่ถูกเก็บ) */
export function storedOtherText(question, value, otherText) {
    if (!question.rqq_allow_other || !isOtherChosen(value)) return null;
    const text = String(otherText ?? "").trim();
    return text === "" ? null : text;
}

/**
 * คำตอบที่เก็บไว้ → ข้อความอ่านง่าย (หน้าพนักงาน/หน้าสถานะ)
 * @param {string} type ชนิดคำถาม ณ วันส่ง
 * @param {string | null} storedValue
 * @param {string | null} [otherText] ข้อความใน "อื่นๆ"
 */
export function answerText(type, storedValue, otherText = null) {
    if (storedValue === null || storedValue === undefined || storedValue === "") return null;
    const withOther = (option) => (option === OTHER_OPTION && otherText ? `${OTHER_OPTION}: ${otherText}` : option);
    if (type === "multi") {
        try {
            return JSON.parse(storedValue).map(withOther).join(", ");
        } catch {
            return storedValue;
        }
    }
    if (type === "yes_no") return YES_NO_VALUES[storedValue] ?? storedValue;
    if (type === "single") return withOther(storedValue);
    return storedValue;
}

/** ข้อความเงื่อนไขของข้อลูก เช่น `ถ้าข้อ "มีโลโก้ร้านแล้วไหม" ตอบว่า มีแล้ว` (ใช้หน้าตั้งค่าและข้อความคัดลอก Fastwork) */
export function parentConditionText(parentQuestion, parentValues) {
    const labels = (parentValues ?? []).map((value) =>
        parentQuestion.rqq_type === "yes_no" ? (YES_NO_VALUES[value] ?? value) : value,
    );
    return `ถ้าข้อ "${parentQuestion.rqq_text}" ตอบว่า ${labels.join(" หรือ ")}`;
}

/** ช่วงตัวเลขเป็นข้อความ เช่น " 1 ถึง 200 หน้าจอ" · ไม่มีช่วง = "" */
export function numberRangeText(question) {
    const unit = question.rqq_unit ? ` ${question.rqq_unit}` : "";
    const min = limitOf(question.rqq_min);
    const max = limitOf(question.rqq_max);
    if (min !== null && max !== null) return ` ${min} ถึง ${max}${unit}`;
    if (min !== null) return ` ตั้งแต่ ${min}${unit} ขึ้นไป`;
    if (max !== null) return ` ไม่เกิน ${max}${unit}`;
    return "";
}

function isAudienceAllowed(audience, linkKind) {
    if (audience === "direct") return linkKind !== "fastwork";
    if (audience === "fastwork") return linkKind === "fastwork";
    return true;
}

/** หมวด/ชุด/สินค้าที่ผูกกับกลุ่มและลูกค้าเลือกอยู่ */
function matchedSelection(group, chosen) {
    const ids = {
        category_ids: (group.category_ids ?? []).filter((id) => chosen.categoryIds.has(id)),
        package_ids: (group.package_ids ?? []).filter((id) => chosen.packageIds.has(id)),
        product_ids: (group.product_ids ?? []).filter((id) => chosen.productIds.has(id)),
    };
    const isAny = ids.category_ids.length > 0 || ids.package_ids.length > 0 || ids.product_ids.length > 0;
    return { ids, isAny };
}

/** คำถามที่ขึ้นในกลุ่ม · ไล่จากบนลงล่าง: ข้อลูกขึ้นเมื่อข้อแม่ (อยู่ด้านบนเสมอ) ขึ้นและคำตอบตรงค่าที่ตั้ง */
function visibleQuestionsOf(group, context, answers) {
    const shownIds = new Set();
    const questionsById = new Map(group.questions.map((question) => [question.rqq_id, question]));
    const visible = [];
    for (const question of group.questions) {
        const audience =
            question.rqq_audience === "group" || !question.rqq_audience ? group.rqg_audience : question.rqq_audience;
        if (!isAudienceAllowed(audience, context.linkKind)) continue;
        if (question.rqq_skip_when_preset && context.hasPreset) continue;
        if (question.rqq_parent_id) {
            const parent = questionsById.get(question.rqq_parent_id);
            if (!parent || !shownIds.has(parent.rqq_id)) continue;
            if (answers !== null && !answerMatches(answers[parent.rqq_id], question.rqq_parent_values ?? [])) continue;
        }
        shownIds.add(question.rqq_id);
        visible.push(question);
    }
    return visible;
}

/** คำตอบของข้อแม่ตรงค่าที่ตั้งไหม · เลือกได้หลายข้อ = มีค่าใดค่าหนึ่ง */
function answerMatches(value, expectedValues) {
    if (Array.isArray(value)) return value.some((item) => expectedValues.includes(item));
    if (typeof value !== "string") return false;
    return expectedValues.includes(value);
}

function choiceError(question, value, otherText) {
    const allowed = choiceValuesOf(question);
    const picked = question.rqq_type === "multi" ? value : [value];
    if (question.rqq_type === "multi" && !Array.isArray(value)) return "คำตอบไม่ถูกต้อง";
    if (question.rqq_type === "single" && typeof value !== "string") return "คำตอบไม่ถูกต้อง";
    if (!picked.every((item) => allowed.includes(item))) return "เลือกจากตัวเลือกที่มี";
    if (question.rqq_allow_other && picked.includes(OTHER_OPTION)) {
        const text = String(otherText ?? "").trim();
        if (text === "") return `พิมพ์รายละเอียดของ "${OTHER_OPTION}"`;
        if (text.length > MAX_OTHER_TEXT_LENGTH)
            return `รายละเอียดของ "${OTHER_OPTION}" ยาวได้ไม่เกิน ${MAX_OTHER_TEXT_LENGTH} ตัวอักษร`;
    }
    return null;
}

function numberError(question, value) {
    const text = String(value).trim();
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return "ใส่ตัวเลข 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)";
    const number = Number(text);
    const min = limitOf(question.rqq_min);
    const max = limitOf(question.rqq_max);
    if ((min !== null && number < min) || (max !== null && number > max))
        return `ใส่ตัวเลข${numberRangeText(question)}`;
    return null;
}

/** ค่าต่ำสุด/สูงสุดของข้อตัวเลข (DECIMAL ได้มาเป็นข้อความ) · ไม่ได้ตั้ง = null · ใช้เทียบช่วงเท่านั้น ไม่ใช่เงิน */
function limitOf(value) {
    if (value === null || value === undefined || value === "") return null;
    return Number(value);
}

function dateError(question, value, today) {
    const text = String(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return "เลือกวันที่";
    // เทียบสตริง YYYY-MM-DD ตรงๆ ได้ (เรียงตามตัวอักษร = เรียงตามวัน) · today มาจากเวลาไทยของผู้เรียก
    if (question.rqq_future_only && today && text <= today) return "เลือกวันหลังวันนี้";
    return null;
}

function isOtherChosen(value) {
    if (Array.isArray(value)) return value.includes(OTHER_OPTION);
    return value === OTHER_OPTION;
}

function isBlank(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    return String(value).trim() === "";
}
