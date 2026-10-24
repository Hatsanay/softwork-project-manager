"use client";

// ภาพรวมบุคคล (2026-10-19 · docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.2) — หน้าแรกของฝ่ายบุคคล/หัวหน้า
// "ต้องทำ" เรียงตามความด่วน กดไปทำได้ทันที · ส่วนที่ไม่มีสิทธิ์ backend ไม่ส่งมา (null) หน้านี้จึงไม่แสดง
import { useEffect, useState } from "react";
import Link from "next/link";
import {
    CalendarCheck,
    CalendarClock,
    CircleCheck,
    CreditCard,
    FileWarning,
    Printer,
    Undo2,
    Users,
    Wallet,
    type LucideIcon,
} from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { HALF_DAY_LABEL, PAYROLL_STATUS } from "../_messages";
import type { PayrollStatus, PeopleOverview } from "../_types";

type Todo = { icon: LucideIcon; label: string; detail?: string; count?: number; href: string; isUrgent?: boolean };

const PAYROLL_STEPS: { status: PayrollStatus; label: string }[] = [
    { status: "draft", label: "ร่าง" },
    { status: "pending_approval", label: "รออนุมัติ" },
    { status: "approved", label: "อนุมัติแล้ว" },
    { status: "paid", label: "จ่ายแล้ว" },
];

function monthLabel(period: string) {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
    );
}

function todosOf(overview: PeopleOverview): Todo[] {
    const todos: Todo[] = [];
    const { pending, cards, payroll, incomplete_employees: incomplete } = overview;
    if (pending.leave) todos.push({ icon: CalendarCheck, label: "ใบลารออนุมัติ", count: pending.leave, href: "/people/approvals?tab=leave", isUrgent: true });
    if (pending.overtime) todos.push({ icon: CalendarClock, label: "OT รออนุมัติ", count: pending.overtime, href: "/people/approvals?tab=overtime", isUrgent: true });
    if (pending.wfh) todos.push({ icon: CalendarClock, label: "WFH รออนุมัติ", count: pending.wfh, href: "/people/approvals?tab=wfh", isUrgent: true });
    if (pending.attendance_corrections) todos.push({ icon: CalendarClock, label: "ขอแก้เวลารออนุมัติ", count: pending.attendance_corrections, href: "/people/approvals?tab=corrections", isUrgent: true });
    if (overview.attendance_today?.incomplete) todos.push({ icon: CalendarClock, label: "ลงเวลาไม่ครบวันนี้", count: overview.attendance_today.incomplete, href: "/people/attendance-board" });
    if (pending.timesheet) todos.push({ icon: CalendarClock, label: "ลงชั่วโมงรออนุมัติ", count: pending.timesheet, href: "/people/approvals?tab=timesheet", isUrgent: true });
    if (payroll?.missing_period) {
        todos.push({ icon: Wallet, label: `ยังไม่ได้สร้างรอบเงินเดือน${monthLabel(payroll.missing_period)}`, href: "/people/payroll", isUrgent: true });
    }
    const run = payroll?.latest_run;
    if (run && (run.pr_status === "draft" || run.pr_status === "pending_approval" || run.pr_status === "approved")) {
        const nextStep = { draft: "ตรวจแล้วส่งขออนุมัติ", pending_approval: "รอผู้อนุมัติ", approved: "บันทึกจ่ายเมื่อโอนแล้ว" }[run.pr_status];
        todos.push({ icon: Wallet, label: `รอบเงินเดือน${monthLabel(run.pr_period)}`, detail: nextStep, href: `/people/payroll/view?id=${run.pr_id}` });
    }
    if (cards?.pending_print) todos.push({ icon: Printer, label: "บัตรพนักงานรอพิมพ์", count: cards.pending_print, href: "/people/employees?tab=pending_print" });
    if (cards?.not_returned) todos.push({ icon: Undo2, label: "บัตรที่ยังไม่ได้คืน", count: cards.not_returned, href: "/people/employees?tab=not_returned" });
    if (cards?.expiring) todos.push({ icon: CreditCard, label: "บัตรใกล้หมดอายุ", count: cards.expiring, href: "/people/employees?tab=expiring" });
    if (incomplete?.length) {
        todos.push({ icon: FileWarning, label: "ข้อมูลพนักงานไม่ครบสำหรับเงินเดือน", count: incomplete.length, href: "#incomplete" });
    }
    return todos;
}

