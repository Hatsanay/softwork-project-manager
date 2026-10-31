"use client";

// ความต้องการจากลูกค้า (2026-10-25 · S-4) — คำขอจากลิงก์เลือกบริการที่เป็นที่มาของโปรเจกต์นี้
// สมาชิกทุกคนเห็น (ทีมใช้ออกแบบ/พัฒนา) · ไม่มีราคา · ไม่มีคำขอและไม่มีลิงก์เปิดรับ = ไม่แสดงการ์ด
// งาน Fastwork (S-5): ลิงก์ของงานยังเปิดรับ = ลูกค้าส่งเพิ่มได้ · "ปิดรับความต้องการ" = ปิดลิงก์ทุกอันของงาน (เริ่มออกแบบแล้ว)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Lock } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { formatQuantity } from "@/lib/shared/money.mjs";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import AnswersList from "@/app/order/_components/answers-list";
import type { RequestAnswer } from "@/app/order/_types";
import { openOrDownloadBlob } from "@/lib/open-blob";

type ProjectRequirement = {
    svr_id: string;
    svr_contact_name: string | null;
    svr_company_name: string | null;
    svr_note: string | null;
    svr_submitted_at: string;
    items: { type: "heading" | "item"; name: string; quantity: string; unit: string | null; in_package: boolean }[];
    answers: RequestAnswer[];
};

type RequirementsResponse = { data: ProjectRequirement[]; open_link_count: number };

export default function CustomerRequirementsCard({ projectId }: { projectId: string }) {
    const hasBit = usePermission();
    const canCloseLinks = hasBit(BITS.manageFastwork) || hasBit(BITS.manageServiceRequests);
    const [requests, setRequests] = useState<ProjectRequirement[]>([]);
    const [openLinkCount, setOpenLinkCount] = useState(0);
    const [isAskingClose, setIsAskingClose] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [closeError, setCloseError] = useState<string | null>(null);
    const path = `/projects/${encodeURIComponent(projectId)}/requirements`;

    const load = useCallback(async () => {
        const { data } = await apiFetch<RequirementsResponse>(path);
        setRequests(data?.data ?? []);
        setOpenLinkCount(data?.open_link_count ?? 0);
    }, [path]);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<RequirementsResponse>(path).then(({ data }) => {
            if (isLeftPage) return;
            setRequests(data?.data ?? []);
            setOpenLinkCount(data?.open_link_count ?? 0);
        });
        return () => {
            isLeftPage = true;
        };
    }, [path]);

    if (requests.length === 0 && openLinkCount === 0) return null;

    async function closeLinks() {
        setIsClosing(true);
        const { error } = await apiFetch(`${path}/close-links`, { method: "POST", body: {} });
        setIsClosing(false);
        if (error) {
            setCloseError(error.message);
            return;
        }
        setIsAskingClose(false);
        toast.success("ปิดรับความต้องการแล้ว");
        await load();
    }

    async function openFile(file: RequestAnswer["files"][number]) {
        const blob = await apiFetchBlob(`/projects/${encodeURIComponent(projectId)}/requirements/files/${file.id}`);
        if (!blob) {
            toast.error("เปิดไฟล์ไม่สำเร็จ");
            return;
        }
        openOrDownloadBlob(blob, file.name, file.is_viewable);
    }

    return (
        <SectionCard
            id="project-requirements"
            title="ความต้องการจากลูกค้า"
            description="สิ่งที่ลูกค้าเลือกและตอบไว้ในลิงก์เลือกบริการ ใช้เป็นข้อมูลออกแบบและพัฒนา"
            icon={ClipboardList}
            actions={
                canCloseLinks &&
                openLinkCount > 0 && (
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setIsAskingClose(true)}>
                        <Lock size={15} />
                        ปิดรับความต้องการ
                    </button>
                )
            }
        >
            {openLinkCount > 0 && (
                <StatusBanner tone="wait" title="ลูกค้ายังส่งเพิ่มได้">
                    ลิงก์ของงานนี้เปิดรับอยู่ {openLinkCount} ลิงก์ · เริ่มออกแบบแล้วให้กดปิดรับ การแก้ต่อจากนั้นคุยในแชต Fastwork
                </StatusBanner>
            )}
            {requests.length === 0 && <p className="text-sm text-gray-500">ยังไม่มีคำขอจากลิงก์</p>}
            <div className="grid gap-3">
                {requests.map((request, index) => (
                    <details key={request.svr_id} open={index === requests.length - 1} className="group rounded-xl border border-gray-200 p-3 sm:p-4">
                        <summary className="flex min-h-9 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                            <span className="text-sm font-medium text-gray-900">
                                คำขอ {request.svr_id}
                                {request.svr_contact_name ? ` · ${request.svr_contact_name}` : ""}
                                {request.svr_company_name ? ` (${request.svr_company_name})` : ""}
                            </span>
                            <span className="text-xs text-gray-500">ส่งเมื่อ {request.svr_submitted_at}</span>
                        </summary>
                        <div className="mt-3 grid gap-4">
                            <div className="grid gap-1.5">
                                <h3 className="text-sm font-medium text-blue-700">สิ่งที่เลือก</h3>
                                <ul className="grid gap-1 text-sm">
                                    {request.items.map((item, itemIndex) =>
                                        item.type === "heading" ? (
                                            <li key={itemIndex} className="pt-1 font-medium text-gray-900">
                                                {item.name} × {formatQuantity(item.quantity)} ชุด
                                            </li>
                                        ) : (
                                            <li key={itemIndex} className={`wrap-break-word ${item.in_package ? "pl-3 text-gray-600" : "text-gray-800"}`}>
                                                {item.name} × {formatQuantity(item.quantity)} {item.unit ?? ""}
                                            </li>
                                        ),
                                    )}
                                </ul>
                            </div>
                            {request.svr_note && (
                                <div className="grid gap-1">
                                    <h3 className="text-sm font-medium text-blue-700">ข้อความจากลูกค้า</h3>
                                    <p className="rounded-xl bg-gray-50 p-3 text-sm whitespace-pre-line wrap-break-word text-gray-700">{request.svr_note}</p>
                                </div>
                            )}
                            {request.answers.length > 0 && <AnswersList answers={request.answers} onOpenFile={openFile} />}
                        </div>
                    </details>
                ))}
            </div>
            <ConfirmDialog
                open={isAskingClose}
                title="ปิดรับความต้องการ?"
                description="ลิงก์ทุกอันของงานนี้จะปิด ลูกค้าเปิดแล้วเห็นว่าปิดรับ · คำขอที่ส่งแล้วยังอยู่ · เปิดลิงก์ใหม่ได้ที่หน้าลิงก์เลือกบริการ"
                confirmLabel="ปิดรับ"
                variant="warning"
                loading={isClosing}
                loadingLabel="กำลังปิด..."
                errorMessage={closeError}
                onConfirm={closeLinks}
                onCancel={() => {
                    setIsAskingClose(false);
                    setCloseError(null);
                }}
            />
        </SectionCard>
    );
}
