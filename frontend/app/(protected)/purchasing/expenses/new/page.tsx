"use client";

import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ExpenseForm from "../_components/expense-form";
import { useExpenseOptions } from "../_hooks/use-expense-options";
import { EXPENSE_MESSAGES } from "../_messages";

export default function NewExpensePage() {
    const { options, loadError } = useExpenseOptions();

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="จัดซื้อ · ค่าใช้จ่าย"
                title="บันทึกค่าใช้จ่าย / บิลผู้ขาย"
                description={EXPENSE_MESSAGES.approval}
            />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลสำหรับฟอร์มไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!options && !loadError && <PageSkeleton />}
            {options && <ExpenseForm options={options} />}
        </div>
    );
}
