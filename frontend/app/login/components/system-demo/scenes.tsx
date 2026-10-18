"use client";

// ฉากของเดโมระบบในหน้า login (18 ต.ค. 2026) — แต่ละฉากคือฟังก์ชันของเวลา t (ms นับจากต้นฉาก) คืนหน้าจอ ณ เวลานั้น
// เล่าเฉพาะระบบที่ทำเสร็จแล้ว · ฉากแยกไฟล์ (real-*.tsx = หน้าจริง, scenes-*.tsx = หน้าจำลองที่รอเปลี่ยน) เรียงรวมใน SCENES ท้ายไฟล์นี้
// ระบบใหม่: เขียนฉาก (มี phase) แล้วใส่ใน SCENES ตรงช่วงของเรื่อง
//
// ⚠ หน้าตาต้องตรงกับหน้าจริงของระบบ — ใช้ component แสดงผลตัวจริง (StatusPill, buttonClass, CARD_CLASS) ส่วนที่เหลือเขียน
//   ตามหน้าจริงด้วย class ชุดเดียวกัน · แก้หน้าจริงเมื่อไหร่ (ข้อความปุ่ม layout) ให้แก้ฉากที่นี่ตาม
// ⚠ ข้อมูลทั้งหมดเป็นตัวอย่าง (ไม่ใช่ข้อมูลจริงของบริษัท) · ห้ามต่อ backend · ห้ามใช้ class ที่มี breakpoint
// เวลาในฉาก: waypoints = จุดที่เมาส์กด (at = ms ที่กด, target = ค่า data-demo) · หน้าตาที่เปลี่ยนคำนวณจาก t ให้ตรงกับ waypoints
import { Banknote, CheckCircle2, CheckSquare, FileCheck2, Paperclip, Send, ShieldCheck } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import {
    AmountRow,
    ApprovalLevel,
    DemoConfirm,
    DemoHeader,
    DemoPage,
    DemoShell,
    DemoToast,
    Field,
    pressed,
    type Scene,
} from "./kit";
import { countUp, money, typed } from "./player";
import { DASHBOARD_SCENE } from "./real-start";
import { BOARD_SCENE, SHARE_SCENE } from "./real-work";
import { BILLING_NOTE_SCENE, CREDIT_NOTE_SCENE, RECEIVABLES_SCENE } from "./scenes-sales";
import { PAYMENT_SCENE } from "./scenes-purchasing";
import { LEAVE_SCENE } from "./scenes-people";
import { REPORTS_SCENE, SETTINGS_SCENE } from "./scenes-admin";

// ── ฉาก 2: ใบเสนอราคา — อนุมัติชั้นสุดท้าย ได้เลขที่ทันที ─────────────────────────────────────────────

const QUOTE = { clickApprove: 2200, dialog: 2400, confirm: 3700, end: 7000 };

