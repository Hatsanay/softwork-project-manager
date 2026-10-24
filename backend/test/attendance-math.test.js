// คิดลงเวลาเข้า-ออกงานรายวัน (2026-10-23 ช่วง A-1) — สาย/ออกก่อน/ขาด/ไม่ครบ · ลาครึ่งวัน · กะข้ามคืน · ระยะ GPS
// แบบระบบ: docs/plans/2026-10-23-attendance-ot.md หัวข้อ 3 · ไม่ขึ้นกับเขตเวลาเครื่อง (เวลาเป็นข้อความล้วน)
const test = require("node:test");
const assert = require("node:assert/strict");
const {
    dayAttendanceOf,
    distanceMeters,
    nearestLocation,
    scheduleWorkMinutes,
    workDateOf,
    attendanceTotalsOf,
} = require("../src/shared/attendance-math.mjs");

// วันพฤหัสบดี 22 ต.ค. 2026 · วันนี้ = 23 ต.ค.
const OFFICE = {
    ws_start_time: "09:00",
    ws_end_time: "18:00",
    ws_break_minutes: 60,
    ws_working_weekdays: "1111100",
    ws_late_grace_minutes: 10,
    ws_checkin_open_minutes: 120,
};
const NIGHT = { ...OFFICE, ws_start_time: "22:00", ws_end_time: "06:00", ws_working_weekdays: "1111111" };

function day(punches, overrides = {}) {
    return dayAttendanceOf({
        workDate: "2026-10-22",
        today: "2026-10-23",
        schedule: OFFICE,
        isHoliday: false,
        leave: null,
        isEmployed: true,
        isRequired: true,
        punches,
        ...overrides,
    });
}

const inAt = (time, date = "2026-10-22") => ({ ap_type: "in", ap_at: `${date} ${time}` });
const outAt = (time, date = "2026-10-22") => ({ ap_type: "out", ap_at: `${date} ${time}` });

test("สาย: ไม่เกินผ่อนผัน = ไม่สาย · เกินแล้วนับจากเวลาเข้างาน (Q3 ก) · เศษวินาทีไม่นับ", () => {
    assert.equal(day([inAt("09:10:59"), outAt("18:00:00")]).late_minutes, 0, "10 นาที = ยังอยู่ในผ่อนผัน");
    assert.equal(day([inAt("09:15:00"), outAt("18:00:00")]).late_minutes, 15, "เกินผ่อนผัน นับ 15 ไม่ใช่ 5");
    assert.equal(day([inAt("08:30:00"), outAt("18:00:00")]).late_minutes, 0);
});

test("ออกก่อน · ครบ · ใช้เข้าครั้งแรกและออกครั้งสุดท้าย", () => {
    const result = day([inAt("08:55:00"), inAt("13:00:00"), outAt("12:00:00"), outAt("17:30:00")]);
    assert.equal(result.status, "present");
    assert.equal(result.first_in, "2026-10-22 08:55:00");
    assert.equal(result.last_out, "2026-10-22 17:30:00");
    assert.equal(result.early_leave_minutes, 30);
    assert.equal(result.present_minutes, 515);
});

test("ไม่ครบ / ขาด / ยังไม่กด / กำลังทำงาน / ยังไม่ถึง", () => {
    assert.equal(day([inAt("09:00:00")]).status, "incomplete", "เมื่อวานเข้าแล้วไม่ออก = ไม่ครบ ต้องขอแก้ (Q4 ก)");
    assert.equal(day([outAt("18:00:00")]).status, "incomplete");
    assert.equal(day([]).status, "absent");
    assert.equal(day([], { workDate: "2026-10-23" }).status, "not_yet");
    assert.equal(day([inAt("09:00:00", "2026-10-23")], { workDate: "2026-10-23" }).status, "working");
    assert.equal(day([], { workDate: "2026-10-26" }).status, "upcoming");
});

test("วันหยุด · ลาเต็มวัน · ไม่ต้องลงเวลา · นอกช่วงที่เป็นพนักงาน ไม่นับขาด", () => {
    assert.equal(day([], { workDate: "2026-10-24" }).status, "off", "เสาร์");
    assert.equal(day([inAt("10:00:00", "2026-10-24")], { workDate: "2026-10-24" }).status, "off_worked");
    assert.equal(day([], { isHoliday: true }).status, "off");
    assert.equal(day([], { leave: "full" }).status, "leave");
    assert.equal(day([], { isRequired: false }).status, "not_required");
    assert.equal(day([], { isEmployed: false }).status, "not_employed");
    assert.equal(day([], { trackingFrom: "2026-10-23" }).status, "not_tracked", "ก่อนวันเริ่มใช้ลงเวลา ไม่นับขาด");
    assert.equal(day([], { trackingFrom: "2026-10-22" }).status, "absent", "ตั้งแต่วันเริ่มใช้ นับขาดตามปกติ");
});

test("ลาครึ่งวัน: ลาเช้า นับสายจากครึ่งหลัง · ลาบ่าย เลิกได้ครึ่งวัน", () => {
    const morningLeave = day([inAt("13:20:00"), outAt("18:00:00")], { leave: "morning" });
    assert.equal(morningLeave.expected_start, "13:30");
    assert.equal(morningLeave.late_minutes, 0);
    const afternoonLeave = day([inAt("09:00:00"), outAt("13:30:00")], { leave: "afternoon" });
    assert.equal(afternoonLeave.expected_end, "13:30");
    assert.equal(afternoonLeave.early_leave_minutes, 0);
});

