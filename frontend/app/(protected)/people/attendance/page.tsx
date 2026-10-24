"use client";

// ลงเวลาเข้า-ออกงาน (2026-10-23 ช่วง A-1 · A-2 เพิ่มขอแก้เวลา) — แทนลงชั่วโมงต่อโปรเจกต์ (ปิดเป็นค่าเริ่มต้น · เปิดกลับได้ในตั้งค่าบุคคล)
// แบบระบบ: docs/plans/2026-10-23-attendance-ot.md หัวข้อ 4 · มือถือเป็นหลัก (ปุ่มใหญ่กดด้วยนิ้วโป้ง) · WFH (2026-10-24)
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Clock3, House, PencilLine } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { ATTENDANCE_MESSAGES, CORRECTION_MESSAGES, OVERTIME_MESSAGES, WFH_MESSAGES } from "../_messages";
import type { AttendanceDay, MyAttendance } from "../_types";
import PunchCard from "./_components/punch-card";
import MonthSummary from "./_components/month-summary";
import MyCorrections from "./_components/my-corrections";
import CorrectionSheet, { type CorrectionDefaults } from "./_components/correction-sheet";
import OvertimeSheet, { addMinutesToTime, type OvertimeDefaults } from "./_components/overtime-sheet";
import OvertimeList from "./_components/overtime-list";
import WfhSheet from "./_components/wfh-sheet";
import WfhList from "./_components/wfh-list";
import { usePeopleSetup } from "../_hooks/use-people-setup";

type Loaded = { data: MyAttendance; loadedAt: number };

/** ค่าเริ่มต้นของคำขอแก้เวลาจากวันที่กด: ยังไม่มีเข้า → ขอเวลาเข้า (ตามกะ) · มีเข้าแล้ว → ขอเวลาออก (ตามกะ) */
function correctionDefaultsOf(day: AttendanceDay): CorrectionDefaults {
    const isMissingIn = !day.first_in;
    return {
        ac_work_date: day.work_date,
        ac_type: isMissingIn ? "in" : "out",
        ac_time: (isMissingIn ? day.expected_start : day.expected_end) ?? "09:00",
    };
}

/** วันที่เติมให้ในคำขอ WFH: วันทำงานถัดไป (นับวันนี้) ที่ยังไม่ใช่วัน WFH ไม่ได้ลา และยังไม่ได้กด · ไม่เจอในเดือนนี้ = วันนี้ */
function wfhDefaultDateOf(data: MyAttendance) {
    const nextDay = data.days.find(
        (day) =>
            day.work_date >= data.today &&
            day.is_working_day &&
            !day.is_wfh &&
            day.status !== "leave" &&
            day.punches.length === 0,
    );
    return nextDay?.work_date ?? data.today;
}

