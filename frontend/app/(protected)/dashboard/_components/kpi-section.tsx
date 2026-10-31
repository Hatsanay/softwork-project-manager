"use client";

// KPI (ปรับหน้า 2026-10-31): การ์ดเดียว ตัวกรองชุดเดียว (ช่วงเวลา · ชนิดงาน · รูปแบบโปรเจกต์) ใช้ทั้ง "ของฉัน" และ "รายคน"
// ของฉัน = 4 ช่อง (ตรงเวลามีแถบ + ป้าย ดี/พอใช้/ต้องเร่ง) · รายคน = ตาราง (จอใหญ่) / การ์ดต่อคน (มือถือ) · ต้องมีสิทธิ์ดู KPI ของสมาชิก
// ไม่มีข้อมูล = บอกเป็นคำว่าทำไม ไม่ใช่ "-" ลอยๆ
import { useEffect, useState } from "react";
import {
    CalendarClock,
    CircleAlert,
    CircleCheck,
    Gauge,
    Timer,
    TriangleAlert,
    Trophy,
    Wrench,
    type LucideIcon,
} from "lucide-react";
import Segmented from "@/components/ui/segmented";
import SearchableSelect from "@/components/ui/SearchableSelect";
import Skeleton from "@/components/ui/skeleton";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch } from "@/lib/api";
import { PROJECT_TYPE_OPTIONS, TASK_TYPE_OPTIONS, formatHours, formatRate } from "../_labels";
import type { Kpis, MemberKpiRow, ProjectOption, ProjectTypeFilter, TaskTypeFilter } from "../_types";
import DashboardCard, { Avatar, EmptyLine } from "./dashboard-card";

export type KpiPeriod = { mode: "month" | "year"; month: string; year: string };

// ปีที่เลือกได้ = ปีนี้ย้อนหลัง
const YEAR_CHOICES = 5;

export function periodValue(period: KpiPeriod) {
    return period.mode === "year" ? period.year : period.month;
}

function taskTypeWord(taskType: TaskTypeFilter) {
    if (taskType === "task") return "Task หลัก";
    if (taskType === "subtask") return "Subtask";
    return "งาน";
}

// ระดับของอัตราตรงเวลา: สีแถบ + ป้าย (สีสถานะมีไอคอนและคำกำกับเสมอ ไม่ใช้สีอย่างเดียว)
type RateLevel = { label: string; icon: LucideIcon; bar: string; chip: string };
function rateLevel(rate: number): RateLevel {
    if (rate >= 80) return { label: "ดี", icon: CircleCheck, bar: "bg-green-500", chip: "bg-green-50 text-green-700" };
    if (rate >= 50)
        return { label: "พอใช้", icon: CircleAlert, bar: "bg-amber-500", chip: "bg-amber-50 text-amber-700" };
    return { label: "ต้องเร่ง", icon: TriangleAlert, bar: "bg-red-500", chip: "bg-red-50 text-red-700" };
}

function RateBar({ rate }: { rate: number }) {
    const level = rateLevel(rate);
    return (
        <span className="block h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            <span className={`block h-full rounded-full ${level.bar}`} style={{ width: `${Math.min(rate, 100)}%` }} />
        </span>
    );
}

