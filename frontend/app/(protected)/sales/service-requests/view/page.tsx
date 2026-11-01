"use client";

// รายละเอียดคำขอบริการ (2026-10-25 · S-1 ดู · S-2 ความต้องการ · S-3 ตรวจ/ปรับ/ผูกลูกค้า/ยืนยัน/ปฏิเสธ)
// บนลงล่าง: สถานะ → ลูกค้า → สิ่งที่เลือก (ปรับได้) → ความต้องการ → ปุ่มยืนยัน/ปฏิเสธ
// ยืนยัน (ลูกค้าตรง): ติ๊ก "ออกใบเสนอราคา" (ค่าเริ่มต้น) = ร่างใบเสนอราคา · ไม่ติ๊ก = เปิดโปรเจกต์ + งานทันที
// คำขอจากลิงก์ Fastwork (S-5): ใบเสนอราคาภายใน → รับงานจากคำขอ / ลูกค้ายืนยันบน Fastwork (งานเดิม) · ปิดได้เมื่อผู้ซื้อไม่จ้าง
// ราคาเริ่มต้น (2026-11-01): แถวรอกรอกราคา → หน้าต่างตรวจราคาก่อนทุกปุ่มที่ส่งราคาออกไป · เปิดงานตรงแล้วราคาสูงขึ้น = ถามลูกค้าก่อน
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CircleCheck, ClipboardList, Contact, MessageSquareText, Pencil } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import ReasonDialog from "@/components/ui/reason-dialog";
import StatusPill from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, apiFetchBlob, type ApiError } from "@/lib/api";
import { formatAmount, formatQuantity } from "@/lib/shared/money.mjs";
import { lineAmount } from "@/lib/shared/order-cart-math.mjs";
import AnswersList from "@/app/order/_components/answers-list";
import type { RequestAnswer } from "@/app/order/_types";
import { openOrDownloadBlob } from "@/lib/open-blob";
import { LINK_KIND_LABEL, type ClientMatch, type FastworkPlan, type ServiceRequestItem, type ServiceRequestRow } from "../../order-links/_types";
import { requestStatusOf } from "../_status";
import ClientPanel from "../_components/client-panel";
import ItemsEditor from "../_components/items-editor";
import FastworkPanel from "../_components/fastwork-panel";
import PriceCheckSheet from "../_components/price-check-sheet";

type Totals = { subtotal: string; vat: string; total: string };
type Detail = {
    request: ServiceRequestRow;
    items: ServiceRequestItem[];
    totals: Totals;
    submitted_totals: Totals;
    answers: RequestAnswer[];
    client_matches: ClientMatch[];
    fastwork_plan: FastworkPlan | null;
    // ราคาเริ่มต้น: แถวที่ยังไม่ตรวจราคา · แถวของลูกค้าที่ราคาสูงขึ้นจากที่เห็นตอนเลือก
    price_pending_ids: number[];
    raised_price_ids: number[];
};

// ขั้นที่รอหน้าต่างตรวจราคา · stopIfRaised = เปิดงานตรง: ราคาสูงขึ้นหลังตรวจ ให้เลือกก่อนว่าจะถามลูกค้าไหม
type PendingAction = { nextLabel: string; stopIfRaised: boolean; run: (version: number) => Promise<void> | void };

export default function ServiceRequestViewPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <ServiceRequestView />
        </Suspense>
    );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
    if (!value) return null;
    return (
        <div className="grid gap-0.5">
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-sm wrap-break-word text-gray-900">{value}</dd>
        </div>
    );
}

