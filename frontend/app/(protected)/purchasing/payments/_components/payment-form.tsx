"use client";

// ฟอร์มทำจ่าย (ขั้น 2-4): เลือกผู้รับ → เลือกรายการที่จะจ่าย (บางส่วนได้) → วิธีจ่าย → หัก ณ ที่จ่าย → ยืนยัน (ได้เลข PV + 50 ทวิ)
// ยอดคิดด้วยสูตรเดียวกับ backend (shared/payment-totals.mjs) — backend คิดซ้ำและตัดสินตอนยืนยันเสมอ
// อัตราหัก ณ ที่จ่ายที่แสดงเป็นของวันนี้ · ถ้าเลือกวันที่จ่ายย้อนหลังข้ามวันเปลี่ยนอัตรา backend ใช้อัตราของวันที่จ่าย
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, Percent, ReceiptText, UserRound } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { calculatePayment } from "@/lib/shared/payment-totals.mjs";
import { PAYMENT_METHODS, paymentCreateSchema } from "@/lib/shared/schemas/payment.mjs";
import { whtFormLabel } from "../../_messages";
import { METHOD_LABELS, PAYMENT_MESSAGES } from "../_messages";
import type { Payee, PayableExpense, PayableResponse, PaymentMethod } from "../_types";

export type PaymentFormOptions = {
    today: string;
    branches: {
        branch_id: string;
        branch_code: string;
        branch_name_th: string;
        branch_status: "active" | "inactive";
    }[];
    bank_accounts: {
        ba_id: string;
        ba_bank_name: string;
        ba_account_no: string;
        ba_currency: string;
        ba_is_default: boolean;
        ba_status: "active" | "inactive";
    }[];
    currencies: { cur_code: string; cur_decimals: number }[];
};

type Selection = Record<string, { checked: boolean; amount: string }>;

type PaymentFormProps = {
    options: PaymentFormOptions;
    payees: Payee[];
    // มาจากปุ่ม "ทำจ่าย" ในหน้ารายการ — เลือกผู้รับและรายการนั้นไว้ให้
    initialPayee: { kind: "vendor" | "employee"; id: string } | null;
    initialExpenseId: string | null;
};

function payeeKey(payee: { payee_kind: string; payee_id: string; currency?: string }) {
    return `${payee.payee_kind}:${payee.payee_id}`;
}

function toHundredths(text: string) {
    try {
        return parseHundredths(text.trim() === "" ? "0" : text, "ยอด");
    } catch {
        return 0n;
    }
}

