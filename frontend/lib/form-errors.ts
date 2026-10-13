// แปลงผลตรวจของ zod เป็น { ชื่อช่อง: ข้อความ } — รูปเดียวกับ fields ที่ backend ส่งกลับ (backend/src/utils/validate.js)
// หน้าเว็บตรวจด้วย schema เดียวกับ backend ก่อนส่ง ผู้ใช้เห็นข้อผิดพลาดทันทีโดยไม่ต้องรอเซิร์ฟเวอร์
type ZodLikeIssue = { path: PropertyKey[]; message: string };

export type FieldErrors = Record<string, string>;

export function toFieldErrors(issues: ZodLikeIssue[]): FieldErrors {
    const fields: FieldErrors = {};
    for (const issue of issues) {
        const fieldName = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
        if (fields[fieldName] === undefined) fields[fieldName] = issue.message;
    }
    return fields;
}
