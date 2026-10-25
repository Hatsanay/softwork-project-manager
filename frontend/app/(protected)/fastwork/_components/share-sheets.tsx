"use client";

// แผ่นทำรายการส่วนแบ่ง (2026-10-25 · P-2): เบิกล่วงหน้า (ขั้นที่ 7) · ปิดยอด (ขั้นที่ 8) · บันทึกจ่าย/รับคืน (ขั้นที่ 9)
// วันที่ไม่เกินวันนี้ · บัญชีหลักเป็นค่าเริ่มต้น · กรอบแผ่นอยู่ใน sheet-frame.tsx
import { useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { settleSchema, shareAdvanceSchema, sharePaymentSchema } from "@/lib/shared/schemas/profit-share.mjs";
import { formatDateOnly } from "@/app/function";
import { todayBangkokText } from "../../people/employees/_card-status";
import type { ProjectSharesDetail, SettlementLine } from "../_types";
import { SHARE_MESSAGES } from "../_messages";
import { useBankAccounts } from "./use-bank-accounts";
import { TotalLine } from "./profit-breakdown";
import { BankSelect, SheetButtons, SheetFrame, sendRequest } from "./sheet-frame";

const recipientKeyOf = (userId: string | null, vendorId: string | null) => (vendorId ? `vendor:${vendorId}` : `user:${userId}`);

// ─── เบิกล่วงหน้า ─────────────────────────────────────────────────────────────────────────

export function AdvanceSheet({ detail, onClose, onSaved }: { detail: ProjectSharesDetail; onClose: () => void; onSaved: () => Promise<void> }) {
    const today = todayBangkokText();
    const { bankAccounts, defaultAccountId } = useBankAccounts();
    const firstShare = detail.shares[0];
    const [form, setForm] = useState({
        recipient: firstShare ? recipientKeyOf(firstShare.shr_user_id, firstShare.shr_vendor_id) : "",
        amount: "",
        paid_date: today,
        bank_account_id: "",
        reference: "",
        note: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const bankAccountId = form.bank_account_id || defaultAccountId;

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    const shareIndex = detail.shares.findIndex((share) => recipientKeyOf(share.shr_user_id, share.shr_vendor_id) === form.recipient);
    const estimateLine = shareIndex >= 0 ? detail.estimate.lines[shareIndex] : null;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const [recipientType, recipientId] = form.recipient.split(":");
        const checked = shareAdvanceSchema.safeParse({
            recipient_type: recipientType,
            recipient_id: recipientId,
            amount: form.amount,
            paid_date: form.paid_date,
            bank_account_id: bankAccountId,
            reference: form.reference,
            note: form.note,
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const isSaved = await sendRequest(`/profit-shares/projects/${detail.project.project_id}/advances`, checked.data, setErrors, setBannerError);
        setIsSaving(false);
        if (!isSaved) return;
        toast.success("บันทึกการเบิกแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame titleId="advance-title" title="เบิกส่วนแบ่งล่วงหน้า" subtitle={detail.project.project_name} onClose={onClose} onSubmit={submit}>
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            <FormField label="ผู้เบิก" htmlFor="advance_recipient" required error={errors.recipient_id}>
                <select
                    id="advance_recipient"
                    value={form.recipient}
                    onChange={(event) => update("recipient", event.target.value)}
                    className={inputClass(Boolean(errors.recipient_id))}
                >
                    {detail.shares.map((share) => (
                        <option key={share.shr_id} value={recipientKeyOf(share.shr_user_id, share.shr_vendor_id)}>
                            {share.recipient_name}
                        </option>
                    ))}
                </select>
            </FormField>
            {estimateLine && (
                <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
                    <div className="flex justify-between gap-3">
                        <span>ส่วนแบ่งประมาณ ณ วันนี้</span>
                        <span className="tabular-nums">{formatAmount(estimateLine.amount)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                        <span>− เบิกไปแล้ว</span>
                        <span className="tabular-nums">{formatAmount(estimateLine.advanced)}</span>
                    </div>
                    <TotalLine label="= เบิกได้อีกประมาณ" amount={estimateLine.due} />
                    <FieldHint>{SHARE_MESSAGES.advance}</FieldHint>
                </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="จำนวนเงิน (บาท)" htmlFor="advance_amount" required error={errors.amount}>
                    <input
                        id="advance_amount"
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(event) => update("amount", event.target.value)}
                        className={inputClass(Boolean(errors.amount))}
                    />
                </FormField>
                <FormField label="วันที่จ่าย" htmlFor="advance_date" required error={errors.paid_date}>
                    <input
                        id="advance_date"
                        type="date"
                        max={today}
                        value={form.paid_date}
                        onChange={(event) => update("paid_date", event.target.value)}
                        className={inputClass(Boolean(errors.paid_date))}
                    />
                </FormField>
                <BankSelect
                    id="advance_bank"
                    label="บัญชีที่โอนออก"
                    value={bankAccountId}
                    accounts={bankAccounts}
                    error={errors.bank_account_id}
                    onChange={(value) => update("bank_account_id", value)}
                />
                <FormField label="เลขอ้างอิงการโอน" htmlFor="advance_reference" hint="ไม่บังคับ" error={errors.reference}>
                    <input
                        id="advance_reference"
                        value={form.reference}
                        maxLength={100}
                        onChange={(event) => update("reference", event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>
                <FormField label="หมายเหตุ" htmlFor="advance_note" hint="ไม่บังคับ" error={errors.note} className="sm:col-span-2">
                    <input
                        id="advance_note"
                        value={form.note}
                        maxLength={500}
                        onChange={(event) => update("note", event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>
            </div>
            <SheetButtons isSaving={isSaving} submitLabel="บันทึกการเบิก" onClose={onClose} />
        </SheetFrame>
    );
}

// ─── ปิดยอด ───────────────────────────────────────────────────────────────────────────────

export function SettleSheet({ detail, onClose, onSaved }: { detail: ProjectSharesDetail; onClose: () => void; onSaved: () => Promise<void> }) {
    const today = todayBangkokText();
    const [form, setForm] = useState({ settled_date: today, note: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const { profit, estimate } = detail;
    const isBlocked = profit.pending_payouts > 0;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = settleSchema.safeParse({ ...form, expected_distributable: profit.distributable });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const isSaved = await sendRequest(`/profit-shares/projects/${detail.project.project_id}/settle`, checked.data, setErrors, setBannerError);
        setIsSaving(false);
        if (!isSaved) return;
        toast.success("ปิดยอดส่วนแบ่งแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame titleId="settle-title" title="ปิดยอดส่วนแบ่ง" subtitle={detail.project.project_name} onClose={onClose} onSubmit={submit}>
            {bannerError && (
                <StatusBanner tone="error" title="ปิดยอดไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            {isBlocked && (
                <StatusBanner tone="warn" title={`ยังมีเงิน Fastwork รอโอน ${profit.pending_payouts} รายการ`}>
                    ยืนยันเงินเข้า (หรือยกเลิกรายการ) ในหน้าเงินจาก Fastwork ก่อน แล้วค่อยปิดยอด
                </StatusBanner>
            )}
            {Number(profit.pending_expense) > 0 && (
                <StatusBanner tone="warn" title={`มีค่าใช้จ่ายที่ยังไม่อนุมัติ ${formatAmount(profit.pending_expense)} บาท`}>
                    ยอดนี้ยังไม่ถูกหักจากกำไร · ถ้าเป็นต้นทุนของงานนี้ ควรอนุมัติก่อนปิดยอด
                </StatusBanner>
            )}
            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>กำไรที่แบ่งได้</span>
                    <span className="tabular-nums">{formatAmount(profit.distributable)}</span>
                </div>
                {detail.shares.map((share, index) => {
                    const line = estimate.lines[index];
                    const isRefund = line.due.startsWith("-");
                    return (
                        <div key={share.shr_id} className="flex justify-between gap-3 text-gray-700">
                            <span className="min-w-0 wrap-break-word">
                                − {share.recipient_name}
                                {share.shr_kind === "percent" ? ` ${Number(share.shr_percent)}%` : " (จำนวนเงิน)"}
                                <span className="block text-xs text-gray-500">
                                    เบิกแล้ว {formatAmount(line.advanced)} · {isRefund ? `ต้องคืน ${formatAmount(line.due.slice(1))}` : `ต้องจ่าย ${formatAmount(line.due)}`}
                                </span>
                            </span>
                            <span className="shrink-0 tabular-nums">{formatAmount(line.amount)}</span>
                        </div>
                    );
                })}
                <TotalLine label="= เข้าเงินทุน" amount={estimate.company_amount} />
            </div>
            <FieldHint>{SHARE_MESSAGES.settle}</FieldHint>
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="วันที่ปิดยอด" htmlFor="settle_date" required error={errors.settled_date}>
                    <input
                        id="settle_date"
                        type="date"
                        max={today}
                        value={form.settled_date}
                        onChange={(event) => setForm((current) => ({ ...current, settled_date: event.target.value }))}
                        className={inputClass(Boolean(errors.settled_date))}
                    />
                </FormField>
                <FormField label="หมายเหตุ" htmlFor="settle_note" hint="ไม่บังคับ" error={errors.note}>
                    <input
                        id="settle_note"
                        value={form.note}
                        maxLength={500}
                        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                        className={inputClass(false)}
                    />
                </FormField>
            </div>
            <SheetButtons isSaving={isSaving} submitLabel="ปิดยอดและล็อกตัวเลข" isDisabled={isBlocked} onClose={onClose} />
        </SheetFrame>
    );
}

// ─── บันทึกจ่าย / รับเงินคืน ───────────────────────────────────────────────────────────────

export function PayLineSheet({
    line,
    projectName,
    settledDate,
    onClose,
    onSaved,
}: {
    line: SettlementLine;
    projectName: string;
    settledDate: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const today = todayBangkokText();
    const { bankAccounts, defaultAccountId } = useBankAccounts();
    const isRefund = line.ssl_due.startsWith("-");
    const [form, setForm] = useState({ paid_date: today, bank_account_id: "", reference: "", wht: "0.00" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const bankAccountId = form.bank_account_id || defaultAccountId;

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    let transfer: bigint | null = null;
    try {
        transfer = parseHundredths(line.ssl_due, "ต้องจ่าย") - (isRefund ? 0n : parseHundredths(form.wht || "0", "หัก ณ ที่จ่าย"));
    } catch {
        transfer = null;
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = sharePaymentSchema.safeParse({
            paid_date: form.paid_date,
            bank_account_id: bankAccountId,
            reference: form.reference,
            wht: isRefund ? "0" : form.wht || "0",
            ssl_version: line.ssl_version,
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const isSaved = await sendRequest(`/profit-shares/lines/${line.ssl_id}/pay`, checked.data, setErrors, setBannerError);
        setIsSaving(false);
        if (!isSaved) return;
        toast.success(isRefund ? "บันทึกรับเงินคืนแล้ว" : "บันทึกจ่ายแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame
            titleId="pay-line-title"
            title={isRefund ? `รับเงินคืนจาก ${line.ssl_recipient_name}` : `จ่ายส่วนแบ่ง ${line.ssl_recipient_name}`}
            subtitle={`${projectName} · ปิดยอด ${formatDateOnly(settledDate)}`}
            onClose={onClose}
            onSubmit={submit}
        >
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>ส่วนแบ่ง{line.ssl_kind === "percent" ? ` ${Number(line.ssl_percent)}%` : " (จำนวนเงิน)"}</span>
                    <span className="tabular-nums">{formatAmount(line.ssl_amount)}</span>
                </div>
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>− เบิกล่วงหน้าแล้ว</span>
                    <span className="tabular-nums">{formatAmount(line.ssl_advanced)}</span>
                </div>
                <TotalLine label={isRefund ? "= เบิกเกิน ต้องคืน" : "= ต้องจ่าย"} amount={line.ssl_due} />
                {!isRefund && (
                    <>
                        <div className="flex items-center justify-between gap-3 text-gray-700">
                            <label htmlFor="pay_wht">− หัก ณ ที่จ่าย</label>
                            <input
                                id="pay_wht"
                                inputMode="decimal"
                                value={form.wht}
                                onChange={(event) => update("wht", event.target.value)}
                                className={`${inputClass(Boolean(errors.wht), "sm")} w-32 text-right tabular-nums`}
                            />
                        </div>
                        <FieldHint error={errors.wht}>ไม่หักใส่ 0 · หักแล้วต้องออกหนังสือรับรอง 50 ทวิ ให้ผู้รับ</FieldHint>
                        <TotalLine label="= ยอดโอน" amount={transfer ?? 0n} />
                    </>
                )}
                <FieldHint>{SHARE_MESSAGES.pay}</FieldHint>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label={isRefund ? "วันที่รับเงินคืน" : "วันที่โอน"} htmlFor="pay_date" required error={errors.paid_date}>
                    <input
                        id="pay_date"
                        type="date"
                        min={settledDate}
                        max={today}
                        value={form.paid_date}
                        onChange={(event) => update("paid_date", event.target.value)}
                        className={inputClass(Boolean(errors.paid_date))}
                    />
                </FormField>
                <BankSelect
                    id="pay_bank"
                    label={isRefund ? "บัญชีที่รับเงินคืน" : "บัญชีที่โอนออก"}
                    value={bankAccountId}
                    accounts={bankAccounts}
                    error={errors.bank_account_id}
                    onChange={(value) => update("bank_account_id", value)}
                />
                <FormField label="เลขอ้างอิงการโอน" htmlFor="pay_reference" hint="ไม่บังคับ" error={errors.reference} className="sm:col-span-2">
                    <input
                        id="pay_reference"
                        value={form.reference}
                        maxLength={100}
                        onChange={(event) => update("reference", event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>
            </div>
            <SheetButtons
                isSaving={isSaving}
                submitLabel={isRefund ? "บันทึกรับเงินคืน" : "บันทึกจ่าย"}
                isDisabled={transfer === null || (transfer < 0n && !isRefund)}
                onClose={onClose}
            />
        </SheetFrame>
    );
}
