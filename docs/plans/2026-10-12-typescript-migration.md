# แผนรอบ 0T: ย้าย backend เป็น TypeScript + ตั้งเครื่องมือสไตล์โค้ด — 12 ต.ค. 2026

สถานะ: **ยกเลิก 13 ต.ค. 2026 — เจ้าของระบบตัดสินใจให้ backend ใช้ JavaScript ต่อ** (เริ่มไปแค่ T1–T2 แล้วย้อนกลับ)

> สิ่งที่เก็บไว้จากรอบนี้: เทสต์ครอบ API ทุกเส้นทาง + ต้นแบบรูปร่างคำตอบ (T1: `backend/test/api-routes.test.js`, `test/support/`, `test/snapshots/`),
> Prettier + `npm run format:changed`, `.editorconfig`, `.gitattributes` · ข้อมูลที่ได้: Passenger บน Plesk เปิด ES module ตรงๆ ไม่ได้ (ต้องใช้ไฟล์เริ่มต้น .cjs) — ใช้ประกอบการตัดสินใจเรื่อง shared ใน 1A
ที่มา: การตัดสินใจเรื่องสไตล์ 12 ต.ค. 2026 ใน [CODING_GUIDELINES.md](../CODING_GUIDELINES.md)
ลำดับรอบ: **0R (แก้บั๊กระบบเดิม, JS) → 0T (รอบนี้) → 1A (ใบเสนอราคา เขียนเป็น TS ตั้งแต่แรก)**
เหตุผลที่ 0R มาก่อน: เป็นบั๊กที่มีอยู่จริงบน production แก้เล็ก deploy ได้เร็ว ไม่ต้องรอการย้ายภาษา

## เป้าหมาย
พฤติกรรมของระบบ **ไม่เปลี่ยนเลย** (ทุก endpoint ตอบเหมือนเดิมทุกไบต์ ยกเว้นรูปแบบ error ที่ตกลงใหม่) แต่ backend เป็น TypeScript strict ทั้งหมด

## ขั้นตอน
| ขั้น | งาน | ผ่านเมื่อ |
|---|---|---|
| T1 | **เทสต์กันถอยหลังก่อนแตะโค้ด**: ชุด API end-to-end ครอบทุก 85 เส้นทาง (สิทธิ์ผ่าน/ไม่ผ่าน, รูปแบบ response) + เก็บผลตอบจากโค้ด JS เดิมไว้เทียบ | รันผ่านกับโค้ด JS เดิม |
| T2 | เครื่องมือ: `.editorconfig`, `.gitattributes` (LF), Prettier config, สคริปต์ `format:changed` · ขออนุมัติ+ติดตั้ง `typescript`, `prettier`, `zod`, `@types/node`, `@types/express`, `@types/multer`, `@types/cors`, `@types/morgan`, `@types/jsonwebtoken`, `@types/bcryptjs`, `@types/nodemailer`, `@types/compression` | `npm run typecheck` ทำงาน |
| T3 | `tsconfig.json` (strict, ESM `module: nodenext`, `outDir: dist`, `rewriteRelativeImportExtensions`), สคริปต์ `dev` (`node --watch src/server.ts`), `build` (`tsc`), `start` (`node dist/server.js`), `test` | server ว่างเปล่ารันได้ทั้ง dev และ build |
| T4 | แปลงทีละชั้นจากล่างขึ้นบน: utils → config → middlewares → controllers → routes (แยกไฟล์ต่อโมดูล) → app/server · `require` → `import` · เติมชนิด · ชนิดแถวของทุกตาราง | `typecheck` ผ่าน + เทสต์ T1 ผ่านหลังแปลงแต่ละชั้น |
| T5 | ของกลางใหม่: `AppError` + error middleware รูปแบบใหม่, `withTransaction`, `asyncHandler`, `validate(zod)`, `shared/` + `sync-shared` + เทสต์ตรวจตรงกัน, ย้าย `permissions` และ `money` เข้า shared | เทสต์หน่วยเดิม 11 ตัว + ใหม่ผ่าน |
| T6 | frontend: `lib/api.ts` (`apiFetch`) อ่านรูปแบบ error ใหม่ (และรูปแบบเก่าด้วยระหว่างช่วงเปลี่ยน) · `bit.tsx` อ่านลำดับบิตจาก `lib/shared/permissions.ts` | หน้าเดิมทุกหน้าทำงาน + ภาพหน้าจอ |
| T7 | แปลงโค้ดร่าง ERP ใน working tree (money, documentNumber, company/product controller ...) เป็น TS ตามโครงใหม่ — ยังไม่เปิดใช้ endpoint ERP | typecheck ผ่าน |
| T8 | ทดลอง build แบบ Plesk (Linux) ผ่าน WSL: `npm ci` → `npm run build` → `node dist/server.js` · อัปเดต `deploy.bat` + คู่มือ deploy | รันบน Linux ได้ |

