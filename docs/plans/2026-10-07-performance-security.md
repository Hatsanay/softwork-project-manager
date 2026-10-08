# แผน: ปรับ performance และ security (7 ต.ค. 2026)

สถานะ: **ทำเสร็จและทดสอบบนเครื่องแล้ว ยังไม่ได้ deploy**

## เป้าหมาย
ปิดช่องโหว่ที่เจอจากการอ่านโค้ด และลดจำนวน query ต่อ request โดยไม่เปลี่ยนพฤติกรรมที่ผู้ใช้เห็น (ยกเว้นข้อ S2)

## Security
- [x] S1 กันการเข้าถึงข้ามโปรเจกต์: middleware `requireTaskInProject` / `requireIssueInProject` / `requireMemberInProject` ตรวจว่า id ที่อ้างใน URL อยู่ในโปรเจกต์นั้นจริง ถ้าไม่อยู่ตอบ 404
      (ก่อนแก้: แชทและอ่านหรือตอบปัญหาใน task ของโปรเจกต์อื่นได้, ลบ task ข้ามโปรเจกต์ได้, แก้ตำแหน่งสมาชิกข้ามโปรเจกต์ได้, สร้าง subtask ไว้ใต้ task ของโปรเจกต์อื่นได้)
- [x] S2 ผู้ที่ไม่ใช่สมาชิกแต่มี `viewAllProjects` อ่านได้อย่างเดียว: ส่งแชท ตอบปัญหา และกดรับงาน ต้องเป็นสมาชิกจริง (`requireRealMember`)
- [x] S3 `auth/verifyPermission` คืนเฉพาะสิทธิ์ของ role ตัวเอง
- [x] S4 จำกัด login ผิด: 10 ครั้งต่อบัญชี และ 200 ครั้งต่อ IP ใน 15 นาที แล้วตอบ 429 (หน้า login แสดงข้อความว่าต้องรอกี่นาที)
- [x] S5 security headers ทั้ง backend (`app.js`) และ frontend (`next.config.ts`), ปิด `X-Powered-By`
- [x] S6 error 500 ไม่ส่งข้อความภายในออกไป, error จากการอัปโหลดตอบ 400 พร้อมข้อความภาษาไทย, จำกัดขนาด JSON body 1 MB
- [x] S7 JWT ล็อก algorithm HS256 (token ปลอมแบบ `alg: none` ถูกปฏิเสธ), ไม่มี `JWT_SECRET` แล้วเซิร์ฟเวอร์ไม่ยอม start, ถ้า secret อ่อนจะแสดงคำเตือน
- [x] S8 `generateDailyId` ล็อกแถวใน `tb_maxID` ระหว่างออก id (ทดสอบออก 40 id พร้อมกัน ไม่ซ้ำเลย)
- [x] S9 อัปเดต dependency ที่มีช่องโหว่: backend (proxy-addr critical, sharp, multer, nodemailer 9→10, express ฯลฯ), frontend (next 16.2.10 → 16.4.0 critical) ผลคือ `npm audit` ไม่เหลือช่องโหว่ใน production deps

## Performance
- [x] P1 `requireAuth` ดึง role_permission มาใน query เดียว แล้ว middleware/controller ใช้ซ้ำ
- [x] P2 สิทธิ์ตำแหน่งในโปรเจกต์คำนวณครั้งเดียวต่อ request (`req.projectPermission`) และเช็คบิตก่อน แล้วค่อย query ผู้รับผิดชอบเฉพาะตอนจำเป็น
- [x] P3 dashboard summary ยิง 11 query พร้อมกัน และดึง preview ข้อความล่าสุดของแชทพร้อมกัน (เดิมยิงทีละตัว + N+1 สูงสุด 20 ครั้ง)
- [x] P4 index เพิ่ม 5 ตัว (อยู่ใน `database/query/deploy_schema.sql` แล้ว รันบน DB ในเครื่องแล้ว)
- [x] P5 gzip response ของ backend (`compression`)
- [x] P6 รูปใน `/uploads` ส่ง cache header 30 วัน + immutable
- [x] P7 แชท: หยุด polling ตอนแท็บถูกซ่อน และไม่ re-render ทั้งหน้าถ้าไม่มีข้อความใหม่ (เดิม re-render หน้า 2,800 บรรทัดทุก 4 วินาที และกระตุก scroll ลงล่าง)

## การทดสอบ (บนเครื่อง)
- เทสต์ API แบบไม่ทำลายข้อมูล 19 ข้อผ่านหมด (ข้ามโปรเจกต์ → 404, โปรเจกต์ตัวเอง → 200, my-permissions ตรงกับ DB, dashboard ครบทุก key, rate limit, alg=none)
- ข้อ S2 ยังไม่ได้ทดสอบอัตโนมัติ เพราะใน DB ของเครื่องไม่มี user ที่มี viewAllProjects แต่ไม่ได้เป็นสมาชิกโปรเจกต์
- `tsc` และ `next build` บน 16.4.0 ผ่าน
- **ยังไม่ได้คลิกทดสอบในเบราว์เซอร์**

## ยังไม่ทำ (งานใหญ่ ต้องตัดสินใจก่อน)
- ย้าย token ออกจาก `localStorage` ให้เหลือแค่ httpOnly cookie (ต้องแก้ทุกหน้าที่ fetch API)
- ใส่ `secure` ให้ cookie (ต้องยืนยันก่อนว่า production ตั้ง NODE_ENV และใช้ https ทุกทาง)
- เช็คว่า assignee / ผู้ถูกแท็ก ที่ส่งมาเป็นสมาชิกโปรเจกต์นั้นจริง
- แยก component ของ `projects/view/page.tsx` / `dashboard/page.tsx`

## Checklist ตอน deploy
1. Plesk → backend: **NPM install** (มี `compression` ใหม่ และ nodemailer 10) แล้ว Restart
2. Plesk → frontend: NPM install → build → Restart เหมือนเดิม (Next 16.4.0)
3. รัน `database/query/deploy_schema.sql` บน DB ของ production (ทำทุกครั้งที่ deploy ได้เลย รันซ้ำได้)
4. เช็ค `JWT_SECRET` ใน `.env` ของ production ว่ายาวพอ (ถ้า log ขึ้น `[security] JWT_SECRET สั้น...` ให้เปลี่ยน ทุกคนจะต้อง login ใหม่หนึ่งครั้ง)
5. Node.js บน Plesk ต้อง ≥ 20.9 (sharp ต้องการอยู่แล้ว)
