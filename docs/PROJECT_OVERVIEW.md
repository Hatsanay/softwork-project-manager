# Softwork Project Manager: ภาพรวมโปรเจกต์

> เขียนจากการอ่านโค้ดทั้งหมดใน repo เมื่อ 7 ต.ค. 2026 (commit `93ec93f`)
> ถ้าโค้ดเปลี่ยนแล้วเอกสารนี้ไม่ตรง ให้เชื่อโค้ดเป็นหลัก แล้วอัปเดตเอกสารนี้ตาม

## 1. ระบบนี้คืออะไร

ระบบบริหารโปรเจกต์ภายในบริษัท สำหรับทีมพัฒนาซอฟต์แวร์ที่รับงานจากลูกค้า ทำได้ดังนี้

- **ทีมงานภายใน** สร้างโปรเจกต์ แตกงานเป็น task/subtask มอบหมายคนรับผิดชอบ ติดตามสถานะ แจ้งปัญหา (issue) และแชทคุยกันในแต่ละงาน
- **ลูกค้า** ไม่ต้องมีบัญชี เปิดดูความคืบหน้าโปรเจกต์ผ่านลิงก์ลับ (`/share/[token]`) ที่ทีมส่งให้ทางอีเมลได้
- **หัวหน้า/ผู้บริหาร** ดูแดชบอร์ดภาพรวมทีม, KPI ส่วนตัว และ KPI รายคน (ผู้ใช้เคยระบุว่า KPI นี้ใช้ประกอบการพิจารณาขึ้นเงินเดือน จึงออกแบบสูตรไว้อย่างรอบคอบ ดูหัวข้อ 7)

ภาษาที่ใช้ใน UI, ข้อความ error และคอมเมนต์ในโค้ดเป็นภาษาไทยทั้งหมด

## 2. Tech stack

| ส่วน | เทคโนโลยี |
|---|---|
| Frontend | Next.js **16.4** (App Router), React 19.2, TypeScript, Tailwind CSS v4, `sonner` (toast), `lucide-react` (icon), `react-easy-crop` (ครอปรูปโปรไฟล์), ฟอนต์ Kanit |
| Backend | Node.js + Express 4 (CommonJS), `mysql2/promise`, `jsonwebtoken`, `bcryptjs`, `multer` (อัปโหลด), `sharp` (ย่อรูปเป็น WebP), `nodemailer` (Gmail SMTP), `morgan` |
| Database | MySQL / MariaDB (InnoDB, utf8mb4), ตั้ง timezone `+07:00` ทุก connection |
| Hosting | Plesk (Linux + Passenger) แยก frontend กับ backend เป็นคนละแอป |

> Next.js เวอร์ชันนี้มี breaking changes จากเวอร์ชันที่คุ้นเคย (ดู `AGENTS.md`) เช่น middleware เปลี่ยนชื่อเป็น `proxy.ts` และฟังก์ชันชื่อ `proxy` ก่อนแก้โค้ดให้อ่าน `node_modules/next/dist/docs/` ก่อน

## 3. โครงสร้างโฟลเดอร์

```
softwork-project-manager/
├── backend/                  Express API (พอร์ต 3003)
│   ├── src/
│   │   ├── server.js         จุดเริ่ม: listen + ทดสอบเชื่อม DB
│   │   ├── app.js            ตั้ง cors, json, static /uploads, mount /api
│   │   ├── config/db.js      connection pool + SET time_zone '+07:00'
│   │   ├── routes/index.js   ทุก endpoint อยู่ไฟล์เดียว (prefix /api/V1)
│   │   ├── controllers/      logic ของแต่ละโมดูล (หัวข้อ 8)
│   │   ├── middlewares/      auth, permission, projectPermission, upload, error
│   │   ├── utils/            jwt, generateDailyId, permissions, projectPermissions,
│   │   │                     projectProgress, shareToken, generatePassword, mailer
│   │   └── templates/        task-assigned-preview.html (ตัวอย่างหน้าตาอีเมล)
│   ├── uploads/              ไฟล์รูปที่ผู้ใช้อัปโหลด (avatars/, issues/, task-chat/, ...) ไม่ commit
│   └── .env.example
├── frontend/                 Next.js app (พอร์ต 3000)
│   ├── app/
│   │   ├── page.tsx          หน้าแรก = ฟอร์ม login
│   │   ├── login/            server action handleLogin, getUserProfile
│   │   ├── (protected)/      ทุกหน้าที่ต้อง login (มี layout รวม navbar/sidebar)
│   │   ├── share/[token]/    หน้าสาธารณะสำหรับลูกค้า
│   │   ├── components/       navbar, sidebar, permission-provider, bit.tsx, project-position-bits.ts ...
│   │   ├── constans.tsx      URL ของ API + theme สี
│   │   └── function.tsx      ฟังก์ชันจัดรูปแบบวันที่ (timezone Asia/Bangkok)
│   ├── components/ui/        DataTable, Button, Input, ConfirmDialog, SearchableSelect, AvatarCrop ...
│   ├── proxy.ts              กันหน้า protected: ไม่มี cookie token ให้ redirect ไป /login
│   └── server.js             custom server สำหรับ production (Plesk ใช้เป็น startup file)
├── database/query/
│   ├── create_users_roles.sql       ตารางผู้ใช้/สิทธิ์/แผนก/log + seed admin
│   └── create_project_manager.sql   ตารางโปรเจกต์/งาน/ปัญหา/แชท + seed ตำแหน่ง PM
├── docs/                     เอกสาร + แผนงาน (docs/plans/)
└── deploy.bat                สคริปต์ deploy (หัวข้อ 11)
```

## 4. การรันบนเครื่อง (development)