function LevelChip({ rate }: { rate: number }) {
    const level = rateLevel(rate);
    const Icon = level.icon;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${level.chip}`}>
            <Icon size={12} aria-hidden="true" />
            {level.label}
        </span>
    );
}

// ─── ตัวกรอง ─────────────────────────────────────────────────────────────────────────────

function KpiFilters({
    period,
    onPeriodChange,
    taskType,
    onTaskTypeChange,
    projectType,
    onProjectTypeChange,
}: {
    period: KpiPeriod;
    onPeriodChange: (period: KpiPeriod) => void;
    taskType: TaskTypeFilter;
    onTaskTypeChange: (value: TaskTypeFilter) => void;
    projectType: ProjectTypeFilter;
    onProjectTypeChange: (value: ProjectTypeFilter) => void;
}) {
    const thisYear = new Date().getFullYear();
    return (
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 flex flex-wrap items-center gap-2 sm:col-span-1">
                <Segmented
                    label="ช่วงเวลา"
                    value={period.mode}
                    onChange={(mode) => onPeriodChange({ ...period, mode })}
                    options={[
                        { value: "month", label: "รายเดือน" },
                        { value: "year", label: "รายปี" },
                    ]}
                />
                {period.mode === "month" ? (
                    <input
                        type="month"
                        aria-label="เดือน"
                        value={period.month}
                        onChange={(event) => onPeriodChange({ ...period, month: event.target.value })}
                        className={`${inputClass(false, "sm")} basis-full sm:w-44 sm:basis-auto`}
                    />
                ) : (
                    <select
                        aria-label="ปี"
                        value={period.year}
                        onChange={(event) => onPeriodChange({ ...period, year: event.target.value })}
                        className={`${inputClass(false, "sm")} basis-full sm:w-32 sm:basis-auto`}
                    >
                        {Array.from({ length: YEAR_CHOICES }, (_, index) => thisYear - index).map((year) => (
                            <option key={year} value={year}>
                                {year + 543}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            <select
                aria-label="ชนิดงาน"
                value={taskType}
                onChange={(event) => onTaskTypeChange(event.target.value as TaskTypeFilter)}
                className={`${inputClass(false, "sm")} sm:w-36`}
            >
                {TASK_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.value === "all" ? "ทุกชนิดงาน" : option.label}
                    </option>
                ))}
            </select>
            <select
                aria-label="รูปแบบโปรเจกต์"
                value={projectType}
                onChange={(event) => onProjectTypeChange(event.target.value as ProjectTypeFilter)}
                className={`${inputClass(false, "sm")} sm:w-36`}
            >
                {PROJECT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

// ─── ของฉัน ──────────────────────────────────────────────────────────────────────────────

function KpiTile({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
    return (
        <div className="grid content-start gap-2 rounded-2xl border border-gray-200 bg-white p-4">
            {/* มือถือช่องแคบ: ไอคอนอยู่เหนือชื่อ (วางข้างกันแล้วชื่อตัดเป็น 3 บรรทัด) */}
            <span className="flex flex-col items-start gap-2 text-sm text-gray-600 sm:flex-row sm:items-center">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={16} aria-hidden="true" />
                </span>
                {label}
            </span>
            {children}
        </div>
    );
}

function NoData({ reason }: { reason: string }) {
    return (
        <>
            <span className="text-lg text-gray-400">ยังไม่มีข้อมูล</span>
            <span className="text-xs text-gray-500">{reason}</span>
        </>
    );
}

function RateTileBody({ rate, eligible, unit }: { rate: number | null; eligible: number; unit: string }) {
    if (rate === null || eligible === 0) return <NoData reason={`ยังไม่มี${unit}ที่ครบกำหนดในช่วงนี้`} />;
    return (
        <>
            <span className="flex flex-wrap items-center gap-2">
                <span className="text-3xl font-medium text-gray-900 tabular-nums">{formatRate(rate)}</span>
                <LevelChip rate={rate} />
            </span>
            <RateBar rate={rate} />
            <span className="text-xs text-gray-500">
                จาก {eligible} {unit}ที่ครบกำหนด
            </span>
        </>
    );
}

function HoursTileBody({ hours, note, reason }: { hours: number | null; note: string; reason: string }) {
    if (hours === null) return <NoData reason={reason} />;
    return (
        <>
            <span className="text-3xl font-medium text-gray-900 tabular-nums">{formatHours(hours)}</span>
            <span className="text-xs text-gray-500">{note}</span>
        </>
    );
}

function MyKpis({ kpis, isLoading, taskType }: { kpis: Kpis | null; isLoading: boolean; taskType: TaskTypeFilter }) {
    const word = taskTypeWord(taskType);
    if (isLoading || !kpis) {
        return (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                    <Skeleton key={index} className="h-32 rounded-2xl" />
                ))}
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile icon={Trophy} label="ส่งโปรเจกต์ตรงเวลา">
                <RateTileBody rate={kpis.projectOnTimeRate} eligible={kpis.projectOnTimeEligible} unit="โปรเจกต์" />
            </KpiTile>
            <KpiTile icon={CalendarClock} label={`${word}ตรงเวลา`}>
                <RateTileBody rate={kpis.taskOnTimeRate} eligible={kpis.taskOnTimeEligible} unit={word} />
            </KpiTile>
            <KpiTile icon={Timer} label={`เวลาเฉลี่ยทำ${word}`}>
                <HoursTileBody
                    hours={kpis.avgTaskCycleHours}
                    note="ตั้งแต่เริ่มลงมือทำ (กำลังทำ) จนเสร็จ"
                    reason={`ยังไม่มี${word}ที่เสร็จในช่วงนี้`}
                />
            </KpiTile>
            <KpiTile icon={Wrench} label="เวลาเฉลี่ยแก้ปัญหา">
                <HoursTileBody
                    hours={kpis.avgIssueResolveHours}
                    note="ตั้งแต่เปิดปัญหาจนแก้ไขแล้ว"
                    reason="ยังไม่มีปัญหาที่แก้ในช่วงนี้"
                />
            </KpiTile>
        </div>
    );
}

// ─── รายคน ───────────────────────────────────────────────────────────────────────────────

function MemberKpis({
    members,
    isLoading,
    taskType,
}: {
    members: MemberKpiRow[];
    isLoading: boolean;
    taskType: TaskTypeFilter;
}) {
    const word = taskTypeWord(taskType);
    if (isLoading) return <EmptyLine>กำลังโหลด...</EmptyLine>;
    if (members.length === 0) return <EmptyLine>ไม่มีใครมี{word}ที่ครบกำหนดหรือเสร็จในช่วงนี้</EmptyLine>;
    const maxDue = Math.max(...members.map((member) => member.tasksAssigned), 1);
    return (
        <>
            {/* มือถือ: การ์ดต่อคน · บรรทัดบน = เสร็จกี่งาน · แถบตรงเวลา · บรรทัดล่าง = เวลาเฉลี่ยและปัญหา */}
            <ul className="grid gap-2 sm:hidden">
                {members.map((member) => (
                    <li key={member.user_id} className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-3">
                        <span className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                                <Avatar name={member.user_fullname} avatarPath={member.user_avatar_url} size={28} />
                                <span className="truncate text-sm font-medium text-gray-900">
                                    {member.user_fullname}
                                </span>
                            </span>
                            <span className="shrink-0 text-right text-sm text-gray-600">
                                เสร็จ{" "}
                                <span className="text-base font-medium text-gray-900 tabular-nums">
                                    {member.tasksCompleted}
                                </span>{" "}
                                {word}
                            </span>
                        </span>
                        {member.taskOnTimeRate === null ? (
                            <span className="text-xs text-gray-500">ตรงเวลา: ยังไม่มี{word}ที่ครบกำหนด</span>
                        ) : (
                            <span className="grid gap-1">
                                <span className="flex items-center justify-between gap-2 text-xs text-gray-600">
                                    <span>ตรงเวลา {formatRate(member.taskOnTimeRate)}</span>
                                    <LevelChip rate={member.taskOnTimeRate} />
                                </span>
                                <RateBar rate={member.taskOnTimeRate} />
                            </span>
                        )}
                        <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                            <span>
                                ครบกำหนด {member.tasksAssigned} {word}
                            </span>
                            {member.avgTaskCycleHours !== null && (
                                <span>เฉลี่ยทำ {formatHours(member.avgTaskCycleHours)}</span>
                            )}
                            <span>
                                แก้ปัญหา {member.issuesResolved} เรื่อง
                                {member.avgIssueResolveHours !== null
                                    ? ` (เฉลี่ย ${formatHours(member.avgIssueResolveHours)})`
                                    : ""}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>

            <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-176 text-sm">
                    <thead>
                        <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                            <th className="py-2 pr-3 font-normal">ชื่อ</th>
                            <th className="px-3 py-2 text-right font-normal">ครบกำหนดในช่วงนี้</th>
                            <th className="px-3 py-2 text-right font-normal">{word}ที่เสร็จ</th>
                            <th className="w-44 px-3 py-2 font-normal">ตรงเวลา</th>
                            <th className="px-3 py-2 text-right font-normal">เวลาเฉลี่ยทำ</th>
                            <th className="px-3 py-2 text-right font-normal">ปัญหาที่แก้</th>
                            <th className="py-2 pl-3 text-right font-normal">เวลาเฉลี่ยแก้ปัญหา</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {members.map((member) => (
                            <tr key={member.user_id} className="hover:bg-gray-50/60">
                                <td className="py-2.5 pr-3">
                                    <span className="flex items-center gap-2">
                                        <Avatar
                                            name={member.user_fullname}
                                            avatarPath={member.user_avatar_url}
                                            size={28}
                                        />
                                        <span className="truncate text-gray-900">{member.user_fullname}</span>
                                    </span>
                                </td>
                                <td className="px-3 py-2.5">
                                    <span className="flex items-center justify-end gap-2">
                                        <span
                                            className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100"
                                            aria-hidden="true"
                                        >
                                            <span
                                                className="block h-full rounded-full bg-blue-500"
                                                style={{ width: `${(member.tasksAssigned / maxDue) * 100}%` }}
                                            />
                                        </span>
                                        <span className="w-6 text-right text-gray-800 tabular-nums">
                                            {member.tasksAssigned}
                                        </span>
                                    </span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-gray-900 tabular-nums">
                                    {member.tasksCompleted}
                                </td>
                                <td className="px-3 py-2.5">
                                    {member.taskOnTimeRate === null ? (
                                        <span className="text-xs text-gray-400">ยังไม่มีที่ครบกำหนด</span>
                                    ) : (
                                        <span className="grid gap-1">
                                            <span className="flex items-center justify-between gap-2">
                                                <span className="text-gray-900 tabular-nums">
                                                    {formatRate(member.taskOnTimeRate)}
                                                </span>
                                                <LevelChip rate={member.taskOnTimeRate} />
                                            </span>
                                            <RateBar rate={member.taskOnTimeRate} />
                                        </span>
                                    )}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-600">
                                    {formatHours(member.avgTaskCycleHours)}
                                </td>
                                <td className="px-3 py-2.5 text-right text-gray-800 tabular-nums">
                                    {member.issuesResolved}
                                </td>
                                <td className="py-2.5 pl-3 text-right text-gray-600">
                                    {formatHours(member.avgIssueResolveHours)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// ─── การ์ดรวม ────────────────────────────────────────────────────────────────────────────

export default function KpiSection({
    period,
    onPeriodChange,
    canViewMembers,
}: {
    period: KpiPeriod;
    onPeriodChange: (period: KpiPeriod) => void;
    // สิทธิ์ดู KPI ของสมาชิก
    canViewMembers: boolean;
}) {
    const [taskType, setTaskType] = useState<TaskTypeFilter>("all");
    const [projectType, setProjectType] = useState<ProjectTypeFilter>("all");
    const [projectId, setProjectId] = useState("all");
    const [myLoaded, setMyLoaded] = useState<{ key: string; kpis: Kpis | null } | null>(null);
    const [membersLoaded, setMembersLoaded] = useState<{
        key: string;
        members: MemberKpiRow[];
        projectOptions: ProjectOption[];
    } | null>(null);

    const myKey = `${periodValue(period)}|${taskType}|${projectType}`;
    const membersKey = `${myKey}|${projectId}`;

    useEffect(() => {
        let isStale = false;
        const params = new URLSearchParams({ month: periodValue(period), taskType, projectType });
        const key = `${periodValue(period)}|${taskType}|${projectType}`;
        apiFetch<Kpis>(`/dashboard/kpis?${params}`).then(({ data }) => {
            if (!isStale) setMyLoaded({ key, kpis: data });
        });
        return () => {
            isStale = true;
        };
    }, [period, taskType, projectType]);

    useEffect(() => {
        if (!canViewMembers) return;
        let isStale = false;
        const params = new URLSearchParams({ month: periodValue(period), projectId, taskType, projectType });
        const key = `${periodValue(period)}|${taskType}|${projectType}|${projectId}`;
        apiFetch<{ members: MemberKpiRow[]; projectOptions: ProjectOption[] }>(
            `/dashboard/kpis/by-member?${params}`,
        ).then(({ data }) => {
            if (!isStale)
                setMembersLoaded({ key, members: data?.members ?? [], projectOptions: data?.projectOptions ?? [] });
        });
        return () => {
            isStale = true;
        };
    }, [canViewMembers, period, projectId, taskType, projectType]);

    const kpis = myLoaded?.key === myKey ? myLoaded.kpis : null;
    const isMembersLoading = membersLoaded?.key !== membersKey;
    // รายชื่อโปรเจกต์ใช้ชุดล่าสุดที่โหลดได้ (ไม่หายระหว่างโหลดใหม่)
    const projectOptions = membersLoaded?.projectOptions ?? [];

    return (
        <DashboardCard
            icon={Gauge}
            title="KPI"
            description="นับจากงานที่ครบกำหนดหรือเสร็จในช่วงที่เลือก · เปลี่ยนตัวกรองแล้วใช้ทั้งของฉันและรายคน"
        >
            <KpiFilters
                period={period}
                onPeriodChange={onPeriodChange}
                taskType={taskType}
                onTaskTypeChange={setTaskType}
                projectType={projectType}
                onProjectTypeChange={(value) => {
                    setProjectType(value);
                    setProjectId("all");
                }}
            />

            <div className="grid gap-3">
                <h3 className="text-sm font-medium text-gray-900">ของฉัน</h3>
                <MyKpis kpis={kpis} isLoading={myLoaded?.key !== myKey} taskType={taskType} />
                <FieldHint>
                    &quot;ตรงเวลา&quot; นับรายการที่ครบกำหนดในช่วงนี้และถึงกำหนดแล้ว ·
                    เลยกำหนดแต่ยังไม่เสร็จนับว่าสายทันที ไม่ต้องรอปิดงาน
                </FieldHint>
            </div>

            {canViewMembers && (
                <div className="grid gap-3 border-t border-gray-100 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-gray-900">รายคน</h3>
                        <SearchableSelect
                            value={projectId}
                            onChange={(value) => setProjectId(value || "all")}
                            options={[
                                { value: "all", label: "ทุกโปรเจกต์" },
                                ...projectOptions.map((project) => ({
                                    value: project.project_id,
                                    label: project.project_name,
                                })),
                            ]}
                            placeholder="ทุกโปรเจกต์"
                            className="w-full text-sm sm:w-64"
                        />
                    </div>
                    <MemberKpis
                        members={membersLoaded?.members ?? []}
                        isLoading={isMembersLoading}
                        taskType={taskType}
                    />
                </div>
            )}
        </DashboardCard>
    );
}
