"use client";

// รายละเอียดเงินเดือนรายคน — ที่มาของทุกตัวเลข + รายการเพิ่ม/หัก · ร่าง: เพิ่ม/ลบรายการกรอกเองได้ (คิดคนนั้นใหม่ทันที)
// บนมือถือเลื่อนขึ้นจากล่าง (CODING_GUIDELINES 5.1)
import { attendanceDeductionText } from "../../_attendance-text";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Printer, Trash2, X } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount } from "@/lib/shared/money.mjs";
import { payrollLineSchema } from "@/lib/shared/schemas/payroll.mjs";
import { PAYROLL_MESSAGES } from "../../../_messages";
import type { PayrollItem } from "../../../_types";

type LineForm = {
    pil_kind: "earning" | "deduction";
    pil_label: string;
    pil_amount: string;
    pil_is_taxable: boolean;
    pil_is_sso_wage: boolean;
    pil_is_one_off: boolean;
};

const EMPTY_LINE: LineForm = {
    pil_kind: "earning",
    pil_label: "",
    pil_amount: "",
    pil_is_taxable: true,
    pil_is_sso_wage: false,
    pil_is_one_off: true,
};

// รายการหัก: ใส่เครื่องหมายลบเฉพาะยอดที่มากกว่า 0 (ไม่แสดง "-0.00")
function minus(amount: string) {
    return Number(amount) > 0 ? `-${formatAmount(amount)}` : formatAmount(amount);
}

function Row({
    label,
    value,
    tone = "text-gray-900",
    note,
}: {
    label: string;
    value: string;
    tone?: string;
    note?: string;
}) {
    return (
        <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
            <span className="grid min-w-0 gap-0.5 text-gray-600">
                {label}
                {note && <span className="text-xs text-gray-400">{note}</span>}
            </span>
            <span className={`shrink-0 tabular-nums ${tone}`}>{value}</span>
        </div>
    );
}