1. สร้างฐานข้อมูลเปล่า (utf8mb4) แล้วรัน `database/query/deploy_schema.sql` ไฟล์เดียว ได้ทุกตาราง + ข้อมูลเริ่มต้น
2. Backend
   ```bash
   cd backend
   cp .env.example .env     # แก้ DB_*, JWT_SECRET, FRONTEND_URL, SMTP_*
   npm install
   npm run dev              # node --watch, พอร์ต 3003
   ```
3. Frontend
   ```bash
   cd frontend
   npm install
   npm run dev              # พอร์ต 3000
   ```
4. **สำคัญ:** สร้างไฟล์ `frontend/.env.local` ที่มีบรรทัด `NEXT_PUBLIC_API_URL=http://localhost:3003/api/V1` (ไฟล์นี้ไม่ถูก commit) ถ้าไม่มีไฟล์นี้ `constans.tsx` จะใช้ API ของ production ซึ่งจะโดน CORS บล็อก ("Failed to fetch") เพราะ backend จริงรับเฉพาะ origin `https://softwork.fasttiw.com` แก้ `.env.local` แล้วต้องรีสตาร์ท `npm run dev`
5. บัญชีเริ่มต้นจาก seed: `admin@softwork.local` / `Admin@12345` (role Admin เปิดทุกบิต)

ถ้าไม่ตั้งค่า SMTP ระบบยังทำงานได้ อีเมลแจ้งเตือนจะถูกข้ามแล้ว log เตือนไว้ ยกเว้นปุ่ม "ส่งลิงก์ให้ลูกค้าทางอีเมล" ที่จะตอบ error 503 กลับไป

## 5. ฐานข้อมูล

### 5.1 รูปแบบ ID

ทุกตารางใช้ primary key เป็น `VARCHAR(18)` รูปแบบ **PREFIX 3 ตัว + yyyymmdd + เลขรัน 7 หลัก** เช่น `PRO202610070000001`
เลขรันเริ่มนับ 1 ใหม่ทุกวัน แยกต่อตาราง สร้างโดย `backend/src/utils/generateDailyId.js` ซึ่งล็อกแถวของตารางนั้นใน `tb_maxID` (SELECT ... FOR UPDATE) แล้วใช้เลขที่มากกว่าระหว่าง `tb_maxID` กับเลขล่าสุดในตัวตาราง กัน id ซ้ำเวลามีหลาย request พร้อมกัน

prefix ที่ใช้: `ROL` role, `USE` user, `LOG` log, `PRO` project, `MEM` project member, `TAS` task, `POS` position, `IMA` รูปภาพ ฯลฯ

### 5.2 ตารางหลัก

**ผู้ใช้และสิทธิ์ระบบ** (`create_users_roles.sql`)

| ตาราง | หน้าที่ |
|---|---|
| `tb_roles` | role พร้อม `role_permission` (bitmask string), `role_type` = `S` คือ system role ที่ลบไม่ได้ |
| `tb_users` | พนักงาน: อีเมล, bcrypt hash, ชื่อ, เบอร์, LINE UID, WhatsApp, avatar, role, สถานะ active/inactive, `user_must_change_password` |
| `tb_department` | แผนก (role ผูกกับแผนกได้) |
| `tb_login_logs` | log การ login / logout / login_failed เก็บชื่อและอีเมลแบบ snapshot ไว้ ชื่อจึงไม่หายแม้ลบ user ไปแล้ว |
| `tb_maxID` | id ล่าสุดที่ออกต่อตาราง (ไว้ debug) |

**โปรเจกต์และงาน** (`create_project_manager.sql`)

| ตาราง | หน้าที่ |
|---|---|
| `tb_project_positions` | ตำแหน่งในโปรเจกต์ (เช่น PM, Dev) พร้อม `position_permission` (bitmask 29 บิต) ใช้ร่วมกันทุกโปรเจกต์ |
| `tb_clients` | ลูกค้า (ข้อมูลอ้างอิงอย่างเดียว ไม่มีการ login) |
| `tb_projects` | โปรเจกต์: สถานะ, ประเภท `waterfall`/`agile`, วันที่, `project_progress_percent` (cache), `project_share_token`, `project_share_enabled`, `project_use_task_weight`, `project_completed_at` |
| `tb_project_members` | ใครอยู่ในโปรเจกต์ไหน |
| `tb_project_member_positions` | สมาชิกแต่ละคนถือตำแหน่งอะไรในโปรเจกต์นั้น (ถือได้หลายตำแหน่ง) |
| `tb_tasks` | task และ subtask อยู่ตารางเดียวกัน (`task_parent_id`) สถานะ `todo`/`in_progress`/`review`/`done` มี weight และ sort order |
| `tb_task_assignees` | ผู้รับผิดชอบ task (หลายคนต่อ task ได้) |
| `tb_task_issues` (+ `_images`, `_tags`, `_replies`, `_reply_images`, `_reply_reads`) | ปัญหาของ task: สถานะ open/resolved, รูปแนบ, แท็กคน (@), เธรดตอบกลับ, สถานะการอ่าน |
| `tb_task_chat_messages` (+ `_images`, `_reads`) | แชทในแต่ละ task (ตอบกลับข้อความได้ แนบรูปได้) |
| `tb_project_chat_messages` (+ `_images`, `_reads`) | แชทรวมของโปรเจกต์ |
| `tb_task_activity_log` | ประวัติของ task (created / status_changed / edited / assigned) ใช้ทั้งในหน้าโปรเจกต์ หน้าลูกค้า และคำนวณ KPI |

### 5.3 ข้อตกลงที่ควรรู้