export default function PaymentForm({ options, payees, initialPayee, initialExpenseId }: PaymentFormProps) {
    const router = useRouter();
    const [selectedPayeeKey, setSelectedPayeeKey] = useState(
        initialPayee ? `${initialPayee.kind}:${initialPayee.id}` : "",
    );
    const [payable, setPayable] = useState<PayableResponse | null>(null);
    const [isLoadingPayable, setIsLoadingPayable] = useState(false);
    const [selection, setSelection] = useState<Selection>({});
    const [paymentDate, setPaymentDate] = useState(options.today);
    const [method, setMethod] = useState<PaymentMethod>("transfer");
    const [bankAccountId, setBankAccountId] = useState("");
    const [reference, setReference] = useState("");
    const [chequeNo, setChequeNo] = useState("");
    const [chequeDate, setChequeDate] = useState("");
    const [fee, setFee] = useState("");
    const [paidThb, setPaidThb] = useState("");
    const [notes, setNotes] = useState("");
    const [branchId, setBranchId] = useState("");
    const [withholdingEdits, setWithholdingEdits] = useState<Record<string, string>>({});
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const payee = payees.find((item) => payeeKey(item) === selectedPayeeKey) ?? null;
    const [payeeKind, payeeId] = selectedPayeeKey.split(":");

    // เปลี่ยนผู้รับ → โหลดรายการค้างจ่ายของผู้รับรายนั้น (เลือกไว้ทั้งหมด หรือเฉพาะรายการที่มาจากปุ่มทำจ่าย)
    useEffect(() => {
        if (!payeeKind || !payeeId) return;
        let isLeftPage = false;
        const query = new URLSearchParams({ payee_kind: payeeKind, payee_id: payeeId });
        apiFetch<PayableResponse>(`/payments/payable-expenses?${query}`).then(({ data }) => {
            if (isLeftPage || !data) return;
            setPayable(data);
            setIsLoadingPayable(false);
            setSelection(
                Object.fromEntries(
                    data.data.map((row) => [
                        row.ex_id,
                        {
                            checked: initialExpenseId ? row.ex_id === initialExpenseId : true,
                            amount: row.outstanding_amount,
                        },
                    ]),
                ),
            );
            setWithholdingEdits({});
            setBranchId(data.data[0]?.ex_branch_id ?? "");
        });
        return () => {
            isLeftPage = true;
        };
    }, [payeeKind, payeeId, initialExpenseId]);

    const rows: PayableExpense[] = payable?.data ?? [];
    const chosenRows = rows.filter((row) => selection[row.ex_id]?.checked);
    const currencyCode = chosenRows[0]?.ex_currency ?? payee?.currency ?? "THB";
    const decimals = options.currencies.find((item) => item.cur_code === currencyCode)?.cur_decimals ?? 2;
    const isForeign = currencyCode !== "THB";
    const accounts = options.bank_accounts.filter(
        (account) =>
            account.ba_status === "active" && (account.ba_currency === currencyCode || account.ba_currency === "THB"),
    );

    // บัญชีที่จ่ายออก: ยังไม่เลือกเอง = บัญชีหลักของสกุลนั้น (หรือบัญชีแรกที่ใช้ได้)
    const defaultAccount =
        accounts.find((account) => account.ba_currency === currencyCode && account.ba_is_default) ??
        accounts[0] ??
        null;
    const effectiveBankAccountId = bankAccountId || defaultAccount?.ba_id || "";

    const calculation = useMemo(() => {
        const rates = new Map(
            Object.entries(payable?.rates ?? {}).map(([type, rate]) => [
                type,
                { rate: rate.rate, minPayment: rate.min_payment },
            ]),
        );
        return calculatePayment({
            allocations: chosenRows.map((row) => ({
                expenseId: row.ex_id,
                amount: toHundredths(selection[row.ex_id]?.amount ?? "0"),
                expenseTotal: parseHundredths(row.ex_total, "ยอดรวม"),
                expenseSubtotal: parseHundredths(row.ex_subtotal, "ยอดก่อน VAT"),
                expenseTotalThb: parseHundredths(row.ex_total_thb, "ยอดบาท"),
                paidBefore: parseHundredths(row.ex_paid_amount, "ยอดจ่ายแล้ว"),
                baseBefore: parseHundredths(row.base_paid_before, "ฐาน"),
                thbBefore: parseHundredths(row.thb_paid_before, "ยอดบาท"),
                incomeType: row.ex_wht_income_type,
            })),
            rates,
            withholdings: Object.entries(withholdingEdits).map(([type, amount]) => ({
                income_type: type,
                amount: toHundredths(amount),
            })),
            fee: toHundredths(fee),
            isForeign,
            paidThb: isForeign && paidThb.trim() ? toHundredths(paidThb) : null,
            currencyDecimals: decimals,
        });
    }, [chosenRows, selection, payable, withholdingEdits, fee, isForeign, paidThb, decimals]);

    function updateSelection(expenseId: string, changes: Partial<{ checked: boolean; amount: string }>) {
        setSelection((current) => ({ ...current, [expenseId]: { ...current[expenseId], ...changes } }));
    }

    function buildPayload() {
        return {
            pv_payee_kind: payeeKind,
            pv_vendor_id: payeeKind === "vendor" ? payeeId : null,
            pv_employee_id: payeeKind === "employee" ? payeeId : null,
            pv_branch_id: branchId,
            pv_payment_date: paymentDate,
            pv_method: method,
            pv_bank_account_id: method === "transfer" || method === "cheque" ? effectiveBankAccountId || null : null,
            pv_reference: reference.trim() || null,
            pv_cheque_no: method === "cheque" ? chequeNo.trim() || null : null,
            pv_cheque_date: method === "cheque" ? chequeDate || null : null,
            allocations: chosenRows.map((row) => ({
                pva_expense_id: row.ex_id,
                pva_amount: selection[row.ex_id].amount,
            })),
            withholdings: calculation.groups.map((group) => ({
                income_type: group.incomeType,
                amount: formatAmount(group.withholding, decimals).replace(/,/g, ""),
            })),
            pv_fee_amount: fee.trim() || "0",
            pv_paid_thb: isForeign ? paidThb.trim() || null : null,
            pv_notes: notes.trim() || null,
        };
    }

    function handleReview() {
        setSaveError(null);
        const checked = paymentCreateSchema.safeParse(buildPayload());
        const liveErrors = calculation.errors;
        if (!checked.success || Object.keys(liveErrors).length > 0) {
            setFieldErrors({ ...(checked.success ? {} : toFieldErrors(checked.error.issues)), ...liveErrors });
            toast.error("ยังทำจ่ายไม่ได้ · แก้ช่องที่มีข้อความสีแดงก่อน");
            return;
        }
        setFieldErrors({});
        setIsConfirmOpen(true);
    }

    async function handleConfirm() {
        const checked = paymentCreateSchema.safeParse(buildPayload());
        if (!checked.success) return;
        setIsSaving(true);
        const { data, error } = await apiFetch<{ pv_id: string; pv_number: string; wt_number: string | null }>(
            "/payments",
            {
                method: "POST",
                body: checked.data,
            },
        );
        setIsSaving(false);
        if (error) {
            setIsConfirmOpen(false);
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        toast.success(
            data.wt_number ? `ทำจ่ายแล้ว ${data.pv_number} · 50 ทวิ ${data.wt_number}` : `ทำจ่ายแล้ว ${data.pv_number}`,
        );
        router.push(`/purchasing/payments/view?id=${data.pv_id}`);
    }

    const vendorPayees = payees.filter((item) => item.payee_kind === "vendor");
    const employeePayees = payees.filter((item) => item.payee_kind === "employee");
    const needsAccount = method === "transfer" || method === "cheque";
    const activeBranches = options.branches.filter((branch) => branch.branch_status === "active");

    return (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start max-lg:pb-28">
            <div className="grid min-w-0 grid-cols-1 gap-5">
                <SectionCard icon={UserRound} title="ผู้รับเงิน">
                    <FormField
                        label="ผู้รับเงิน"
                        htmlFor="payee"
                        required
                        hint={PAYMENT_MESSAGES.payee}
                        error={fieldErrors.pv_vendor_id ?? fieldErrors.pv_employee_id}
                    >
                        <select
                            id="payee"
                            value={selectedPayeeKey}
                            onChange={(event) => {
                                setSelectedPayeeKey(event.target.value);
                                setPayable(null);
                                setIsLoadingPayable(Boolean(event.target.value));
                            }}
                            className={inputClass()}
                        >
                            <option value="">เลือกผู้รับเงิน</option>
                            {vendorPayees.length > 0 && (
                                <optgroup label="ผู้ขาย">
                                    {vendorPayees.map((item) => (
                                        <option key={payeeKey(item) + item.currency} value={payeeKey(item)}>
                                            {item.payee_name} · {item.expense_count} รายการ · ค้าง{" "}
                                            {formatAmount(item.outstanding)} {item.currency}
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                            {employeePayees.length > 0 && (
                                <optgroup label="พนักงาน (เบิกเงิน)">
                                    {employeePayees.map((item) => (
                                        <option key={payeeKey(item)} value={payeeKey(item)}>
                                            {item.payee_name} · {item.expense_count} ใบเบิก · ค้าง{" "}
                                            {formatAmount(item.outstanding)} บาท
                                        </option>
                                    ))}
                                </optgroup>
                            )}
                        </select>
                    </FormField>
                    {payees.length === 0 && <FieldHint>ยังไม่มีรายการที่อนุมัติแล้วและรอจ่าย</FieldHint>}
                    {payee && (
                        <p className="text-sm text-gray-600">
                            {payee.payee_kind === "vendor"
                                ? whtFormLabel(payable?.wht_form ?? payee.wht_form)
                                : "พนักงาน · ไม่หัก ณ ที่จ่าย"}
                        </p>
                    )}
                </SectionCard>

                {selectedPayeeKey && (
                    <SectionCard
                        icon={ReceiptText}
                        title="รายการที่จ่าย"
                        description="เลือกได้หลายรายการ · แก้ยอดเพื่อจ่ายบางส่วน"
                    >
                        {isLoadingPayable && <p className="text-sm text-gray-500">กำลังโหลดรายการ...</p>}
                        {payable && rows.length === 0 && <FieldHint>ผู้รับรายนี้ไม่มีรายการค้างจ่ายแล้ว</FieldHint>}
                        <ul className="grid gap-2">
                            {rows.map((row, index) => {
                                const chosenIndex = chosenRows.findIndex((chosen) => chosen.ex_id === row.ex_id);
                                const amountError =
                                    chosenIndex >= 0 ? fieldErrors[`allocations.${chosenIndex}.pva_amount`] : undefined;
                                const isChecked = Boolean(selection[row.ex_id]?.checked);
                                return (
                                    <li
                                        key={row.ex_id}
                                        className={`grid gap-2 rounded-xl border p-3 ${isChecked ? "border-blue-200 bg-blue-50/40" : "border-gray-200"}`}
                                    >
                                        <label className="flex cursor-pointer items-start gap-3">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={(event) =>
                                                    updateSelection(row.ex_id, { checked: event.target.checked })
                                                }
                                                className="mt-1 h-5 w-5 shrink-0 accent-blue-600"
                                            />
                                            <span className="grid min-w-0 flex-1 gap-0.5 text-sm">
                                                <span className="font-medium text-gray-900">
                                                    {row.ex_number} · {row.ex_title}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    ครบกำหนด {formatDateOnly(row.ex_due_date)}
                                                    {row.ex_vendor_doc_no ? ` · เอกสาร ${row.ex_vendor_doc_no}` : ""}
                                                    {row.wht_income_type_name ? ` · ${row.wht_income_type_name}` : ""}
                                                </span>
                                                <span className="text-xs text-gray-500 tabular-nums">
                                                    ยอดรวม {formatAmount(row.ex_total, decimals)} · ค้าง{" "}
                                                    {formatAmount(row.outstanding_amount, decimals)} {row.ex_currency}
                                                </span>
                                            </span>
                                        </label>
                                        {isChecked && (
                                            <FormField
                                                label="ยอดจ่ายครั้งนี้"
                                                htmlFor={`amount-${index}`}
                                                error={amountError}
                                                className="sm:max-w-xs sm:pl-8"
                                            >
                                                <input
                                                    id={`amount-${index}`}
                                                    inputMode="decimal"
                                                    value={selection[row.ex_id]?.amount ?? ""}
                                                    onChange={(event) =>
                                                        updateSelection(row.ex_id, { amount: event.target.value })
                                                    }
                                                    className={`${inputClass(Boolean(amountError))} text-right`}
                                                />
                                            </FormField>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        {fieldErrors.allocations && (
                            <p className="text-xs text-red-600 whitespace-pre-line">{fieldErrors.allocations}</p>
                        )}
                    </SectionCard>
                )}

                {chosenRows.length > 0 && (
                    <>
                        <SectionCard icon={Banknote} title="วิธีจ่าย">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <FormField
                                    label="วันที่จ่าย"
                                    htmlFor="pv_payment_date"
                                    required
                                    hint={PAYMENT_MESSAGES.paymentDate}
                                    error={fieldErrors.pv_payment_date}
                                >
                                    <input
                                        id="pv_payment_date"
                                        type="date"
                                        value={paymentDate}
                                        max={options.today}
                                        onChange={(event) => setPaymentDate(event.target.value)}
                                        className={inputClass(Boolean(fieldErrors.pv_payment_date))}
                                    />
                                </FormField>
                                <FormField label="วิธีจ่าย" htmlFor="pv_method" required error={fieldErrors.pv_method}>
                                    <select
                                        id="pv_method"
                                        value={method}
                                        onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                                        className={inputClass()}
                                    >
                                        {(PAYMENT_METHODS as PaymentMethod[]).map((value) => (
                                            <option key={value} value={value}>
                                                {METHOD_LABELS[value]}
                                            </option>
                                        ))}
                                    </select>
                                </FormField>
                                {needsAccount && (
                                    <FormField
                                        label="จ่ายจากบัญชี"
                                        htmlFor="pv_bank_account_id"
                                        required
                                        hint={PAYMENT_MESSAGES.bankAccount}
                                        error={fieldErrors.pv_bank_account_id}
                                        className="sm:col-span-2"
                                    >
                                        <select
                                            id="pv_bank_account_id"
                                            value={effectiveBankAccountId}
                                            onChange={(event) => setBankAccountId(event.target.value)}
                                            className={inputClass(Boolean(fieldErrors.pv_bank_account_id))}
                                        >
                                            <option value="">เลือกบัญชี</option>
                                            {accounts.map((account) => (
                                                <option key={account.ba_id} value={account.ba_id}>
                                                    {account.ba_bank_name} {account.ba_account_no} (
                                                    {account.ba_currency})
                                                </option>
                                            ))}
                                        </select>
                                    </FormField>
                                )}
                                {method === "cheque" && (
                                    <>
                                        <FormField
                                            label="เลขที่เช็ค"
                                            htmlFor="pv_cheque_no"
                                            required
                                            error={fieldErrors.pv_cheque_no}
                                        >
                                            <input
                                                id="pv_cheque_no"
                                                value={chequeNo}
                                                onChange={(event) => setChequeNo(event.target.value)}
                                                className={inputClass(Boolean(fieldErrors.pv_cheque_no))}
                                            />
                                        </FormField>
                                        <FormField
                                            label="วันที่หน้าเช็ค"
                                            htmlFor="pv_cheque_date"
                                            error={fieldErrors.pv_cheque_date}
                                        >
                                            <input
                                                id="pv_cheque_date"
                                                type="date"
                                                value={chequeDate}
                                                onChange={(event) => setChequeDate(event.target.value)}
                                                className={inputClass(Boolean(fieldErrors.pv_cheque_date))}
                                            />
                                        </FormField>
                                    </>
                                )}
                                <FormField
                                    label={method === "transfer" ? "เลขอ้างอิงการโอน" : "รายละเอียดเพิ่มเติม"}
                                    htmlFor="pv_reference"
                                    error={fieldErrors.pv_reference}
                                >
                                    <input
                                        id="pv_reference"
                                        value={reference}
                                        onChange={(event) => setReference(event.target.value)}
                                        className={inputClass(Boolean(fieldErrors.pv_reference))}
                                    />
                                </FormField>
                                <FormField
                                    label="ค่าธรรมเนียมโอน"
                                    htmlFor="pv_fee_amount"
                                    hint={PAYMENT_MESSAGES.fee}
                                    error={fieldErrors.pv_fee_amount}
                                >
                                    <input
                                        id="pv_fee_amount"
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={fee}
                                        onChange={(event) => setFee(event.target.value)}
                                        className={`${inputClass(Boolean(fieldErrors.pv_fee_amount))} text-right`}
                                    />
                                </FormField>
                                {isForeign && (
                                    <FormField
                                        label="ยอดบาทที่ออกจากบัญชีจริง"
                                        htmlFor="pv_paid_thb"
                                        required
                                        hint={PAYMENT_MESSAGES.paidThb}
                                        error={fieldErrors.pv_paid_thb}
                                    >
                                        <input
                                            id="pv_paid_thb"
                                            inputMode="decimal"
                                            value={paidThb}
                                            onChange={(event) => setPaidThb(event.target.value)}
                                            className={`${inputClass(Boolean(fieldErrors.pv_paid_thb))} text-right`}
                                        />
                                    </FormField>
                                )}
                                {activeBranches.length > 1 && (
                                    <FormField
                                        label="สาขาที่จ่าย"
                                        htmlFor="pv_branch_id"
                                        required
                                        error={fieldErrors.pv_branch_id}
                                    >
                                        <select
                                            id="pv_branch_id"
                                            value={branchId}
                                            onChange={(event) => setBranchId(event.target.value)}
                                            className={inputClass(Boolean(fieldErrors.pv_branch_id))}
                                        >
                                            {activeBranches.map((branch) => (
                                                <option key={branch.branch_id} value={branch.branch_id}>
                                                    {branch.branch_code} · {branch.branch_name_th}
                                                </option>
                                            ))}
                                        </select>
                                    </FormField>
                                )}
                                <FormField
                                    label="หมายเหตุ"
                                    htmlFor="pv_notes"
                                    error={fieldErrors.pv_notes}
                                    className="sm:col-span-2"
                                >
                                    <textarea
                                        id="pv_notes"
                                        rows={2}
                                        value={notes}
                                        onChange={(event) => setNotes(event.target.value)}
                                        className={inputClass(Boolean(fieldErrors.pv_notes))}
                                    />
                                </FormField>
                            </div>
                        </SectionCard>

                        <SectionCard
                            icon={Percent}
                            title="หัก ณ ที่จ่าย"
                            description={calculation.groups.length > 0 ? PAYMENT_MESSAGES.withholding : undefined}
                        >
                            {calculation.groups.length === 0 ? (
                                <FieldHint>
                                    {payeeKind === "employee" || !payable?.wht_form
                                        ? PAYMENT_MESSAGES.noWithholding
                                        : "รายการที่เลือกไม่ได้ระบุประเภทเงินได้ · ไม่หัก"}
                                </FieldHint>
                            ) : (
                                <ul className="grid gap-3">
                                    {calculation.groups.map((group) => {
                                        const field = `wht.${group.incomeType}`;
                                        const typeName =
                                            rows.find((row) => row.ex_wht_income_type === group.incomeType)
                                                ?.wht_income_type_name ?? group.incomeType;
                                        return (
                                            <li
                                                key={group.incomeType}
                                                className="grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-end"
                                            >
                                                <div className="grid gap-0.5 text-sm">
                                                    <span className="font-medium text-gray-800">{typeName}</span>
                                                    <span className="text-xs text-gray-500 tabular-nums">
                                                        ฐาน (ก่อน VAT) {formatAmount(group.base, decimals)}
                                                        {group.rate
                                                            ? ` × ${Number(group.rate)}%`
                                                            : " · ยังไม่มีอัตรา"}{" "}
                                                        · เสนอ {formatAmount(group.suggested, decimals)}
                                                    </span>
                                                    {group.isBelowMinimum && (
                                                        <span className="text-xs text-amber-600">
                                                            ฐานต่ำกว่าเกณฑ์ {formatAmount(group.minPayment ?? "0")}{" "}
                                                            บาทต่อครั้ง · ระบบเสนอไม่หัก
                                                        </span>
                                                    )}
                                                </div>
                                                <FormField label="ยอดหัก" htmlFor={field} error={fieldErrors[field]}>
                                                    <input
                                                        id={field}
                                                        inputMode="decimal"
                                                        value={
                                                            withholdingEdits[group.incomeType] ??
                                                            formatAmount(group.suggested, decimals).replace(/,/g, "")
                                                        }
                                                        onChange={(event) =>
                                                            setWithholdingEdits((current) => ({
                                                                ...current,
                                                                [group.incomeType]: event.target.value,
                                                            }))
                                                        }
                                                        className={`${inputClass(Boolean(fieldErrors[field]))} text-right`}
                                                    />
                                                </FormField>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </SectionCard>
                    </>
                )}

                <SaveErrorBanner error={saveError} />
            </div>

            <aside
                className={`grid gap-2 p-5 text-sm lg:sticky lg:top-24 ${CARD_CLASS} max-lg:fixed max-lg:inset-x-4 max-lg:bottom-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:z-30 max-lg:gap-1.5 max-lg:p-3 max-lg:shadow-float`}
            >
                <h2 className="text-base font-medium text-gray-900 max-lg:hidden">สรุปการจ่าย</h2>
                <SummaryRow
                    label={`ตัดหนี้ ${chosenRows.length} รายการ`}
                    value={formatAmount(calculation.allocatedTotal, decimals)}
                    hideOnPhone
                />
                <SummaryRow
                    label="หัก ณ ที่จ่าย"
                    value={`−${formatAmount(calculation.withholdingTotal, decimals)}`}
                    hideOnPhone
                />
                <div className="flex items-baseline justify-between gap-3 font-medium text-gray-900 lg:border-t lg:border-gray-100 lg:pt-2 lg:text-base">
                    <span>จ่ายผู้รับสุทธิ</span>
                    <span className="tabular-nums">
                        {formatAmount(calculation.netPaid, decimals)} {currencyCode}
                    </span>
                </div>
                {toHundredths(fee) > 0n && (
                    <SummaryRow
                        label="รวมค่าธรรมเนียม เงินออก"
                        value={formatAmount(calculation.cashOut, decimals)}
                        hideOnPhone
                    />
                )}
                {payee?.payee_kind === "vendor" && (
                    <FieldHint>
                        <span className="max-lg:hidden">{PAYMENT_MESSAGES.payeeBank}</span>
                    </FieldHint>
                )}
                <button
                    type="button"
                    className={buttonClass("primary", "md", "w-full")}
                    disabled={chosenRows.length === 0}
                    onClick={handleReview}
                >
                    ทำจ่าย
                </button>
            </aside>

            {payee && isConfirmOpen && (
                <ConfirmDialog
                    open
                    variant="info"
                    title={`ยืนยันจ่าย ${payee.payee_name}?`}
                    description={PAYMENT_MESSAGES.confirm}
                    consequences={[
                        `จ่ายสุทธิ ${formatAmount(calculation.netPaid, decimals)} ${currencyCode} · ${METHOD_LABELS[method]} · วันที่ ${formatDateOnly(paymentDate)}`,
                        calculation.withholdingTotal > 0n
                            ? `หัก ณ ที่จ่าย ${formatAmount(calculation.withholdingTotal, decimals)} · ออก 50 ทวิ ให้ผู้รับ`
                            : "ไม่หัก ณ ที่จ่าย · ไม่ออก 50 ทวิ",
                        `ตัดยอดค้างจ่าย ${chosenRows.length} รายการ`,
                    ]}
                    confirmLabel="ยืนยันทำจ่าย"
                    loading={isSaving}
                    onConfirm={handleConfirm}
                    onCancel={() => setIsConfirmOpen(false)}
                />
            )}
            {!payee && selectedPayeeKey && !isLoadingPayable && (
                <StatusBanner tone="warn" title="ไม่พบผู้รับรายนี้ในรายการรอจ่าย">
                    อาจจ่ายครบไปแล้ว · เลือกผู้รับใหม่
                </StatusBanner>
            )}
        </div>
    );
}

function SummaryRow({ label, value, hideOnPhone = false }: { label: string; value: string; hideOnPhone?: boolean }) {
    return (
        <div className={`flex justify-between gap-3 text-gray-600 ${hideOnPhone ? "max-lg:hidden" : ""}`}>
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}
