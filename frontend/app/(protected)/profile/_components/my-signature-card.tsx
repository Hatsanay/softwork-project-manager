"use client";

// ลายเซ็นของฉัน (2026-10-13 ขั้น 1A-2 — sales-cycle หัวข้อ 6) — อัปโหลดรูป หรือเซ็นบนจอ · ต้องยืนยันรหัสผ่านก่อนบันทึก
import { useEffect, useRef, useState } from "react";
import { PenLine, Upload } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";
import SignatureImage from "@/components/signature/signature-image";
import SignaturePad, { type SignaturePadHandle } from "@/components/signature/signature-pad";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, type ApiError } from "@/lib/api";
import formatDate from "@/app/function";

type ActiveSignature = { sig_id: string; sig_method: "upload" | "draw"; sig_created_at: string };
type SignatureMethod = "draw" | "upload";

const HINTS = {
    card: "ลายเซ็นนี้จะพิมพ์บนใบเสนอราคาที่คุณเป็นผู้เสนอราคาหรือผู้อนุมัติชั้นสุดท้าย · เปลี่ยนทีหลังได้ เอกสารที่อนุมัติไปแล้วใช้ลายเซ็นเดิม · ต้องยืนยันรหัสผ่าน",
    noSignature: "ยังไม่มีลายเซ็น · เอกสารจะเว้นช่องว่างไว้ให้เซ็นด้วยมือแทน (ไม่บล็อกการอนุมัติ)",
    upload: "รูปถ่ายหรือสแกนลายเซ็นหมึกเข้มบนกระดาษขาว (PNG, JPG, WebP) · ระบบทำพื้นโปร่งใสและตัดขอบให้",
    password: "รหัสผ่านเดียวกับที่ใช้เข้าระบบ · กันคนอื่นที่ใช้เครื่องคุณอยู่ตั้งลายเซ็นแทน",
    revoke: "ยกเลิกแล้วเอกสารใหม่จะไม่มีลายเซ็นของคุณ · เอกสารที่อนุมัติไปแล้วยังแสดงลายเซ็นเดิม",
};