- คอลัมน์เวลาของแชทและการอ่านเป็น `DATETIME(3)` (ละเอียดถึงมิลลิวินาที) เพื่อไม่ให้ข้อความที่มาถึงในวินาทีเดียวกับตอนอ่านถูกนับผิด
- `*_completed_at` / `issue_resolved_at` ถูกตั้งค่าครั้งเดียวตอนเปลี่ยนสถานะ (ไม่ใช้ `updated_at`) เพื่อให้ KPI แม่นยำ
- ลบโปรเจกต์แล้ว task, สมาชิก, แชท และปัญหาจะถูกลบตามแบบ cascade แต่ **ไฟล์รูปใน `uploads/` ต้องลบเองในโค้ด**
- **`database/query/deploy_schema.sql` คือแหล่งอ้างอิงหลักของโครงสร้าง DB** รันซ้ำกี่ครั้งก็ได้: กับฐานข้อมูลว่างจะสร้างให้ครบ กับฐานข้อมูลเดิมจะเติมเฉพาะตาราง คอลัมน์ index และ FK ที่ขาด โดยไม่แตะข้อมูล และท้ายไฟล์มี query ตรวจสอบ (ไม่มีแถวผลลัพธ์ = ครบ)
  ทุกครั้งที่แก้โครงสร้าง DB ต้องแก้ไฟล์นี้ตามกติกาที่เขียนไว้ในหัวไฟล์ (ทุกคำสั่งต้องมีเงื่อนไข ห้าม ALTER/DROP ตรงๆ) ส่วน `create_*.sql` เป็นฉบับเดิมไว้อ่านอ้างอิง ให้แก้ตามด้วยเพื่อไม่ให้ขัดกัน

## 6. ระบบสิทธิ์ (หัวใจของระบบ)

สิทธิ์มี **2 ชั้นแยกกัน** ทั้งสองชั้นเก็บเป็น string ของ `'0'`/`'1'` โดยตำแหน่งตัวอักษรคือบิตแต่ละตัว

### 6.1 ชั้นที่ 1: สิทธิ์ระบบ (role) อยู่ใน `tb_roles.role_permission`

ใช้กำหนดว่าเข้าเมนูหรือหน้าไหนได้ มี 27 บิต เรียงตามนี้

```
0 dashboard            7 createProject          14 createDepartment        21 loginLogs
1 usersManagement      8 cancelProject          15 editDepartment          22 clientManagement
2 createUsers          9 roleManagement         16 deleteDepartment        23 createClient
3 editUsers           10 createRole             17 projectPositionMgmt     24 editClient
4 deleteUsers         11 editRole               18 createProjectPosition   25 deleteClient
5 viewAllProjects     12 deleteRole             19 editProjectPosition     26 viewMemberKpi
6 viewOwnProjects     13 departmentManagement   20 deleteProjectPosition
```

ลำดับนี้ต้องตรงกัน **3 ที่**:

- `backend/src/utils/permissions.js` (`PERMISSION_KEYS`)
- `frontend/app/components/bit.tsx` (`MENU_DEFS` / `PERMISSION_GROUPS`)
- ค่า seed ใน SQL

บิตใหม่ให้เพิ่ม **ต่อท้ายเท่านั้น** ถ้าแทรกกลาง สิทธิ์ของทุก role ที่มีอยู่ใน DB จะเลื่อนผิดตำแหน่ง

### 6.2 ชั้นที่ 2: สิทธิ์ในโปรเจกต์ (position) อยู่ใน `tb_project_positions.position_permission`

ใช้กำหนดว่าทำอะไรได้บ้างภายในโปรเจกต์ที่ตัวเองเป็นสมาชิก มี 29 บิต

| กลุ่ม | บิต |
|---|---|
| Task | 0 deleteTask, 1 editTask, 2 changeTaskStatus, 3 addTask, 4 editOwnTask, 5 changeOwnTaskStatus |
| Subtask | 6 changeSubtaskStatus, 7 addOwnSubtask, 8 changeOwnSubtaskStatus |
| โปรเจกต์ | 9 deleteProject, 10 editProjectInfo, 11 manageMembers, 12 manageShareLink |
| ปัญหาใน Task | 13–20: delete/edit/changeStatus/add แบบ "ทุกอัน" และแบบ "ของตัวเอง" |
| ปัญหาใน Subtask | 21–28: ชุดเดียวกันแต่สำหรับ subtask |

ลำดับต้องตรงกันระหว่าง `backend/src/utils/projectPermissions.js` กับ `frontend/app/components/project-position-bits.ts` ลำดับชั้นนี้**เคยถูกจัดเรียงใหม่มาแล้ว (ไม่ใช่ append-only)** ถ้าจะเปลี่ยนอีก ต้อง migrate ข้อมูลทุกแถวด้วย

กฎสำคัญ:

- คำว่า **"ของตัวเอง"** หมายถึงเป็น assignee ของ task/subtask นั้นโดยตรง ความรับผิดชอบต่อ task แม่**ไม่ได้ส่งต่อมาถึง subtask**
- การกระทำทุกอย่างต้องมีบิตกำกับ เป็นผู้รับผิดชอบอย่างเดียวไม่ได้สิทธิ์อะไรเพิ่มอัตโนมัติ (รวมถึงการเปลี่ยนสถานะ)
- ถ้าถือหลายตำแหน่ง จะได้สิทธิ์รวมกัน (OR)
- แชทและการตอบกลับปัญหา: สมาชิกโปรเจกต์ทุกคนทำได้ ไม่ต้องมีบิต
- ผู้สร้างโปรเจกต์จะถูกเพิ่มเป็นสมาชิกพร้อมตำแหน่ง **PM** (ตำแหน่งนี้เปิดทุกบิต) อัตโนมัติ

### 6.3 การบังคับใช้สิทธิ์

