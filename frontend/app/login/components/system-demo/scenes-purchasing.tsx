"use client";

// ฉากกลุ่ม "จัดซื้อ" ที่เพิ่มทีหลัง — ทำจ่าย (ใบสำคัญจ่าย + 50 ทวิ) ตาม purchasing/payments/_components/payment-form.tsx
// ค่าใช้จ่ายอยู่ใน scenes.tsx · ⚠ ข้อมูลเป็นตัวอย่าง ตัวเลขต้องบวกลบตรงกัน · ห้ามใช้ class ที่มี breakpoint
import { Banknote, CheckCircle2, ReceiptText, UserRound } from "lucide-react";
import StatusPill from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import {
    AmountRow,
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

// ค่าออกแบบ 30,000 + VAT 2,100 = 32,100 · หัก ณ ที่จ่าย 3% ของ 30,000 = 900 · จ่ายสุทธิ 31,200
const PAYMENT = { pick: 1500, wht: 2300, pay: 3700, dialog: 3900, confirm: 5000, done: 5300, end: 8800 };

function SectionTitle({ icon: Icon, children }: { icon: typeof UserRound; children: string }) {
    return (
        <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
            <Icon size={16} className="text-blue-600" />
            {children}
        </p>
    );
}

function ScenePayment(t: number) {
    const isPicked = t >= PAYMENT.pick;
    const hasWht = t >= PAYMENT.wht;
    const isDone = t >= PAYMENT.done;
    const isDialogOpen = t >= PAYMENT.dialog && t < PAYMENT.confirm + 100;
    return (
        <DemoShell
            menu="purchasing"
            subMenu="ใบสำคัญจ่าย"
            crumbs={["จัดซื้อ", "ใบสำคัญจ่าย", isDone ? "PV-20261018-000005" : "ทำจ่าย"]}
            overlay={
                isDialogOpen && (
                    <DemoConfirm
                        title="ยืนยันจ่าย บริษัท ดีไซน์ฮับ จำกัด?"
                        confirmLabel="ยืนยันทำจ่าย"
                        confirmDemo="pay-confirm"
                        pressClass={pressed(t, PAYMENT.confirm)}
                    >
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-2.5">
                            <AmountRow label="ตัดหนี้ 1 รายการ" value="32,100.00" />
                            <AmountRow label="หัก ณ ที่จ่าย 3%" value="−900.00" />
                            <AmountRow label="จ่ายผู้รับสุทธิ" value="31,200.00 THB" strong />
                        </div>
                        <p className="text-gray-600">ยืนยันแล้วได้ใบสำคัญจ่ายและหนังสือรับรอง 50 ทวิ ทันที</p>
                    </DemoConfirm>
                )
            }
        >
            {!isDone ? (
                <DemoPage pageKey="payment-form">
                    <DemoHeader
                        eyebrow="จัดซื้อ · ใบสำคัญจ่าย"
                        title="ทำจ่าย"
                        description="จ่ายผู้ขาย หรือคืนเงินใบเบิกของพนักงาน · เลือกผู้รับแล้วเลือกรายการที่อนุมัติแล้วและรอจ่าย"
                    />
                    <div className="grid grid-cols-[minmax(0,1fr)_15rem] items-start gap-4 text-xs">
                        <div className="grid gap-3">
                            <div className={`grid gap-3 p-4 ${CARD_CLASS}`}>
                                <SectionTitle icon={UserRound}>ผู้รับเงินและรายการที่จ่าย</SectionTitle>
                                <Field label="ผู้รับเงิน" value="บริษัท ดีไซน์ฮับ จำกัด (ผู้ขาย)" />
                                <div
                                    data-demo="pay-pick"
                                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${isPicked ? "border-blue-200 bg-blue-50/50" : "border-gray-200"}`}
                                >
                                    <DemoCheckbox checked={isPicked} />
                                    <div className="grid min-w-0 flex-1">
                                        <span className="text-gray-800">
                                            EX-20261010-000004 · ออกแบบ UI แอปส่งอาหาร
                                        </span>
                                        <span className="text-gray-500">ใบกำกับภาษี · ครบกำหนดจ่าย 25 ต.ค. 2569</span>
                                    </div>
                                    <span className="tabular-nums">32,100.00</span>
                                </div>
                            </div>
                            <div className={`grid gap-3 p-4 ${CARD_CLASS}`}>
                                <SectionTitle icon={ReceiptText}>หัก ณ ที่จ่าย</SectionTitle>
                                <div className="grid grid-cols-3 gap-3">
                                    <Field label="ประเภทเงินได้" value={hasWht ? "ค่าบริการ · ภ.ง.ด.53" : "-"} />
                                    <Field label="อัตรา" value={hasWht ? "3%" : "-"} />
                                    <Field label="ยอดหัก" value={hasWht ? "900.00" : "0.00"} align="right" />
                                </div>
                                <p className="text-gray-500">
                                    คิดจากยอดก่อน VAT 30,000.00 ให้เอง · ออก 50 ทวิ ให้ผู้รับพร้อมกับใบสำคัญจ่าย
                                </p>
                            </div>
                            <div className={`grid grid-cols-3 gap-3 p-4 ${CARD_CLASS}`}>
                                <Field label="วันที่จ่าย" value="18 ต.ค. 2569" />
                                <Field label="วิธีจ่าย" value="โอนเงิน" />
                                <Field label="จ่ายจากบัญชี" value="กสิกรไทย 123-4-56789-0" />
                            </div>
                        </div>
                        <aside className={`grid gap-2 p-4 ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">สรุปการจ่าย</p>
                            <AmountRow
                                label={`ตัดหนี้ ${isPicked ? 1 : 0} รายการ`}
                                value={isPicked ? "32,100.00" : "0.00"}
                            />
                            <AmountRow label="หัก ณ ที่จ่าย" value={hasWht ? "−900.00" : "0.00"} />
                            <div className="border-t border-gray-200 pt-1.5">
                                <AmountRow
                                    label="จ่ายผู้รับสุทธิ"
                                    value={isPicked ? (hasWht ? "31,200.00" : "32,100.00") : "0.00"}
                                    strong
                                />
                            </div>
                            <span
                                data-demo="pay-review"
                                className={`${buttonClass("primary", "md", "w-full")} transition ${pressed(t, PAYMENT.pay)}`}
                            >
                                <Banknote size={16} />
                                ทำจ่าย
                            </span>
                        </aside>
                    </div>
                </DemoPage>
            ) : (
                <DemoPage pageKey="payment-view">
                    <DemoHeader
                        eyebrow="จัดซื้อ · ใบสำคัญจ่าย · PV-20261018-000005"
                        title="บริษัท ดีไซน์ฮับ จำกัด"
                        description="จ่าย 18 ต.ค. 2569 · โอนเงินจาก กสิกรไทย 123-4-56789-0"
                        pills={<StatusPill tone="success">จ่ายแล้ว</StatusPill>}
                    />
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className={`grid content-start gap-1.5 p-4 ${CARD_CLASS}`}>
                            <AmountRow label="EX-20261010-000004 · ออกแบบ UI" value="32,100.00" />
                            <AmountRow label="หัก ณ ที่จ่าย 3% (ค่าบริการ)" value="−900.00" />
                            <div className="border-t border-gray-200 pt-1.5">
                                <AmountRow label="จ่ายผู้รับสุทธิ" value="31,200.00 THB" strong />
                            </div>
                            <div className="mt-2 flex gap-2">
                                <span className={buttonClass("secondary", "sm")}>พิมพ์ใบสำคัญจ่าย</span>
                                <span className={buttonClass("secondary", "sm")}>พิมพ์ 50 ทวิ</span>
                            </div>
                        </div>
                        <div className={`grid content-start gap-2 p-4 ${CARD_CLASS}`}>
                            <p className="text-sm font-medium text-gray-900">ระบบทำให้แล้ว</p>
                            {[
                                "ออกหนังสือรับรอง 50 ทวิ ให้ผู้รับ",
                                "ยอดหัก 900.00 เข้ารายงาน ภ.ง.ด.53 เดือน ต.ค.",
                                "ค่าใช้จ่ายใบนี้ไม่มียอดค้างจ่ายแล้ว · เจ้าหนี้คงค้างลดลง",
                                "อยู่ในชีตใบสำคัญจ่ายของไฟล์ส่งนักบัญชี",
                            ].map((item, index) => (
                                <span
                                    key={item}
                                    className="demo-pop flex items-start gap-2 text-gray-700"
                                    style={{ animationDelay: `${index * 150}ms` }}
                                >
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                                    {item}
                                </span>
                            ))}
                        </div>
                    </div>
                </DemoPage>
            )}
            <DemoToast show={isDone && t < PAYMENT.end - 800}>ทำจ่ายแล้ว · PV-20261018-000005</DemoToast>
        </DemoShell>
    );
}

export const PAYMENT_SCENE: Scene = {
    key: "payment",
    phase: "pay",
    title: "ทำจ่ายและ 50 ทวิ",
    caption: "จ่ายผู้ขายหรือคืนเงินเบิกพนักงาน ระบบคิดหัก ณ ที่จ่ายให้ ออก 50 ทวิ และลงรายงาน ภ.ง.ด.3/53 เอง",
    url: (t) => (t < PAYMENT.done ? "/purchasing/payments/new" : "/purchasing/payments/view"),
    duration: PAYMENT.end,
    waypoints: [
        { at: PAYMENT.pick, target: "pay-pick" },
        { at: PAYMENT.pay, target: "pay-review" },
        { at: PAYMENT.confirm, target: "pay-confirm" },
    ],
    render: ScenePayment,
};
