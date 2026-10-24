"use client";

// การ์ดกดเข้า/ออกงาน (มือถือเป็นหลัก · 2026-10-23 ช่วง A-1)
// นาฬิกา = เวลาเซิร์ฟเวอร์ตอนโหลด + เวลาที่ผ่านไปบนเครื่อง (ไม่ใช้นาฬิกามือถือตรงๆ) · เวลาที่บันทึกจริงเซิร์ฟเวอร์เป็นคนกำหนด
// ปุ่มใหญ่ = ขั้นถัดไป (ยังไม่เข้า/ออกแล้ว → เข้างาน · เข้าแล้ว → ออกงาน) · นอกจุด/ไม่มีตำแหน่ง ต้องใส่เหตุผลก่อนกด
// วัน WFH (2026-10-24) = ไม่ตรวจตำแหน่ง ไม่ต้องใส่เหตุผล (ยังส่งพิกัดไปบันทึก)
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { House, LogIn, LogOut, MapPin, RefreshCw } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import { inputClass } from "@/components/ui/form-field";
import { CARD_CLASS } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { nearestLocation } from "@/lib/shared/attendance-math.mjs";
import { ATTENDANCE_MESSAGES, ATTENDANCE_STATUS, WFH_MESSAGES } from "../../_messages";
import type { AttendanceDay, MyAttendance } from "../../_types";
import { dayLabel } from "../../timesheet/_components/week-lines";
import { scheduleLabel } from "../../_schedule-label";
import { useLocation, type LocationState } from "./use-location";

type PunchType = "in" | "out";

const PUNCH_LABEL: Record<PunchType, string> = { in: "เข้างาน", out: "ออกงาน" };

// "2026-10-23 08:52:10" → เวลา (ms) แบบ UTC ล้วน ใช้บวกเวลาที่ผ่านไปแล้วจัดรูปแบบกลับด้วย timeZone UTC
function serverTextToMs(text: string) {
    const [date, clock] = text.split(" ");
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes, seconds] = clock.split(":").map(Number);
    return Date.UTC(year, month - 1, day, hours, minutes, seconds);
}

const clockFormatter = new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
});

// เวลาเซิร์ฟเวอร์ตอนนี้ (ms) = เวลาตอนโหลด + เวลาที่ผ่านไปบนเครื่อง · เดินทุกวินาที
function useServerNow(serverNow: string, loadedAt: number) {
    const [tick, setTick] = useState(loadedAt);
    useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);
    return serverTextToMs(serverNow) + Math.max(0, tick - loadedAt);
}

const timeOf = (dateTimeText: string | null | undefined) => (dateTimeText ? dateTimeText.slice(11, 16) : "-");