function SceneQuotation(t: number) {
    const isApproved = t >= QUOTE.confirm + 100;
    const isDialogOpen = t >= QUOTE.dialog && !isApproved;
    const items = [
        ["ออกแบบระบบและหน้าจอ (UX/UI)", "45,000.00"],
        ["พัฒนาระบบจองและชำระเงิน", "120,000.00"],
        ["ติดตั้งและอบรมผู้ใช้", "15,000.00"],
    ];
    return (
        <DemoShell
            menu="sales"
            subMenu="ใบเสนอราคา"
            crumbs={["ขาย", "ใบเสนอราคา", isApproved ? "QT-20261018-000004" : "ร่าง"]}
            overlay={
                isDialogOpen && (
                    <DemoConfirm
                        title="ยืนยันการอนุมัติ"
                        confirmLabel="อนุมัติ"
                        confirmDemo="confirm"
                        pressClass={pressed(t, QUOTE.confirm)}
                    >
                        <p className="text-gray-600">คุณกำลังอนุมัติชั้น 2 (ชั้นสุดท้าย)</p>
                        <p className="rounded-lg bg-gray-50 p-2 text-gray-600">
                            อนุมัติชั้นสุดท้าย = ได้เลขที่และวันที่ทันที แก้ไขไม่ได้อีก
                        </p>
                    </DemoConfirm>
                )
            }
        >
            <DemoPage pageKey="quotation">
                <DemoHeader
                    eyebrow={`ขาย · ใบเสนอราคา · ${isApproved ? "QT-20261018-000004" : "ยังไม่มีเลขที่"}`}
                    title="ระบบจองห้องพักโรงแรม"
                    description="บริษัท โรงแรมริมน้ำ จำกัด · สำนักงานใหญ่"
                    pills={
                        isApproved ? (
                            <StatusPill tone="success">อนุมัติแล้ว</StatusPill>
                        ) : (
                            <StatusPill tone="wait">รออนุมัติ ชั้น 2/2</StatusPill>
                        )
                    }
                />
                <div
                    className={`rounded-2xl border px-4 py-3 text-xs ${isApproved ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
                >
                    <p className="font-medium">
                        {isApproved ? "อนุมัติครบ · ได้เลขที่และวันที่แล้ว ส่งลูกค้าได้" : "รอคุณอนุมัติชั้น 2"}
                    </p>
                    <p className="opacity-80">
                        {isApproved
                            ? "ยืนราคาถึง 17 พ.ย. 2569 · กดพิมพ์แล้วส่ง PDF ให้ลูกค้า"
                            : "กดอนุมัติแล้วจะผ่านชั้น 2 ซึ่งเป็นชั้นสุดท้าย · ระบบออกเลขที่ให้ทันที"}
                    </p>
                </div>
                <div className="flex gap-2">
                    {!isApproved ? (
                        <span
                            data-demo="approve"
                            className={`${buttonClass("primary", "md")} transition ${pressed(t, QUOTE.clickApprove)}`}
                        >
                            <ShieldCheck size={16} />
                            อนุมัติ
                        </span>
                    ) : (
                        <span className={buttonClass("primary", "md")}>
                            <Send size={16} />
                            บันทึกว่าส่งลูกค้าแล้ว
                        </span>
                    )}
                    <span className={buttonClass("secondary", "md")}>พิมพ์ / บันทึก PDF</span>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_14rem] gap-4">
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        {items.map(([name, amount]) => (
                            <div key={name} className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-800">{name}</span>
                                <span className="tabular-nums">{amount}</span>
                            </div>
                        ))}
                        <div className="ml-auto grid w-56 gap-1">
                            <AmountRow label="รวมเป็นเงิน" value="180,000.00" />
                            <AmountRow label="VAT 7%" value="12,600.00" />
                            <AmountRow label="รวมทั้งสิ้น (THB)" value="192,600.00" strong />
                        </div>
                        <div className="grid gap-1 rounded-xl bg-gray-50 p-2.5">
                            <p className="text-gray-500">งวดการชำระเงิน</p>
                            <AmountRow label="งวดที่ 1 มัดจำ 30%" value="57,780.00" />
                            <AmountRow label="งวดที่ 2 ส่งมอบรอบแรก 40%" value="77,040.00" />
                            <AmountRow label="งวดที่ 3 ปิดงาน 30%" value="57,780.00" />
                        </div>
                    </div>
                    <div className={`grid content-start gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <p className="text-sm font-medium text-gray-900">การอนุมัติ</p>
                        <ApprovalLevel done label="ชั้น 1 · หัวหน้าฝ่ายขาย" note="อนุมัติโดย วิภา · 09:12" />
                        <ApprovalLevel
                            done={isApproved}
                            waiting={!isApproved}
                            label="ชั้น 2 · กรรมการผู้จัดการ"
                            note={isApproved ? "อนุมัติโดย สมชาย · เมื่อสักครู่" : "รออนุมัติชั้นนี้ (ยอดเกิน 100,000)"}
                        />
                    </div>
                </div>
            </DemoPage>
            <DemoToast show={isApproved && t < QUOTE.end - 800}>อนุมัติแล้ว · ได้เลขที่ QT-20261018-000004</DemoToast>
        </DemoShell>
    );
}

// ── ฉาก 3: ใบแจ้งหนี้ + QR พร้อมเพย์ → บันทึกรับเงิน (ออกใบเสร็จ) ────────────────────────────────────

const INVOICE = { clickReceive: 2100, form: 2400, typeRef: 3000, save: 5400, paid: 5700, end: 8500 };

/** QR จำลอง (ไม่ใช่รหัสชำระเงินจริง) — ลายคงที่ + มุมจับตำแหน่ง 3 มุม */
function FakeQr() {
    const size = 21;
    const cells: [number, number][] = [];
    let seed = 11;
    const isFinder = (x: number, y: number) => (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            seed = (seed * 9301 + 49297) % 233280;
            if (!isFinder(x, y) && seed / 233280 > 0.5) cells.push([x, y]);
        }
    }
    const finder = (x: number, y: number) => (
        <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="7" height="7" />
            <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
            <rect x={x + 2} y={y + 2} width="3" height="3" />
        </g>
    );
    return (
        <svg viewBox={`-1 -1 ${size + 2} ${size + 2}`} className="h-24 w-24" shapeRendering="crispEdges" fill="#111827">
            <rect x="-1" y="-1" width={size + 2} height={size + 2} fill="#fff" />
            {cells.map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
            ))}
            {finder(0, 0)}
            {finder(size - 7, 0)}
            {finder(0, size - 7)}
        </svg>
    );
}

