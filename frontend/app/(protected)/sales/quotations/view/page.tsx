"use client";

// หน้าเอกสารใบเสนอราคา (2026-10-13 ขั้น 1A-3) — สถานะ + สิ่งที่ทำได้ตอนนี้ (ปุ่มที่ทำไม่ได้ซ่อน พร้อมเหตุผลในแถบสถานะ)
// เนื้อหาเอกสาร · ความคืบหน้าอนุมัติ · revision ทั้งสาย
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
    CheckCircle2,
    Circle,
    Copy,
    GitBranch,
    Handshake,
    Pencil,
    Printer,
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
import StatusPill from "@/components/ui/status-pill";
import { CARD_CLASS } from "@/components/ui/card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, formatQuantity } from "@/lib/shared/money.mjs";
import { amountInWords } from "@/lib/shared/amount-in-words.mjs";
import ApprovalProgress from "../_components/approval-progress";
import QuotationBillingCard from "../../invoices/_components/quotation-billing-card";
import AcceptDialog, { type AcceptChoice } from "../_components/accept-dialog";
import { STATUS_LABELS } from "../_messages";
import { displayRate, documentNumberLabel } from "../_format";
import type { QuotationDetail } from "../_types";

type ReasonAction = "return" | "decline" | "cancel";
type ConfirmAction = "approve" | "submit" | "send" | "delete" | "revise" | "copy" | "accept";

const REASON_DIALOGS: Record<ReasonAction, { title: string; description: string; confirmLabel: string; hint: string }> =
    {
        return: {
            title: "ตีกลับให้ผู้สร้างแก้?",
            description: "ใบกลับเป็นร่าง ผู้สร้างแก้แล้วส่งใหม่ได้ · ส่งใหม่ต้องเริ่มอนุมัติชั้น 1 ใหม่",
            confirmLabel: "ตีกลับ",
            hint: "ผู้สร้างจะเห็นเหตุผลนี้บนใบ เช่น ราคาต่ำกว่าทุน ช่วยปรับส่วนลด",
        },
        decline: {
            title: "บันทึกว่าลูกค้าปฏิเสธ?",
            description: 'ใบจะเป็นสถานะ "ลูกค้าปฏิเสธ"ยังออก revision เสนอราคาใหม่ได้',
            confirmLabel: "บันทึกว่าปฏิเสธ",
            hint: "เช่น ราคาสูงกว่าที่อื่น · เลื่อนโครงการ · ใช้ดูสถิติการปิดการขายภายหลัง",
        },
        cancel: {
            title: "ยกเลิกใบเสนอราคานี้?",
            description: "เลขที่ยังคงอยู่ (ไม่นำกลับมาใช้) · ยกเลิกแล้วกู้คืนไม่ได้",
            confirmLabel: "ยกเลิกใบ",
            hint: "เหตุผลจะแสดงบนใบและในประวัติ",
        },
    };

