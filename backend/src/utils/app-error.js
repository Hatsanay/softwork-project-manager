// error ที่ตั้งใจส่งให้ผู้ใช้เห็น — error middleware จัดเป็นรูปแบบกลาง { message, code, fields, request_id }
// (docs/CODING_GUIDELINES.md หัวข้อ 3.3) · โมดูลใหม่ throw ตัวนี้แทนการเขียน res.status().json() เอง
//
//   throw new AppError(404, "QUOTATION_NOT_FOUND", "ไม่พบใบเสนอราคานี้");
//   throw new AppError(400, "VALIDATION", "ข้อมูลไม่ถูกต้อง 1 ช่อง", { client_tax_id: "เลขผู้เสียภาษีต้องมี 13 หลัก" });
//
// ห้ามใช้กับ 500 — บั๊กจริงให้ throw Error ธรรมดา ระบบจะซ่อนรายละเอียดแล้วบันทึกลง error log เอง

class AppError extends Error {
    /**
     * @param {number} status รหัส HTTP 4xx หรือ 503
     * @param {string} code ตัวพิมพ์ใหญ่-ขีดล่าง หน้าเว็บใช้ตัดสินใจ เช่น "ROLE_IN_USE"
     * @param {string} message ภาษาไทย บอกว่าทำไม และต้องทำอะไรต่อ
     * @param {Record<string, string>} [fields] ผิดที่ช่องไหน — key คือชื่อคอลัมน์/ชื่อฟิลด์ใน API
     */
    constructor(status, code, message, fields) {
        super(message);
        this.name = "AppError";
        this.status = status;
        this.code = code;
        this.fields = fields;
    }
}

module.exports = { AppError };