function SceneInvoice(t: number) {
    const isForm = t >= INVOICE.form && t < INVOICE.paid;
    const isPaid = t >= INVOICE.paid;
    const reference = typed("FT68101845521", t, INVOICE.typeRef, 110);
    return (
        <DemoShell
            menu="sales"
            subMenu={isForm ? "ใบเสร็จรับเงิน" : "ใบแจ้งหนี้"}
            crumbs={isForm ? ["ขาย", "ใบเสร็จรับเงิน", "บันทึกรับเงิน"] : ["ขาย", "ใบแจ้งหนี้", "IV-20261018-000007"]}
        >
            {!isForm ? (
                <DemoPage pageKey={isPaid ? "invoice-paid" : "invoice"}>
                    <DemoHeader
                        eyebrow="ขาย · ใบแจ้งหนี้ · IV-20261018-000007"
                        title="งวดที่ 1 มัดจำ 30% · ระบบจองห้องพักโรงแรม"
                        description="บริษัท โรงแรมริมน้ำ จำกัด · ครบกำหนด 17 พ.ย. 2569"
                        pills={
                            <>
                                <StatusPill tone="info">ออกแล้ว</StatusPill>
                                {isPaid && <StatusPill tone="success">ชำระครบ</StatusPill>}
                            </>
                        }
                    />
                    <div className="flex gap-2">
                        <span className={buttonClass("secondary", "md")}>พิมพ์ / บันทึก PDF</span>
                        {!isPaid && (
                            <span
                                data-demo="receive"
                                className={`${buttonClass("primary", "md")} transition ${pressed(t, INVOICE.clickReceive)}`}
                            >
                                <Banknote size={16} />
                                บันทึกรับเงิน
                            </span>
                        )}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_15rem] gap-4">
                        <div className={`grid content-start gap-2 p-4 text-xs ${CARD_CLASS}`}>
                            <div className="flex justify-between border-b border-gray-100 pb-2">
                                <span className="text-gray-800">
                                    งวดที่ 1 มัดจำ (30%) ตามใบเสนอราคา QT-20261018-000004
                                </span>
                                <span className="tabular-nums">54,000.00</span>
                            </div>
                            <div className="ml-auto grid w-60 gap-1">
                                <AmountRow label="VAT 7%" value="3,780.00" />
                                <AmountRow label="รวมทั้งสิ้น (THB)" value="57,780.00" strong />
                                <AmountRow label="หัก ณ ที่จ่าย 3% (ประมาณ)" value="−1,620.00" />
                                <AmountRow label="ยอดชำระหลังหัก ณ ที่จ่าย" value="56,160.00" strong />
                            </div>
                        </div>
                        <div className={`grid content-start gap-2 p-4 text-xs ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">การชำระเงิน</p>
                            <div className="grid gap-1 rounded-xl bg-gray-50 p-2.5">
                                <AmountRow label="รับแล้ว" value={isPaid ? "57,780.00" : "0.00"} />
                                <AmountRow label="ค้างชำระ" value={isPaid ? "0.00 THB" : "57,780.00 THB"} strong />
                                {isPaid && <p className="demo-pop text-blue-600">RE-20261018-000003 · โอนเข้าบัญชี</p>}
                            </div>
                            {!isPaid && (
                                <div className="grid justify-items-center gap-1 rounded-xl bg-gray-50 p-2.5">
                                    <FakeQr />
                                    <p className="text-gray-600">พร้อมเพย์ · 56,160.00 บาท</p>
                                    <p className="text-center text-[0.65rem] text-gray-500">
                                        QR ใส่ยอดหลังหัก ณ ที่จ่ายไว้แล้ว
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="receipt-form">
                    <DemoHeader
                        eyebrow="ขาย · ใบเสร็จรับเงิน"
                        title="บันทึกรับเงิน"
                        description="บันทึก = ออกใบเสร็จทันที · รับบางส่วนได้"
                    />
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                            <span className="flex items-center gap-2 text-gray-800">
                                <CheckSquare size={15} className="text-blue-600" />
                                IV-20261018-000007 · งวดที่ 1 มัดจำ 30%
                            </span>
                            <span className="tabular-nums">รับ 57,780.00</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <Field label="วิธีรับเงิน" value="โอนเข้าบัญชี" />
                            <Field label="บัญชีที่เงินเข้า" value="กสิกรไทย 123-4-56789-0" />
                            <Field
                                label="เลขอ้างอิงการโอน"
                                value={reference}
                                isTyping={t >= INVOICE.typeRef && reference.length < 13}
                            />
                        </div>
                        <div className="ml-auto grid w-72 gap-1 rounded-xl bg-gray-50 p-3">
                            <AmountRow label="ยอดตัดหนี้รวม" value="57,780.00" />
                            <AmountRow label="หัก ณ ที่จ่าย (ตาม 50 ทวิ)" value="−1,620.00" />
                            <AmountRow label="เงินเข้าจริง" value="56,160.00 THB" strong />
                        </div>
                        <span
                            data-demo="save-receipt"
                            className={`${buttonClass("primary", "md")} justify-self-end transition ${pressed(t, INVOICE.save)}`}
                        >
                            <FileCheck2 size={16} />
                            บันทึกรับเงิน (ออกใบเสร็จ)
                        </span>
                    </div>
                </DemoPage>
            )}
            <DemoToast show={isPaid && t < INVOICE.end - 900}>ออกใบเสร็จ RE-20261018-000003 แล้ว</DemoToast>
        </DemoShell>
    );
}

// ── ฉาก 4: ค่าใช้จ่าย — บันทึกบิล แนบใบเสร็จ ส่งอนุมัติ ผ่านตามวงเงิน ────────────────────────────────────

const EXPENSE = {
    typeTitle: 500,
    typeAmount: 1900,
    attach: 3000,
    submit: 4100,
    detail: 4400,
    level1: 5300,
    level2: 6400,
    end: 8200,
};

function SceneExpense(t: number) {
    const isDetail = t >= EXPENSE.detail;
    const title = typed("ค่าเซิร์ฟเวอร์ AWS เดือน ต.ค. 2569", t, EXPENSE.typeTitle, 45);
    const amount = typed("18,500.00", t, EXPENSE.typeAmount, 90);
    const hasFile = t >= EXPENSE.attach + 150;
    return (
        <DemoShell
            menu="purchasing"
            subMenu="ค่าใช้จ่าย"
            crumbs={["จัดซื้อ", "ค่าใช้จ่าย", isDetail ? "EX-20261018-000012" : "บันทึกใหม่"]}
        >
            {!isDetail ? (
                <DemoPage pageKey="expense-form">
                    <DemoHeader
                        eyebrow="จัดซื้อ · ค่าใช้จ่าย"
                        title="บันทึกค่าใช้จ่าย / บิลผู้ขาย"
                        description="ผู้ขาย Amazon Web Services · ใบกำกับภาษี"
                    />
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <div className="grid grid-cols-[minmax(0,1fr)_9rem_9rem_9rem] gap-3">
                            <Field
                                label="รายละเอียด"
                                value={title}
                                isTyping={t >= EXPENSE.typeTitle && t < EXPENSE.typeAmount}
                            />
                            <Field label="หมวด" value="เซิร์ฟเวอร์/คลาวด์" />
                            <Field label="โปรเจกต์" value="ระบบจองห้องพัก" />
                            <Field
                                label="ยอด (บาท)"
                                value={amount}
                                isTyping={t >= EXPENSE.typeAmount && t < EXPENSE.attach}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span
                                data-demo="attach"
                                className={`${buttonClass("secondary", "sm")} transition ${pressed(t, EXPENSE.attach)}`}
                            >
                                <Paperclip size={14} />
                                แนบไฟล์
                            </span>
                            {hasFile && (
                                <span className="demo-pop flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1.5 text-gray-700">
                                    <Paperclip size={12} />
                                    aws-invoice-oct.pdf
                                </span>
                            )}
                        </div>
                        <p className="rounded-xl bg-gray-50 p-2.5 text-gray-600">
                            ยอดก่อน VAT ตั้งแต่ 10,000 บาท ต้องอนุมัติ 2 ชั้น (หัวหน้าฝ่าย → ผู้บริหาร) · ต่ำกว่า 2,000
                            บาทผ่านอัตโนมัติ
                        </p>
                        <span
                            data-demo="submit-expense"
                            className={`${buttonClass("primary", "md")} justify-self-end transition ${pressed(t, EXPENSE.submit)}`}
                        >
                            <Send size={16} />
                            ส่งขออนุมัติ
                        </span>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="expense-detail">
                    <DemoHeader
                        eyebrow="จัดซื้อ · ค่าใช้จ่าย · EX-20261018-000012"
                        title="ค่าเซิร์ฟเวอร์ AWS เดือน ต.ค. 2569"
                        description="Amazon Web Services · โปรเจกต์ ระบบจองห้องพักโรงแรม"
                        pills={
                            t >= EXPENSE.level2 ? (
                                <StatusPill tone="info">อนุมัติแล้ว · รอจ่าย</StatusPill>
                            ) : (
                                <StatusPill tone="wait">รออนุมัติ</StatusPill>
                            )
                        }
                    />
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`grid content-start gap-2 p-4 text-xs ${CARD_CLASS}`}>
                            <AmountRow label="ยอดก่อน VAT" value="18,500.00" />
                            <AmountRow label="VAT 7% (ขอคืนไม่ได้ = ต้นทุน)" value="1,295.00" />
                            <AmountRow label="รวม" value="19,795.00 THB" strong />
                            <p className="mt-1 text-gray-500">เข้าต้นทุนโปรเจกต์ทันทีเมื่ออนุมัติ</p>
                        </div>
                        <div className={`grid content-start gap-3 p-4 text-xs ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">การอนุมัติ</p>
                            <ApprovalLevel
                                done={t >= EXPENSE.level1}
                                waiting={t < EXPENSE.level1}
                                label="ชั้น 1 · หัวหน้าฝ่าย"
                                note={t >= EXPENSE.level1 ? "อนุมัติโดย วิภา · เมื่อสักครู่" : "รออนุมัติชั้นนี้"}
                            />
                            <ApprovalLevel
                                done={t >= EXPENSE.level2}
                                waiting={t >= EXPENSE.level1 && t < EXPENSE.level2}
                                label="ชั้น 2 · ผู้บริหาร"
                                note={
                                    t >= EXPENSE.level2
                                        ? "อนุมัติโดย สมชาย · เมื่อสักครู่"
                                        : t >= EXPENSE.level1
                                          ? "รออนุมัติชั้นนี้"
                                          : "-"
                                }
                            />
                        </div>
                    </div>
                </DemoPage>
            )}
            <DemoToast show={t >= EXPENSE.level2 && t < EXPENSE.end - 700}>
                อนุมัติครบ · อยู่ในรายการรอจ่ายแล้ว
            </DemoToast>
        </DemoShell>
    );
}