test("กะข้ามเที่ยงคืน: วันทำงาน = วันเริ่มกะ · ออกหลังเที่ยงคืนไม่ใช่ออกก่อน", () => {
    assert.equal(workDateOf("2026-10-23 05:30:00", NIGHT), "2026-10-22");
    assert.equal(workDateOf("2026-10-22 21:00:00", NIGHT), "2026-10-22");
    assert.equal(workDateOf("2026-10-22 05:30:00", OFFICE), "2026-10-22", "กะปกติไม่เลื่อนวัน");
    assert.equal(scheduleWorkMinutes(NIGHT), 420);
    const result = day([inAt("22:05:00"), outAt("06:10:00", "2026-10-23")], { schedule: NIGHT });
    assert.equal(result.status, "present");
    assert.equal(result.late_minutes, 0);
    assert.equal(result.early_leave_minutes, 0);
    assert.equal(result.present_minutes, 485);
});

test("ระยะ GPS: จุดที่ใกล้ที่สุด + ในรัศมีไหม · ไม่มีตำแหน่ง = นอกจุด", () => {
    // ~111 เมตรต่อ 0.001 องศาละติจูด
    assert.equal(Math.round(distanceMeters(13.7, 100.5, 13.701, 100.5) / 10), 11);
    const locations = [
        { al_id: 1, al_name: "สำนักงานใหญ่", al_latitude: "13.700000", al_longitude: "100.500000", al_radius_m: 150 },
        { al_id: 2, al_name: "สาขาเชียงใหม่", al_latitude: "18.790000", al_longitude: "98.980000", al_radius_m: 150 },
    ];
    const inside = nearestLocation({ latitude: 13.7005, longitude: 100.5 }, locations);
    assert.equal(inside.location.al_id, 1);
    assert.equal(inside.isInside, true);
    const outside = nearestLocation({ latitude: 13.71, longitude: 100.5 }, locations);
    assert.equal(outside.isInside, false);
    assert.equal(nearestLocation(null, locations).isInside, false);
});

test("สรุปรวม: นับวันสาย นาทีสาย ขาด ไม่ครบ", () => {
    const totals = attendanceTotalsOf([
        day([inAt("09:15:00"), outAt("18:00:00")]),
        day([inAt("09:00:00"), outAt("17:00:00")]),
        day([]),
        day([inAt("09:00:00")]),
    ]);
    assert.deepEqual(totals, {
        present: 2,
        late_days: 1,
        late_minutes: 15,
        early_leave_minutes: 60,
        absent: 1,
        incomplete: 1,
        leave: 0,
    });
});

test("OT: วันทำงานนับเฉพาะนอกเวลางาน (ทับเวลางาน = เตือน) · วันหยุดแยกในเวลาปกติ/นอกเวลา · ทำจริง = ช่วงที่อนุมัติ ∩ เข้า-ออก", () => {
    const { overtimeSplitOf, actualOvertimeWindowOf, floorToQuarterHour } = require("../src/shared/attendance-math.mjs");
    const evening = overtimeSplitOf({
        workDate: "2026-10-22",
        startAt: "2026-10-22 18:00:00",
        endAt: "2026-10-22 20:30:00",
        schedule: OFFICE,
        isHoliday: false,
    });
    assert.deepEqual(evening, { workday: 150, holidayWork: 0, holidayOvertime: 0, overlapsNormalHours: false, isOffDay: false });
    const overlapping = overtimeSplitOf({
        workDate: "2026-10-22",
        startAt: "2026-10-22 17:00:00",
        endAt: "2026-10-22 19:00:00",
        schedule: OFFICE,
        isHoliday: false,
    });
    assert.equal(overlapping.overlapsNormalHours, true);
    // เสาร์ 09:00-20:00: ในเวลาปกติของกะ (9 ชม. รวมพัก) นับทำงานวันหยุดได้ไม่เกิน 8 ชม. ที่เหลือ 3 ชม. = OT วันหยุด
    const saturday = overtimeSplitOf({
        workDate: "2026-10-24",
        startAt: "2026-10-24 09:00:00",
        endAt: "2026-10-24 20:00:00",
        schedule: OFFICE,
        isHoliday: false,
    });
    assert.deepEqual(saturday, { workday: 0, holidayWork: 480, holidayOvertime: 180, overlapsNormalHours: false, isOffDay: true });
    const companyHoliday = overtimeSplitOf({
        workDate: "2026-10-23",
        startAt: "2026-10-23 10:00:00",
        endAt: "2026-10-23 12:00:00",
        schedule: OFFICE,
        isHoliday: true,
    });
    assert.equal(companyHoliday.holidayWork, 120);

    const actual = actualOvertimeWindowOf({
        startAt: "2026-10-22 18:00:00",
        endAt: "2026-10-22 20:30:00",
        firstIn: "2026-10-22 08:55:00",
        lastOut: "2026-10-22 19:52:00",
    });
    assert.deepEqual(actual, { startAt: "2026-10-22 18:00:00", endAt: "2026-10-22 19:52:00" });
    assert.equal(floorToQuarterHour(112), 105, "1 ชม. 52 นาที = จ่าย 1 ชม. 45 นาที");
    assert.equal(actualOvertimeWindowOf({ startAt: "2026-10-22 18:00:00", endAt: "2026-10-22 20:00:00", firstIn: "2026-10-22 09:00:00", lastOut: "2026-10-22 17:30:00" }), null);
});