function ServiceRequestView() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestId = searchParams.get("id") ?? "";
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageServiceRequests);
    const [detail, setDetail] = useState<Detail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [isEditingItems, setIsEditingItems] = useState(false);
    const [isChangingClient, setIsChangingClient] = useState(false);
    const [createQuotation, setCreateQuotation] = useState(true);
    const [askCustomerPrice, setAskCustomerPrice] = useState(true);
    const [priceSkipReason, setPriceSkipReason] = useState("");
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [finishing, setFinishing] = useState<"reject" | "close" | null>(null);
    const [finishError, setFinishError] = useState<string | null>(null);
    const [isFinishing, setIsFinishing] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<Detail>(`/service-requests/${encodeURIComponent(requestId)}`);
        setLoadError(error);
        if (data) setDetail(data);
    }, [requestId]);

    useEffect(() => {
        if (!canManage || !requestId) return;
        let isLeftPage = false;
        apiFetch<Detail>(`/service-requests/${encodeURIComponent(requestId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setDetail(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage, requestId]);

    const header = (
        <PageHeader
            eyebrow="คำขอบริการ"
            title={detail ? detail.request.svr_company_name || detail.request.client_name || detail.request.svr_contact_name || requestId : "คำขอบริการ"}
            description={detail ? `${detail.request.svr_id} · ส่งเมื่อ ${detail.request.svr_submitted_at}` : undefined}
            actions={
                <Link href="/sales/service-requests" className={buttonClass("secondary", "md")}>
                    ทุกคำขอ
                </Link>
            }
        />
    );
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการลิงก์เลือกบริการและคำขอบริการ" />
            </div>
        );
    }
    if (loadError || !requestId) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดคำขอไม่สำเร็จ">
                    {loadError?.message ?? "ไม่ได้ระบุคำขอ"}
                </StatusBanner>
            </div>
        );
    }
    if (!detail) return <PageSkeleton />;

    const { request, items, totals, submitted_totals: submittedTotals, answers, client_matches: clientMatches } = detail;
    const status = requestStatusOf(request);
    // รอลูกค้ายืนยันราคา: ทีมยังแก้รายการ/ราคา/ปฏิเสธได้ (แก้ = ลูกค้าต้องยืนยันใหม่) แต่ยืนยันซ้ำไม่ได้
    const isOpen = request.svr_status === "submitted" || request.svr_status === "awaiting_customer";
    const canConfirm = request.svr_status === "submitted";
    const pendingPriceRows = items.filter((row) => detail.price_pending_ids.includes(row.svi_id));
    const hasRaisedPrice = detail.raised_price_ids.length > 0;

    /** ปุ่มที่ส่งราคาออกไป: ยังมีแถวราคาเริ่มต้นที่ไม่ตรวจ = ถามในหน้าต่างก่อน แล้วทำต่อด้วยเวอร์ชันใหม่ */
    function withPriceCheck(action: PendingAction) {
        if (pendingPriceRows.length > 0) {
            setPendingAction(action);
            return;
        }
        void action.run(request.svr_version);
    }
    const isFastwork = request.ol_kind === "fastwork";
    const isAdjusted = totals.total !== submittedTotals.total || items.some((row) => row.svi_added_by_staff || row.svi_is_removed);

    async function bindClient(clientId: string) {
        const { data, error } = await apiFetch<Detail>(`/service-requests/${encodeURIComponent(requestId)}/client`, {
            method: "PUT",
            body: { svr_version: request.svr_version, client_id: clientId },
        });
        if (error) {
            toast.error(error.fields.client_id ?? error.message);
            if (error.status === 409) await load();
            return false;
        }
        toast.success("ผูกลูกค้าแล้ว");
        setDetail(data);
        setIsChangingClient(false);
        return true;
    }

    async function confirmRequest(withQuotation: boolean, version: number) {
        setActionError(null);
        setIsConfirming(true);
        const { data, error } = await apiFetch<{ qt_id?: string; project_id?: string; awaiting_customer?: boolean }>(
            `/service-requests/${encodeURIComponent(requestId)}/confirm`,
            {
                method: "POST",
                body: {
                    svr_version: version,
                    create_quotation: withQuotation,
                    ask_customer_price: askCustomerPrice,
                    price_skip_reason: askCustomerPrice ? null : priceSkipReason,
                },
            },
        );
        setIsConfirming(false);
        if (error) {
            setActionError(error.fields.client_id ?? error.fields.items ?? error.fields.price_skip_reason ?? error.message);
            if (error.status === 409) await load();
            return;
        }
        if (data.awaiting_customer) {
            toast.success("ส่งราคาใหม่ให้ลูกค้ายืนยันแล้ว · ลูกค้ากดยืนยันในหน้าสถานะคำขอ แล้วระบบเปิดโปรเจกต์ให้");
            await load();
            return;
        }
        if (data.qt_id) {
            toast.success(isFastwork ? "สร้างร่างใบเสนอราคาภายในแล้ว ตรวจงวดแล้วส่งอนุมัติ (ไม่ส่งลูกค้า)" : "สร้างร่างใบเสนอราคาแล้ว ตรวจงวดและเงื่อนไขแล้วส่งอนุมัติ");
            router.push(`/sales/quotations/edit?id=${data.qt_id}`);
            return;
        }
        toast.success("เปิดโปรเจกต์และสร้างงานแล้ว");
        router.push(`/projects/view?id=${data.project_id}`);
    }

    async function finish(reason: string) {
        if (!finishing) return;
        setIsFinishing(true);
        const { data, error } = await apiFetch<Detail>(`/service-requests/${encodeURIComponent(requestId)}/${finishing}`, {
            method: "POST",
            body: { svr_version: request.svr_version, reason },
        });
        setIsFinishing(false);
        if (error) {
            setFinishError(error.message);
            return;
        }
        setDetail(data);
        setFinishing(null);
        setFinishError(null);
        toast.success(finishing === "reject" ? "ปฏิเสธคำขอแล้ว" : "ปิดคำขอแล้ว");
    }

    async function openFile(file: RequestAnswer["files"][number]) {
        const blob = await apiFetchBlob(`/service-requests/${encodeURIComponent(requestId)}/files/${file.id}`);
        if (!blob) {
            toast.error("เปิดไฟล์ไม่สำเร็จ");
            return;
        }
        openOrDownloadBlob(blob, file.name, file.is_viewable);
    }

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
                <StatusPill tone="neutral">{LINK_KIND_LABEL[request.ol_kind]}</StatusPill>
                <span className="text-sm text-gray-600">ผู้รับ {request.assignee_name ?? "-"}</span>
            </div>
            {request.svr_status === "converted" && (!isFastwork || request.svr_project_id) && (
                <StatusBanner tone="done" title="ดำเนินการแล้ว">
                    {request.svr_quotation_id && !isFastwork ? (
                        <Link href={`/sales/quotations/view?id=${request.svr_quotation_id}`} className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                            เปิดใบเสนอราคา {request.qt_number ?? "(ร่าง)"}
                        </Link>
                    ) : request.svr_project_id ? (
                        <Link href={`/projects/view?id=${request.svr_project_id}`} className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                            เปิดโปรเจกต์ {request.project_name}
                        </Link>
                    ) : null}
                </StatusBanner>
            )}
            {request.svr_status === "awaiting_customer" && (
                <StatusBanner tone="wait" title="รอลูกค้ายืนยันราคาใหม่">
                    ลูกค้าเห็นราคาที่ปรับในหน้าสถานะคำขอ · กดยืนยันแล้วระบบเปิดโปรเจกต์ให้ · แก้ราคาตอนนี้ได้ (ลูกค้าต้องยืนยันใหม่)
                </StatusBanner>
            )}
            {request.svr_status === "submitted" && request.svr_price_response === "declined" && (
                <StatusBanner tone="warn" title="ลูกค้าไม่ตกลงราคาที่ปรับ">
                    {request.svr_price_response_note ? `ข้อความจากลูกค้า: ${request.svr_price_response_note} · ` : ""}
                    ติดต่อลูกค้าแล้วปรับราคา หรือเปิดงานโดยไม่ให้ลูกค้ายืนยัน (บอกเหตุผล)
                </StatusBanner>
            )}
            {request.svr_price_skip_reason && request.svr_status === "converted" && (
                <StatusBanner tone="info" title="เปิดงานโดยไม่ให้ลูกค้ายืนยันราคาใหม่">
                    เหตุผล: {request.svr_price_skip_reason}
                </StatusBanner>
            )}
            {(request.svr_status === "rejected" || request.svr_status === "closed") && (
                <StatusBanner tone="info" title={request.svr_status === "rejected" ? "ปฏิเสธแล้ว" : "ปิดแล้ว (ไม่ได้งาน)"}>
                    เหตุผล (ภายใน): {request.svr_status_reason ?? "-"} · ลูกค้าเห็นแค่ว่าทีมงานจะติดต่อกลับ
                </StatusBanner>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <SectionCard
                    title="ลูกค้า"
                    icon={Contact}
                    actions={
                        isOpen &&
                        request.svr_client_id &&
                        !isChangingClient && (
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIsChangingClient(true)}>
                                เปลี่ยน
                            </button>
                        )
                    }
                >
                    {request.client_name ? (
                        <p className="text-sm text-gray-900">
                            ผูกกับลูกค้า <span className="font-medium">{request.client_name}</span>
                        </p>
                    ) : (
                        isOpen &&
                        (isFastwork ? (
                            <FieldHint>ไม่บังคับ · ไม่ผูก = สร้างลูกค้าจากชื่อผู้ซื้อตอนออกใบภายในหรือรับงาน · ผูกลูกค้าเดิมถ้าเคยจ้างแล้ว</FieldHint>
                        ) : (
                            <StatusBanner tone="wait" title="ยังไม่ได้ผูกลูกค้า">
                                ผูกลูกค้าเดิมหรือสร้างใหม่ก่อนยืนยัน
                            </StatusBanner>
                        ))
                    )}
                    {isOpen && (!request.svr_client_id || isChangingClient) && <ClientPanel request={request} matches={clientMatches} onBind={bindClient} />}
                    <dl className="grid gap-3 border-t border-gray-100 pt-3 sm:grid-cols-2">
                        <InfoRow label={isFastwork ? "ชื่อผู้ซื้อบน Fastwork" : "ชื่อผู้ติดต่อ"} value={request.svr_contact_name} />
                        <InfoRow label="เบอร์โทร" value={request.svr_contact_phone} />
                        <InfoRow label="อีเมล" value={request.svr_contact_email} />
                        <InfoRow label="LINE ID" value={request.svr_contact_line} />
                        <InfoRow label="บริษัท/ร้าน" value={request.svr_company_name} />
                        <InfoRow label="เลขผู้เสียภาษี (ใบกำกับ)" value={request.svr_tax_id} />
                        <InfoRow label="ที่อยู่ (ใบกำกับ)" value={request.svr_address} />
                        <InfoRow label="ลิงก์" value={request.ol_name} />
                        <InfoRow label="ลิงก์ของงาน" value={request.link_project_name} />
                        <InfoRow label="ยินยอมข้อมูลส่วนบุคคล" value={request.svr_consent_at} />
                    </dl>
                    {request.svr_note && <p className="rounded-xl bg-gray-50 p-3 text-sm whitespace-pre-line text-gray-700">{request.svr_note}</p>}
                </SectionCard>

                <SectionCard
                    title="สิ่งที่เลือก"
                    icon={ClipboardList}
                    description={isAdjusted ? `ลูกค้าส่งมา ${formatAmount(submittedTotals.total)} บาท · ทีมงานปรับแล้ว` : "ราคา ณ วันที่ลูกค้าส่ง (แก้ราคาสินค้าทีหลังไม่กระทบ)"}
                    actions={
                        isOpen &&
                        !isEditingItems && (
                            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setIsEditingItems(true)}>
                                <Pencil size={15} />
                                ปรับรายการ
                            </button>
                        )
                    }
                >
                    {isEditingItems ? (
                        <ItemsEditor
                            requestId={requestId}
                            version={request.svr_version}
                            items={items}
                            vatRate={request.svr_vat_rate}
                            onCancel={() => setIsEditingItems(false)}
                            onSaved={async () => {
                                setIsEditingItems(false);
                                await load();
                            }}
                        />
                    ) : (
                        <>
                            <ul className="grid gap-1.5 text-sm">
                                {items.map((item) => {
                                    if (item.svi_type === "heading") {
                                        return (
                                            <li key={item.svi_id} className="pt-1 font-medium text-gray-900">
                                                {item.svi_name} × {formatQuantity(item.svi_quantity)} ชุด
                                            </li>
                                        );
                                    }
                                    // แถว %: ยอดตอนนี้คิดจากแถวอื่น (backend ส่ง percent_amount มา)
                                    const unitPrice = item.svi_percent ? (item.percent_amount ?? "0") : (item.svi_adjusted_unit_price ?? item.svi_unit_price ?? "0");
                                    const quantity = item.svi_percent ? "1" : (item.svi_adjusted_quantity ?? item.svi_quantity ?? "0");
                                    const isChanged = item.svi_adjusted_unit_price !== null || item.svi_adjusted_quantity !== null;
                                    return (
                                        <li key={item.svi_id} className={`flex items-baseline justify-between gap-3 ${item.svi_package_id ? "pl-3" : ""} ${item.svi_is_removed ? "text-gray-400 line-through" : item.svi_package_id ? "text-gray-600" : "text-gray-800"}`}>
                                            <span className="min-w-0 wrap-break-word">
                                                {item.svi_name}
                                                <span className="block text-xs text-gray-500 tabular-nums no-underline">
                                                    {item.svi_percent ? `+${Number(item.svi_percent)}% ของยอด` : `${formatAmount(unitPrice)} × ${formatQuantity(quantity)} ${item.svi_unit ?? ""}`}
                                                    {item.svi_is_preset && " · ทีมงานเลือกให้"}
                                                    {isChanged && ` · ลูกค้าเลือก ${formatAmount(item.svi_unit_price ?? "0")} × ${formatQuantity(item.svi_quantity)}`}
                                                    {item.svi_added_by_staff && " · เพิ่มโดยทีมงาน"}
                                                    {item.svi_is_removed && " · เอาออกแล้ว"}
                                                    {item.svi_needs_price && item.svi_price_confirmed_at && ` · ยืนยันราคาแล้ว (${item.price_confirmed_by_name ?? "-"})`}
                                                </span>
                                                {detail.price_pending_ids.includes(item.svi_id) && (
                                                    <span className="mt-1 flex flex-wrap items-center gap-1.5 no-underline">
                                                        <StatusPill tone="wait">รอกรอกราคา</StatusPill>
                                                        <span className="text-xs text-gray-500">
                                                            ราคาเริ่มต้น{item.price_note ? ` · ขึ้นกับ${item.price_note}` : ""}
                                                        </span>
                                                    </span>
                                                )}
                                            </span>
                                            <span className="shrink-0 tabular-nums">{item.svi_is_removed ? "-" : formatAmount(lineAmount(unitPrice, quantity))}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                            <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
                                <div className="flex justify-between gap-3 text-gray-700">
                                    <span>รวม</span>
                                    <span className="tabular-nums">{formatAmount(totals.subtotal)}</span>
                                </div>
                                {request.svr_vat_rate && (
                                    <div className="flex justify-between gap-3 text-gray-700">
                                        <span>+ VAT {Number(request.svr_vat_rate)}%</span>
                                        <span className="tabular-nums">{formatAmount(totals.vat)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5">
                                    <span className="font-medium text-gray-900">
                                        = {pendingPriceRows.length > 0 ? "ยอดเบื้องต้น" : isAdjusted ? "ยอดหลังปรับ" : "ยอดประมาณการ"}
                                    </span>
                                    <span className="text-base font-medium text-gray-900 tabular-nums">{formatAmount(totals.total)}</span>
                                </div>
                                <FieldHint>
                                    {pendingPriceRows.length > 0
                                        ? `มี ${pendingPriceRows.length} รายการราคาเริ่มต้น · ระบบถามราคาจริงก่อนสร้างใบหรือรับงาน (หรือแก้ราคาในปรับรายการ)`
                                        : isFastwork
                                          ? "ใช้ยอดนี้ส่งราคาบน Fastwork · ราคาที่ตกลงจริงบันทึกเป็นงวดงานตอนรับงาน"
                                          : "ราคาสุดท้ายยืนยันในใบเสนอราคา"}
                                </FieldHint>
                            </div>
                        </>
                    )}
                </SectionCard>
            </div>

            <SectionCard title="ความต้องการ" icon={MessageSquareText} description="คำถาม ณ วันที่ลูกค้าส่ง · ใช้ประกอบการออกแบบและประเมินราคา">
                {answers.length === 0 ? <p className="text-sm text-gray-500">คำขอนี้ไม่มีคำถาม</p> : <AnswersList answers={answers} onOpenFile={openFile} />}
            </SectionCard>

            {isFastwork && detail.fastwork_plan && (isOpen || (request.svr_status === "converted" && !request.svr_project_id)) && (
                <SectionCard title="งาน Fastwork" icon={CircleCheck}>
                    {actionError && (
                        <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                            {actionError}
                        </StatusBanner>
                    )}
                    <FastworkPanel
                        request={request}
                        plan={detail.fastwork_plan}
                        isEditingItems={isEditingItems}
                        isIssuing={isConfirming}
                        onIssueQuotation={() =>
                            withPriceCheck({ nextLabel: "ออกใบภายใน", stopIfRaised: false, run: (version) => confirmRequest(true, version) })
                        }
                        withPriceCheck={(nextLabel, run) => withPriceCheck({ nextLabel, stopIfRaised: false, run: () => run() })}
                        onClose={() => setFinishing("close")}
                        onAccepted={load}
                    />
                </SectionCard>
            )}

            {canConfirm && !isFastwork && (
                <SectionCard title="ยืนยันคำขอ" icon={CircleCheck}>
                    {actionError && (
                        <StatusBanner tone="error" title="ทำรายการไม่สำเร็จ">
                            {actionError}
                        </StatusBanner>
                    )}
                    <Switch
                        id="create_quotation"
                        label="ออกใบเสนอราคา"
                        description={
                            createQuotation
                                ? "สร้างร่างใบเสนอราคาจากยอดหลังปรับ (แบ่งงวด/เงื่อนไขต่อในหน้าใบเสนอราคา) → อนุมัติ → ส่ง → ลูกค้ายอมรับ → เปิดโปรเจกต์"
                                : "เปิดโปรเจกต์และสร้างงานจากรายการทันที · เก็บเงินด้วยใบแจ้งหนี้ที่สร้างเอง (ไม่มีงวดจากใบเสนอราคา)"
                        }
                        checked={createQuotation}
                        onChange={setCreateQuotation}
                    />
                    {!createQuotation && hasRaisedPrice && (
                        <div className="grid gap-3 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                            <Switch
                                id="ask_customer_price"
                                label="ให้ลูกค้ายืนยันราคาใหม่ก่อนเริ่มงาน"
                                description={
                                    askCustomerPrice
                                        ? "มีรายการที่ราคาสูงกว่าที่ลูกค้าเห็นตอนเลือก · ลูกค้ากดยืนยันในหน้าสถานะคำขอ แล้วระบบเปิดโปรเจกต์ให้"
                                        : "เปิดโปรเจกต์ทันที · บันทึกเหตุผลไว้ในคำขอ"
                                }
                                checked={askCustomerPrice}
                                onChange={setAskCustomerPrice}
                            />
                            {!askCustomerPrice && (
                                <FormField label="เหตุผลที่ไม่ให้ลูกค้ายืนยัน" htmlFor="price_skip_reason" required>
                                    <input
                                        id="price_skip_reason"
                                        value={priceSkipReason}
                                        maxLength={300}
                                        placeholder="เช่น ลูกค้าตกลงทางโทรศัพท์แล้ว"
                                        onChange={(event) => setPriceSkipReason(event.target.value)}
                                        className={inputClass(false)}
                                    />
                                </FormField>
                            )}
                        </div>
                    )}
                    {!request.svr_client_id && <FieldHint error="ผูกลูกค้าก่อนยืนยัน" />}
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={buttonClass("ghost", "md")} onClick={() => setFinishing("reject")}>
                            ปฏิเสธ
                        </button>
                        <button type="button" className={buttonClass("primary", "md")} disabled={!request.svr_client_id || isConfirming || isEditingItems} onClick={() =>
                                withPriceCheck({
                                    nextLabel: createQuotation ? "สร้างใบเสนอราคา" : "เปิดโปรเจกต์",
                                    stopIfRaised: !createQuotation,
                                    run: (version) => confirmRequest(createQuotation, version),
                                })
                            }
                        >
                            {isConfirming ? "กำลังดำเนินการ..." : createQuotation ? "ยืนยันและสร้างใบเสนอราคา" : "ยืนยันและเปิดโปรเจกต์"}
                        </button>
                    </div>
                </SectionCard>
            )}

            {pendingAction && (
                <PriceCheckSheet<Detail>
                    requestId={requestId}
                    version={request.svr_version}
                    rows={pendingPriceRows}
                    nextLabel={pendingAction.nextLabel}
                    onClose={() => setPendingAction(null)}
                    onConfirmed={async (updated) => {
                        setDetail(updated);
                        setPendingAction(null);
                        // เปิดงานตรงแล้วราคาสูงขึ้น: ให้ทีมเลือกก่อนว่าจะถามลูกค้าไหม (ช่องติ๊กขึ้นในส่วนยืนยันคำขอ)
                        if (pendingAction.stopIfRaised && updated.raised_price_ids.length > 0) {
                            toast.info("ราคาสูงกว่าที่ลูกค้าเห็น · เลือกว่าจะให้ลูกค้ายืนยันราคาใหม่ไหม แล้วกดยืนยันอีกครั้ง");
                            return;
                        }
                        await pendingAction.run(updated.request.svr_version);
                    }}
                />
            )}

            <ReasonDialog
                open={finishing !== null}
                title={finishing === "close" ? "ปิดคำขอนี้?" : "ปฏิเสธคำขอนี้?"}
                description="เหตุผลเป็นข้อมูลภายใน · ลูกค้าเห็นแค่ว่าทีมงานจะติดต่อกลับ"
                reasonLabel={finishing === "close" ? "เหตุผล (เช่น ผู้ซื้อไม่จ้าง)" : "เหตุผล (เช่น งบไม่พอ ไม่ใช่งานที่รับ)"}
                confirmLabel={finishing === "close" ? "ปิดคำขอ" : "ปฏิเสธ"}
                tone="danger"
                loading={isFinishing}
                errorMessage={finishError}
                onConfirm={finish}
                onCancel={() => {
                    setFinishing(null);
                    setFinishError(null);
                }}
            />
        </div>
    );
}
