// ชื่อกะสำหรับแสดง (2026-10-24) — ชื่อที่มีเวลาอยู่แล้ว (เช่น "ออฟฟิศ 09:00-18:00") ไม่ต่อท้ายเวลาซ้ำ
export function scheduleLabel(schedule: { ws_name: string; ws_start_time: string; ws_end_time: string }) {
    if (schedule.ws_name.includes(schedule.ws_start_time)) return schedule.ws_name;
    return `${schedule.ws_name} (${schedule.ws_start_time}-${schedule.ws_end_time})`;
}

const SHORT_WEEKDAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

// วัน WFH ประจำ (2026-10-24): "1010000" → "จ. พ." · ทุกวัน → "ทุกวัน (WFH เต็มเวลา)" · ไม่มี → ""
export function wfhWeekdaysText(weekdays: string) {
    if (weekdays === "1111111") return "ทุกวัน (WFH เต็มเวลา)";
    return SHORT_WEEKDAYS.filter((_, index) => weekdays[index] === "1").join(" ");
}
