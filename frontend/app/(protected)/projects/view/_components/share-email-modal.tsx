"use client";

// ส่งลิงก์ติดตามงานให้ลูกค้าทางอีเมล (แยกจาก page.tsx 2026-10-30 · ส่วน C) · เปิดเมื่อเปิดใช้ลิงก์ลูกค้าแล้ว (หน้าโปรเจกต์ตรวจก่อนเปิด)
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import { formatDateOnly } from "@/app/function";
import { authHeader } from "../_lib/view-helpers";
import type { ProjectDetail } from "../_types";

export default function ShareEmailModal({
    project,
    shareUrl,
    onClose,
}: {
    project: ProjectDetail;
    shareUrl: string;
    onClose: () => void;
}) {
    const projectId = project.project_id;
    // เปิดหน้าต่างใหม่ทุกครั้ง = เริ่มจากอีเมลลูกค้าของโปรเจกต์
    const [shareEmailForm, setShareEmailForm] = useState({ to: project.client_email ?? "", message: "" });
    const [shareEmailError, setShareEmailError] = useState<string | null>(null);
    const [isSendingShareEmail, setIsSendingShareEmail] = useState(false);

    async function handleSendShareEmail(e: React.FormEvent) {
        e.preventDefault();
        setShareEmailError(null);
        if (!shareEmailForm.to.trim()) {
            setShareEmailError("กรุณากรอกอีเมลผู้รับ");
            return;
        }
        setIsSendingShareEmail(true);
        try {
            const res = await fetch(`${api}/projects/${projectId}/share/send-email`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify({ to: shareEmailForm.to.trim(), message: shareEmailForm.message.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                toast.success("ส่งลิงก์ให้ลูกค้าทางอีเมลแล้ว");
                onClose();
            } else {
                setShareEmailError(data.message ?? "ส่งอีเมลไม่สำเร็จ กรุณาลองใหม่");
            }
        } catch {
            setShareEmailError("เกิดข้อผิดพลาด กรุณาลองใหม่");
        } finally {
            setIsSendingShareEmail(false);
        }
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={() => onClose()}
        >
            <div
                className="bg-white rounded-t-2xl sm:rounded-2xl shadow-float w-full max-w-2xl p-6 space-y-4 max-h-[90dvh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            className="w-5 h-5"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-base font-medium text-gray-900">ส่งลิงก์ให้ลูกค้าทางอีเมล</h2>
                        <p className="text-sm text-gray-500">
                            ลูกค้าจะได้รับลิงก์ติดตามความคืบหน้าของ &ldquo;{project.project_name}&rdquo; แบบดูอย่างเดียว
                            ไม่ต้องเข้าสู่ระบบ
                        </p>
                    </div>
                </div>

                <form onSubmit={handleSendShareEmail} className="space-y-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">อีเมลผู้รับ</label>
                        <Input
                            type="email"
                            value={shareEmailForm.to}
                            onChange={(e) => setShareEmailForm((p) => ({ ...p, to: e.target.value }))}
                            placeholder="client@example.com"
                            required
                        />
                        {!project.client_email && (
                            <p className="text-xs text-amber-600">ยังไม่มีอีเมลลูกค้าในระบบ กรุณากรอกอีเมลเอง</p>
                        )}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ข้อความถึงลูกค้า (ไม่บังคับ)</label>
                        <textarea
                            value={shareEmailForm.message}
                            onChange={(e) => setShareEmailForm((p) => ({ ...p, message: e.target.value }))}
                            rows={3}
                            placeholder="เช่น อัปเดตความคืบหน้าล่าสุดของโปรเจกต์ให้ทราบครับ"
                            className={inputClass(false)}
                        />
                    </div>

                    <div className="rounded-lg bg-gray-50 border border-gray-100 p-3 space-y-1.5">
                        <p className="text-xs font-medium text-gray-500">ข้อมูลที่จะแนบไปในอีเมล</p>
                        <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>ความคืบหน้าปัจจุบัน</span>
                            <span className="font-medium text-gray-800">
                                {Number(project.project_progress_percent)}%
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-600">
                            <span>วันครบกำหนด</span>
                            <span className="font-medium text-gray-800">
                                {formatDateOnly(project.project_due_date)}
                            </span>
                        </div>
                        <div className="pt-1 text-xs text-gray-400 break-all">{shareUrl}</div>
                    </div>

                    {shareEmailError && <p className="text-sm text-red-600">{shareEmailError}</p>}

                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => onClose()} className={buttonClass("secondary", "md")}>
                            ยกเลิก
                        </button>
                        <Button type="submit" disabled={isSendingShareEmail}>
                            {isSendingShareEmail ? "กำลังส่ง..." : "ส่งอีเมล"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
