// อัตราแลกเปลี่ยน ธปท. และลายเซ็น (ขั้น 1A-2) — ยิงผ่านเซิร์ฟเวอร์จริงบนฐานข้อมูลชั่วคราว
// ธปท. เป็นเซิร์ฟเวอร์จำลองในเทสต์นี้ (ไม่ยิงของจริง) — รูปคำตอบตาม API จริง: result.data.data_detail[]
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { startTestServer, SEED_ADMIN } = require("./support/test-server");
const { PERMISSION_KEYS } = require("../src/shared/permissions.mjs");
const { todayBangkok } = require("../src/utils/bangkok-time");

const FAKE_KEY = "fake-bot-key-must-never-leak";

let api;
let botServer;
let botMode = "ok";
const botRequests = [];

function daysFromToday(dayCount) {
    const [year, month, day] = todayBangkok().split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

// ธปท. จำลอง: USD มีอัตราวันที่ -3 และ -2 (วันที่ -1 เป็นวันหยุด) · JPY ประกาศต่อ 100 เยน
function botRowsFor(currency) {
    if (currency === "USD") {
        return [
            {
                period: daysFromToday(-3),
                currency_id: "USD",
                buying_sight: "34.1",
                buying_transfer: "34.2",
                selling: "34.9",
                mid_rate: "34.55",
            },
            {
                period: daysFromToday(-2),
                currency_id: "USD",
                buying_sight: "34.4567",
                buying_transfer: "34.5678",
                selling: "35.1",
                mid_rate: "34.8",
            },
        ];
    }
    if (currency === "JPY") {
        return [
            {
                period: daysFromToday(-2),
                currency_id: "JPY",
                buying_sight: "",
                buying_transfer: "22.6155",
                selling: "23.5",
                mid_rate: "",
            },
        ];
    }
    return [];
}

function startFakeBot() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const url = new URL(req.url, "http://localhost");
            botRequests.push({
                authorization: req.headers.authorization,
                params: Object.fromEntries(url.searchParams),
            });
            if (botMode === "slow") return; // ไม่ตอบเลย — ให้หมดเวลา 5 วินาที
            if (botMode === "rejected") {
                res.writeHead(401, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ message: "invalid key" }));
            }
            if (botMode === "garbage") {
                res.writeHead(200, { "Content-Type": "text/html" });
                return res.end("<html>maintenance</html>");
            }
            const currency = url.searchParams.get("currency");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    result: { api: "Daily Average Exchange Rate", data: { data_detail: botRowsFor(currency) } },
                }),
            );
        });
        server.listen(0, () => resolve(server));
    });
}

function useBot(mode) {
    botMode = mode;
    botRequests.length = 0;
    process.env.BOT_API_KEY = FAKE_KEY;
    process.env.BOT_API_URL = `http://127.0.0.1:${botServer.address().port}/Stat-ExchangeRate/v2/DAILY_AVG_EXG_RATE/`;
    require("../src/services/exchange-rate.service").forgetFetchAttempts();
}

async function signatureImage({ withInk = true, background = "#ffffff" } = {}) {
    const ink = await sharp({ create: { width: 220, height: 30, channels: 3, background: "#1e3a8a" } })
        .png()
        .toBuffer();
    const canvas = sharp({ create: { width: 800, height: 300, channels: 4, background } });
    const image = withInk ? canvas.composite([{ input: ink, top: 130, left: 290 }]) : canvas;
    return image.png().toBuffer();
}

function signatureForm(file, fields, contentType = "image/png") {
    const form = new FormData();
    if (file) form.append("signature", new Blob([file], { type: contentType }), "signature.png");
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return form;
}

async function fetchImage(signatureId, token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(`${api.baseUrl}/api/V1/signatures/${signatureId}`, { headers });
}

// id ผู้ใช้ทดสอบเรียงเลข (เดิมสุ่มจาก 90 ค่า สร้างสองคนในเทสต์เดียวชนกันได้ราว 1 ใน 90 — เทสต์ตกแบบสุ่ม)
let createdUserCount = 0;

async function createUser(username, permissionKeys) {
    const bits = PERMISSION_KEYS.map((key) => (permissionKeys.includes(key) ? "1" : "0")).join("");
    const role = await api.callApi("POST", "/V1/roles", {
        body: { role_name: `role-${username}`, role_permission: bits },
    });
    const passwordHash = await bcrypt.hash("Staff@2026", 10);
    createdUserCount += 1;
    const userId = `USE20990101${String(createdUserCount).padStart(7, "0")}`;
    await api.pool.query(
        `INSERT INTO tb_users (user_id, user_username, user_email, user_password, user_fname, user_lname, user_role_id, user_must_change_password)
         VALUES (?, ?, ?, ?, 'พนักงาน', ?, ?, 0)`,
        [userId, username, `${username}@example.com`, passwordHash, username, role.body.role_id],
    );
    return { userId, token: await api.login(username, "Staff@2026") };
}

