// เลขที่เอกสาร — ใช้ฐานข้อมูลชั่วคราวที่สร้างจาก deploy_schema.sql จริง แล้วลบทิ้งตอนจบ
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const { issueDocumentNumber, issueYearlyNumber, toCompactDate } = require("../src/utils/document-number");

require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

const DEPLOY_SCHEMA_PATH = path.join(__dirname, "..", "..", "database", "query", "deploy_schema.sql");
const DATABASE_NAME = `tmp_test_document_number_${process.pid}`;
const SERVER = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
};

let setupConnection;
let pool;

test.before(async () => {
    setupConnection = await mysql.createConnection({ ...SERVER, multipleStatements: true });
    await setupConnection.query(
        `CREATE DATABASE \`${DATABASE_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await setupConnection.query(`USE \`${DATABASE_NAME}\``);
    await setupConnection.query(fs.readFileSync(DEPLOY_SCHEMA_PATH, "utf8"));
    pool = mysql.createPool({ ...SERVER, database: DATABASE_NAME, connectionLimit: 10 });
});

test.after(async () => {
    await pool?.end();
    await setupConnection?.query(`DROP DATABASE IF EXISTS \`${DATABASE_NAME}\``);
    await setupConnection?.end();
});

// ออกเลขใน transaction ของตัวเอง — shouldCommit = false จำลองว่าบันทึกเอกสารไม่สำเร็จ
async function issueInTransaction(documentType, documentDate, shouldCommit = true) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const number = await issueDocumentNumber(conn, documentType, documentDate);
        if (shouldCommit) {
            await conn.commit();
        } else {
            await conn.rollback();
        }
        return number;
    } finally {
        conn.release();
    }
}

test("วันที่เอกสารแปลงเป็น ปีเดือนวัน และต้องเป็นวันที่มีอยู่จริง", () => {
    assert.equal(toCompactDate("2026-12-31"), "20261231");
    assert.equal(toCompactDate("2028-02-29"), "20280229"); // ปีอธิกสุรทิน
    assert.throws(() => toCompactDate("2026-02-29"), /ไม่มีวันที่/);
    assert.throws(() => toCompactDate("2026-02-30"), /ไม่มีวันที่/);
    assert.throws(() => toCompactDate("31/12/2026"), /YYYY-MM-DD/);
    assert.throws(() => toCompactDate("2026-12-31T00:00:00Z"), /YYYY-MM-DD/);
});

test("รูปแบบ 18 ตัว เรียงต่อเนื่อง แยกตามประเภท และรีเซ็ตเมื่อขึ้นวันใหม่", async () => {
    assert.equal(await issueInTransaction("QT", "2026-12-31"), "QT-20261231-000001");
    assert.equal(await issueInTransaction("QT", "2026-12-31"), "QT-20261231-000002");
    assert.equal(await issueInTransaction("IV", "2026-12-31"), "IV-20261231-000001");
    assert.equal(await issueInTransaction("QT", "2027-01-01"), "QT-20270101-000001");
    assert.equal((await issueInTransaction("QT", "2026-12-31")).length, 18);
});

test("บันทึกเอกสารไม่สำเร็จ (rollback) เลขไม่ถูกใช้ · ใบถัดไปไม่ข้ามเลข", async () => {
    assert.equal(await issueInTransaction("BN", "2026-12-31"), "BN-20261231-000001");
    await issueInTransaction("BN", "2026-12-31", false);
    assert.equal(await issueInTransaction("BN", "2026-12-31"), "BN-20261231-000002");
});

test("ออกเลขพร้อมกัน 25 คำขอ ได้เลขไม่ซ้ำและไม่ข้าม", async () => {
    const numbers = await Promise.all(Array.from({ length: 25 }, () => issueInTransaction("RE", "2026-12-31")));
    const expected = Array.from({ length: 25 }, (_, index) => `RE-20261231-${String(index + 1).padStart(6, "0")}`);
    assert.deepEqual([...numbers].sort(), expected);
});

test("ประเภทเอกสารที่ไม่รู้จักถูกปฏิเสธ", async () => {
    await assert.rejects(issueInTransaction("XX", "2026-12-31"), /ไม่รู้จัก/);
});

// เลข 50 ทวิ รันต่อปี (ขั้น 2-4 — R-P3): ไม่รีเซ็ตทุกวัน · ขึ้นปีใหม่เริ่ม 1 · rollback แล้วเลขไม่ข้าม
async function issueYearlyInTransaction(documentDate, shouldCommit = true) {
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const issued = await issueYearlyNumber(conn, "WT", documentDate);
        if (shouldCommit) await conn.commit();
        else await conn.rollback();
        return issued;
    } finally {
        conn.release();
    }
}

test("เลข 50 ทวิ รันต่อปี: วันต่างกันในปีเดียวต่อเนื่อง · 31 ธ.ค. → 1 ม.ค. ขึ้นเล่มใหม่ · rollback ไม่ข้ามเลข", async () => {
    assert.deepEqual(await issueYearlyInTransaction("2026-03-01"), {
        number: "WT-2026-000001",
        year: "2026",
        sequence: 1,
    });
    assert.equal((await issueYearlyInTransaction("2026-12-31")).number, "WT-2026-000002");
    await issueYearlyInTransaction("2026-12-31", false);
    assert.equal((await issueYearlyInTransaction("2026-12-31")).number, "WT-2026-000003", "rollback ไม่ใช้เลข");
    assert.deepEqual(await issueYearlyInTransaction("2027-01-01"), {
        number: "WT-2027-000001",
        year: "2027",
        sequence: 1,
    });
    await assert.rejects(() => issueYearlyNumber(pool, "PV", "2026-12-31"), /ไม่รู้จัก/);
});
