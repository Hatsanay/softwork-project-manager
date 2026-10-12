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
