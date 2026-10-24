// การทำงานร่วมกันในโปรเจกต์ (ข้อมูลจำลองชุดเต็ม 2026-10-24): แชตโปรเจกต์ · แชตในงาน · ปัญหา (issue) + ตอบกลับ + รูป · การอ่าน
// เวลาโพสต์ตามนาฬิกาจำลอง (MySQL ใช้ SET TIMESTAMP จาก clock.js) · รูปวาดจาก SVG ในเครื่อง (ไม่ใช่ภาพจริงของใคร)
const sharp = require("sharp");
const { setToday } = require("./clock");
const { as } = require("./api");
const projects = require("./projects");

// ─── รูปประกอบ ───────────────────────────────────────────────────────────────────────────
const IMAGE_SVGS = {
    // ภาพร่างหน้าจอบนไวท์บอร์ด
    wireframe: `<rect width="100%" height="100%" fill="#f8fafc"/>
        <rect x="40" y="40" width="720" height="60" fill="none" stroke="#334155" stroke-width="3"/>
        <rect x="40" y="130" width="220" height="300" fill="none" stroke="#334155" stroke-width="3"/>
        <rect x="290" y="130" width="470" height="140" fill="none" stroke="#334155" stroke-width="3"/>
        <rect x="290" y="300" width="220" height="130" fill="none" stroke="#2563eb" stroke-width="3"/>
        <rect x="540" y="300" width="220" height="130" fill="none" stroke="#2563eb" stroke-width="3"/>
        <line x1="60" y1="170" x2="240" y2="170" stroke="#94a3b8" stroke-width="6"/>
        <line x1="60" y1="210" x2="200" y2="210" stroke="#94a3b8" stroke-width="6"/>
        <line x1="60" y1="250" x2="220" y2="250" stroke="#94a3b8" stroke-width="6"/>
        <text x="400" y="480" font-family="Arial" font-size="22" text-anchor="middle" fill="#334155">WIREFRAME v1</text>`,
    // ภาพหน้าจอที่มีวงแดงชี้จุดผิด
    bug: `<rect width="100%" height="100%" fill="#ffffff"/>
        <rect x="0" y="0" width="800" height="56" fill="#2563eb"/>
        <rect x="40" y="90" width="720" height="44" fill="#f1f5f9"/>
        <rect x="40" y="150" width="720" height="44" fill="#f1f5f9"/>
        <rect x="40" y="210" width="720" height="44" fill="#f1f5f9"/>
        <text x="60" y="240" font-family="Arial" font-size="20" fill="#0f172a">Total: 12,450.00</text>
        <ellipse cx="160" cy="232" rx="140" ry="34" fill="none" stroke="#dc2626" stroke-width="5"/>
        <rect x="560" y="400" width="200" height="56" rx="10" fill="#2563eb"/>
        <text x="400" y="520" font-family="Arial" font-size="18" text-anchor="middle" fill="#64748b">screenshot</text>`,
    // ภาพหน้าจอที่ทำงานถูกแล้ว
    fixed: `<rect width="100%" height="100%" fill="#ffffff"/>
        <rect x="0" y="0" width="800" height="56" fill="#2563eb"/>
        <rect x="40" y="90" width="720" height="44" fill="#f1f5f9"/>
        <rect x="40" y="150" width="720" height="44" fill="#f1f5f9"/>
        <rect x="40" y="210" width="720" height="44" fill="#dcfce7"/>
        <text x="60" y="240" font-family="Arial" font-size="20" fill="#166534">Total: 11,850.00  OK</text>
        <rect x="560" y="400" width="200" height="56" rx="10" fill="#2563eb"/>`,
    // ภาพถ่ายหน้างาน (โรงงาน/รีสอร์ท)
    site: `<rect width="100%" height="100%" fill="#bae6fd"/>
        <rect x="0" y="330" width="800" height="270" fill="#86efac"/>
        <rect x="120" y="200" width="300" height="180" fill="#e2e8f0" stroke="#475569" stroke-width="3"/>
        <polygon points="100,200 270,120 440,200" fill="#94a3b8"/>
        <rect x="500" y="260" width="180" height="120" fill="#fde68a" stroke="#475569" stroke-width="3"/>
        <circle cx="690" cy="90" r="40" fill="#fde047"/>`,
    // กราฟยอดรายวัน
    chart: `<rect width="100%" height="100%" fill="#ffffff"/>
        <line x1="80" y1="500" x2="760" y2="500" stroke="#334155" stroke-width="2"/>
        <line x1="80" y1="80" x2="80" y2="500" stroke="#334155" stroke-width="2"/>
        <rect x="120" y="320" width="70" height="180" fill="#60a5fa"/>
        <rect x="230" y="260" width="70" height="240" fill="#60a5fa"/>
        <rect x="340" y="290" width="70" height="210" fill="#60a5fa"/>
        <rect x="450" y="200" width="70" height="300" fill="#2563eb"/>
        <rect x="560" y="170" width="70" height="330" fill="#2563eb"/>
        <text x="420" y="60" font-family="Arial" font-size="22" text-anchor="middle" fill="#334155">Daily volume (tons)</text>`,
};

