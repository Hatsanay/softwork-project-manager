"use client";

// ฉากกลุ่ม "รายงาน" และ "ตั้งค่า" — รายงานขาย + ไฟล์ส่งนักบัญชี (reports/page.tsx) · กติกาอนุมัติ (settings/company) + Log ข้อมูล
// ⚠ ข้อมูลเป็นตัวอย่าง ตัวเลขต้องตรงกับฉากอื่น (ค้างรับ = ฉากลูกหนี้คงค้าง) · ห้ามใช้ class ที่มี breakpoint
import { Check, FileSpreadsheet, GitBranch } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import { DemoHeader, DemoPage, DemoSegmented, DemoShell, DemoToast, Field, pressed, type Scene } from "./kit";
import { countUp, money, typed } from "./player";

// ── รายงานขาย → ดาวน์โหลดไฟล์ส่งนักบัญชี ────────────────────────────────────────────────────────────

const REPORT = { counters: 300, download: 3900, excel: 4300, end: 9200 };

// ยอดขายรายเดือน (พันบาท ก่อน VAT) — 12 เดือนล่าสุด
const MONTHLY_SALES = [
    ["พ.ย.", 180],
    ["ธ.ค.", 240],
    ["ม.ค.", 150],
    ["ก.พ.", 210],
    ["มี.ค.", 320],
    ["เม.ย.", 190],
    ["พ.ค.", 260],
    ["มิ.ย.", 300],
    ["ก.ค.", 280],
    ["ส.ค.", 350],
    ["ก.ย.", 330],
    ["ต.ค.", 407],
] as const;

// ชีตในไฟล์ตาม backend/src/services/accounting-export.service.js
const EXPORT_SHEETS = [
    "สรุป",
    "ใบแจ้งหนี้",
    "ใบลดหนี้",
    "ใบเสร็จ",
    "หัก ณ ที่จ่าย",
    "ลูกหนี้ ณ สิ้นเดือน",
    "ยกเลิกในเดือน",
    "ค่าใช้จ่าย",
    "ใบสำคัญจ่าย",
    "หัก ณ ที่จ่าย (บริษัทหัก)",
];

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className={`grid content-start gap-0.5 p-3 ${CARD_CLASS}`}>
            <span className="text-gray-500">{label}</span>
            <span className="text-base font-medium text-gray-900 tabular-nums">{value}</span>
            <span className="text-[0.7rem] leading-snug text-gray-500">{detail}</span>
        </div>
    );
}

