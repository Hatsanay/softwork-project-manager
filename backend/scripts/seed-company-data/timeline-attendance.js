// ลงเวลาเข้า-ออกงาน · ขอแก้เวลา · OT · WFH (ข้อมูลจำลองชุดเต็ม 2026-10-24 · docs/plans/2026-10-24-mock-data.md)
//
// - เริ่มใช้ลงเวลา 1 มิ.ย. 2026 · ทุกคนที่มีบัญชีกดเข้า/ออกทุกวันทำงานของกะตัวเอง (ไม่กดวันลาที่อนุมัติแล้ว)
// - แต่ละวันเป็นรายการงานเรียงตามเวลา: กดเข้า (เช้า) → คำขอ/อนุมัติระหว่างวัน → กดออก (เย็น/หลัง OT)
//   นาฬิกาจำลองเดินไปข้างหน้าตามจริง · การกดใช้เวลาเซิร์ฟเวอร์ (นาฬิกาจำลอง) เหมือนกดจากมือถือ
// - เวลาเข้า-ออกสุ่มแบบกำหนดผลได้ (ชื่อ + วันที่) รันซ้ำได้ข้อมูลเดิม · เหตุการณ์พิเศษ (สาย ลืมกด ขาด OT) เขียนไว้ชัดในรายการด้านล่าง
// - ทุกวันที่ลืมกดในเดือนที่จ่ายเงินเดือนแล้ว มีคำขอแก้เวลาที่อนุมัติก่อนวันคิดรอบเสมอ (ไม่งั้นส่งรอบเงินเดือนไม่ได้)
const { setToday } = require("./clock");
const { as } = require("./api");
const data = require("./data");
const { updatePeopleSettings, HEAD_OFFICE_ID } = require("./setup");

const START_DATE = "2026-06-01";
const LAST_PUNCH_DAY = "2026-10-22";
const HR = "wannipa";
const DEV_TEAM = new Set(["piyapong", "supawadee", "chonthicha", "kittisak", "weerayut", "apichart"]);
const ATTENDEES = [
    "siriporn", "thanawat", "kamonchanok", "wannipa", "nattapon", "piyapong", "supawadee",
    "chonthicha", "kittisak", "weerayut", "apichart", "pawinee",
];
// ผู้อนุมัติ (สิทธิ์อนุมัติลงเวลา): ทีมพัฒนา = หัวหน้าทีม · คนอื่นและหัวหน้าทีมเอง = กรรมการผู้จัดการ
const approverOf = (username) => (DEV_TEAM.has(username) ? "nattapon" : "hatsanai");

