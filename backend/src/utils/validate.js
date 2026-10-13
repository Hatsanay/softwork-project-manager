// ตรวจข้อมูลที่ส่งเข้ามาด้วย zod schema (CODING_GUIDELINES หัวข้อ 3.4)
//
//   const body = validate(companySchema, req.body);   // ไม่ผ่าน → 400 VALIDATION พร้อม fields บอกว่าผิดช่องไหน
//
// ใช้ค่าที่ validate คืนมาเท่านั้น ห้ามกลับไปใช้ req.body — zod ตัดฟิลด์ที่ไม่ได้ประกาศทิ้งและแปลงชนิดให้แล้ว
const { AppError } = require("./app-error");

/**
 * @template T
 * @param {import("zod").ZodType<T>} schema
 * @param {unknown} data
 * @returns {T}
 */
function validate(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) return result.data;

    // ช่องเดียวผิดหลายข้อ แสดงข้อแรกพอ — ผู้ใช้แก้ทีละข้อ
    const fields = {};
    for (const issue of result.error.issues) {
        const fieldName = issue.path.length > 0 ? issue.path.join(".") : "_form";
        if (fields[fieldName] === undefined) fields[fieldName] = issue.message;
    }

    const fieldCount = Object.keys(fields).length;
    throw new AppError(400, "VALIDATION", `ข้อมูลไม่ถูกต้อง ${fieldCount} ช่อง กรุณาแก้ตามข้อความใต้ช่อง`, fields);
}

module.exports = { validate };
