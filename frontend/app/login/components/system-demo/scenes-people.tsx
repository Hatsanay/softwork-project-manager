"use client";

// ฉากกลุ่ม "บุคคล" ที่เพิ่มทีหลัง — การลา (ตาม people/leave: ลาของฉัน → ฟอร์มขอลา → ปฏิทินทีม)
// ลงเวลา/รอบเงินเดือนอยู่ใน scenes.tsx · ⚠ ข้อมูลเป็นตัวอย่าง · ห้ามใช้ class ที่มี breakpoint
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import { DemoHeader, DemoPage, DemoSegmented, DemoShell, DemoToast, Field, pressed, type Scene } from "./kit";
import { typed } from "./player";

const LEAVE = { open: 1400, sheet: 1600, typeReason: 2500, submit: 4500, sent: 4700, calendarTab: 6300, end: 9800 };

const TABS = ["ลาของฉัน", "ปฏิทินทีม", "อนุมัติลา"];

function SceneLeave(t: number) {
    const isSheetOpen = t >= LEAVE.sheet && t < LEAVE.sent;
    const isSent = t >= LEAVE.sent;
    const isCalendar = t >= LEAVE.calendarTab + 100;
    const reason = typed("พาครอบครัวไปเที่ยวต่างจังหวัด", t, LEAVE.typeReason, 55);
    // ลาพักร้อน 10 วัน ใช้ไปแล้ว 4 · ขอใหม่ 2 วัน (27–28 ต.ค.) รออนุมัติ
    const balances = [
        { name: "ลาพักร้อน", remaining: "เหลือ 6", detail: `ใช้ 4 / 10 วัน${isSent ? " · รออนุมัติ 2" : ""}` },
        { name: "ลาป่วย", remaining: "เหลือ 28", detail: "ใช้ 2 / 30 วัน" },
        { name: "ลากิจ", remaining: "เหลือ 3", detail: "ใช้ 0 / 3 วัน" },
        { name: "ลาไม่รับค่าจ้าง", remaining: "ไม่จำกัด", detail: "ใช้ 0 วัน" },
    ];
    return (
        <DemoShell
            menu="people"
            subMenu="การลา"
            crumbs={["บุคคล", "การลา"]}
            overlay={
                isSheetOpen && (
                    <div className="absolute inset-0 z-10 flex justify-end bg-gray-900/20">
                        <div className="demo-page-in grid h-full w-[23rem] content-start gap-3 border-l border-gray-200 bg-white p-5 text-xs shadow-float">
                            <div className="flex items-center justify-between">
                                <p className="text-base font-medium text-gray-900">ขอลา</p>
                                <X size={16} className="text-gray-400" />
                            </div>
                            <Field label="ประเภทลา" value="ลาพักร้อน (เหลือ 6 วัน)" />
                            <div className="grid grid-cols-2 gap-3">
                                <Field label="วันเริ่มลา" value="27 ต.ค. 2569" />
                                <Field label="วันสุดท้ายที่ลา" value="28 ต.ค. 2569" />
                            </div>
                            <div className="grid gap-1">
                                <span className="text-gray-800">ช่วงเวลา</span>
                                <DemoSegmented options={["เต็มวัน", "ครึ่งวันเช้า", "ครึ่งวันบ่าย"]} value="เต็มวัน" />
                            </div>
                            <Field label="เหตุผล" value={reason} isTyping={t >= LEAVE.typeReason && t < LEAVE.submit} />
                            <p className="rounded-lg bg-gray-50 p-2.5 text-gray-600">
                                นับ 2 วันทำการ (ไม่นับเสาร์-อาทิตย์และวันหยุดบริษัท) · อนุมัติแล้ววันลาลงเวลาทำงานไม่ได้
                                · ลาไม่รับค่าจ้างหักในรอบเงินเดือนให้เอง
                            </p>
                            <div className="flex justify-end gap-2">
                                <span className={buttonClass("secondary", "md")}>บันทึกร่าง</span>
                                <span
                                    data-demo="leave-submit"
                                    className={`${buttonClass("primary", "md")} transition ${pressed(t, LEAVE.submit)}`}
                                >
                                    ส่งขออนุมัติ
                                </span>
                            </div>
                        </div>
                    </div>
                )
            }
        >
            <DemoPage pageKey={isCalendar ? "leave-calendar" : "leave-mine"}>
                <DemoHeader eyebrow="บุคคล" title="การลา" description="ขอลา ดูวันลาคงเหลือ และดูว่าใครในทีมลาวันไหน" />
                <DemoSegmented
                    options={TABS}
                    value={isCalendar ? "ปฏิทินทีม" : "ลาของฉัน"}
                    demo={{ ปฏิทินทีม: "leave-calendar-tab" }}
                />
                {!isCalendar ? (
                    <>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-sm font-medium text-gray-900">ปี 2569</span>
                            <span
                                data-demo="leave-open"
                                className={`${buttonClass("primary", "md")} transition ${pressed(t, LEAVE.open)}`}
                            >
                                <Plus size={16} />
                                ขอลา
                            </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                            {balances.map((balance) => (
                                <div
                                    key={balance.name}
                                    className="grid content-start gap-0.5 rounded-xl border border-gray-200 bg-white p-3"
                                >
                                    <span className="text-gray-500">{balance.name}</span>
                                    <span className="text-base font-medium text-gray-900 tabular-nums">
                                        {balance.remaining}
                                    </span>
                                    <span className="text-gray-500 tabular-nums">{balance.detail}</span>
                                </div>
                            ))}
                        </div>
                        <div className={`grid text-xs ${CARD_CLASS}`}>
                            {isSent && (
                                <div className="demo-pop flex items-center justify-between border-b border-gray-100 px-4 py-3">
                                    <div className="grid">
                                        <span className="text-gray-800">ลาพักร้อน · 27–28 ต.ค. 2569 · 2 วัน</span>
                                        <span className="text-gray-500">พาครอบครัวไปเที่ยวต่างจังหวัด</span>
                                    </div>
                                    <StatusPill tone="wait">รออนุมัติ</StatusPill>
                                </div>
                            )}
                            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                                <div className="grid">
                                    <span className="text-gray-800">ลาพักร้อน · 2–3 ต.ค. 2569 · 2 วัน</span>
                                    <span className="text-gray-500">อนุมัติโดย วิภา</span>
                                </div>
                                <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                            </div>
                            <div className="flex items-center justify-between px-4 py-3">
                                <div className="grid">
                                    <span className="text-gray-800">ลาป่วย · 8–9 ก.ย. 2569 · 2 วัน</span>
                                    <span className="text-gray-500">แนบใบรับรองแพทย์แล้ว</span>
                                </div>
                                <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <div className="flex items-center justify-between">
                            <span className={buttonClass("secondary", "sm")}>
                                <ChevronLeft size={14} />
                            </span>
                            <span className="text-sm font-medium text-gray-900">ตุลาคม 2569</span>
                            <span className={buttonClass("secondary", "sm")}>
                                <ChevronRight size={14} />
                            </span>
                        </div>
                        {[
                            { day: "จ. 20 ต.ค.", people: [{ name: "วิภา แสงทอง", note: "ครึ่งวันบ่าย" }] },
                            {
                                day: "จ. 27 ต.ค.",
                                people: [
                                    { name: "สมชาย ใจดี", note: "รออนุมัติ" },
                                    { name: "มณีรัตน์ ทองดี", note: "" },
                                ],
                            },
                            { day: "อ. 28 ต.ค.", people: [{ name: "สมชาย ใจดี", note: "รออนุมัติ" }] },
                        ].map((entry, index) => (
                            <div
                                key={entry.day}
                                className="demo-pop grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-t border-gray-100 pt-3"
                                style={{ animationDelay: `${index * 120}ms` }}
                            >
                                <span className="font-medium text-gray-800">{entry.day}</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {entry.people.map((person) => (
                                        <span
                                            key={person.name}
                                            className={`rounded-full border px-2.5 py-1 ${person.note === "รออนุมัติ" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-gray-200 bg-gray-50 text-gray-700"}`}
                                        >
                                            {person.name}
                                            {person.note && ` · ${person.note}`}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="text-gray-500">แสดงเฉพาะชื่อและช่วงเวลา · ไม่แสดงประเภทลาและเหตุผลในปฏิทินทีม</p>
                    </div>
                )}
            </DemoPage>
            <DemoToast show={isSent && t < LEAVE.calendarTab - 200}>ส่งคำขอลาแล้ว รอผู้อนุมัติ</DemoToast>
        </DemoShell>
    );
}

export const LEAVE_SCENE: Scene = {
    key: "leave",
    phase: "work",
    title: "การลา",
    caption: "ขอลาพร้อมเห็นวันคงเหลือ ระบบนับเฉพาะวันทำการให้ อนุมัติแล้วกันลงเวลาซ้ำ และดูปฏิทินลาของทีมได้",
    url: "/people/leave",
    duration: LEAVE.end,
    waypoints: [
        { at: LEAVE.open, target: "leave-open" },
        { at: LEAVE.submit, target: "leave-submit" },
        { at: LEAVE.calendarTab, target: "leave-calendar-tab" },
    ],
    render: SceneLeave,
};
