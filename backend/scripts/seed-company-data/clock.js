// นาฬิกาจำลองสำหรับสคริปต์ใส่ข้อมูล — เลื่อน "วันนี้" ของระบบไปวันในอดีตได้ เอกสารจึงได้วันที่และเลขที่ตามจริงของแต่ละเดือน
// ต้องติดตั้งก่อน require โค้ดของระบบ (ทุกที่ที่เรียก new Date() / Date.now() ได้เวลาจำลอง)
// เวลาในฐานข้อมูลที่ MySQL ใส่เอง (DEFAULT CURRENT_TIMESTAMP / NOW()) ยังเป็นเวลาจริง — ไม่กระทบวันที่ของเอกสาร
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
 * ตั้งวันนี้ (เวลาไทย) — เช่น setToday("2026-05-04", 10) = 4 พ.ค. 2026 10:00 น.
 * นาทีเดินต่อจากนั้นตามเวลาจริง
 */
function setToday(dateText, hourBangkok = 10) {
    const [year, month, day] = dateText.split("-").map(Number);
    const target = RealDate.UTC(year, month - 1, day, hourBangkok - 7, 0, 0);
    offsetMs = target - RealDate.now();
}

function resetClock() {
    offsetMs = 0;
}

module.exports = { installClock, setToday, resetClock };
