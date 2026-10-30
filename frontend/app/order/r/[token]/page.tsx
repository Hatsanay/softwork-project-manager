"use client";

// หน้าสถานะคำขอของลูกค้า /order/r/<token> (2026-10-25 · S-1, S-4) — ขั้นของงาน ใบเสนอราคา (ยอมรับได้ในหน้านี้)
// สิ่งที่ส่ง และความต้องการที่แจ้งไว้ · ไม่มีข้อมูลภายใน
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowDown, Check, CircleAlert, CircleCheck, Clock, ExternalLink, FileText, MessageCircle, SearchX, XCircle } from "lucide-react";
import { CustomerLoading, CustomerNotice, CustomerSection } from "@/components/customer/customer-shell";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FormField, { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import { lineAmount } from "@/lib/shared/order-cart-math.mjs";
import { orderAcceptSchema } from "@/lib/shared/schemas/order-link.mjs";
import type { ApiError } from "@/lib/api";
import OrderShell from "../../_components/order-shell";
import AnswersList from "../../_components/answers-list";
import QuotationSummary from "../../_components/quotation-summary";
import ItemGroupList, { type ItemGroup } from "../../_components/item-groups";
import { publicFetch } from "../../_public-api";
import type { RequestStage, RequestStatusResponse } from "../../_types";

const STAGE: Record<RequestStage, { title: string; body: string; Icon: typeof Clock; tone: string }> = {
    submitted: { title: "ส่งคำขอแล้ว รอทีมงานตรวจ", body: "ทีมงานจะตรวจรายการและติดต่อกลับเพื่อยืนยันรายละเอียดและราคา", Icon: Clock, tone: "bg-blue-50 text-blue-600" },
    preparing: { title: "ทีมงานกำลังทำใบเสนอราคา", body: "เมื่อใบเสนอราคาพร้อม จะแสดงในหน้านี้ให้ตรวจและกดยอมรับได้เลย", Icon: FileText, tone: "bg-blue-50 text-blue-600" },
    quotation: { title: "ใบเสนอราคาพร้อมแล้ว", body: "ตรวจรายการและยอดด้านล่าง ถ้าตกลงกดยอมรับท้ายใบได้เลย", Icon: FileText, tone: "bg-blue-50 text-blue-600" },
    accepted: { title: "ยอมรับใบเสนอราคาแล้ว", body: "ทีมงานเปิดงานให้แล้ว และจะติดต่อเรื่องการเริ่มงานและการชำระเงิน", Icon: CircleCheck, tone: "bg-green-50 text-green-600" },
    started: { title: "ทีมงานรับงานแล้ว", body: "ทีมงานเปิดงานให้แล้ว และจะติดต่อเรื่องรายละเอียดการเริ่มงาน", Icon: CircleCheck, tone: "bg-green-50 text-green-600" },
    fastwork_confirmed: { title: "ทีมงานรับเรื่องแล้ว", body: "ทีมงานจะส่งข้อเสนอและราคาในแชต Fastwork", Icon: CircleCheck, tone: "bg-green-50 text-green-600" },
    expired: { title: "ใบเสนอราคาหมดอายุแล้ว", body: "ทีมงานจะติดต่อกลับเพื่อออกใบใหม่ หรือแจ้งทีมงานได้เลย", Icon: CircleAlert, tone: "bg-gray-100 text-gray-600" },
    contact: { title: "ทีมงานจะติดต่อกลับ", body: "ทีมงานจะติดต่อเพื่อคุยรายละเอียดเพิ่มเติม", Icon: MessageCircle, tone: "bg-gray-100 text-gray-600" },
    closed: { title: "ปิดคำขอแล้ว", body: "ขอบคุณที่สนใจ หากต้องการเริ่มงานใหม่ ติดต่อทีมงานได้ตลอด", Icon: XCircle, tone: "bg-gray-100 text-gray-600" },
};

/**
 * เส้นทางของคำขอ (ลูกค้าเห็นว่าตอนนี้อยู่ขั้นไหน และต่อไปจะเกิดอะไร)
 * ลูกค้าตรงแบบออกใบ: ส่งคำขอ → ทีมทำใบเสนอราคา → คุณยอมรับ → เริ่มงาน
 * ทีมเปิดงานทันที (ไม่ออกใบ): ส่งคำขอ → ทีมงานตรวจ → เริ่มงาน · Fastwork: ส่งคำขอ → ทีมงานตรวจ → ตกลงราคาบน Fastwork
 * ปฏิเสธ/ปิด = ไม่แสดงเส้นทาง (บอกในหัวแทน)
 */
function journeyOf(stage: RequestStage, isFastwork: boolean, hasQuotation: boolean): { steps: string[]; current: number } | null {
    if (stage === "contact" || stage === "closed") return null;
    if (isFastwork) return { steps: ["ส่งคำขอ", "ทีมงานตรวจ", "ตกลงราคาบน Fastwork"], current: stage === "submitted" ? 1 : 2 };
    if (stage === "started" || (!hasQuotation && stage !== "submitted" && stage !== "preparing")) {
        return { steps: ["ส่งคำขอ", "ทีมงานตรวจ", "เริ่มงาน"], current: 3 };
    }
    const current = { submitted: 1, preparing: 1, quotation: 2, expired: 2, accepted: 3 }[stage as "submitted"] ?? 1;
    return { steps: ["ส่งคำขอ", "ทำใบเสนอราคา", "คุณยอมรับ", "เริ่มงาน"], current };
}

function JourneySteps({ steps, current }: { steps: string[]; current: number }) {
    return (
        <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="ขั้นตอนของคำขอ">
            {steps.map((label, index) => {
                const isDone = index < current;
                const isCurrent = index === current;
                return (
                    <li key={label} className="grid gap-1.5" aria-current={isCurrent ? "step" : undefined}>
                        <span className={`h-1.5 rounded-full ${isDone ? "bg-blue-600" : isCurrent ? "bg-blue-400 motion-safe:animate-pulse" : "bg-gray-200"}`} aria-hidden="true" />
                        <span className={`flex items-start gap-1 text-xs leading-snug ${isDone || isCurrent ? "text-gray-900" : "text-gray-500"}`}>
                            {isDone && <Check size={13} className="mt-px shrink-0" aria-hidden="true" />}
                            <span className={isCurrent ? "font-medium" : undefined}>{label}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

export default function OrderStatusPage() {
    const params = useParams<{ token: string }>();
    const token = params.token;
    const [data, setData] = useState<RequestStatusResponse | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const load = useCallback(async () => {
        const { data: loaded, error } = await publicFetch<RequestStatusResponse>(`/order/requests/${token}`);
        setLoadError(error);
        if (loaded) setData(loaded);
    }, [token]);

    useEffect(() => {
        let isLeftPage = false;
        publicFetch<RequestStatusResponse>(`/order/requests/${token}`).then(({ data: loaded, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (loaded) setData(loaded);
        });
        return () => {
            isLeftPage = true;
        };
    }, [token]);

    if (loadError && !data) {
        return (
            <OrderShell shop={null} subtitle="สถานะคำขอ">
                <CustomerNotice icon={SearchX} title="ไม่พบคำขอนี้">
                    {loadError.message}
                </CustomerNotice>
            </OrderShell>
        );
    }
    if (!data) return <CustomerLoading label="กำลังโหลดสถานะคำขอ..." />;

    const progress = data.progress;
    const stage = STAGE[progress.stage];
    const isFastwork = data.request.kind === "fastwork";
    const quotation = progress.quotation;
    const journey = journeyOf(progress.stage, isFastwork, Boolean(quotation));
    // เลขลำดับส่วนของหน้า (01, 02…) ตามที่มีจริง
    const sectionIndex = { quotation: quotation ? 1 : undefined, sent: quotation ? 2 : 1, answers: quotation ? 3 : 2 };

    return (
        <OrderShell shop={data.shop} subtitle="สถานะคำขอ">
            <section className="surface-hero grid gap-5 p-[clamp(1.25rem,0.9rem+1.6vw,2.25rem)]">
                <div className="flex items-start gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl shadow-card ring-4 ring-white ${stage.tone}`}>
                        <stage.Icon size={24} aria-hidden="true" />
                    </span>
                    <div className="grid min-w-0 gap-1.5">
                        <h1 className="text-fluid-display font-medium text-gray-900">{stage.title}</h1>
                        <p className="text-fluid-lead text-gray-500">{isFastwork && progress.stage === "submitted" ? "ทีมงานจะตรวจรายการแล้วส่งข้อเสนอในแชต Fastwork" : stage.body}</p>
                    </div>
                </div>
                {journey && <JourneySteps steps={journey.steps} current={journey.current} />}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="flex flex-wrap gap-2 text-xs text-gray-600">
                        <span className="hero-tile px-3 py-1 tabular-nums">เลขคำขอ {data.request.number}</span>
                        <span className="hero-tile px-3 py-1 tabular-nums">ส่งเมื่อ {data.request.submitted_at}</span>
                    </p>
                    {progress.stage === "quotation" && (
                        <a href="#quotation" className={buttonClass("primary", "md", "min-h-11")}>
                            <ArrowDown size={16} aria-hidden="true" />
                            ดูใบเสนอราคาและยอมรับ
                        </a>
                    )}
                    {progress.share_token && (
                        <a href={`/share/${progress.share_token}`} target="_blank" rel="noreferrer" className={buttonClass(progress.stage === "quotation" ? "secondary" : "primary", "md", "min-h-11")}>
                            <ExternalLink size={16} aria-hidden="true" />
                            ดูความคืบหน้างาน
                        </a>
                    )}
                </div>
            </section>

            {quotation && (
                <CustomerSection index={sectionIndex.quotation} id="quotation" title="ใบเสนอราคา" description={progress.stage === "quotation" ? "ตรวจรายการและยอด แล้วกดยอมรับท้ายใบ" : undefined}>
                    <QuotationSummary quotation={quotation} />
                    <div className="grid gap-1.5">
                        <a href={`/order/r/${token}/quotation`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "min-h-11 justify-self-start")}>
                            <FileText size={16} aria-hidden="true" />
                            ดู / บันทึก PDF ใบเสนอราคา
                        </a>
                        <FieldHint>เปิดใบฉบับเต็มขนาด A4 ในแท็บใหม่ กดพิมพ์แล้วเลือก &quot;บันทึกเป็น PDF&quot; เก็บไว้ได้</FieldHint>
                    </div>
                    {progress.stage === "quotation" && <AcceptForm token={token} defaultName={data.request.contact_name ?? ""} onAccepted={load} />}
                    {progress.stage === "accepted" && (
                        <StatusBanner tone="done" title="ยอมรับแล้ว">
                            {progress.accepted_name ? `โดย ${progress.accepted_name}` : "ทีมงานบันทึกการยอมรับให้"}
                            {progress.accepted_at ? ` เมื่อ ${progress.accepted_at}` : ""}
                        </StatusBanner>
                    )}
                </CustomerSection>
            )}

            <SentItems data={data} isFastwork={isFastwork} isCollapsed={Boolean(quotation)} index={sectionIndex.sent} />

            {data.answers.length > 0 && (
                <CustomerSection index={sectionIndex.answers} id="answers" title="ความต้องการที่แจ้งไว้" description="ทีมงานใช้ข้อมูลนี้ออกแบบและประเมินงาน">
                    <AnswersList answers={data.answers} />
                </CustomerSection>
            )}
            <p className="text-center text-xs text-gray-500">เก็บลิงก์หน้านี้ไว้ดูสถานะภายหลังได้</p>
        </OrderShell>
    );
}

/** ยอมรับใบเสนอราคา: พิมพ์ชื่อ + ติ๊กยอมรับ → ทีมงานเปิดงานให้ทันที */
function AcceptForm({ token, defaultName, onAccepted }: { token: string; defaultName: string; onAccepted: () => Promise<void> }) {
    const [name, setName] = useState(defaultName);
    const [agree, setAgree] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    async function accept() {
        setBanner(null);
        const checked = orderAcceptSchema.safeParse({ name, agree });
        if (!checked.success) {
            const fieldErrors: Record<string, string> = {};
            for (const issue of checked.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
            setErrors(fieldErrors);
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { error } = await publicFetch(`/order/requests/${token}/accept`, { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            setBanner(error.message);
            return;
        }
        await onAccepted();
    }

    return (
        <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
            {banner && (
                <StatusBanner tone="error" title="ยอมรับไม่สำเร็จ">
                    {banner}
                </StatusBanner>
            )}
            <FormField label="ชื่อผู้ยอมรับ" htmlFor="accept-name" required error={errors.name} hint="ชื่อที่พิมพ์จะบันทึกไว้เป็นหลักฐานการยอมรับ">
                <input id="accept-name" value={name} maxLength={150} autoComplete="name" onChange={(event) => setName(event.target.value)} className={inputClass(Boolean(errors.name))} />
            </FormField>
            <label className="flex items-start gap-2.5 text-sm text-gray-800">
                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-600" checked={agree} onChange={(event) => setAgree(event.target.checked)} />
                <span>ยอมรับรายการ ยอดเงิน งวดชำระ และเงื่อนไขตามใบเสนอราคานี้</span>
            </label>
            {errors.agree && <FieldHint error={errors.agree} />}
            <button type="button" className={buttonClass("primary", "md", "w-full sm:w-auto sm:justify-self-end")} disabled={isSaving} onClick={accept}>
                {isSaving ? "กำลังบันทึก..." : "ยอมรับใบเสนอราคา"}
            </button>
            <FieldHint>กดยอมรับแล้ว ทีมงานเปิดงานให้ทันทีและจะติดต่อเรื่องการชำระเงินงวดแรก · ยอมรับแล้วแก้ไม่ได้ ถ้าต้องการเปลี่ยนให้แจ้งทีมงานก่อนกด</FieldHint>
        </div>
    );
}

/** สิ่งที่ส่ง → กล่องตามชุด (แถวในชุดผูกด้วย package_id) + รายการเดี่ยว · แถว % แสดงอัตรา */
function sentGroups(items: RequestStatusResponse["items"]): ItemGroup[] {
    const groups: ItemGroup[] = [];
    const standalone: ItemGroup = { key: "standalone", title: null, setCount: null, rows: [] };
    for (const item of items) {
        if (item.type === "heading") {
            groups.push({ key: `k:${item.package_id}`, title: item.name, setCount: item.quantity, rows: [] });
            continue;
        }
        const row = {
            type: "item" as const,
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unit_price,
            amount: formatHundredths(lineAmount(item.unit_price ?? "0", item.quantity)),
            priceNote: item.percent ? `+${Number(item.percent)}% ของยอด` : null,
        };
        const group = item.package_id ? groups.find((candidate) => candidate.key === `k:${item.package_id}`) : null;
        (group ?? standalone).rows.push(row);
    }
    return standalone.rows.length > 0 ? [...groups, standalone] : groups;
}

/** สิ่งที่ลูกค้าส่ง (ราคาประมาณการตอนส่ง) — มีใบเสนอราคาแล้วพับไว้ เพราะยอดที่ใช้จริงอยู่ในใบ */
function SentItems({ data, isFastwork, isCollapsed, index }: { data: RequestStatusResponse; isFastwork: boolean; isCollapsed: boolean; index: number }) {
    const content = (
        <>
            <ItemGroupList groups={sentGroups(data.items)} />
            <div className="grid gap-1 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>รวม</span>
                    <span className="tabular-nums">{formatAmount(data.totals.subtotal)}</span>
                </div>
                {data.request.vat_rate && (
                    <div className="flex justify-between gap-3 text-gray-700">
                        <span>+ VAT {Number(data.request.vat_rate)}%</span>
                        <span className="tabular-nums">{formatAmount(data.totals.vat)}</span>
                    </div>
                )}
                <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5">
                    <span className="font-medium text-gray-900">= ยอดประมาณการตอนส่ง</span>
                    <span className="text-base font-medium text-gray-900 tabular-nums">{formatAmount(data.totals.total)} บาท</span>
                </div>
                <FieldHint>
                    {isFastwork ? "ราคาและการชำระเงินทำผ่าน Fastwork" : isCollapsed ? "ยอดที่ใช้จริงคือยอดตามใบเสนอราคาด้านบน" : "ราคาประมาณการ ณ วันที่ส่ง ทีมงานจะยืนยันราคาสุดท้ายอีกครั้ง"}
                </FieldHint>
            </div>
            {data.request.note && <p className="rounded-xl bg-gray-50 p-3 text-sm whitespace-pre-line text-gray-700">{data.request.note}</p>}
        </>
    );

    if (isCollapsed) {
        return (
            <details className="group p-fluid card-customer">
                <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3">
                    <span className="flex items-center gap-3">
                        <span className="flex h-8 min-w-8 items-center justify-center rounded-xl bg-blue-50 px-1.5 text-xs font-medium text-blue-700 tabular-nums" aria-hidden="true">
                            {String(index).padStart(2, "0")}
                        </span>
                        <span className="text-fluid-title font-medium text-gray-900">สิ่งที่ส่งตอนแรก</span>
                    </span>
                    <span className="text-xs text-gray-500 group-open:hidden">กดเพื่อดู</span>
                </summary>
                <div className="mt-3 grid gap-3">{content}</div>
            </details>
        );
    }
    return (
        <CustomerSection index={index} id="sent" title="สิ่งที่ส่ง" description={isFastwork ? undefined : "ราคาประมาณการ ณ วันที่ส่ง"}>
            {content}
        </CustomerSection>
    );
}