export default function PeopleOverviewPage() {
    const [overview, setOverview] = useState<PeopleOverview | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<PeopleOverview>("/people/overview").then(({ data, error }) => {
            if (isLeftPage) return;
            setOverview(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (loadError) return <p className="p-6 text-sm text-red-600">{loadError}</p>;
    if (!overview) return <PageSkeleton />;

    const todos = todosOf(overview);
    const { headcount, payroll, incomplete_employees: incomplete } = overview;

    return (
        <div className="grid w-full gap-6">
            <section className="relative overflow-hidden rounded-3xl bg-brand-grid p-5 text-white shadow-brand sm:p-7">
                <p className="text-sm text-blue-100">จัดการบุคคล</p>
                <h1 className="text-2xl font-medium">ภาพรวมบุคคล</h1>
                <p className="text-sm text-blue-100">
                    {todos.length > 0 ? `มีเรื่องต้องทำ ${todos.length} เรื่อง` : "ไม่มีเรื่องค้าง"} · ข้อมูล ณ {formatDateOnly(overview.today)}
                </p>
                {headcount && (
                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <HeroStat label="ทำงานอยู่" value={headcount.working} unit="คน" />
                        <HeroStat label="เข้าใหม่เดือนนี้" value={headcount.joined_this_month} unit="คน" />
                        <HeroStat label="ลาออกเดือนนี้" value={headcount.leaving_this_month} unit="คน" />
                        <HeroStat label="ลาวันนี้" value={overview.on_leave_today.length} unit="คน" />
                    </div>
                )}
            </section>

            <div className="grid gap-4 lg:grid-cols-5">
                <section className={`grid content-start gap-3 p-5 lg:col-span-3 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">ต้องทำ</h2>
                    {todos.length === 0 ? (
                        <p className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                            <CircleCheck size={17} />
                            เคลียร์ครบแล้ว ไม่มีรายการค้าง
                        </p>
                    ) : (
                        <ul className="grid gap-2">
                            {todos.map((todo) => (
                                <li key={todo.label}>
                                    <TodoRow todo={todo} />
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <div className="grid content-start gap-4 lg:col-span-2">
                    {overview.attendance_today && <AttendanceTodayCard counts={overview.attendance_today} />}
                    {payroll && <PayrollCard payroll={payroll} />}
                    <section className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                        <h2 className="flex items-center gap-2 text-base font-medium text-gray-900">
                            <Users size={18} className="text-blue-600" />
                            ลาวันนี้
                        </h2>
                        {overview.on_leave_today.length === 0 ? (
                            <p className="text-sm text-gray-500">ทุกคนมาทำงาน</p>
                        ) : (
                            <ul className="grid gap-2">
                                {overview.on_leave_today.map((leave) => (
                                    <li key={leave.lr_id} className="flex items-center justify-between gap-3 text-sm">
                                        <span className="truncate text-gray-900">
                                            {leave.full_name}
                                            {leave.nickname ? ` (${leave.nickname})` : ""}
                                        </span>
                                        <span className="shrink-0 text-gray-500">
                                            {leave.leave_type}
                                            {leave.half_day !== "none" ? ` · ${HALF_DAY_LABEL[leave.half_day]}` : ""}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>

            {incomplete && incomplete.length > 0 && (
                <section id="incomplete" className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                    <div className="grid gap-0.5">
                        <h2 className="text-base font-medium text-gray-900">ข้อมูลพนักงานไม่ครบสำหรับเงินเดือน</h2>
                        <p className="text-sm text-gray-500">ต้องมีก่อนเข้ารอบเงินเดือน (ใช้บน ภ.ง.ด.1 · 50 ทวิ · การโอนเงินเดือน)</p>
                    </div>
                    <ul className="grid gap-2">
                        {incomplete.map((employee) => (
                            <li key={employee.emp_id}>
                                <Link
                                    href={`/people/employees/edit?id=${employee.emp_id}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm transition hover:border-blue-300 hover:bg-blue-50/40"
                                >
                                    <span className="grid gap-0.5">
                                        <span className="font-medium text-gray-900">{employee.full_name}</span>
                                        <span className="text-xs tracking-wide text-gray-500 tabular-nums">{employee.emp_code}</span>
                                    </span>
                                    <span className="text-xs text-amber-600">ขาด: {employee.missing.join(" · ")}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

function HeroStat({ label, value, unit }: { label: string; value: number; unit: string }) {
    return (
        <div className="grid gap-0.5 rounded-2xl bg-white/12 px-4 py-3 ring-1 ring-white/20 backdrop-blur">
            <span className="text-xs text-blue-100">{label}</span>
            <span className="text-3xl font-medium tabular-nums">
                {value} <span className="text-sm font-normal text-blue-100">{unit}</span>
            </span>
        </div>
    );
}

function TodoRow({ todo }: { todo: Todo }) {
    const Icon = todo.icon;
    return (
        <Link
            href={todo.href}
            className="flex min-h-14 items-center gap-3 rounded-xl border border-gray-200 px-4 py-2.5 transition hover:border-blue-300 hover:bg-blue-50/40"
        >
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${todo.isUrgent ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}
            >
                <Icon size={17} />
            </span>
            <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-sm text-gray-900">{todo.label}</span>
                {todo.detail && <span className="truncate text-xs text-gray-500">{todo.detail}</span>}
            </span>
            {todo.count !== undefined && (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-900 tabular-nums">{todo.count}</span>
            )}
        </Link>
    );
}

function PayrollCard({ payroll }: { payroll: NonNullable<PeopleOverview["payroll"]> }) {
    const run = payroll.latest_run;
    if (!run) {
        return (
            <section className={`grid gap-2 p-5 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">รอบเงินเดือน</h2>
                <p className="text-sm text-gray-500">ยังไม่มีรอบเงินเดือน</p>
            </section>
        );
    }
    const stepIndex = PAYROLL_STEPS.findIndex((step) => step.status === run.pr_status);
    const status = PAYROLL_STATUS[run.pr_status];
    return (
        <Link href={`/people/payroll/view?id=${run.pr_id}`} className={`grid gap-3 p-5 transition hover:border-blue-300 ${CARD_CLASS}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="grid gap-0.5">
                    <span className="text-sm text-gray-500">รอบเงินเดือนล่าสุด</span>
                    <span className="text-base font-medium text-gray-900">{monthLabel(run.pr_period)}</span>
                </div>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </div>
            <span className="text-3xl font-medium text-gray-900 tabular-nums">
                {formatAmount(run.pr_total_net)} <span className="text-base font-normal text-gray-500">บาท</span>
            </span>
            <span className="text-xs text-gray-500">
                จ่ายสุทธิ {run.pr_employee_count} คน · วันจ่าย {formatDateOnly(run.pr_pay_date)}
            </span>
            {stepIndex >= 0 && (
                <ol className="grid grid-cols-4 gap-1.5" aria-label="ขั้นตอนรอบเงินเดือน">
                    {PAYROLL_STEPS.map((step, index) => (
                        <li key={step.status} className="grid gap-1">
                            <span className={`h-1.5 rounded-full ${index <= stepIndex ? "bg-blue-500" : "bg-gray-200"}`} />
                            <span className={`text-[0.7rem] ${index === stepIndex ? "font-medium text-blue-700" : "text-gray-500"}`}>
                                {step.label}
                            </span>
                        </li>
                    ))}
                </ol>
            )}
        </Link>
    );
}

// ลงเวลาวันนี้ (A-2) — ตัวเลขรวม กดไปหน้าลงเวลาพนักงาน
function AttendanceTodayCard({ counts }: { counts: NonNullable<PeopleOverview["attendance_today"]> }) {
    const items = [
        { label: "เข้าแล้ว", value: counts.arrived, tone: "text-gray-900" },
        { label: "สาย", value: counts.late, tone: counts.late > 0 ? "text-red-600" : "text-gray-900" },
        { label: "ยังไม่เข้า", value: counts.not_yet, tone: "text-gray-900" },
        { label: "ลา", value: counts.leave, tone: "text-gray-900" },
    ];
    return (
        <Link href="/people/attendance-board" className={`grid gap-3 p-5 hover:border-blue-200 ${CARD_CLASS}`}>
            <h2 className="flex items-center gap-2 text-base font-medium text-gray-900">
                <CalendarClock size={18} className="text-blue-600" />
                ลงเวลาวันนี้
                <span className="ml-auto text-sm font-normal text-gray-500">จาก {counts.total} คน</span>
            </h2>
            <div className="grid grid-cols-4 gap-2 text-center">
                {items.map((item) => (
                    <span key={item.label} className="grid gap-0.5 rounded-xl bg-gray-50 py-2">
                        <span className={`text-lg font-medium tabular-nums ${item.tone}`}>{item.value}</span>
                        <span className="text-xs text-gray-500">{item.label}</span>
                    </span>
                ))}
            </div>
            {counts.wfh > 0 && <p className="text-xs text-blue-700">ทำงานที่บ้าน (WFH) {counts.wfh} คน</p>}
            {counts.offsite > 0 && <p className="text-xs text-amber-700">กดนอกจุดลงเวลา {counts.offsite} คน</p>}
        </Link>
    );
}
