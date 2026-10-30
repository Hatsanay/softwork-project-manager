"use client";

// ยืนยันเงินเข้า (2026-10-24 · P-1 · ขั้นที่ 5) — จากรายการรอโอน · ยอดหักแก้ให้ตรงกับที่ Fastwork โอนจริงได้
// วันที่เงินเข้า: ไม่เกินวันนี้ และไม่ก่อนวันที่ลูกค้ายืนยันงวด · บัญชีหลักเป็นค่าเริ่มต้น
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { payoutNetOf } from "@/lib/shared/fastwork-math.mjs";
import { fastworkReceiveSchema } from "@/lib/shared/schemas/fastwork.mjs";
import { formatDateOnly } from "@/app/function";
import { todayBangkokText } from "../../people/employees/_card-status";
import type { BankAccountChoice, FastworkPayout } from "../_types";
import { FASTWORK_MESSAGES } from "../_messages";
import { EditableAmount } from "./payout-sheet";

export default function ReceiveSheet({ payout, onClose, onSaved }: { payout: FastworkPayout; onClose: () => void; onSaved: () => Promise<void> }) {
    const today = todayBangkokText();
    const [bankAccounts, setBankAccounts] = useState<BankAccountChoice[]>([]);
    const [form, setForm] = useState({
        fwp_fee: payout.fwp_fee,
        fwp_fee_vat: payout.fwp_fee_vat,
        fwp_wht: payout.fwp_wht,
        fwp_wht_certificate_no: payout.fwp_wht_certificate_no ?? "",
        fwp_received_date: today,
        fwp_bank_account_id: "",
        fwp_reference: "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let isClosed = false;
        apiFetch<{ bank_accounts: BankAccountChoice[] }>("/company").then(({ data }) => {
            if (isClosed) return;
            const accounts = (data?.bank_accounts ?? []).filter((account) => account.ba_status === "active" && account.ba_currency === "THB");
            setBankAccounts(accounts);
            const defaultAccount = accounts.find((account) => Boolean(account.ba_is_default)) ?? accounts[0];
            setForm((current) => ({ ...current, fwp_bank_account_id: current.fwp_bank_account_id || defaultAccount?.ba_id || "" }));
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

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const checked = fastworkReceiveSchema.safeParse({ ...form, fwp_version: payout.fwp_version });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/fastwork/payouts/${payout.fwp_id}/receive`, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success("ยืนยันเงินเข้าแล้ว");
        await onSaved();
        onClose();
    }

    let net: string | null | undefined;
    try {
        net = payoutNetOf({ gross: payout.fwp_gross, fee: form.fwp_fee || "0", feeVat: form.fwp_fee_vat || "0", wht: form.fwp_wht || "0" });
    } catch {
        net = undefined;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby="receive-title"
                noValidate
                onSubmit={submit}
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                        <h2 id="receive-title" className="text-base font-medium text-gray-900">
                            ยืนยันเงินเข้า
                        </h2>
                        <p className="text-sm text-gray-500">
                            {payout.project_name}
                            {payout.fwm_name ? ` · งวด ${payout.fwm_order} ${payout.fwm_name}` : ""} · ลูกค้ายืนยัน {formatDateOnly(payout.fwp_approved_date)}
                        </p>
                    </div>
                    <button type="button" aria-label="ปิด" className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                {bannerError && (
                    <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}
                <div className="grid gap-2 rounded-xl bg-gray-50 p-3">
                    <div className="flex items-center justify-between gap-3 text-sm text-gray-700">
                        <span>ราคางวด</span>
                        <span className="tabular-nums">{formatAmount(payout.fwp_gross)}</span>
                    </div>
                    <EditableAmount label="− ค่าธรรมเนียม" id="receive_fee" value={form.fwp_fee} error={errors.fwp_fee} onChange={(value) => update("fwp_fee", value)} />
                    <EditableAmount label="− VAT ค่าธรรมเนียม" id="receive_fee_vat" value={form.fwp_fee_vat} error={errors.fwp_fee_vat} onChange={(value) => update("fwp_fee_vat", value)} />
                    <EditableAmount label="− หัก ณ ที่จ่าย" id="receive_wht" value={form.fwp_wht} error={errors.fwp_wht} onChange={(value) => update("fwp_wht", value)} />
                    <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2">
                        <span className="text-sm font-medium text-gray-900">= ยอดเข้าบัญชี</span>
                        <span className={`text-base font-medium tabular-nums ${net === null ? "text-red-600" : "text-gray-900"}`}>
                            {net === undefined ? "-" : net === null ? "ยอดหักเกินราคางวด" : formatAmount(net)}
                        </span>
                    </div>
                    <FieldHint>{FASTWORK_MESSAGES.payoutNet}</FieldHint>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="วันที่เงินเข้า" htmlFor="receive_date" required error={errors.fwp_received_date}>
                        <input
                            id="receive_date"
                            type="date"
                            min={payout.fwp_approved_date}
                            max={today}
                            value={form.fwp_received_date}
                            onChange={(event) => update("fwp_received_date", event.target.value)}
                            className={inputClass(Boolean(errors.fwp_received_date))}
                        />
                    </FormField>
                    <FormField label="บัญชีที่รับเงิน" htmlFor="receive_bank" required error={errors.fwp_bank_account_id}>
                        <select
                            id="receive_bank"
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
                    <FormField label="เลขอ้างอิงการโอน" htmlFor="receive_reference" hint="ไม่บังคับ" error={errors.fwp_reference}>
                        <input
                            id="receive_reference"
                            value={form.fwp_reference}
                            maxLength={100}
                            onChange={(event) => update("fwp_reference", event.target.value)}
                            className={inputClass(false)}
                        />
                    </FormField>
                    {Number(form.fwp_wht) > 0 && (
                        <FormField label="เลขที่ 50 ทวิ" htmlFor="receive_certificate" hint="ไม่บังคับ" error={errors.fwp_wht_certificate_no}>
                            <input
                                id="receive_certificate"
                                value={form.fwp_wht_certificate_no}
                                maxLength={50}
                                onChange={(event) => update("fwp_wht_certificate_no", event.target.value)}
                                className={inputClass(false)}
                            />
                        </FormField>
                    )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ยกเลิก
                    </button>
                    <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving || net === null}>
                        {isSaving ? "กำลังบันทึก..." : "ยืนยันเงินเข้า"}
                    </button>
                </div>
            </form>
        </div>
    );
}