// ── ฉาก 5: ลงเวลาทำงาน — ลงชั่วโมงรายโปรเจกต์ วันลาที่อนุมัติแล้วลงไม่ได้ ───────────────────────────────

const TIMESHEET = { start: 500, perCell: 300, submit: 5300, end: 7200 };

const TIMESHEET_ROWS = [
    { project: "ระบบจองห้องพักโรงแรม", hours: [5, 6, 4, 6] },
    { project: "แอปส่งอาหาร", hours: [2, 1, 3, 2] },
    { project: "งานภายในบริษัท", hours: [1, 1, 1, 0] },
];
const DAYS = ["จ. 13", "อ. 14", "พ. 15", "พฤ. 16", "ศ. 17"];

function SceneTimesheet(t: number) {
    // ช่องที่ลงแล้ว ณ เวลา t — ไล่ทีละวัน ทีละโปรเจกต์
    const filledCount = t < TIMESHEET.start ? 0 : Math.floor((t - TIMESHEET.start) / TIMESHEET.perCell) + 1;
    const cellValue = (row: number, day: number) => {
        const order = day * TIMESHEET_ROWS.length + row;
        return order < filledCount ? TIMESHEET_ROWS[row].hours[day] : null;
    };
    const dayTotal = (day: number) =>
        TIMESHEET_ROWS.reduce((sum, _row, rowIndex) => sum + (cellValue(rowIndex, day) ?? 0), 0);
    const weekTotal = [0, 1, 2, 3].reduce((sum, day) => sum + dayTotal(day), 0);
    const isSubmitted = t >= TIMESHEET.submit + 100;
    return (
        <DemoShell menu="people" subMenu="ลงเวลาทำงาน" crumbs={["บุคคล", "ลงเวลาทำงาน"]}>
            <DemoPage pageKey="timesheet">
                <DemoHeader
                    eyebrow="บุคคล · ลงเวลาทำงาน"
                    title="สัปดาห์ 13–17 ต.ค. 2569"
                    description="ลงชั่วโมงรายโปรเจกต์ · อนุมัติแล้วค่าแรงเข้าต้นทุนโปรเจกต์อัตโนมัติ"
                    pills={
                        isSubmitted ? (
                            <StatusPill tone="wait">รออนุมัติ</StatusPill>
                        ) : (
                            <StatusPill tone="neutral">ร่าง</StatusPill>
                        )
                    }
                />
                <div className={`p-4 text-xs ${CARD_CLASS}`}>
                    <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,5.5rem)] items-center gap-2">
                        <span className="text-gray-500">โปรเจกต์</span>
                        {DAYS.map((day) => (
                            <span key={day} className="text-center text-gray-500">
                                {day}
                            </span>
                        ))}
                        {TIMESHEET_ROWS.map((row, rowIndex) => (
                            <TimesheetRow
                                key={row.project}
                                name={row.project}
                                values={[0, 1, 2, 3].map((day) => cellValue(rowIndex, day))}
                            />
                        ))}
                        <span className="font-medium text-gray-900">รวมต่อวัน</span>
                        {[0, 1, 2, 3].map((day) => (
                            <span key={day} className="text-center font-medium text-gray-900 tabular-nums">
                                {dayTotal(day)} ชม.
                            </span>
                        ))}
                        <span className="text-center text-gray-400">-</span>
                    </div>
                </div>
                <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                        รวมทั้งสัปดาห์ <span className="font-medium text-gray-900 tabular-nums">{weekTotal} ชม.</span> ·
                        ศุกร์ 17 ลาพักร้อน (อนุมัติแล้ว) ลงเวลาไม่ได้
                    </p>
                    <span
                        data-demo="submit-week"
                        className={`${buttonClass("primary", "md")} transition ${pressed(t, TIMESHEET.submit)}`}
                    >
                        <Send size={16} />
                        ส่งอนุมัติ
                    </span>
                </div>
            </DemoPage>
            <DemoToast show={isSubmitted && t < TIMESHEET.end - 500}>ส่งให้ผู้จัดการโปรเจกต์อนุมัติแล้ว</DemoToast>
        </DemoShell>
    );
}

