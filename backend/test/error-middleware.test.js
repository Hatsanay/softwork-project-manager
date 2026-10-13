const test = require("node:test");
const assert = require("node:assert/strict");
const { errorHandler } = require("../src/middlewares/error.middleware");

// res จำลองที่เก็บ status/body ไว้ตรวจ
function createFakeResponse() {
    const response = { statusCode: null, body: null };
    response.status = (code) => {
        response.statusCode = code;
        return response;
    };
    response.json = (body) => {
        response.body = body;
        return response;
    };
    return response;
}

const fakeRequest = { id: "test-request", originalUrl: "/api/V1/example", method: "DELETE" };

function callErrorHandler(error) {
    const response = createFakeResponse();
    const originalConsoleError = console.error;
    console.error = () => {}; // ไม่ให้ error จำลองรกผลเทสต์
    try {
        errorHandler(error, fakeRequest, response, () => {});
    } finally {
        console.error = originalConsoleError;
    }
    return response;
}

test("ลบข้อมูลที่ยังถูกใช้งานอยู่ (foreign key) ได้ 409 พร้อมเหตุผล แทน 500", () => {
    const response = callErrorHandler(Object.assign(new Error("fk"), { code: "ER_ROW_IS_REFERENCED_2" }));
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "IN_USE");
    assert.match(response.body.message, /ยังถูกใช้งานอยู่/);
});

test("อ้างถึงข้อมูลที่ถูกลบไปแล้ว ได้ 400 บอกให้โหลดหน้าใหม่", () => {
    const response = callErrorHandler(Object.assign(new Error("fk"), { code: "ER_NO_REFERENCED_ROW_2" }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, "REFERENCE_NOT_FOUND");
});

test("error ที่ตั้ง status 4xx ไว้เอง ส่งข้อความต่อได้", () => {
    const response = callErrorHandler(Object.assign(new Error("ข้อมูลไม่ถูกต้อง"), { status: 400 }));
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.message, "ข้อมูลไม่ถูกต้อง");
});

test("AppError ได้รูปแบบกลาง { message, code, fields, request_id }", () => {
    const { AppError } = require("../src/utils/app-error");
    const error = new AppError(400, "VALIDATION", "ข้อมูลไม่ถูกต้อง 1 ช่อง", { client_tax_id: "เลขผู้เสียภาษีต้องมี 13 หลัก" });
    const response = callErrorHandler(error);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
        message: "ข้อมูลไม่ถูกต้อง 1 ช่อง",
        code: "VALIDATION",
        fields: { client_tax_id: "เลขผู้เสียภาษีต้องมี 13 หลัก" },
        request_id: "test-request",
    });
});

test("AppError ที่ไม่มี fields ส่ง fields เป็น null (หน้าเว็บไม่ต้องเช็ก undefined)", () => {
    const { AppError } = require("../src/utils/app-error");
    const response = callErrorHandler(new AppError(409, "QUOTATION_STATUS_CHANGED", "ใบนี้ไม่ได้รออนุมัติแล้ว"));
    assert.equal(response.statusCode, 409);
    assert.equal(response.body.fields, null);
});

test("ตัวเลขเงินผิดที่หลุดมาจาก service ได้ 400 INVALID_AMOUNT ไม่ใช่ 500", () => {
    const { calculateLine } = require("../src/shared/money.mjs");
    let moneyError;
    try {
        calculateLine({ quantity: 1, unitPrice: "abc" });
    } catch (error) {
        moneyError = error;
    }
    const response = callErrorHandler(moneyError);
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, "INVALID_AMOUNT");
    assert.match(response.body.message, /ราคาต่อหน่วย/);
});
