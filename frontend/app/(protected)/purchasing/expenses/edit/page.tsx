"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import ExpenseForm from "../_components/expense-form";
import { useExpenseOptions } from "../_hooks/use-expense-options";
import type { ExpenseDetail } from "../_types";

export default function EditExpensePage() {
    const expenseId = useSearchParams().get("id");
    const { options, loadError: optionsError } = useExpenseOptions();
    const [detail, setDetail] = useState<ExpenseDetail | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        if (!expenseId) return;
        let isLeftPage = false;
        apiFetch<ExpenseDetail>(`/expenses/${expenseId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [expenseId]);

    const error = loadError ?? optionsError;
    const isNotDraft = detail && !detail.actions.can_edit;

    return (
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ · ค่าใช้จ่าย"
                title="แก้ไขร่างค่าใช้จ่าย"
                description="แก้ได้ทุกช่องจนกว่าจะส่ง · ส่งแล้วแก้ไม่ได้ (ผู้อนุมัติตีกลับให้แก้ได้)"
            />
            {!expenseId && (
                <StatusBanner tone="error" title="ไม่พบรายการนี้">
                    กลับไปเลือกจากหน้ารายการ
                </StatusBanner>
            )}
            {error && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {error.message}
                </StatusBanner>
            )}
            {isNotDraft && (
                <StatusBanner tone="warn" title="รายการนี้แก้ไขไม่ได้">
                    แก้ได้เฉพาะร่างที่คุณมีสิทธิ์บันทึก — กลับไปที่หน้ารายการเพื่อดูสถานะล่าสุด
                </StatusBanner>
            )}
            {expenseId && !error && (!detail || !options) && <PageSkeleton />}
            {detail && options && !isNotDraft && <ExpenseForm options={options} detail={detail} />}
        </div>
    );
}
