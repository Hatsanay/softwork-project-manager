"use client";

// KPI ของฉัน (การ์ดตัวเลข 4 ช่อง) และ KPI รายคน (ตาราง — ต้องมีสิทธิ์ viewMemberKpi) — ใช้ช่วงเวลาเดียวกัน
import { useEffect, useState } from "react";
import { CalendarClock, Gauge, Timer, Trophy, UserRoundSearch, Wrench } from "lucide-react";
import Segmented from "@/components/ui/segmented";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { CARD_CLASS } from "@/components/ui/card";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch } from "@/lib/api";
import { PROJECT_TYPE_OPTIONS, TASK_TYPE_OPTIONS, formatHours, formatRate, rateTextColor } from "../_labels";
import type { Kpis, MemberKpiRow, ProjectOption, ProjectTypeFilter, TaskTypeFilter } from "../_types";
import DashboardCard, { Avatar, EmptyLine } from "./dashboard-card";

export type KpiPeriod = { mode: "month" | "year"; month: string; year: string };

export function periodValue(period: KpiPeriod) {
    return period.mode === "year" ? period.year : period.month;
}

function taskTypeWord(taskType: TaskTypeFilter) {
    if (taskType === "task") return "Task หลัก";
    if (taskType === "subtask") return "Subtask";
    return "งาน";
}

function KpiTile({
    icon: Icon,
    label,
    value,
    note,
    valueColor,
}: {
    icon: typeof Gauge;
    label: string;
    value: string;
    note: string;
    valueColor: string;
}) {
    return (
        <div className={`grid gap-2 p-5 ${CARD_CLASS}`}>
            <span className="flex items-center gap-2 text-sm text-gray-600">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={16} />
                </span>
                {label}
            </span>
            <span className={`text-3xl font-medium tabular-nums ${valueColor}`}>{value}</span>
            <span className="text-xs text-gray-500">{note}</span>
        </div>
    );
}

type PeriodPickerProps = { period: KpiPeriod; onChange: (period: KpiPeriod) => void };

// ตัดบรรทัดได้ — ห้ามล็อกให้อยู่บรรทัดเดียว เพราะจอ 360px ปุ่ม + ช่องเดือนกว้างเกินจอ ดันการ์ดทั้งหน้าล้นขอบ
function PeriodPicker({ period, onChange }: PeriodPickerProps) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Segmented
                label="ช่วงเวลา"
                value={period.mode}
                onChange={(mode) => onChange({ ...period, mode })}
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
                    onChange={(event) => onChange({ ...period, month: event.target.value })}
                    className={`${inputClass(false, "sm")} w-44`}
                />
            ) : (
                <input
                    type="number"
                    aria-label="ปี (ค.ศ.)"
                    min={2000}
                    max={2100}
                    value={period.year}
                    onChange={(event) => onChange({ ...period, year: event.target.value })}
                    className={`${inputClass(false, "sm")} w-28`}
                />
            )}
        </div>
    );
}