function TimesheetRow({ name, values }: { name: string; values: (number | null)[] }) {
    return (
        <>
            <span className="truncate text-gray-800">{name}</span>
            {values.map((value, index) => (
                <span
                    key={index}
                    className={`flex h-9 items-center justify-center rounded-xl border tabular-nums ${value === null ? "border-gray-200 text-gray-300" : "demo-pop border-blue-200 bg-blue-50/50 text-gray-900"}`}
                >
                    {value === null ? "–" : value}
                </span>
            ))}
            <span className="flex h-9 items-center justify-center rounded-xl bg-amber-50 text-[0.7rem] text-amber-600">
                ลา
            </span>
        </>
    );
}

// ── ฉาก 6: รอบเงินเดือน — คำนวณ อนุมัติ บันทึกจ่าย พนักงานดูสลิปเอง ─────────────────────────────────────

const PAYROLL = { calculate: 1400, numbers: 1600, submit: 3500, approved: 4800, paid: 6100, end: 8400 };

const EMPLOYEES = [
    { name: "ภูมิ ศรีสุข", salary: 45000, sso: 875, tax: 1850 },
    { name: "มณีรัตน์ ทองดี", salary: 38000, sso: 875, tax: 1120 },
    { name: "เอกชัย วงศ์ใหญ่", salary: 32000, sso: 875, tax: 610 },
    { name: "วิภา แสงทอง", salary: 26000, sso: 875, tax: 150 },
];

