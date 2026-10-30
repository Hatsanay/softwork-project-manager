"use client";

// บันทึกเงินจาก Fastwork (2026-10-24 · P-1 · ขั้นที่ 4-5 ของหน้า Fastwork)
// เลือกงาน → เลือกงวด (เฉพาะงวดที่ยังไม่บันทึกเงิน) → ระบบเติมราคางวดและค่าธรรมเนียมตามอัตราเริ่มต้นให้ แก้ได้ทุกช่อง
// รอโอน = ลูกค้ายืนยันงวดแล้ว เงินยังไม่เข้า · เงินเข้าแล้ว = ใส่วันที่และบัญชีที่รับ · ยอดเข้าบัญชีคิดให้จากบนลงล่าง
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { payoutNetOf, suggestPayoutAmounts } from "@/lib/shared/fastwork-math.mjs";
import { fastworkPayoutSchema } from "@/lib/shared/schemas/fastwork.mjs";
import { todayBangkokText } from "../../people/employees/_card-status";
import type { BankAccountChoice, FastworkMilestone, FastworkOverview, FastworkSettings, ProjectFastwork } from "../_types";
import { FASTWORK_MESSAGES } from "../_messages";

type PayoutForm = {
    fwp_status: "pending" | "received";
    fwp_project_id: string;
    fwp_milestone_id: string;
    fwp_gross: string;
    fwp_fee_rate: string;
    fwp_fee: string;
    fwp_fee_vat: string;
    fwp_wht: string;
    fwp_wht_certificate_no: string;
    fwp_approved_date: string;
    fwp_received_date: string;
    fwp_bank_account_id: string;
    fwp_reference: string;
    fwp_note: string;
};

/** ยอดหักตามอัตรา (ราคางวดผิดรูปแบบ = คงค่าเดิมไว้) */
function amountsFor(gross: string, settings: FastworkSettings | null, feeRate: string) {
    if (!settings) return null;
    try {
        return suggestPayoutAmounts({
            gross: gross || "0",
            feeRate: feeRate || "0",
            feeVatRate: settings.cs_fastwork_fee_vat_rate,
            whtRate: settings.cs_fastwork_wht_rate,
        });
    } catch {
        return null;
    }
}

/** คิดค่าธรรมเนียม VAT และหัก ณ ที่จ่ายใหม่จากราคางวด/อัตรา (ผู้ใช้แก้ทับได้หลังจากนี้) */
function withSuggestedAmounts(form: PayoutForm, settings: FastworkSettings | null): PayoutForm {
    const amounts = amountsFor(form.fwp_gross, settings, form.fwp_fee_rate);
    if (!amounts) return form;
    return { ...form, fwp_fee: amounts.fee, fwp_fee_vat: amounts.fee_vat, fwp_wht: amounts.wht };
}

function netText(form: PayoutForm) {
    try {
        return payoutNetOf({ gross: form.fwp_gross || "0", fee: form.fwp_fee || "0", feeVat: form.fwp_fee_vat || "0", wht: form.fwp_wht || "0" });
    } catch {
        return undefined;
    }
}