function durationText(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours} ชม. ${minutes} นาที` : `${minutes} นาที`;
}

/** ปุ่มหลัก = ตรงข้ามกับการกดครั้งล่าสุดของวัน */
function nextPunchOf(day: AttendanceDay | null): PunchType {
    const lastPunch = day?.punches[day.punches.length - 1];
    return lastPunch?.ap_type === "in" ? "out" : "in";
}

function todaySummary(day: AttendanceDay | null) {
    if (!day) return "";
    if (day.first_in && !day.last_out) return `เข้า ${timeOf(day.first_in)}`;
    if (day.first_in && day.last_out) return `เข้า ${timeOf(day.first_in)} · ออก ${timeOf(day.last_out)}`;
    if (day.last_out) return `ออก ${timeOf(day.last_out)} (ยังไม่มีเวลาเข้า)`;
    return "ยังไม่ได้กด";
}

function distanceText(meters: number) {
    return meters >= 1000 ? `${(meters / 1000).toFixed(1)} กม.` : `${meters} ม.`;
}

export default function PunchCard({
    data,
    loadedAt,
    onPunched,
}: {
    data: MyAttendance;
    loadedAt: number;
    onPunched: () => Promise<void>;
}) {
    const { location, relocate } = useLocation();
    const serverNowMs = useServerNow(data.now, loadedAt);
    const [note, setNote] = useState("");
    const [noteError, setNoteError] = useState<string | null>(null);
    const [punchError, setPunchError] = useState<string | null>(null);
    const [isPunching, setIsPunching] = useState(false);

    const day = data.today_day;
    const nextPunch = nextPunchOf(day);
    const point = location.kind === "ready" ? { latitude: location.latitude, longitude: location.longitude } : null;
    const hasLocations = data.locations.length > 0;
    const nearest = nearestLocation(point, data.locations);
    const isWfh = day?.is_wfh ?? false;
    const isOffsite = !isWfh && hasLocations && !nearest.isInside;
    const isLocating = location.kind === "locating";
    const status = day ? ATTENDANCE_STATUS[day.status] : null;

    async function punch(type: PunchType) {
        setPunchError(null);
        setNoteError(null);
        if (isOffsite && !note.trim()) {
            setNoteError("อยู่นอกจุดลงเวลา · ใส่เหตุผลก่อนกด เช่น ไปพบลูกค้า");
            return;
        }
        setIsPunching(true);
        const { data: result, error } = await apiFetch<{ is_duplicate: boolean; day: AttendanceDay }>("/attendance/punch", {
            method: "POST",
            body: {
                ap_type: type,
                latitude: location.kind === "ready" ? location.latitude : null,
                longitude: location.kind === "ready" ? location.longitude : null,
                accuracy: location.kind === "ready" ? location.accuracy : null,
                note: note.trim() || null,
            },
        });
        setIsPunching(false);
        if (error) {
            setNoteError(error.fields.note ?? null);
            setPunchError(error.fields.note ? null : error.message);
            return;
        }
        navigator.vibrate?.(40);
        const punchedAt = result.day.punches.filter((item) => item.ap_type === type).at(-1)?.ap_at;
        toast.success(`${PUNCH_LABEL[type]} ${timeOf(punchedAt)} แล้ว`);
        setNote("");
        await onPunched();
    }

    const PunchIcon = nextPunch === "in" ? LogIn : LogOut;
    const otherPunch: PunchType = nextPunch === "in" ? "out" : "in";
    const hasPunchedToday = (day?.punches.length ?? 0) > 0;

    return (
        <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`} aria-label="ลงเวลาวันนี้">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-0.5">
                    <span className="text-sm text-gray-500">{dayLabel(day?.work_date ?? data.today)}</span>
                    <span className="text-4xl font-medium text-gray-900">
                        <span className="tabular-nums">{clockFormatter.format(new Date(serverNowMs))}</span>
                    </span>
                    <span className="text-sm text-gray-600">
                        {day?.schedule ? scheduleLabel(day.schedule) : "ยังไม่มีกะทำงาน"}
                    </span>
                </div>
                <span className="flex flex-wrap justify-end gap-1.5">
                    {isWfh && <StatusPill tone="info">WFH</StatusPill>}
                    {status && <StatusPill tone={status.tone}>{status.label}</StatusPill>}
                </span>
            </div>

            <p className="text-sm text-gray-700">
                {todaySummary(day)}
                {day?.late_minutes ? <span className="text-red-600"> · สาย {day.late_minutes} นาที</span> : null}
                {day?.status === "working" && day.first_in && (
                    <span className="text-gray-500">
                        {" "}
                        · ทำงานมาแล้ว{" "}
                        {durationText(Math.max(0, Math.floor((serverNowMs - serverTextToMs(day.first_in)) / 60_000)))}
                    </span>
                )}
            </p>

            {isWfh ? (
                <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-700">
                    <House size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <span>{WFH_MESSAGES.punch}</span>
                </p>
            ) : (
                <LocationLine location={location} hasLocations={hasLocations} nearest={nearest} onRelocate={relocate} />
            )}

            {isOffsite && (
                <div className="grid gap-1.5">
                    <label htmlFor="punch-note" className="text-sm text-gray-800">
                        เหตุผลที่กดนอกจุด <span className="text-red-600">*</span>
                    </label>
                    <input
                        id="punch-note"
                        maxLength={255}
                        value={note}
                        placeholder="เช่น ไปพบลูกค้าที่บริษัท ABC"
                        onChange={(event) => setNote(event.target.value)}
                        className={inputClass(Boolean(noteError))}
                    />
                    <FieldHint error={noteError}>{ATTENDANCE_MESSAGES.offsite}</FieldHint>
                </div>
            )}

            <div className="grid justify-items-center gap-3 py-2">
                <button
                    type="button"
                    disabled={isPunching || isLocating}
                    onClick={() => punch(nextPunch)}
                    className={`flex h-40 w-40 flex-col items-center justify-center gap-2 rounded-full text-lg font-medium text-white shadow-float transition active:scale-95 disabled:opacity-60 ${
                        nextPunch === "in" ? "bg-linear-to-br from-blue-500 to-blue-600" : "bg-linear-to-br from-gray-700 to-gray-900"
                    }`}
                >
                    <PunchIcon size={32} aria-hidden="true" />
                    {isPunching ? "กำลังบันทึก..." : isLocating ? "กำลังหาตำแหน่ง..." : PUNCH_LABEL[nextPunch]}
                </button>
                {hasPunchedToday && (
                    <button
                        type="button"
                        disabled={isPunching || isLocating}
                        onClick={() => punch(otherPunch)}
                        className="min-h-10 text-sm text-blue-600 hover:underline disabled:opacity-60"
                    >
                        กด{PUNCH_LABEL[otherPunch]}อีกครั้ง
                    </button>
                )}
                {punchError && <FieldHint error={punchError} />}
            </div>
        </section>
    );
}