| ที่ | ทำอะไร |
|---|---|
| `requireAuth` | ตรวจ JWT (HS256 เท่านั้น) แล้ว **ดึง role, role_permission และสถานะของ user จาก DB ใหม่ทุก request** ใน query เดียว (`req.user.role_permission`) เปลี่ยน role หรือระงับบัญชีแล้วมีผลทันที |
| `requirePermission(key \| [keys])` | ตรวจบิตสิทธิ์ระบบจาก `req.user.role_permission` ถ้าส่งมาเป็น array ขอแค่ผ่านบิตใดบิตหนึ่ง |
| `requireProjectMember` | ต้องเป็นสมาชิกโปรเจกต์ **หรือ** มีบิต `viewAllProjects` (กรณีหลังดูได้อย่างเดียว) และคำนวณสิทธิ์รวมของตำแหน่งไว้ที่ `req.projectPermission` ให้ใช้ต่อทั้ง request |
| `requireProjectPermission(key)` | ตรวจบิตตำแหน่งในโปรเจกต์จาก `req.projectPermission` |
| `requireRealMember` | การกระทำที่ไม่มีบิตคุม (ส่งแชท ตอบปัญหา รับงาน) ต้องเป็นสมาชิกจริง |
| `requireTaskInProject` / `requireIssueInProject` / `requireMemberInProject` | ตรวจว่า id ใน URL อยู่ในโปรเจกต์ที่อ้างจริง ถ้าไม่อยู่ตอบ 404 กันการเข้าถึงข้ามโปรเจกต์ และเก็บแถวไว้ที่ `req.task` / `req.issue` |
| `loginRateLimit` | login ผิดเกิน 10 ครั้งต่อบัญชี (หรือ 200 ครั้งต่อ IP) ใน 15 นาที ตอบ 429 |
| ใน controller | สิทธิ์ที่ขึ้นกับว่าเป็น task หรือ subtask / เป็นของตัวเองหรือไม่ (`canEditTask`, `canAddTask`, `canChangeStatus`, `canDoIssueAction`) |

ฝั่ง frontend ใช้บิตแค่เพื่อซ่อนหรือแสดงเมนูและปุ่ม การบังคับสิทธิ์จริงอยู่ที่ backend ทั้งหมด

## 7. ฟีเจอร์หลัก

### 7.1 Login และบัญชีผู้ใช้

- `handleLogin` (server action) เรียก API login แล้วเก็บ cookie `token`, `permission`, `userId` (httpOnly) และ `fullname` นอกจากนี้ฝั่ง client เก็บ token ไว้ใน `localStorage` ด้วย หน้าในระบบใช้ token จาก localStorage เรียก API ตรงจาก browser
- `proxy.ts` ใช้ cookie `token` ตัดสินว่าจะให้เข้าหน้า protected ได้ไหม (`/`, `/login`, `/share/*` เป็นหน้าสาธารณะ)
- แอดมินสร้าง user ได้โดย**ไม่ต้องใส่อีเมล** ระบบจะออก**ชื่อผู้ใช้** (`user_username` ถ้าเว้นว่างจะใช้ `user_id`) และ**รหัสผ่านชั่วคราว** 10 ตัว (ตัดตัวอักษรที่สับสนง่ายออก) แล้วแสดงให้แอดมินดูครั้งเดียว ช่อง login รับได้ทั้งอีเมลและชื่อผู้ใช้ (ชื่อผู้ใช้ห้ามมี `@`)
- **เข้าระบบครั้งแรก** (`first-login-onboarding.tsx` แนวเดียวกับ fasttiw): 1) ตั้งรหัสผ่านใหม่ 2) ถ้ายังไม่มีอีเมล ให้กรอกอีเมลแล้วยืนยันด้วย **OTP 6 หลัก** (`utils/emailOtp.js`: อายุ 10 นาที, กรอกผิดได้ 5 ครั้ง, ใช้ได้ครั้งเดียว, ผูกกับผู้ใช้ที่ขอ) 3) อัปโหลดรูปโปรไฟล์ (ข้ามได้) ขั้น 1-2 บังคับทำให้ครบก่อนใช้ระบบ ส่วนการเปลี่ยนอีเมลภายหลังทำได้ทาง OTP ที่หน้าโปรไฟล์เท่านั้น
- หน้าโปรไฟล์: แก้ข้อมูลตัวเอง เปลี่ยนรหัสผ่าน และอัปโหลดรูปพร้อมครอป รูปจะถูกครอปเป็น 256×256 แล้วบีบเป็น AVIF
- ทุกการ login / logout / login ล้มเหลว ถูกบันทึกลง `tb_login_logs` และดูได้ที่หน้า `/settings/logs`

### 7.2 Master data (หน้าตั้งค่า)

CRUD ของ ผู้ใช้ (`/users`), role (`/settings/roles` ใช้ UI ติ๊กบิต), แผนก, ตำแหน่งในโปรเจกต์ และลูกค้า (`/clients`) ใช้ `DataTable` กลางที่มีค้นหาและแบ่งหน้า (limit/offset)

endpoint `GET` แบบรายการของ role, แผนก, ตำแหน่ง และลูกค้า ล็อกไว้แค่ `requireAuth` เพราะ dropdown ในหน้าอื่นต้องใช้ ส่วนการสร้าง แก้ไข และลบ ต้องมีบิตของตัวเอง

### 7.3 โปรเจกต์