function imageOf(kind) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">${IMAGE_SVGS[kind]}</svg>`;
    return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function formWith(fields, imageKind) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) form.append(key, value);
    }
    if (imageKind) form.append("images", new Blob([await imageOf(imageKind)], { type: "image/jpeg" }), `${imageKind}.jpg`);
    return form;
}

// ─── เนื้อหา ─────────────────────────────────────────────────────────────────────────────
// [วันที่, เวลา, ผู้โพสต์, ข้อความ, { image, replyTo (ลำดับข้อความในโปรเจกต์เดียวกัน) }]
const PROJECT_CHATS = {
    tour: [
        ["2026-05-04", "09:20", "nattapon", "เริ่มโปรเจกต์ระบบจองทัวร์วันนี้ครับ kickoff 10 โมงที่ห้องประชุมเล็ก"],
        ["2026-05-04", "11:05", "chonthicha", "แนบภาพร่างหน้าจอจองทัวร์จากที่คุยกันเมื่อเช้าค่ะ", { image: "wireframe" }],
        ["2026-05-04", "11:20", "supawadee", "ปฏิทินที่นั่งว่างทำเป็นรายเดือนได้ไหมคะ ลูกค้าอยากเห็นทั้งเดือน", { replyTo: 1 }],
        ["2026-05-04", "13:10", "nattapon", "ได้ครับ จอคอมแสดงรายเดือน มือถือแสดงรายสัปดาห์", { replyTo: 2 }],
        ["2026-06-12", "10:40", "thanawat", "ลูกค้าขอเพิ่มช่องหมายเหตุตอนจอง (แพ้อาหาร/ที่นั่งเด็ก) รบกวนประเมินเวลาด้วยครับ"],
        ["2026-06-12", "11:15", "nattapon", "เพิ่มได้ครับ ใช้เวลาครึ่งวัน ไม่กระทบกำหนดส่งงวด 2", { replyTo: 4 }],
        ["2026-07-29", "16:05", "kittisak", "ทดสอบชำระเงินผ่าน QR ครบทุกธนาคารแล้ว ผ่านทั้งหมดครับ", { image: "fixed" }],
        ["2026-08-03", "09:10", "nattapon", "ปิดโปรเจกต์เรียบร้อย ลูกค้าตรวจรับแล้ว ขอบคุณทุกคนครับ ต่อจากนี้เป็นสัญญาดูแลรายเดือน"],
    ],
    clinic: [
        ["2026-05-13", "09:30", "nattapon", "โปรเจกต์เว็บไซต์คลินิกเริ่มวันนี้ ปิงดูแลระบบนัดหมาย มิ้นท์ทำหน้าเว็บครับ"],
        ["2026-05-20", "15:20", "chonthicha", "แบบหน้าแรกเวอร์ชันแรกค่ะ คุณหมอชอบโทนสีฟ้าอ่อน", { image: "wireframe" }],
        ["2026-07-10", "17:40", "piyapong", "เปิดใช้งานจริงแล้วครับ ระบบแจ้งเตือนนัดผ่าน LINE ทำงานปกติ"],
    ],
    resort: [
        ["2026-06-01", "09:15", "nattapon", "เริ่มระบบจองห้องพักอันดามันครับ งวดแรกเน้นหน้าจอจองและปฏิทินห้องว่าง"],
        ["2026-06-18", "14:30", "chonthicha", "หน้าจอปฏิทินห้องว่างตามฤดูกาลค่ะ ช่วยดูว่าปุ่มเปลี่ยนเดือนใหญ่พอบนมือถือไหม", { image: "wireframe" }],
        ["2026-06-18", "15:05", "apichart", "บนมือถือกดง่ายครับ ขอให้วันที่จองเต็มเป็นสีเทาชัดกว่านี้นิดนึง", { replyTo: 1 }],
        ["2026-07-15", "10:20", "thanawat", "ลูกค้ารีสอร์ทขอให้ราคาวันหยุดยาวตั้งล่วงหน้าได้ทั้งปีครับ"],
        ["2026-07-15", "11:00", "piyapong", "รองรับแล้วครับ ตั้งช่วงราคาได้ไม่จำกัด", { replyTo: 3 }],
        ["2026-09-10", "16:30", "apichart", "แผนย้ายข้อมูลห้องพักจากระบบเดิม: เสาร์ที่ 12 ก.ย. 09:00-13:00 ระหว่างที่รีสอร์ทปิดรับจองชั่วคราว"],
        ["2026-09-12", "13:20", "apichart", "ย้ายข้อมูลเสร็จแล้วครับ ห้อง 86 ห้อง การจองล่วงหน้า 412 รายการ ตรงกับระบบเดิมทุกรายการ", { image: "site" }],
        ["2026-10-01", "08:45", "nattapon", "ระบบขึ้นใช้งานจริงเมื่อคืน เช็กอินแรกของวันเรียบร้อยครับ ขอบคุณทุกคนที่อยู่ดึก"],
    ],
    palm: [
        ["2026-07-21", "09:30", "nattapon", "เริ่มระบบรับซื้อปาล์มครับ ทีมหน้างานไปโรงงานทุกวันพฤหัส"],
        ["2026-08-06", "15:40", "supawadee", "รูปจุดรับซื้อที่ 1 ค่ะ ตาชั่งต่อสาย RS-232 ได้ตามที่คุยไว้", { image: "site" }],
        ["2026-08-28", "17:10", "weerayut", "ส่งต่องานโมดูลรับซื้อให้ฝนแล้วครับ เอกสารอยู่ในโฟลเดอร์ส่งมอบ ขอบคุณทุกคนครับ"],
        ["2026-08-28", "17:25", "nattapon", "ขอบคุณเอกมากครับ โชคดีกับการเรียนต่อ", { replyTo: 2 }],
        ["2026-10-13", "15:20", "kittisak", "วันแรกเปิดใช้จริงที่โรงงาน รับซื้อได้ทั้ง 3 จุด ไม่มีข้อผิดพลาดครับ", { image: "site" }],
        ["2026-10-14", "09:05", "supawadee", "ยอดรับซื้อวันแรก 312 ตันค่ะ กราฟแนบ", { image: "chart" }],
    ],
    dive: [
        ["2026-08-25", "10:00", "nattapon", "Kickoff แอปจองดำน้ำครับ ลูกค้าสิงคโปร์ เอกสารทั้งหมดเป็นภาษาอังกฤษนะครับ"],
        ["2026-09-18", "16:15", "chonthicha", "ลูกค้าอนุมัติดีไซน์ทั้ง 12 หน้าจอแล้วค่ะ", { image: "wireframe" }],
        ["2026-10-20", "11:30", "piyapong", "ระบบจองฝั่ง API เสร็จ 80% สัปดาห์หน้าส่ง TestFlight ให้ลูกค้าลองครับ"],
    ],
    internal: [
        ["2026-05-04", "13:30", "nattapon", "โปรเจกต์ภายใน: ระบบบริหารงานของเราเอง ลงงานในบอร์ดนี้นะครับ"],
        ["2026-10-20", "10:10", "apichart", "ระบบลงเวลาเข้า-ออกงานใช้จริงมาเกือบ 5 เดือน มีคนขอให้แสดงแผนที่ตอนกด ใส่ไว้ในงานถัดไปครับ"],
    ],
};