function LocationLine({
    location,
    hasLocations,
    nearest,
    onRelocate,
}: {
    location: LocationState;
    hasLocations: boolean;
    nearest: { location: { al_name: string } | null; distance: number | null; isInside: boolean };
    onRelocate: () => void;
}) {
    let text: React.ReactNode;
    let tone = "text-gray-600";
    if (location.kind === "locating") text = "กำลังหาตำแหน่ง...";
    else if (location.kind === "denied") {
        text = <>ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง · {ATTENDANCE_MESSAGES.gpsDenied}</>;
        tone = "text-red-600";
    } else if (location.kind === "unavailable") {
        text = location.reason === "insecure" ? ATTENDANCE_MESSAGES.gpsInsecure : "หาตำแหน่งไม่สำเร็จ · ออกไปที่โล่งหรือเปิด GPS แล้วกด หาตำแหน่งใหม่";
        tone = "text-red-600";
    } else if (!hasLocations) text = ATTENDANCE_MESSAGES.noLocations;
    else if (nearest.isInside) {
        text = `อยู่ในจุดลงเวลา ${nearest.location?.al_name} (${distanceText(nearest.distance ?? 0)})`;
        tone = "text-blue-700";
    } else {
        text = `อยู่นอกจุดลงเวลา · ห่าง ${nearest.location?.al_name} ${distanceText(nearest.distance ?? 0)}`;
        tone = "text-amber-700";
    }

    return (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-gray-50 px-3 py-2.5">
            <span className={`flex min-w-0 flex-1 items-start gap-2 text-sm ${tone}`}>
                <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0">{text}</span>
            </span>
            {location.kind !== "locating" && (
                <button
                    type="button"
                    onClick={onRelocate}
                    className="inline-flex min-h-9 items-center gap-1 text-sm text-blue-600 hover:underline"
                >
                    <RefreshCw size={14} aria-hidden="true" />
                    หาตำแหน่งใหม่
                </button>
            )}
        </div>
    );
}
