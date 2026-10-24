"use client";

// ทำจ่าย (ขั้น 2-4) — มาจากเมนู (เลือกผู้รับเอง) หรือจากปุ่ม "ทำจ่าย" ในหน้ารายการค่าใช้จ่าย/ใบเบิก (?payee_kind=&payee_id=&expense=)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { apiFetch, type ApiError } from "@/lib/api";
import PaymentForm, { type PaymentFormOptions } from "../_components/payment-form";
import { PAYMENT_MESSAGES } from "../_messages";
import type { Payee } from "../_types";

export default function NewPaymentPage() {
    const searchParams = useSearchParams();
    const payeeKind = searchParams.get("payee_kind");
    const payeeId = searchParams.get("payee_id");
    const [options, setOptions] = useState<PaymentFormOptions | null>(null);
    const [payees, setPayees] = useState<Payee[] | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([apiFetch<PaymentFormOptions>("/company"), apiFetch<{ data: Payee[] }>("/payments/payees")]).then(
            ([companyResult, payeesResult]) => {
                if (isLeftPage) return;
                setLoadError(companyResult.error ?? payeesResult.error);
                setOptions(companyResult.data);
                setPayees(payeesResult.data?.data ?? null);
            },
        );
        return () => {
            isLeftPage = true;
        };
    }, []);

    const initialPayee: { kind: "vendor" | "employee"; id: string } | null =
        (payeeKind === "vendor" || payeeKind === "employee") && payeeId ? { kind: payeeKind, id: payeeId } : null;

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="จัดซื้อ · ทำจ่าย" title="ทำจ่าย" description={PAYMENT_MESSAGES.confirm} />
            {loadError && (
                <StatusBanner tone="error" title="โหลดข้อมูลไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            )}
            {!loadError && (!options || !payees) && <PageSkeleton />}
            {options && payees && (
                <PaymentForm
                    options={options}
                    payees={payees}
                    initialPayee={initialPayee}
                    initialExpenseId={searchParams.get("expense")}
                />
            )}
        </div>
    );
}
