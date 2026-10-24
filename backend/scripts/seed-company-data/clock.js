// นาฬิกาจำลองสำหรับสคริปต์ใส่ข้อมูล — เลื่อน "วันนี้" ของระบบไปวันในอดีตได้ เอกสารจึงได้วันที่และเลขที่ตามจริงของแต่ละเดือน
// ต้องติดตั้งก่อน require โค้ดของระบบ (ทุกที่ที่เรียก new Date() / Date.now() ได้เวลาจำลอง)
// เวลาที่ MySQL ใส่เอง (DEFAULT CURRENT_TIMESTAMP / NOW()) ตามนาฬิกาจำลองด้วย attachMysqlClock (SET TIMESTAMP ทุกคำสั่ง · 2026-10-24)
// เดิมเป็นเวลาจริง ทำให้แชต/issue/คำขอ ขึ้นวันที่รันสคริปต์แทนวันในเรื่อง
const RealDate = Date;
let offsetMs = 0;

class SimulatedDate extends RealDate {
    constructor(...args) {
        if (args.length === 0) super(RealDate.now() + offsetMs);
        else super(...args);
    }

    static now() {
        return RealDate.now() + offsetMs;
    }
}

function installClock() {
    global.Date = SimulatedDate;
}

/**
 * ตั้งวันนี้ (เวลาไทย) — เช่น setToday("2026-05-04", 10) = 4 พ.ค. 2026 10:00 น. · setToday("2026-06-02", 8, 47) = 08:47 น.
 * วินาทีเดินต่อจากนั้นตามเวลาจริง
 */
function setToday(dateText, hourBangkok = 10, minute = 0) {
    const [year, month, day] = dateText.split("-").map(Number);
    const target = RealDate.UTC(year, month - 1, day, hourBangkok - 7, minute, 0);
    offsetMs = target - RealDate.now();
}

function simulatedNowMs() {
    return RealDate.now() + offsetMs;
}

/**
 * ให้ NOW() / CURRENT_TIMESTAMP ของ MySQL เป็นเวลาจำลอง — ส่ง SET TIMESTAMP ก่อนทุกคำสั่งบนการเชื่อมต่อเดียวกัน
 * (pool.query/execute ยืมการเชื่อมต่อเอง · getConnection = ตั้งครั้งเดียวตอนยืม ใช้ทั้ง transaction)
 * @param {import("mysql2/promise").Pool} pool
 */
function attachMysqlClock(pool) {
    const borrow = pool.getConnection.bind(pool);
    const stamp = (connection) => connection.query("SET TIMESTAMP = ?", [simulatedNowMs() / 1000]);
    pool.getConnection = async () => {
        const connection = await borrow();
        await stamp(connection);
        return connection;
    };
    for (const method of ["query", "execute"]) {
        pool[method] = async (...args) => {
            const connection = await borrow();
            try {
                await stamp(connection);
                return await connection[method](...args);
            } finally {
                connection.release();
            }
        };
    }
}

function resetClock() {
    offsetMs = 0;
}

module.exports = { installClock, setToday, resetClock, simulatedNowMs, attachMysqlClock };