- รายการโปรเจกต์: ถ้ามี `viewAllProjects` จะเห็นทุกโปรเจกต์ ถ้ามีแค่ `viewOwnProjects` จะเห็นเฉพาะที่ตัวเองเป็นสมาชิก โปรเจกต์ที่ยกเลิกแล้วซ่อนไว้ ต้องกดดูแยก
- สถานะ: `planning` → `in_progress` → `on_hold` → `completed` / `cancelled`
- **ยกเลิก/กู้คืน** (`cancelProject`) เป็นสิทธิ์ระดับระบบ ทำได้โดยไม่ต้องเป็นสมาชิก ข้อมูลไม่ถูกลบ ส่วน **ลบ** (`deleteProject`) เป็นสิทธิ์ในโปรเจกต์ และลบถาวร
- **ประเภทโปรเจกต์**
  - `waterfall`: มอบหมายงานได้เฉพาะคนที่มีสิทธิ์
  - `agile`: ทำได้แบบ waterfall ทั้งหมด และสมาชิกกด **"รับงาน" (claim)** task/subtask ที่ยังไม่มีคนรับได้เอง (คนแรกได้ไป) ถ้ารับ subtask จะถูกเพิ่มเป็นผู้รับผิดชอบร่วมของ task แม่ด้วย หน้าโปรเจกต์มีส่วน "ภาพรวม Agile" สรุปว่ารับไปแล้วกี่งาน ยังไม่มีคนรับกี่งาน
- **% ความคืบหน้า** (`utils/projectProgress.js`) = น้ำหนักของ task ระดับบนที่เสร็จแล้ว ÷ น้ำหนักรวม (ไม่นับ subtask) คำนวณใหม่ทุกครั้งที่สร้าง ลบ เปลี่ยนสถานะ หรือเปลี่ยนน้ำหนัก แล้ว cache ไว้ใน `tb_projects`
- **สมาชิก**: เพิ่มหรือลบสมาชิกและกำหนดตำแหน่งได้ (`manageMembers`) คนที่ถูกเพิ่มจะได้รับอีเมลแจ้ง

### 7.4 Task / Subtask

- subtask ซ้อนได้แค่ **1 ชั้น** (สร้าง subtask ใต้ subtask ไม่ได้)
- ผู้รับผิดชอบได้หลายคน ผู้ที่**เพิ่งถูกเพิ่ม**จะได้อีเมลแจ้ง (คนที่อยู่แล้วไม่ได้ซ้ำ)
- ทุกการสร้าง แก้ไข เปลี่ยนสถานะ และรับงาน ถูกบันทึกลง `tb_task_activity_log`
- หน้ารายละเอียด task (modal ใน `/projects/view`) ประกอบด้วย subtasks, ปัญหา, ประวัติ และแชท
- ตารางงานแสดง badge 3 แบบ: สีแดงคือปัญหาเปิดของ task นั้นเอง, สีน้ำเงินคือปัญหาเปิดรวมจาก subtask, จุดแดงคือแชทที่ยังไม่ได้อ่าน

### 7.5 ปัญหา (Issue)

- แจ้งปัญหาบน task หรือ subtask ได้ แนบรูปได้สูงสุด 5 รูปต่อครั้ง (ย่อเหลือไม่เกิน 1600px แล้วบีบเป็น AVIF — ดูหัวข้อ "การบีบอัดรูป" ในข้อ 10)
- **แท็กคน (@)** ได้ คนที่ถูกแท็กจะเห็นปัญหานั้นในแดชบอร์ดของตัวเองพร้อมพื้นหลังสีแดง
- มี**เธรดตอบกลับ** (สมาชิกทุกคนตอบได้ แนบรูปได้) ถ้าเจ้าของปัญหายังไม่ได้อ่านคำตอบใหม่ ปัญหาจะเด้งกลับขึ้นมาในแดชบอร์ด แม้จะ resolved ไปแล้วก็ตาม
- สิทธิ์ add / edit / delete / changeStatus แยกกันระหว่าง task กับ subtask และแยกแบบ "ทุกอัน" กับ "ของตัวเอง" (16 บิต)

### 7.6 แชท

- มี 2 แบบ: แชทต่อ task และแชทรวมของโปรเจกต์ ทั้งสองแบบตอบกลับข้อความเดิมได้และแนบรูปได้
- **ไม่มี websocket** ใช้การ polling ทุก 4 วินาทีระหว่างที่หน้าแชทเปิดอยู่ (`CHAT_POLL_INTERVAL_MS`)
- เปิดดูแชทแล้วถือว่าอ่านแล้ว (ไม่มี endpoint mark-read แยก) และไม่นับข้อความที่ตัวเองส่งเป็นข้อความยังไม่อ่าน

### 7.7 ลิงก์สำหรับลูกค้า (Share)

- แต่ละโปรเจกต์มี `project_share_token` (สุ่ม 24 bytes, base64url) ลูกค้าเปิด `/share/<token>` ได้โดยไม่ต้อง login
- ลูกค้าจะเห็น: ข้อมูลโปรเจกต์, % ความคืบหน้า, task ระดับบน (ไม่เห็น subtask) และ timeline 50 รายการล่าสุด ซึ่งมีแค่การสร้างงานและการเปลี่ยนสถานะ ไม่มีชื่อพนักงาน
- คนที่มี `manageShareLink` ทำได้ 3 อย่าง: เปิด/ปิดลิงก์, สร้าง token ใหม่ (ลิงก์เก่าจะใช้ไม่ได้ทันที) และส่งลิงก์ทางอีเมลพร้อมข้อความ

### 7.8 อีเมลแจ้งเตือน (`utils/mailer.js`)

| อีเมล | เมื่อไหร่ | วิธีส่ง |
|---|---|---|
| มอบหมายงานใหม่ | ถูกเพิ่มเป็นผู้รับผิดชอบ task | fire-and-forget (ส่งไม่สำเร็จก็ไม่กระทบการบันทึกข้อมูล) |
| เพิ่มเป็นสมาชิกโปรเจกต์ | ถูกเพิ่มเข้าโปรเจกต์ | fire-and-forget |
| ลิงก์ติดตามโปรเจกต์ | ผู้ใช้กดส่งให้ลูกค้า | รอผลจริง แล้วแจ้ง error กลับไปถ้าไม่สำเร็จ |

