"use client";

// ลายเซ็นของผู้ใช้ในหน้าแก้ไขผู้ใช้ (2026-10-13 ขั้น 1A-2) — ดูได้ · ยกเลิกได้ (เช่น พนักงานลาออก) · ตั้งแทนไม่ได้
import { useEffect, useState } from "react";
import { PenLine } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FieldHint from "@/components/ui/guidance/field-hint";
import SectionCard from "@/components/ui/section-card";
import SignatureImage from "@/components/signature/signature-image";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import formatDate from "@/app/function";

type ActiveSignature = { sig_id: string; sig_method: "upload" | "draw"; sig_created_at: string };

type UserSignaturePanelProps = {
    userId: string;
    canManage: boolean;
};

export default function UserSignaturePanel({ userId, canManage }: UserSignaturePanelProps) {
    const hasBit = usePermission();
    const canRevoke = canManage && hasBit(BITS.editUsers);
    const [signature, setSignature] = useState<ActiveSignature | null | undefined>(undefined);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ signature: ActiveSignature | null }>(`/users/${userId}/signature`).then(({ data }) => {
            if (!isLeftPage) setSignature(data?.signature ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [userId]);

    async function handleRevoke() {
        setIsRevoking(true);
        const { error } = await apiFetch(`/users/${userId}/signature`, { method: "DELETE" });
        setIsRevoking(false);
        if (error) {
            setRevokeError(error.message);
            return;
        }
        setSignature(null);
        setIsConfirmOpen(false);
        toast.success("ยกเลิกลายเซ็นแล้ว");
    }

    if (signature === undefined) return null;

    return (
        <SectionCard
            icon={PenLine}
            title="ลายเซ็น"
            description="ผู้ใช้ตั้งลายเซ็นเองที่หน้าโปรไฟล์ (ต้องยืนยันรหัสผ่าน) · ผู้ดูแลยกเลิกได้แต่ตั้งแทนไม่ได้"
        >
            {signature ? (
                <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="grid gap-2">
                        <SignatureImage signatureId={signature.sig_id} alt="ลายเซ็นของผู้ใช้" className="h-20 w-60" />
                        <p className="text-xs text-gray-500">ตั้งเมื่อ {formatDate(signature.sig_created_at)}</p>
                    </div>
                    {canRevoke && (
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            onClick={() => setIsConfirmOpen(true)}
                        >
                            ยกเลิกลายเซ็น
                        </button>
                    )}
                </div>
            ) : (
                <FieldHint>ยังไม่มีลายเซ็น · เอกสารที่ผู้ใช้นี้เสนอหรืออนุมัติจะเว้นช่องไว้ให้เซ็นด้วยมือ</FieldHint>
            )}

            <ConfirmDialog
                open={isConfirmOpen}
                variant="warning"
                title="ยกเลิกลายเซ็นของผู้ใช้นี้?"
                consequences={[
                    "เอกสารใหม่จะไม่มีลายเซ็นของผู้ใช้นี้จนกว่าเจ้าตัวจะตั้งใหม่",
                    "เอกสารที่อนุมัติไปแล้วยังแสดงลายเซ็นเดิม",
                ]}
                confirmLabel="ยกเลิกลายเซ็น"
                cancelLabel="ไม่ยกเลิก"
                loading={isRevoking}
                errorMessage={revokeError}
                onConfirm={handleRevoke}
                onCancel={() => {
                    setIsConfirmOpen(false);
                    setRevokeError(null);
                }}
            />
        </SectionCard>
    );
}
