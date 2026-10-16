"use client";

// ข้อมูลที่ฟอร์มค่าใช้จ่ายต้องใช้: ตั้งค่าบริษัท (สาขา สกุลเงิน VAT วันนี้ กติกาอนุมัติ EX) + สาขาของผู้ใช้ + ตั้งค่าจัดซื้อ (หมวด ประเภทเงินได้)
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { FormOptions } from "../../../sales/quotations/_hooks/use-form-options";
import type { PurchasingSetup } from "../../_types";

export type ExpenseOptions = Pick<
    FormOptions,
    "today" | "branches" | "currencies" | "vat_rate_today" | "userBranchId"
> & {
    expenseApprovalLevels: FormOptions["approval"]["levels"];
    setup: PurchasingSetup;
};

type CompanyResponse = Omit<FormOptions, "userBranchId"> & { expense_approval: FormOptions["approval"] };

export function useExpenseOptions() {
    const [options, setOptions] = useState<ExpenseOptions | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<CompanyResponse>("/company"),
            apiFetch<{ user_branch_id: string | null }>("/users/me"),
            apiFetch<PurchasingSetup>("/purchasing/setup"),
        ]).then(([companyResult, meResult, setupResult]) => {
            if (isLeftPage) return;
            if (companyResult.error || setupResult.error) {
                setLoadError(companyResult.error ?? setupResult.error);
                return;
            }
            const company = companyResult.data;
            setOptions({
                today: company.today,
                branches: company.branches,
                currencies: company.currencies,
                vat_rate_today: company.vat_rate_today,
                expenseApprovalLevels: company.expense_approval.levels,
                userBranchId: meResult.data?.user_branch_id ?? null,
                setup: setupResult.data,
            });
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    return { options, loadError };
}