### 7.9 แดชบอร์ด (`/dashboard`)

ต้องมีบิต `dashboard` และต้องมี `viewAllProjects` หรือ `viewOwnProjects` อย่างน้อยหนึ่งบิต ถึงจะเห็นข้อมูลที่มาจากโปรเจกต์ (เป็นการแก้ตามฟีดแบ็ก: role ของแผนกที่ไม่เกี่ยวกับโปรเจกต์ไม่ควรเห็น widget เหล่านี้)

| Widget | รายละเอียด |
|---|---|
| Stat tiles + ค้นหาด่วน | นับโปรเจกต์ งาน และปัญหา ช่องค้นหาหาได้ทั้งโปรเจกต์และ task |
| งานของฉัน | task ที่ตัวเองรับผิดชอบและยังไม่เสร็จ |
| ปัญหาที่เปิดอยู่ | ปัญหาของ task ตัวเอง + subtask ใต้ task ตัวเอง + ที่ถูกแท็ก + ของตัวเองที่มีคำตอบใหม่ มี toggle กรองเฉพาะ subtask ของตัวเอง |
| แชทที่ยังไม่ได้อ่าน | รวมแชท task และแชทโปรเจกต์ไว้ในรายการเดียว 10 รายการล่าสุด |
| โปรเจกต์ที่กำลังทำ | ตามขอบเขตสิทธิ์ดูโปรเจกต์ |
| ภาพรวมทีม | ต้องมี `viewAllProjects` แสดงภาระงานรายคน คลิกที่คนเพื่อดูงานที่เสร็จแล้ว / ยังไม่เสร็จ / เลยกำหนด |
| KPI ของฉัน | เลือกดูรายเดือนหรือรายปี กรองตามประเภทโปรเจกต์และ task/subtask ได้ |
| KPI รายคน | ต้องมี `viewMemberKpi` เป็นตารางสรุปรายคน กรองตามโปรเจกต์ได้ |
| กิจกรรมล่าสุด | feed ของทุกโปรเจกต์ที่มองเห็นได้ |

**วิธีคิด KPI** (ดูคอมเมนต์ยาวใน `dashboard.controller.js`)

1. **อัตราส่งโปรเจกต์ตรงเวลา** และ 2. **อัตราส่งงานตรงเวลา**
   - นับตาม**เดือนที่ครบกำหนด** (ไม่ใช่เดือนที่ทำเสร็จ)
   - งานที่นำมานับ (eligible) คืองานที่ "เสร็จแล้ว" หรือ "ยังไม่เสร็จแต่เลยกำหนดแล้ว" ซึ่งกรณีหลังนับเป็นสายทันที ปิดช่องโหว่ที่คนจะปล่อยงานค้างไว้ไม่ปิดเพื่อเลี่ยงการถูกนับ
   - ไม่นับโปรเจกต์หรืองานที่ถูกยกเลิก
3. **Cycle time**: จากครั้งแรกที่งานถูกเปลี่ยนเป็น `in_progress` (ดูจาก activity log) จนถึงตอนเสร็จ งานที่ข้ามจาก todo ไป done เลยจะไม่ถูกนับ
4. **เวลาเฉลี่ยแก้ปัญหา**: จาก `issue_created_at` ถึง `issue_resolved_at`

ถ้ายังไม่มีข้อมูลพอจะคืนค่าเป็น `null` (ไม่ใช่ 0%) เพื่อไม่ให้ตีความผิดว่าทำได้แย่

### 7.10 Log และการตรวจสอบย้อนหลัง (เพิ่ม 8 ต.ค. 2026)

อ้างอิง OWASP Logging Cheat Sheet / ISO 27001 A.8.15 — หน้า "Log ข้อมูล" (บิต `loginLogs`) มี 3 แท็บ อ่านอย่างเดียวทั้งหมด

| ตาราง | เก็บอะไร |
|---|---|
| `tb_audit_logs` | ทุกคำขอที่เปลี่ยนข้อมูล + คำขอที่ถูกปฏิเสธ (401/403/429) + การเปิดดูข้อมูลสำคัญ (ข้อมูลผู้ใช้, log, ลิงก์ลูกค้า) — ผู้กระทำ (snapshot ชื่อ/ชื่อผู้ใช้/role), การกระทำ, ข้อมูล+id, โปรเจกต์, ผลลัพธ์, **ค่าก่อน/หลังรายฟิลด์**, payload (ปิดบังความลับ), IP, user-agent, เวลาที่ใช้, request id |
| `tb_error_logs` | error 5xx จัดกลุ่มตามต้นเหตุ (fingerprint) + จำนวนครั้ง + stack |
| `tb_login_logs` | เข้า/ออกระบบ, เข้าไม่สำเร็จ (เดิม) |

- ทำงานด้วย middleware ตัวเดียว (`backend/src/middlewares/auditLog.middleware.js`) — endpoint ใหม่ถูกบันทึกเองอัตโนมัติ **ถ้าอยากได้ diff ค่าก่อน/หลังและชื่อการกระทำภาษาไทย ให้เพิ่มแถวใน `ENTITIES`**
- ทุก response มี header `X-Request-Id` และ error 500 ตอบ `request_id` กลับไป — ใช้ค้นเหตุการณ์ในหน้า log ได้ทันที
- ความลับ (รหัสผ่าน, token, OTP, cookie, รหัสผ่านชั่วคราว, token ลิงก์ลูกค้า) ไม่ถูกเก็บ · ไม่มี endpoint แก้/ลบ log (ปุ่ม "ลบ log ทั้งหมด" ถูกเอาออก) · ลบอัตโนมัติเมื่อเก่ากว่า `LOG_RETENTION_DAYS` (ค่าเริ่มต้น 730 วัน)
- ตาราง log ใช้ id แบบ BIGINT AUTO_INCREMENT (ไม่ใช่ 18 ตัว) โดยตั้งใจ — ปริมาณสูง ไม่ล็อก `tb_maxID`