export default function QuotationViewPage() {
    const router = useRouter();
    const quotationId = useSearchParams().get("id");
    const [detail, setDetail] = useState<QuotationDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
    const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    const reload = useCallback(async () => {
        if (!quotationId) return;
        const { data, error } = await apiFetch<QuotationDetail>(`/quotations/${quotationId}`);
        setDetail(data);
        setLoadError(error);
    }, [quotationId]);

    useEffect(() => {
        if (!quotationId) return;
        let isLeftPage = false;
        apiFetch<QuotationDetail>(`/quotations/${quotationId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [quotationId]);

    function closeDialogs() {
        setReasonAction(null);
        setConfirmAction(null);
        setActionError(null);
    }

    async function runAction(
        path: string,
        body: object,
        successMessage: string,
        options: { method?: "POST" | "DELETE"; navigateTo?: (data: { qt_id?: string }) => string } = {},
    ) {
        if (!detail) return;
        setIsWorking(true);
        setActionError(null);
        const { data, error } = await apiFetch<{ qt_id?: string; qt_number?: string }>(path, {
            method: options.method ?? "POST",
            body: { ...body, qt_version: detail.quotation.qt_version },
        });
        setIsWorking(false);
        if (error) {
            setActionError(error.message);
            return;
        }
        toast.success(successMessage);
        closeDialogs();
        if (options.navigateTo) {
            router.push(options.navigateTo(data ?? {}));
            return;
        }
        await reload();
    }

    if (!quotationId)
        return (
            <StatusBanner tone="error" title="ไม่พบใบเสนอราคานี้">
                กลับไปเลือกจากหน้ารายการ
            </StatusBanner>
        );
    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดใบเสนอราคาไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!detail) return <PageSkeleton />;

    const { quotation, currency, items, milestones, actions, approval, readiness, chain } = detail;
    const decimals = currency.cur_decimals;
    const code = currency.cur_code;
    const status = STATUS_LABELS[quotation.qt_status];
    const base = `/quotations/${quotation.qt_id}`;
    const isReady = readiness.every((check) => check.ok);
    const latestInChain = [...chain]
        .reverse()
        .find((row) => row.qt_status !== "draft" && row.qt_status !== "pending_approval");

    const approveDescription = approval?.canApprove
        ? `คุณกำลังอนุมัติชั้น ${approval.levels.join(" และชั้น ")}${approval.isFinal ? " (ชั้นสุดท้าย)" : ""}`
        : "";
    const approveConsequences = approval?.canApprove
        ? [
              approval.isFinal
                  ? "ใบเสนอราคาจะได้เลขที่และวันที่เอกสารเป็นวันนี้ แล้วแก้ไขไม่ได้อีก (แก้ได้ด้วยการออก revision)"
                  : (approval.stopReason ?? "ยังมีชั้นถัดไปต้องอนุมัติต่อ"),
          ]
        : [];

    const hasDecisionBar =
        actions.can_submit ||
        actions.can_approve ||
        actions.can_return ||
        actions.can_send ||
        actions.can_accept ||
        actions.can_decline;

    return (
        <div className={`grid w-full grid-cols-1 gap-6 ${hasDecisionBar ? "max-sm:pb-32" : ""}`}>
            <PageHeader
                eyebrow={`ขาย · ใบเสนอราคา · ${documentNumberLabel(quotation)}`}
                title={quotation.qt_title}
                description={`${quotation.client_name} · สาขา ${quotation.branch_code} ${quotation.branch_name_th}`}
                actions={<StatusPill tone={status.tone}>{status.label}</StatusPill>}
            />

            {detail.fastwork_internal && (
                <StatusBanner tone="info" title="เอกสารภายในของงาน Fastwork (ไม่ส่งลูกค้า)">
                    ใช้เป็นตัวเลขอ้างอิงตอนส่งราคาบน Fastwork · ส่งลูกค้า บันทึกตอบรับ และออกใบแจ้งหนี้จากใบนี้ไม่ได้ (เงินเข้าบันทึกที่หน้า Fastwork)
                    {detail.fastwork_internal.request_id && (
                        <>
                            {" · "}
                            <Link href={`/sales/service-requests/view?id=${detail.fastwork_internal.request_id}`} className="-my-2 inline-block py-2 text-blue-600 hover:underline">
                                รับงานจากคำขอ {detail.fastwork_internal.request_id}
                            </Link>
                        </>
                    )}
                </StatusBanner>
            )}
            {/* ใบภายใน: ข้อความขั้นส่งลูกค้า/รอลูกค้าตอบไม่ใช้ · ขั้นร่าง/อนุมัติ/ผูกงานยังใช้ */}
            {(!detail.fastwork_internal || ["draft", "pending_approval", "accepted", "cancelled"].includes(quotation.qt_status)) && <StatusGuide detail={detail} />}

            {quotation.qt_status === "draft" && (
                <section className={`grid gap-3 p-5 ${CARD_CLASS}`}>
                    <h2 className="text-base font-medium text-gray-900">ก่อนส่งขออนุมัติ</h2>
                    <ul className="grid gap-1.5 text-sm">
                        {readiness.map((check) => (
                            <li key={check.key} className="flex items-center gap-2">
                                {check.ok ? (
                                    <CheckCircle2 size={16} className="text-green-600" />
                                ) : (
                                    <Circle size={16} className="text-amber-600" />
                                )}
                                <span className={check.ok ? "text-gray-700" : "text-amber-600"}>{check.message}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="flex flex-wrap gap-2">
                <a
                    href={`/sales/quotations/print?id=${quotation.qt_id}`}
                    target="_blank"
                    rel="noopener"
                    className={buttonClass("secondary", "md")}
                >
                    <Printer size={16} />
                    {["draft", "pending_approval"].includes(quotation.qt_status)
                        ? "ดูตัวอย่างหน้าพิมพ์"
                        : "พิมพ์ / บันทึก PDF"}
                </a>
                {actions.can_edit && (
                    <Link
                        href={`/sales/quotations/edit?id=${quotation.qt_id}`}
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
                        ส่งขออนุมัติ
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
                {actions.can_send && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("send")}
                    >
                        <Send size={16} />
                        บันทึกว่าส่งลูกค้าแล้ว
                    </button>
                )}
                {actions.can_accept && (
                    <button
                        type="button"
                        className={`${buttonClass("primary", "md")} max-sm:hidden`}
                        onClick={() => setConfirmAction("accept")}
                    >
                        <Handshake size={16} />
                        ลูกค้าตอบรับ
                    </button>
                )}
                {actions.can_decline && (
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} max-sm:hidden`}
                        onClick={() => setReasonAction("decline")}
                    >
                        ลูกค้าปฏิเสธ
                    </button>
                )}
                {actions.can_revise && (
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={() => setConfirmAction("revise")}
                    >
                        <GitBranch size={16} />
                        ออก revision
                    </button>
                )}
                {actions.can_copy && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setConfirmAction("copy")}
                    >
                        <Copy size={16} />
                        คัดลอกเป็นใบใหม่
                    </button>
                )}
                {actions.can_cancel && (
                    <button
                        type="button"
                        className={buttonClass("ghost", "md")}
                        onClick={() => setReasonAction("cancel")}
                    >
                        <XCircle size={16} />
                        ยกเลิกใบ
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
            {hasDecisionBar && (
                <DecisionBar
                    total={`${formatAmount(quotation.qt_total, decimals)} ${code}`}
                    note={
                        actions.can_submit && !isReady ? 'ส่งได้เมื่อผ่านทุกข้อใน "ก่อนส่งขออนุมัติ" ด้านบน' : undefined
                    }
                >
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
                    {actions.can_submit && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            disabled={!isReady}
                            onClick={() => setConfirmAction("submit")}
                        >
                            <Send size={16} />
                            ส่งขออนุมัติ
                        </button>
                    )}
                    {actions.can_send && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("send")}
                        >
                            <Send size={16} />
                            บันทึกว่าส่งลูกค้าแล้ว
                        </button>
                    )}
                    {actions.can_decline && (
                        <button
                            type="button"
                            className={`${buttonClass("secondary", "md")} flex-1`}
                            onClick={() => setReasonAction("decline")}
                        >
                            ลูกค้าปฏิเสธ
                        </button>
                    )}
                    {actions.can_accept && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} flex-1`}
                            onClick={() => setConfirmAction("accept")}
                        >
                            <Handshake size={16} />
                            ลูกค้าตอบรับ
                        </button>
                    )}
                </DecisionBar>
            )}
            {actions.revise_blocked_reason && <p className="text-xs text-gray-500">{actions.revise_blocked_reason}</p>}
            {actions.can_submit && !isReady && (
                <p className="text-xs text-amber-600">
                    ส่งขออนุมัติได้เมื่อผ่านทุกข้อในรายการ &quot;ก่อนส่งขออนุมัติ&quot;
                </p>
            )}

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                <section className={`grid gap-5 p-5 sm:p-6 ${CARD_CLASS}`}>
                    <dl className="grid gap-3 text-sm sm:grid-cols-3">
                        <div>
                            <dt className="text-xs text-gray-500">วันที่เอกสาร</dt>
                            <dd>
                                {quotation.qt_issue_date
                                    ? formatDateOnly(quotation.qt_issue_date)
                                    : "ได้เมื่ออนุมัติครบ"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">ยืนราคาถึง</dt>
                            <dd>
                                {quotation.qt_valid_until
                                    ? formatDateOnly(quotation.qt_valid_until)
                                    : `${quotation.qt_valid_days} วันนับจากวันที่เอกสาร`}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-xs text-gray-500">สกุลเงิน / ภาษา</dt>
                            <dd>
                                {code} · {quotation.qt_language === "th" ? "ไทย" : "อังกฤษ"}
                            </dd>
                        </div>
                        {code !== "THB" && (
                            <div className="sm:col-span-3">
                                <dt className="text-xs text-gray-500">อัตราแลกเปลี่ยน</dt>
                                <dd>
                                    {displayRate(quotation.qt_exchange_rate)} บาท/{code} ·{" "}
                                    {quotation.qt_rate_source === "bot"
                                        ? `ธปท. วันที่ ${formatDateOnly(quotation.qt_rate_date)}`
                                        : `กรอกเอง · ${quotation.qt_rate_override_reason ?? ""}${quotation.qt_rate_bot ? ` (ธปท. ${displayRate(quotation.qt_rate_bot)})` : ""}`}
                                </dd>
                            </div>
                        )}
                    </dl>

                    {/* มือถือ: แถวละก้อน (ชื่อ / จำนวน × ราคา / ยอด) — ตารางเลื่อนข้างทำให้ราคาและยอดหลุดขอบจอโดยไม่รู้ตัว */}
                    <ul className="grid text-sm sm:hidden">
                        {items.map((item) =>
                            item.qti_type === "item" ? (
                                <li key={item.qti_id} className="grid gap-1 border-b border-gray-100 py-2.5">
                                    <span className="whitespace-pre-line text-gray-800">{item.qti_description}</span>
                                    <div className="flex items-end justify-between gap-3">
                                        <span className="text-xs text-gray-500 tabular-nums">
                                            {formatQuantity(item.qti_quantity ?? "0")} {item.qti_unit ?? ""} ×{" "}
                                            {formatAmount(item.qti_unit_price ?? "0", decimals)}
                                            {Number(item.qti_discount_amount) > 0 &&
                                                ` · ส่วนลด −${formatAmount(item.qti_discount_amount, decimals)}`}
                                        </span>
                                        <span className="shrink-0 font-medium text-gray-900 tabular-nums">
                                            {formatAmount(item.qti_amount, decimals)}
                                        </span>
                                    </div>
                                </li>
                            ) : (
                                <li
                                    key={item.qti_id}
                                    className={`border-b border-gray-100 py-2.5 whitespace-pre-line ${item.qti_type === "heading" ? "font-medium text-gray-900" : "text-gray-500 italic"}`}
                                >
                                    {item.qti_description}
                                </li>
                            ),
                        )}
                    </ul>

                    <div className="hidden sm:block">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                    <th className="py-2 pr-2 font-normal">รายการ</th>
                                    <th className="py-2 pr-2 text-right font-normal">จำนวน</th>
                                    <th className="py-2 pr-2 text-right font-normal">ราคาต่อหน่วย</th>
                                    <th className="py-2 pr-2 text-right font-normal">ส่วนลด</th>
                                    <th className="py-2 text-right font-normal">ยอด</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) =>
                                    item.qti_type === "item" ? (
                                        <tr key={item.qti_id} className="border-b border-gray-100 align-top">
                                            <td className="py-2 pr-2 whitespace-pre-line">{item.qti_description}</td>
                                            <td className="py-2 pr-2 text-right tabular-nums">
                                                {formatQuantity(item.qti_quantity ?? "0")} {item.qti_unit ?? ""}
                                            </td>
                                            <td className="py-2 pr-2 text-right tabular-nums">
                                                {formatAmount(item.qti_unit_price ?? "0", decimals)}
                                            </td>
                                            <td className="py-2 pr-2 text-right tabular-nums">
                                                {Number(item.qti_discount_amount) > 0
                                                    ? `−${formatAmount(item.qti_discount_amount, decimals)}`
                                                    : ""}
                                            </td>
                                            <td className="py-2 text-right tabular-nums">
                                                {formatAmount(item.qti_amount, decimals)}
                                            </td>
                                        </tr>
                                    ) : (
                                        <tr key={item.qti_id} className="border-b border-gray-100">
                                            <td
                                                colSpan={5}
                                                className={`py-2 whitespace-pre-line ${item.qti_type === "heading" ? "font-medium text-gray-900" : "text-gray-500 italic"}`}
                                            >
                                                {item.qti_description}
                                            </td>
                                        </tr>
                                    ),
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="ml-auto grid w-full max-w-sm gap-1.5 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>รวมเป็นเงิน</span>
                            <span className="tabular-nums">{formatAmount(quotation.qt_subtotal, decimals)}</span>
                        </div>
                        {Number(quotation.qt_discount_amount) > 0 && (
                            <div className="flex justify-between text-gray-600">
                                <span>ส่วนลดท้ายบิล</span>
                                <span className="tabular-nums">
                                    −{formatAmount(quotation.qt_discount_amount, decimals)}
                                </span>
                            </div>
                        )}
                        <div className="flex justify-between text-gray-600">
                            <span>VAT {Number(quotation.qt_vat_rate) > 0 ? `${quotation.qt_vat_rate}%` : ""}</span>
                            <span className="tabular-nums">
                                {Number(quotation.qt_vat_rate) > 0
                                    ? formatAmount(quotation.qt_vat_amount, decimals)
                                    : "ไม่คิด"}
                            </span>
                        </div>
                        <div className="flex justify-between border-t border-gray-100 pt-1.5 text-base font-medium text-gray-900">
                            <span>รวมทั้งสิ้น ({code})</span>
                            <span className="tabular-nums">{formatAmount(quotation.qt_total, decimals)}</span>
                        </div>
                        <p className="text-xs text-gray-500">
                            {amountInWords(quotation.qt_total, currency, quotation.qt_language)}
                        </p>
                        {code !== "THB" && (
                            <p className="text-xs text-gray-500">
                                เทียบเป็นบาท (ภายใน): {formatAmount(quotation.qt_total_thb)} บาท
                            </p>
                        )}
                    </div>

                    {quotation.qt_payment_mode === "milestones" && milestones.length > 0 && (
                        <div className="grid gap-1.5 text-sm">
                            <h3 className="font-medium text-gray-900">งวดชำระ</h3>
                            {milestones.map((milestone, index) => (
                                <div key={milestone.qtm_id} className="flex justify-between gap-3 text-gray-700">
                                    <span>
                                        งวดที่ {index + 1} {milestone.qtm_name}
                                        {milestone.qtm_percent ? ` (${milestone.qtm_percent}%)` : ""}
                                        {milestone.qtm_condition ? `${milestone.qtm_condition}` : ""}
                                    </span>
                                    <span className="tabular-nums">{formatAmount(milestone.qtm_amount, decimals)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    {quotation.qt_terms && (
                        <div className="grid gap-1 text-sm">
                            <h3 className="font-medium text-gray-900">เงื่อนไข</h3>
                            <p className="whitespace-pre-line text-gray-700">{quotation.qt_terms}</p>
                        </div>
                    )}
                    {quotation.qt_internal_note && (
                        <div className="grid gap-1 rounded-lg bg-gray-50 p-3 text-sm">
                            <h3 className="text-xs text-gray-500">บันทึกภายใน (ไม่พิมพ์บนเอกสาร)</h3>
                            <p className="whitespace-pre-line text-gray-700">{quotation.qt_internal_note}</p>
                        </div>
                    )}
                </section>

                <div className="grid gap-5">
                    {quotation.qt_status === "accepted" && (
                        <QuotationBillingCard quotationId={quotation.qt_id} currencyDecimals={decimals} />
                    )}
                    <ApprovalProgress quotation={quotation} history={detail.approval_history} />
                    {(chain.length > 1 || detail.copied_from) && (
                        <section className={`grid gap-2 p-5 text-sm ${CARD_CLASS}`}>
                            <h2 className="text-base font-medium text-gray-900">ฉบับอื่นที่เกี่ยวข้อง</h2>
                            {chain.length > 1 && (
                                <ul className="grid gap-1">
                                    {chain.map((row) => (
                                        <li key={row.qt_id} className="flex items-center justify-between gap-2">
                                            {row.qt_id === quotation.qt_id ? (
                                                <span className="font-medium text-gray-900">
                                                    Rev.{row.qt_revision} (ฉบับนี้)
                                                </span>
                                            ) : (
                                                <Link
                                                    href={`/sales/quotations/view?id=${row.qt_id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    Rev.{row.qt_revision}
                                                </Link>
                                            )}
                                            <StatusPill tone={STATUS_LABELS[row.qt_status].tone}>
                                                {STATUS_LABELS[row.qt_status].label}
                                            </StatusPill>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {detail.copied_from && (
                                <p className="text-gray-600">
                                    คัดลอกมาจาก{" "}
                                    <Link
                                        href={`/sales/quotations/view?id=${detail.copied_from.qt_id}`}
                                        className="text-blue-600 hover:underline"
                                    >
                                        {documentNumberLabel(detail.copied_from)}
                                    </Link>
                                </p>
                            )}
                            {quotation.qt_status === "superseded" && latestInChain && (
                                <p className="text-xs text-gray-500">
                                    ฉบับที่ใช้อยู่ตอนนี้คือ Rev.{latestInChain.qt_revision}
                                </p>
                            )}
                        </section>
                    )}
                </div>
            </div>

            <ConfirmDialog
                open={confirmAction === "approve"}
                variant="info"
                title="ยืนยันการอนุมัติ"
                description={approveDescription}
                consequences={approveConsequences}
                confirmLabel="อนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/approve`, {}, "อนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "submit"}
                variant="info"
                title="ส่งขออนุมัติ?"
                description="จำนวนชั้นที่ต้องผ่านคิดจากยอดก่อน VAT (เป็นบาท) · ระหว่างรออนุมัติแก้ไขไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)"
                consequences={[
                    "ล็อกอัตราแลกเปลี่ยนและคิด VAT ตามวันนี้",
                    "อัปเดตราคาตั้งต้นของสินค้าเป็นราคาล่าสุดเพื่อให้ผู้อนุมัติเทียบ",
                ]}
                confirmLabel="ส่งขออนุมัติ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/submit`, {}, "ส่งขออนุมัติแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "send"}
                variant="info"
                title="บันทึกว่าส่งให้ลูกค้าแล้ว?"
                description="ใช้หลังจากส่งเอกสาร (พิมพ์/PDF) ให้ลูกค้าเอง · ระบบบันทึกวันเวลาที่ส่ง"
                confirmLabel="บันทึก"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() => runAction(`${base}/send`, {}, "บันทึกว่าส่งลูกค้าแล้ว")}
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "revise"}
                variant="info"
                title="ออก revision ใหม่?"
                description={`ได้ร่าง ${quotation.qt_number ?? ""} Rev.ใหม่ คัดลอกรายการและงวดมาให้ แก้แล้วส่งขออนุมัติ · อนุมัติแล้วฉบับนี้จะเป็น "มีฉบับใหม่แทน"`}
                consequences={["อัตราแลกเปลี่ยนดึงใหม่ของวันนี้", "ยืนราคาถึงนับใหม่จากวันที่อนุมัติ revision"]}
                confirmLabel="ออก revision"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(`${base}/revise`, {}, "สร้างร่าง revision แล้ว", {
                        navigateTo: (data) => `/sales/quotations/edit?id=${data.qt_id}`,
                    })
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "copy"}
                variant="info"
                title="คัดลอกเป็นใบใหม่?"
                description="ได้ร่างใหม่ (ยังไม่มีเลขที่) คัดลอกรายการและงวดมาให้ · ใช้กับงานเพิ่มหลังตอบรับ หรือเสนอลูกค้ารายอื่น"
                confirmLabel="คัดลอก"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(`${base}/copy`, {}, "สร้างร่างใหม่แล้ว", {
                        navigateTo: (data) => `/sales/quotations/edit?id=${data.qt_id}`,
                    })
                }
                onCancel={closeDialogs}
            />
            <ConfirmDialog
                open={confirmAction === "delete"}
                title="ลบร่างนี้?"
                description="ร่างจะถูกลบถาวร (รายการและงวดด้วย)"
                confirmLabel="ลบ"
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={() =>
                    runAction(base, {}, "ลบร่างแล้ว", { method: "DELETE", navigateTo: () => "/sales/quotations" })
                }
                onCancel={closeDialogs}
            />
            <AcceptDialog
                open={confirmAction === "accept"}
                quotationId={quotation.qt_id}
                title={quotation.qt_title}
                loading={isWorking}
                errorMessage={actionError}
                onConfirm={(choice: AcceptChoice) => runAction(`${base}/accept`, choice, "บันทึกว่าลูกค้าตอบรับแล้ว")}
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
                    onConfirm={(reason) => runAction(`${base}/${reasonAction}`, { reason }, "บันทึกแล้ว")}
                    onCancel={closeDialogs}
                />
            )}
        </div>
    );
}