test.before(async () => {
    api = await startTestServer("exchange_signature");
    await api.loginAsAdmin();
    botServer = await startFakeBot();
    const jpy = await api.callApi("POST", "/V1/company/currencies", {
        body: {
            cur_code: "JPY",
            cur_name_th: "เยน",
            cur_name_en: "Japanese Yen",
            cur_symbol: "¥",
            cur_decimals: 0,
            cur_unit_th: "เยน",
            cur_subunit_th: null,
            cur_unit_en: "Yen",
            cur_subunit_en: null,
            cur_bot_unit: 100,
            cur_sort_order: 3,
            cur_status: "active",
        },
    });
    assert.equal(jpy.status, 201, JSON.stringify(jpy.body));
});

test.after(async () => {
    await new Promise((resolve) => botServer?.close(resolve));
    await api?.stop();
});

// ─── อัตราแลกเปลี่ยน ─────────────────────────────────────────────────────────────────────────

test("อัตรา: บาทเป็น 1 เสมอ ไม่เรียก ธปท.", async () => {
    useBot("ok");
    const response = await api.callApi("GET", "/V1/exchange-rates?currency=thb");
    assert.equal(response.status, 200);
    assert.equal(response.body.rate, "1.0000000000");
    assert.equal(response.body.source, "base");
    assert.equal(botRequests.length, 0);
});

test("อัตรา: ไม่มีคีย์ → ไม่พัง บอกให้กรอกเอง", async () => {
    useBot("ok");
    process.env.BOT_API_KEY = "";
    const response = await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${daysFromToday(-1)}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.available, false);
    assert.equal(response.body.bot_configured, false);
    assert.equal(response.body.error.code, "NO_API_KEY");
    assert.equal(botRequests.length, 0);

    const status = await api.callApi("GET", "/V1/exchange-rates/status");
    assert.deepEqual(status.body, { bot_configured: false, rate_type: "buying_transfer", lookback_days: 10 });
});

test("อัตรา: วันหยุดใช้อัตราวันทำการก่อนหน้า · ส่งคีย์ใน header · ขอย้อนหลัง 10 วัน · ครั้งต่อไปใช้แคช", async () => {
    useBot("ok");
    const holiday = daysFromToday(-1);
    const response = await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${holiday}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.available, true);
    assert.equal(response.body.rate, "34.5678000000");
    assert.equal(response.body.rate_date, daysFromToday(-2));
    assert.equal(response.body.all_rates.selling, "35.1000000000");
    assert.equal(response.body.error, null);

    assert.equal(botRequests.length, 1);
    assert.equal(botRequests[0].authorization, FAKE_KEY);
    assert.deepEqual(botRequests[0].params, { start_period: daysFromToday(-11), end_period: holiday, currency: "USD" });
    assert.ok(!JSON.stringify(response.body).includes(FAKE_KEY));

    // วันที่ตรงกับที่ประกาศแล้ว → ใช้แคช ไม่เรียก ธปท. อีก
    const exact = await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${daysFromToday(-3)}`);
    assert.equal(exact.body.rate, "34.2000000000");
    // วันหยุดเดิมซ้ำภายใน 30 นาที → ไม่เรียกซ้ำ
    await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${holiday}`);
    assert.equal(botRequests.length, 1);

    const [[{ cachedCount }]] = await api.pool.query(
        "SELECT COUNT(*) AS cachedCount FROM tb_exchange_rates WHERE er_currency = 'USD'",
    );
    assert.equal(cachedCount, 2);
});

test("อัตรา: สกุลที่ ธปท. ประกาศต่อ 100 หน่วย แปลงเป็นต่อ 1 หน่วยก่อนเก็บ · ช่องว่างจาก ธปท. เก็บเป็น null", async () => {
    useBot("ok");
    const response = await api.callApi("GET", `/V1/exchange-rates?currency=JPY&date=${daysFromToday(-2)}`);
    assert.equal(response.body.rate, "0.2261550000");
    assert.equal(response.body.all_rates.buying_sight, null);
});