## 8. API (prefix `/api/V1`)

| กลุ่ม | Endpoint หลัก |
|---|---|
| health | `GET /api/health` |
| auth | `POST auth/login`, `POST auth/logout`, `GET auth/verifyPermission` |
| users | `GET/PUT users/me`, `PUT users/me/password`, `PUT users/me/image`, `GET users/for-select`, CRUD `users`, `PUT users/:id/reset-password`, `PUT users/:id/image` |
| roles / departments / project-positions / clients | CRUD มาตรฐาน |
| logs | `GET logs`, `DELETE logs` (ลบ log ทั้งหมด) |
| projects | CRUD, `GET :id/my-permissions`, `PUT :id/share/regenerate`, `PUT :id/share/toggle`, `POST :id/share/send-email`, `PUT :id/task-weight/toggle`, `PUT :id/cancel`, `PUT :id/reactivate` |
| members | `GET/POST projects/:id/members`, `PUT/DELETE projects/:id/members/:memberId` |
| tasks | `GET/POST projects/:projectId/tasks`, `GET/PUT/DELETE .../tasks/:id`, `PUT .../tasks/:id/status`, `POST .../tasks/:id/claim`, `GET projects/:projectId/activity` |
| issues | `GET/POST .../tasks/:taskId/issues`, `GET .../tasks/:taskId/issues/replies`, `PUT/DELETE projects/:projectId/issues/:issueId`, `PUT .../issues/:issueId/status`, `GET/POST .../issues/:issueId/replies` |
| chat | `GET/POST .../tasks/:taskId/chat`, `GET/POST projects/:projectId/chat` |
| dashboard | `GET dashboard/summary`, `search`, `team-workload`, `kpis`, `kpis/by-member`, `team/:userId/tasks` |
| share (สาธารณะ) | `GET share/:token` |

รูปที่อัปโหลดเสิร์ฟแบบ static ที่ `<backend>/uploads/...`

## 9. หน้าเว็บ (frontend routes)

| Path | หน้า |
|---|---|
| `/`, `/login` | ฟอร์มเข้าสู่ระบบ |
| `/dashboard` | แดชบอร์ด (ไฟล์ใหญ่ ~1,100 บรรทัด) |
| `/projects`, `/projects/create`, `/projects/edit?id=`, `/projects/view?id=` | โปรเจกต์ (`view` เป็นไฟล์ที่ใหญ่ที่สุด ~2,800 บรรทัด รวม task, ปัญหา, แชท, สมาชิก และลิงก์ลูกค้าไว้หมด) |
| `/users`, `/users/create`, `/users/edit`, `/users/view` | ผู้ใช้งาน |
| `/clients`, `/clients/create`, `/clients/edit` | ลูกค้า |
| `/settings/roles/*`, `/settings/departments/*`, `/settings/project-positions/*`, `/settings/logs` | ตั้งค่าระบบ |
| `/profile` | โปรไฟล์ของตัวเอง |
| `/share/[token]` | หน้าสาธารณะสำหรับลูกค้า |
| `/reports`, `/settings` | **ยังเป็นหน้าว่าง** (มีแค่หัวข้อ) |

หน้าแก้ไขและดูรายละเอียดใช้ query string (`?id=`) แทน dynamic route

## 10. ข้อตกลงในโค้ด (conventions)

- Backend: ฟังก์ชัน controller เป็น `async (req, res, next)` แล้วส่ง error ต่อด้วย `next(err)` ข้อความ error เป็นภาษาไทย การเขียนหลายตารางพร้อมกันใช้ transaction (`pool.getConnection()` + `beginTransaction`)
- SQL เขียนตรงด้วย `pool.query` แบบ parameterized (`?`) ไม่มี ORM
- `GET` แบบรายการรับ `limit`, `offset`, `search` แล้วตอบกลับเป็น `{ data, total }`
- Frontend: หน้าส่วนใหญ่เป็น `"use client"` ใช้ `fetch` ตรงพร้อม header `Authorization: Bearer <localStorage token>` แจ้งผลด้วย `toast` จาก sonner
- วันที่แสดงผลด้วย timezone `Asia/Bangkok` ผ่าน `app/function.tsx`
- **การบีบอัดรูป** (`backend/src/utils/imageCompress.js` ที่เดียวของทั้งระบบ): ทุกรูปที่อัปโหลดถูกหมุนตาม EXIF แล้วบีบเป็น **AVIF** — รูปถ่าย q52 / ภาพหน้าจอ-กราฟิก (PNG/GIF/SVG) q47 / effort 3 · วัดเทียบ WebP เดิมด้วย SSIM แล้ว: เล็กลงเหลือ ~64% (รูปถ่าย) และ ~86% (ภาพหน้าจอ) โดยคมชัดเท่าหรือดีกว่าเดิม · เข้ารหัส AVIF ไม่ได้จะถอยไปใช้ WebP · ไฟล์ .avif ต้องส่ง `Content-Type: image/avif` เอง (ตั้งไว้ใน `app.js`) · รูปเก่าที่เป็น .webp ยังใช้ได้ตามเดิม ไม่ได้แปลงซ้ำ (บีบไฟล์ที่ถูกบีบแล้วซ้ำจะเสียความคม)
- คอมเมนต์ในโค้ดเป็นภาษาไทยและอธิบาย "ทำไม" ไว้ละเอียด ก่อนแก้ logic ไหนควรอ่านคอมเมนต์รอบๆ ก่อน

