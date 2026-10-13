// ตอน dev ตั้ง NEXT_PUBLIC_API_URL=http://localhost:3003/api/V1 ไว้ใน frontend/.env.local (ไฟล์นี้ไม่ถูก commit)
// production (Plesk build) ไม่มีไฟล์นั้น เลยใช้ค่า default ด้านล่าง — ไม่ต้องสลับบรรทัดเองก่อน deploy อีก
// frontend บนเครื่องห้ามชี้ไป backend จริง เพราะ CORS ของ backend จริงรับแค่ https://softwork.fasttiw.com
const api = process.env.NEXT_PUBLIC_API_URL ?? "https://softworkbackend.fasttiw.com/api/V1";


// สีและหน้าตาของระบบอยู่ที่ app/globals.css (ธีม) และ components/ui/ (ส่วนประกอบกลาง) — UI ใหม่ 13 ต.ค. 2026

export { api };