test("อัตรา: ธปท. ไม่รับคีย์ — มีอัตราเก่าในแคชก็ยังใช้ได้พร้อมเหตุผล · ไม่มีเลยบอกให้กรอกเอง", async () => {
    useBot("rejected");
    const today = await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${todayBangkok()}`);
    assert.equal(today.body.available, true);
    assert.equal(today.body.rate_date, daysFromToday(-2));
    assert.equal(today.body.error.code, "BOT_REJECTED");

    const unknownCurrencyDate = await api.callApi("GET", "/V1/exchange-rates?currency=USD&date=2020-01-15");
    assert.equal(unknownCurrencyDate.body.available, false);
    assert.equal(unknownCurrencyDate.body.error.code, "BOT_REJECTED");

    useBot("garbage");
    const garbage = await api.callApi("GET", "/V1/exchange-rates?currency=USD&date=2020-02-15");
    assert.equal(garbage.body.error.code, "BOT_BAD_RESPONSE");

    useBot("ok");
    const noData = await api.callApi("GET", "/V1/exchange-rates?currency=USD&date=2020-03-15");
    assert.equal(noData.body.available, false);
    assert.equal(noData.body.error.code, "NO_RATE_FOUND");
});

test("อัตรา: ธปท. ช้าเกิน 5 วินาที → ตอบได้ ไม่ค้าง", async () => {
    useBot("slow");
    const startedAt = Date.now();
    const response = await api.callApi("GET", "/V1/exchange-rates?currency=USD&date=2021-01-15");
    assert.equal(response.status, 200);
    assert.equal(response.body.error.code, "BOT_TIMEOUT");
    assert.ok(Date.now() - startedAt < 8000);
});

test("อัตรา: ตรวจข้อมูลที่ส่งมา", async () => {
    useBot("ok");
    const future = await api.callApi("GET", `/V1/exchange-rates?currency=USD&date=${daysFromToday(1)}`);
    assert.equal(future.status, 400);
    const badDate = await api.callApi("GET", "/V1/exchange-rates?currency=USD&date=2026-02-30");
    assert.equal(badDate.status, 400);
    const badCode = await api.callApi("GET", "/V1/exchange-rates?currency=US");
    assert.equal(badCode.status, 400);
    const unknown = await api.callApi("GET", "/V1/exchange-rates?currency=XYZ");
    assert.equal(unknown.status, 404);
});

// ─── ลายเซ็น ─────────────────────────────────────────────────────────────────────────────────

test("ลายเซ็น: ต้องยืนยันรหัสผ่าน · ไม่รับรูปว่าง/ไฟล์ที่ไม่ใช่รูปจริง", async () => {
    const image = await signatureImage();
    const noPassword = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(image, { method: "draw" }),
    });
    assert.equal(noPassword.status, 400);
    assert.ok(noPassword.body.fields.password);

    const wrongPassword = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(image, { method: "draw", password: "wrong" }),
    });
    assert.equal(wrongPassword.status, 400);
    assert.ok(wrongPassword.body.fields.password);

    const noFile = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(null, { method: "draw", password: SEED_ADMIN.newPassword }),
    });
    assert.equal(noFile.status, 400);

    const blank = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(await signatureImage({ withInk: false }), {
            method: "upload",
            password: SEED_ADMIN.newPassword,
        }),
    });
    assert.equal(blank.status, 400);
    assert.ok(blank.body.fields.signature);

    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const svgUpload = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(svg, { method: "upload", password: SEED_ADMIN.newPassword }, "image/svg+xml"),
    });
    assert.equal(svgUpload.status, 400);

    const [[{ signatureCount }]] = await api.pool.query("SELECT COUNT(*) AS signatureCount FROM tb_user_signatures");
    assert.equal(signatureCount, 0);
});

test("ลายเซ็น: พื้นโปร่งใส ตัดขอบ PNG · ดูรูปต้อง login · ตั้งใหม่แล้วฉบับเก่ายังเปิดได้ ใช้งานอยู่ทีละฉบับ", async () => {
    const first = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(await signatureImage(), { method: "upload", password: SEED_ADMIN.newPassword }),
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const firstId = first.body.signature.sig_id;
    assert.equal(first.body.signature.sig_method, "upload");

    const image = await fetchImage(firstId, await api.login(SEED_ADMIN.login, SEED_ADMIN.newPassword));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    assert.equal(image.headers.get("x-content-type-options"), "nosniff");
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    assert.equal(metadata.format, "png");
    assert.equal(metadata.hasAlpha, true);
    // หมึก 220×30 บนพื้น 800×300 → ตัดขอบเหลือเท่าหมึก
    assert.equal(metadata.width, 220);
    assert.equal(metadata.height, 30);

    const anonymous = await fetchImage(firstId, null);
    assert.equal(anonymous.status, 401);
    const badId = await api.callApi("GET", "/V1/signatures/..%2F..%2F.env");
    assert.equal(badId.status, 404);

    // เซ็นบนจอ (พื้นโปร่งใส) ก็ใช้ได้
    const second = await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(await signatureImage({ background: { r: 0, g: 0, b: 0, alpha: 0 } }), {
            method: "draw",
            password: SEED_ADMIN.newPassword,
        }),
    });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.notEqual(second.body.signature.sig_id, firstId);

    const mine = await api.callApi("GET", "/V1/users/me/signature");
    assert.equal(mine.body.signature.sig_id, second.body.signature.sig_id);
    const oldImage = await fetchImage(firstId, await api.login(SEED_ADMIN.login, SEED_ADMIN.newPassword));
    assert.equal(oldImage.status, 200);

    const [[{ activeCount }]] = await api.pool.query(
        "SELECT COUNT(*) AS activeCount FROM tb_user_signatures WHERE sig_user_id = ? AND sig_revoked_at IS NULL",
        [SEED_ADMIN.userId],
    );
    assert.equal(activeCount, 1);

    const revoke = await api.callApi("DELETE", "/V1/users/me/signature");
    assert.equal(revoke.status, 204);
    const afterRevoke = await api.callApi("GET", "/V1/users/me/signature");
    assert.equal(afterRevoke.body.signature, null);
    const revokeAgain = await api.callApi("DELETE", "/V1/users/me/signature");
    assert.equal(revokeAgain.status, 404);
});

test("ลายเซ็นของคนอื่น: แอดมินยกเลิกได้แต่ตั้งแทนไม่ได้ · ยกเลิกของคนที่สิทธิ์สูงกว่าไม่ได้ · มีลายเซ็นแล้วลบผู้ใช้ไม่ได้", async () => {
    const staff = await createUser("signer.test", ["dashboard"]);
    const staffSigned = await api.callApi("PUT", "/V1/users/me/signature", {
        token: staff.token,
        body: signatureForm(await signatureImage(), { method: "upload", password: "Staff@2026" }),
    });
    assert.equal(staffSigned.status, 200, JSON.stringify(staffSigned.body));

    const viewByAdmin = await api.callApi("GET", `/V1/users/${staff.userId}/signature`);
    assert.equal(viewByAdmin.body.signature.sig_id, staffSigned.body.signature.sig_id);

    // ผู้ช่วยแอดมินที่มีสิทธิ์แก้ผู้ใช้ แต่สิทธิ์ต่ำกว่าแอดมิน → ยกเลิกของแอดมินไม่ได้
    await api.callApi("PUT", "/V1/users/me/signature", {
        body: signatureForm(await signatureImage(), { method: "upload", password: SEED_ADMIN.newPassword }),
    });
    const helper = await createUser("helper.test", ["dashboard", "usersManagement", "editUsers"]);
    const revokeAdmin = await api.callApi("DELETE", `/V1/users/${SEED_ADMIN.userId}/signature`, {
        token: helper.token,
    });
    assert.equal(revokeAdmin.status, 403);
    // ไม่มีสิทธิ์แก้ผู้ใช้เลย
    const noPermission = await api.callApi("DELETE", `/V1/users/${staff.userId}/signature`, { token: staff.token });
    assert.equal(noPermission.status, 403);

    const revokeStaff = await api.callApi("DELETE", `/V1/users/${staff.userId}/signature`);
    assert.equal(revokeStaff.status, 204);
    const [[revoked]] = await api.pool.query("SELECT sig_revoked_by FROM tb_user_signatures WHERE sig_id = ?", [
        staffSigned.body.signature.sig_id,
    ]);
    assert.equal(revoked.sig_revoked_by, SEED_ADMIN.userId);

    const deleteStaff = await api.callApi("DELETE", `/V1/users/${staff.userId}`);
    assert.equal(deleteStaff.status, 409);
    assert.equal(deleteStaff.body.code, "USER_HAS_HISTORY");
});

test("ลายเซ็นเข้า audit log โดยไม่เก็บรูปและรหัสผ่าน", async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const [rows] = await api.pool.query(
        "SELECT aud_action, aud_payload FROM tb_audit_logs WHERE aud_path LIKE '/users/%signature' AND aud_success = 1",
    );
    const actions = new Set(rows.map((row) => row.aud_action));
    for (const expected of ["ตั้งลายเซ็นของตัวเอง", "ยกเลิกลายเซ็นของตัวเอง", "ยกเลิกลายเซ็นของผู้ใช้"]) {
        assert.ok(actions.has(expected), `ไม่พบ "${expected}" (มี: ${[...actions].join(", ")})`);
    }
    const payloads = rows.map((row) => JSON.stringify(row.aud_payload ?? "")).join(" ");
    assert.ok(!payloads.includes(SEED_ADMIN.newPassword));
    assert.ok(!payloads.includes("Staff@2026"));
});
