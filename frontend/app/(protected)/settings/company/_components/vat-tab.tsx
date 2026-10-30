"use client";

// แท็บภาษีมูลค่าเพิ่ม: วันที่จด VAT + อัตรา VAT ตามวันที่มีผล
import { useState } from "react";
import { Percent, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { vatRateSchema } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import type { Company, VatRate } from "../_types";
import { useSaveCompany } from "../_hooks/use-save-company";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";

type VatTabProps = {
    company: Company;
    vatRates: VatRate[];
    vatRateToday: string | null;
    today: string;
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

// "YYYY-MM-DD" + จำนวนวัน (คิดแบบ UTC ล้วน ไม่ผ่านเวลาเครื่อง)
function addDays(dateText: string, dayCount: number): string {
    const [year, month, day] = dateText.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + dayCount)).toISOString().slice(0, 10);
}

const EMPTY_RATE_FORM = { vr_effective_from: "", vr_rate: "", vr_note: "" };

export default function VatTab({ company, vatRates, vatRateToday, today, canEdit, onSaved }: VatTabProps) {
    const messages = COMPANY_MESSAGES.vat;
    const [registeredFrom, setRegisteredFrom] = useState(company.cs_vat_registered_from ?? "");
    const companySave = useSaveCompany(company, onSaved);

    const [rateForm, setRateForm] = useState(EMPTY_RATE_FORM);
    const [rateErrors, setRateErrors] = useState<FieldErrors>({});
    const [rateSaveError, setRateSaveError] = useState<ApiError | null>(null);
    const [isAddingRate, setIsAddingRate] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<VatRate | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const tomorrow = addDays(today, 1);
    const savedRegisteredFrom = company.cs_vat_registered_from;

    async function handleSaveRegistration(event: React.FormEvent) {
        event.preventDefault();
        await companySave.save({ cs_vat_registered_from: registeredFrom || null });
    }

    async function handleAddRate(event: React.FormEvent) {
        event.preventDefault();
        setRateSaveError(null);
        const checked = vatRateSchema.safeParse(rateForm);
        if (!checked.success) {
            setRateErrors(toFieldErrors(checked.error.issues));
            return;
        }

        setIsAddingRate(true);
        const { error } = await apiFetch("/company/vat-rates", { method: "POST", body: checked.data });
        setIsAddingRate(false);
        if (error) {
            setRateErrors(error.fields);
            setRateSaveError(error);
            return;
        }
        setRateErrors({});
        setRateForm(EMPTY_RATE_FORM);
        toast.success(COMPANY_MESSAGES.saved);
        await onSaved();
    }

    async function handleDeleteRate() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await apiFetch(`/company/vat-rates/${deleteTarget.vr_effective_from}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        setDeleteTarget(null);
        toast.success(COMPANY_MESSAGES.saved);
        await onSaved();
    }

    return (
        <div className="grid gap-6">
            <SectionCard icon={Receipt} title="การจดทะเบียนภาษีมูลค่าเพิ่ม">
                <VatStatus registeredFrom={savedRegisteredFrom} today={today} vatRateToday={vatRateToday} />

                <form onSubmit={handleSaveRegistration} className="grid gap-4" noValidate>
                    <FormField
                        label="วันที่จดทะเบียน VAT มีผล"
                        htmlFor="cs_vat_registered_from"
                        hint={messages.registeredFrom}
                        error={companySave.fieldErrors.cs_vat_registered_from}
                        className="max-w-xs"
                    >
                        <input
                            id="cs_vat_registered_from"
                            type="date"
                            value={registeredFrom}
                            onChange={(event) => setRegisteredFrom(event.target.value)}
                            disabled={!canEdit}
                            className={inputClass(Boolean(companySave.fieldErrors.cs_vat_registered_from))}
                        />
                    </FormField>

                    <HowItWorks label={messages.registeredHowTitle}>
                        <p>
                            เอกสารแต่ละใบคิด VAT จาก &quot;วันที่ของเอกสาร&quot; (ใบเสนอราคา =
                            วันที่อนุมัติชั้นสุดท้าย):
                        </p>
                        <ul className="list-disc space-y-1 pl-5">
                            <li>วันที่เอกสารก่อนวันจด VAT → ไม่คิด VAT และไม่พิมพ์บรรทัด VAT</li>
                            <li>
                                วันที่เอกสารตั้งแต่วันจด VAT → คิดตามอัตราที่มีผล ณ วันนั้น (ตอนนี้{" "}
                                {vatRateToday ?? "-"}%)
                            </li>
                            <li>เอกสารที่อนุมัติไปแล้วเก็บอัตราไว้ในตัวเอง แก้ค่าที่นี่ทีหลังไม่เปลี่ยน</li>
                            <li>
                                ใบที่รออนุมัติข้ามวันจด VAT ระบบจะไม่ให้อนุมัติจนกว่าผู้สร้างจะคำนวณยอดใหม่
                                ผู้อนุมัติจะได้เห็นยอดที่ถูกต้องเสมอ
                            </li>
                        </ul>
                    </HowItWorks>

                    <SaveErrorBanner error={companySave.saveError} />
                    {canEdit && (
                        <div className="flex justify-end">
                            <button type="submit" className={PRIMARY_BUTTON} disabled={companySave.isSaving}>
                                {companySave.isSaving ? "กำลังบันทึก..." : "บันทึกวันที่จด VAT"}
                            </button>
                        </div>
                    )}
                </form>
            </SectionCard>

            <SectionCard icon={Percent} title={messages.rateListTitle} description={messages.rateListDescription}>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {vatRates.map((vatRate) => (
                        <li
                            key={vatRate.vr_effective_from}
                            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        >
                            <div className="grid gap-0.5">
                                <p className="font-medium text-gray-800">
                                    {vatRate.vr_rate}%{" "}
                                    <span className="font-normal text-gray-500">
                                        ตั้งแต่ {formatDateOnly(vatRate.vr_effective_from)}
                                    </span>
                                </p>
                                <p className="text-xs text-gray-500">
                                    {vatRate.is_locked ? messages.lockedRate : messages.futureRate}
                                    {vatRate.vr_note ? ` · ${vatRate.vr_note}` : ""}
                                </p>
                            </div>
                            {canEdit && !vatRate.is_locked && (
                                <button
                                    type="button"
                                    className={SECONDARY_BUTTON}
                                    onClick={() => {
                                        setDeleteError(null);
                                        setDeleteTarget(vatRate);
                                    }}
                                >
                                    <Trash2 size={16} />
                                    ลบ
                                </button>
                            )}
                        </li>
                    ))}
                </ul>

                {canEdit && (
                    <form onSubmit={handleAddRate} className="grid gap-4 rounded-lg bg-gray-50 p-4" noValidate>
                        <p className="text-sm font-medium text-gray-700">เพิ่มอัตราใหม่ล่วงหน้า</p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <FormField
                                label="วันที่มีผล"
                                htmlFor="vr_effective_from"
                                required
                                hint={messages.effectiveFrom}
                                error={rateErrors.vr_effective_from}
                            >
                                <input
                                    id="vr_effective_from"
                                    type="date"
                                    min={tomorrow}
                                    value={rateForm.vr_effective_from}
                                    onChange={(event) =>
                                        setRateForm({ ...rateForm, vr_effective_from: event.target.value })
                                    }
                                    className={inputClass(Boolean(rateErrors.vr_effective_from))}
                                />
                            </FormField>
                            <FormField
                                label="อัตรา (%)"
                                htmlFor="vr_rate"
                                required
                                hint={messages.rate}
                                error={rateErrors.vr_rate}
                            >
                                <input
                                    id="vr_rate"
                                    inputMode="decimal"
                                    value={rateForm.vr_rate}
                                    onChange={(event) => setRateForm({ ...rateForm, vr_rate: event.target.value })}
                                    className={inputClass(Boolean(rateErrors.vr_rate))}
                                />
                            </FormField>
                            <FormField
                                label="หมายเหตุ"
                                htmlFor="vr_note"
                                hint={messages.note}
                                error={rateErrors.vr_note}
                            >
                                <input
                                    id="vr_note"
                                    value={rateForm.vr_note}
                                    onChange={(event) => setRateForm({ ...rateForm, vr_note: event.target.value })}
                                    className={inputClass(Boolean(rateErrors.vr_note))}
                                />
                            </FormField>
                        </div>
                        <SaveErrorBanner error={rateSaveError} />
                        <div className="flex justify-end">
                            <button type="submit" className={PRIMARY_BUTTON} disabled={isAddingRate}>
                                {isAddingRate ? "กำลังบันทึก..." : "เพิ่มอัตรา"}
                            </button>
                        </div>
                    </form>
                )}
            </SectionCard>

            <ConfirmDialog
                open={deleteTarget !== null}
                title={messages.deleteTitle}
                description={
                    deleteTarget
                        ? messages.deleteDescription(
                              formatDateOnly(deleteTarget.vr_effective_from),
                              deleteTarget.vr_rate,
                          )
                        : undefined
                }
                confirmLabel="ลบอัตรานี้"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDeleteRate}
                onCancel={() => setDeleteTarget(null)}
            />
        </div>
    );
}

// แถบสถานะบอกว่าตอนนี้เอกสารคิด VAT หรือไม่ ตามค่าที่บันทึกไว้
function VatStatus({
    registeredFrom,
    today,
    vatRateToday,
}: {
    registeredFrom: string | null;
    today: string;
    vatRateToday: string | null;
}) {
    if (!registeredFrom) {
        return (
            <StatusBanner tone="info" title="ยังไม่จด VAT · เอกสารไม่คิดภาษีมูลค่าเพิ่ม">
                เมื่อจด VAT แล้ว ให้กรอกวันที่จดด้านล่าง เอกสารที่ลงวันที่ตั้งแต่วันนั้นจะคิด VAT ให้เอง
            </StatusBanner>
        );
    }
    if (registeredFrom > today) {
        return (
            <StatusBanner tone="wait" title={`จด VAT มีผลวันที่ ${formatDateOnly(registeredFrom)}`}>
                เอกสารที่ลงวันที่ก่อนวันนั้นยังไม่คิด VAT · ตั้งแต่วันนั้นคิดตามอัตราที่มีผล
            </StatusBanner>
        );
    }
    return (
        <StatusBanner tone="done" title={`คิด VAT ${vatRateToday ?? "-"}% กับเอกสารที่ออกวันนี้`}>
            จด VAT ตั้งแต่ {formatDateOnly(registeredFrom)} · ใบเสนอราคาแต่ละใบเลือก VAT 0% ได้ (เช่น ส่งออกบริการ)
        </StatusBanner>
    );
}
