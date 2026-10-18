"use client";

// การเข้าระบบของบัญชีที่ผูกกับพนักงานที่ตั้งพ้นสภาพแล้ว (2026-10-18 · docs/plans/2026-10-18-user-employee-link.md ข้อ 2)
// ปิดตามวันทำงานวันสุดท้าย (ไม่ได้ปิดทันที) · เปิด/ปิดกลับได้เสมอ · ยกเลิกพ้นสภาพ = เข้าได้เหมือนเดิม
import { useState } from "react";
import { toast } from "sonner";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import type { Employee } from "../../../_types";

export default function LoginAccessBanner({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { state, last_day: lastDay } = employee.login_access;
    const username = employee.user_username;

    async function setClosure(closeLogin: boolean) {
        setIsSaving(true);
        setError(null);
        const { error: saveError } = await apiFetch(`/employees/${employee.emp_id}/login-closure`, {
            method: "POST",
            body: { emp_close_login_on_termination: closeLogin },
        });
        setIsSaving(false);
        if (saveError) {
            setError(saveError.message);
            return;
        }
        toast.success(closeLogin ? "ตั้งให้ปิดการเข้าระบบหลังวันสุดท้ายแล้ว" : "ให้บัญชีนี้เข้าระบบต่อได้แล้ว");
        onChanged();
    }

    function actionButton(label: string, closeLogin: boolean) {
        return (
            <div className="mt-2 grid gap-1">
                <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => setClosure(closeLogin)}
                    className={`${buttonClass("secondary", "sm")} justify-self-start`}
                >
                    {isSaving ? "กำลังบันทึก..." : label}
                </button>
                <FieldHint error={error} />
            </div>
        );
    }

    if (state === "closes_after" && lastDay) {
        return (
            <StatusBanner tone="info" title={`บัญชี ${username} เข้าระบบได้ถึง ${formatDateOnly(lastDay)}`}>
                หลังวันทำงานวันสุดท้ายระบบปิดการเข้าระบบเอง (คนที่เข้าค้างอยู่ก็ใช้ต่อไม่ได้) · เลื่อนวันพ้นสภาพหรือยกเลิกพ้นสภาพ
                การปิดเลื่อนตาม
                {actionButton("ให้เข้าระบบต่อหลังพ้นสภาพ", false)}
            </StatusBanner>
        );
    }
    if (state === "closed" && lastDay) {
        return (
            <StatusBanner tone="done" title={`ปิดการเข้าระบบของบัญชี ${username} แล้ว`}>
                ปิดตั้งแต่วันถัดจากวันทำงานวันสุดท้าย ({formatDateOnly(lastDay)}) · ข้อมูลและประวัติของบัญชียังอยู่ครบ
                {actionButton("เปิดให้เข้าระบบต่อ", false)}
            </StatusBanner>
        );
    }
    if (state === "kept_open" && lastDay) {
        const isPast = lastDay < employee.today;
        return (
            <StatusBanner tone="warn" title={`บัญชี ${username} ยังเข้าระบบได้${isPast ? "แม้พ้นสภาพแล้ว" : "หลังพ้นสภาพ"}`}>
                ตั้งไว้ไม่ปิดการเข้าระบบ · ถ้าไม่ได้ตั้งใจให้เข้าต่อ ให้กดปิด (มีผลหลังวันสุดท้าย {formatDateOnly(lastDay)})
                {actionButton("ปิดการเข้าระบบหลังวันสุดท้าย", true)}
            </StatusBanner>
        );
    }
    return null;
}