export function MyKpiSection({
    period,
    onPeriodChange,
}: {
    period: KpiPeriod;
    onPeriodChange: (period: KpiPeriod) => void;
}) {
    const [taskType, setTaskType] = useState<TaskTypeFilter>("all");
    const [projectType, setProjectType] = useState<ProjectTypeFilter>("all");
    const [loaded, setLoaded] = useState<{ key: string; kpis: Kpis | null } | null>(null);
    const requestKey = `${periodValue(period)}|${taskType}|${projectType}`;

    useEffect(() => {
        let isStale = false;
        const params = new URLSearchParams({ month: periodValue(period), taskType, projectType });
        apiFetch<Kpis>(`/dashboard/kpis?${params}`).then(({ data }) => {
            if (!isStale) setLoaded({ key: `${params.get("month")}|${taskType}|${projectType}`, kpis: data });
        });
        return () => {
            isStale = true;
        };
    }, [period, taskType, projectType]);

    const kpis = loaded?.key === requestKey ? loaded.kpis : null;
    const isLoading = loaded?.key !== requestKey;
    const show = (format: () => string) => (isLoading || !kpis ? "…" : format());
    const word = taskTypeWord(taskType);

    return (
        <section className="grid gap-3">
            <div className="grid gap-3">
                <div className="grid gap-0.5">
                    <h2 className="text-base font-medium text-gray-900">KPI ของฉัน</h2>
                    <FieldHint>
                        &quot;ตรงเวลา&quot; นับเฉพาะรายการที่ครบกำหนดในช่วงนี้และครบกำหนดไปแล้ว —
                        ที่เลยกำหนดแต่ยังไม่เสร็จนับว่าสายทันที ไม่ต้องรอปิดงาน
                    </FieldHint>
                </div>
                {/* ตัวกรองแยกเป็นแถวเต็มความกว้าง — ถ้าวางข้างหัวข้อ พื้นที่ไม่พอ ตัวเลือกช่วงเวลาจะตกบรรทัดแบบขาดเป็นท่อน */}
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented label="ชนิดงาน" value={taskType} onChange={setTaskType} options={TASK_TYPE_OPTIONS} />
                    <Segmented
                        label="รูปแบบโปรเจกต์"
                        value={projectType}
                        onChange={setProjectType}
                        options={PROJECT_TYPE_OPTIONS}
                    />
                    <PeriodPicker period={period} onChange={onPeriodChange} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiTile
                    icon={Trophy}
                    label="ส่งโปรเจกต์ตรงเวลา"
                    value={show(() => formatRate(kpis!.projectOnTimeRate))}
                    note={
                        kpis && kpis.projectOnTimeEligible > 0
                            ? `จาก ${kpis.projectOnTimeEligible} โปรเจกต์ที่ครบกำหนด`
                            : "ยังไม่มีข้อมูล"
                    }
                    valueColor={isLoading || !kpis ? "text-gray-400" : rateTextColor(kpis.projectOnTimeRate)}
                />
                <KpiTile
                    icon={CalendarClock}
                    label={`${word}ตรงเวลา`}
                    value={show(() => formatRate(kpis!.taskOnTimeRate))}
                    note={
                        kpis && kpis.taskOnTimeEligible > 0
                            ? `จาก ${kpis.taskOnTimeEligible} งานที่ครบกำหนด`
                            : "ยังไม่มีข้อมูล"
                    }
                    valueColor={isLoading || !kpis ? "text-gray-400" : rateTextColor(kpis.taskOnTimeRate)}
                />
                <KpiTile
                    icon={Timer}
                    label={`เวลาเฉลี่ยทำ${word}`}
                    value={show(() => formatHours(kpis!.avgTaskCycleHours))}
                    note="ตั้งแต่เริ่มลงมือทำ (กำลังทำ) จนเสร็จ"
                    valueColor={
                        isLoading || !kpis || kpis.avgTaskCycleHours === null ? "text-gray-400" : "text-gray-900"
                    }
                />
                <KpiTile
                    icon={Wrench}
                    label="เวลาเฉลี่ยแก้ปัญหา"
                    value={show(() => formatHours(kpis!.avgIssueResolveHours))}
                    note="ตั้งแต่เปิดปัญหาจนแก้ไขแล้ว"
                    valueColor={
                        isLoading || !kpis || kpis.avgIssueResolveHours === null ? "text-gray-400" : "text-gray-900"
                    }
                />
            </div>
        </section>
    );
}

