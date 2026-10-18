"use client";

// บัตรพนักงาน (ข้อ 3.4) — รูปบนบัตร · บัตรทุกใบ (ใช้ได้ทีละใบ) · พิมพ์ · ออกบัตรใหม่ · บันทึกคืนบัตรเก่า
import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Camera, CreditCard, Printer, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import StatusPill from "@/components/ui/status-pill";
import FieldHint from "@/components/ui/guidance/field-hint";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import formatDate, { formatDateOnly } from "@/app/function";
import { apiFetch, uploadedFileUrl } from "@/lib/api";
import { EMPLOYEE_CARD_REASONS } from "@/lib/shared/schemas/people.mjs";
import { EMPLOYEE_MESSAGES } from "../../../_messages";
import type { Employee, EmployeeCard } from "../../../_types";
import { cardPrintHref, cardStatusOf, nameInitial } from "../../_card-status";
import IssueCardDialog from "./issue-card-dialog";

export default function EmployeeCardsCard({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
    const fileInput = useRef<HTMLInputElement>(null);
    const [isIssuing, setIsIssuing] = useState(false);
    const [photoError, setPhotoError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [returnTarget, setReturnTarget] = useState<EmployeeCard | null>(null);
    const [returnError, setReturnError] = useState<string | null>(null);
    const [isReturning, setIsReturning] = useState(false);

    const isTerminated = employee.employment_status === "terminated";
    const photoUrl = employee.emp_photo_url ?? employee.user_avatar_url;

    async function uploadPhoto(file: File) {
        const body = new FormData();
        body.append("photo", file);
        setIsUploading(true);
        setPhotoError(null);
        const { data, error } = await apiFetch<{ is_pending_card_updated: boolean }>(`/employees/${employee.emp_id}/photo`, {
            method: "POST",
            body,
        });
        setIsUploading(false);
        if (fileInput.current) fileInput.current.value = "";
        if (error) {
            setPhotoError(error.fields.photo ?? error.message);
            return;
        }
        toast.success(data.is_pending_card_updated ? "บันทึกรูปแล้ว · บัตรที่รอพิมพ์ใช้รูปนี้" : "บันทึกรูปแล้ว");
        onChanged();
    }

    async function removePhoto() {
        setPhotoError(null);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/photo`, { method: "DELETE" });
        if (error) {
            setPhotoError(error.message);
            return;
        }
        toast.success("ลบรูปแล้ว");
        onChanged();
    }

    async function markReturned() {
        if (!returnTarget) return;
        setIsReturning(true);
        const { error } = await apiFetch(`/employees/${employee.emp_id}/cards/${returnTarget.ec_id}/returned`, {
            method: "POST",
        });
        setIsReturning(false);
        if (error) {
            setReturnError(error.message);
            return;
        }
        setReturnTarget(null);
        setReturnError(null);
        toast.success(`บันทึกว่าเก็บบัตรใบที่ ${returnTarget.ec_seq} คืนแล้ว`);
        onChanged();
    }

    return (
        <SectionCard
            icon={CreditCard}
            title="บัตรพนักงาน"
            description={EMPLOYEE_MESSAGES.cards}
            actions={
                !isTerminated && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsIssuing(true)}>
                        <CreditCard size={16} />
                        ออกบัตรใหม่
                    </button>
                )
            }
        >
            <div className="flex flex-wrap items-start gap-4">
                <div className="flex h-32 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gray-100 text-2xl font-medium text-gray-400">
                    {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadedFileUrl(photoUrl)} alt="รูปพนักงาน" className="h-full w-full object-cover" />
                    ) : (
                        nameInitial(employee.emp_first_name_th)
                    )}
                </div>
                <div className="grid min-w-0 flex-1 basis-56 content-start gap-2">
                    <p className="text-sm text-gray-800">
                        {employee.emp_photo_url
                            ? "รูปพนักงาน"
                            : employee.user_avatar_url
                              ? "ยังไม่มีรูปพนักงาน · ใช้รูปโปรไฟล์บัญชีผู้ใช้ที่ผูกแทน"
                              : "ยังไม่มีรูป · บัตรจะแสดงตัวอักษรแรกของชื่อแทน"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="hidden"
                            onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) uploadPhoto(file);
                            }}
                        />
                        <button
                            type="button"
                            className={buttonClass("secondary", "sm")}
                            disabled={isUploading}
                            onClick={() => fileInput.current?.click()}
                        >
                            <Camera size={15} />
                            {isUploading ? "กำลังอัปโหลด..." : employee.emp_photo_url ? "เปลี่ยนรูป" : "อัปโหลดรูป"}
                        </button>
                        {employee.emp_photo_url && (
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={removePhoto}>
                                <Trash2 size={15} />
                                ลบรูป
                            </button>
                        )}
                    </div>
                    <FieldHint error={photoError}>{EMPLOYEE_MESSAGES.photo}</FieldHint>
                </div>
            </div>

            {employee.cards.length === 0 ? (
                <p className="text-sm text-gray-500">ยังไม่มีบัตร</p>
            ) : (
                <ol className="grid gap-2">
                    {employee.cards.map((card) => {
                        const status = cardStatusOf(card, isTerminated, employee.today);
                        const isActive = !card.ec_voided_at;
                        return (
                            <li
                                key={card.ec_id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3"
                            >
                                <div className="grid min-w-0 gap-0.5 text-sm">
                                    <span className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium text-gray-900">ใบที่ {card.ec_seq}</span>
                                        <StatusPill tone={status.tone}>{status.label}</StatusPill>
                                    </span>
                                    <span className="tracking-wider break-all text-gray-700 tabular-nums">{card.ec_emp_code}</span>
                                    <span className="text-xs text-gray-500">
                                        ออก {formatDate(card.ec_issued_at)} · ใช้ได้ถึง {formatDateOnly(card.ec_expires_on)} ·{" "}
                                        {EMPLOYEE_CARD_REASONS[card.ec_reason]}
                                        {card.ec_note ? ` · ${card.ec_note}` : ""}
                                        {card.ec_void_reason ? ` · ยกเลิกเพราะ ${card.ec_void_reason}` : ""}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {status.needsReturn && (
                                        <button
                                            type="button"
                                            className={buttonClass("secondary", "sm")}
                                            onClick={() => setReturnTarget(card)}
                                        >
                                            บันทึกว่าคืนแล้ว
                                        </button>
                                    )}
                                    <Link
                                        href={cardPrintHref(employee.emp_id, card.ec_id)}
                                        target="_blank"
                                        className={buttonClass(isActive && !card.ec_printed_at ? "primary" : "ghost", "sm")}
                                    >
                                        <Printer size={15} />
                                        {isActive ? (card.ec_printed_at ? "พิมพ์ซ้ำ" : "พิมพ์บัตร") : "ดูบัตร"}
                                    </Link>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}

            {isIssuing && (
                <IssueCardDialog
                    employee={employee}
                    onClose={(isSaved) => {
                        setIsIssuing(false);
                        if (isSaved) onChanged();
                    }}
                />
            )}
            <ConfirmDialog
                open={returnTarget !== null}
                title={`เก็บบัตรใบที่ ${returnTarget?.ec_seq ?? ""} คืนแล้ว?`}
                description="บันทึกเมื่อได้บัตรตัวจริงคืนมาแล้วเท่านั้น · บัตรออกจากรายการ บัตรที่ยังไม่ได้คืน"
                confirmLabel="บันทึกว่าคืนแล้ว"
                variant="info"
                loading={isReturning}
                errorMessage={returnError}
                onConfirm={markReturned}
                onCancel={() => {
                    setReturnTarget(null);
                    setReturnError(null);
                }}
            />
        </SectionCard>
    );
}
