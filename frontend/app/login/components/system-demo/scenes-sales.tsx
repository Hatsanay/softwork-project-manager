"use client";

// ฉากกลุ่ม "ขาย" ที่เพิ่มทีหลัง (ใบวางบิล ใบลดหนี้ ลูกหนี้คงค้าง) — ใบเสนอราคา/ใบแจ้งหนี้อยู่ใน scenes.tsx
// ⚠ ข้อมูลเป็นตัวอย่าง แต่ตัวเลขต้องบวกลบตรงกัน (กติกาเงิน: อ่านบนลงล่าง ยอดเดียวต่อความหมาย) · ห้ามใช้ class ที่มี breakpoint
import { CheckCircle2, FileCheck2, FileMinus2, Send } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import {
    AmountRow,
    ApprovalLevel,
    DemoCheckbox,
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

// ── ใบวางบิล: เลือกใบแจ้งหนี้ของลูกค้า → สร้างร่าง → ออกใบวางบิล ───────────────────────────────────────

const BILLING = {
    pickFirst: 1300,
    pickSecond: 2300,
    create: 3500,
    view: 3800,
    issue: 4900,
    dialog: 5100,
    confirm: 6200,
    end: 9000,
};

// ยอดก่อน VAT 72,000 + 30,000 = 102,000 · หัก ณ ที่จ่าย 3% = 3,060
const BILLING_INVOICES = [
    { number: "IV-20261018-000008", title: "งวดที่ 2 ส่งมอบรอบแรก 40%", due: "17 พ.ย. 2569", total: 77040 },
    { number: "IV-20261012-000003", title: "งานเพิ่ม ระบบรายงานผู้บริหาร", due: "11 พ.ย. 2569", total: 32100 },
];

function SceneBillingNote(t: number) {
    const isView = t >= BILLING.view;
    const isIssued = t >= BILLING.confirm + 100;
    const isDialogOpen = t >= BILLING.dialog && !isIssued;
    const pickedCount = t >= BILLING.pickSecond ? 2 : t >= BILLING.pickFirst ? 1 : 0;
    const pickedTotal = BILLING_INVOICES.slice(0, pickedCount).reduce((sum, invoice) => sum + invoice.total, 0);
    const number = isIssued ? "BN-20261018-000002" : "ยังไม่มีเลขที่";
    return (
        <DemoShell
            menu="sales"
            subMenu="ใบวางบิล"
            crumbs={["ขาย", "ใบวางบิล", isView ? (isIssued ? "BN-20261018-000002" : "ร่าง") : "สร้างใบวางบิล"]}
            overlay={
                isDialogOpen && (
                    <DemoConfirm
                        title="ออกใบวางบิล?"
                        confirmLabel="ออกใบวางบิล"
                        confirmDemo="issue-confirm"
                        pressClass={pressed(t, BILLING.confirm)}
                    >
                        <p className="text-gray-600">
                            ออกแล้วได้เลขที่ทันที · ใบแจ้งหนี้ 2 ใบนี้วางบิลซ้ำในใบอื่นไม่ได้
                        </p>
                    </DemoConfirm>
                )
            }
        >
            {!isView ? (
                <DemoPage pageKey="billing-form">
                    <DemoHeader
                        eyebrow="ขาย · ใบวางบิล"
                        title="สร้างใบวางบิล"
                        description="รวมใบแจ้งหนี้ที่ค้างของลูกค้ารายเดียวไว้ในใบเดียว แล้วนัดวันชำระ"
                    />
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <div className="grid grid-cols-[minmax(0,1fr)_8rem_10rem] gap-3">
                            <Field label="ลูกค้า" value="บริษัท โรงแรมริมน้ำ จำกัด" />
                            <Field label="สกุลเงิน" value="THB" />
                            <Field label="วันนัดชำระ" value="31 ต.ค. 2569" />
                        </div>
                        <p className="text-gray-500">
                            เลือกใบแจ้งหนี้ที่จะวางบิล · แสดงเฉพาะใบที่ออกแล้ว ยังค้างชำระ และยังไม่อยู่ในใบวางบิลอื่น
                        </p>
                        {BILLING_INVOICES.map((invoice, index) => {
                            const isPicked = index < pickedCount;
                            return (
                                <div
                                    key={invoice.number}
                                    data-demo={`bill-pick-${index}`}
                                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${isPicked ? "border-blue-200 bg-blue-50/50" : "border-gray-200"}`}
                                >
                                    <DemoCheckbox checked={isPicked} />
                                    <div className="grid min-w-0 flex-1">
                                        <span className="text-gray-800">
                                            {invoice.number} · {invoice.title}
                                        </span>
                                        <span className="text-gray-500">ครบกำหนด {invoice.due}</span>
                                    </div>
                                    <span className="tabular-nums">{money(invoice.total)}</span>
                                </div>
                            );
                        })}
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                            <span className="text-gray-600">เลือก {pickedCount} ใบ</span>
                            <span className="font-medium text-gray-900 tabular-nums">{money(pickedTotal)} THB</span>
                        </div>
                        <span
                            data-demo="bill-create"
                            className={`${buttonClass("primary", "md")} justify-self-end transition ${pressed(t, BILLING.create)}`}
                        >
                            สร้างร่างใบวางบิล
                        </span>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="billing-view">
                    <DemoHeader
                        eyebrow={`ขาย · ใบวางบิล · ${number}`}
                        title="บริษัท โรงแรมริมน้ำ จำกัด"
                        description="วันนัดชำระ 31 ต.ค. 2569 · ใบแจ้งหนี้ 2 ใบ"
                        pills={
                            isIssued ? (
                                <StatusPill tone="info">ออกแล้ว</StatusPill>
                            ) : (
                                <StatusPill tone="neutral">ร่าง</StatusPill>
                            )
                        }
                    />
                    <div className="grid grid-cols-[minmax(0,1fr)_15rem] gap-4">
                        <div className={`grid content-start gap-2 p-4 text-xs ${CARD_CLASS}`}>
                            {BILLING_INVOICES.map((invoice) => (
                                <div
                                    key={invoice.number}
                                    className="flex justify-between border-b border-gray-100 pb-2"
                                >
                                    <span className="text-gray-800">
                                        {invoice.number} · {invoice.title}
                                    </span>
                                    <span className="tabular-nums">{money(invoice.total)}</span>
                                </div>
                            ))}
                            <div className="ml-auto grid w-64 gap-1">
                                <AmountRow label="รวม 2 ใบ" value="109,140.00" strong />
                                <AmountRow label="หัก ณ ที่จ่าย 3% (ประมาณ)" value="−3,060.00" />
                                <AmountRow label="ยอดชำระหลังหัก ณ ที่จ่าย" value="106,080.00 THB" strong />
                            </div>
                        </div>
                        <div className={`grid content-start gap-2.5 p-4 text-xs ${CARD_CLASS}`}>
                            {isIssued ? (
                                <>
                                    <p className="text-sm font-medium text-gray-900">ส่งให้ลูกค้า</p>
                                    <p className="text-gray-600">
                                        พิมพ์หรือบันทึก PDF แล้วส่งลูกค้า · รับเงินแล้วใบแจ้งหนี้ในใบนี้ตัดยอดเอง
                                    </p>
                                    <span className={buttonClass("secondary", "sm")}>พิมพ์ / บันทึก PDF</span>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm font-medium text-gray-900">ก่อนออกใบวางบิล</p>
                                    {[
                                        "ทุกใบยังค้างชำระ",
                                        "ลูกค้าและสกุลเงินเดียวกัน",
                                        "ไม่มีใบไหนอยู่ในใบวางบิลอื่น",
                                    ].map((check) => (
                                        <span key={check} className="flex items-center gap-2 text-gray-700">
                                            <CheckCircle2 size={14} className="shrink-0 text-green-600" />
                                            {check}
                                        </span>
                                    ))}
                                    <span
                                        data-demo="bill-issue"
                                        className={`${buttonClass("primary", "sm")} transition ${pressed(t, BILLING.issue)}`}
                                    >
                                        <FileCheck2 size={14} />
                                        ออกใบวางบิล
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </DemoPage>
            )}
            <DemoToast show={isIssued && t < BILLING.end - 800}>ออกใบวางบิลแล้ว · BN-20261018-000002</DemoToast>
        </DemoShell>
    );
}

export const BILLING_NOTE_SCENE: Scene = {
    key: "billing-note",
    phase: "collect",
    title: "ใบวางบิล",
    caption: "รวมใบแจ้งหนี้ที่ค้างของลูกค้าไว้ในใบเดียว ระบบตรวจให้ก่อนออกว่าไม่มีใบไหนวางบิลซ้ำ",
    url: (t) => (t < BILLING.view ? "/sales/billing-notes/new" : "/sales/billing-notes/view"),
    duration: BILLING.end,
    waypoints: [
        { at: BILLING.pickFirst, target: "bill-pick-0" },
        { at: BILLING.pickSecond, target: "bill-pick-1" },
        { at: BILLING.create, target: "bill-create" },
        { at: BILLING.issue, target: "bill-issue" },
        { at: BILLING.confirm, target: "issue-confirm" },
    ],
    render: SceneBillingNote,
};

// ── ใบลดหนี้: ลดยอดใบแจ้งหนี้ที่ออกไปแล้ว → อนุมัติ → ยอดค้างของใบเดิมลดตาม ──────────────────────────────

const CREDIT = { typeLine: 500, typeAmount: 2500, create: 3600, view: 3900, submit: 4800, approved: 6300, end: 9500 };

// ใบเดิม 40,000 + VAT 2,800 = 42,800 · ลด 5,000 + VAT 350 = 5,350 · ที่ถูกต้อง 37,450
function SceneCreditNote(t: number) {
    const isView = t >= CREDIT.view;
    const isSubmitted = t >= CREDIT.submit + 100;
    const isApproved = t >= CREDIT.approved;
    const line = typed("ตัดหน้าระบบสมาชิกออกจากขอบเขตงาน", t, CREDIT.typeLine, 50);
    const amount = typed("5,000.00", t, CREDIT.typeAmount, 90);
    const hasAmount = amount === "5,000.00";
    return (
        <DemoShell
            menu="sales"
            subMenu="ใบลดหนี้"
            crumbs={["ขาย", "ใบลดหนี้", isApproved ? "CN-20261018-000002" : isView ? "ร่าง" : "สร้างใบลดหนี้"]}
        >
            {!isView ? (
                <DemoPage pageKey="credit-form">
                    <DemoHeader
                        eyebrow="ขาย · ใบลดหนี้"
                        title="ลดหนี้ IV-20261015-000003 · บริษัท คาเฟ่ดี จำกัด"
                        description="ใบแจ้งหนี้ที่ออกแล้วแก้ไม่ได้ · ลดยอดด้วยใบลดหนี้ที่อ้างใบเดิม"
                    />
                    <div className={`grid gap-3 p-4 text-xs ${CARD_CLASS}`}>
                        <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                            <FileMinus2 size={16} className="text-blue-600" />
                            รายการที่ลด
                        </p>
                        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-3">
                            <Field
                                label="รายการที่ 1"
                                value={line}
                                isTyping={t >= CREDIT.typeLine && t < CREDIT.typeAmount}
                            />
                            <Field
                                label="ลด (ก่อน VAT)"
                                value={amount}
                                align="right"
                                isTyping={t >= CREDIT.typeAmount && t < CREDIT.create}
                            />
                        </div>
                        <Field label="เหตุผล" value="ลดขอบเขตงาน / ยกเลิกบางส่วน" />
                        <div className="ml-auto grid w-80 gap-1.5 rounded-xl bg-gray-50 p-3">
                            <AmountRow label="มูลค่าตามใบเดิม" value="42,800.00" />
                            <AmountRow label="ลด (ก่อน VAT)" value={hasAmount ? "−5,000.00" : "0.00"} />
                            <AmountRow label="VAT 7% ของส่วนที่ลด" value={hasAmount ? "−350.00" : "0.00"} />
                            <AmountRow label="รวมลดหนี้" value={hasAmount ? "−5,350.00 THB" : "0.00 THB"} strong />
                            <div className="border-t border-gray-200 pt-1.5">
                                <AmountRow
                                    label="มูลค่าที่ถูกต้อง"
                                    value={hasAmount ? "37,450.00 THB" : "42,800.00 THB"}
                                    strong
                                />
                            </div>
                        </div>
                        <span
                            data-demo="credit-create"
                            className={`${buttonClass("primary", "md")} justify-self-end transition ${pressed(t, CREDIT.create)}`}
                        >
                            สร้างร่างใบลดหนี้
                        </span>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="credit-view">
                    <DemoHeader
                        eyebrow={`ขาย · ใบลดหนี้ · ${isApproved ? "CN-20261018-000002" : "ยังไม่มีเลขที่"}`}
                        title="ตัดหน้าระบบสมาชิกออกจากขอบเขตงาน"
                        description="อ้างอิง IV-20261015-000003 · บริษัท คาเฟ่ดี จำกัด"
                        pills={
                            isApproved ? (
                                <StatusPill tone="success">ออกแล้ว</StatusPill>
                            ) : isSubmitted ? (
                                <StatusPill tone="wait">รออนุมัติ</StatusPill>
                            ) : (
                                <StatusPill tone="neutral">ร่าง</StatusPill>
                            )
                        }
                    />
                    {!isSubmitted && (
                        <span
                            data-demo="credit-submit"
                            className={`${buttonClass("primary", "md")} justify-self-start transition ${pressed(t, CREDIT.submit)}`}
                        >
                            <Send size={16} />
                            ส่งขออนุมัติ
                        </span>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`grid content-start gap-1.5 p-4 text-xs ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">ยอดของใบแจ้งหนี้</p>
                            <AmountRow label="ยอดตามใบแจ้งหนี้" value="42,800.00" />
                            <AmountRow
                                label={isApproved ? "ลดหนี้ CN-20261018-000002" : "ลดหนี้ (รออนุมัติ · ยังไม่หัก)"}
                                value={isApproved ? "−5,350.00" : "0.00"}
                            />
                            <AmountRow label="ยอดหลังลดหนี้" value={isApproved ? "37,450.00" : "42,800.00"} />
                            <AmountRow label="รับแล้ว" value="0.00" />
                            <div className="border-t border-gray-200 pt-1.5">
                                <AmountRow
                                    label="ค้างชำระ"
                                    value={isApproved ? "37,450.00 THB" : "42,800.00 THB"}
                                    strong
                                />
                            </div>
                        </div>
                        <div className={`grid content-start gap-3 p-4 text-xs ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">การอนุมัติ</p>
                            <ApprovalLevel
                                done={isApproved}
                                waiting={isSubmitted && !isApproved}
                                label="ชั้น 1 · ผู้จัดการฝ่ายบัญชี"
                                note={
                                    isApproved
                                        ? "อนุมัติโดย วิภา · เมื่อสักครู่"
                                        : isSubmitted
                                          ? "รออนุมัติชั้นนี้"
                                          : "ส่งขออนุมัติก่อน · ใบลดหนี้ต้องอนุมัติตามวงเงิน"
                                }
                            />
                            <p className="rounded-lg bg-gray-50 p-2 text-gray-600">
                                ลูกค้าจ่ายเกินยอดที่ถูกต้อง → ระบบเตือนให้บันทึกคืนเงินลูกค้า
                            </p>
                        </div>
                    </div>
                </DemoPage>
            )}
            <DemoToast show={isApproved && t < CREDIT.end - 800}>อนุมัติแล้ว · ได้เลขที่ CN-20261018-000002</DemoToast>
        </DemoShell>
    );
}

export const CREDIT_NOTE_SCENE: Scene = {
    key: "credit-note",
    phase: "collect",
    title: "ใบลดหนี้",
    caption:
        "ลดยอดใบแจ้งหนี้ที่ออกไปแล้วด้วยใบลดหนี้ เห็นยอดที่ถูกต้องก่อนบันทึก อนุมัติแล้วยอดค้างของใบเดิมลดตามทันที",
    url: (t) => (t < CREDIT.view ? "/sales/credit-notes/new" : "/sales/credit-notes/view"),
    duration: CREDIT.end,
    waypoints: [
        { at: CREDIT.create, target: "credit-create" },
        { at: CREDIT.submit, target: "credit-submit" },
    ],
    render: SceneCreditNote,
};

// ── ลูกหนี้คงค้างแยกอายุ → กดลูกค้าดูรายใบ ───────────────────────────────────────────────────────────

const RECEIVABLES = { counters: 300, clickClient: 3800, detail: 4100, end: 8000 };

const AGING_BUCKETS = ["ยังไม่ถึงกำหนด", "เกิน 1–30 วัน", "เกิน 31–60 วัน", "เกิน 61–90 วัน", "เกิน 90 วัน"];
// ยอดตามช่วงอายุ: ยังไม่ถึงกำหนด · 1–30 · 31–60 · 61–90 · เกิน 90 (ผลรวมทุกแถว = ยอดการ์ด)
const AGING_CLIENTS = [
    { name: "บริษัท โรงแรมริมน้ำ จำกัด", note: "2 ใบ", amounts: [109140, 0, 0, 0, 0] },
    { name: "บริษัท โลจิสติกส์ไทย จำกัด", note: "3 ใบ · เกินนานสุด 41 วัน", amounts: [71440, 0, 25680, 0, 0] },
    { name: "บริษัท คาเฟ่ดี จำกัด", note: "1 ใบ · เกินนานสุด 3 วัน", amounts: [0, 37450, 0, 0, 0] },
];
const BUCKET_TONES = ["text-gray-700", "text-amber-600", "text-amber-600", "text-red-600", "text-red-600"];

function SceneReceivables(t: number) {
    const isDetail = t >= RECEIVABLES.detail;
    const bucketTotals = AGING_BUCKETS.map((_, index) =>
        AGING_CLIENTS.reduce((sum, client) => sum + client.amounts[index], 0),
    );
    const grandTotal = bucketTotals.reduce((sum, value) => sum + value, 0);
    const overdueTotal = grandTotal - bucketTotals[0];
    return (
        <DemoShell
            menu="sales"
            subMenu="ลูกหนี้คงค้าง"
            crumbs={isDetail ? ["ขาย", "ลูกหนี้คงค้าง", "บริษัท โลจิสติกส์ไทย จำกัด"] : ["ขาย", "ลูกหนี้คงค้าง"]}
        >
            {!isDetail ? (
                <DemoPage pageKey="aging">
                    <DemoHeader
                        eyebrow="ขาย"
                        title="ลูกหนี้คงค้าง"
                        description="อายุนับจากวันครบกำหนด · ยอดเป็นบาท หักใบลดหนี้และเงินที่รับแล้ว"
                    />
                    <div className="grid grid-cols-6 gap-2.5 text-xs">
                        <div className={`grid gap-1 p-3 ${CARD_CLASS}`}>
                            <span className="text-gray-500">ค้างรับทั้งหมด (บาท)</span>
                            <span className="text-base font-medium text-gray-900 tabular-nums">
                                {money(countUp(grandTotal, t, RECEIVABLES.counters, 1000))}
                            </span>
                            <span className="text-[0.7rem] text-gray-500">
                                เกินกำหนดแล้ว <span className="text-red-600 tabular-nums">{money(overdueTotal)}</span>
                            </span>
                        </div>
                        {AGING_BUCKETS.map((bucket, index) => (
                            <div key={bucket} className={`grid content-start gap-1 p-3 ${CARD_CLASS}`}>
                                <span className="text-gray-500">{bucket}</span>
                                <span
                                    className={`text-sm font-medium tabular-nums ${bucketTotals[index] === 0 ? "text-gray-300" : BUCKET_TONES[index]}`}
                                >
                                    {bucketTotals[index] === 0
                                        ? "–"
                                        : money(countUp(bucketTotals[index], t, RECEIVABLES.counters + 200, 1000))}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className={`grid text-xs ${CARD_CLASS}`}>
                        <div className="grid grid-cols-[minmax(0,1fr)_repeat(5,6rem)_7rem] gap-2 border-b border-gray-100 px-4 py-2.5 text-gray-500">
                            <span>ลูกค้า</span>
                            {AGING_BUCKETS.map((bucket) => (
                                <span key={bucket} className="text-right">
                                    {bucket}
                                </span>
                            ))}
                            <span className="text-right">รวม (บาท)</span>
                        </div>
                        {AGING_CLIENTS.map((client, rowIndex) => (
                            <div
                                key={client.name}
                                className={`grid grid-cols-[minmax(0,1fr)_repeat(5,6rem)_7rem] items-center gap-2 border-b border-gray-100 px-4 py-2 last:border-0 ${rowIndex === 1 && t >= RECEIVABLES.clickClient - 600 ? "bg-blue-50/50" : ""}`}
                            >
                                <span className="grid min-w-0">
                                    <span
                                        data-demo={rowIndex === 1 ? "aging-client" : undefined}
                                        className="truncate font-medium text-gray-800"
                                    >
                                        {client.name}
                                    </span>
                                    <span className="text-[0.7rem] text-gray-500">{client.note}</span>
                                </span>
                                {client.amounts.map((amount, index) => (
                                    <span
                                        key={index}
                                        className={`text-right tabular-nums ${amount === 0 ? "text-gray-300" : BUCKET_TONES[index]}`}
                                    >
                                        {amount === 0 ? "–" : money(amount)}
                                    </span>
                                ))}
                                <span className="text-right font-medium text-gray-900 tabular-nums">
                                    {money(client.amounts.reduce((sum, value) => sum + value, 0))}
                                </span>
                            </div>
                        ))}
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="aging-client">
                    <DemoHeader
                        eyebrow="ขาย · ลูกหนี้คงค้าง"
                        title="บริษัท โลจิสติกส์ไทย จำกัด"
                        description="ค้างรับ 97,120.00 บาท · เกินกำหนด 25,680.00"
                    />
                    <div className={`grid gap-0 text-xs ${CARD_CLASS}`}>
                        {[
                            {
                                number: "IV-20260907-000002",
                                title: "ดูแลระบบรายเดือน ส.ค.",
                                due: "7 ก.ย. 2569",
                                amount: 25680,
                                late: 41,
                            },
                            {
                                number: "IV-20261005-000001",
                                title: "งวดที่ 1 ระบบติดตามรถขนส่ง",
                                due: "4 พ.ย. 2569",
                                amount: 42800,
                                late: 0,
                            },
                            {
                                number: "IV-20261016-000004",
                                title: "ดูแลระบบรายเดือน ก.ย.",
                                due: "15 พ.ย. 2569",
                                amount: 28640,
                                late: 0,
                            },
                        ].map((invoice, index) => (
                            <div
                                key={invoice.number}
                                className="demo-pop flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 last:border-0"
                                style={{ animationDelay: `${index * 120}ms` }}
                            >
                                <div className="grid">
                                    <span className="text-gray-800">
                                        {invoice.number} · {invoice.title}
                                    </span>
                                    <span className="text-gray-500">ครบกำหนด {invoice.due}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    {invoice.late > 0 ? (
                                        <StatusPill tone="danger">เกินกำหนด {invoice.late} วัน</StatusPill>
                                    ) : (
                                        <StatusPill tone="neutral">ยังไม่ถึงกำหนด</StatusPill>
                                    )}
                                    <span className="w-24 text-right tabular-nums">{money(invoice.amount)}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
                        ทวงด้วยใบวางบิลได้ทันที · ยอดลูกหนี้ ณ สิ้นเดือนอยู่ในไฟล์ส่งนักบัญชีด้วย
                    </p>
                </DemoPage>
            )}
        </DemoShell>
    );
}

export const RECEIVABLES_SCENE: Scene = {
    key: "receivables",
    phase: "collect",
    title: "ลูกหนี้คงค้าง",
    caption: "เห็นยอดค้างรับแยกตามอายุหนี้ทุกลูกค้า กดชื่อลูกค้าดูว่าใบไหนเกินกำหนดกี่วัน",
    url: (t) => (t < RECEIVABLES.detail ? "/sales/receivables" : "/sales/receivables/client"),
    duration: RECEIVABLES.end,
    waypoints: [{ at: RECEIVABLES.clickClient, target: "aging-client" }],
    render: SceneReceivables,
};
