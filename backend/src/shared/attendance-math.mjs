// ─── คิดลงเวลาเข้า-ออกงานรายวัน (2026-10-23 ช่วง A-1) ─────────────────────────────────────────────
//
// ต้นฉบับอยู่ที่ backend/src/shared/ — สำเนาใน frontend/lib/shared/ สร้างด้วย `npm run sync-shared` ห้ามแก้ที่สำเนา
// แบบระบบ: docs/plans/2026-10-23-attendance-ot.md หัวข้อ 3
//
// เวลาทั้งหมดเป็นข้อความเวลาไทย ("2026-10-23 08:52:10") ไม่ผ่าน Date ของเครื่อง · คิดเป็น "นาทีนับจากเที่ยงคืนของวันทำงาน"
// (กะข้ามเที่ยงคืน เวลาหลังเที่ยงคืนจึงเกิน 1440 ได้) · เศษวินาทีตัดทิ้ง (เข้า 09:00:59 = 09:00)
// สาย = เข้าหลังเวลาเข้างานเกินผ่อนผัน → นับจากเวลาเข้างาน (Q3 ก) · ออกก่อน = เลิกก่อนเวลาเลิกงาน

import { addDays, daysBetween, weekdayIndex } from "./payroll-math.mjs";

const MINUTES_PER_DAY = 1440;
const EARTH_RADIUS_METERS = 6371000;

/** "09:30" หรือ "09:30:00" → 570 */
export function timeToMinutes(timeText) {
    const [hours, minutes] = String(timeText).split(":").map(Number);
    return hours * 60 + minutes;
}

/** 570 → "09:30" (เกิน 24 ชม. วนกลับ เช่น 1500 → "01:00") */
export function minutesToTime(totalMinutes) {
    const inDay = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    const hours = String(Math.floor(inDay / 60)).padStart(2, "0");
    const minutes = String(inDay % 60).padStart(2, "0");
    return `${hours}:${minutes}`;
}

/** เวลาเลิก <= เวลาเข้า = เลิกวันถัดไป */
export function crossesMidnight(schedule) {
    return timeToMinutes(schedule.ws_end_time) <= timeToMinutes(schedule.ws_start_time);
}

/** ความยาวกะ (นาที) ตั้งแต่เข้าถึงเลิก รวมพัก */
export function scheduleSpanMinutes(schedule) {
    const span = timeToMinutes(schedule.ws_end_time) - timeToMinutes(schedule.ws_start_time);
    return span <= 0 ? span + MINUTES_PER_DAY : span;
}

/** เวลาทำงานจริงของกะ (นาที) = ความยาวกะ − พัก */
export function scheduleWorkMinutes(schedule) {
    return scheduleSpanMinutes(schedule) - schedule.ws_break_minutes;
}

/**
 * วันทำงานของการกด — กะข้ามคืน: กดก่อน "เวลาเข้า − ช่วงเปิดกดเข้า" ถือเป็นของกะเมื่อวาน
 * (กะ 22:00-06:00 เปิดกด 120 นาที: กด 05:30 = กะเมื่อวาน · กด 21:00 = กะวันนี้)
 * @param {string} dateTimeText "YYYY-MM-DD HH:MM:SS"
 */
export function workDateOf(dateTimeText, schedule) {
    const [date, clock] = dateTimeText.split(" ");
    if (!crossesMidnight(schedule)) return date;
    const opensAt = timeToMinutes(schedule.ws_start_time) - schedule.ws_checkin_open_minutes;
    return timeToMinutes(clock) < opensAt ? addDays(date, -1) : date;
}

/** เวลาที่กด → นาทีนับจากเที่ยงคืนของวันทำงาน */
export function minutesFromWorkDate(workDate, dateTimeText) {
    const [date, clock] = dateTimeText.split(" ");
    return daysBetween(workDate, date) * MINUTES_PER_DAY + timeToMinutes(clock);
}

/**
 * ช่วงเวลาที่ต้องอยู่ของวัน (นาทีนับจากเที่ยงคืนของวันทำงาน) · ลาครึ่งวัน = เหลือครึ่งที่ไม่ได้ลา
 * @param {"morning" | "afternoon" | null} halfDayLeave
 */
export function expectedWindowOf(schedule, halfDayLeave = null) {
    const start = timeToMinutes(schedule.ws_start_time);
    const end = start + scheduleSpanMinutes(schedule);
    const middle = start + Math.floor((end - start) / 2);
    if (halfDayLeave === "morning") return { start: middle, end };
    if (halfDayLeave === "afternoon") return { start, end: middle };
    return { start, end };
}

