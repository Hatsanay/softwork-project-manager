"use client";

// ภาพรวมของฉัน (2026-10-19 · docs/plans/2026-10-19-people-ux-redesign.md ข้อ 2.1)
// ทุกคนเปิดได้: ลงเวลาสัปดาห์นี้ · วันลาคงเหลือ · สลิปล่าสุด · บัตรพนักงาน — หน้าเดียวเห็นครบ กดต่อไปหน้าเต็มได้
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarClock, ChevronRight, CreditCard, ReceiptText, type LucideIcon } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { formatDateOnly } from "@/app/function";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { TIMESHEET_STATUS } from "../_messages";
import type { MyLeave, MyProfile, MyTimesheetWeek, PayslipSummary } from "../_types";
import { cardStatusOf, nameInitial } from "../employees/_card-status";

type MyData = {
    profile: MyProfile;
    leave: MyLeave | null;
    week: MyTimesheetWeek | null;
    payslips: PayslipSummary[];
};

function monthLabel(period: string) {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
    );
}

/** อายุงาน "1 ปี 3 เดือน" นับถึงวันนี้ */
function serviceLength(hireDate: string, today: string) {
    const [hireYear, hireMonth, hireDay] = hireDate.split("-").map(Number);
    const [year, month, day] = today.split("-").map(Number);
    let months = (year - hireYear) * 12 + (month - hireMonth) - (day < hireDay ? 1 : 0);
    if (months < 0) return "ยังไม่เริ่มงาน";
    const years = Math.floor(months / 12);
    months -= years * 12;
    if (years === 0 && months === 0) return "เพิ่งเริ่มงาน";
    return [years > 0 ? `${years} ปี` : "", months > 0 ? `${months} เดือน` : ""].filter(Boolean).join(" ");
}

