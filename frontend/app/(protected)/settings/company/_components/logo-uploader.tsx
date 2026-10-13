"use client";

// โลโก้บริษัท — อัปโหลดแล้วบันทึกทันที (ไม่ต้องกดบันทึกฟอร์ม) · ลบได้ เอกสารเก่ายังใช้โลโก้เดิม
import { useRef, useState } from "react";
import Image from "next/image";
import { ImageUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import FieldHint from "@/components/ui/guidance/field-hint";
import { apiFetch, uploadedFileUrl, type ApiError } from "@/lib/api";
import { COMPANY_MESSAGES } from "../_messages";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { buttonClass } from "@/components/ui/button";

type LogoUploaderProps = {
    logoUrl: string | null;
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

export default function LogoUploader({ logoUrl, canEdit, onSaved }: LogoUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<ApiError | null>(null);

    async function handleFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = ""; // เลือกไฟล์เดิมซ้ำได้
        if (!file) return;

        const form = new FormData();
        form.append("logo", file);
        await sendLogoRequest(() => apiFetch("/company/logo", { method: "POST", body: form }));
    }

    async function handleRemove() {
        await sendLogoRequest(() => apiFetch("/company/logo", { method: "DELETE" }));
    }

    async function sendLogoRequest(request: () => ReturnType<typeof apiFetch>) {
        setIsSaving(true);
        setSaveError(null);
        const { error } = await request();
        setIsSaving(false);
        if (error) {
            setSaveError(error);
            return;
        }
        toast.success(COMPANY_MESSAGES.saved);
        await onSaved();
    }

    return (
        <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-gray-300 bg-gray-50/60 p-4">
                <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-card">
                    {logoUrl ? (
                        <Image
                            src={uploadedFileUrl(logoUrl)}
                            alt="โลโก้บริษัท"
                            width={112}
                            height={80}
                            unoptimized
                            className="h-full w-full object-contain p-2"
                        />
                    ) : (
                        <span className="text-xs text-gray-400">ยังไม่มีโลโก้</span>
                    )}
                </div>
                <div className="grid min-w-48 flex-1 gap-1">
                    <p className="text-sm text-gray-800">
                        {logoUrl ? "โลโก้ปัจจุบัน" : "ยังไม่มีโลโก้ — เอกสารจะแสดงแค่ชื่อบริษัท"}
                    </p>
                    <FieldHint error={saveError?.fields.logo}>{COMPANY_MESSAGES.info.logo}</FieldHint>
                </div>
                {canEdit && (
                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={handleFileChosen}
                        />
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={isSaving}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <ImageUp size={15} />
                            {isSaving ? "กำลังบันทึก..." : logoUrl ? "เปลี่ยนโลโก้" : "เลือกไฟล์โลโก้"}
                        </button>
                        {logoUrl && (
                            <button
                                type="button"
                                className={buttonClass("ghost", "sm")}
                                disabled={isSaving}
                                onClick={handleRemove}
                            >
                                <Trash2 size={15} />
                                ลบ
                            </button>
                        )}
                    </div>
                )}
            </div>
            {saveError && !saveError.fields.logo && <SaveErrorBanner error={saveError} />}
        </div>
    );
}