## 11. การ deploy

รัน `deploy.bat` ที่ root ของ repo สคริปต์จะทำตามลำดับนี้

1. `git add backend database frontend` แล้ว commit ด้วยข้อความ "Deploy <วันเวลา>"
2. `git push origin master`
3. `git subtree push --prefix=backend backend-deploy master` และ `--prefix=frontend frontend-deploy master` (ต้องมี remote ชื่อ `backend-deploy` และ `frontend-deploy`)
4. บน Plesk ส่วน frontend: NPM install → Run script `build` → Restart App (startup file: `server.js`)
5. บน Plesk ส่วน backend: NPM install → Restart App
6. **ฐานข้อมูล:** รัน `database/query/deploy_schema.sql` บน DB ของ production ทุกครั้ง (phpMyAdmin → แท็บ SQL) แล้วดูผลของ query สุดท้าย ถ้าไม่มีแถวผลลัพธ์แปลว่าโครงสร้างครบ ควรรันก่อน restart backend เพื่อให้คอลัมน์ใหม่พร้อมก่อนโค้ดใหม่เริ่มใช้

**ประวัติปัญหาที่เคยเจอ (ก.ค. 2026):**

- เคย build frontend บน Windows แล้วส่ง bundle ขึ้นไป ผลคือ path แบบ Windows ติดไปใน `required-server-files.json` ทำให้ Passenger บน Linux crash
- `sharp` เวอร์ชัน win32 ก็ทำให้ crash เหมือนกัน (เลยตั้ง `images.unoptimized: true` ใน `next.config.ts`)
- ตอนนี้จึง**ส่งเฉพาะ source** แล้วให้ Plesk build เองบนเซิร์ฟเวอร์ ห้ามกลับไป build บนเครื่อง Windows แล้วส่ง bundle อีก

## 12. จุดที่ควรรู้และความเสี่ยงที่พบจากการอ่านโค้ด

ยังไม่ได้แก้ข้อไหนเลย บันทึกไว้เพื่อพิจารณา

1. ~~ตรวจไม่ครบว่า task / issue / สมาชิก อยู่ในโปรเจกต์ที่อ้างใน URL~~ แก้แล้ว 7 ต.ค. 2026 (ดู [`plans/2026-10-07-performance-security.md`](plans/2026-10-07-performance-security.md))
2. ~~ออก ID พร้อมกันอาจชนกัน~~ แก้แล้ว 7 ต.ค. 2026: ล็อกแถวใน `tb_maxID` ระหว่างออก id (`tb_maxID` จึงเป็นตัวนับจริงแล้ว ไม่ได้เก็บไว้ดูอ้างอิงอย่างเดียว)
3. **Token เก็บไว้ทั้งใน cookie httpOnly และ `localStorage`**: ฝั่ง localStorage เปิดช่องให้ XSS อ่าน token ได้ และ JWT มีอายุ 30 วัน
4. **บิตสิทธิ์ใน cookie `permission` ถูกเก็บตอน login**: ถ้าแอดมินเปลี่ยน role ภายหลัง เมนูฝั่ง frontend จะยังแสดงตามสิทธิ์เก่าจนกว่าจะ login ใหม่ (backend ตรวจสิทธิ์ใหม่ทุกครั้ง จึงไม่มีช่องโหว่ด้านความปลอดภัย แค่ UI ไม่ตรง)
5. ~~`GET auth/verifyPermission` ดู role อื่นได้~~ แก้แล้ว 7 ต.ค. 2026: คืนเฉพาะ role ของตัวเอง
6. **หน้า share แสดงชื่อผู้รับผิดชอบ** (`assignee_names`) ในรายการ task ให้ลูกค้าเห็น ขณะที่ timeline ตั้งใจตัดชื่อพนักงานออก ควรยืนยันว่าตั้งใจให้ลูกค้าเห็นชื่อในรายการ task หรือไม่
7. ~~URL ของ API hardcode ไว้~~ แก้แล้ว (7 ต.ค. 2026): อ่านจาก `NEXT_PUBLIC_API_URL` ถ้าไม่ได้ตั้งไว้จะใช้ URL ของ production
8. **ไฟล์หน้าใหญ่มาก**: `projects/view/page.tsx` (~2,800 บรรทัด) และ `dashboard/page.tsx` (~1,100 บรรทัด) ถ้าจะเพิ่มฟีเจอร์ในหน้าเหล่านี้ ควรพิจารณาแยก component
9. **ยังไม่มีเทสต์อัตโนมัติ** และไม่มี migration script
10. **ฟิลด์ที่เก็บแต่ยังไม่ได้ใช้**: `user_line_uid`, `user_whatsapp_no` (น่าจะเผื่อไว้แจ้งเตือนผ่าน LINE/WhatsApp) และเมนูที่คอมเมนต์ไว้ใน `bit.tsx` (customers, payments, reports)

## 13. ลำดับเหตุการณ์ (จาก git log)

| วันที่ | งาน |
|---|---|
| 14 ก.ค. 2026 | first commit |
| 15 ก.ค. | โปรเจกต์ |
| 16 ก.ค. | แชท + แดชบอร์ด |
| 17 ก.ค. | KPI, แท็กคนในปัญหา |
| 18 ก.ค. | Agile (รับงานเอง) |
| 19 ก.ค. | แก้ปัญหา deploy บน Plesk หลายรอบ สุดท้ายเปลี่ยนเป็นส่งเฉพาะ source |
| 30 ก.ย. | deploy ล่าสุด |

บทสนทนาและแผนงานเดิมก่อน 7 ต.ค. 2026 ถูกลบไปโดยระบบ auto-cleanup ของ Claude Code แผนงานต่อจากนี้ให้เก็บไว้ใน [`docs/plans/`](plans/)
