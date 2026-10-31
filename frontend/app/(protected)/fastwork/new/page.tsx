"use client";

// รับงานใหม่จาก Fastwork (2026-10-24 · P-1 · ขั้นที่ 1 ของหน้า Fastwork)
// ไม่ต้องมีใบเสนอราคา · ลูกค้า: พิมพ์ชื่อที่แสดงบน Fastwork ระบบหาลูกค้าเดิมให้เลือก ไม่เจอ = สร้างลูกค้าใหม่จากชื่อ
// งวดงานตามที่ตกลงบน Fastwork (ราคางวด = ยอดที่ลูกค้าจ่าย ก่อนหักค่าธรรมเนียม) · บันทึกแล้วไปหน้าโปรเจกต์ (ผู้สร้างเป็น PM)
// ?request=<SVR> (S-5) = รับงานจากคำขอบริการ: เติมชื่องาน ลูกค้า งวด จากคำขอ/ใบภายใน · บันทึกแล้วสร้างงานจากรายการ + ผูกคำขอ
// ?name=&amount=&cart= = มาจากตัวคิดราคา: เติมชื่องาน งวดเดียวเท่ายอดตะกร้า และสินค้าที่จะสร้างเป็นงาน (2026-10-31)
// ?renewal=<RNW> (2026-10-31) = รับงานต่ออายุ: เติมชื่องาน ลูกค้า งวดเดียวเท่าราคาต่อรอบ · บันทึกแล้วรอบนี้ผูกงาน + วันครบขยับ
// ไม่ได้รับจากคำขอ: เลือกสินค้า/ชุดรายการ → สร้างงานและงานย่อยพร้อมโปรเจกต์ (คำขอสร้างงานจากรายการให้เองอยู่แล้ว)
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ListTree, Plus, RefreshCw, Trash2, UserRoundCheck } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Segmented from "@/components/ui/segmented";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { PageSkeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths, parseHundredths } from "@/lib/shared/money.mjs";
import { fastworkProjectSchema, MAX_FASTWORK_MILESTONES } from "@/lib/shared/schemas/fastwork.mjs";
import { todayBangkokText } from "../../people/employees/_card-status";
import { FASTWORK_MESSAGES } from "../_messages";
import CatalogTaskPicker, { tasksFromSelection, useTaskCatalog } from "@/components/feature/catalog-task-picker";
import { selectionFromParam, type CatalogSelection } from "@/lib/catalog-tasks";
import JobRenewals, { jobRenewalsOf, useRenewalOptions } from "./_components/job-renewals";
import { cycleUnit } from "@/lib/shared/renewal-math.mjs";
import { thaiShortDate } from "@/lib/shared/thai-date.mjs";

type RenewalSource = {
    rnw_id: string;
    rnw_version: number;
    rnw_label: string | null;
    rnw_client_id: string;
    rnw_price: string;
    rnw_cycle_months: number;
    rnw_status: string;
    rnw_channel: string;
    client_name: string;
    product_name: string;
    next_period: { start: string; end: string };
};

type ClientChoice = { client_id: string; client_name: string; client_company: string | null };
type MilestoneRow = { key: number; fwm_name: string; fwm_amount: string; fwm_due_date: string };
type FastworkPlan = {
    can_take: boolean;
    blocked_reason: string | null;
    mode: "new" | "existing";
    title: string;
    client_id: string | null;
    client_name: string | null;
    quotation: { qt_id: string; qt_number: string; qt_status: string } | null;
    milestones: { fwm_name: string; fwm_amount: string }[];
};

// key ใช้กับ React เท่านั้น · id ของช่องกรอกใช้ลำดับงวด (ตรงกันทั้งฝั่งเซิร์ฟเวอร์และเบราว์เซอร์)
const emptyMilestone = (key: number, name = ""): MilestoneRow => ({ key, fwm_name: name, fwm_amount: "", fwm_due_date: "" });