/** ระยะระหว่างสองพิกัด (เมตร · ปัดเป็นจำนวนเต็ม) — สูตร haversine */
export function distanceMeters(fromLatitude, fromLongitude, toLatitude, toLongitude) {
    const toRadians = (degrees) => (Number(degrees) * Math.PI) / 180;
    const latitudeDelta = toRadians(toLatitude) - toRadians(fromLatitude);
    const longitudeDelta = toRadians(toLongitude) - toRadians(fromLongitude);
    const haversine =
        Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
    return Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine)));
}

/**
 * จุดลงเวลาที่ใกล้ที่สุด + อยู่ในรัศมีไหม
 * @template {{ al_latitude: string | number, al_longitude: string | number, al_radius_m: number }} Location
 * @param {{ latitude: number, longitude: number } | null} point null = ไม่มีตำแหน่ง
 * @param {Location[]} locations
 * @returns {{ location: Location | null, distance: number | null, isInside: boolean }}
 */
export function nearestLocation(point, locations) {
    if (!point || locations.length === 0) return { location: null, distance: null, isInside: false };
    let nearest = null;
    let nearestDistance = Infinity;
    for (const location of locations) {
        const distance = distanceMeters(point.latitude, point.longitude, location.al_latitude, location.al_longitude);
        if (distance < nearestDistance) {
            nearest = location;
            nearestDistance = distance;
        }
    }
    return { location: nearest, distance: nearestDistance, isInside: nearestDistance <= nearest.al_radius_m };
}

/**
 * สถานะและตัวเลขของวันหนึ่ง
 * status: not_employed · not_tracked (ก่อนวันเริ่มใช้ลงเวลา) · not_required (ไม่ต้องลงเวลา) · off (วันหยุด) · off_worked (มาวันหยุด) · leave (ลาเต็มวัน)
 *         upcoming (ยังไม่ถึง) · not_yet (วันนี้ยังไม่กด) · working (วันนี้เข้าแล้วยังไม่ออก)
 *         present (ครบ) · incomplete (มีเข้าหรือออกอย่างเดียว · ต้องขอแก้) · absent (ขาด)
 * @param {{
 *   workDate: string, today: string, schedule: object, isHoliday: boolean, leave: "full" | "morning" | "afternoon" | null,
 *   isEmployed: boolean, isRequired: boolean, punches: { ap_type: "in" | "out", ap_at: string }[],
 *   trackingFrom?: string | null
 * }} input trackingFrom = วันเริ่มใช้ลงเวลา (ก่อนนั้นไม่นับขาด/สาย · null = นับทุกวัน)
 */
export function dayAttendanceOf({ workDate, today, schedule, isHoliday, leave, isEmployed, isRequired, punches, trackingFrom = null }) {
    const ins = punches.filter((punch) => punch.ap_type === "in").map((punch) => punch.ap_at).sort();
    const outs = punches.filter((punch) => punch.ap_type === "out").map((punch) => punch.ap_at).sort();
    const firstIn = ins[0] ?? null;
    const lastOut = outs.length > 0 ? outs[outs.length - 1] : null;
    const isWorkingDay = schedule.ws_working_weekdays[weekdayIndex(workDate)] === "1" && !isHoliday;
    const halfDayLeave = leave === "morning" || leave === "afternoon" ? leave : null;
    const window = expectedWindowOf(schedule, halfDayLeave);
    const result = {
        work_date: workDate,
        status: "present",
        is_working_day: isWorkingDay,
        expected_start: minutesToTime(window.start),
        expected_end: minutesToTime(window.end),
        first_in: firstIn,
        last_out: lastOut,
        late_minutes: 0,
        early_leave_minutes: 0,
        present_minutes: 0,
    };

    if (!isEmployed) return { ...result, status: "not_employed" };
    if (!isRequired) return { ...result, status: "not_required" };
    if (trackingFrom && workDate < trackingFrom) return { ...result, status: "not_tracked" };
    const hasPunch = firstIn !== null || lastOut !== null;
    if (!isWorkingDay) return { ...result, status: hasPunch ? "off_worked" : "off" };
    if (leave === "full") return { ...result, status: "leave" };
    if (workDate > today) return { ...result, status: "upcoming" };
    if (!hasPunch) return { ...result, status: workDate === today ? "not_yet" : "absent" };

    const inMinutes = firstIn === null ? null : minutesFromWorkDate(workDate, firstIn);
    const outMinutes = lastOut === null ? null : minutesFromWorkDate(workDate, lastOut);
    const lateBy = inMinutes === null ? 0 : inMinutes - window.start;
    result.late_minutes = lateBy > schedule.ws_late_grace_minutes ? lateBy : 0;

    const isComplete = inMinutes !== null && outMinutes !== null && outMinutes > inMinutes;
    if (!isComplete) {
        const isStillWorking = workDate === today && inMinutes !== null && outMinutes === null;
        return { ...result, status: isStillWorking ? "working" : "incomplete" };
    }
    result.early_leave_minutes = Math.max(0, window.end - outMinutes);
    result.present_minutes = outMinutes - inMinutes;
    return result;
}

