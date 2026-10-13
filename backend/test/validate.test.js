const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { validate } = require("../src/utils/validate");
const { AppError } = require("../src/utils/app-error");

const clientSchema = z.object({
    client_name: z.string().trim().min(1, "กรุณากรอกชื่อลูกค้า"),
    client_tax_id: z.string().regex(/^\d{13}$/, "เลขผู้เสียภาษีต้องมี 13 หลัก"),
    contacts: z.array(z.object({ email: z.email("อีเมลไม่ถูกต้อง") })).default([]),
});

test("ข้อมูลถูกต้อง คืนค่าที่ผ่านการตรวจ และตัดฟิลด์ที่ไม่ได้ประกาศทิ้ง", () => {
    const body = validate(clientSchema, {
        client_name: "  บริษัท ก  ",
        client_tax_id: "0105555000001",
        role_type: "S",
    });
    assert.deepEqual(body, { client_name: "บริษัท ก", client_tax_id: "0105555000001", contacts: [] });
});

test("ข้อมูลผิด ได้ 400 VALIDATION พร้อมข้อความรายช่อง (ช่องในรายการใช้ path แบบจุด)", () => {
    assert.throws(
        () => validate(clientSchema, { client_name: "", client_tax_id: "123", contacts: [{ email: "x" }] }),
        (error) => {
            assert.ok(error instanceof AppError);
            assert.equal(error.status, 400);
            assert.equal(error.code, "VALIDATION");
            assert.deepEqual(error.fields, {
                client_name: "กรุณากรอกชื่อลูกค้า",
                client_tax_id: "เลขผู้เสียภาษีต้องมี 13 หลัก",
                "contacts.0.email": "อีเมลไม่ถูกต้อง",
            });
            assert.match(error.message, /3 ช่อง/);
            return true;
        },
    );
});

test("body ไม่ใช่ object เลย ได้ fields._form", () => {
    assert.throws(
        () => validate(clientSchema, null),
        (error) => error instanceof AppError && typeof error.fields._form === "string",
    );
});