// แชตในงาน: [โปรเจกต์, ลำดับงานหลัก, ข้อความ [วันที่, เวลา, ผู้โพสต์, ข้อความ, { image }]...]
const TASK_CHATS = [
    ["tour", 1, [
        ["2026-05-18", "10:30", "supawadee", "API ราคาทัวร์ส่งราคาเด็กมาเป็นราคาเต็ม ต้องคิดส่วนลดฝั่งเราไหมคะ"],
        ["2026-05-18", "10:45", "weerayut", "ใช่ครับ ราคาเด็ก 70% ของผู้ใหญ่ ผมเพิ่มในหลังบ้านให้ตั้งได้แล้ว"],
    ]],
    ["resort", 1, [
        ["2026-07-02", "14:00", "piyapong", "โครงสร้างตารางห้องพักแยกห้องกับประเภทห้องแล้วนะครับ"],
        ["2026-07-02", "14:20", "apichart", "รับทราบครับ ระบบแม่บ้านจะอิงสถานะห้องรายห้อง"],
        ["2026-09-30", "21:10", "nattapon", "ติดตั้งเสร็จ ตรวจ SSL และสำรองข้อมูลอัตโนมัติแล้ว หน้าจอหลังติดตั้งแนบไว้", { image: "fixed" }],
    ]],
    ["palm", 1, [
        ["2026-08-13", "11:10", "kittisak", "ทดสอบชั่งน้ำหนักรถพ่วงแล้ว ค่ากลับมาช้า 3-4 วินาที รับได้ไหมครับ"],
        ["2026-08-13", "11:30", "supawadee", "รับได้ค่ะ ตาชั่งรุ่นนี้ส่งค่าทุก 3 วินาทีอยู่แล้ว"],
    ]],
];

