"use client";

// แผ่นของหน้าเงินทุน (2026-10-25 · P-3): ตั้งเป้า · ฝากเพิ่ม/ถอนออก
import { useState } from "react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { capitalEntrySchema, capitalGoalSchema } from "@/lib/shared/schemas/capital.mjs";
import { todayBangkokText } from "../../people/employees/_card-status";
import type { CapitalOverview } from "../_types";
import { CAPITAL_MESSAGES } from "../_messages";
import { SheetButtons, SheetFrame, sendRequest } from "./sheet-frame";

export function GoalSheet({ overview, onClose, onSaved }: { overview: CapitalOverview; onClose: () => void; onSaved: () => Promise<void> }) {
    const [form, setForm] = useState({
        cs_capital_goal: overview.goal.amount ?? "",
        cs_capital_target_date: overview.goal.target_date ?? "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = capitalGoalSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const isSaved = await sendRequest("/capital/goal", checked.data, setErrors, setBannerError, "PUT");
        setIsSaving(false);
        if (!isSaved) return;
        toast.success("บันทึกเป้าเงินทุนแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame titleId="goal-title" title="เป้าเงินทุน" subtitle="เงินทุนที่อยากมีก่อนจดบริษัท" onClose={onClose} onSubmit={submit}>
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="เป้าเงินทุน (บาท)" htmlFor="goal_amount" hint="ว่าง = ยังไม่ตั้งเป้า" error={errors.cs_capital_goal}>
                    <input
                        id="goal_amount"
                        inputMode="decimal"
                        value={form.cs_capital_goal}
                        placeholder="เช่น 100000"
                        onChange={(event) => setForm((current) => ({ ...current, cs_capital_goal: event.target.value }))}
                        className={inputClass(Boolean(errors.cs_capital_goal))}
                    />
                </FormField>
                <FormField label="วันที่ตั้งใจจดบริษัท" htmlFor="goal_date" hint="ไม่บังคับ" error={errors.cs_capital_target_date}>
                    <input
                        id="goal_date"
                        type="date"
                        value={form.cs_capital_target_date}
                        onChange={(event) => setForm((current) => ({ ...current, cs_capital_target_date: event.target.value }))}
                        className={inputClass(Boolean(errors.cs_capital_target_date))}
                    />
                </FormField>
            </div>
            <SheetButtons isSaving={isSaving} submitLabel="บันทึกเป้า" onClose={onClose} />
        </SheetFrame>
    );
}

export function EntrySheet({
    kind,
    balance,
    onClose,
    onSaved,
}: {
    kind: "deposit" | "withdraw";
    balance: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const today = todayBangkokText();
    const isWithdraw = kind === "withdraw";
    const [form, setForm] = useState({ cpe_amount: "", cpe_entry_date: today, cpe_note: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = capitalEntrySchema.safeParse({ ...form, cpe_kind: kind });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const isSaved = await sendRequest("/capital/entries", checked.data, setErrors, setBannerError);
        setIsSaving(false);
        if (!isSaved) return;
        toast.success(isWithdraw ? "บันทึกการถอนแล้ว" : "บันทึกการฝากแล้ว");
        await onSaved();
        onClose();
    }

    return (
        <SheetFrame
            titleId="entry-title"
            title={isWithdraw ? "ถอนเงินทุน" : "ฝากเงินทุนเพิ่ม"}
            subtitle={`ยอดเงินทุนตอนนี้ ${formatAmount(balance)} บาท`}
            onClose={onClose}
            onSubmit={submit}
        >
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="จำนวนเงิน (บาท)" htmlFor="entry_amount" required error={errors.cpe_amount}>
                    <input
                        id="entry_amount"
                        inputMode="decimal"
                        value={form.cpe_amount}
                        onChange={(event) => update("cpe_amount", event.target.value)}
                        className={inputClass(Boolean(errors.cpe_amount))}
                    />
                </FormField>
                <FormField label="วันที่" htmlFor="entry_date" required error={errors.cpe_entry_date}>
                    <input
                        id="entry_date"
                        type="date"
                        max={today}
                        value={form.cpe_entry_date}
                        onChange={(event) => update("cpe_entry_date", event.target.value)}
                        className={inputClass(Boolean(errors.cpe_entry_date))}
                    />
                </FormField>
                <FormField
                    label={isWithdraw ? "เหตุผลที่ถอน" : "หมายเหตุ"}
                    htmlFor="entry_note"
                    required={isWithdraw}
                    hint={isWithdraw ? undefined : "ไม่บังคับ เช่น เงินเก็บส่วนตัว"}
                    error={errors.cpe_note}
                    className="sm:col-span-2"
                >
                    <input
                        id="entry_note"
                        value={form.cpe_note}
                        maxLength={500}
                        placeholder={isWithdraw ? "เช่น นำไปจดบริษัท" : undefined}
                        onChange={(event) => update("cpe_note", event.target.value)}
                        className={inputClass(Boolean(errors.cpe_note))}
                    />
                </FormField>
            </div>
            {isWithdraw && <FieldHint>{CAPITAL_MESSAGES.withdraw}</FieldHint>}
            <SheetButtons isSaving={isSaving} submitLabel={isWithdraw ? "บันทึกการถอน" : "บันทึกการฝาก"} onClose={onClose} />
        </SheetFrame>
    );
}
