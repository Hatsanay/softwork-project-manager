// ทดสอบลำดับ begin → commit/rollback → release ด้วยการเชื่อมต่อจำลอง (ไม่ต้องมีฐานข้อมูลจริง)
const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../src/config/db");
const { withTransaction } = require("../src/utils/with-transaction");

function useFakeConnection({ failRollback = false } = {}) {
    const calls = [];
    const connection = {
        beginTransaction: async () => calls.push("begin"),
        commit: async () => calls.push("commit"),
        rollback: async () => {
            calls.push("rollback");
            if (failRollback) throw new Error("connection lost");
        },
        release: () => calls.push("release"),
        destroy: () => calls.push("destroy"),
    };
    const originalGetConnection = pool.getConnection;
    pool.getConnection = async () => connection;
    const restore = () => {
        pool.getConnection = originalGetConnection;
    };
    return { calls, connection, restore };
}

test("งานสำเร็จ: commit แล้วคืนการเชื่อมต่อเข้า pool และส่งค่าที่งานคืนออกมา", async () => {
    const fake = useFakeConnection();
    try {
        const result = await withTransaction(async (conn) => {
            assert.equal(conn, fake.connection);
            return 42;
        });
        assert.equal(result, 42);
        assert.deepEqual(fake.calls, ["begin", "commit", "release"]);
    } finally {
        fake.restore();
    }
});

test("งานพัง: rollback แล้วส่ง error เดิมต่อ", async () => {
    const fake = useFakeConnection();
    try {
        await assert.rejects(
            withTransaction(async () => {
                throw new Error("งานพัง");
            }),
            /งานพัง/,
        );
        assert.deepEqual(fake.calls, ["begin", "rollback", "release"]);
    } finally {
        fake.restore();
    }
});

test("rollback ไม่ได้ (สายหลุด): ทิ้งการเชื่อมต่อนั้น ไม่คืนเข้า pool และยังส่ง error เดิม", async () => {
    const fake = useFakeConnection({ failRollback: true });
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
        await assert.rejects(
            withTransaction(async () => {
                throw new Error("งานพัง");
            }),
            /งานพัง/,
        );
        assert.deepEqual(fake.calls, ["begin", "rollback", "destroy"]);
    } finally {
        console.error = originalConsoleError;
        fake.restore();
    }
});