function totalOf(milestones: MilestoneRow[]) {
    let total = 0n;
    for (const milestone of milestones) {
        try {
            total += parseHundredths(milestone.fwm_amount || "0", "ราคางวด");
        } catch {
            return null;
        }
    }
    return formatHundredths(total);
}

export default function NewFastworkJobPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <NewFastworkJob />
        </Suspense>
    );
}

function NewFastworkJob() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestId = searchParams.get("request");
    const renewalId = searchParams.get("renewal");
    const [renewalSource, setRenewalSource] = useState<RenewalSource | null>(null);
    const [renewalError, setRenewalError] = useState<string | null>(null);
    const hasBit = usePermission();
    const [plan, setPlan] = useState<FastworkPlan | null>(null);
    const [planError, setPlanError] = useState<string | null>(null);
    const [form, setForm] = useState({
        project_name: searchParams.get("name") ?? "",
        client_name: "",
        project_fastwork_order_no: "",
        project_fastwork_url: "",
        project_description: "",
        project_type: "waterfall" as "waterfall" | "agile",
        project_start_date: todayBangkokText(),
        project_due_date: "",
    });
    const [client, setClient] = useState<ClientChoice | null>(null);
    const [suggestions, setSuggestions] = useState<ClientChoice[]>([]);
    const [milestones, setMilestones] = useState<MilestoneRow[]>(() => [{ ...emptyMilestone(0, "งานทั้งหมด"), fwm_amount: searchParams.get("amount") ?? "" }]);
    const nextKey = useRef(1);
    const [selection, setSelection] = useState<CatalogSelection[]>(() => selectionFromParam(searchParams.get("cart")));
    const isPlainJob = !requestId && !renewalId;
    const { catalog, loadError: catalogError } = useTaskCatalog(isPlainJob && hasBit(BITS.manageFastwork));
    // ตั้งต่ออายุจากสินค้ารายรอบที่เลือก (2026-10-31) · รับจากคำขอ = ตั้งจากใบภายในตอนตอบรับแทน
    const renewalOptions = useRenewalOptions(isPlainJob && hasBit(BITS.manageFastwork));
    const [renewalOverrides, setRenewalOverrides] = useState<Record<string, { isSkipped?: boolean; label?: string; dueDate?: string }>>({});
    const jobRenewals = jobRenewalsOf(selection, renewalOptions, form.project_start_date, renewalOverrides);

    // รับงานจากคำขอ: เติมจากคำขอ (ลูกค้าที่ผูกไว้/ชื่อผู้ซื้อ · งวดจากใบภายใน หรือ 1 งวด = ยอด)
    useEffect(() => {
        if (!requestId) return;
        let isLeftPage = false;
        apiFetch<{ fastwork_plan: FastworkPlan | null }>(`/service-requests/${encodeURIComponent(requestId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            const loaded = data?.fastwork_plan ?? null;
            if (error || !loaded) {
                setPlanError(error?.message ?? "คำขอนี้ไม่ได้มาจากลิงก์ Fastwork");
                return;
            }
            setPlan(loaded);
            setForm((current) => ({
                ...current,
                project_name: loaded.title,
                client_name: loaded.client_id ? "" : (loaded.client_name ?? ""),
                project_description: `ขอบเขตงานตามคำขอบริการ ${requestId}`,
            }));
            if (loaded.client_id) setClient({ client_id: loaded.client_id, client_name: loaded.client_name ?? "", client_company: null });
            setMilestones(loaded.milestones.map((milestone, index) => ({ key: index, fwm_name: milestone.fwm_name, fwm_amount: milestone.fwm_amount, fwm_due_date: "" })));
            nextKey.current = loaded.milestones.length;
        });
        return () => {
            isLeftPage = true;
        };
    }, [requestId]);
    // รับงานต่ออายุ: เติมจากรายการต่ออายุ (ลูกค้าเดิม · งวดเดียว = ราคาต่อรอบ)
    useEffect(() => {
        if (!renewalId) return;
        let isLeftPage = false;
        apiFetch<{ renewal: RenewalSource }>(`/renewals/${encodeURIComponent(renewalId)}`).then(({ data, error }) => {
            if (isLeftPage) return;
            if (error) {
                setRenewalError(error.message);
                return;
            }
            const loaded = data.renewal;
            if (loaded.rnw_status !== "active" || loaded.rnw_channel !== "fastwork") {
                setRenewalError("รายการนี้ไม่ได้ใช้งานอยู่ หรือไม่ใช่รายการของผู้ซื้อ Fastwork");
                return;
            }
            const title = loaded.rnw_label || loaded.product_name;
            const period = `${thaiShortDate(loaded.next_period.start)} - ${thaiShortDate(loaded.next_period.end)}`;
            setRenewalSource(loaded);
            setForm((current) => ({
                ...current,
                project_name: `ต่ออายุ ${title} (${period})`.slice(0, 150),
                project_description: `ต่ออายุ ${loaded.product_name} รอบ ${period}`,
            }));
            setClient({ client_id: loaded.rnw_client_id, client_name: loaded.client_name, client_company: null });
            setMilestones([{ key: 0, fwm_name: `ต่ออายุ ${cycleUnit(loaded.rnw_cycle_months)}`, fwm_amount: loaded.rnw_price, fwm_due_date: "" }]);
        });
        return () => {
            isLeftPage = true;
        };
    }, [renewalId]);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // หาลูกค้าเดิมจากชื่อที่พิมพ์ (หน่วง 250 มิลลิวินาที)
    useEffect(() => {
        const keyword = form.client_name.trim();
        if (client || keyword.length < 2) return;
        let isStale = false;
        const timer = setTimeout(() => {
            apiFetch<{ data: ClientChoice[] }>(`/clients?search=${encodeURIComponent(keyword)}&limit=6&status=active`).then(({ data }) => {
                if (!isStale) setSuggestions(data?.data ?? []);
            });
        }, 250);
        return () => {
            isStale = true;
            clearTimeout(timer);
        };
    }, [form.client_name, client]);

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    function updateMilestone(key: number, field: keyof Omit<MilestoneRow, "key">, value: string) {
        setMilestones((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        const payload = {
            ...form,
            client_id: client?.client_id ?? null,
            client_name: client ? null : form.client_name,
            milestones: milestones.map(({ fwm_name, fwm_amount, fwm_due_date }) => ({ fwm_name, fwm_amount, fwm_due_date })),
            service_request_id: requestId,
            renewal_id: renewalSource?.rnw_id ?? null,
            renewal_version: renewalSource?.rnw_version ?? null,
            tasks: isPlainJob ? tasksFromSelection(selection, catalog) : [],
            renewals: !isPlainJob
                ? []
                : jobRenewals
                      .filter((renewal) => !renewal.isSkipped)
                      .map((renewal) => ({
                          rnw_product_id: renewal.productId,
                          rnw_label: renewal.label || null,
                          rnw_price: renewal.price,
                          rnw_cycle_months: renewal.cycleMonths,
                          rnw_next_due_date: renewal.dueDate,
                      })),
        };
        const checked = fastworkProjectSchema.safeParse(payload);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ project_id: string; task_count: number; renewal_count: number }>("/fastwork/projects", {
            method: "POST",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        let doneMessage = "สร้างงาน Fastwork แล้ว · เพิ่มสมาชิกทีมได้ในหน้าโปรเจกต์";
        if (requestId) doneMessage = "รับงานแล้ว · สร้างงานจากรายการในคำขอให้แล้ว";
        else if (data.task_count > 0) doneMessage = `สร้างงาน Fastwork แล้ว · เพิ่ม ${data.task_count} งานจากสินค้าที่เลือก`;
        if (data.renewal_count > 0) doneMessage += ` · ตั้งต่ออายุ ${data.renewal_count} รายการ`;
        if (renewalSource) doneMessage = "รับงานต่ออายุแล้ว · วันครบของรายการขยับไปรอบถัดไป";
        toast.success(doneMessage);
        router.push(`/projects/view?id=${data.project_id}`);
    }

    const header = <PageHeader eyebrow="Fastwork · ขั้นที่ 1" title="รับงานใหม่จาก Fastwork" description="สร้างโปรเจกต์จากงานที่รับบน Fastwork โดยไม่ต้องทำใบเสนอราคา" />;
    if (!hasBit(BITS.manageFastwork)) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการงาน Fastwork">
                    ให้ผู้ดูแลระบบเพิ่มสิทธิ์ &quot;จัดการงาน Fastwork&quot; ใน role ของคุณ
                </StatusBanner>
            </div>
        );
    }

    if (renewalId && renewalError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="warn" title="รับงานต่ออายุจากรายการนี้ไม่ได้">
                    {renewalError}
                </StatusBanner>
                <Link href="/sales/renewals" className={buttonClass("secondary", "md", "justify-self-start")}>
                    กลับไปหน้าต่ออายุบริการ
                </Link>
            </div>
        );
    }
    if (renewalId && !renewalSource) return <PageSkeleton />;
    if (requestId && !plan && !planError) return <PageSkeleton />;
    if (requestId && (planError || (plan && !plan.can_take))) {
        const reason = planError ?? plan?.blocked_reason ?? (plan?.mode === "existing" ? 'คำขอนี้มาจากลิงก์ของงานเดิม · กด "ลูกค้ายืนยันบน Fastwork แล้ว" ในหน้าคำขอ' : "คำขอนี้รับงานหรือปิดไปแล้ว");
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="warn" title="รับงานจากคำขอนี้ไม่ได้">
                    {reason}
                </StatusBanner>
                <Link href={`/sales/service-requests/view?id=${encodeURIComponent(requestId)}`} className={buttonClass("secondary", "md", "justify-self-start")}>
                    กลับไปหน้าคำขอ
                </Link>
            </div>
        );
    }
    const isClientLocked = Boolean((plan?.quotation && plan.client_id) || renewalSource);
    const total = totalOf(milestones);
    const isMilestoneLimit = milestones.length >= MAX_FASTWORK_MILESTONES;

    return (
        <form noValidate onSubmit={submit} className="grid w-full grid-cols-1 gap-6">
            {header}
            {bannerError && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            {/* ใช้หน้านี้เมื่อไร (2026-10-31): ผู้ใช้งงว่าเริ่มจากหน้าไหน และถามว่าทำไมไม่มีใบเสนอราคา */}
            {renewalSource && (
                <StatusBanner tone="info" title={`รับงานต่ออายุ ${renewalSource.rnw_label || renewalSource.product_name}`}>
                    ผู้ซื้อสั่งต่ออายุบน Fastwork แล้ว · ใส่เลขคำสั่งซื้อใหม่ · บันทึกแล้วรอบนี้ผูกกับงานนี้ และวันครบของรายการขยับไปรอบถัดไป
                </StatusBanner>
            )}
            {isPlainJob && (
                <StatusBanner tone="info" title="ใช้หน้านี้หลังผู้ซื้อจ่ายบน Fastwork แล้ว">
                    <span className="grid gap-1">
                        <span>
                            มาจากลิงก์ให้ผู้ซื้อ: รับจาก{" "}
                            <Link href="/sales/service-requests" className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                                หน้าคำขอบริการ
                            </Link>{" "}
                            แทน (เติมชื่องาน งวด และคำตอบของผู้ซื้อให้)
                        </span>
                        <span>
                            ลูกค้าจ้างเพิ่มในงานที่ยังไม่จบ: ใช้{" "}
                            <Link href="/fastwork/price" className="-my-2.5 inline-block py-2.5 text-blue-600 hover:underline">
                                ตัวคิดราคา
                            </Link>{" "}
                            › &quot;เพิ่มเป็นงวดของงานเดิม&quot; · งานจบแล้วค่อยรับเป็นงานใหม่ที่นี่
                        </span>
                        <span>ไม่ต้องออกใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จในระบบ: Fastwork ออกให้ผู้ซื้อเอง · ในระบบบันทึกเงินเข้าแต่ละงวดแทน</span>
                    </span>
                </StatusBanner>
            )}
            {requestId && plan && (
                <StatusBanner tone="info" title={`รับงานจากคำขอ ${requestId}`}>
                    {plan.quotation
                        ? `งวดเติมจากใบเสนอราคาภายใน ${plan.quotation.qt_number} · บันทึกแล้วใบนี้ผูกกับงานและสร้างงานย่อยจากรายการในใบ`
                        : "งวดเติมจากยอดในคำขอ · บันทึกแล้วสร้างงานย่อยจากรายการที่ลูกค้าเลือก"}
                    {" · แก้ชื่องานและงวดให้ตรงกับที่ตกลงบน Fastwork ก่อนบันทึก"}
                </StatusBanner>
            )}

            <SectionCard title="งานและลูกค้า" description="ข้อมูลจากหน้าคำสั่งซื้อบน Fastwork">
                <div className="grid gap-4 sm:grid-cols-2">
                    <FormField label="ชื่องาน" htmlFor="project_name" required error={errors.project_name} className="sm:col-span-2">
                        <input
                            id="project_name"
                            value={form.project_name}
                            maxLength={150}
                            placeholder="เช่น เว็บไซต์ร้านกาแฟพร้อมระบบสั่งออนไลน์"
                            onChange={(event) => update("project_name", event.target.value)}
                            className={inputClass(Boolean(errors.project_name))}
                        />
                    </FormField>
                    <div className="grid content-start gap-1.5">
                        {client ? (
                            <>
                                <span className="text-sm text-gray-800">ลูกค้า</span>
                                <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2">
                                    <span className="flex items-center gap-2 text-sm text-blue-800">
                                        <UserRoundCheck size={16} aria-hidden="true" />
                                        ลูกค้าเดิม: {client.client_name}
                                    </span>
                                    {!isClientLocked && (
                                        <button
                                            type="button"
                                            className="min-h-9 text-sm text-blue-600 hover:underline"
                                            onClick={() => {
                                                setClient(null);
                                                update("client_name", "");
                                            }}
                                        >
                                            เปลี่ยน
                                        </button>
                                    )}
                                </div>
                                {isClientLocked && (
                                    <FieldHint>
                                        {renewalSource
                                            ? "ลูกค้าเดียวกับรายการต่ออายุ (เปลี่ยนไม่ได้)"
                                            : "ลูกค้าเดียวกับใบเสนอราคาภายในของคำขอ (เปลี่ยนไม่ได้)"}
                                    </FieldHint>
                                )}
                            </>
                        ) : (
                            <FormField
                                label="ชื่อลูกค้าบน Fastwork"
                                htmlFor="client_name"
                                required
                                hint="พิมพ์อย่างน้อย 2 ตัวอักษร ระบบหาลูกค้าเดิมให้ · ไม่เจอ = สร้างลูกค้าใหม่จากชื่อนี้"
                                error={errors.client_name ?? errors.client_id}
                            >
                                <input
                                    id="client_name"
                                    value={form.client_name}
                                    maxLength={100}
                                    autoComplete="off"
                                    placeholder="ชื่อผู้ใช้หรือชื่อร้านของลูกค้า"
                                    onChange={(event) => {
                                        update("client_name", event.target.value);
                                        if (event.target.value.trim().length < 2) setSuggestions([]);
                                    }}
                                    className={inputClass(Boolean(errors.client_name))}
                                />
                            </FormField>
                        )}
                        {!client && suggestions.length > 0 && form.client_name.trim().length >= 2 && (
                            <ul className="grid gap-1" aria-label="ลูกค้าเดิมที่ชื่อตรง">
                                {suggestions.map((choice) => (
                                    <li key={choice.client_id}>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setClient(choice);
                                                setSuggestions([]);
                                            }}
                                            className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-gray-200 px-3 text-left text-sm hover:border-blue-300 hover:bg-blue-50"
                                        >
                                            <UserRoundCheck size={15} className="shrink-0 text-blue-600" aria-hidden="true" />
                                            <span className="min-w-0 truncate">
                                                ใช้ลูกค้าเดิม: {choice.client_name}
                                                {choice.client_company ? ` · ${choice.client_company}` : ""}
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <FormField label="เลขคำสั่งซื้อบน Fastwork" htmlFor="project_fastwork_order_no" hint="ไม่บังคับ · ใช้ค้นหางานภายหลัง" error={errors.project_fastwork_order_no}>
                        <input
                            id="project_fastwork_order_no"
                            value={form.project_fastwork_order_no}
                            maxLength={50}
                            onChange={(event) => update("project_fastwork_order_no", event.target.value)}
                            className={inputClass(Boolean(errors.project_fastwork_order_no))}
                        />
                    </FormField>
                    <FormField label="ลิงก์หน้างานบน Fastwork" htmlFor="project_fastwork_url" hint="ไม่บังคับ · คัดลอกจากแถบที่อยู่ของเบราว์เซอร์" error={errors.project_fastwork_url} className="sm:col-span-2">
                        <input
                            id="project_fastwork_url"
                            type="url"
                            inputMode="url"
                            value={form.project_fastwork_url}
                            maxLength={500}
                            placeholder="https://fastwork.co/..."
                            onChange={(event) => update("project_fastwork_url", event.target.value)}
                            className={inputClass(Boolean(errors.project_fastwork_url))}
                        />
                    </FormField>
                    <FormField label="วันเริ่ม" htmlFor="project_start_date" error={errors.project_start_date}>
                        <input
                            id="project_start_date"
                            type="date"
                            value={form.project_start_date}
                            onChange={(event) => update("project_start_date", event.target.value)}
                            className={inputClass(Boolean(errors.project_start_date))}
                        />
                    </FormField>
                    <FormField label="กำหนดส่งงาน" htmlFor="project_due_date" hint="วันส่งงานงวดสุดท้ายตามที่ตกลง" error={errors.project_due_date}>
                        <input
                            id="project_due_date"
                            type="date"
                            min={form.project_start_date || undefined}
                            value={form.project_due_date}
                            onChange={(event) => update("project_due_date", event.target.value)}
                            className={inputClass(Boolean(errors.project_due_date))}
                        />
                    </FormField>
                    <div className="grid gap-1.5 sm:col-span-2">
                        <Segmented<"waterfall" | "agile">
                            label="รูปแบบการทำงาน"
                            value={form.project_type}
                            onChange={(value) => update("project_type", value)}
                            options={[
                                { value: "waterfall", label: "PM มอบหมายงาน" },
                                { value: "agile", label: "สมาชิกกดรับงานเอง" },
                            ]}
                        />
                    </div>
                    <FormField label="รายละเอียดงาน" htmlFor="project_description" hint="ไม่บังคับ · ขอบเขตงานตามที่ตกลงกับลูกค้า" className="sm:col-span-2">
                        <textarea
                            id="project_description"
                            rows={3}
                            maxLength={5000}
                            value={form.project_description}
                            onChange={(event) => update("project_description", event.target.value)}
                            className={inputClass(false)}
                        />
                    </FormField>
                </div>
            </SectionCard>

            {isPlainJob && (
                <SectionCard
                    title="สร้างงานจากสินค้า (ไม่บังคับ)"
                    description="เลือกสิ่งที่ผู้ซื้อจ้าง ระบบสร้างงานและงานย่อยในโปรเจกต์ให้ตอนบันทึก · ชุดรายการเป็นงานหลัก รายการในชุดเป็นงานย่อย"
                    icon={ListTree}
                >
                    {errors.tasks && <FieldHint error={errors.tasks} />}
                    <CatalogTaskPicker
                        id="fastwork_task_catalog"
                        catalog={catalog}
                        loadError={catalogError}
                        selection={selection}
                        onChange={setSelection}
                    />
                </SectionCard>
            )}

            {isPlainJob && jobRenewals.length > 0 && (
                <SectionCard
                    title="ตั้งต่ออายุบริการ"
                    description="บริการรายรอบในงานนี้ · ระบบเตือนก่อนครบ 30 วันที่หน้าต่ออายุบริการ ผู้ซื้อสั่งต่ออายุบน Fastwork แล้วรับเป็นงานใหม่ · ติ๊กออกถ้าผู้ซื้อไม่ต่อ"
                    icon={RefreshCw}
                >
                    <JobRenewals
                        renewals={jobRenewals}
                        errors={errors}
                        onChange={(key, override) =>
                            setRenewalOverrides((current) => ({ ...current, [key]: { ...current[key], ...override } }))
                        }
                    />
                </SectionCard>
            )}

            <SectionCard title="งวดงานและราคา" description={FASTWORK_MESSAGES.milestones}>
                {errors.milestones && <FieldHint error={errors.milestones} />}
                <ol className="grid gap-3">
                    {milestones.map((row, index) => (
                        <li key={row.key} className="grid gap-3 rounded-xl border border-gray-200 p-3 sm:grid-cols-[2rem_1fr_10rem_10rem_auto] sm:items-start">
                            <span className="text-sm font-medium text-gray-500 tabular-nums sm:pt-3">งวด {index + 1}</span>
                            <FormField label="ชื่องวด" htmlFor={`fwm_name_${index}`} required error={errors[`milestones.${index}.fwm_name`]}>
                                <input
                                    id={`fwm_name_${index}`}
                                    value={row.fwm_name}
                                    maxLength={200}
                                    placeholder="เช่น ออกแบบหน้าเว็บ"
                                    onChange={(event) => updateMilestone(row.key, "fwm_name", event.target.value)}
                                    className={inputClass(Boolean(errors[`milestones.${index}.fwm_name`]))}
                                />
                            </FormField>
                            <FormField label="ราคางวด (บาท)" htmlFor={`fwm_amount_${index}`} required error={errors[`milestones.${index}.fwm_amount`]}>
                                <input
                                    id={`fwm_amount_${index}`}
                                    inputMode="decimal"
                                    value={row.fwm_amount}
                                    placeholder="0.00"
                                    onChange={(event) => updateMilestone(row.key, "fwm_amount", event.target.value)}
                                    className={`${inputClass(Boolean(errors[`milestones.${index}.fwm_amount`]))} text-right tabular-nums`}
                                />
                            </FormField>
                            <FormField label="กำหนดส่ง" htmlFor={`fwm_due_${index}`} error={errors[`milestones.${index}.fwm_due_date`]}>
                                <input
                                    id={`fwm_due_${index}`}
                                    type="date"
                                    value={row.fwm_due_date}
                                    onChange={(event) => updateMilestone(row.key, "fwm_due_date", event.target.value)}
                                    className={inputClass(false)}
                                />
                            </FormField>
                            <button
                                type="button"
                                aria-label={`ลบงวด ${index + 1}`}
                                disabled={milestones.length === 1}
                                onClick={() => setMilestones((current) => current.filter((item) => item.key !== row.key))}
                                className={`${buttonClass("ghost", "md")} justify-self-end sm:mt-6`}
                            >
                                <Trash2 size={16} />
                            </button>
                        </li>
                    ))}
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <button
                        type="button"
                        disabled={isMilestoneLimit}
                        onClick={() => {
                            const key = nextKey.current;
                            nextKey.current += 1;
                            setMilestones((current) => [...current, emptyMilestone(key)]);
                        }}
                        className={buttonClass("secondary", "sm")}
                    >
                        <Plus size={14} />
                        เพิ่มงวด
                    </button>
                    <span className="text-sm text-gray-700">
                        ราคางานรวม <span className="font-medium text-gray-900 tabular-nums">{total === null ? "-" : formatAmount(total)}</span> บาท
                    </span>
                </div>
            </SectionCard>

            <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => router.push("/fastwork")}>
                    ยกเลิก
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    {isSaving ? "กำลังบันทึก..." : "สร้างงาน"}
                </button>
            </div>
        </form>
    );
}
