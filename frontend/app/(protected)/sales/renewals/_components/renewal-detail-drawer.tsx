"use client";

// รายละเอียดรายการต่ออายุ (2026-10-31 · แผนข้อ 5.2): แก้ราคา/รอบ/ชื่อ/วันครบ · ประวัติรอบ · พัก / เปิดต่อ / ยกเลิก
// แก้ทับกันไม่ได้ (rnw_version) · ยกเลิกแล้วอ่านอย่างเดียว · เปิดต่อเติมวันครบให้ = วันครบเดิม + จำนวนวันที่พัก
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Copy, FileText, Handshake } from "lucide-react";
import { toast } from "sonner";
import EditorDrawer, { DrawerButtons, DrawerSection, confirmDiscard } from "@/components/ui/editor-drawer";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import StatusPill from "@/components/ui/status-pill";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { RENEWAL_CYCLES, cycleLabel, cycleUnit, daysBetweenDates, shiftDays } from "@/lib/shared/renewal-math.mjs";
import { thaiShortDate } from "@/lib/shared/thai-date.mjs";
import { renewalUpdateSchema } from "@/lib/shared/schemas/renewal.mjs";
import { todayBangkokText } from "../../../people/employees/_card-status";
import {
    CHANNEL_LABELS,
    RENEWAL_MESSAGES,
    STATUS_LABELS,
    dueText,
    perCycleText,
    periodText,
    renewalTitle,
} from "../_messages";
import type { Renewal, RenewalCycle } from "../_types";

type Detail = { renewal: Renewal; cycles: RenewalCycle[] };
type EditForm = {
    rnw_label: string;
    rnw_price: string;
    rnw_cycle_months: number;
    rnw_next_due_date: string;
    rnw_notes: string;
};
type EndAction = "pause" | "cancel";

const toForm = (renewal: Renewal): EditForm => ({
    rnw_label: renewal.rnw_label ?? "",
    rnw_price: renewal.rnw_price,
    rnw_cycle_months: renewal.rnw_cycle_months,
    rnw_next_due_date: renewal.rnw_next_due_date,
    rnw_notes: renewal.rnw_notes ?? "",
});

