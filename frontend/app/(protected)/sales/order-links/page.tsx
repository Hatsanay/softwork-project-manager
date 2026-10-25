"use client";

// ลิงก์เลือกบริการ (2026-10-25 · S-1 · docs/plans/2026-10-25-client-order-link.md ข้อ 2)
// รายการลิงก์ · สร้าง/แก้ · คัดลอกลิงก์ · QR code · ตั้งผู้รับคำขอเริ่มต้น
// ?client=<id> (จากหน้าลูกค้า) = เปิดแผ่นสร้างลิงก์เฉพาะลูกค้าที่เลือกลูกค้าให้แล้ว
// ?kind=fastwork (จากหน้า Fastwork) = เปิดแผ่นสร้างลิงก์ Fastwork · &project=<id> (จากการ์ดงาน Fastwork) = ลิงก์ของงานเดิม
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Copy, MessageSquareText, Pencil, Plus, QrCode } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import FieldHint from "@/components/ui/guidance/field-hint";
import EmptyState from "@/components/ui/empty-state";
import StatusPill, { type PillTone } from "@/components/ui/status-pill";
import { inputClass } from "@/components/ui/form-field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatDateOnly } from "@/app/function";
import { LINK_KIND_LABEL, type OrderLink, type OrderLinkOpenState, type ServiceRequestSettings } from "./_types";
import LinkSheet, { type LinkPreset } from "./_components/link-sheet";
import QrSheet from "./_components/qr-sheet";

const OPEN_STATE: Record<OrderLinkOpenState, { label: string; tone: PillTone }> = {
    open: { label: "เปิดรับ", tone: "success" },
    disabled: { label: "ปิดแล้ว", tone: "neutral" },
    expired: { label: "หมดอายุ", tone: "wait" },
};

export default function OrderLinksPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <OrderLinksContent />
        </Suspense>
    );
}