// ปัญหา: tagged = แท็กผู้รับผิดชอบ · resolved = [วันที่, เวลา, ผู้ปิด] · ไม่มี resolved = ยังเปิดอยู่
const ISSUES = [
    {
        project: "tour", taskIndex: 1, date: "2026-07-06", time: "10:20", by: "kittisak", tagged: ["supawadee"], image: "bug",
        title: "หน้าชำระเงินแสดงยอดผิดเมื่อจองผู้ใหญ่ 3 เด็ก 2",
        description: "ยอดรวมแสดง 12,450 แต่ควรเป็น 11,850 (ส่วนลดเด็กไม่ถูกหัก) · ลองบน Chrome มือถือและคอม",
        replies: [
            ["2026-07-06", "14:05", "supawadee", "เจอแล้วค่ะ ปัดเศษส่วนลดเด็กก่อนคูณจำนวนคน แก้แล้วรอทดสอบ"],
            ["2026-07-07", "09:40", "kittisak", "ทดสอบซ้ำผ่านแล้วครับ", { image: "fixed" }],
        ],
        resolved: ["2026-07-07", "09:45", "kittisak"],
    },
    {
        project: "tour", taskIndex: 0, date: "2026-06-24", time: "15:10", by: "kittisak", tagged: ["chonthicha", "weerayut"],
        title: "ปฏิทินทัวร์ไม่แสดงรอบวันเสาร์บน Safari",
        description: "iPhone Safari เลื่อนไปเดือน ก.ค. แล้ววันเสาร์ว่างทั้งหมด (Chrome ปกติ)",
        replies: [["2026-06-25", "10:00", "weerayut", "รูปแบบวันที่ของ Safari อ่านต่างกัน แก้ให้ใช้ ISO แล้วครับ"]],
        resolved: ["2026-06-25", "16:30", "kittisak"],
    },
    {
        project: "resort", taskIndex: 1, date: "2026-08-12", time: "11:00", by: "kittisak", tagged: ["apichart"], image: "bug",
        title: "กดเช็กอินซ้ำได้ถ้ากดปุ่มเร็วสองครั้ง",
        description: "เกิดแขก 2 รายการในห้องเดียวกัน ต้องกันการกดซ้ำ",
        replies: [
            ["2026-08-12", "16:20", "apichart", "ล็อกปุ่มระหว่างบันทึก และฝั่งเซิร์ฟเวอร์ตรวจซ้ำแล้วครับ"],
            ["2026-08-14", "10:00", "kittisak", "ผ่านครับ"],
        ],
        resolved: ["2026-08-14", "10:05", "kittisak"],
    },
    {
        project: "resort", taskIndex: 1, date: "2026-10-20", time: "14:15", by: "nattapon", tagged: ["piyapong"],
        title: "รายงานรายได้เดือน ก.ย. รวมภาษีซ้ำ",
        description: "ฝ่ายบัญชีรีสอร์ทแจ้งว่ารายได้ในรายงานสูงกว่าใบเสร็จรวม 7% ตรวจด้วยครับ",
        replies: [["2026-10-21", "09:30", "piyapong", "กำลังตรวจครับ น่าจะรวม VAT ในยอดก่อนภาษีซ้ำ"]],
    },
    {
        project: "palm", taskIndex: 1, date: "2026-09-03", time: "16:40", by: "kittisak", tagged: ["supawadee"],
        title: "น้ำหนักทศนิยม 3 ตำแหน่งถูกปัดผิด",
        description: "ตาชั่งส่ง 12.345 ตัน ระบบบันทึก 12.34 ควรปัดครึ่งขึ้นเป็น 12.35 ตามที่โรงงานใช้",
        replies: [["2026-09-04", "11:00", "supawadee", "แก้วิธีปัดเป็นครึ่งขึ้นแล้วค่ะ"]],
        resolved: ["2026-09-04", "15:00", "kittisak"],
    },
    {
        project: "palm", taskIndex: 1, date: "2026-10-16", time: "10:30", by: "kittisak", tagged: ["supawadee"], image: "bug",
        title: "แอปออฟไลน์ซิงก์รายการซ้ำเมื่อสัญญาณกลับมา",
        description: "จุดรับซื้อที่ 3 สัญญาณหลุดช่วงบ่าย พอกลับมามีรายการซ้ำ 2 รายการ",
        replies: [["2026-10-19", "13:45", "supawadee", "เพิ่มรหัสรายการจากเครื่องเพื่อกันซ้ำแล้ว รอส่งแอปเวอร์ชันใหม่ค่ะ"]],
    },
];

