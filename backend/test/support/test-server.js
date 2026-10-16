// เซิร์ฟเวอร์สำหรับเทสต์ระดับ API (2026-10-13)
//
// - สร้างฐานข้อมูลชั่วคราวจาก database/query/deploy_schema.sql แล้วลบทิ้งตอนจบ — ไม่แตะฐานข้อมูลที่ใช้งานอยู่
// - ปิด SMTP เสมอ: .env บนเครื่อง dev มีบัญชีอีเมลจริง ถ้าไม่ปิด เทสต์ที่เรียก endpoint ส่งอีเมลจะส่งอีเมลจริงออกไป
// - ไฟล์รูปที่อัปโหลดระหว่างเทสต์ถูกลบทิ้งตอนจบ ไม่ให้ค้างในโฟลเดอร์ uploads/
// - ไม่เรียก API ธปท. จริง (ล้างคีย์) และเก็บลายเซ็นในโฟลเดอร์ชั่วคราว
//
// ไฟล์นี้ไม่ได้ลงท้ายด้วย .test.js จึงไม่ถูกรันเป็นเทสต์เอง

const fs = require("fs");
const os = require("os");
const path = require("path");
const mysql = require("mysql2/promise");

const BACKEND_DIR = path.join(__dirname, "..", "..");
const DEPLOY_SCHEMA_PATH = path.join(BACKEND_DIR, "..", "database", "query", "deploy_schema.sql");
const UPLOADS_DIR = path.join(BACKEND_DIR, "uploads");

const SEED_ADMIN = {
    userId: "USE202601010000001",
    roleId: "ROL202601010000001",
    login: "admin",
    password: "Admin@12345",
    newPassword: "NewAdmin@2026",
};

function prepareEnvironment(databaseName) {
    require("dotenv").config({ path: path.join(BACKEND_DIR, ".env"), quiet: true });
    process.env.DB_NAME = databaseName;
    process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-that-is-long-enough-for-jwt-signing";
    process.env.SMTP_USER = "";
    process.env.SMTP_PASS = "";
    // ไม่ยิง ธปท. จริงจากเทสต์ (.env เครื่อง dev อาจมีคีย์จริง) — เทสต์ที่ต้องใช้ตั้ง BOT_API_URL ไปเซิร์ฟเวอร์จำลองเอง
    process.env.BOT_API_KEY = "";
    process.env.BOT_API_URL = "";
    // ลายเซ็นเขียนลงโฟลเดอร์ชั่วคราวของเทสต์นี้ ลบทิ้งตอนจบ
    process.env.SIGNATURE_STORAGE_DIR = path.join(os.tmpdir(), `softwork-test-signatures-${databaseName}`);
    // ไฟล์เอกสารส่วนตัว (50 ทวิ) ก็เช่นกัน
    process.env.DOCUMENT_STORAGE_DIR = path.join(os.tmpdir(), `softwork-test-documents-${databaseName}`);
}

function listUploadedFiles() {
    if (!fs.existsSync(UPLOADS_DIR)) return new Set();
    const files = new Set();
    for (const entry of fs.readdirSync(UPLOADS_DIR, { recursive: true, withFileTypes: true })) {
        if (entry.isFile()) files.add(path.join(entry.parentPath ?? entry.path, entry.name));
    }
    return files;
}

async function createTestDatabase(databaseName) {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        multipleStatements: true,
    });
    await connection.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE \`${databaseName}\``);
    await connection.query(fs.readFileSync(DEPLOY_SCHEMA_PATH, "utf8"));
    return connection;
}

// เริ่มเซิร์ฟเวอร์บนฐานข้อมูลชั่วคราว แล้วคืนตัวช่วยสำหรับยิง API
// ต้องเรียกก่อน require ส่วนอื่นของ src/ เพราะ config/db อ่านชื่อฐานข้อมูลตอนโหลดไฟล์
async function startTestServer(name) {
    const databaseName = `tmp_test_${name}_${process.pid}`;
    prepareEnvironment(databaseName);

    const uploadsBefore = listUploadedFiles();
    const setupConnection = await createTestDatabase(databaseName);

    const app = require("../../src/app");
    const pool = require("../../src/config/db");
    const server = await new Promise((resolve) => {
        const listening = app.listen(0, () => resolve(listening));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    let defaultToken = null;

    // body เป็น object = ส่ง JSON · เป็น FormData = ส่งแบบ multipart (อัปโหลดไฟล์)
    async function callApi(method, url, { body, token = defaultToken } = {}) {
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

    async function login(loginName, password) {
        const response = await callApi("POST", "/V1/auth/login", {
            token: null,
            body: { login: loginName, user_password: password },
        });
        if (response.status !== 200) throw new Error(`login ไม่สำเร็จ: ${JSON.stringify(response.body)}`);
        return response.body.token;
    }

    // seed admin ถูกบังคับเปลี่ยนรหัสผ่านตอนเข้าครั้งแรก — ทำให้ครบ แล้วใช้ token นี้เป็นค่าเริ่มต้นของ callApi
    async function loginAsAdmin() {
        const token = await login(SEED_ADMIN.login, SEED_ADMIN.password);
        const changed = await callApi("PUT", "/V1/users/me/password", {
            token,
            body: { new_password: SEED_ADMIN.newPassword },
        });
        if (changed.status !== 200) throw new Error(`เปลี่ยนรหัสผ่าน admin ไม่สำเร็จ: ${JSON.stringify(changed.body)}`);
        defaultToken = token;
        return token;
    }

    async function stop() {
        await new Promise((resolve) => server.close(resolve));
        await pool.end();
        await setupConnection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
        await setupConnection.end();

        for (const file of listUploadedFiles()) {
            if (!uploadsBefore.has(file)) fs.rmSync(file, { force: true });
        }
        fs.rmSync(process.env.SIGNATURE_STORAGE_DIR, { recursive: true, force: true });
        fs.rmSync(process.env.DOCUMENT_STORAGE_DIR, { recursive: true, force: true });
    }

    return { baseUrl, pool, setupConnection, callApi, login, loginAsAdmin, stop };
}

// รูป PNG เล็กๆ สำหรับเทสต์อัปโหลด
async function createTestImage() {
    const sharp = require("sharp");
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#3b82f6" } })
        .png()
        .toBuffer();
    return new Blob([png], { type: "image/png" });
}

module.exports = { startTestServer, createTestImage, SEED_ADMIN };