// แถบสถานะ: ตอนนี้เป็นอย่างไร · รออะไร/ใคร · ทำไมคุณทำไม่ได้ (แบบที่ 3 ของ ui-guidance)
// มือถือ: ปุ่มตัดสินใจหลัก (อนุมัติ/ตีกลับ/ส่ง/ตอบรับ) ลอยติดล่างจอพร้อมยอดรวม — เลื่อนดูรายการไปแล้วกดได้ทันที
// ไม่ต้องเลื่อนกลับขึ้นไปหาปุ่มด้านบน · จอ 640px ขึ้นไปไม่แสดง (ปุ่มอยู่แถวบนตามปกติ)
function DecisionBar({ total, note, children }: { total: string; note?: string; children: React.ReactNode }) {
    return (
        <div className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid gap-2 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-float backdrop-blur sm:hidden">
            <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-gray-500">รวมทั้งสิ้น</span>
                <span className="font-medium text-gray-900 tabular-nums">{total}</span>
            </div>
            <div className="flex gap-2">{children}</div>
            {note && <p className="text-xs text-amber-600">{note}</p>}
        </div>
    );
}

function StatusGuide({ detail }: { detail: QuotationDetail }) {
    const { quotation, approval } = detail;
    const plan = quotation.qt_approval_plan ?? [];
    const currentLevel = plan.find((level) => level.level === quotation.qt_approval_current_level);

    switch (quotation.qt_status) {
        case "draft":
            return (
                <StatusBanner
                    tone={quotation.qt_returned_reason ? "warn" : "info"}
                    title={
                        quotation.qt_returned_reason ? "ถูกตีกลับ · แก้แล้วส่งขออนุมัติใหม่" : "ร่าง · ยังไม่มีเลขที่"
                    }
                >
                    {quotation.qt_returned_reason
                        ? `เหตุผล: ${quotation.qt_returned_reason}`
                        : "แก้ได้ทุกช่อง · เลขที่และวันที่เอกสารได้เมื่ออนุมัติครบทุกชั้น"}
                </StatusBanner>
            );
        case "pending_approval":
            if (approval?.canApprove) {
                return (
                    <StatusBanner tone="wait" title={`รอคุณอนุมัติชั้น ${quotation.qt_approval_current_level}`}>
                        กดอนุมัติแล้วจะผ่านชั้น {approval.levels.join(", ")}
                        {approval.isFinal ? " ซึ่งเป็นชั้นสุดท้าย" : ` · ${approval.stopReason ?? ""}`}
                    </StatusBanner>
                );
            }
            return (
                <StatusBanner tone="wait" title={`รออนุมัติชั้น ${quotation.qt_approval_current_level}/${plan.length}`}>
                    ผู้อนุมัติชั้นนี้: {currentLevel?.roles.map((role) => role.role_name).join(", ")}
                    {approval?.reason ? ` · คุณอนุมัติไม่ได้: ${approval.reason}` : ""}
                </StatusBanner>
            );
        case "approved":
            return (
                <StatusBanner tone="done" title={`อนุมัติแล้วโดย ${quotation.qt_approved_by_name ?? "-"}`}>
                    กด &quot;พิมพ์ / บันทึก PDF&quot; ส่งให้ลูกค้า แล้วกด &quot;บันทึกว่าส่งลูกค้าแล้ว&quot; ·
                    ยืนราคาถึง {formatDateOnly(quotation.qt_valid_until)} · ลูกค้าตอบรับได้เลยโดยไม่ต้องกดส่งก่อน
                </StatusBanner>
            );
        case "sent":
            return (
                <StatusBanner tone="info" title="ส่งลูกค้าแล้ว · รอลูกค้าตอบ">
                    ยืนราคาถึง {formatDateOnly(quotation.qt_valid_until)} · เลยวันแล้วระบบเปลี่ยนเป็นหมดอายุให้เอง ·
                    ลูกค้าขอแก้ = ออก revision
                </StatusBanner>
            );
        case "accepted":
            return (
                <StatusBanner tone="done" title="ลูกค้าตอบรับแล้ว · ใบนี้ล็อกถาวร">
                    {quotation.qt_project_id ? (
                        <>
                            ผูกกับโปรเจกต์{" "}
                            <Link
                                href={`/projects/view?id=${quotation.qt_project_id}`}
                                className="py-2 text-blue-600 hover:underline"
                            >
                                {quotation.project_name}
                            </Link>{" "}
                            ·{" "}
                        </>
                    ) : (
                        "ไม่ได้ผูกโปรเจกต์ · "
                    )}
                    งานเพิ่ม/ลดภายหลังให้ใช้ &quot;คัดลอกเป็นใบใหม่&quot;
                </StatusBanner>
            );
        case "declined":
            return (
                <StatusBanner tone="error" title="ลูกค้าปฏิเสธ">
                    เหตุผล: {quotation.qt_decline_reason} · เสนอราคาใหม่ได้ด้วยการออก revision
                </StatusBanner>
            );
        case "expired":
            return (
                <StatusBanner tone="warn" title="หมดอายุ (เลยวันยืนราคา)">
                    ออก revision เพื่อเสนอราคาใหม่พร้อมวันยืนราคาใหม่
                </StatusBanner>
            );
        case "cancelled":
            return (
                <StatusBanner tone="error" title="ยกเลิกแล้ว">
                    เหตุผล: {quotation.qt_cancel_reason} · เลขที่ยังคงอยู่ ไม่นำกลับมาใช้
                </StatusBanner>
            );
        case "superseded":
            return (
                <StatusBanner tone="info" title="มี revision ใหม่แทนฉบับนี้แล้ว">
                    ฉบับนี้เก็บไว้เป็นประวัติ ใช้ฉบับล่าสุดแทน
                </StatusBanner>
            );
        default:
            return null;
    }
}