export default function PayoutSheet({
    defaultProjectId,
    defaultMilestoneId,
    onClose,
    onSaved,
}: {
    defaultProjectId: string | null;
    defaultMilestoneId: string | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const today = todayBangkokText();
    const [projects, setProjects] = useState<FastworkOverview["projects"]>([]);
    const [milestones, setMilestones] = useState<FastworkMilestone[]>([]);
    // อัตราเริ่มต้นเก็บใน ref ด้วย: ตอนงวดโหลดเสร็จก่อน/หลังอัตรา จะได้คิดยอดจากอัตราล่าสุดเสมอ
    const settingsRef = useRef<FastworkSettings | null>(null);
    const [bankAccounts, setBankAccounts] = useState<BankAccountChoice[]>([]);
    const [form, setForm] = useState<PayoutForm>({
        fwp_status: "pending",
        fwp_project_id: defaultProjectId ?? "",
        fwp_milestone_id: defaultMilestoneId ?? "",
        fwp_gross: "",
        fwp_fee_rate: "",
        fwp_fee: "",
        fwp_fee_vat: "0.00",
        fwp_wht: "0.00",
        fwp_wht_certificate_no: "",
        fwp_approved_date: today,
        fwp_received_date: today,
        fwp_bank_account_id: "",
        fwp_reference: "",
        fwp_note: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // งาน Fastwork ที่กำลังทำ + อัตราเริ่มต้น + บัญชีรับเงิน (บัญชีหลักเป็นค่าเริ่มต้น)
    useEffect(() => {
        let isClosed = false;
        Promise.all([
            apiFetch<FastworkOverview>("/fastwork/overview"),
            apiFetch<FastworkSettings>("/fastwork/settings"),
            apiFetch<{ bank_accounts: BankAccountChoice[] }>("/company"),
        ]).then(([overview, loadedSettings, company]) => {
            if (isClosed) return;
            setProjects(overview.data?.projects ?? []);
            settingsRef.current = loadedSettings.data;
            const accounts = (company.data?.bank_accounts ?? []).filter((account) => account.ba_status === "active" && account.ba_currency === "THB");
            setBankAccounts(accounts);
            const defaultAccount = accounts.find((account) => Boolean(account.ba_is_default)) ?? accounts[0];
            setForm((current) =>
                withSuggestedAmounts(
                    {
                        ...current,
                        fwp_fee_rate: current.fwp_fee_rate || loadedSettings.data?.cs_fastwork_fee_rate || "0",
                        fwp_bank_account_id: current.fwp_bank_account_id || defaultAccount?.ba_id || "",
                    },
                    loadedSettings.data,
                ),
            );
        });
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            isClosed = true;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);

    // งวดของงานที่เลือก — เฉพาะงวดที่ยังไม่บันทึกเงิน · เลือกงวดแรกที่ส่งงานแล้วให้
    useEffect(() => {
        if (!form.fwp_project_id) return;
        let isStale = false;
        apiFetch<ProjectFastwork>(`/fastwork/projects/${form.fwp_project_id}`).then(({ data }) => {
            if (isStale) return;
            const open = (data?.fastwork?.milestones ?? []).filter((milestone) => milestone.state === "open" || milestone.state === "delivered");
            setMilestones(open);
            setForm((current) => {
                const keep = open.some((milestone) => String(milestone.fwm_id) === current.fwp_milestone_id);
                const chosen = keep
                    ? open.find((milestone) => String(milestone.fwm_id) === current.fwp_milestone_id)
                    : (open.find((milestone) => milestone.state === "delivered") ?? open[0]);
                return withSuggestedAmounts(
                    { ...current, fwp_milestone_id: chosen ? String(chosen.fwm_id) : "", fwp_gross: chosen?.fwm_amount ?? current.fwp_gross },
                    settingsRef.current,
                );
            });
        });
        return () => {
            isStale = true;
        };
    }, [form.fwp_project_id]);

    function update<Field extends keyof PayoutForm>(field: Field, value: PayoutForm[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const payload = {
            ...form,
            fwp_milestone_id: form.fwp_milestone_id ? Number(form.fwp_milestone_id) : null,
            ...(form.fwp_status === "pending" ? { fwp_received_date: undefined, fwp_bank_account_id: undefined, fwp_reference: undefined } : {}),
        };
        const checked = fastworkPayoutSchema.safeParse(payload);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch("/fastwork/payouts", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success(form.fwp_status === "received" ? "บันทึกเงินเข้าแล้ว" : "บันทึกรอโอนแล้ว · ยืนยันเมื่อเงินเข้าบัญชี");
        await onSaved();
        onClose();
    }

    const net = netText(form);
    const isReceived = form.fwp_status === "received";

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="payout-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="payout-title" className="text-base font-medium text-gray-900">
                        บันทึกเงินจาก Fastwork
                    </h2>
                    <button type="button" aria-label="ปิด" className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                {bannerError && (
                    <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <div className="grid gap-1.5">
                    <Segmented<"pending" | "received">
                        label="สถานะเงิน"
                        value={form.fwp_status}
                        onChange={(value) => update("fwp_status", value)}
                        options={[
                            { value: "pending", label: "ลูกค้ายืนยันแล้ว รอโอน" },
                            { value: "received", label: "เงินเข้าบัญชีแล้ว" },
                        ]}
                    />
                </div>
                <FormField label="งาน" htmlFor="fwp_project_id" required error={errors.fwp_project_id}>
                    <select
                        id="fwp_project_id"
                        value={form.fwp_project_id}
                        onChange={(event) => update("fwp_project_id", event.target.value)}
                        className={inputClass(Boolean(errors.fwp_project_id))}
                    >
                        <option value="">เลือกงาน Fastwork</option>
                        {projects.map((project) => (
                            <option key={project.project_id} value={project.project_id}>
                                {project.project_name}
                                {project.client_name ? ` · ${project.client_name}` : ""}
                            </option>
                        ))}
                    </select>
                </FormField>
                {form.fwp_project_id && (
                    <FormField
                        label="งวด"
                        htmlFor="fwp_milestone_id"
                        hint={milestones.length === 0 ? "ทุกงวดของงานนี้บันทึกเงินแล้ว · ไม่เลือกงวดได้ถ้าเป็นเงินนอกงวด (เช่น ลูกค้าเพิ่มงาน)" : undefined}
                        error={errors.fwp_milestone_id}
                    >
                        <select
                            id="fwp_milestone_id"
                            value={form.fwp_milestone_id}
                            onChange={(event) => {
                                const milestone = milestones.find((item) => String(item.fwm_id) === event.target.value);
                                setForm((current) =>
                                    withSuggestedAmounts(
                                        { ...current, fwp_milestone_id: event.target.value, fwp_gross: milestone?.fwm_amount ?? current.fwp_gross },
                                        settingsRef.current,
                                    ),
                                );
                            }}
                            className={inputClass(Boolean(errors.fwp_milestone_id))}
                        >
                            <option value="">ไม่ระบุงวด (เงินนอกงวด)</option>
                            {milestones.map((milestone) => (
                                <option key={milestone.fwm_id} value={milestone.fwm_id}>
                                    งวด {milestone.fwm_order} {milestone.fwm_name}
                                    {milestone.state === "delivered" ? " · ส่งงานแล้ว" : ""}
                                </option>
                            ))}
                        </select>
                    </FormField>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <FormField label="ราคางวด (ลูกค้าจ่าย)" htmlFor="fwp_gross" required error={errors.fwp_gross}>
                        <input
                            id="fwp_gross"
                            inputMode="decimal"
                            value={form.fwp_gross}
                            onChange={(event) => {
                                const value = event.target.value;
                                setForm((current) => withSuggestedAmounts({ ...current, fwp_gross: value }, settingsRef.current));
                            }}
                            className={`${inputClass(Boolean(errors.fwp_gross))} text-right tabular-nums`}
                        />
                    </FormField>
                    <FormField label="อัตราค่าธรรมเนียม %" htmlFor="fwp_fee_rate" required error={errors.fwp_fee_rate}>
                        <input
                            id="fwp_fee_rate"
                            inputMode="decimal"
                            value={form.fwp_fee_rate}
                            onChange={(event) => {
                                const value = event.target.value;
                                setForm((current) => withSuggestedAmounts({ ...current, fwp_fee_rate: value }, settingsRef.current));
                            }}
                            className={`${inputClass(Boolean(errors.fwp_fee_rate))} text-right tabular-nums`}
                        />
                    </FormField>
                </div>

                {/* ยอดเข้าบัญชีอ่านจากบนลงล่าง — แก้ยอดหักให้ตรงกับที่ Fastwork โอนจริงได้ */}
                <div className="grid gap-2 rounded-xl bg-gray-50 p-3">
                    <AmountRow label="ราคางวด" value={form.fwp_gross} />
                    <EditableAmount label="− ค่าธรรมเนียม" id="fwp_fee" value={form.fwp_fee} error={errors.fwp_fee} onChange={(value) => update("fwp_fee", value)} />
                    <EditableAmount label="− VAT ค่าธรรมเนียม" id="fwp_fee_vat" value={form.fwp_fee_vat} error={errors.fwp_fee_vat} onChange={(value) => update("fwp_fee_vat", value)} />
                    <EditableAmount label="− หัก ณ ที่จ่าย" id="fwp_wht" value={form.fwp_wht} error={errors.fwp_wht} onChange={(value) => update("fwp_wht", value)} />
                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2">
                        <span className="text-sm font-medium text-gray-900">= ยอดเข้าบัญชี</span>
                        <span className={`text-base font-medium tabular-nums ${net === null ? "text-red-600" : "text-gray-900"}`}>
                            {net === undefined ? "-" : net === null ? "ยอดหักเกินราคางวด" : formatAmount(net)}
                        </span>
                    </div>
                    <FieldHint>{FASTWORK_MESSAGES.payoutNet}</FieldHint>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="วันที่ลูกค้ายืนยันงวด" htmlFor="fwp_approved_date" required error={errors.fwp_approved_date}>
                        <input
                            id="fwp_approved_date"
                            type="date"
                            max={today}
                            value={form.fwp_approved_date}
                            onChange={(event) => update("fwp_approved_date", event.target.value)}
                            className={inputClass(Boolean(errors.fwp_approved_date))}
                        />
                    </FormField>
                    {isReceived && (
                        <FormField label="วันที่เงินเข้า" htmlFor="fwp_received_date" required error={errors.fwp_received_date}>
                            <input
                                id="fwp_received_date"
                                type="date"
                                min={form.fwp_approved_date || undefined}
                                max={today}
                                value={form.fwp_received_date}
                                onChange={(event) => update("fwp_received_date", event.target.value)}
                                className={inputClass(Boolean(errors.fwp_received_date))}
                            />
                        </FormField>
                    )}
                </div>
                {isReceived && (
                    <div className="grid gap-3 sm:grid-cols-2">
                        <FormField label="บัญชีที่รับเงิน" htmlFor="fwp_bank_account_id" required error={errors.fwp_bank_account_id}>
                            <select
                                id="fwp_bank_account_id"
                                value={form.fwp_bank_account_id}
                                onChange={(event) => update("fwp_bank_account_id", event.target.value)}
                                className={inputClass(Boolean(errors.fwp_bank_account_id))}
                            >
                                <option value="">เลือกบัญชี</option>
                                {bankAccounts.map((account) => (
                                    <option key={account.ba_id} value={account.ba_id}>
                                        {account.ba_bank_name} {account.ba_account_no}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField label="เลขอ้างอิงการโอน" htmlFor="fwp_reference" hint="ไม่บังคับ" error={errors.fwp_reference}>
                            <input
                                id="fwp_reference"
                                value={form.fwp_reference}
                                maxLength={100}
                                onChange={(event) => update("fwp_reference", event.target.value)}
                                className={inputClass(Boolean(errors.fwp_reference))}
                            />
                        </FormField>
                    </div>
                )}
                {Number(form.fwp_wht) > 0 && (
                    <FormField label="เลขที่ 50 ทวิ ที่ได้รับ" htmlFor="fwp_wht_certificate_no" hint="เก็บไว้ใช้เครดิตภาษีตอนยื่นแบบ" error={errors.fwp_wht_certificate_no}>
                        <input
                            id="fwp_wht_certificate_no"
                            value={form.fwp_wht_certificate_no}
                            maxLength={50}
                            onChange={(event) => update("fwp_wht_certificate_no", event.target.value)}
                            className={inputClass(false)}
                        />
                    </FormField>
                )}
                <FormField label="หมายเหตุ" htmlFor="fwp_note" hint="ไม่บังคับ" error={errors.fwp_note}>
                    <input
                        id="fwp_note"
                        value={form.fwp_note}
                        maxLength={500}
                        onChange={(event) => update("fwp_note", event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>

                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving || net === null}>
                        {isSaving ? "กำลังบันทึก..." : isReceived ? "บันทึกเงินเข้า" : "บันทึกรอโอน"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function AmountRow({ label, value }: { label: string; value: string }) {
    let text = "-";
    try {
        text = value ? formatAmount(value) : "-";
    } catch {
        text = "-";
    }
    return (
        <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
            <span>{label}</span>
            <span className="tabular-nums">{text}</span>
        </div>
    );
}

export function EditableAmount({
    label,
    id,
    value,
    error,
    onChange,
}: {
    label: string;
    id: string;
    value: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div className="grid gap-1">
            <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-2">
                <label htmlFor={id} className="text-sm text-gray-700">
                    {label}
                </label>
                <input
                    id={id}
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className={`${inputClass(Boolean(error), "sm")} w-full text-right tabular-nums`}
                />
            </div>
            {error && <FieldHint error={error} />}
        </div>
    );
}
