"use client";

// หน้ารายการค่าใช้จ่าย / บิลผู้ขาย (2026-10-16 เฟส 2 ขั้น 2-2) — สถานะ + สิ่งที่ทำได้ตอนนี้ (ปุ่มที่ทำไม่ได้ซ่อน พร้อมเหตุผลในแถบสถานะ)
// รายการ · VAT/หัก ณ ที่จ่าย · ไฟล์แนบ (เปิดผ่าน API ที่ตรวจสิทธิ์) · การอนุมัติ · เตือนบิลที่อาจซ้ำ
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    CheckCircle2,
    Circle,
    Clock,
    Copy,
    FileUp,
    Paperclip,
    Pencil,
    Send,
    ShieldCheck,
    Trash2,
    Undo2,
    XCircle,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/ui/page-header";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, apiFetchBlob, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { displayRate } from "../../../sales/quotations/_format";
import { whtFormLabel } from "../../_messages";
import {
    DOC_TYPE_LABELS,
    EXPENSE_MESSAGES,
    STATUS_LABELS,
    expenseDueLabel,
    expenseNumberLabel,
    fileSizeLabel,
} from "../_messages";
import type { ExpenseAttachment, ExpenseDetail } from "../_types";

type ReasonAction = "return" | "cancel";
type ConfirmAction = "submit" | "approve" | "delete" | "copy";

const REASON_DIALOGS: Record<ReasonAction, { title: string; description: string; confirmLabel: string; hint: string }> =
    {
        return: {
            title: "ตีกลับให้ผู้บันทึกแก้?",
            description: "รายการกลับเป็นร่าง ผู้บันทึกแก้แล้วส่งใหม่ได้ · ส่งใหม่ต้องเริ่มอนุมัติชั้น 1 ใหม่",
            confirmLabel: "ตีกลับ",
            hint: "ผู้บันทึกจะเห็นเหตุผลนี้ เช่น VAT ไม่ตรงกับใบกำกับ",
        },
        cancel: {
            title: "ยกเลิกรายการนี้?",
            description:
                "เลขที่ยังคงอยู่ (ไม่นำกลับมาใช้) · ยกเลิกแล้วกู้คืนไม่ได้ · บิลใบนี้บันทึกใหม่ได้ (เลขเอกสารผู้ขายว่างแล้ว)",
            confirmLabel: "ยกเลิกรายการ",
            hint: "เหตุผลจะแสดงในประวัติ เช่น บันทึกผิดผู้ขาย",
        },
    };