export default function ItemSheet({
    runId,
    version,
    item,
    canEdit,
    canOpenSlip,
    onClose,
    onChanged,
}: {
    runId: number;
    version: number;
    item: PayrollItem | null;
    canEdit: boolean;
    canOpenSlip: boolean;
    onClose: () => void;
    onChanged: () => Promise<void>;
}) {
    const [form, setForm] = useState<LineForm>(EMPTY_LINE);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!item) return;
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [item, onClose]);

    if (!item) return null;

    const isPartialMonth = item.pri_employed_days < item.pri_days_in_month;
    const earnings = item.lines.filter((line) => line.pil_kind === "earning");
    const deductions = item.lines.filter((line) => line.pil_kind === "deduction");

    async function addLine(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const payload = { pr_version: version, ...form };
        const checked = payrollLineSchema.safeParse(payload);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await apiFetch(`/payroll/runs/${runId}/items/${item!.pri_id}/lines`, {
            method: "POST",
            body: payload,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setBannerError(error.message);
            await onChanged();
            return;
        }
        toast.success("เพิ่มรายการแล้ว คิดเงินเดือนคนนี้ใหม่แล้ว");
        setForm(EMPTY_LINE);
        await onChanged();
    }

    async function removeLine(lineId: number) {
        setBannerError(null);
        setIsSaving(true);
        const { error } = await apiFetch(`/payroll/runs/${runId}/items/${item!.pri_id}/lines/${lineId}`, {
            method: "DELETE",
            body: { pr_version: version },
        });
        setIsSaving(false);
        if (error) setBannerError(error.message);
        await onChanged();
    }

    function lineList(lines: PayrollItem["lines"], sign: string) {
        return lines.map((line) => (
            <div key={line.pil_id} className="flex items-start justify-between gap-3 py-1.5 text-sm">
                <span className="grid min-w-0 gap-0.5 text-gray-600">
                    {line.pil_label}
                    <span className="text-xs text-gray-400">
                        {[
                            line.pil_source === "recurring"
                                ? "รายการประจำ"
                                : line.pil_source === "attendance"
                                  ? "จากลงเวลา (OT ที่อนุมัติ ตามเวลาที่อยู่จริง)"
                                  : "กรอกเอง",
                            line.pil_kind === "earning" && (line.pil_is_taxable ? "คิดภาษี" : "ไม่คิดภาษี"),
                            line.pil_kind === "earning" && line.pil_is_sso_wage && "ค่าจ้างประกันสังคม",
                            line.pil_kind === "earning" &&
                                line.pil_source === "manual" &&
                                line.pil_is_one_off &&
                                "ครั้งเดียว",
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 tabular-nums">
                    {sign}
                    {formatAmount(line.pil_amount)}
                    {canEdit && line.pil_source === "manual" && (
                        <button
                            type="button"
                            aria-label={`ลบ ${line.pil_label}`}
                            disabled={isSaving}
                            className="flex h-10 w-10 items-center justify-center text-red-600"
                            onClick={() => removeLine(line.pil_id)}
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </span>
            </div>
        ));
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="payroll-item-title"
                className="grid max-h-[92dvh] w-full max-w-3xl gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 sm:p-6 shadow-float sm:rounded-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-0.5">
                        <h2 id="payroll-item-title" className="text-base font-medium text-gray-900">
                            {item.pri_full_name}
                        </h2>
                        <span className="text-xs text-gray-500">
                            {[item.pri_emp_code, item.pri_position, item.pri_department_name]
                                .filter(Boolean)
                                .join(" · ")}
                        </span>
                    </div>
                    <button
                        type="button"
                        aria-label="ปิด"
                        className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>
                {bannerError && (
                    <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                        {bannerError}
                    </StatusBanner>
                )}

                <section className="grid divide-y divide-gray-100">
                    <Row
                        label="เงินเดือน"
                        value={formatAmount(item.pri_salary_amount)}
                        note={
                            isPartialMonth
                                ? `${formatAmount(item.pri_base_salary)} × ${item.pri_employed_days}/${item.pri_days_in_month} วัน (เข้า/ออกกลางเดือน)`
                                : `อัตรา ${formatAmount(item.pri_base_salary)} ต่อเดือน`
                        }
                    />
                    {Number(item.pri_unpaid_leave_amount) > 0 && (
                        <Row
                            label="หักลาไม่รับค่าจ้าง"
                            value={minus(item.pri_unpaid_leave_amount)}
                            note={`${Number(item.pri_unpaid_leave_days)} วัน`}
                        />
                    )}
                    {Number(item.pri_attendance_deduction) > 0 && (
                        <Row
                            label="หักสาย/ออกก่อน/ขาดงาน"
                            value={minus(item.pri_attendance_deduction)}
                            note={`${attendanceDeductionText(item)} · ค่าจ้างต่อชั่วโมง = เงินเดือน ÷ 30 ÷ ชั่วโมงต่อวัน · ขาด = วันละเท่าลาไม่รับค่าจ้าง`}
                        />
                    )}
                    {lineList(earnings, "+")}
                    <Row label="รวมเงินได้" value={formatAmount(item.pri_gross)} tone="font-medium text-gray-900" />
                    {lineList(deductions, "-")}
                    <Row
                        label="ประกันสังคม"
                        value={minus(item.pri_sso_employee)}
                        note={item.pri_sso_enrolled ? `ฐาน ${formatAmount(item.pri_sso_wage)}` : "ไม่เข้าประกันสังคม"}
                    />
                    <Row
                        label="ภาษีหัก ณ ที่จ่าย"
                        value={minus(item.pri_tax)}
                        note={`เงินได้ทั้งปีประมาณ ${formatAmount(item.pri_annual_income_estimate)} · ภาษีทั้งปี ${formatAmount(item.pri_annual_tax_estimate)} · หักแล้วก่อนเดือนนี้ ${formatAmount(item.pri_ytd_tax_before)}`}
                    />
                    <Row
                        label="รับสุทธิ"
                        value={formatAmount(item.pri_net)}
                        tone={`text-base font-medium ${Number(item.pri_net) < 0 ? "text-red-600" : "text-gray-900"}`}
                    />
                </section>
                <FieldHint>
                    {PAYROLL_MESSAGES.tax} · บริษัทจ่ายประกันสังคมส่วนนายจ้าง {formatAmount(item.pri_sso_employer)} บาท
                    · บัญชีรับเงิน {item.pri_bank_name ?? "-"} {item.pri_bank_account_no ?? "(ยังไม่มีเลขบัญชี)"}
                </FieldHint>

                {canOpenSlip && (
                    <Link
                        href={`/people/payslips/print?id=${item.pri_id}`}
                        className={`${buttonClass("secondary", "md")} justify-self-start`}
                    >
                        <Printer size={16} />
                        เปิดสลิป / พิมพ์
                    </Link>
                )}

                {canEdit && (
                    <form onSubmit={addLine} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-3">
                        <span className="text-sm font-medium text-gray-900">เพิ่มรายการเดือนนี้</span>
                        <Segmented<"earning" | "deduction">
                            label="ชนิด"
                            value={form.pil_kind}
                            onChange={(value) => setForm((current) => ({ ...current, pil_kind: value }))}
                            options={[
                                { value: "earning", label: "รายรับ" },
                                { value: "deduction", label: "รายหัก" },
                            ]}
                        />
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
                            <FormField label="ชื่อรายการ (พิมพ์บนสลิป)" htmlFor="pil_label" error={errors.pil_label}>
                                <input
                                    id="pil_label"
                                    maxLength={100}
                                    placeholder={
                                        form.pil_kind === "earning" ? "เช่น โบนัส, ค่าล่วงเวลา" : "เช่น หักเบิกเกิน"
                                    }
                                    value={form.pil_label}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, pil_label: event.target.value }))
                                    }
                                    className={inputClass(Boolean(errors.pil_label))}
                                />
                            </FormField>
                            <FormField label="จำนวนเงิน" htmlFor="pil_amount" error={errors.pil_amount}>
                                <input
                                    id="pil_amount"
                                    inputMode="decimal"
                                    value={form.pil_amount}
                                    onChange={(event) =>
                                        setForm((current) => ({ ...current, pil_amount: event.target.value }))
                                    }
                                    className={inputClass(Boolean(errors.pil_amount))}
                                />
                            </FormField>
                        </div>
                        {form.pil_kind === "earning" && (
                            <div className="grid gap-3">
                                <Switch
                                    id="pil_is_taxable"
                                    label="คิดภาษี"
                                    checked={form.pil_is_taxable}
                                    onChange={(checked) =>
                                        setForm((current) => ({ ...current, pil_is_taxable: checked }))
                                    }
                                />
                                <Switch
                                    id="pil_is_sso_wage"
                                    label="นับเป็นค่าจ้างประกันสังคม"
                                    description="ค่าจ้างที่จ่ายประจำ เช่น ค่าตำแหน่ง · โบนัส/OT ส่วนใหญ่ไม่นับ"
                                    checked={form.pil_is_sso_wage}
                                    onChange={(checked) =>
                                        setForm((current) => ({ ...current, pil_is_sso_wage: checked }))
                                    }
                                />
                                <Switch
                                    id="pil_is_one_off"
                                    label="รายรับครั้งเดียว"
                                    description="เปิด = ไม่นำไปประมาณการทั้งปีตอนคิดภาษี (โบนัส) · ปิด = จ่ายทุกเดือน (ควรตั้งเป็นรายการประจำที่หน้าพนักงาน)"
                                    checked={form.pil_is_one_off}
                                    onChange={(checked) =>
                                        setForm((current) => ({ ...current, pil_is_one_off: checked }))
                                    }
                                />
                            </div>
                        )}
                        <button
                            type="submit"
                            className={`${buttonClass("primary", "md")} justify-self-end`}
                            disabled={isSaving}
                        >
                            เพิ่มรายการ
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