export default function MyPeoplePage() {
    const [data, setData] = useState<MyData | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<MyProfile>("/people/me"),
            apiFetch<MyLeave>(`/leave/me?year=${new Date().getFullYear()}`),
            apiFetch<MyTimesheetWeek>("/timesheet/me"),
            apiFetch<{ data: PayslipSummary[] }>("/payroll/payslips"),
        ]).then(([profile, leave, week, payslips]) => {
            if (isLeftPage || !profile.data) return;
            setData({ profile: profile.data, leave: leave.data, week: week.data, payslips: payslips.data?.data ?? [] });
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (!data) return <PageSkeleton />;
    const { employee, card, today } = data.profile;

    if (!employee) {
        return (
            <div className="mx-auto grid w-full max-w-4xl gap-6">
                <MyHero name={null} subtitle="บัญชีนี้ยังไม่ได้ผูกกับทะเบียนพนักงาน" photoUrl={null} />
                <StatusBanner tone="info" title="ยังไม่ใช่พนักงานในระบบ">
                    ลงเวลา ขอลา และดูสลิปได้เมื่อฝ่ายบุคคลผูกบัญชีนี้กับทะเบียนพนักงานแล้ว
                </StatusBanner>
            </div>
        );
    }

    const displayName = employee.emp_nickname ? `${employee.emp_first_name_th} (${employee.emp_nickname})` : employee.emp_first_name_th;
    const subtitle = [employee.emp_position, employee.department_name].filter(Boolean).join(" · ");

    return (
        <div className="mx-auto grid w-full max-w-5xl gap-6">
            <MyHero name={displayName} subtitle={subtitle} photoUrl={employee.photo_url} initialSource={employee.emp_first_name_th}>
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <HeroFact label="รหัสพนักงาน" value={employee.emp_code} isCode />
                    <HeroFact label="เริ่มงาน" value={formatDateOnly(employee.emp_hire_date)} />
                    <HeroFact label="อายุงาน" value={serviceLength(employee.emp_hire_date, today)} />
                </div>
            </MyHero>

            <div className="grid gap-4 md:grid-cols-2">
                <TimesheetTile week={data.week} />
                <LeaveTile leave={data.leave} />
                <PayslipTile payslips={data.payslips} />
                <CardTile card={card} today={today} />
            </div>
        </div>
    );
}

function MyHero({
    name,
    subtitle,
    photoUrl,
    initialSource,
    children,
}: {
    name: string | null;
    subtitle: string;
    photoUrl: string | null;
    initialSource?: string;
    children?: React.ReactNode;
}) {
    return (
        <section className="relative overflow-hidden rounded-3xl bg-brand-grid p-5 text-white shadow-brand sm:p-7">
            <div className="flex items-center gap-4">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/15 text-2xl font-medium ring-2 ring-white/40">
                    {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadedFileUrl(photoUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                        nameInitial(initialSource ?? name ?? "")
                    )}
                </span>
                <div className="grid min-w-0 gap-0.5">
                    <p className="text-sm text-blue-100">ภาพรวมของฉัน</p>
                    <h1 className="truncate text-2xl font-medium">{name ? `คุณ${name}` : "บุคคล"}</h1>
                    <p className="truncate text-sm text-blue-100">{subtitle}</p>
                </div>
            </div>
            {children}
        </section>
    );
}

function HeroFact({ label, value, isCode = false }: { label: string; value: string; isCode?: boolean }) {
    return (
        // รหัส 18 ตัวกินเต็มแถวบนมือถือ ไม่ถูกตัด
        <div className={`grid min-w-0 gap-0.5 rounded-2xl bg-white/12 px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur ${isCode ? "col-span-2 sm:col-span-1" : ""}`}>
            <span className="text-xs text-blue-100">{label}</span>
            <span className={`truncate font-medium tabular-nums ${isCode ? "text-sm tracking-wide" : "text-base"}`}>{value}</span>
        </div>
    );
}

function Tile({
    icon: Icon,
    title,
    href,
    linkLabel,
    children,
}: {
    icon: LucideIcon;
    title: string;
    href?: string;
    linkLabel?: string;
    children: React.ReactNode;
}) {
    return (
        <section className={`flex flex-col gap-4 p-5 ${CARD_CLASS}`}>
            <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon size={19} />
                </span>
                <h2 className="flex-1 text-base font-medium text-gray-900">{title}</h2>
            </div>
            <div className="flex-1">{children}</div>
            {href && (
                <Link
                    href={href}
                    className="-mb-2 inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                >
                    {linkLabel}
                    <ChevronRight size={15} />
                </Link>
            )}
        </section>
    );
}

function TimesheetTile({ week }: { week: MyTimesheetWeek | null }) {
    const workingDays = week?.days.filter((day) => day.is_working_day && !day.holiday_name).length ?? 0;
    const hours = Number(week?.week?.tsw_total_hours ?? 0);
    const target = workingDays * 8;
    const percent = target > 0 ? Math.min(100, Math.round((hours / target) * 100)) : 0;
    const status = week?.week ? TIMESHEET_STATUS[week.week.tsw_status] : null;
    return (
        <Tile icon={CalendarClock} title="ลงเวลาสัปดาห์นี้" href="/people/timesheet" linkLabel="ลงเวลา">
            <div className="grid gap-3">
                <div className="flex items-end justify-between gap-3">
                    <p className="text-3xl font-medium text-gray-900 tabular-nums">
                        {hours.toLocaleString("th-TH")} <span className="text-base font-normal text-gray-500">/ {target} ชม.</span>
                    </p>
                    {status ? <StatusPill tone={status.tone}>{status.label}</StatusPill> : <StatusPill tone="neutral">ยังไม่ลง</StatusPill>}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-gray-500">เป้า = วันทำงานของสัปดาห์ {workingDays} วัน × 8 ชม.</p>
            </div>
        </Tile>
    );
}

function LeaveTile({ leave }: { leave: MyLeave | null }) {
    const balances = (leave?.balances ?? []).filter((balance) => balance.lt_status === "active" && balance.quota !== null);
    const pendingCount = (leave?.requests ?? []).filter((request) => request.lr_status === "pending").length;
    return (
        <Tile icon={CalendarCheck} title="วันลาคงเหลือ" href="/people/leave" linkLabel="ขอลา / ดูประวัติ">
            <div className="grid gap-3">
                {balances.map((balance) => {
                    const quota = Number(balance.quota);
                    const used = Number(balance.used);
                    const remaining = Number(balance.remaining ?? 0);
                    return (
                        <div key={balance.lt_id} className="grid gap-1">
                            <div className="flex items-baseline justify-between text-sm">
                                <span className="text-gray-700">{balance.lt_name_th}</span>
                                <span className="tabular-nums">
                                    <span className="font-medium text-gray-900">เหลือ {remaining.toLocaleString("th-TH")}</span>
                                    <span className="text-gray-500"> / {quota.toLocaleString("th-TH")} วัน</span>
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div
                                    className="h-full rounded-full bg-blue-500"
                                    style={{ width: `${quota > 0 ? Math.min(100, (used / quota) * 100) : 0}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
                {pendingCount > 0 && <p className="text-xs text-amber-600">รออนุมัติ {pendingCount} คำขอ</p>}
            </div>
        </Tile>
    );
}

function PayslipTile({ payslips }: { payslips: PayslipSummary[] }) {
    const latest = payslips[0];
    return (
        <Tile icon={ReceiptText} title="สลิปเงินเดือนล่าสุด" href="/people/payslips" linkLabel="ดูสลิปทั้งหมด">
            {latest ? (
                <div className="grid gap-1">
                    <span className="text-sm text-gray-500">{monthLabel(latest.pr_period)}</span>
                    <span className="text-3xl font-medium text-gray-900 tabular-nums">
                        {formatAmount(latest.pri_net)} <span className="text-base font-normal text-gray-500">บาท</span>
                    </span>
                    <span className="text-xs text-gray-500">
                        รับสุทธิ · จ่ายเมื่อ {latest.pr_paid_date ? formatDateOnly(latest.pr_paid_date) : "-"}
                    </span>
                </div>
            ) : (
                <p className="text-sm text-gray-500">ยังไม่มีสลิป · สลิปขึ้นเมื่อบริษัทบันทึกจ่ายเงินเดือนแล้ว</p>
            )}
        </Tile>
    );
}

function CardTile({ card, today }: { card: MyProfile["card"]; today: string }) {
    const status = card ? cardStatusOf({ ...card, ec_voided_at: null, ec_returned_at: null }, false, today) : null;
    return (
        <Tile icon={CreditCard} title="บัตรพนักงาน">
            {card && status ? (
                <div className="grid gap-1">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-500">ใบที่ {card.ec_seq}</span>
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </div>
                    <span className="text-lg font-medium tracking-wide text-gray-900 tabular-nums">{card.ec_emp_code}</span>
                    <span className="text-xs text-gray-500">ใช้ได้ถึง {formatDateOnly(card.ec_expires_on)}</span>
                    <span className="text-xs text-gray-500">บัตรหายหรือชำรุด แจ้งฝ่ายบุคคลเพื่อออกใบใหม่</span>
                </div>
            ) : (
                <p className="text-sm text-gray-500">ยังไม่มีบัตร</p>
            )}
        </Tile>
    );
}
