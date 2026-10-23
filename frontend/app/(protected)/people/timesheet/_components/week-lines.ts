// ข้อมูลลงเวลาหนึ่งสัปดาห์ในรูป "แถวงาน" (U-2 · 2026-10-19)
// แถวงาน = โปรเจกต์ + งาน · ช่อง = วันที่ → ชั่วโมง + รายละเอียด · จอคอมแสดงเป็นตาราง มือถือแสดงรายวัน (ข้อมูลชุดเดียวกัน)
// ส่ง backend เป็นรายการแบน (วันที่ + โปรเจกต์ + งาน ห้ามซ้ำในวันเดียวกัน) เรียงตามแถวแล้วตามวัน — ลำดับนี้ใช้จับคู่ error กลับมาที่ช่อง
import { formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import type { FieldErrors } from "@/lib/form-errors";
import type { TimesheetDay, TimesheetEntry } from "../../_types";

export type WeekCell = { hours: string; note: string };

export type WeekLine = {
    key: string;
    project_id: string;
    task_id: string;
    cells: Record<string, WeekCell>;
};

export type PayloadEntry = {
    tse_date: string;
    tse_project_id: string;
    tse_task_id: string;
    tse_hours: string;
    tse_note: string;
};

// error ของช่องหนึ่ง (แถว + วัน) · error ของแถว (โปรเจกต์/งาน) รวมจากทุกวันในแถว
export type CellErrors = Partial<Record<"hours" | "note" | "date", string>>;
export type LineErrors = Partial<Record<"project" | "task", string>>;

const HOURS_STEP = 25n;

const HALF_DAY_LEAVE_NOTE = { morning: "ลาครึ่งวันเช้า", afternoon: "ลาครึ่งวันบ่าย" };

// "2026-10-19" → "จ. 19 ต.ค." (วันที่ล้วน ไม่ผ่านเขตเวลาเครื่อง)
export function dayLabel(dateText: string) {
    return new Intl.DateTimeFormat("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    }).format(new Date(`${dateText}T00:00:00Z`));
}

// "2026-10-19" → "จ. 19" (หัวตาราง)
export function shortDayLabel(dateText: string) {
    return new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", timeZone: "UTC" }).format(
        new Date(`${dateText}T00:00:00Z`),
    );
}

/** วันหยุดบริษัท · วันหยุดประจำสัปดาห์ · ลา (ไม่มี = วันทำงานปกติ) */
export function dayNoteOf(day: TimesheetDay): string | null {
    if (day.holiday_name) return day.holiday_name;
    if (!day.is_working_day) return "วันหยุด";
    if (day.leave === "full") return "ลาเต็มวัน";
    if (day.leave) return HALF_DAY_LEAVE_NOTE[day.leave];
    return null;
}

let lineSequence = 0;
export function newLineKey() {
    lineSequence += 1;
    return `line-${lineSequence}`;
}

export function emptyLine(projectId = "", taskId = "", cells: Record<string, WeekCell> = {}): WeekLine {
    return { key: newLineKey(), project_id: projectId, task_id: taskId, cells };
}

/** แถวงานจากรายการที่บันทึกไว้ — โปรเจกต์+งานเดียวกันรวมเป็นแถวเดียว เรียงตามที่เจอก่อน */
export function linesFromEntries(entries: TimesheetEntry[]): WeekLine[] {
    const lines: WeekLine[] = [];
    for (const entry of entries) {
        const projectId = entry.tse_project_id ?? "";
        const taskId = entry.tse_task_id ?? "";
        let line = lines.find((item) => item.project_id === projectId && item.task_id === taskId && !item.cells[entry.tse_date]);
        if (!line) {
            line = emptyLine(projectId, taskId);
            lines.push(line);
        }
        line.cells[entry.tse_date] = { hours: String(Number(entry.tse_hours)), note: entry.tse_note ?? "" };
    }
    return lines;
}

/** รายการที่ส่ง backend + ตำแหน่ง (แถว วัน) ของแต่ละรายการ ใช้แปลง error "entries.N.field" กลับมาที่ช่อง */
export function entriesFromLines(lines: WeekLine[], dates: string[]) {
    const entries: PayloadEntry[] = [];
    const positions: { lineKey: string; date: string }[] = [];
    for (const line of lines) {
        for (const date of dates) {
            const cell = line.cells[date];
            if (!cell) continue;
            entries.push({
                tse_date: date,
                tse_project_id: line.project_id,
                tse_task_id: line.task_id,
                tse_hours: cell.hours,
                tse_note: cell.note,
            });
            positions.push({ lineKey: line.key, date });
        }
    }
    return { entries, positions };
}

/** error จากชุดตรวจ/backend → ต่อช่อง (key "แถว|วัน") และต่อแถว */
export function errorsByPosition(errors: FieldErrors, positions: { lineKey: string; date: string }[]) {
    const cellErrors = new Map<string, CellErrors>();
    const lineErrors = new Map<string, LineErrors>();
    for (const [path, message] of Object.entries(errors)) {
        const match = path.match(/^entries\.(\d+)\.(\w+)$/);
        const position = match ? positions[Number(match[1])] : undefined;
        if (!match || !position || !message) continue;
        const field = match[2];
        if (field === "tse_project_id" || field === "tse_task_id") {
            const current = lineErrors.get(position.lineKey) ?? {};
            current[field === "tse_project_id" ? "project" : "task"] = message;
            lineErrors.set(position.lineKey, current);
            continue;
        }
        const cellKey = `${position.lineKey}|${position.date}`;
        const current = cellErrors.get(cellKey) ?? {};
        if (field === "tse_hours") current.hours = message;
        if (field === "tse_note") current.note = message;
        if (field === "tse_date") current.date = message;
        cellErrors.set(cellKey, current);
    }
    return { cellErrors, lineErrors };
}

/** รวมชั่วโมง (แสดงผล) — ช่องที่ยังพิมพ์ไม่ถูกไม่นับ ชุดตรวจจะบอกตอนบันทึก */
export function sumHours(values: string[]): string {
    let total = 0n;
    for (const value of values) {
        try {
            total += parseHundredths(value || "0", "ชั่วโมง");
        } catch {
            // ยังพิมพ์ไม่เสร็จ
        }
    }
    return String(Number(formatHundredths(total)));
}

export function dayHours(lines: WeekLine[], date: string) {
    return sumHours(lines.map((line) => line.cells[date]?.hours ?? ""));
}

export function lineHours(line: WeekLine) {
    return sumHours(Object.values(line.cells).map((cell) => cell.hours));
}

/** วันที่เติมชั่วโมงอัตโนมัติได้: ลงได้ · เป็นวันทำงาน · ไม่ได้ลาเต็มวัน · ยังไม่มีชั่วโมงในแถวไหนเลย */
export function isFillableDay(day: TimesheetDay, lines: WeekLine[]) {
    if (day.blocked_reason !== null || !day.is_working_day || day.leave === "full") return false;
    return dayHours(lines, day.date) === "0";
}

/** ชั่วโมงที่เติมให้วันหนึ่ง: ชั่วโมงทำงานต่อวัน · ลาครึ่งวัน = ครึ่งหนึ่ง (ปัดลงทีละ 15 นาที) */
export function fillHoursFor(day: TimesheetDay, hoursPerDay: string): string {
    const fullDay = parseHundredths(hoursPerDay, "ชั่วโมง");
    const isHalfDayLeave = day.leave === "morning" || day.leave === "afternoon";
    const hours = isHalfDayLeave ? ((fullDay / 2n) / HOURS_STEP) * HOURS_STEP : fullDay;
    return String(Number(formatHundredths(hours)));
}
