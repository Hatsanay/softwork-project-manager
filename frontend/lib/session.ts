// token เข้าระบบฝั่งเบราว์เซอร์ (2026-11-02 · docs/plans/2026-11-02-permission-audit.md A-1)
//
// token อยู่สองที่: localStorage (หน้าเว็บใช้เรียก API) และ cookie httpOnly (server component / proxy ใช้)
// เปลี่ยนรหัสผ่านหรือออกจากระบบเครื่องอื่น backend ยกเลิก token เดิมแล้วส่ง token ใหม่มา → ต้องเปลี่ยนทั้งสองที่
// ออกจากระบบ → ลบ token ใน localStorage ด้วย (cookie ลบที่ server action logout)
import { storeSessionToken } from "@/app/login/actions";

/** เก็บ token ใหม่แทนของเดิม · false = backend ไม่รับ token นี้ (ให้ผู้ใช้เข้าสู่ระบบใหม่) */
export async function saveSessionToken(token: string): Promise<boolean> {
    try {
        localStorage.setItem("token", token);
    } catch {
        // เบราว์เซอร์ปิด storage: cookie ยังใช้ได้กับหน้าที่อ่านจาก server
    }
    return storeSessionToken(token);
}

/** ลบ token ในเบราว์เซอร์ (ตอนออกจากระบบ / token ถูกยกเลิก) */
export function clearLocalSession() {
    try {
        localStorage.removeItem("token");
    } catch {
        // ไม่มี storage ก็ไม่มีอะไรให้ลบ
    }
}