## จุดเสี่ยงเฉพาะรอบนี้
| # | ความเสี่ยง | ป้องกัน |
|---|---|---|
| T-R1 | Plesk ตั้ง `NODE_ENV=production` → `npm install` ไม่ติดตั้ง devDependencies → ไม่มี `tsc` build ล้ม | ทดสอบใน T8 · ถ้าเป็นแบบนั้นย้าย `typescript` + `@types/*` ไป `dependencies` |
| T-R2 | Plesk ชี้ startup file ไปที่ `src/server.js` (ไฟล์เดิม) — หลังย้ายไฟล์นี้หายไป → แอปไม่ขึ้น | **งานผู้ใช้ตอน deploy ครั้งแรก**: เปลี่ยน startup file เป็น `dist/server.js` + เพิ่ม Run script `build` (จดในคู่มือ deploy ทีละขั้นพร้อมภาพ) |
| T-R3 | ES module ไม่มี `__dirname`/`require` — โค้ดหาโฟลเดอร์ `uploads/` จะพัง | ใช้ `import.meta.dirname` (มีตั้งแต่ Node 20.11 — Plesk เป็น 23.11.1 ใช้ได้) |
| T-R9 | **Plesk ใช้ Node 23.11.1 ซึ่งเป็นรุ่นเลขคี่ (ไม่ใช่ LTS) หมดระยะซัพพอร์ตตั้งแต่ 1 มิ.ย. 2025** — ไม่ได้รับแพตช์ความปลอดภัยแล้ว · และเครื่อง dev เป็น 24.14 → โค้ดที่ผ่านบนเครื่องเราอาจใช้ API ที่ 23 ไม่มี | **ตัดสินใจ 12 ต.ค. 2026: เจ้าของระบบเลือกใช้ Node 23 ต่อ** (ทราบแล้วว่าไม่ได้แพตช์ความปลอดภัย — 22 LTS เป็นทางเลือกที่เสนอไว้) · เครื่อง dev ใช้ **23.11.1 ตรงกับ Plesk** · `engines` + `.nvmrc` ระบุ 23.11 · ห้ามใช้ความสามารถที่มีเฉพาะ Node 24 · ลดความเสี่ยง: อัปเดต npm dependency สม่ำเสมอ, ขอผู้ให้บริการติดตั้ง Node 24 แล้วย้ายทันทีที่มี |
| T-R4 | ชนิดของ `mysql2` ทำให้ DECIMAL เป็น number โดยไม่ตั้งใจ / DATE เป็น Date | ประกาศชนิดแถวตามจริง (DECIMAL = string) + เทสต์ T1 เทียบผลตอบ |
| T-R5 | เปลี่ยนรูปแบบ error ทำให้หน้าเดิมที่อ่าน `message` พัง | รูปแบบใหม่ยังมี `message` ที่ระดับบนเหมือนเดิม — หน้าเดิมทำงานต่อได้ทันที |
| T-R6 | `.gitattributes` ทำให้ git เห็นไฟล์ CRLF เดิมเป็น "แก้ไข" ทั้งก้อน | ทำ commit แยกเฉพาะการแปลงปลายบรรทัด (เมื่อเจ้าของระบบสั่ง commit) |
| T-R7 | เปลี่ยนชื่อไฟล์เป็นตัวเล็ก-ขีดบน Windows แล้ว git ไม่เห็น | `git mv` สองจังหวะ |
| T-R8 | ระหว่างแปลง working tree ไม่พร้อม deploy นาน (ทำบน master) | แจ้งสถานะ "ยังไม่พร้อม deploy" ทุกครั้งที่ส่งมอบระหว่างรอบ · 0R ต้อง deploy ให้เสร็จก่อนเริ่ม 0T |

## งานของผู้ใช้
- deploy รอบ 0R ให้เสร็จก่อนเริ่ม 0T
- ~~บอกเวอร์ชัน Node บน Plesk~~ → 23.11.1 (12 ต.ค. 2026) · 24 ไม่มีให้เลือก → **เจ้าของระบบเลือกคง Node 23** · เปิด ticket ขอผู้ให้บริการโฮสติ้งติดตั้ง Node 24 แล้วย้ายเมื่อมี
- ตอน deploy 0T ครั้งแรก: เปลี่ยน startup file + เพิ่ม Run script `build` ตามคู่มือ