export function MemberKpiCard({ period }: { period: KpiPeriod }) {
    const [taskType, setTaskType] = useState<TaskTypeFilter>("all");
    const [projectType, setProjectType] = useState<ProjectTypeFilter>("all");
    const [projectId, setProjectId] = useState("all");
    const [members, setMembers] = useState<MemberKpiRow[]>([]);
    const [projectOptions, setProjectOptions] = useState<ProjectOption[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let isStale = false;
        const params = new URLSearchParams({ month: periodValue(period), projectId, taskType, projectType });
        apiFetch<{ members: MemberKpiRow[]; projectOptions: ProjectOption[] }>(
            `/dashboard/kpis/by-member?${params}`,
        ).then(({ data }) => {
            if (isStale) return;
            if (data) {
                setMembers(data.members);
                setProjectOptions(data.projectOptions);
            }
            setIsLoading(false);
        });
        return () => {
            isStale = true;
        };
    }, [period, projectId, taskType, projectType]);

    const maxAssigned = Math.max(...members.map((member) => member.tasksAssigned), 1);

    return (
        <DashboardCard
            icon={UserRoundSearch}
            title="KPI รายคน"
            description="ช่วงเวลาเดียวกับ KPI ของฉันด้านบน · เห็นได้เฉพาะผู้มีสิทธิ์ดู KPI ของสมาชิก"
            actions={
                <div className="flex flex-wrap items-center gap-2">
                    <Segmented label="ชนิดงาน" value={taskType} onChange={setTaskType} options={TASK_TYPE_OPTIONS} />
                    <Segmented
                        label="รูปแบบโปรเจกต์"
                        value={projectType}
                        onChange={(value) => {
                            setProjectType(value);
                            setProjectId("all");
                        }}
                        options={PROJECT_TYPE_OPTIONS}
                    />
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
                        className="w-full text-sm sm:w-56"
                    />
                </div>
            }
        >
            {isLoading ? (
                <EmptyLine>กำลังโหลด...</EmptyLine>
            ) : members.length === 0 ? (
                <EmptyLine>ไม่มีข้อมูลในช่วงนี้</EmptyLine>
            ) : (
                <>
                    {/* มือถือ: คนละการ์ด ตัวเลขเรียงเป็นตาราง 2 คอลัมน์ — ตาราง 7 คอลัมน์เลื่อนข้างแล้วตัวเลขหลุดจอ */}
                    <ul className="grid gap-2 sm:hidden">
                        {members.map((member) => (
                            <li key={member.user_id} className="grid gap-2 rounded-xl bg-gray-50 p-3">
                                <span className="flex items-center gap-2">
                                    <Avatar name={member.user_fullname} avatarPath={member.user_avatar_url} size={26} />
                                    <span className="truncate font-medium text-gray-800">{member.user_fullname}</span>
                                </span>
                                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                                    <MemberStat label="ได้รับมอบหมาย" value={member.tasksAssigned} />
                                    <MemberStat
                                        label={`${taskTypeWord(taskType)}ที่เสร็จ`}
                                        value={member.tasksCompleted}
                                    />
                                    <MemberStat
                                        label="ตรงเวลา"
                                        value={formatRate(member.taskOnTimeRate)}
                                        valueClass={rateTextColor(member.taskOnTimeRate)}
                                    />
                                    <MemberStat label="เวลาเฉลี่ยทำงาน" value={formatHours(member.avgTaskCycleHours)} />
                                    <MemberStat label="ปัญหาที่แก้" value={member.issuesResolved} />
                                    <MemberStat
                                        label="เวลาเฉลี่ยแก้ปัญหา"
                                        value={formatHours(member.avgIssueResolveHours)}
                                    />
                                </dl>
                            </li>
                        ))}
                    </ul>
                    <div className="hidden overflow-x-auto sm:block">
                        <table className="w-full min-w-176 text-sm">
                            <thead>
                                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                                    <th className="py-2 pr-3 font-normal">ชื่อ</th>
                                    <th className="px-3 py-2 text-right font-normal">ได้รับมอบหมาย</th>
                                    <th className="px-3 py-2 text-right font-normal">
                                        {taskTypeWord(taskType)}ที่เสร็จ
                                    </th>
                                    <th className="px-3 py-2 text-right font-normal">ตรงเวลา</th>
                                    <th className="px-3 py-2 text-right font-normal">เวลาเฉลี่ยทำงาน</th>
                                    <th className="px-3 py-2 text-right font-normal">ปัญหาที่แก้</th>
                                    <th className="py-2 pl-3 text-right font-normal">เวลาเฉลี่ยแก้ปัญหา</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {members.map((member) => (
                                    <tr key={member.user_id}>
                                        <td className="py-2 pr-3">
                                            <span className="flex items-center gap-2">
                                                <Avatar
                                                    name={member.user_fullname}
                                                    avatarPath={member.user_avatar_url}
                                                    size={26}
                                                />
                                                <span className="truncate text-gray-800">{member.user_fullname}</span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2">
                                            <span className="flex items-center justify-end gap-2">
                                                <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-100">
                                                    <span
                                                        className="block h-full bg-blue-500"
                                                        style={{
                                                            width: `${(member.tasksAssigned / maxAssigned) * 100}%`,
                                                        }}
                                                    />
                                                </span>
                                                <span className="w-6 text-right tabular-nums text-gray-800">
                                                    {member.tasksAssigned}
                                                </span>
                                            </span>
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                                            {member.tasksCompleted}
                                        </td>
                                        <td
                                            className={`px-3 py-2 text-right tabular-nums ${rateTextColor(member.taskOnTimeRate)}`}
                                        >
                                            {formatRate(member.taskOnTimeRate)}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-600">
                                            {formatHours(member.avgTaskCycleHours)}
                                        </td>
                                        <td className="px-3 py-2 text-right tabular-nums text-gray-800">
                                            {member.issuesResolved}
                                        </td>
                                        <td className="py-2 pl-3 text-right text-gray-600">
                                            {formatHours(member.avgIssueResolveHours)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </DashboardCard>
    );
}

function MemberStat({
    label,
    value,
    valueClass = "text-gray-800",
}: {
    label: string;
    value: React.ReactNode;
    valueClass?: string;
}) {
    return (
        <div className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className={`tabular-nums ${valueClass}`}>{value}</dd>
        </div>
    );
}