function SceneReports(t: number) {
    const isExcelOpen = t >= REPORT.excel;
    // ยอดขายสุทธิ = ออกบิล 412,000 − ลดหนี้ 5,000 · รับชำระ = เงินเข้า 280,120 + หัก ณ ที่จ่าย 6,330
    const netSales = countUp(407000, t, REPORT.counters, 1000);
    const received = countUp(286450, t, REPORT.counters + 150, 1000);
    const accepted = countUp(385200, t, REPORT.counters + 300, 1000);
    const outstanding = countUp(243710, t, REPORT.counters + 450, 1000);
    return (
        <DemoShell
            menu="reports"
            crumbs={["รายงาน"]}
            overlay={
                isExcelOpen && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/20">
                        <div className="demo-pop grid w-[40rem] overflow-hidden rounded-xl border border-gray-300 bg-white text-xs shadow-float">
                            <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 text-gray-700">
                                <FileSpreadsheet size={14} className="text-blue-600" />
                                softwork-บัญชี-2026-10.xlsx
                            </div>
                            <div className="grid grid-cols-[minmax(0,1fr)_9rem] border-b border-gray-200 text-gray-800">
                                {[
                                    ["ยอดขายตามใบแจ้งหนี้ (ก่อน VAT)", "412,000.00"],
                                    ["ภาษีขายตามใบแจ้งหนี้", "28,840.00"],
                                    ["ใบลดหนี้ (ก่อน VAT)", "5,000.00"],
                                    ["ภาษีขายที่ลดตามใบลดหนี้", "350.00"],
                                    ["รับชำระ (ตัดหนี้)", "286,450.00"],
                                    ["หัก ณ ที่จ่ายที่ลูกค้าหัก", "6,330.00"],
                                ].map(([label, value]) => (
                                    <div key={label} className="contents">
                                        <span className="border-r border-t border-gray-200 px-2 py-1">{label}</span>
                                        <span className="border-t border-gray-200 px-2 py-1 text-right tabular-nums">
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-px bg-gray-200 pt-px">
                                {EXPORT_SHEETS.map((sheet, index) => (
                                    <span
                                        key={sheet}
                                        className={`px-2.5 py-1 ${index === 0 ? "bg-white font-medium text-blue-600" : "bg-gray-50 text-gray-600"}`}
                                    >
                                        {sheet}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }
        >
            <DemoPage pageKey="reports">
                <DemoHeader
                    eyebrow="รายงาน"
                    title="รายงานขาย"
                    description="ยอดขาย = ยอดก่อน VAT ของใบแจ้งหนี้ที่ออกในช่วง หักใบลดหนี้ · รับชำระตามวันที่ในใบเสร็จ · ทุกยอดเป็นบาท"
                />
                <DemoSegmented options={["เดือนนี้", "เดือนก่อน", "ไตรมาสนี้", "ปีนี้", "กำหนดเอง"]} value="เดือนนี้" />
                <div className="grid grid-cols-4 gap-3 text-xs">
                    <SummaryCard
                        label="ยอดขายสุทธิ (ก่อน VAT)"
                        value={money(netSales)}
                        detail="ออกบิล 412,000.00 (6 ใบ) − ลดหนี้ 5,000.00 (1 ใบ)"
                    />
                    <SummaryCard
                        label="รับชำระ"
                        value={money(received)}
                        detail="เงินเข้า 280,120.00 · หัก ณ ที่จ่าย 6,330.00"
                    />
                    <SummaryCard
                        label="ใบเสนอราคาที่ลูกค้าตอบรับ"
                        value={money(accepted)}
                        detail="3 ใบ · ปิดการขายได้ 75% (ปฏิเสธ 1)"
                    />
                    <SummaryCard label="ค้างรับตอนนี้" value={money(outstanding)} detail="เกินกำหนด 63,130.00" />
                </div>
                <div className={`grid gap-2 p-4 text-xs ${CARD_CLASS}`}>
                    <p className="text-sm font-medium text-gray-900">12 เดือนล่าสุด (พันบาท)</p>
                    <div className="flex h-24 items-end gap-2 border-b border-gray-200">
                        {MONTHLY_SALES.map(([month, value], index) => (
                            <div
                                key={month}
                                className="flex-1 rounded-t-md bg-brand-gradient transition-all duration-700 ease-out"
                                style={{
                                    height: t >= REPORT.counters + index * 60 ? `${(value / 420) * 100}%` : "0%",
                                }}
                            />
                        ))}
                    </div>
                    <div className="flex gap-2 text-center text-[0.65rem] text-gray-500">
                        {MONTHLY_SALES.map(([month]) => (
                            <span key={month} className="flex-1">
                                {month}
                            </span>
                        ))}
                    </div>
                </div>
                <div className={`flex items-end justify-between gap-4 p-4 text-xs ${CARD_CLASS}`}>
                    <div className="grid gap-0.5">
                        <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <FileSpreadsheet size={16} className="text-blue-600" />
                            ไฟล์ส่งนักบัญชี
                        </p>
                        <p className="text-gray-500">
                            Excel 10 ชีต ฝั่งขายและฝั่งจ่าย · ส่งนักบัญชีได้ทันทีทุกสิ้นเดือน
                        </p>
                    </div>
                    <div className="flex items-end gap-2">
                        <div className="w-36">
                            <Field label="เดือน" value="ตุลาคม 2569" />
                        </div>
                        <span
                            data-demo="export-download"
                            className={`${buttonClass("primary", "md")} transition ${pressed(t, REPORT.download)}`}
                        >
                            <FileSpreadsheet size={16} />
                            ดาวน์โหลด Excel
                        </span>
                    </div>
                </div>
            </DemoPage>
        </DemoShell>
    );
}

export const REPORTS_SCENE: Scene = {
    key: "reports",
    phase: "summary",
    title: "รายงานและไฟล์ส่งนักบัญชี",
    caption: "ยอดขายสุทธิ รับชำระ และค้างรับในหน้าเดียว · กดครั้งเดียวได้ไฟล์ Excel ส่งนักบัญชีครบทุกชีต",
    url: "/reports",
    duration: REPORT.end,
    waypoints: [{ at: REPORT.download, target: "export-download" }],
    render: SceneReports,
};

// ── ตั้งค่ากติกาอนุมัติ → ทุกการกระทำเก็บใน Log ─────────────────────────────────────────────────────────

const SETTINGS = { typeAmount: 1000, pickRole: 2500, save: 3600, saved: 3700, openLog: 5200, log: 5400, end: 9600 };

const COMPANY_TABS = [
    "ข้อมูลบริษัท",
    "ภาษีมูลค่าเพิ่ม",
    "ค่าเริ่มต้นเอกสารขาย",
    "การอนุมัติ",
    "สกุลเงิน",
    "สาขา",
    "บัญชีธนาคาร",
];
const DOCUMENT_TYPES = [
    "ใบเสนอราคา",
    "ใบแจ้งหนี้ที่สร้างเอง",
    "ใบลดหนี้",
    "ค่าใช้จ่าย / บิลผู้ขาย",
    "ใบเบิกเงินพนักงาน",
    "รอบเงินเดือน",
];
const ROLES = ["หัวหน้าฝ่ายขาย", "ผู้จัดการฝ่ายบัญชี", "กรรมการผู้จัดการ"];

function RoleChip({ name, isSelected, demo }: { name: string; isSelected: boolean; demo?: string }) {
    return (
        <span
            data-demo={demo}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 transition ${
                isSelected
                    ? "border-blue-300 bg-blue-50 font-medium text-blue-600"
                    : "border-gray-200 bg-white text-gray-600"
            }`}
        >
            {isSelected && <Check size={13} />}
            {name}
        </span>
    );
}

const LOG_ROWS = [
    {
        time: "18/10/2569 10:42",
        user: "สมชาย ใจดี",
        badge: { label: "แก้ไข", className: "bg-blue-50 text-blue-600" },
        action: "แก้ไขกติกาอนุมัติเอกสาร",
        detail: "ใบเสนอราคา · ชั้น 2 ตั้งแต่ 100,000",
        isSuccess: true,
    },
    {
        time: "18/10/2569 10:31",
        user: "วิภา แสงทอง",
        badge: { label: "ดำเนินการ", className: "bg-blue-50 text-blue-600" },
        action: "อนุมัติใบลดหนี้",
        detail: "CN-20261018-000002",
        isSuccess: true,
    },
    {
        time: "18/10/2569 10:05",
        user: "มณีรัตน์ ทองดี",
        badge: { label: "สร้าง", className: "bg-green-50 text-green-600" },
        action: "ทำจ่าย",
        detail: "PV-20261018-000005",
        isSuccess: true,
    },
    {
        time: "18/10/2569 09:58",
        user: "เอกชัย วงศ์ใหญ่",
        badge: { label: "ถูกปฏิเสธ", className: "bg-amber-50 text-amber-600" },
        action: "เปิดรอบเงินเดือน",
        detail: "ไม่มีสิทธิ์ดูรอบเงินเดือน",
        isSuccess: false,
    },
];

function SceneSettings(t: number) {
    const isLog = t >= SETTINGS.log;
    const amount = typed("100,000.00", t, SETTINGS.typeAmount, 90);
    const hasDirector = t >= SETTINGS.pickRole;
    return (
        <DemoShell
            menu="settings"
            subMenu={isLog ? "Log ข้อมูล" : "ข้อมูลบริษัท"}
            crumbs={isLog ? ["ตั้งค่าระบบ", "Log ข้อมูล"] : ["ตั้งค่าระบบ", "ข้อมูลบริษัท"]}
        >
            {!isLog ? (
                <DemoPage pageKey="approval-rules">
                    <DemoHeader
                        eyebrow="ตั้งค่าระบบ"
                        title="ข้อมูลบริษัท"
                        description="กำหนดเองได้ว่าเอกสารแต่ละแบบ ยอดเท่าไหร่ ต้องผ่านใครกี่ชั้น"
                    />
                    <DemoSegmented options={COMPANY_TABS} value="การอนุมัติ" />
                    <DemoSegmented options={DOCUMENT_TYPES} value="ใบเสนอราคา" />
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <GitBranch size={16} className="text-blue-600" />
                            การอนุมัติใบเสนอราคา
                        </p>
                        {[1, 2].map((levelNumber) => (
                            <div key={levelNumber} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 font-medium text-blue-600">
                                    {levelNumber}
                                </span>
                                <div className="grid grid-cols-[13rem_minmax(0,1fr)] items-end gap-4 rounded-lg border border-gray-200 p-3">
                                    <Field
                                        label={`ยอดขั้นต่ำของชั้น ${levelNumber} (บาท ก่อน VAT)`}
                                        value={levelNumber === 1 ? "0.00" : amount}
                                        align="right"
                                        isTyping={
                                            levelNumber === 2 && t >= SETTINGS.typeAmount && t < SETTINGS.pickRole - 400
                                        }
                                    />
                                    <div className="grid gap-1">
                                        <span className="text-gray-700">role ที่อนุมัติชั้นนี้ได้</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {ROLES.map((role) => (
                                                <RoleChip
                                                    key={role}
                                                    name={role}
                                                    demo={
                                                        levelNumber === 2 && role === "กรรมการผู้จัดการ"
                                                            ? "pick-role"
                                                            : undefined
                                                    }
                                                    isSelected={
                                                        levelNumber === 1
                                                            ? role === "หัวหน้าฝ่ายขาย"
                                                            : role === "กรรมการผู้จัดการ" && hasDirector
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <p className="rounded-lg bg-gray-50 p-2.5 text-gray-600">
                            ใบเสนอราคาก่อน VAT ต่ำกว่า 100,000 ผ่านชั้น 1 ก็จบ · ตั้งแต่ 100,000
                            ต้องผ่านกรรมการผู้จัดการอีกชั้น และต้องเป็นคนละคนกับชั้นก่อน
                        </p>
                        <span
                            data-demo="save-rules"
                            className={`${buttonClass("primary", "md")} justify-self-end transition ${pressed(t, SETTINGS.save)}`}
                        >
                            บันทึกกติกาอนุมัติ
                        </span>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="audit-log">
                    <DemoHeader
                        eyebrow="ตั้งค่าระบบ"
                        title="Log ข้อมูล"
                        description="ทุกการสร้าง แก้ไข อนุมัติ และการเข้าถึงที่ไม่มีสิทธิ์ ถูกบันทึกไว้พร้อมค่าก่อน-หลัง"
                    />
                    <DemoSegmented
                        options={["ประวัติการใช้งาน", "ข้อผิดพลาดของระบบ", "การเข้าสู่ระบบ"]}
                        value="ประวัติการใช้งาน"
                    />
                    <div className={`grid text-xs ${CARD_CLASS}`}>
                        <div className="grid grid-cols-[8.5rem_9rem_minmax(0,1fr)_9rem] gap-3 border-b border-gray-100 px-4 py-2.5 text-gray-500">
                            <span>เวลา</span>
                            <span>ผู้กระทำ</span>
                            <span>การกระทำ</span>
                            <span>ผลลัพธ์</span>
                        </div>
                        {LOG_ROWS.map((row, index) => (
                            <div
                                key={row.time}
                                className={`grid grid-cols-[8.5rem_9rem_minmax(0,1fr)_9rem] items-center gap-3 border-b border-gray-100 px-4 py-2.5 last:border-0 ${index === 0 ? "demo-pop bg-blue-50/40" : ""}`}
                            >
                                <span className="text-gray-600 tabular-nums">{row.time}</span>
                                <span className="text-gray-800">{row.user}</span>
                                <span className="grid gap-0.5">
                                    <span className="flex items-center gap-2">
                                        <span className={`rounded-full px-2 py-0.5 font-medium ${row.badge.className}`}>
                                            {row.badge.label}
                                        </span>
                                        <span className="text-gray-800">{row.action}</span>
                                    </span>
                                    <span className="text-gray-400">{row.detail}</span>
                                </span>
                                <span>
                                    {row.isSuccess ? (
                                        <StatusPill tone="success">สำเร็จ</StatusPill>
                                    ) : (
                                        <StatusPill tone="danger">ไม่สำเร็จ (403)</StatusPill>
                                    )}
                                </span>
                            </div>
                        ))}
                    </div>
                </DemoPage>
            )}
            <DemoToast show={t >= SETTINGS.saved && t < SETTINGS.openLog}>บันทึกกติกาอนุมัติแล้ว</DemoToast>
        </DemoShell>
    );
}

export const SETTINGS_SCENE: Scene = {
    key: "settings",
    phase: "control",
    title: "กติกาอนุมัติและ Log",
    caption: "ตั้งได้เองว่าเอกสารไหน ยอดเท่าไหร่ ใครอนุมัติ กำหนดสิทธิ์ราย role และทุกการกระทำมีบันทึกย้อนดูได้",
    url: (t) => (t < SETTINGS.log ? "/settings/company" : "/settings/logs"),
    duration: SETTINGS.end,
    waypoints: [
        { at: SETTINGS.pickRole, target: "pick-role" },
        { at: SETTINGS.save, target: "save-rules" },
        { at: SETTINGS.openLog, target: "menu-Log ข้อมูล" },
    ],
    render: SceneSettings,
};