export default function RenewalDetailDrawer({
    renewalId,
    onClose,
    onChanged,
}: {
    renewalId: string;
    onClose: () => void;
    onChanged: () => void;
}) {
    const [detail, setDetail] = useState<Detail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [form, setForm] = useState<EditForm | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [endAction, setEndAction] = useState<EndAction | null>(null);
    const [reason, setReason] = useState("");
    const [resumeDate, setResumeDate] = useState("");
    const router = useRouter();
    const hasBit = usePermission();

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<Detail>(`/renewals/${encodeURIComponent(renewalId)}`);
        if (error) {
            setLoadError(error.message);
            return;
        }
        setDetail(data);
        setForm(toForm(data.renewal));
        // เปิดต่อ: วันครบเดิม + จำนวนวันที่พัก (แก้ได้)
        const { rnw_paused_on: pausedOn, rnw_next_due_date: nextDue } = data.renewal;
        setResumeDate(
            pausedOn ? shiftDays(nextDue, Math.max(0, daysBetweenDates(pausedOn, todayBangkokText()))) : nextDue,
        );
    }, [renewalId]);

    useEffect(() => {
        const timer = setTimeout(load, 0);
        return () => clearTimeout(timer);
    }, [load]);

    const renewal = detail?.renewal ?? null;
    const isDirty = Boolean(renewal && form && JSON.stringify(form) !== JSON.stringify(toForm(renewal)));
    const isCancelled = renewal?.rnw_status === "cancelled";

    async function afterChange(message: string) {
        toast.success(message);
        setEndAction(null);
        setReason("");
        setErrors({});
        setSaveError(null);
        await load();
        onChanged();
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        if (!renewal || !form) return;
        setSaveError(null);
        const checked = renewalUpdateSchema.safeParse({ ...form, rnw_version: renewal.rnw_version });
        if (!checked.success) {
            const fieldErrors = toFieldErrors(checked.error.issues);
            setErrors(fieldErrors);
            toast.error(`ข้อมูลไม่ถูกต้อง ${Object.keys(fieldErrors).length} ช่อง กรุณาแก้ตามข้อความสีแดงใต้ช่อง`);
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch(`/renewals/${encodeURIComponent(renewal.rnw_id)}`, {
            method: "PUT",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setSaveError(error);
            return;
        }
        await afterChange("บันทึกรายการต่ออายุแล้ว");
    }

    async function runAction(action: "pause" | "cancel" | "resume") {
        if (!renewal) return;
        const body =
            action === "resume"
                ? { rnw_next_due_date: resumeDate, rnw_version: renewal.rnw_version }
                : { reason, rnw_version: renewal.rnw_version };
        setIsSaving(true);
        const { error } = await apiFetch(`/renewals/${encodeURIComponent(renewal.rnw_id)}/${action}`, {
            method: "POST",
            body,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setSaveError(error);
            return;
        }
        const messages = { pause: "พักรายการแล้ว", cancel: "ยกเลิกรายการแล้ว", resume: "เปิดรายการต่อแล้ว" };
        await afterChange(messages[action]);
    }

    // ลูกค้าตรง: ออกร่างใบแจ้งหนี้รอบนี้ แล้วเปิดใบให้ตรวจ/ส่งอนุมัติ
    async function invoiceThisCycle() {
        if (!renewal) return;
        setIsSaving(true);
        const { data, error } = await apiFetch<{ inv_id: string }>("/renewals/invoice", {
            method: "POST",
            body: { items: [{ rnw_id: renewal.rnw_id, rnw_version: renewal.rnw_version }] },
        });
        setIsSaving(false);
        if (error) {
            setSaveError(error);
            return;
        }
        toast.success("สร้างร่างใบแจ้งหนี้รอบนี้แล้ว · ตรวจแล้วส่งอนุมัติ");
        onChanged();
        router.push(`/sales/invoices/view?id=${data.inv_id}`);
    }

    // Fastwork: ข้อความแจ้งผู้ซื้อ (วางในแชต Fastwork) · Q3 ระบบยังไม่ส่งอีเมลเอง
    async function copyBuyerMessage() {
        if (!renewal) return;
        const text = `${renewalTitle(renewal)} จะครบกำหนดต่ออายุวันที่ ${thaiShortDate(renewal.rnw_next_due_date)} ค่าบริการ ${formatAmount(renewal.rnw_price)} บาท/${cycleUnit(renewal.rnw_cycle_months)} (รอบ ${periodText(renewal.next_period)}) สั่งต่ออายุผ่าน Fastwork ได้เลยครับ`;
        try {
            await navigator.clipboard.writeText(text);
            toast.success("คัดลอกข้อความแล้ว วางในแชต Fastwork ได้เลย");
        } catch {
            toast.error("คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง");
        }
    }

    function updateForm<Field extends keyof EditForm>(field: Field, value: EditForm[Field]) {
        setForm((current) => (current ? { ...current, [field]: value } : current));
    }

    return (
        <EditorDrawer
            title={renewal ? renewalTitle(renewal) : "รายการต่ออายุ"}
            subtitle={
                renewal
                    ? `${renewal.client_name} · ${renewal.product_name} · ${CHANNEL_LABELS[renewal.rnw_channel]}`
                    : undefined
            }
            isDirty={isDirty}
            onClose={onClose}
            onSubmit={submit}
            footer={
                isCancelled || !renewal ? (
                    <div className="flex justify-end">
                        <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                            ปิด
                        </button>
                    </div>
                ) : (
                    <DrawerButtons
                        summary={
                            renewal && (
                                <span className="tabular-nums">
                                    {formatAmount(form?.rnw_price || "0")}{" "}
                                    {perCycleText(form?.rnw_cycle_months ?? renewal.rnw_cycle_months)}
                                </span>
                            )
                        }
                        isSaving={isSaving}
                        submitLabel="บันทึก"
                        onCancel={() => confirmDiscard(isDirty) && onClose()}
                    />
                )
            }
        >
            {loadError && (
                <StatusBanner tone="error" title="โหลดรายการไม่สำเร็จ">
                    {loadError}
                </StatusBanner>
            )}
            {renewal && form && (
                <>
                    <SummaryCard renewal={renewal} />

                    {renewal.rnw_status === "active" && (
                        <div className="grid gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                            <p className="text-sm font-medium text-gray-900">
                                รอบนี้: {periodText(renewal.next_period)}
                            </p>
                            {renewal.rnw_channel === "direct" ? (
                                <>
                                    <p className="text-xs text-gray-600">
                                        สร้างร่างใบแจ้งหนี้ (ผ่านการอนุมัติตามเดิม) · วันครบขยับไปรอบถัดไปทันที ·
                                        ลบร่าง/ยกเลิกใบ = วันครบถอยกลับ
                                    </p>
                                    {hasBit(BITS.createInvoice) ? (
                                        <button
                                            type="button"
                                            disabled={isSaving || isDirty}
                                            onClick={invoiceThisCycle}
                                            className={buttonClass("primary", "md", "justify-self-start")}
                                        >
                                            <FileText size={16} />
                                            ออกใบแจ้งหนี้รอบนี้
                                        </button>
                                    ) : (
                                        <p className="text-xs text-gray-500">รอผู้มีสิทธิ์สร้างใบแจ้งหนี้</p>
                                    )}
                                    {isDirty && (
                                        <p className="text-xs text-amber-700">บันทึกการแก้ไขก่อน แล้วค่อยออกใบ</p>
                                    )}
                                </>
                            ) : (
                                <>
                                    <p className="text-xs text-gray-600">
                                        แจ้งผู้ซื้อในแชต Fastwork · ผู้ซื้อจ่ายแล้วกดรับงานต่ออายุ
                                        ระบบเติมชื่องานและราคาให้ · วันครบขยับไปรอบถัดไป
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={copyBuyerMessage}
                                            className={buttonClass("secondary", "md")}
                                        >
                                            <Copy size={16} />
                                            คัดลอกข้อความแจ้งผู้ซื้อ
                                        </button>
                                        <Link
                                            href={`/fastwork/new?renewal=${encodeURIComponent(renewal.rnw_id)}`}
                                            className={buttonClass("primary", "md")}
                                        >
                                            <Handshake size={16} />
                                            ผู้ซื้อจ่ายแล้ว รับงานต่ออายุ
                                        </Link>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    <DrawerSection
                        number={1}
                        title="ราคาและรอบ"
                        description={isCancelled ? "ยกเลิกแล้ว แก้ไม่ได้" : undefined}
                    >
                        <fieldset disabled={isCancelled} className="grid gap-4">
                            <FormField
                                label="ชื่อที่จำง่าย"
                                htmlFor="edit_label"
                                hint={RENEWAL_MESSAGES.label}
                                error={errors.rnw_label}
                            >
                                <input
                                    id="edit_label"
                                    value={form.rnw_label}
                                    maxLength={200}
                                    onChange={(event) => updateForm("rnw_label", event.target.value)}
                                    className={inputClass(Boolean(errors.rnw_label))}
                                />
                            </FormField>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    label="ราคาต่อรอบ (บาท)"
                                    htmlFor="edit_price"
                                    required
                                    hint={RENEWAL_MESSAGES.price}
                                    error={errors.rnw_price}
                                >
                                    <input
                                        id="edit_price"
                                        inputMode="decimal"
                                        value={form.rnw_price}
                                        onChange={(event) => updateForm("rnw_price", event.target.value)}
                                        className={`${inputClass(Boolean(errors.rnw_price))} text-right tabular-nums`}
                                    />
                                </FormField>
                                <FormField
                                    label="ต่ออายุ"
                                    htmlFor="edit_cycle"
                                    required
                                    error={errors.rnw_cycle_months}
                                >
                                    <select
                                        id="edit_cycle"
                                        value={form.rnw_cycle_months}
                                        onChange={(event) => updateForm("rnw_cycle_months", Number(event.target.value))}
                                        className={inputClass(Boolean(errors.rnw_cycle_months))}
                                    >
                                        {RENEWAL_CYCLES.map((months) => (
                                            <option key={months} value={months}>
                                                {cycleLabel(months)}
                                            </option>
                                        ))}
                                    </select>
                                </FormField>
                                <FormField
                                    label="ครบรอบถัดไป"
                                    htmlFor="edit_due"
                                    required
                                    hint={RENEWAL_MESSAGES.nextDue}
                                    error={errors.rnw_next_due_date}
                                >
                                    <input
                                        id="edit_due"
                                        type="date"
                                        value={form.rnw_next_due_date}
                                        onChange={(event) => updateForm("rnw_next_due_date", event.target.value)}
                                        className={inputClass(Boolean(errors.rnw_next_due_date))}
                                    />
                                </FormField>
                            </div>
                            <FormField label="บันทึกภายใน" htmlFor="edit_notes" error={errors.rnw_notes}>
                                <textarea
                                    id="edit_notes"
                                    rows={2}
                                    maxLength={1000}
                                    value={form.rnw_notes}
                                    onChange={(event) => updateForm("rnw_notes", event.target.value)}
                                    className={inputClass(Boolean(errors.rnw_notes))}
                                />
                            </FormField>
                        </fieldset>
                    </DrawerSection>

                    <DrawerSection
                        number={2}
                        title="ประวัติรอบ"
                        description="รอบที่ออกใบแจ้งหนี้หรือรับงานต่ออายุแล้ว · ขีดฆ่า = ใบ/งานถูกยกเลิก"
                    >
                        <CycleHistory cycles={detail?.cycles ?? []} />
                    </DrawerSection>

                    {!isCancelled && (
                        <DrawerSection number={3} title="พัก / ยกเลิก">
                            {renewal.rnw_status === "paused" ? (
                                <div className="grid gap-3">
                                    <p className="text-sm text-gray-600">
                                        พักตั้งแต่ {thaiShortDate(renewal.rnw_paused_on)} · เหตุผล:{" "}
                                        {renewal.rnw_end_reason}
                                    </p>
                                    <FormField
                                        label="ครบรอบถัดไปหลังเปิดต่อ"
                                        htmlFor="resume_date"
                                        hint="เติมให้ = วันครบเดิม + จำนวนวันที่พัก · แก้ได้"
                                        error={errors.rnw_next_due_date}
                                    >
                                        <input
                                            id="resume_date"
                                            type="date"
                                            value={resumeDate}
                                            onChange={(event) => setResumeDate(event.target.value)}
                                            className={inputClass(Boolean(errors.rnw_next_due_date))}
                                        />
                                    </FormField>
                                    <button
                                        type="button"
                                        disabled={isSaving || !resumeDate}
                                        className={buttonClass("secondary", "md", "justify-self-start")}
                                        onClick={() => runAction("resume")}
                                    >
                                        เปิดต่อ
                                    </button>
                                </div>
                            ) : null}
                            {endAction ? (
                                <div className="grid gap-3 rounded-xl bg-gray-50 p-3">
                                    <p className="text-sm text-gray-600">
                                        {endAction === "pause" ? RENEWAL_MESSAGES.pause : RENEWAL_MESSAGES.cancel}
                                    </p>
                                    <FormField label="เหตุผล" htmlFor="end_reason" required error={errors.reason}>
                                        <input
                                            id="end_reason"
                                            value={reason}
                                            maxLength={500}
                                            placeholder={
                                                endAction === "pause"
                                                    ? "เช่น ลูกค้าปิดร้านชั่วคราว"
                                                    : "เช่น ย้ายไปผู้ให้บริการอื่น"
                                            }
                                            onChange={(event) => setReason(event.target.value)}
                                            className={inputClass(Boolean(errors.reason))}
                                        />
                                    </FormField>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            className={buttonClass("secondary", "md")}
                                            onClick={() => setEndAction(null)}
                                        >
                                            ไม่ทำแล้ว
                                        </button>
                                        <button
                                            type="button"
                                            disabled={isSaving}
                                            className={buttonClass(endAction === "cancel" ? "danger" : "primary", "md")}
                                            onClick={() => runAction(endAction)}
                                        >
                                            {endAction === "pause" ? "ยืนยันพัก" : "ยืนยันยกเลิก"}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {renewal.rnw_status === "active" && (
                                        <button
                                            type="button"
                                            className={buttonClass("secondary", "md")}
                                            onClick={() => setEndAction("pause")}
                                        >
                                            พักไว้
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        className={buttonClass(
                                            "ghost",
                                            "md",
                                            "text-red-600 hover:bg-red-50 hover:text-red-700",
                                        )}
                                        onClick={() => setEndAction("cancel")}
                                    >
                                        ยกเลิกรายการ
                                    </button>
                                </div>
                            )}
                        </DrawerSection>
                    )}
                    <SaveErrorBanner error={saveError} />
                </>
            )}
        </EditorDrawer>
    );
}

function SummaryCard({ renewal }: { renewal: Renewal }) {
    const isActive = renewal.rnw_status === "active";
    return (
        <div className="grid gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={isActive ? "info" : renewal.rnw_status === "paused" ? "wait" : "neutral"}>
                    {STATUS_LABELS[renewal.rnw_status]}
                </StatusPill>
                {isActive && (
                    <span className={renewal.days_left < 0 ? "text-red-600" : "text-gray-600"}>
                        ครบ {thaiShortDate(renewal.rnw_next_due_date)} · {dueText(renewal.days_left)}
                    </span>
                )}
            </div>
            {/* ใช้งานอยู่: ช่วงรอบนี้อยู่ในกล่องออกใบ/รับงานแล้ว ไม่แสดงซ้ำ */}
            {!isActive && (
                <p className="text-gray-600">
                    รอบถัดไป: <span className="text-gray-900">{periodText(renewal.next_period)}</span>
                </p>
            )}
            {renewal.project_name && renewal.rnw_project_id && (
                <p className="text-gray-600">
                    โปรเจกต์:{" "}
                    <Link
                        href={`/projects/view?id=${renewal.rnw_project_id}`}
                        className="text-blue-600 hover:underline"
                    >
                        {renewal.project_name}
                    </Link>
                </p>
            )}
            {renewal.rnw_status === "cancelled" && renewal.rnw_end_reason && (
                <p className="text-gray-600">เหตุผลที่ยกเลิก: {renewal.rnw_end_reason}</p>
            )}
            {(renewal.client_status !== "active" || renewal.product_status !== "active") && (
                <p className="text-amber-600">
                    {renewal.client_status !== "active" ? "ลูกค้าปิดใช้งานแล้ว" : "สินค้าปิดใช้งานแล้ว"} ·
                    ตรวจก่อนต่ออายุ
                </p>
            )}
        </div>
    );
}

function CycleHistory({ cycles }: { cycles: RenewalCycle[] }) {
    if (cycles.length === 0) return <p className="text-sm text-gray-500">ยังไม่มีรอบที่ออกใบหรือรับงาน</p>;
    return (
        <ul className="grid gap-2">
            {cycles.map((cycle) => {
                const isVoid = cycle.rnc_status === "void";
                return (
                    <li
                        key={cycle.rnc_id}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl bg-gray-50 px-3 py-2 text-sm"
                    >
                        <span className={isVoid ? "text-gray-400 line-through" : "text-gray-800"}>
                            {periodText({ start: cycle.rnc_period_start, end: cycle.rnc_period_end })}
                        </span>
                        <span className="flex items-baseline gap-3">
                            {cycle.rnc_invoice_id && cycle.inv_number && (
                                <Link
                                    href={`/sales/invoices/view?id=${cycle.rnc_invoice_id}`}
                                    className="text-blue-600 hover:underline"
                                >
                                    {cycle.inv_number}
                                </Link>
                            )}
                            {cycle.rnc_invoice_id && !cycle.inv_number && (
                                <Link
                                    href={`/sales/invoices/view?id=${cycle.rnc_invoice_id}`}
                                    className="text-blue-600 hover:underline"
                                >
                                    ร่างใบแจ้งหนี้
                                </Link>
                            )}
                            {cycle.rnc_project_id && (
                                <Link
                                    href={`/projects/view?id=${cycle.rnc_project_id}`}
                                    className="text-blue-600 hover:underline"
                                >
                                    {cycle.project_name ?? "งานต่ออายุ"}
                                </Link>
                            )}
                            <span className={`tabular-nums ${isVoid ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                {formatAmount(cycle.rnc_amount)} บาท
                            </span>
                        </span>
                    </li>
                );
            })}
        </ul>
    );
}