function OrderLinksContent() {
    const searchParams = useSearchParams();
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageServiceRequests);
    const requestedClientId = searchParams.get("client");
    const requestedKind = searchParams.get("kind") === "fastwork" ? "fastwork" : null;
    const requestedProjectId = searchParams.get("project");
    const [links, setLinks] = useState<OrderLink[] | null>(null);
    const [settings, setSettings] = useState<ServiceRequestSettings | null>(null);
    const [shopName, setShopName] = useState("");
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [sheet, setSheet] = useState<{ link: OrderLink | null; preset: LinkPreset } | null>(null);
    const [qrLink, setQrLink] = useState<OrderLink | null>(null);
    const [isSavingDefault, setIsSavingDefault] = useState(false);

    const load = useCallback(async () => {
        const { data, error } = await apiFetch<{ data: OrderLink[] }>("/order-links");
        setLoadError(error);
        if (data) setLinks(data.data);
    }, []);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        Promise.all([
            apiFetch<{ data: OrderLink[] }>("/order-links"),
            apiFetch<ServiceRequestSettings>("/service-requests/settings"),
            apiFetch<{ company: { cs_name_th: string } }>("/company"),
            requestedClientId ? apiFetch<{ client_id: string; client_name: string }>(`/clients/${requestedClientId}`) : Promise.resolve(null),
            requestedProjectId ? apiFetch<{ project_id: string; project_name: string }>(`/projects/${requestedProjectId}`) : Promise.resolve(null),
        ]).then(([linksResult, settingsResult, companyResult, clientResult, projectResult]) => {
            if (isLeftPage) return;
            setLoadError(linksResult.error ?? settingsResult.error);
            if (linksResult.data) setLinks(linksResult.data.data);
            if (settingsResult.data) setSettings(settingsResult.data);
            setShopName(companyResult.data?.company.cs_name_th ?? "");
            const client = clientResult?.data;
            const project = projectResult?.data;
            if (client) setSheet({ link: null, preset: { kind: "personal", client: { value: client.client_id, label: client.client_name }, project: null } });
            else if (project) setSheet({ link: null, preset: { kind: "fastwork", client: null, project: { value: project.project_id, label: project.project_name } } });
            else if (requestedKind) setSheet({ link: null, preset: { kind: requestedKind, client: null, project: null } });
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage, requestedClientId, requestedKind, requestedProjectId]);

    async function copyText(text: string, doneMessage: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(doneMessage);
        } catch {
            toast.error(`คัดลอกไม่ได้ ข้อความคือ ${text}`);
        }
    }

    const linkUrl = (link: OrderLink) => `${window.location.origin}/order/${link.ol_token}`;

    // ข้อความวางในแชต Fastwork: บอกว่าลิงก์ใช้เลือกขอบเขตงาน · ราคาและการจ่ายเงินอยู่บน Fastwork · ที่อยู่สั้นสำรองเมื่อแชตซ่อนลิงก์
    function fastworkMessage(link: OrderLink) {
        return [
            "เลือกบริการที่ต้องการ ตอบคำถามเกี่ยวกับงาน และแนบไฟล์ตัวอย่างได้ที่ลิงก์นี้ครับ",
            linkUrl(link),
            `(ถ้ากดลิงก์ไม่ได้ พิมพ์ ${window.location.host}/o/${link.ol_short_code} ในเบราว์เซอร์)`,
            "ลิงก์นี้ใช้เก็บรายละเอียดงานเท่านั้น ราคาที่ตกลงและการชำระเงินทำผ่าน Fastwork ตามปกติ",
        ].join("\n");
    }

    async function copyLink(link: OrderLink) {
        await copyText(linkUrl(link), "คัดลอกลิงก์แล้ว");
    }

    async function saveDefaultAssignee(userId: string) {
        setIsSavingDefault(true);
        const { data, error } = await apiFetch<ServiceRequestSettings>("/service-requests/settings", {
            method: "PUT",
            body: { cs_service_request_assignee_id: userId || null },
        });
        setIsSavingDefault(false);
        if (error) {
            toast.error(error.message);
            return;
        }
        setSettings(data);
        toast.success("บันทึกผู้รับคำขอเริ่มต้นแล้ว");
    }

    const header = (
        <PageHeader
            eyebrow="ขาย"
            title="ลิงก์เลือกบริการ"
            description="ส่งลิงก์ให้ลูกค้าเลือกบริการ เห็นราคา แล้วส่งคำขอถึงผู้รับ"
            actions={
                canManage &&
                settings && (
                    <button type="button" className={buttonClass("primary", "md")} onClick={() => setSheet({ link: null, preset: { kind: "personal", client: null, project: null } })}>
                        <Plus size={16} />
                        สร้างลิงก์
                    </button>
                )
            }
        />
    );

    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการลิงก์เลือกบริการ" />
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดลิงก์ไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!links || !settings) return <PageSkeleton />;

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            <HowItWorks label="ลิงก์ทำงานอย่างไร">
                <p>ลูกค้าเปิดลิงก์ได้โดยไม่ต้องสมัคร · เลือกสินค้าที่ติ๊ก &quot;แสดงบนหน้าร้าน&quot; ในหน้าสินค้า/บริการ · เห็นยอดประมาณการ · กรอกข้อมูลติดต่อแล้วส่ง</p>
                <p>คำขอเข้าหน้า &quot;คำขอบริการ&quot; และส่งอีเมลถึงผู้รับของลิงก์ · ราคาที่ลูกค้าเห็นตอนส่งถูกเก็บไว้ แก้ราคาสินค้าทีหลังไม่กระทบ</p>
                <p>QR code ใช้เมื่อแชตซ่อนลิงก์ ใต้รูปมีที่อยู่แบบสั้น (/o/รหัส) ให้ลูกค้าพิมพ์เองได้</p>
                <p>ลิงก์ Fastwork: ไม่ถามข้อมูลติดต่อ ไม่มีช่องทางจ่ายเงิน · กด &quot;คัดลอกข้อความ&quot; แล้ววางในแชต Fastwork · ลิงก์ของงานเดิม (สร้างจากการ์ดงาน Fastwork) คำตอบเข้าการ์ดความต้องการของงานทันที</p>
            </HowItWorks>

            <section className={`grid gap-2 p-4 sm:grid-cols-[1fr_minmax(0,18rem)] sm:items-center ${CARD_CLASS}`} aria-label="ผู้รับคำขอเริ่มต้น">
                <div className="grid gap-0.5">
                    <span className="text-sm font-medium text-gray-900">ผู้รับคำขอเริ่มต้น</span>
                    <FieldHint>เติมให้ตอนสร้างลิงก์ใหม่ · ใช้แทนเมื่อผู้รับของลิงก์ถูกปิดใช้งาน</FieldHint>
                </div>
                <select
                    aria-label="ผู้รับคำขอเริ่มต้น"
                    value={settings.cs_service_request_assignee_id ?? ""}
                    disabled={isSavingDefault}
                    onChange={(event) => saveDefaultAssignee(event.target.value)}
                    className={inputClass()}
                >
                    <option value="">ยังไม่ตั้ง</option>
                    {settings.users.map((user) => (
                        <option key={user.user_id} value={user.user_id}>
                            {user.full_name}
                        </option>
                    ))}
                </select>
            </section>

            {links.length === 0 ? (
                <EmptyState title="ยังไม่มีลิงก์" description='กด "สร้างลิงก์" แล้วส่งให้ลูกค้า หรือสร้างลิงก์สาธารณะไว้ติดหน้าเว็บ' />
            ) : (
                <ul className="grid gap-2">
                    {links.map((link) => {
                        const state = OPEN_STATE[link.open_state];
                        const title = link.client_name ?? link.project_name ?? link.ol_buyer_name ?? link.ol_name ?? (link.ol_kind === "personal" ? "ลูกค้าใหม่" : "-");
                        return (
                            <li key={link.ol_id} className={`grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center ${CARD_CLASS}`}>
                                <div className="grid min-w-0 gap-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusPill tone={state.tone}>{state.label}</StatusPill>
                                        <StatusPill tone="info">{LINK_KIND_LABEL[link.ol_kind]}</StatusPill>
                                        {link.has_preset_problem && <StatusPill tone="danger">รายการที่เลือกให้ใช้ไม่ได้</StatusPill>}
                                        <span className="font-medium wrap-break-word text-gray-900">{title}</span>
                                    </div>
                                    <span className="text-xs text-gray-500">
                                        {[
                                            link.ol_name && link.ol_name !== title ? link.ol_name : null,
                                            `/o/${link.ol_short_code}`,
                                            `ผู้รับ ${link.assignee_name ?? "-"}`,
                                            link.ol_expires_on ? `หมดอายุหลัง ${formatDateOnly(link.ol_expires_on)}` : "ไม่หมดอายุ",
                                            link.preset_items.length > 0 ? `ล็อก: ${link.preset_items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}` : null,
                                            !link.ol_allow_more ? "ลูกค้าเลือกเพิ่มไม่ได้" : link.category_ids.length > 0 ? `${link.category_ids.length} หมวด` : "ทุกหมวด",
                                        ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                    {link.has_preset_problem && (
                                        <p className="text-sm text-red-600">ลูกค้าส่งคำขอไม่ได้: รายการที่เลือกให้ถูกปิดใช้งานหรือถูกลบ · กด &quot;แก้&quot; แล้วเลือกใหม่</p>
                                    )}
                                    {link.request_count > 0 && (
                                        <Link href={`/sales/service-requests?link=${link.ol_id}`} className="-my-2 w-fit py-2 text-sm text-blue-600 hover:underline">
                                            คำขอจากลิงก์นี้ {link.request_count} รายการ
                                        </Link>
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                    {link.ol_kind === "fastwork" ? (
                                        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => copyText(fastworkMessage(link), "คัดลอกข้อความแล้ว วางในแชต Fastwork ได้เลย")}>
                                            <MessageSquareText size={15} />
                                            คัดลอกข้อความ
                                        </button>
                                    ) : (
                                        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => copyLink(link)}>
                                            <Copy size={15} />
                                            คัดลอกลิงก์
                                        </button>
                                    )}
                                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setQrLink(link)}>
                                        <QrCode size={15} />
                                        QR code
                                    </button>
                                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setSheet({ link, preset: { kind: link.ol_kind, client: null, project: null } })}>
                                        <Pencil size={15} />
                                        แก้
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {sheet && (
                <LinkSheet
                    link={sheet.link}
                    preset={sheet.preset}
                    settings={settings}
                    onClose={() => setSheet(null)}
                    onSaved={async (saved) => {
                        await load();
                        if (sheet.link) return;
                        if (saved.ol_kind === "fastwork") await copyText(fastworkMessage(saved), "สร้างลิงก์และคัดลอกข้อความแล้ว วางในแชต Fastwork ได้เลย");
                        else await copyLink(saved);
                    }}
                />
            )}
            {qrLink && (
                <QrSheet
                    shopName={shopName}
                    shortUrl={`${window.location.origin}/o/${qrLink.ol_short_code}`}
                    fullUrl={`${window.location.origin}/o/${qrLink.ol_short_code}`}
                    fileName={`qr-${qrLink.ol_short_code}.png`}
                    onClose={() => setQrLink(null)}
                />
            )}
        </div>
    );
}