// การอ่าน: ใครเปิดอ่านแชตโปรเจกต์/ตอบกลับของปัญหาเมื่อไร (ที่เหลือ = ยังไม่อ่าน)
const CHAT_READS = [
    ["tour", "2026-08-03", "17:00", ["supawadee", "weerayut", "piyapong", "chonthicha", "kittisak"]],
    ["resort", "2026-10-01", "12:00", ["piyapong", "apichart", "chonthicha", "kittisak"]],
    ["palm", "2026-10-14", "13:00", ["nattapon", "kittisak", "chonthicha"]],
    ["dive", "2026-10-20", "16:00", ["chonthicha"]],
    ["clinic", "2026-07-10", "18:00", ["nattapon", "chonthicha"]],
];

/**
 * @param {{ on: Function, state: object }} context
 */
function scheduleCollaboration({ on, state }) {
    const messageIds = {};
    const topLevelTask = async (projectKey, index) => {
        const tasks = await projects.listTasks("nattapon", state.projects[projectKey]);
        const task = tasks.filter((item) => !item.task_parent_id)[index];
        if (!task) throw new Error(`โปรเจกต์ ${projectKey} ไม่มีงานหลักลำดับ ${index}`);
        return task.task_id;
    };

    for (const [projectKey, messages] of Object.entries(PROJECT_CHATS)) {
        messageIds[projectKey] = [];
        messages.forEach(([date, time, user, text, options = {}], index) => {
            on(date, `แชตโปรเจกต์ ${projectKey}`, async () => {
                setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
                const replyTo = options.replyTo === undefined ? undefined : messageIds[projectKey][options.replyTo];
                const form = await formWith({ message_text: text, reply_to_message_id: replyTo }, options.image);
                // เปิดแชตอ่านก่อนตอบ (เกิดแถวการอ่าน)
                await as(user, "GET", `/V1/projects/${state.projects[projectKey]}/chat`);
                messageIds[projectKey][index] = (await as(user, "POST", `/V1/projects/${state.projects[projectKey]}/chat`, form)).message_id;
            });
        });
    }

    for (const [projectKey, taskIndex, messages] of TASK_CHATS) {
        for (const [date, time, user, text, options = {}] of messages) {
            on(date, `แชตในงาน ${projectKey}`, async () => {
                setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
                const taskId = await topLevelTask(projectKey, taskIndex);
                await as(user, "GET", `/V1/projects/${state.projects[projectKey]}/tasks/${taskId}/chat`);
                await as(user, "POST", `/V1/projects/${state.projects[projectKey]}/tasks/${taskId}/chat`, await formWith({ message_text: text }, options.image));
            });
        }
    }

    for (const issue of ISSUES) {
        on(issue.date, `ปัญหา: ${issue.title}`, async () => {
            setToday(issue.date, Number(issue.time.slice(0, 2)), Number(issue.time.slice(3, 5)));
            const taskId = await topLevelTask(issue.project, issue.taskIndex);
            const userIds = state.userIds;
            const form = await formWith(
                {
                    issue_title: issue.title,
                    issue_description: issue.description,
                    tagged_user_ids: JSON.stringify(issue.tagged.map((username) => userIds[username])),
                },
                issue.image,
            );
            issue.id = (await as(issue.by, "POST", `/V1/projects/${state.projects[issue.project]}/tasks/${taskId}/issues`, form)).issue_id;
        });
        for (const [date, time, user, text, options = {}] of issue.replies) {
            on(date, `ตอบปัญหา: ${issue.title}`, async () => {
                setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
                const form = await formWith({ reply_text: text }, options.image);
                await as(user, "POST", `/V1/projects/${state.projects[issue.project]}/issues/${issue.id}/replies`, form);
                // ผู้แจ้งเปิดอ่านคำตอบ (เกิดแถวการอ่าน)
                await as(issue.by, "GET", `/V1/projects/${state.projects[issue.project]}/issues/${issue.id}/replies`);
            });
        }
        if (issue.resolved) {
            const [date, time, user] = issue.resolved;
            on(date, `ปิดปัญหา: ${issue.title}`, async () => {
                setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
                await as(user, "PUT", `/V1/projects/${state.projects[issue.project]}/issues/${issue.id}/status`, { issue_status: "resolved" });
            });
        }
    }

    for (const [projectKey, date, time, readers] of CHAT_READS) {
        on(date, `อ่านแชตโปรเจกต์ ${projectKey}`, async () => {
            setToday(date, Number(time.slice(0, 2)), Number(time.slice(3, 5)));
            for (const reader of readers) await as(reader, "GET", `/V1/projects/${state.projects[projectKey]}/chat`);
        });
    }
}

module.exports = { scheduleCollaboration };
