// ตัวเรียก API ของสคริปต์ใส่ข้อมูล — login แยกตามผู้ใช้ (เก็บ token ไว้ใช้ซ้ำ) · ตอบไม่สำเร็จ = หยุดทันทีพร้อมเหตุผล
let baseUrl = null;
let password = null;
const tokens = new Map();

function configureApi(url, userPassword) {
    baseUrl = url;
    password = userPassword;
}

// เลื่อนเดือนแล้ว login ใหม่ (token ออกตามนาฬิกาจำลอง)
function forgetTokens() {
    tokens.clear();
}

async function rawCall(method, url, { token, body } = {}) {
    const isForm = body instanceof FormData;
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}/api${url}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function tokenOf(username) {
    if (tokens.has(username)) return tokens.get(username);
    const response = await rawCall("POST", "/V1/auth/login", { body: { login: username, user_password: password } });
    if (response.status !== 200) throw new Error(`login ${username} ไม่สำเร็จ: ${JSON.stringify(response.body)}`);
    tokens.set(username, response.body.token);
    return response.body.token;
}

/**
 * เรียก API ในนามผู้ใช้ — สถานะไม่ใช่ 2xx = หยุดสคริปต์
 * @returns {Promise<any>} body ของคำตอบ
 */
async function as(username, method, url, body) {
    const response = await rawCall(method, url, { token: await tokenOf(username), body });
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`${username} ${method} ${url} → ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response.body;
}

module.exports = { configureApi, forgetTokens, as, rawCall };