function ScenePayroll(t: number) {
    const status =
        t >= PAYROLL.paid + 100
            ? { tone: "success" as const, label: "จ่ายแล้ว" }
            : t >= PAYROLL.approved
              ? { tone: "info" as const, label: "อนุมัติแล้ว" }
              : t >= PAYROLL.submit + 100
                ? { tone: "wait" as const, label: "รออนุมัติ" }
                : { tone: "neutral" as const, label: "ร่าง" };
    const isCalculated = t >= PAYROLL.numbers;
    const total = EMPLOYEES.reduce((sum, employee) => sum + employee.salary - employee.sso - employee.tax, 0);
    const actionButton =
        t < PAYROLL.submit + 100
            ? {
                  label: isCalculated ? "ส่งขออนุมัติ" : "คำนวณ",
                  demo: isCalculated ? "submit-payroll" : "calculate",
                  at: isCalculated ? PAYROLL.submit : PAYROLL.calculate,
              }
            : t >= PAYROLL.approved && t < PAYROLL.paid + 100
              ? { label: "บันทึกจ่ายแล้ว", demo: "mark-paid", at: PAYROLL.paid }
              : null;
    return (
        <DemoShell menu="people" subMenu="รอบเงินเดือน" crumbs={["บุคคล", "รอบเงินเดือน", "ต.ค. 2569"]}>
            <DemoPage pageKey="payroll">
                <DemoHeader
                    eyebrow="บุคคล · รอบเงินเดือน"
                    title="รอบเงินเดือน ตุลาคม 2569"
                    description="จ่ายวันที่ 25 ต.ค. 2569 · 4 คน · คิดภาษีแบบประมาณการทั้งปี"
                    pills={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
                />
                <div className={`grid gap-1 p-4 text-xs ${CARD_CLASS}`}>
                    <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_7.5rem] gap-2 border-b border-gray-100 pb-2 text-gray-500">
                        <span>พนักงาน</span>
                        <span className="text-right">เงินเดือน</span>
                        <span className="text-right">ประกันสังคม</span>
                        <span className="text-right">ภาษี</span>
                        <span className="text-right">รับสุทธิ</span>
                    </div>
                    {EMPLOYEES.map((employee) => (
                        <div
                            key={employee.name}
                            className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_7rem_7.5rem] gap-2 border-b border-gray-100 py-1.5 tabular-nums"
                        >
                            <span className="text-gray-800">{employee.name}</span>
                            <span className="text-right">{money(employee.salary)}</span>
                            <span className="text-right">
                                {isCalculated ? money(countUp(employee.sso, t, PAYROLL.numbers)) : "–"}
                            </span>
                            <span className="text-right">
                                {isCalculated ? money(countUp(employee.tax, t, PAYROLL.numbers)) : "–"}
                            </span>
                            <span className="text-right font-medium text-gray-900">
                                {isCalculated
                                    ? money(countUp(employee.salary - employee.sso - employee.tax, t, PAYROLL.numbers))
                                    : "–"}
                            </span>
                        </div>
                    ))}
                    <div className="flex justify-between pt-1.5 font-medium text-gray-900">
                        <span>จ่ายสุทธิรวม</span>
                        <span className="tabular-nums">
                            {isCalculated ? `${money(countUp(total, t, PAYROLL.numbers))} THB` : "–"}
                        </span>
                    </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                    {t >= PAYROLL.paid + 100 ? (
                        <div className="demo-pop flex flex-wrap gap-1.5 text-xs">
                            {[
                                "สลิปพร้อมให้พนักงานดูเอง",
                                "ภ.ง.ด.1 พร้อมพิมพ์",
                                "สปส.1-10 พร้อมพิมพ์",
                                "ค่าแรงเข้าต้นทุนโปรเจกต์แล้ว",
                            ].map((chip) => (
                                <span
                                    key={chip}
                                    className="flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-blue-600"
                                >
                                    <CheckCircle2 size={12} />
                                    {chip}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-gray-500">
                            {t >= PAYROLL.submit + 100 && t < PAYROLL.approved
                                ? "รอผู้อนุมัติ · คนที่มีชื่อในรอบอนุมัติรอบนี้ไม่ได้"
                                : "ขาด/ลาไม่รับค่าจ้าง หักให้อัตโนมัติจากใบลาที่อนุมัติแล้ว"}
                        </p>
                    )}
                    {actionButton && (
                        <span
                            data-demo={actionButton.demo}
                            className={`${buttonClass("primary", "md")} shrink-0 transition ${pressed(t, actionButton.at)}`}
                        >
                            {actionButton.label}
                        </span>
                    )}
                </div>
            </DemoPage>
            <DemoToast show={t >= PAYROLL.approved && t < PAYROLL.approved + 1200}>
                วิภา อนุมัติรอบเงินเดือนแล้ว
            </DemoToast>
            <DemoToast show={t >= PAYROLL.paid + 100 && t < PAYROLL.end - 600}>
                บันทึกจ่ายแล้ว · พนักงานเปิดสลิปได้
            </DemoToast>
        </DemoShell>
    );
}

// ── ฉาก 7: กำไรรายโปรเจกต์ — รายได้ − ค่าใช้จ่าย − ค่าแรง ───────────────────────────────────────────────

const PROFIT = { start: 400, end: 6500 };
const MONTHS = [
    { month: "ก.ค.", revenue: 54, cost: 30 },
    { month: "ส.ค.", revenue: 72, cost: 41 },
    { month: "ก.ย.", revenue: 77, cost: 52 },
    { month: "ต.ค.", revenue: 77, cost: 60 },
];

function SceneProfit(t: number) {
    const revenue = countUp(280000, t, PROFIT.start, 1200);
    const expenses = countUp(64500, t, PROFIT.start + 300, 1200);
    const labor = countUp(118200, t, PROFIT.start + 600, 1200);
    const profit = revenue - expenses - labor;
    const isGrown = t >= PROFIT.start + 200;
    return (
        <DemoShell menu="projects" crumbs={["โปรเจกต์", "ระบบจองห้องพักโรงแรม", "การเงิน"]}>
            <DemoPage pageKey="profit">
                <DemoHeader
                    eyebrow="โปรเจกต์ · การเงิน"
                    title="ระบบจองห้องพักโรงแรม"
                    description="มูลค่าสัญญา 192,600 + งานเพิ่ม 107,000 · เป็นบาทตามอัตราของเอกสาร"
                    pills={<StatusPill tone="info">กำลังดำเนินการ</StatusPill>}
                />
                <div className="grid grid-cols-4 gap-3 text-xs">
                    <ProfitStat label="รายได้ (ออกบิล ก่อน VAT)" value={money(revenue)} />
                    <ProfitStat label="ค่าใช้จ่าย / ใบเบิก" value={money(expenses)} />
                    <ProfitStat label="ค่าแรง (จากรอบเงินเดือน)" value={money(labor)} />
                    <ProfitStat
                        label="กำไรขั้นต้น"
                        value={`${money(profit)}${revenue > 0 ? ` (${((profit / 280000) * 100).toFixed(1)}%)` : ""}`}
                        tone="text-green-600"
                    />
                </div>
                <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">รายได้เทียบต้นทุน รายเดือน (พันบาท)</p>
                        <span className="flex items-center gap-3 text-gray-500">
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                                รายได้
                            </span>
                            <span className="flex items-center gap-1.5">
                                <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" />
                                ต้นทุน
                            </span>
                        </span>
                    </div>
                    <div className="flex h-40 items-end justify-around gap-6 border-b border-gray-200 px-4">
                        {MONTHS.map((row) => (
                            <div key={row.month} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                                <div className="flex h-full w-full items-end justify-center gap-1.5">
                                    <div
                                        className="w-7 rounded-t-md bg-brand-gradient transition-all duration-1000 ease-out"
                                        style={{ height: isGrown ? `${row.revenue}%` : "0%" }}
                                    />
                                    <div
                                        className="w-7 rounded-t-md bg-gray-300 transition-all delay-200 duration-1000 ease-out"
                                        style={{ height: isGrown ? `${row.cost}%` : "0%" }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-around gap-6 px-4 text-gray-500">
                        {MONTHS.map((row) => (
                            <span key={row.month} className="flex-1 text-center">
                                {row.month}
                            </span>
                        ))}
                    </div>
                </div>
            </DemoPage>
        </DemoShell>
    );
}

function ProfitStat({ label, value, tone = "text-gray-900" }: { label: string; value: string; tone?: string }) {
    return (
        <div className="grid content-start gap-0.5 rounded-2xl border border-gray-200 bg-white p-3 shadow-card">
            <span className="text-gray-500">{label}</span>
            <span className={`text-base font-medium tabular-nums ${tone}`}>{value}</span>
        </div>
    );
}

// ── ลำดับฉาก ─────────────────────────────────────────────────────────────────────────────────────

const CORE_SCENES: Scene[] = [
    {
        key: "quotation",
        phase: "deal",
        title: "ใบเสนอราคาและการอนุมัติ",
        caption: "อนุมัติหลายชั้นตามวงเงิน อนุมัติครบได้เลขที่และวันที่ทันที",
        url: "/sales/quotations/view",
        duration: QUOTE.end,
        waypoints: [
            { at: QUOTE.clickApprove, target: "approve" },
            { at: QUOTE.confirm, target: "confirm" },
        ],
        render: SceneQuotation,
    },
    {
        key: "invoice",
        phase: "collect",
        title: "ใบแจ้งหนี้และรับเงิน",
        caption: "QR พร้อมเพย์ใส่ยอดหลังหัก ณ ที่จ่ายให้เอง · บันทึกรับเงิน = ออกใบเสร็จทันที",
        url: (t) => (t >= INVOICE.form && t < INVOICE.paid ? "/sales/receipts/new" : "/sales/invoices/view"),
        duration: INVOICE.end,
        waypoints: [
            { at: INVOICE.clickReceive, target: "receive" },
            { at: INVOICE.save, target: "save-receipt" },
        ],
        render: SceneInvoice,
    },
    {
        key: "expense",
        phase: "pay",
        title: "ค่าใช้จ่ายและการอนุมัติ",
        caption: "บันทึกบิล แนบใบเสร็จ อนุมัติตามวงเงิน แล้วเข้ารายการรอจ่าย",
        url: (t) => (t < EXPENSE.detail ? "/purchasing/expenses/new" : "/purchasing/expenses/view"),
        duration: EXPENSE.end,
        waypoints: [
            { at: EXPENSE.attach, target: "attach" },
            { at: EXPENSE.submit, target: "submit-expense" },
        ],
        render: SceneExpense,
    },
    {
        key: "timesheet",
        phase: "work",
        title: "ลงเวลาทำงาน",
        caption: "ลงชั่วโมงรายโปรเจกต์ วันลาที่อนุมัติแล้วกันลงเวลาซ้ำ",
        url: "/people/timesheet",
        duration: TIMESHEET.end,
        waypoints: [{ at: TIMESHEET.submit, target: "submit-week" }],
        render: SceneTimesheet,
    },
    {
        key: "payroll",
        phase: "payroll",
        title: "รอบเงินเดือนและสลิป",
        caption: "คำนวณประกันสังคมและภาษีให้ อนุมัติแล้วพนักงานเปิดสลิปเอง พร้อมแบบ ภ.ง.ด.1",
        url: "/people/payroll/view",
        duration: PAYROLL.end,
        waypoints: [
            { at: PAYROLL.calculate, target: "calculate" },
            { at: PAYROLL.submit, target: "submit-payroll" },
            { at: PAYROLL.paid, target: "mark-paid" },
        ],
        render: ScenePayroll,
    },
    {
        key: "profit",
        phase: "summary",
        title: "กำไรรายโปรเจกต์",
        caption: "รายได้ − ค่าใช้จ่าย − ค่าแรง เห็นกำไรขั้นต้นของทุกโปรเจกต์",
        url: "/projects/view?tab=finance",
        duration: PROFIT.end,
        waypoints: [],
        render: SceneProfit,
    },
];

const coreScene = (key: string) => CORE_SCENES.find((scene) => scene.key === key)!;

/**
 * ลำดับที่เล่นจริง = เรื่องเดียวตามช่วงของงาน (STORY_PHASES) — docs/plans/2026-10-18-login-demo-real-ui.md ข้อ 2
 * ฉากจาก real-*.tsx ใช้หน้าจริง · ฉากอื่นยังเป็นหน้าจำลอง รอเปลี่ยนในขั้น L-2 ถึง L-6
 */
export const SCENES: Scene[] = [
    DASHBOARD_SCENE,
    coreScene("quotation"),
    BOARD_SCENE,
    coreScene("timesheet"),
    LEAVE_SCENE,
    SHARE_SCENE,
    coreScene("invoice"),
    BILLING_NOTE_SCENE,
    CREDIT_NOTE_SCENE,
    RECEIVABLES_SCENE,
    coreScene("expense"),
    PAYMENT_SCENE,
    coreScene("payroll"),
    coreScene("profit"),
    REPORTS_SCENE,
    SETTINGS_SCENE,
];
