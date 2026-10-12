// วันที่และเวลาไทยที่เดียวทั้งระบบ (2026-10-12, docs/plans/2026-10-12-risk-fixes.md R2)
//
// ห้ามใช้ getFullYear()/getMonth()/getDate()/getHours() ของ Date ตรงๆ เพราะค่าที่ได้ขึ้นกับ timezone ของเครื่อง:
// เครื่อง dev ตั้งเวลาไทย แต่เซิร์ฟเวอร์ production อาจเป็น UTC → ช่วง 00:00–07:00 ตามเวลาไทย จะได้วันที่ของเมื่อวาน
// (มีเทสต์ test/no-local-date-getters.test.js สแกนทั้ง src/ กันไว้ ไฟล์นี้เป็นที่เดียวที่ได้รับยกเว้น)
//
// ประเทศไทยไม่มีเวลาออมแสง จึงเป็น UTC+7 ตลอดปี แต่ยังใช้ Intl กับชื่อ timezone แทนการบวก 7 ชั่วโมงเอง
// อ่านแล้วเข้าใจทันทีว่าตั้งใจใช้เวลาไทย และไม่ต้องแก้ถ้าวันหนึ่งกติกาเปลี่ยน

const BANGKOK_TIME_ZONE = "Asia/Bangkok";

// en-CA ให้ลำดับ ปี-เดือน-วัน · hourCycle h23 ให้เที่ยงคืนเป็น "00" ไม่ใช่ "24"
const bangkokFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
});

function getBangkokParts(date) {
    const parts = {};
    for (const part of bangkokFormatter.formatToParts(date)) {
        if (part.type !== "literal") parts[part.type] = part.value;
    }
    return parts;
}

// "2026-10-12"
function todayBangkok(now = new Date()) {
    const { year, month, day } = getBangkokParts(now);
    return `${year}-${month}-${day}`;
}

// "20261012" — ส่วนวันที่ของ id 18 ตัว (generateDailyId) และเลขที่เอกสาร
function compactDateBangkok(date = new Date()) {
    const { year, month, day } = getBangkokParts(date);
    return `${year}${month}${day}`;
}

// { year: 2026, month: 10 } — ใช้หาเดือนปัจจุบัน เช่น ค่าเริ่มต้นของช่วง KPI ในแดชบอร์ด
function currentYearMonthBangkok(now = new Date()) {
    const { year, month } = getBangkokParts(now);
    return { year: Number(year), month: Number(month) };
}

// "2026-10-12 08:30:00" — สำหรับ log
function nowBangkokText(now = new Date()) {
    const { year, month, day, hour, minute, second } = getBangkokParts(now);
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

module.exports = { BANGKOK_TIME_ZONE, todayBangkok, compactDateBangkok, currentYearMonthBangkok, nowBangkokText };
