"use client";

// ปุ่ม "คัดลอกลิงก์ให้ลูกค้า" ในหน้าเอกสาร (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md ข้อ 2.4)
// ลิงก์ = หน้าเอกสาร A4 ในลิงก์ติดตามงานของโปรเจกต์ · ลิงก์หรือการแสดงเอกสารยังปิดอยู่ = ถามก่อนเปิด (ต้องมีสิทธิ์จัดการลิงก์ลูกค้าของโปรเจกต์)
import { useState } from "react";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type ShareState = { project_share_token: string; project_share_enabled: number; project_share_documents: number };

export default function CopyCustomerLinkButton({
    projectId,
    type,
    documentId,
}: {
    projectId: string;
    type: "quotation" | "invoice" | "receipt";
    documentId: string;
}) {
    const [pending, setPending] = useState<ShareState | null>(null);
    const [isWorking, setIsWorking] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    async function copy(token: string) {
        const link = `${window.location.origin}/share/${token}/document?type=${type}&id=${encodeURIComponent(documentId)}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success("คัดลอกลิงก์เอกสารแล้ว ส่งให้ลูกค้าได้เลย");
        } catch {
            toast.error(`คัดลอกไม่ได้ ลิงก์คือ ${link}`);
        }
    }

    async function start() {
        setIsWorking(true);
        const { data, error } = await apiFetch<ShareState>(`/projects/${encodeURIComponent(projectId)}`);
        setIsWorking(false);
        if (error || !data) {
            toast.error(error?.message ?? "โหลดลิงก์ของโปรเจกต์ไม่สำเร็จ");
            return;
        }
        if (data.project_share_enabled && data.project_share_documents) {
            await copy(data.project_share_token);
            return;
        }
        setErrorMessage(null);
        setPending(data);
    }

    async function enableAndCopy() {
        if (!pending) return;
        setIsWorking(true);
        const steps: [string, Record<string, boolean>][] = [];
        if (!pending.project_share_enabled)
            steps.push([`/projects/${projectId}/share/toggle`, { project_share_enabled: true }]);
        if (!pending.project_share_documents)
            steps.push([`/projects/${projectId}/share/documents`, { project_share_documents: true }]);
        for (const [path, body] of steps) {
            const { error } = await apiFetch(path, { method: "PUT", body });
            if (error) {
                setIsWorking(false);
                setErrorMessage(
                    error.status === 403
                        ? "ต้องเป็นสมาชิกโปรเจกต์ที่จัดการลิงก์ลูกค้าได้ · ให้ PM เปิดในหน้าโปรเจกต์"
                        : error.message,
                );
                return;
            }
        }
        setIsWorking(false);
        const token = pending.project_share_token;
        setPending(null);
        await copy(token);
    }

    return (
        <>
            <button type="button" className={buttonClass("secondary", "md")} disabled={isWorking} onClick={start}>
                <Link2 size={16} aria-hidden="true" />
                คัดลอกลิงก์ให้ลูกค้า
            </button>
            <ConfirmDialog
                open={pending !== null}
                title="เปิดให้ลูกค้าเห็นเอกสารในลิงก์?"
                description={
                    pending && !pending.project_share_enabled
                        ? "ลิงก์ติดตามงานของโปรเจกต์นี้ปิดอยู่ · เปิดลิงก์และแสดงเอกสาร (ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ของโปรเจกต์) แล้วคัดลอกลิงก์เอกสารนี้"
                        : "ลิงก์ติดตามงานยังไม่แสดงเอกสาร · เปิดแสดงเอกสาร (ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ ของโปรเจกต์) แล้วคัดลอกลิงก์เอกสารนี้"
                }
                confirmLabel="เปิดแล้วคัดลอก"
                loading={isWorking}
                errorMessage={errorMessage}
                onConfirm={enableAndCopy}
                onCancel={() => setPending(null)}
            />
        </>
    );
}
