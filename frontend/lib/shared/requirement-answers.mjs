// คำถามความต้องการ: กลุ่มไหนต้องถาม + ตรวจคำตอบ (2026-10-25 · S-2 · docs/plans/2026-10-25-client-order-link.md ข้อ 4)
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// หน้าร้านกับ backend ใช้ไฟล์นี้ไฟล์เดียว: ลูกค้าเห็นข้อผิดพลาดก่อนส่ง และ backend ตรวจซ้ำด้วยกติกาเดียวกัน

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
export const MAX_FILES_PER_QUESTION = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LENGTH = { short_text: 300, long_text: 3000, url: 500 };

/**
 * กลุ่มที่ต้องถาม: กลุ่มทั่วไป + กลุ่มที่ผูกหมวดหรือชุดบริการของสิ่งที่เลือก · เรียงตามลำดับของกลุ่ม
 * @template {{ rqg_is_general: number | boolean, category_ids: string[], package_ids?: string[] }} Group
 * @param {Group[]} groups
 * @param {string[]} categoryIds หมวดของสินค้า/ชุดในตะกร้า
 * @param {string[]} [packageIds] ชุดบริการในตะกร้า
 * @returns {Group[]}
 */
export function applicableGroups(groups, categoryIds, packageIds = []) {
    const chosenCategories = new Set(categoryIds.filter(Boolean));
    const chosenPackages = new Set(packageIds.filter(Boolean));
    return groups.filter(
        (group) =>
            Boolean(group.rqg_is_general) ||
            group.category_ids.some((categoryId) => chosenCategories.has(categoryId)) ||
            (group.package_ids ?? []).some((packageId) => chosenPackages.has(packageId)),
    );
}

function isBlank(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    return String(value).trim() === "";
}

/**
 * ตรวจคำตอบหนึ่งข้อ → ข้อความผิด หรือ null
 * @param {{ rqq_type: string, rqq_is_required: number | boolean, rqq_options: string[] | null }} question
 * @param {unknown} value คำตอบ (multi = array ของข้อความ)
 * @param {number} fileCount จำนวนไฟล์ที่แนบ (ชนิด file)
 */
export function answerError(question, value, fileCount = 0) {
    const isRequired = Boolean(question.rqq_is_required);
    if (question.rqq_type === "file") {
        if (isRequired && fileCount === 0) return "กรุณาแนบไฟล์";
        if (fileCount > MAX_FILES_PER_QUESTION) return `แนบได้ไม่เกิน ${MAX_FILES_PER_QUESTION} ไฟล์`;
        return null;
    }
    if (isBlank(value)) return isRequired ? "กรุณาตอบข้อนี้" : null;
    const options = question.rqq_options ?? [];
    switch (question.rqq_type) {
        case "short_text":
        case "long_text":
            if (typeof value !== "string") return "คำตอบไม่ถูกต้อง";
            return value.trim().length > MAX_LENGTH[question.rqq_type] ? `ยาวได้ไม่เกิน ${MAX_LENGTH[question.rqq_type]} ตัวอักษร` : null;
        case "single":
            return options.includes(value) ? null : "เลือกจากตัวเลือกที่มี";
        case "multi":
            if (!Array.isArray(value)) return "คำตอบไม่ถูกต้อง";
            return value.every((item) => options.includes(item)) ? null : "เลือกจากตัวเลือกที่มี";
        case "yes_no":
            return value === "yes" || value === "no" ? null : "เลือก ใช่ หรือ ไม่ใช่";
        case "number":
            return /^\d{1,9}(\.\d{1,2})?$/.test(String(value).trim()) ? null : "ใส่ตัวเลข (ทศนิยมไม่เกิน 2 ตำแหน่ง)";
        case "date":
            return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? null : "เลือกวันที่";
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

/** คำตอบที่เก็บไว้ → ข้อความอ่านง่าย (หน้าพนักงาน/หน้าสถานะ) */
export function answerText(type, storedValue) {
    if (storedValue === null || storedValue === undefined || storedValue === "") return null;
    if (type === "multi") {
        try {
            return JSON.parse(storedValue).join(", ");
        } catch {
            return storedValue;
        }
    }
    if (type === "yes_no") return storedValue === "yes" ? "ใช่" : "ไม่ใช่";
    return storedValue;
}