export default function ExpenseViewPage() {
    const router = useRouter();
    const expenseId = useSearchParams().get("id");
    const [detail, setDetail] = useState<ExpenseDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!expenseId) return;
        const { data, error } = await apiFetch<ExpenseDetail>(`/expenses/${expenseId}`);
        setDetail(data);
        setLoadError(error);
    }, [expenseId]);

    useEffect(() => {
        if (!expenseId) return;
        let isLeftPage = false;
        apiFetch<ExpenseDetail>(`/expenses/${expenseId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [expenseId]);

    function closeDialogs() {
        setReasonAction(null);
        setConfirmAction(null);
        setActionError(null);
    }

    async function runAction(
        path: string,
        body: object,
        successMessage: (data: { ex_id?: string; auto_approved?: boolean; ex_number?: string | null }) => string,
        options: { method?: "POST" | "DELETE"; navigateTo?: (data: { ex_id?: string }) => string } = {},
    ) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { data, error } = await apiFetch<{ ex_id?: string; auto_approved?: boolean; ex_number?: string | null }>(
            path,
            { method: options.method ?? "POST", body: { ...body, ex_version: detail.expense.ex_version } },
        );
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success(successMessage(data ?? {}));
        closeDialogs();
        if (options.navigateTo) {
            router.push(options.navigateTo(data ?? {}));
            return;
        }
        await reload();
    }

    if (!expenseId)
        return (
            <StatusBanner tone="error" title="ไม่พบรายการนี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดรายการไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { expense, currency, actions, approval, readiness, checks } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[expense.ex_status];
    const base = `/expenses/${expense.ex_id}`;
    const isReady = readiness.every((check) => check.ok);
    const hasWithholding = parseHundredths(expense.ex_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const hasVat = parseHundredths(expense.ex_vat_amount, "VAT") > 0n;
    const due = expenseDueLabel(expense);

    const hasDecisionBar = actions.can_submit || actions.can_approve || actions.can_return;
    // แถบปุ่มลอยบนมือถือ: ปุ่มเกิน 1 ปุ่มขึ้นสองแถว — เว้นที่ท้ายหน้ามากขึ้นตาม
    const decisionCount = [actions.can_submit, actions.can_approve, actions.can_return].filter(Boolean).length;
    const paymentPill =
        expense.payment_state === "paid"
            ? { tone: "success" as const, label: "จ่ายแล้ว" }
            : expense.payment_state === "partial"
              ? { tone: "wait" as const, label: "จ่ายบางส่วน" }
              : null;

    return (
        <div
            className={`mx-auto grid max-w-6xl grid-cols-1 gap-6 ${decisionCount > 1 ? "max-sm:pb-48" : hasDecisionBar ? "max-sm:pb-32" : ""}`}
        >
            <PageHeader
                eyebrow={`จัดซื้อ · ค่าใช้จ่าย · ${expenseNumberLabel(expense)}`}
                title={expense.ex_title}
                description={`${expense.vd_name ?? "—"} · สาขา ${expense.branch_code} ${expense.branch_name_th}`}
                actions={
                    <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        {expense.ex_auto_approved && <StatusPill tone="neutral">ผ่านอัตโนมัติ</StatusPill>}
                        {paymentPill && <StatusPill tone={paymentPill.tone}>{paymentPill.label}</StatusPill>}
                        {due && <StatusPill tone={expense.is_overdue ? "danger" : "neutral"}>{due}</StatusPill>}
                    </div>
                }
            />

            <StatusGuide detail={detail} />

            {detail.possible_duplicates.length > 0 && (
                <StatusBanner tone="warn" title="อาจบันทึกบิลใบนี้ซ้ำ">
                    ผู้ขาย วันที่ และยอดรวมตรงกับ{" "}
                    {detail.possible_duplicates.map((row, index) => (
                        <span key={row.ex_id}>
                            {index > 0 ? ", " : ""}
                            <Link
                                href={`/purchasing/expenses/view?id=${row.ex_id}`}
                                className="text-blue-600 hover:underline"
                            >
                                {row.ex_number ?? `ร่าง "${row.ex_title}"`}
                            </Link>
                        </span>
                    ))}{" "}
                    — ตรวจว่าไม่ใช่บิลเดียวกัน (ใส่เลขที่เอกสารของผู้ขายเพื่อให้ระบบกันซ้ำได้)
                </StatusBanner>
            )}

            {expense.ex_status === "draft" && (
                <section className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">ก่อนส่ง</h2>
                    <ul className="grid gap-1.5 text-sm">
                        {readiness.map((check) => (
                            <li key={check.key} className="flex items-center gap-2">
                                {check.ok ? (
                                    <CheckCircle2 size={16} className="shrink-0 text-green-600" />
                                ) : (
                                    <Circle size={16} className="shrink-0 text-amber-600" />
                                )}
                                <span className={check.ok ? "text-gray-700" : "text-amber-600"}>{check.message}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap gap-2">
                {actions.can_edit && (
                    <Link
                        href={`/purchasing/expenses/edit?id=${expense.ex_id}`}
                        className={buttonClass("secondary", "md")}
                    >
                        <Pencil size={16} />
                        แก้ไขร่าง
                    </Link>
                )}
                {actions.can_submit && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        disabled={!isReady}
                        onClick={() => setConfirmAction("submit")}
                    >
                        <Send size={16} />
                        ส่ง
                    </button>
                )}
                {actions.can_approve && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("approve")}
                    >
                        <ShieldCheck size={16} />
                        อนุมัติ
                    </button>
                )}
                {actions.can_return && (
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} max-sm:hidden`}
                        onClick={() => setReasonAction("return")}
                    >
                        <Undo2 size={16} />
                        ตีกลับ
                    </button>
                )}
                {actions.can_copy && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setConfirmAction("copy")}
                    >
                        <Copy size={16} />
                        คัดลอกเป็นรายการใหม่
                    </button>
                )}
                {actions.can_cancel && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setReasonAction("cancel")}
                    >
                        <XCircle size={16} />
                        ยกเลิกรายการ
                    </button>
                )}
                {actions.can_delete && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setConfirmAction("delete")}
                    >
                        <Trash2 size={16} />
                        ลบร่าง
                    </button>
                )}
            </div>
            {actions.cancel_blocked_reason && <FieldHint>{actions.cancel_blocked_reason}</FieldHint>}
            {actions.can_submit && !isReady && (
                <p className="text-xs text-amber-600">ส่งได้เมื่อผ่านทุกข้อในรายการ &quot;ก่อนส่ง&quot;</p>
            )}

            {hasDecisionBar && (
                <DecisionBar label="รวมทั้งสิ้น" total={`${formatAmount(expense.ex_total, decimals)} ${code}`}>
                    {actions.can_submit && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            disabled={!isReady}
                            onClick={() => setConfirmAction("submit")}
                        >
                            <Send size={16} />
                            ส่ง
                        </button>
                    )}
                    {actions.can_return && (
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} flex-1`}
                            onClick={() => setReasonAction("return")}
                        >
                            <Undo2 size={16} />
                            ตีกลับ
                        </button>
                    )}
                    {actions.can_approve && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("approve")}
                        >
                            <ShieldCheck size={16} />
                            อนุมัติ
                        </button>
                    )}
                </DecisionBar>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-gray-500">วันที่ค่าใช้จ่าย</dt>
                            <dd>{formatDateOnly(expense.ex_expense_date)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">ครบกำหนดจ่าย</dt>
                            <dd className={expense.is_overdue ? "text-red-600" : undefined}>
                                {formatDateOnly(expense.ex_due_date)} ({expense.ex_credit_days} วัน)
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">เอกสารของผู้ขาย</dt>
                            <dd>
                                {DOC_TYPE_LABELS[expense.ex_doc_type]}
                                {expense.ex_vendor_doc_no ? ` ${expense.ex_vendor_doc_no}` : ""}
                                {expense.ex_vendor_doc_date ? ` · ${formatDateOnly(expense.ex_vendor_doc_date)}` : ""}
                            </dd>
                        </div>
                        {expense.ex_currency !== "THB" && (
                            <div className="sm:col-span-3">
                                <dt className="text-xs text-gray-500">อัตราแลกเปลี่ยน (ใช้คิดยอดบาท)</dt>
                                <dd>
                                    {displayRate(expense.ex_exchange_rate)} บาท/{code} (
                                    {expense.ex_rate_source === "bot"
                                        ? `ธปท. ${formatDateOnly(expense.ex_rate_date)}`
                                        : `กรอกเอง — ${expense.ex_rate_override_reason ?? ""}`}
                                    )
                                </dd>
                            </div>
                        )}
                    </dl>

                    <ul className="grid divide-y divide-gray-100 border-y border-gray-100">
                        {detail.lines.map((line) => (
                            <li
                                key={line.exl_id}
                                className="grid gap-1 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4"
                            >
                                <div className="grid min-w-0 gap-0.5">
                                    <span className="text-gray-900">{line.exl_description}</span>
                                    <span className="text-xs text-gray-500">
                                        {line.category_name} ·{" "}
                                        {line.project_name ? `โปรเจกต์ ${line.project_name}` : "ส่วนกลาง"}
                                        {line.ec_is_asset ? " · ทรัพย์สิน" : ""}
                                    </span>
                                </div>
                                <div className="grid text-right tabular-nums max-sm:text-left">
                                    <span className="text-gray-900">{formatAmount(line.exl_amount, decimals)}</span>
                                    {Number(line.exl_quantity) !== 1 && (
                                        <span className="text-xs text-gray-500">
                                            {Number(line.exl_quantity)} × {formatAmount(line.exl_unit_price, decimals)}
                                        </span>
                                    )}
                                </div>
                            </li>
                        ))}
                        {detail.lines.length === 0 && <li className="py-3 text-sm text-gray-500">ยังไม่มีรายการ</li>}
                    </ul>

                    <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                        <TotalRow label="ยอดก่อน VAT" value={formatAmount(expense.ex_subtotal, decimals)} />
                        <TotalRow
                            label={hasVat ? `VAT ${Number(expense.ex_vat_rate)}%` : "VAT"}
                            value={hasVat ? formatAmount(expense.ex_vat_amount, decimals) : "ไม่มี"}
                        />
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                            <span>รวมทั้งสิ้น ({code})</span>
                            <span className="tabular-nums">{formatAmount(expense.ex_total, decimals)}</span>
                        </div>
                        {hasVat && (
                            <FieldHint>
                                {expense.ex_vat_claimable ? EXPENSE_MESSAGES.vatClaimable : EXPENSE_MESSAGES.vat}
                            </FieldHint>
                        )}
                        {checks.is_vat_different && (
                            <p className="text-xs text-amber-600">
                                VAT ต่างจาก {Number(checks.official_vat_rate)}% ของยอดก่อน VAT (
                                {formatAmount(checks.suggested_vat, decimals)}) เกิน 1 — ตรวจกับเอกสารผู้ขาย
                            </p>
                        )}
                        {hasWithholding && (
                            <>
                                <TotalRow
                                    label={`หัก ณ ที่จ่าย ${Number(expense.ex_wht_rate)}% (ประมาณ)`}
                                    value={`−${formatAmount(expense.ex_wht_amount, decimals)}`}
                                />
                                <div className="flex justify-between font-medium text-gray-900">
                                    <span>จ่ายผู้ขายสุทธิ (ประมาณ)</span>
                                    <span className="tabular-nums">{formatAmount(checks.net_payable, decimals)}</span>
                                </div>
                                <FieldHint>
                                    {expense.wht_income_type_name} · {whtFormLabel(expense.wht_form)} · หักจริงตอนทำจ่าย
                                </FieldHint>
                            </>
                        )}
                        {!hasWithholding && checks.is_below_wht_minimum && (
                            <FieldHint>
                                ยอดต่ำกว่าเกณฑ์หัก ณ ที่จ่าย {formatAmount(checks.wht_min_payment ?? "0")} บาท — ไม่หัก
                            </FieldHint>
                        )}
                        {expense.ex_currency !== "THB" && (
                            <p className="text-xs text-gray-500">
                                เทียบเป็นบาท: {formatAmount(expense.ex_total_thb)} บาท
                            </p>
                        )}
                        {expense.ex_status === "approved" && (
                            <TotalRow
                                label="ค้างจ่าย"
                                value={`${formatAmount(expense.outstanding_amount, decimals)} ${code}`}
                            />
                        )}
                    </div>

                    {expense.ex_notes && (
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm">
                            <h3 className="text-xs text-gray-500">หมายเหตุภายใน</h3>
                            <p className="whitespace-pre-line text-gray-700">{expense.ex_notes}</p>
                        </div>
                    )}
                    <p className="text-xs text-gray-500">
                        บันทึกโดย {expense.ex_created_by_name ?? "—"} · {formatDate(expense.ex_created_at)}
                    </p>
                </section>

                <div className="grid gap-5">
                    <AttachmentsCard detail={detail} onChanged={reload} />
                    <ApprovalProgress detail={detail} />
                    <VendorCard detail={detail} />
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction === "submit"}
                variant="info"
                title="ส่งรายการนี้?"
                description={EXPENSE_MESSAGES.approval}
                consequences={[
                    "ส่งแล้วแก้ไขไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)",
                    "ผ่านการอนุมัติแล้วได้เลข EX และเข้ารายการรอจ่าย",
                ]}
                confirmLabel="ส่ง"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(`${base}/submit`, {}, (data) =>
                        data.auto_approved ? `ผ่านอัตโนมัติ ได้เลข ${data.ex_number}` : "ส่งขออนุมัติแล้ว",
                    )
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "approve"}
                variant="info"
                title="ยืนยันการอนุมัติ"
                description={
                    approval?.canApprove
                        ? `คุณกำลังอนุมัติชั้น ${approval.levels.join(" และชั้น ")}${approval.isFinal ? " (ชั้นสุดท้าย)" : ""}`
                        : ""
                }
                consequences={
                    approval?.canApprove
                        ? [
                              approval.isFinal
                                  ? "อนุมัติชั้นสุดท้าย = ได้เลข EX และเข้ารายการรอจ่ายทันที"
                                  : (approval.stopReason ?? "ยังมีชั้นถัดไปต้องอนุมัติต่อ"),
                          ]
                        : []
                }
                confirmLabel="อนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/approve`, {}, () => "อนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "copy"}
                variant="info"
                title="คัดลอกเป็นรายการใหม่?"
                description={EXPENSE_MESSAGES.copy}
                confirmLabel="คัดลอก"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(`${base}/copy`, {}, () => "สร้างร่างใหม่แล้ว — ใส่เลขเอกสารของบิลใหม่", {
                        navigateTo: (data) => `/purchasing/expenses/edit?id=${data.ex_id}`,
                    })
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "delete"}
                title="ลบร่างนี้?"
                description="ร่างจะถูกลบถาวร (รายการและไฟล์แนบด้วย)"
                confirmLabel="ลบ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(base, {}, () => "ลบร่างแล้ว", {
                        method: "DELETE",
                        navigateTo: () => "/purchasing/expenses",
                    })
                }
                onCancel={closeDialogs}
            />
            {reasonAction && (
                <ReasonDialog
                    open
                    title={REASON_DIALOGS[reasonAction].title}
                    description={REASON_DIALOGS[reasonAction].description}
                    reasonHint={REASON_DIALOGS[reasonAction].hint}
                    confirmLabel={REASON_DIALOGS[reasonAction].confirmLabel}
                    tone={reasonAction === "return" ? "primary" : "danger"}
                    loading={isWorking}
                    errorMessage={actionError}
                    onConfirm={(reason) => runAction(`${base}/${reasonAction}`, { reason }, () => "บันทึกแล้ว")}
                    onCancel={closeDialogs}
                />
            )}
        </div>
    );
}

function TotalRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

// ไฟล์แนบ: เปิดผ่าน API ที่ตรวจสิทธิ์ (ไม่มีลิงก์สาธารณะ) · แนบเพิ่มได้จนกว่าจะยกเลิก · ลบได้เฉพาะตอนเป็นร่าง
function AttachmentsCard({ detail, onChanged }: { detail: ExpenseDetail; onChanged: () => Promise<void> }) {
    const { expense, attachments, actions } = detail;
    const fileInput = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [removing, setRemoving] = useState<ExpenseAttachment | null>(null);
    const [isRemoving, setIsRemoving] = useState(false);

    async function uploadFiles(files: FileList | null) {
        if (!files || files.length === 0) return;
        setFileError(null);
        setIsUploading(true);
        let uploaded = 0;
        for (const file of Array.from(files)) {
            const body = new FormData();
            body.append("file", file);
            const { error } = await apiFetch(`/expenses/${expense.ex_id}/attachments`, { method: "POST", body });
            if (error) {
                setFileError(`${file.name}: ${error.fields.file ?? error.message}`);
                break;
            }
            uploaded += 1;
        }
        setIsUploading(false);
        if (fileInput.current) fileInput.current.value = "";
        if (uploaded > 0) toast.success(`แนบไฟล์แล้ว ${uploaded} ไฟล์`);
        await onChanged();
    }

    // เปิดหน้าต่างก่อน (กันเบราว์เซอร์มือถือบล็อก popup ที่เปิดหลังรอโหลด) แล้วค่อยใส่ไฟล์ที่โหลดด้วย token
    async function openFile(attachment: ExpenseAttachment) {
        setFileError(null);
        const viewer = window.open("", "_blank");
        const blob = await apiFetchBlob(`/expenses/${expense.ex_id}/attachments/${attachment.exf_id}`);
        if (!blob) {
            viewer?.close();
            setFileError("เปิดไฟล์ไม่สำเร็จ — ไฟล์อาจหายจากเซิร์ฟเวอร์ ลองแนบใหม่");
            return;
        }
        const url = URL.createObjectURL(blob);
        if (viewer) viewer.location.href = url;
        else window.location.assign(url);
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    async function removeFile() {
        if (!removing) return;
        setIsRemoving(true);
        const { error } = await apiFetch(`/expenses/${expense.ex_id}/attachments/${removing.exf_id}`, {
            method: "DELETE",
        });
        setIsRemoving(false);
        setRemoving(null);
        if (error) {
            setFileError(error.message);
            return;
        }
        toast.success("ลบไฟล์แล้ว");
        await onChanged();
    }

    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">ไฟล์แนบ ({attachments.length})</h2>
            {attachments.length === 0 ? (
                <p className="text-gray-500">ยังไม่ได้แนบใบเสร็จ/ใบกำกับของผู้ขาย</p>
            ) : (
                <ul className="grid gap-2">
                    {attachments.map((attachment) => (
                        <li
                            key={attachment.exf_id}
                            className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 p-2"
                        >
                            <button
                                type="button"
                                className="-my-1 flex min-w-0 items-start gap-2 py-1 text-left text-blue-600 hover:underline"
                                onClick={() => openFile(attachment)}
                            >
                                <Paperclip size={16} className="mt-0.5 shrink-0" />
                                <span className="grid min-w-0">
                                    <span className="wrap-break-word">{attachment.exf_file_name}</span>
                                    <span className="text-xs text-gray-500">
                                        {fileSizeLabel(attachment.exf_file_size)} ·{" "}
                                        {formatDate(attachment.exf_uploaded_at)}
                                    </span>
                                </span>
                            </button>
                            {actions.can_remove_attachment && (
                                <button
                                    type="button"
                                    aria-label={`ลบ ${attachment.exf_file_name}`}
                                    className={buttonClass("ghost", "sm")}
                                    onClick={() => setRemoving(attachment)}
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {actions.can_attach && (
                <>
                    <input
                        ref={fileInput}
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png"
                        className="hidden"
                        onChange={(event) => uploadFiles(event.target.files)}
                    />
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "sm")} justify-self-start`}
                        disabled={isUploading}
                        onClick={() => fileInput.current?.click()}
                    >
                        <FileUp size={14} />
                        {isUploading ? "กำลังอัปโหลด..." : "แนบไฟล์ / ถ่ายรูป"}
                    </button>
                </>
            )}
            {fileError && <p className="text-xs text-red-600">{fileError}</p>}
            <FieldHint>{EXPENSE_MESSAGES.attachments}</FieldHint>

            <ConfirmDialog
                open={removing !== null}
                title="ลบไฟล์แนบนี้?"
                description={removing?.exf_file_name ?? ""}
                confirmLabel="ลบ"
                loading={isRemoving}
                onConfirm={removeFile}
                onCancel={() => setRemoving(null)}
            />
        </section>
    );
}

// ความคืบหน้าอนุมัติ (รอบปัจจุบัน) + ประวัติทุกรอบ
function ApprovalProgress({ detail }: { detail: ExpenseDetail }) {
    const { expense, approval_history: history } = detail;
    const plan = expense.ex_approval_plan ?? [];
    const thisRound = history.filter(
        (row) => row.expa_round === expense.ex_approval_round && row.expa_action === "approve",
    );
    const showPlan = plan.length > 0 && expense.ex_status !== "draft";

    if (expense.ex_auto_approved) {
        return (
            <section className={`grid gap-2 p-5 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
                <p className="text-sm text-gray-600">
                    ผ่านอัตโนมัติ — ยอดก่อน VAT ต่ำกว่าวงเงินที่ต้องอนุมัติ
                    {expense.ex_approved_at ? ` · ${formatDate(expense.ex_approved_at)}` : ""}
                </p>
            </section>
        );
    }
    if (!showPlan && history.length === 0) {
        return (
            <section className={`grid gap-2 p-5 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
                <p className="text-sm text-gray-500">{EXPENSE_MESSAGES.approval}</p>
            </section>
        );
    }

    return (
        <section className={`grid gap-4 p-5 ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
            {showPlan && (
                <ol className="grid gap-2">
                    {plan.map((level) => {
                        const approved = thisRound.find((row) => row.expa_level === level.level);
                        const isWaiting =
                            expense.ex_status === "pending_approval" &&
                            expense.ex_approval_current_level === level.level;
                        const Icon = approved ? CheckCircle2 : isWaiting ? Clock : Circle;
                        const tone = approved ? "text-green-600" : isWaiting ? "text-amber-600" : "text-gray-300";
                        return (
                            <li key={level.level} className="flex items-start gap-3">
                                <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
                                <div className="grid gap-0.5 text-sm">
                                    <span className="text-gray-800">
                                        ชั้น {level.level} · {level.roles.map((role) => role.role_name).join(", ")}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {approved
                                            ? `อนุมัติโดย ${approved.expa_user_name} · ${formatDate(approved.expa_created_at)}`
                                            : isWaiting
                                              ? "รออนุมัติชั้นนี้"
                                              : "—"}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {history.length > 0 && (
                <details className="text-sm">
                    <summary className="-my-2 cursor-pointer py-2 text-blue-600">
                        ประวัติการอนุมัติทุกรอบ ({history.length})
                    </summary>
                    <ul className="mt-2 grid gap-2">
                        {history.map((row) => (
                            <li key={row.expa_id} className="grid gap-0.5 rounded-lg bg-gray-50 p-2">
                                <span className="text-gray-800">
                                    รอบ {row.expa_round} · ชั้น {row.expa_level} ·{" "}
                                    {row.expa_action === "approve" ? "อนุมัติ" : "ตีกลับ"} โดย {row.expa_user_name}
                                </span>
                                {row.expa_reason && (
                                    <span className="text-xs text-gray-600">เหตุผล: {row.expa_reason}</span>
                                )}
                                <span className="text-xs text-gray-500">{formatDate(row.expa_created_at)}</span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}

function VendorCard({ detail }: { detail: ExpenseDetail }) {
    const { expense } = detail;
    if (!expense.ex_vendor_id) return null;
    return (
        <section className={`grid gap-1 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">ผู้ขาย</h2>
            <p className="text-gray-800">
                {expense.vd_name}
                {expense.vd_status === "inactive" ? " (ปิดใช้งานแล้ว)" : ""}
            </p>
            {expense.vd_tax_id && (
                <p className="text-xs text-gray-500">
                    เลขผู้เสียภาษี {expense.vd_tax_id}
                    {expense.vd_branch_code
                        ? expense.vd_branch_code === "00000"
                            ? " · สำนักงานใหญ่"
                            : ` · สาขา ${expense.vd_branch_code}`
                        : ""}
                </p>
            )}
            <p className="text-xs text-gray-500">{whtFormLabel(expense.wht_form)}</p>
        </section>
    );
}

// มือถือ: ปุ่มตัดสินใจหลักลอยติดล่างจอพร้อมยอดรวม (แบบเดียวกับหน้าใบแจ้งหนี้)
function DecisionBar({ label, total, children }: { label: string; total: string; children: React.ReactNode }) {
    return (
        <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:hidden">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-500">{label}</span>
                <span className="font-medium text-gray-900 tabular-nums">{total}</span>
            </div>
            <div className="flex flex-wrap gap-2 *:basis-44">{children}</div>
        </div>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · รออะไร/ใคร · ต้องทำอะไรต่อ (แบบที่ 3 ของ ui-guidance)
function StatusGuide({ detail }: { detail: ExpenseDetail }) {
    const { expense, approval } = detail;
    const plan = expense.ex_approval_plan ?? [];
    const currentLevel = plan.find((level) => level.level === expense.ex_approval_current_level);

    switch (expense.ex_status) {
        case "draft":
            if (expense.ex_returned_reason) {
                return (
                    <StatusBanner tone="warn" title="ถูกตีกลับ — แก้แล้วส่งใหม่">
                        เหตุผล: {expense.ex_returned_reason}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="info" title="ร่าง — ยังไม่มีเลขที่">
                    แก้ได้ทุกช่อง · {EXPENSE_MESSAGES.approval}
                </StatusBanner>
            );
        case "pending_approval":
            if (approval?.canApprove) {
                return (
                    <StatusBanner tone="wait" title={`รอคุณอนุมัติชั้น ${expense.ex_approval_current_level}`}>
                        กดอนุมัติแล้วจะผ่านชั้น {approval.levels.join(", ")}
                        {approval.isFinal
                            ? " ซึ่งเป็นชั้นสุดท้าย — ได้เลข EX และเข้ารายการรอจ่าย"
                            : ` · ${approval.stopReason ?? ""}`}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="wait" title={`รออนุมัติชั้น ${expense.ex_approval_current_level}/${plan.length}`}>
                    ผู้อนุมัติชั้นนี้: {currentLevel?.roles.map((role) => role.role_name).join(", ")}
                    {approval?.reason ? ` · คุณอนุมัติไม่ได้: ${approval.reason}` : ""}
                </StatusBanner>
            );
        case "approved":
            if (expense.payment_state === "paid") {
                return (
                    <StatusBanner tone="done" title="จ่ายครบแล้ว">
                        ยกเลิกรายการนี้ไม่ได้จนกว่าจะยกเลิกใบสำคัญจ่าย
                    </StatusBanner>
                );
            }
            if (expense.is_overdue) {
                return (
                    <StatusBanner tone="error" title={`เกินกำหนดจ่าย ${expense.days_overdue} วัน`}>
                        ครบกำหนดวันที่ {formatDateOnly(expense.ex_due_date)} · ค้างจ่าย{" "}
                        {formatAmount(expense.outstanding_amount, detail.currency.cur_decimals)} {expense.ex_currency}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner
                    tone="done"
                    title={`อนุมัติแล้ว — รอจ่าย ครบกำหนด ${formatDateOnly(expense.ex_due_date)}`}
                >
                    อยู่ในรายการรอจ่าย (เมนูทำจ่ายเปิดใช้ในรอบถัดไป) · แก้ไขไม่ได้แล้ว ถ้าผิดให้ยกเลิกแล้วบันทึกใหม่
                </StatusBanner>
            );
        case "cancelled":
            return (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {expense.ex_cancel_reason}
                    {expense.cancelled_by_name ? ` · โดย ${expense.cancelled_by_name}` : ""} · เลขที่ยังคงอยู่
                    ไม่นำกลับมาใช้
                </StatusBanner>
            );
        default:
            return null;
    }
}