// ─── สุ่มแบบกำหนดผลได้ ────────────────────────────────────────────────────────────────────
function randomFor(seedText) {
    let seed = 2166136261;
    for (const character of seedText) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

// ─── กะของแต่ละคน (ตรงกับที่ตั้งในระบบด้านล่าง) ─────────────────────────────────────────────────
function shiftOf(username, date) {
    if (username === "kittisak" && date >= "2026-08-03") return { start: "08:00", end: "17:00", weekdays: "1111100" };
    if (username === "pawinee") return { start: "09:00", end: "17:00", weekdays: "1111110" };
    return { start: "09:00", end: "18:00", weekdays: "1111100" };
}

// ─── เหตุการณ์พิเศษรายคนรายวัน ────────────────────────────────────────────────────────────────
// in / out = เวลาที่กด · forgotIn / forgotOut = ลืมกด (มีคำขอแก้เวลาตามมา) · absent = ขาดงาน (ไม่กด ไม่ลา)
const SPECIAL_DAYS = {
    "siriporn|2026-06-19": { forgotOut: true },
    "thanawat|2026-06-24": { in: "09:41" },
    "apichart|2026-06-08": { in: "09:12" },
    "kittisak|2026-07-14": { forgotIn: true },
    "piyapong|2026-07-22": { in: "09:18" },
    "kittisak|2026-08-07": { absent: true },
    "apichart|2026-08-18": { forgotOut: true },
    "thanawat|2026-08-20": { in: "09:27" },
    "piyapong|2026-09-10": { out: "16:30" },
    "chonthicha|2026-09-23": { forgotOut: true },
    "supawadee|2026-09-29": { in: "09:35" },
    "wannipa|2026-10-02": { forgotIn: true },
    "pawinee|2026-10-10": { in: "09:16" },
    "thanawat|2026-10-21": { forgotOut: true },
};

// คำขอแก้เวลา: วันที่ขอ (ทำงานวันถัดไป) · อนุมัติ/ไม่อนุมัติ · ไม่ใส่ decision = ยังรออนุมัติ
const CORRECTIONS = [
    { user: "siriporn", workDate: "2026-06-19", type: "out", time: "18:20", reason: "ลืมกดออกงาน ออกจากออฟฟิศตามปกติหลังประชุมทีมขาย", filed: "2026-06-22", decision: "approve" },
    { user: "kittisak", workDate: "2026-07-14", type: "in", time: "08:52", reason: "แบตมือถือหมดตอนมาถึงออฟฟิศ ชาร์จแล้วลืมกด", filed: "2026-07-14", decision: "approve" },
    {
        user: "apichart", workDate: "2026-08-18", type: "out", time: "19:30", reason: "ลืมกดออกงาน อยู่แก้บั๊กระบบจองห้องพักต่อ", filed: "2026-08-19",
        decision: "reject", rejectReason: "ระบบประตูและกล้องหน้าออฟฟิศบันทึกออกเวลา 18:10 กรุณาขอใหม่ตามเวลาจริง",
    },
    { user: "apichart", workDate: "2026-08-18", type: "out", time: "18:10", reason: "ขอใหม่ตามเวลาออกจริง (คำขอเดิมใส่เวลาผิด)", filed: "2026-08-20", decision: "approve" },
    { user: "chonthicha", workDate: "2026-09-23", type: "out", time: "18:05", reason: "ลืมกดออกงานเพราะรีบไปรับลูก", filed: "2026-09-24", decision: "approve" },
    { user: "wannipa", workDate: "2026-10-02", type: "in", time: "08:47", reason: "มือถือค้าง กดเข้างานไม่ติด", filed: "2026-10-02", decision: "approve" },
    { user: "thanawat", workDate: "2026-10-21", type: "out", time: "18:30", reason: "ออกไปพบลูกค้าโกลเด้นซีช่วงเย็นต่อ ลืมกดออก", filed: "2026-10-22" },
];

// OT: ขอล่วงหน้า (filed) → ตัดสิน (decided) · ไม่ใส่ decision = รออนุมัติ · cancel = พนักงานยกเลิกเอง
const OVERTIME = [
    { user: "supawadee", date: "2026-08-26", start: "18:00", end: "20:00", reason: "เตรียมระบบรับซื้อปาล์มก่อนสาธิตให้ลูกค้า", filed: "2026-08-24", decided: "2026-08-25", decision: "approve" },
    { user: "weerayut", date: "2026-08-26", start: "18:00", end: "20:00", reason: "ส่งมอบโมดูลรับซื้อก่อนวันทำงานวันสุดท้าย", filed: "2026-08-24", decided: "2026-08-25", decision: "approve" },
    { user: "weerayut", date: "2026-08-27", start: "18:00", end: "19:30", reason: "เขียนเอกสารส่งต่องานโมดูลรับซื้อ", filed: "2026-08-25", decided: "2026-08-25", decision: "approve" },
    {
        user: "thanawat", date: "2026-09-04", start: "18:00", end: "20:00", reason: "เตรียมเอกสารนำเสนอระบบติดตามรถ", filed: "2026-09-02", decided: "2026-09-03",
        decision: "reject", rejectReason: "งานเตรียมเอกสารขายให้จัดในเวลางาน ถ้าไม่ทันแจ้งหัวหน้าฝ่ายขายช่วยแบ่งงาน",
    },
    { user: "apichart", date: "2026-09-12", start: "09:00", end: "13:00", reason: "ย้ายข้อมูลห้องพักจากระบบเดิมของรีสอร์ท (ต้องทำวันที่ระบบหยุดรับจอง)", filed: "2026-09-09", decided: "2026-09-10", decision: "approve" },
    { user: "nattapon", date: "2026-09-30", start: "18:00", end: "21:00", reason: "ติดตั้งระบบจองห้องพักขึ้นเซิร์ฟเวอร์จริงนอกเวลาทำการของรีสอร์ท", filed: "2026-09-28", decided: "2026-09-29", decision: "approve" },
    { user: "chonthicha", date: "2026-10-09", start: "18:00", end: "20:00", reason: "ปรับหน้าจอแอปจุดรับซื้อตามที่ลูกค้าขอ", filed: "2026-10-06", cancel: "2026-10-08" },
    { user: "supawadee", date: "2026-10-13", start: "09:00", end: "15:00", reason: "เปิดใช้งานระบบรับซื้อจริงที่โรงงาน (วันหยุดราชการ โรงงานยังเปิดรับผลปาล์ม)", filed: "2026-10-08", decided: "2026-10-09", decision: "approve" },
    { user: "kittisak", date: "2026-10-13", start: "09:00", end: "15:00", reason: "ทดสอบระบบรับซื้อหน้างานวันเปิดใช้จริง", filed: "2026-10-08", decided: "2026-10-09", decision: "approve" },
    { user: "piyapong", date: "2026-10-27", start: "18:00", end: "20:00", reason: "ส่งแอปจองดำน้ำขึ้น TestFlight ให้ลูกค้าทดสอบ", filed: "2026-10-22" },
];

// WFH รายวัน (นอกจากวันประจำ) — ขอก่อนวันจริง
const WFH_REQUESTS = [
    { user: "chonthicha", date: "2026-08-19", reason: "ทำงานออกแบบต่อเนื่อง ไม่มีประชุมที่ออฟฟิศ", filed: "2026-08-17", decision: "approve" },
    { user: "chonthicha", date: "2026-09-16", reason: "รอช่างมาซ่อมหลังคาบ้านช่วงบ่าย", filed: "2026-09-14", decision: "approve" },
    {
        user: "chonthicha", date: "2026-09-29", reason: "อยากทำงานเงียบๆ ที่บ้าน", filed: "2026-09-25", decision: "reject",
        rejectReason: "วันนี้มีเวิร์กช็อปออกแบบกับลูกค้าสยามปาล์มที่ออฟฟิศ ต้องเข้ามา",
    },
    { user: "supawadee", date: "2026-10-07", reason: "รอรับเอกสารราชการที่บ้าน", filed: "2026-10-05", decision: "approve" },
    { user: "supawadee", date: "2026-10-16", reason: "ไม่สบายเล็กน้อย ทำงานได้แต่ไม่อยากแพร่เชื้อในออฟฟิศ", filed: "2026-10-15", cancel: "2026-10-15" },
    { user: "chonthicha", date: "2026-10-28", reason: "ทำงานออกแบบหน้าจอชุดใหม่ต่อเนื่อง", filed: "2026-10-22" },
];

// พนักงานขายออกพบลูกค้า: กดเข้างานที่หน้างานลูกค้า (นอกจุด ต้องใส่เหตุผล)
const CLIENT_VISITS = {
    "thanawat|2026-06-10": { latitude: 8.03264, longitude: 98.82361, note: "ประชุมกับลูกค้าอันดามัน บีช รีสอร์ท ที่อ่าวนาง ก่อนเข้าออฟฟิศ" },
    "thanawat|2026-07-08": { latitude: 8.07152, longitude: 98.91684, note: "นำเอกสารสัญญาไปให้ลูกค้ากระบี่ ฮอลิเดย์ ทัวร์" },
    "thanawat|2026-08-27": { latitude: 7.88812, longitude: 98.39812, note: "นำเสนอระบบติดตามรถ ลูกค้าโกลเด้นซี ภูเก็ต" },
    "thanawat|2026-09-28": { latitude: 8.03311, longitude: 98.82502, note: "สำรวจหน้าร้านอ่าวนาง ซีฟู้ด ก่อนทำใบเสนอราคา POS" },
    "siriporn|2026-07-20": { latitude: 7.98412, longitude: 99.18837, note: "ประชุมเซ็นสัญญากับโรงงานสยามปาล์ม" },
    "pawinee|2026-09-15": { latitude: 7.95231, longitude: 98.33842, note: "พบลูกค้าโรงแรมที่หาดกะตะ ภูเก็ต" },
};

/**
 * @param {{ on: Function, ids: object, state: object, addDays: Function, isHoliday: (date: string) => boolean, weekdayIndex: (date: string) => number, lastDay: string }} context
 */
function scheduleAttendance({ on, ids, state, addDays, isHoliday, weekdayIndex, lastDay }) {
    const employeeOf = (username) => data.EMPLOYEES.find((employee) => employee.username === username);
    // วันขาดงาน: ลงชั่วโมงต่อโปรเจกต์ (scheduleTimesheets) ต้องข้ามวันนี้ด้วย
    state.absentDays = new Set(Object.entries(SPECIAL_DAYS).filter(([, special]) => special.absent).map(([key]) => key));
    const tasksByDate = new Map();
    const task = (date, time, label, run) => {
        if (!tasksByDate.has(date)) tasksByDate.set(date, []);
        tasksByDate.get(date).push({ minute: toMinutes(time), label, run, order: tasksByDate.get(date).length });
    };

    // ── ตั้งค่าก่อนเริ่มใช้ (20 พ.ค.): กะ จุดลงเวลา วันเริ่มใช้ · ระหว่างทาง: จุดหน้างานลูกค้า กะรายคน WFH ประจำ
    on("2026-05-20", "ตั้งค่าลงเวลาเข้า-ออกงาน (เริ่ม 1 มิ.ย.)", async () => {
        const setup = await as(HR, "GET", "/V1/people/setup");
        ids.schedules = { office: setup.work_schedules[0].ws_id };
        for (const [key, schedule] of Object.entries(data.EXTRA_SCHEDULES)) {
            ids.schedules[key] = (await as(HR, "POST", "/V1/people/work-schedules", schedule)).ws_id;
        }
        ids.locations = {};
        ids.locations.headOffice = (
            await as(HR, "POST", "/V1/people/attendance-locations", { ...data.LOCATIONS.headOffice, al_branch_id: HEAD_OFFICE_ID })
        ).al_id;
        await updatePeopleSettings({ ps_attendance_start_date: START_DATE, ps_default_schedule_id: ids.schedules.office });
    });
    on("2026-07-01", "ปิยะพงษ์ WFH ทุกวันศุกร์", () =>
        as(HR, "PUT", `/V1/employees/${ids.employees.piyapong}/wfh-days`, { emp_wfh_weekdays: "0000100" }),
    );
    on("2026-07-27", "จุดลงเวลาหน้างานโรงงานสยามปาล์ม", async () => {
        ids.locations.siamPalmSite = (await as(HR, "POST", "/V1/people/attendance-locations", data.LOCATIONS.siamPalmSite)).al_id;
    });
    on("2026-07-29", "กิตติศักดิ์เปลี่ยนเป็นกะเช้า (ดูแลระบบลูกค้าช่วงเช้า)", () =>
        as(HR, "POST", `/V1/employees/${ids.employees.kittisak}/schedules`, { es_schedule_id: ids.schedules.early, es_effective_from: "2026-08-03" }),
    );
    on("2026-08-28", "จุดลงเวลาสาขาภูเก็ต + กะขายหน้าร้านของปวีณา", async () => {
        ids.locations.phuket = (
            await as(HR, "POST", "/V1/people/attendance-locations", { ...data.LOCATIONS.phuket, al_branch_id: ids.branches.phuket })
        ).al_id;
        await as(HR, "POST", `/V1/employees/${ids.employees.pawinee}/schedules`, {
            es_schedule_id: ids.schedules.saturday,
            es_effective_from: "2026-09-01",
        });
    });

    // ── วัน WFH ของแต่ละคน (วันประจำ + คำขอที่อนุมัติ) — ใช้เลือกพิกัดตอนกด
    const approvedWfh = new Set(WFH_REQUESTS.filter((request) => request.decision === "approve").map((request) => `${request.user}|${request.date}`));
    const isWfhDay = (username, date) =>
        approvedWfh.has(`${username}|${date}`) || (username === "piyapong" && date >= "2026-07-03" && weekdayIndex(date) === 4);
    const approvedOvertime = new Map(OVERTIME.filter((item) => item.decision === "approve").map((item) => [`${item.user}|${item.date}`, item]));

    function pointFor(username, date, random) {
        const jitter = () => (random() - 0.5) * 0.0006;
        if (isWfhDay(username, date)) {
            const home = data.HOMES[username];
            return { latitude: home.latitude + jitter(), longitude: home.longitude + jitter() };
        }
        let base = data.LOCATIONS.headOffice;
        if (username === "pawinee") base = data.LOCATIONS.phuket;
        // ทีมระบบรับซื้อปาล์มไปทำงานที่โรงงานทุกวันพฤหัส (มีจุดลงเวลาหน้างานแล้ว)
        const atPalmSite = ["supawadee", "kittisak", "weerayut"].includes(username) && date >= "2026-08-06" && weekdayIndex(date) === 3;
        if (atPalmSite || (approvedOvertime.has(`${username}|${date}`) && date === "2026-10-13")) base = data.LOCATIONS.siamPalmSite;
        return { latitude: base.al_latitude + jitter(), longitude: base.al_longitude + jitter() };
    }

    function punch(username, date, type, time, point, note = null, accuracy = 15) {
        task(date, time, `${username} กด${type === "in" ? "เข้า" : "ออก"}งาน`, () =>
            as(username, "POST", "/V1/attendance/punch", { ap_type: type, ...point, accuracy, note }),
        );
    }

    // ── การกดรายวัน
    for (const username of ATTENDEES) {
        const employee = employeeOf(username);
        const firstDay = employee.hire > START_DATE ? employee.hire : START_DATE;
        const lastWorkDay = employee.leaves?.lastDay ?? LAST_PUNCH_DAY;
        for (let date = firstDay; date <= lastWorkDay; date = addDays(date, 1)) {
            const overtime = approvedOvertime.get(`${username}|${date}`);
            const shift = shiftOf(username, date);
            const isWorkingDay = shift.weekdays[weekdayIndex(date)] === "1" && !isHoliday(date);
            if (!isWorkingDay && !overtime) continue;
            const leaveHours = state.leaveDays.get(username)?.get(date) ?? 0;
            if (leaveHours >= 8) continue;
            const special = SPECIAL_DAYS[`${username}|${date}`] ?? {};
            if (special.absent) continue;

            const random = randomFor(`${username}|${date}`);
            const accuracy = 8 + Math.floor(random() * 25);
            const point = pointFor(username, date, random);
            const shiftStart = toMinutes(shift.start);
            const shiftEnd = toMinutes(shift.end);

            // เวลาเข้า: ปกติก่อนเข้างาน 2-30 นาที · สุ่มสายเล็กน้อย ~3% ของวัน · ลาครึ่งเช้า = เข้าก่อนบ่ายโมง
            let inMinute = shiftStart - 2 - Math.floor(random() * 28);
            if (random() < 0.03) inMinute = shiftStart + 3 + Math.floor(random() * 20);
            if (leaveHours === 4) inMinute = toMinutes("12:50") + Math.floor(random() * 8);
            if (!isWorkingDay && overtime) inMinute = toMinutes(overtime.start) - 5 - Math.floor(random() * 10);
            if (special.in) inMinute = toMinutes(special.in);

            // เวลาออก: หลังเลิกงาน 0-35 นาที · มี OT = หลังเวลาเลิก OT 3-15 นาที
            let outMinute = shiftEnd + Math.floor(random() * 35);
            if (overtime) outMinute = toMinutes(overtime.end) + 3 + Math.floor(random() * 12);
            if (special.out) outMinute = toMinutes(special.out);

            const visit = CLIENT_VISITS[`${username}|${date}`];
            if (!special.forgotIn) {
                if (visit) punch(username, date, "in", toTime(inMinute), { latitude: visit.latitude, longitude: visit.longitude }, visit.note, accuracy);
                else punch(username, date, "in", toTime(inMinute), point, null, accuracy);
            }
            if (!special.forgotOut) punch(username, date, "out", toTime(outMinute), point, null, accuracy);
        }
    }

    // ── คำขอแก้เวลา
    for (const correction of CORRECTIONS) {
        const approver = approverOf(correction.user);
        const request = {
            ac_work_date: correction.workDate,
            ac_type: correction.type,
            ac_time: correction.time,
            ac_reason: correction.reason,
        };
        task(correction.filed, "09:40", `${correction.user} ขอแก้เวลา ${correction.workDate}`, async () => {
            correction.id = (await as(correction.user, "POST", "/V1/attendance/corrections", request)).ac_id;
        });
        if (correction.decision === "approve") {
            task(correction.filed, "14:10", `อนุมัติแก้เวลา ${correction.user}`, () =>
                as(approver, "POST", `/V1/attendance/corrections/${correction.id}/approve`, {}),
            );
        }
        if (correction.decision === "reject") {
            task(correction.filed, "14:10", `ไม่อนุมัติแก้เวลา ${correction.user}`, () =>
                as(approver, "POST", `/V1/attendance/corrections/${correction.id}/reject`, { reason: correction.rejectReason }),
            );
        }
    }

    // ── OT
    for (const overtime of OVERTIME) {
        const approver = approverOf(overtime.user);
        task(overtime.filed, "11:20", `${overtime.user} ขอ OT ${overtime.date}`, async () => {
            overtime.id = (
                await as(overtime.user, "POST", "/V1/attendance/overtime", {
                    ot_work_date: overtime.date,
                    ot_start_time: overtime.start,
                    ot_end_time: overtime.end,
                    ot_reason: overtime.reason,
                })
            ).ot_id;
        });
        if (overtime.decision === "approve") {
            task(overtime.decided, "15:30", `อนุมัติ OT ${overtime.user}`, () => as(approver, "POST", `/V1/attendance/overtime/${overtime.id}/approve`, {}));
        }
        if (overtime.decision === "reject") {
            task(overtime.decided, "15:30", `ไม่อนุมัติ OT ${overtime.user}`, () =>
                as(approver, "POST", `/V1/attendance/overtime/${overtime.id}/reject`, { reason: overtime.rejectReason }),
            );
        }
        if (overtime.cancel) {
            task(overtime.cancel, "16:45", `${overtime.user} ยกเลิก OT`, () => as(overtime.user, "POST", `/V1/attendance/overtime/${overtime.id}/cancel`, {}));
        }
    }

    // ── WFH รายวัน
    for (const request of WFH_REQUESTS) {
        const approver = approverOf(request.user);
        task(request.filed, "10:15", `${request.user} ขอ WFH ${request.date}`, async () => {
            request.id = (await as(request.user, "POST", "/V1/attendance/wfh", { wfh_date: request.date, wfh_reason: request.reason })).wfh_id;
        });
        if (request.decision === "approve") {
            task(request.filed, "13:30", `อนุมัติ WFH ${request.user}`, () => as(approver, "POST", `/V1/attendance/wfh/${request.id}/approve`, {}));
        }
        if (request.decision === "reject") {
            task(request.filed, "13:30", `ไม่อนุมัติ WFH ${request.user}`, () =>
                as(approver, "POST", `/V1/attendance/wfh/${request.id}/reject`, { reason: request.rejectReason }),
            );
        }
        if (request.cancel) {
            task(request.cancel, "16:20", `${request.user} ยกเลิก WFH`, () => as(request.user, "POST", `/V1/attendance/wfh/${request.id}/cancel`, {}));
        }
    }

    // ── หนึ่งเหตุการณ์ต่อวัน: ทำตามเวลาในวันนั้น (นาฬิกาจำลองเดินตาม)
    for (const [date, tasks] of tasksByDate) {
        if (date > lastDay) throw new Error(`งานลงเวลาวันที่ ${date} เลยวันสุดท้ายของข้อมูล (${lastDay})`);
        on(date, `ลงเวลาและคำขอ ${date} (${tasks.length} รายการ)`, async () => {
            tasks.sort((first, second) => first.minute - second.minute || first.order - second.order);
            for (const item of tasks) {
                setToday(date, Math.floor(item.minute / 60), item.minute % 60);
                try {
                    await item.run();
                } catch (error) {
                    throw new Error(`${toTime(item.minute)} ${item.label}: ${error.message}`);
                }
            }
        });
    }
}

module.exports = { scheduleAttendance, START_DATE, LAST_PUNCH_DAY };
