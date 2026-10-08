// จำกัดการเดารหัสผ่าน — นับเฉพาะ login ที่ "ล้มเหลว" (ตอบ 401) ภายในหน้าต่างเวลา
// เก็บในหน่วยความจำของ process เดียว (พอสำหรับ backend ที่รัน instance เดียวบน Plesk) รีสตาร์ทแล้วตัวนับหาย ซึ่งรับได้
// นับสองแบบคู่กัน:
// - ต่อบัญชี (อีเมล): กันเดารหัสของบัญชีเดียว — ไม่ผูกกับ IP เพราะหน้าเว็บ login ผ่าน server action ของ Next
//   (request มาจากเซิร์ฟเวอร์ frontend เสมอ IP เลยเป็นของเซิร์ฟเวอร์ ไม่ใช่ของผู้ใช้จริง)
// - ต่อ IP: กันคนยิงตรงมาที่ backend ไล่เดาหลายบัญชี — เพดานสูงมากเพราะทุก login จากหน้าเว็บนับรวมใน IP ของ frontend ตัวเดียว
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_ACCOUNT = 10;
const MAX_FAILS_PER_IP = 200;

const failures = new Map(); // key -> { count, resetAt }

function getEntry(key, now) {
    const entry = failures.get(key);
    if (!entry || entry.resetAt <= now) return null;
    return entry;
}

function recordFailure(key, now) {
    const entry = getEntry(key, now);
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
}

// ล้างรายการที่หมดอายุทิ้งเป็นระยะ กัน Map โตไม่หยุด
setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of failures) {
        if (entry.resetAt <= now) failures.delete(key);
    }
}, WINDOW_MS).unref();

function loginRateLimit(req, res, next) {
    const now = Date.now();
    // นับต่อสิ่งที่พิมพ์ในช่อง login (อีเมลหรือชื่อผู้ใช้) — ตรงกับที่ auth.controller ใช้หาบัญชี
    const email = String(req.body?.login ?? req.body?.user_email ?? "").trim().toLowerCase();
    const ipKey = `ip:${req.ip}`;
    const accountKey = `acct:${email}`;

    const blocked = [
        [getEntry(accountKey, now), MAX_FAILS_PER_ACCOUNT],
        [getEntry(ipKey, now), MAX_FAILS_PER_IP],
    ].find(([entry, max]) => entry && entry.count >= max);

    if (blocked) {
        const retryAfterSec = Math.ceil((blocked[0].resetAt - now) / 1000);
        res.set("Retry-After", String(retryAfterSec));
        return res.status(429).json({
            message: `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณาลองใหม่ในอีก ${Math.ceil(retryAfterSec / 60)} นาที`,
        });
    }

    res.on("finish", () => {
        if (res.statusCode === 401) {
            const t = Date.now();
            recordFailure(accountKey, t);
            recordFailure(ipKey, t);
        } else if (res.statusCode === 200) {
            failures.delete(accountKey);
        }
    });

    next();
}

// ขอรหัส OTP ยืนยันอีเมล: จำกัดต่อ "ผู้ใช้ที่ login อยู่" (ต้องอยู่หลัง requireAuth)
// คนละมิติกับเพดาน 5 ครั้ง/ชม./อีเมล ใน emailOtp.js — อันนั้นกันสแปมกล่องเมลเดียว อันนี้กันคนที่มีบัญชีในระบบ
// ใช้ปุ่มขอรหัสไล่ยิงเมลไปหาอีเมลคนอื่นทีละหลายๆ ที่อยู่ (นับทุกครั้งที่ขอ ไม่ใช่แค่ครั้งที่ล้มเหลว)
const OTP_WINDOW_MS = 60 * 60 * 1000;
const MAX_OTP_REQUESTS_PER_USER = 10;

function otpRequestRateLimit(req, res, next) {
    const now = Date.now();
    const key = `otp:${req.user?.user_id}`;
    const entry = getEntry(key, now);
    if (entry && entry.count >= MAX_OTP_REQUESTS_PER_USER) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        res.set("Retry-After", String(retryAfterSec));
        return res.status(429).json({
            message: `ขอรหัสยืนยันบ่อยเกินไป กรุณาลองใหม่ในอีก ${Math.ceil(retryAfterSec / 60)} นาที`,
        });
    }
    if (entry) entry.count += 1;
    else failures.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
    next();
}

module.exports = { loginRateLimit, otpRequestRateLimit };
