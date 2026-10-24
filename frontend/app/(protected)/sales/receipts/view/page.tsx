"use client";

// หน้าเอกสารใบเสร็จรับเงิน (2026-10-15 ขั้น 1C-3) — ใบแจ้งหนี้ที่ตัด · สมการยอด · วิธีรับ · 50 ทวิ (แก้/แนบได้หลังออก)
// ส่วนต่างอัตรา (สกุลต่างประเทศ) · ยกเลิกพร้อมเหตุผล · ปุ่มที่ทำไม่ได้ซ่อน (ไม่ใช้ tooltip)
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Paperclip, Printer, Trash2, XCircle } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import PageHeader from "@/components/ui/page-header";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusPill from "@/components/ui/status-pill";
import FormField, { inputClass } from "@/components/ui/form-field";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, apiFetchBlob, type ApiError } from "@/lib/api";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import { METHOD_LABELS, RECEIPT_MESSAGES, STATUS_LABELS } from "../_messages";
import type { Receipt, ReceiptDetail } from "../_types";

export default function ReceiptViewPage() {
    const receiptId = useSearchParams().get("id");
    const [detail, setDetail] = useState<ReceiptDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!receiptId) return;
        const { data, error } = await apiFetch<ReceiptDetail>(`/receipts/${receiptId}`);
        setDetail(data);
        setLoadError(error);
    }, [receiptId]);

    useEffect(() => {
        if (!receiptId) return;
        let isLeftPage = false;
        apiFetch<ReceiptDetail>(`/receipts/${receiptId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [receiptId]);

    async function cancelReceipt(reason: string) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { error } = await apiFetch(`/receipts/${detail.receipt.rc_id}/cancel`, {
            method: "POST",
            body: { reason, rc_version: detail.receipt.rc_version },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success("ยกเลิกใบเสร็จแล้ว — ยอดค้างของใบแจ้งหนี้กลับมาแล้ว");
        setIsCancelOpen(false);
        await reload();
    }

    if (!receiptId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบเสร็จนี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบเสร็จไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { receipt, allocations, currency, actions } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[receipt.rc_status];
    const isForeign = code !== "THB";
    const hasWithholding = parseHundredths(receipt.rc_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const hasFee = parseHundredths(receipt.rc_fee_amount, "ค่าธรรมเนียม") > 0n;

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow={`ขาย · ใบเสร็จรับเงิน · ${receipt.rc_number}`}
                title={receipt.client_company || receipt.client_name}
                description={`${allocations.length} ใบแจ้งหนี้ · สาขา ${receipt.branch_code} ${receipt.branch_name_th}`}
                actions={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
            />

            <StatusGuide receipt={receipt} hasWithholding={hasWithholding} />

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/sales/receipts/print?id=${receipt.rc_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    พิมพ์ / บันทึก PDF
                </a>
                {actions.can_cancel && (
                    <button type="button" className={buttonClass("ghost", "md")} onClick={() => setIsCancelOpen(true)}>
                        <XCircle size={16} />
                        ยกเลิกใบเสร็จ
                    </button>
                )}
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-gray-500">วันที่รับเงิน</dt>
                            <dd>{formatDateOnly(receipt.rc_receipt_date)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">วิธีรับเงิน</dt>
                            <dd>{methodDetail(receipt)}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">สกุลเงิน / ภาษา</dt>
                            <dd>
                                {code} · {receipt.rc_language === "th" ? "ไทย" : "อังกฤษ"}
                            </dd>
                        </div>
                    </dl>

                    <AllocationList detail={detail} />

                    <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                        <TotalRow
                            label="ยอดรับชำระ (ตัดหนี้)"
                            value={formatAmount(receipt.rc_allocated_total, decimals)}
                        />
                        {hasWithholding && (
                            <TotalRow
                                label="หัก ณ ที่จ่าย"
                                value={`−${formatAmount(receipt.rc_wht_amount, decimals)}`}
                            />
                        )}
                        {hasFee && (
                            <TotalRow
                                label="ค่าธรรมเนียม"
                                value={`−${formatAmount(receipt.rc_fee_amount, decimals)}`}
                            />
                        )}
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                            <span>เงินเข้าจริง ({code})</span>
                            <span className="tabular-nums">{formatAmount(receipt.rc_received_amount, decimals)}</span>
                        </div>
                        {isForeign && (
                            <TotalRow label="เป็นเงินบาทที่เข้าบัญชี" value={formatAmount(receipt.rc_received_thb)} />
                        )}
                        <p className="text-xs text-gray-500">
                            ยอดรับชำระ: {amountInWords(receipt.rc_allocated_total, currency, receipt.rc_language)}
                        </p>
                    </div>

                    {receipt.rc_notes && (
                        <div className="grid gap-1 text-sm">
                            <h3 className="font-medium text-gray-900">หมายเหตุ</h3>
                            <p className="whitespace-pre-line text-gray-700">{receipt.rc_notes}</p>
                        </div>
                    )}
                </section>

                <div className="grid gap-5">
                    <WhtCertificateCard key={receipt.rc_version} detail={detail} onChanged={reload} />
                    {isForeign && <FxCard receipt={receipt} />}
                    {receipt.rc_billing_note_id && (
                        <section className={`grid gap-1 p-5 text-sm ${CARD_CLASS}`}>
                            <h2 className="text-base font-medium text-gray-900">เอกสารที่เกี่ยวข้อง</h2>
                            <p>
                                รับเงินตามใบวางบิล{" "}
                                <Link
                                    href={`/sales/billing-notes/view?id=${receipt.rc_billing_note_id}`}
                                    className="py-2 text-blue-600 hover:underline"
                                >
                                    {receipt.bn_number}
                                </Link>
                                {receipt.bn_status === "cancelled" ? " (ใบวางบิลถูกยกเลิกภายหลัง)" : ""}
                            </p>
                        </section>
                    )}
                </div>
            </div>

            {isCancelOpen && (
                <ReasonDialog
                    open
                    title="ยกเลิกใบเสร็จนี้?"
                    description={RECEIPT_MESSAGES.cancel}
                    reasonHint="เหตุผลจะแสดงบนใบและในประวัติ เช่น เช็คเด้ง / บันทึกยอดผิด"
                    confirmLabel="ยกเลิกใบเสร็จ"
                    tone="danger"
                    loading={isWorking}
                    errorMessage={actionError}
                    onConfirm={cancelReceipt}
                    onCancel={() => {
                        setIsCancelOpen(false);
                        setActionError(null);
                    }}
                />
            )}
        </div>
    );
}

function methodDetail(receipt: Receipt) {
    const bank = receipt.rc_bank_snapshot;
    const bankText = bank ? `${bank.ba_bank_name} ${bank.ba_account_no}` : "";
    switch (receipt.rc_method) {
        case "transfer":
            return `โอนเข้า ${bankText}${receipt.rc_reference ? ` · อ้างอิง ${receipt.rc_reference}` : ""}`;
        case "cheque":
            return `เช็ค ${receipt.rc_cheque_bank ?? ""} เลขที่ ${receipt.rc_cheque_no ?? ""} ลงวันที่ ${
                receipt.rc_cheque_date ? formatDateOnly(receipt.rc_cheque_date) : ""
            }${bankText ? ` · นำเข้า ${bankText}` : ""}`;
        case "cash":
            return "เงินสด";
        default:
            return `${METHOD_LABELS.other}${receipt.rc_reference ? ` · ${receipt.rc_reference}` : ""}`;
    }
}

function TotalRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-3 text-gray-600">
            <span>{label}</span>
            <span className="tabular-nums">{value}</span>
        </div>
    );
}

// ใบแจ้งหนี้ที่ตัด: มือถือเป็นก้อนต่อใบ · จอใหญ่เป็นตาราง · แสดงยอดค้างปัจจุบันของใบด้วย
function AllocationList({ detail }: { detail: ReceiptDetail }) {
    const { allocations, currency } = detail;
    const decimals = currency.cur_decimals;
    return (
        <>
            <ul className="grid text-sm sm:hidden">
                {allocations.map((row) => (
                    <li key={row.inv_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                            <Link
                                href={`/sales/invoices/view?id=${row.inv_id}`}
                                className="-my-2 py-2 font-medium text-blue-600 tabular-nums hover:underline"
                            >
                                {row.inv_number}
                            </Link>
                            <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                {formatAmount(row.rca_amount, decimals)}
                            </span>
                        </div>
                        <span className="wrap-break-word text-gray-700">{row.inv_title}</span>
                        <span className="text-xs text-gray-500">
                            ยอดใบ {formatAmount(row.inv_total, decimals)} · ค้างตอนนี้{" "}
                            {formatAmount(row.outstanding_amount, decimals)}
                        </span>
                    </li>
                ))}
            </ul>
            <div className="hidden sm:block">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                            <th className="py-2 pr-2 font-normal">ใบแจ้งหนี้</th>
                            <th className="py-2 pr-2 text-right font-normal">ยอดใบ</th>
                            <th className="py-2 pr-2 text-right font-normal">ค้างตอนนี้</th>
                            <th className="py-2 text-right font-normal">รับครั้งนี้</th>
                        </tr>
                    </thead>
                    <tbody>
                        {allocations.map((row) => (
                            <tr key={row.inv_id} className="border-b border-gray-100 align-top">
                                <td className="py-2 pr-2">
                                    <Link
                                        href={`/sales/invoices/view?id=${row.inv_id}`}
                                        className="text-blue-600 tabular-nums hover:underline"
                                    >
                                        {row.inv_number}
                                    </Link>
                                    <p className="text-xs text-gray-500">{row.inv_title}</p>
                                </td>
                                <td className="py-2 pr-2 text-right tabular-nums">
                                    {formatAmount(row.inv_total, decimals)}
                                </td>
                                <td className="py-2 pr-2 text-right tabular-nums">
                                    {formatAmount(row.outstanding_amount, decimals)}
                                </td>
                                <td className="py-2 text-right tabular-nums">
                                    {formatAmount(row.rca_amount, decimals)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

// 50 ทวิ: เลขที่/วันที่/บันทึกภายใน (แก้ได้หลังออก) + ไฟล์ (แนบ/เปลี่ยน/ลบ/เปิดผ่านระบบ)
function WhtCertificateCard({ detail, onChanged }: { detail: ReceiptDetail; onChanged: () => Promise<void> }) {
    const { receipt, actions, currency } = detail;
    const fileInput = useRef<HTMLInputElement>(null);
    const [certificateNo, setCertificateNo] = useState(receipt.rc_wht_certificate_no ?? "");
    const [certificateDate, setCertificateDate] = useState(receipt.rc_wht_certificate_date ?? "");
    const [internalNote, setInternalNote] = useState(receipt.rc_internal_note ?? "");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isRemoveOpen, setIsRemoveOpen] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const hasWithholding = parseHundredths(receipt.rc_wht_amount, "หัก ณ ที่จ่าย") > 0n;
    const isChanged =
        certificateNo !== (receipt.rc_wht_certificate_no ?? "") ||
        certificateDate !== (receipt.rc_wht_certificate_date ?? "") ||
        internalNote !== (receipt.rc_internal_note ?? "");

    async function saveDetails() {
        setIsSaving(true);
        const { error } = await apiFetch(`/receipts/${receipt.rc_id}`, {
            method: "PUT",
            body: {
                rc_wht_certificate_no: certificateNo,
                rc_wht_certificate_date: certificateDate,
                rc_internal_note: internalNote,
                rc_version: receipt.rc_version,
            },
        });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            toast.error(error.message);
            return;
        }
        setFieldErrors({});
        toast.success("บันทึกข้อมูล 50 ทวิ แล้ว");
        await onChanged();
    }

    async function uploadFile(file: File) {
        setFileError(null);
        setIsSaving(true);
        const form = new FormData();
        form.append("file", file);
        const { error } = await apiFetch(`/receipts/${receipt.rc_id}/wht-certificate/file`, {
            method: "POST",
            body: form,
        });
        setIsSaving(false);
        if (fileInput.current) fileInput.current.value = "";
        if (error) {
            setFileError(error.fields.file ?? error.message);
            return;
        }
        toast.success("แนบไฟล์ 50 ทวิ แล้ว");
        await onChanged();
    }

    async function removeFile() {
        setIsSaving(true);
        const { error } = await apiFetch(`/receipts/${receipt.rc_id}/wht-certificate/file`, { method: "DELETE" });
        setIsSaving(false);
        setIsRemoveOpen(false);
        if (error) {
            setFileError(error.message);
            return;
        }
        toast.success("ลบไฟล์ 50 ทวิ แล้ว");
        await onChanged();
    }

    // เปิดหน้าต่างก่อน (กันเบราว์เซอร์มือถือบล็อก popup ที่เปิดหลังรอโหลด) แล้วค่อยใส่ไฟล์ที่โหลดด้วย token
    async function openFile() {
        setFileError(null);
        const viewer = window.open("", "_blank");
        const blob = await apiFetchBlob(`/receipts/${receipt.rc_id}/wht-certificate/file`);
        if (!blob) {
            viewer?.close();
            setFileError("เปิดไฟล์ไม่สำเร็จ — ไฟล์อาจหายจากเซิร์ฟเวอร์ ลองแนบใหม่");
            return;
        }
        const url = URL.createObjectURL(blob);
        if (viewer) viewer.location.href = url;
        else window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    return (
        <section className={`grid gap-3 p-5 text-sm ${CARD_CLASS}`}>
            <div className="grid gap-0.5">
                <h2 className="text-base font-medium text-gray-900">หัก ณ ที่จ่าย (50 ทวิ)</h2>
                <p className="text-gray-600 tabular-nums">
                    {hasWithholding
                        ? `ลูกค้าหักไว้ ${formatAmount(receipt.rc_wht_amount, currency.cur_decimals)} ${currency.cur_code}`
                        : "ใบนี้ลูกค้าไม่ได้หัก ณ ที่จ่าย"}
                </p>
            </div>

            {actions.can_edit_details ? (
                <div className="grid gap-3">
                    <FormField
                        label="เลขที่ใน 50 ทวิ"
                        htmlFor="rc_wht_certificate_no"
                        error={fieldErrors.rc_wht_certificate_no}
                    >
                        <input
                            id="rc_wht_certificate_no"
                            value={certificateNo}
                            onChange={(event) => setCertificateNo(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.rc_wht_certificate_no))}
                        />
                    </FormField>
                    <FormField
                        label="วันที่ใน 50 ทวิ"
                        htmlFor="rc_wht_certificate_date"
                        error={fieldErrors.rc_wht_certificate_date}
                    >
                        <input
                            id="rc_wht_certificate_date"
                            type="date"
                            value={certificateDate}
                            onChange={(event) => setCertificateDate(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.rc_wht_certificate_date))}
                        />
                    </FormField>
                    <FormField
                        label="บันทึกภายใน"
                        htmlFor="rc_internal_note"
                        hint={RECEIPT_MESSAGES.internalNote}
                        error={fieldErrors.rc_internal_note}
                    >
                        <textarea
                            id="rc_internal_note"
                            rows={2}
                            value={internalNote}
                            onChange={(event) => setInternalNote(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.rc_internal_note))}
                        />
                    </FormField>
                    {isChanged && (
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={isSaving}
                            onClick={saveDetails}
                        >
                            บันทึก
                        </button>
                    )}
                </div>
            ) : (
                <dl className="grid gap-1">
                    <dt className="text-xs text-gray-500">เลขที่ / วันที่ใน 50 ทวิ</dt>
                    <dd>
                        {receipt.rc_wht_certificate_no ?? "—"}
                        {receipt.rc_wht_certificate_date ? ` · ${formatDateOnly(receipt.rc_wht_certificate_date)}` : ""}
                    </dd>
                    {receipt.rc_internal_note && (
                        <>
                            <dt className="text-xs text-gray-500">บันทึกภายใน</dt>
                            <dd className="whitespace-pre-line">{receipt.rc_internal_note}</dd>
                        </>
                    )}
                </dl>
            )}

            <div className="grid gap-2 rounded-xl bg-gray-50 p-3">
                {receipt.has_wht_file ? (
                    <button
                        type="button"
                        className="-my-2 flex items-center gap-2 py-2 text-left text-blue-600 hover:underline"
                        onClick={openFile}
                    >
                        <Paperclip size={16} className="shrink-0" />
                        <span className="min-w-0 wrap-break-word">{receipt.rc_wht_file_name}</span>
                    </button>
                ) : (
                    <p className="text-gray-500">ยังไม่ได้แนบไฟล์ 50 ทวิ</p>
                )}
                {receipt.rc_wht_file_uploaded_at && (
                    <p className="text-xs text-gray-500">แนบเมื่อ {formatDate(receipt.rc_wht_file_uploaded_at)}</p>
                )}
                {actions.can_manage_file && (
                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={fileInput}
                            type="file"
                            accept="application/pdf,image/jpeg,image/png"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) uploadFile(file);
                            }}
                        />
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={isSaving}
                            onClick={() => fileInput.current?.click()}
                        >
                            <FileUp size={14} />
                            {receipt.has_wht_file ? "เปลี่ยนไฟล์" : "แนบไฟล์"}
                        </button>
                        {receipt.has_wht_file && (
                            <button
                                type="button"
                                className={buttonClass("ghost", "sm")}
                                disabled={isSaving}
                                onClick={() => setIsRemoveOpen(true)}
                            >
                                <Trash2 size={14} />
                                ลบไฟล์
                            </button>
                        )}
                    </div>
                )}
                {fileError && <p className="text-xs text-red-600">{fileError}</p>}
                <FieldHint>{RECEIPT_MESSAGES.whtCertificate}</FieldHint>
            </div>

            <ConfirmDialog
                open={isRemoveOpen}
                title="ลบไฟล์ 50 ทวิ?"
                description="ไฟล์จะถูกลบจากเซิร์ฟเวอร์ · เลขที่และวันที่ใน 50 ทวิ ยังอยู่ แนบไฟล์ใหม่ได้ภายหลัง"
                confirmLabel="ลบไฟล์"
                loading={isSaving}
                onConfirm={removeFile}
                onCancel={() => setIsRemoveOpen(false)}
            />
        </section>
    );
}

// สกุลต่างประเทศ: อัตราจริง + ส่วนต่างอัตรา (ส่งนักบัญชี)
function FxCard({ receipt }: { receipt: Receipt }) {
    const difference = parseHundredths(receipt.rc_fx_diff_thb, "ส่วนต่าง");
    return (
        <section className={`grid gap-2 p-5 text-sm ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">อัตราแลกเปลี่ยน</h2>
            <TotalRow label="ยอดบาทตามอัตราใบแจ้งหนี้" value={formatAmount(receipt.rc_allocated_thb)} />
            <TotalRow
                label="อัตราที่ได้จริง"
                value={
                    receipt.rc_actual_rate
                        ? `${Number(receipt.rc_actual_rate).toFixed(4)} บาท/${receipt.rc_currency}`
                        : "—"
                }
            />
            <div className="flex justify-between gap-3 font-medium">
                <span>{difference >= 0n ? "กำไรจากอัตราแลกเปลี่ยน" : "ขาดทุนจากอัตราแลกเปลี่ยน"}</span>
                <span className={`tabular-nums ${difference >= 0n ? "text-green-600" : "text-red-600"}`}>
                    {formatAmount(receipt.rc_fx_diff_thb)} บาท
                </span>
            </div>
            <FieldHint>{RECEIPT_MESSAGES.fxDiff}</FieldHint>
        </section>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · ต้องทำอะไรต่อ
function StatusGuide({ receipt, hasWithholding }: { receipt: Receipt; hasWithholding: boolean }) {
    if (receipt.rc_status === "cancelled") {
        return (
            <StatusBanner tone="error" title="ยกเลิกแล้ว">
                เหตุผล: {receipt.rc_cancel_reason}
                {receipt.cancelled_by_name ? ` · โดย ${receipt.cancelled_by_name}` : ""}
                {receipt.rc_cancelled_at ? ` · ${formatDate(receipt.rc_cancelled_at)}` : ""} ·
                ยอดค้างของใบแจ้งหนี้กลับมาแล้ว เลขที่ยังคงอยู่
            </StatusBanner>
        );
    }
    if (hasWithholding && !receipt.has_wht_file) {
        return (
            <StatusBanner tone="warn" title="ออกแล้ว — ยังไม่ได้แนบ 50 ทวิ">
                ลูกค้าหัก ณ ที่จ่ายไว้ ขอใบ 50 ทวิ จากลูกค้าแล้วแนบที่ส่วน &quot;หัก ณ ที่จ่าย (50 ทวิ)&quot; —
                ใช้ตอนยื่นภาษีสิ้นปี
            </StatusBanner>
        );
    }
    return (
        <StatusBanner tone="done" title={`ออกแล้ว — รับเงินวันที่ ${formatDateOnly(receipt.rc_receipt_date)}`}>
            กด &quot;พิมพ์ / บันทึก PDF&quot; ส่งให้ลูกค้า
            {receipt.rc_created_by_name ? ` · ผู้รับเงิน ${receipt.rc_created_by_name}` : ""}
        </StatusBanner>
    );
}