export default function MySignatureCard() {
    const [signature, setSignature] = useState<ActiveSignature | null | undefined>(undefined);
    const [isEditing, setIsEditing] = useState(false);
    const [method, setMethod] = useState<SignatureMethod>("draw");
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [hasDrawing, setHasDrawing] = useState(false);
    const [password, setPassword] = useState("");
    const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isRevokeOpen, setIsRevokeOpen] = useState(false);
    const [revokeError, setRevokeError] = useState<string | null>(null);
    const [isRevoking, setIsRevoking] = useState(false);
    const padRef = useRef<SignaturePadHandle>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ signature: ActiveSignature | null }>("/users/me/signature").then(({ data }) => {
            if (!isLeftPage) setSignature(data?.signature ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    function openEditor() {
        setIsEditing(true);
        setUploadFile(null);
        setHasDrawing(false);
        setPassword("");
        setFieldErrors({});
        setSaveError(null);
    }

    async function handleSave(event: React.FormEvent) {
        event.preventDefault();
        setSaveError(null);
        const errors: Record<string, string> = {};
        const image = method === "draw" ? await padRef.current?.toPngBlob() : uploadFile;
        if (!image) errors.signature = method === "draw" ? "กรุณาเซ็นชื่อในกรอบก่อน" : "กรุณาเลือกรูปลายเซ็น";
        if (!password) errors.password = "กรุณากรอกรหัสผ่านของคุณ";
        setFieldErrors(errors);
        if (!image || !password) return;

        const form = new FormData();
        form.append("signature", image, method === "draw" ? "signature.png" : (uploadFile?.name ?? "signature"));
        form.append("method", method);
        form.append("password", password);

        setIsSaving(true);
        const { data, error } = await apiFetch<{ signature: ActiveSignature }>("/users/me/signature", {
            method: "PUT",
            body: form,
        });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        setSignature(data.signature);
        setIsEditing(false);
        setPassword("");
        toast.success("บันทึกลายเซ็นแล้ว");
    }

    async function handleRevoke() {
        setIsRevoking(true);
        const { error } = await apiFetch("/users/me/signature", { method: "DELETE" });
        setIsRevoking(false);
        if (error) {
            setRevokeError(error.message);
            return;
        }
        setSignature(null);
        setIsRevokeOpen(false);
        toast.success("ยกเลิกลายเซ็นแล้ว");
    }

    return (
        <SectionCard
            icon={PenLine}
            title="ลายเซ็นของฉัน"
            description={HINTS.card}
            actions={
                signature !== undefined &&
                !isEditing && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={openEditor}>
                        {signature ? "เปลี่ยนลายเซ็น" : "ตั้งลายเซ็น"}
                    </button>
                )
            }
        >
            {signature && !isEditing && (
                <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="grid gap-2">
                        <SignatureImage signatureId={signature.sig_id} alt="ลายเซ็นของฉัน" className="h-20 w-60" />
                        <p className="text-xs text-gray-500">
                            {signature.sig_method === "draw" ? "เซ็นบนจอ" : "อัปโหลดรูป"} · ตั้งเมื่อ{" "}
                            {formatDate(signature.sig_created_at)}
                        </p>
                    </div>
                    <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setIsRevokeOpen(true)}>
                        ยกเลิกลายเซ็น
                    </button>
                </div>
            )}
            {signature === null && !isEditing && <FieldHint>{HINTS.noSignature}</FieldHint>}

            {isEditing && (
                <form onSubmit={handleSave} className="grid gap-4 rounded-lg bg-gray-50 p-4" noValidate>
                    <Segmented<SignatureMethod>
                        label="วิธีตั้งลายเซ็น"
                        value={method}
                        onChange={(value) => {
                            setMethod(value);
                            setFieldErrors({});
                        }}
                        options={[
                            { value: "draw", label: "เซ็นบนจอ" },
                            { value: "upload", label: "อัปโหลดรูป" },
                        ]}
                    />

                    {method === "draw" ? (
                        <div className="grid gap-1">
                            <SignaturePad ref={padRef} onChange={setHasDrawing} />
                            <FieldHint error={fieldErrors.signature}>
                                {hasDrawing ? 'ไม่พอใจกด "ล้าง" แล้วเซ็นใหม่' : "ใช้เมาส์ ปากกา หรือนิ้วเซ็นในกรอบ"}
                            </FieldHint>
                        </div>
                    ) : (
                        <FormField
                            label="รูปลายเซ็น"
                            htmlFor="signature_file"
                            hint={HINTS.upload}
                            error={fieldErrors.signature}
                        >
                            <label
                                htmlFor="signature_file"
                                className={`${buttonClass("secondary", "md")} w-fit cursor-pointer`}
                            >
                                <Upload size={16} />
                                {uploadFile ? uploadFile.name : "เลือกไฟล์"}
                            </label>
                            <input
                                id="signature_file"
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="sr-only"
                                onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                            />
                        </FormField>
                    )}

                    <FormField
                        label="ยืนยันรหัสผ่าน"
                        htmlFor="signature_password"
                        required
                        hint={HINTS.password}
                        error={fieldErrors.password}
                        className="sm:max-w-sm"
                    >
                        <input
                            id="signature_password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className={inputClass(Boolean(fieldErrors.password))}
                        />
                    </FormField>

                    <SaveErrorBanner error={saveError} />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={SECONDARY_BUTTON} onClick={() => setIsEditing(false)}>
                            ยกเลิก
                        </button>
                        <button type="submit" className={PRIMARY_BUTTON} disabled={isSaving}>
                            {isSaving ? "กำลังบันทึก..." : "บันทึกลายเซ็น"}
                        </button>
                    </div>
                </form>
            )}

            <ConfirmDialog
                open={isRevokeOpen}
                variant="warning"
                title="ยกเลิกลายเซ็นของคุณ?"
                consequences={[HINTS.revoke]}
                confirmLabel="ยกเลิกลายเซ็น"
                cancelLabel="ไม่ยกเลิก"
                loading={isRevoking}
                errorMessage={revokeError}
                onConfirm={handleRevoke}
                onCancel={() => {
                    setIsRevokeOpen(false);
                    setRevokeError(null);
                }}
            />
        </SectionCard>
    );
}