/** สรุปของหลายวัน (หน้าเดือนนี้ / สรุปรายเดือน) */
export function attendanceTotalsOf(days) {
    const totals = { present: 0, late_days: 0, late_minutes: 0, early_leave_minutes: 0, absent: 0, incomplete: 0, leave: 0 };
    for (const day of days) {
        if (day.status === "present" || day.status === "working") totals.present += 1;
        if (day.status === "absent") totals.absent += 1;
        if (day.status === "incomplete") totals.incomplete += 1;
        if (day.status === "leave") totals.leave += 1;
        if (day.late_minutes > 0) totals.late_days += 1;
        totals.late_minutes += day.late_minutes;
        totals.early_leave_minutes += day.early_leave_minutes;
    }
    return totals;
}

/**
 * เวลาเต็มของการกดที่ขอแก้ (ลงเวลา A-2): วันทำงาน + เวลา → "YYYY-MM-DD HH:MM:00"
 * กะข้ามคืน: เวลาหลังเที่ยงคืนเป็นของวันถัดไป (ออก 05:30 ของกะ 22:00-06:00) · เวลาที่ไม่อยู่ในวันทำงานนั้น = null
 * @param {string} workDate "YYYY-MM-DD"
 * @param {string} timeText "HH:MM" หรือ "HH:MM:SS"
 */
export function punchDateTimeOf(workDate, timeText, schedule) {
    const clock = `${String(timeText).slice(0, 5)}:00`;
    const sameDay = `${workDate} ${clock}`;
    if (workDateOf(sameDay, schedule) === workDate) return sameDay;
    const nextDay = `${addDays(workDate, 1)} ${clock}`;
    if (workDateOf(nextDay, schedule) === workDate) return nextDay;
    return null;
}

// ─── OT (ลงเวลา A-3 · 2026-10-24) ───────────────────────────────────────────────────────────────

/**
 * แยกนาทีของช่วง OT ตามชนิด (พ.ร.บ.คุ้มครองแรงงาน ม.61-63)
 * - วันทำงาน: นาทีนอกเวลางานปกติ = OT วันทำงาน · ช่วงที่ทับเวลางานปกติไม่นับ (overlapsNormalHours = true ให้ฟอร์มเตือน)
 * - วันหยุด (วันหยุดของกะ/วันหยุดบริษัท): ช่วงที่อยู่ในเวลาปกติของกะ = ทำงานวันหยุด (ไม่เกินชั่วโมงงานของกะ) · ที่เหลือ = OT วันหยุด
 * @param {{ workDate: string, startAt: string, endAt: string, schedule: object, isHoliday: boolean }} input เวลาเต็ม "YYYY-MM-DD HH:MM:SS"
 */
export function overtimeSplitOf({ workDate, startAt, endAt, schedule, isHoliday }) {
    const start = minutesFromWorkDate(workDate, startAt);
    const end = minutesFromWorkDate(workDate, endAt);
    const total = Math.max(0, end - start);
    const normal = expectedWindowOf(schedule);
    const overlap = Math.max(0, Math.min(end, normal.end) - Math.max(start, normal.start));
    const isOffDay = isHoliday || schedule.ws_working_weekdays[weekdayIndex(workDate)] !== "1";
    if (!isOffDay) {
        return { workday: total - overlap, holidayWork: 0, holidayOvertime: 0, overlapsNormalHours: overlap > 0, isOffDay };
    }
    const holidayWork = Math.min(overlap, scheduleWorkMinutes(schedule));
    return { workday: 0, holidayWork, holidayOvertime: total - holidayWork, overlapsNormalHours: false, isOffDay };
}

/**
 * ช่วง OT ที่ทำจริง = ช่วงที่อนุมัติ ∩ เวลาเข้า-ออกจริงของวัน · ไม่ได้อยู่ = null
 * @returns {{ startAt: string, endAt: string } | null}
 */
export function actualOvertimeWindowOf({ startAt, endAt, firstIn, lastOut }) {
    if (!firstIn || !lastOut) return null;
    const actualStart = startAt > firstIn ? startAt : firstIn;
    const actualEnd = endAt < lastOut ? endAt : lastOut;
    return actualEnd > actualStart ? { startAt: actualStart, endAt: actualEnd } : null;
}

/** ปัดลงทีละ 15 นาที (OT จ่ายเป็นช่วง 15 นาทีเต็ม) */
export function floorToQuarterHour(minutes) {
    return Math.floor(Math.max(0, minutes) / 15) * 15;
}