export default function AttendancePage() {
    const [month, setMonth] = useState<string | null>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [correction, setCorrection] = useState<CorrectionDefaults | null>(null);
    const [overtime, setOvertime] = useState<OvertimeDefaults | null>(null);
    const [wfhDate, setWfhDate] = useState<string | null>(null);
    const { setup } = usePeopleSetup();

    const load = useCallback(async (requestedMonth: string | null) => {
        const query = requestedMonth ? `?month=${requestedMonth}` : "";
        const { data, error } = await apiFetch<MyAttendance>(`/attendance/me${query}`);
        setLoadError(error);
        if (data) setLoaded({ data, loadedAt: Date.now() });
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        const query = month ? `?month=${month}` : "";
        apiFetch<MyAttendance>(`/attendance/me${query}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setLoaded({ data, loadedAt: Date.now() });
        });
        return () => {
            isLeftPage = true;
        };
    }, [month]);

    const header = (
        <PageHeader eyebrow="บุคคล" title="ลงเวลาเข้า-ออกงาน" description={ATTENDANCE_MESSAGES.description} />
    );

    if (loadError)
        return (
            <div className="grid w-full gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดลงเวลาไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    if (!loaded || (month !== null && loaded.data.month !== month)) return <PageSkeleton />;
    const { data, loadedAt } = loaded;

    if (!data.employee) {
        return (
            <div className="grid w-full gap-6">
                {header}
                <StatusBanner tone="info" title="ยังลงเวลาไม่ได้">
                    {ATTENDANCE_MESSAGES.notEmployee}
                </StatusBanner>
            </div>
        );
    }

    const graceMinutes = data.today_day?.schedule?.ws_late_grace_minutes ?? 0;
    const reload = () => load(month);

    return (
        <div className="grid w-full gap-5">
            {header}
            {/* จอกว้าง (xl): ซ้าย = กดเข้า/ออก + คำขอ · ขวา = สรุปเดือน · จอเล็กเรียงลงมาตามเดิม */}
            <div className="grid items-start gap-5 xl:grid-cols-2">
                <div className="grid gap-5">
                    {data.attendance_required ? (
                        <PunchCard data={data} loadedAt={loadedAt} onPunched={reload} />
                    ) : (
                        <StatusBanner tone="info" title="คุณไม่ต้องลงเวลา">
                            {ATTENDANCE_MESSAGES.notRequired}
                        </StatusBanner>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <HowItWorks label="กติกาและข้อมูลที่เก็บ">
                            <p>{ATTENDANCE_MESSAGES.rules(graceMinutes)}</p>
                            <p>{ATTENDANCE_MESSAGES.offsite}</p>
                            <p>{WFH_MESSAGES.rules}</p>
                            <p>{CORRECTION_MESSAGES.request}</p>
                            <p>{OVERTIME_MESSAGES.request}</p>
                            {setup?.settings && (
                                <p>
                                    {OVERTIME_MESSAGES.rates(
                                        setup.settings.ps_ot_rate_workday,
                                        setup.settings.ps_ot_rate_holiday_work,
                                        setup.settings.ps_ot_rate_holiday_ot,
                                        setup.settings.ps_ot_weekly_cap_hours,
                                    )}
                                </p>
                            )}
                            <p>{ATTENDANCE_MESSAGES.privacy}</p>
                        </HowItWorks>
                        {data.attendance_required && (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() =>
                                        setCorrection({
                                            ac_work_date: data.today,
                                            ac_type: "in",
                                            ac_time: data.today_day?.expected_start ?? "09:00",
                                        })
                                    }
                                >
                                    <PencilLine size={14} />
                                    ขอแก้เวลา
                                </button>
                                <button
                                    type="button"
                                    className={buttonClass("secondary", "sm")}
                                    onClick={() => {
                                        // ค่าเริ่มต้น: วันนี้ เริ่มตอนเลิกงานตามกะ 2 ชั่วโมง
                                        const start = data.today_day?.expected_end ?? "18:00";
                                        setOvertime({
                                            ot_work_date: data.today,
                                            ot_start_time: start,
                                            ot_end_time: addMinutesToTime(start, 120),
                                        });
                                    }}
                                >
                                    <Clock3 size={14} />
                                    ขอ OT
                                </button>
                                {data.wfh_weekdays !== "1111111" && (
                                    <button
                                        type="button"
                                        className={buttonClass("secondary", "sm")}
                                        onClick={() => setWfhDate(wfhDefaultDateOf(data))}
                                    >
                                        <House size={14} />
                                        ขอ WFH
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                    {data.timesheet_enabled && (
                        <Link
                            href="/people/timesheet"
                            className="-my-1 justify-self-start py-1 text-sm text-blue-600 hover:underline"
                        >
                            ลงชั่วโมงต่อโปรเจกต์ (ใช้คิดต้นทุนโปรเจกต์) →
                        </Link>
                    )}
                    <MyCorrections corrections={data.corrections} onChanged={reload} />
                    <OvertimeList overtime={data.overtime} now={data.now} onChanged={reload} />
                    {data.attendance_required && (
                        <WfhList
                            weekdays={data.wfh_weekdays}
                            requests={data.wfh_requests}
                            today={data.today}
                            onChanged={reload}
                        />
                    )}
                </div>
                <MonthSummary
                    month={data.month}
                    today={data.today}
                    days={data.days}
                    totals={data.totals}
                    onMonthChange={setMonth}
                    onRequestCorrection={
                        data.attendance_required ? (day) => setCorrection(correctionDefaultsOf(day)) : undefined
                    }
                />
            </div>
            {overtime && (
                <OvertimeSheet
                    key={`${overtime.ot_work_date}-${overtime.ot_start_time}`}
                    defaults={overtime}
                    onClose={() => setOvertime(null)}
                    onSaved={reload}
                />
            )}
            {wfhDate && (
                <WfhSheet
                    key={wfhDate}
                    defaultDate={wfhDate}
                    today={data.today}
                    onClose={() => setWfhDate(null)}
                    onSaved={reload}
                />
            )}
            {correction && (
                <CorrectionSheet
                    key={`${correction.ac_work_date}-${correction.ac_type}`}
                    defaults={correction}
                    today={data.today}
                    onClose={() => setCorrection(null)}
                    onSaved={reload}
                />
            )}
        </div>
    );
}
