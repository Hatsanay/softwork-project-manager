"use client";

// ข้อมูลที่ฟอร์มใบแจ้งหนี้ต้องใช้: ตั้งค่าบริษัท (สาขา บัญชีรับเงิน สกุลเงิน VAT กติกาอนุมัติใบสร้างเอง ค่าเริ่มต้น) + สาขาของผู้ใช้
// ใช้คำตอบ GET /company ชุดเดียวกับฟอร์มใบเสนอราคา (useFormOptions) แล้วเติมส่วนที่ใบแจ้งหนี้ต้องใช้
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { FormOptions } from "../../quotations/_hooks/use-form-options";

export type BankAccountOption = {
    ba_id: string;
    ba_bank_name: string;
    ba_account_no: string;
    ba_currency: string;
    ba_is_default: boolean;
    ba_status: "active" | "inactive";
};

export type InvoiceOptions = FormOptions & {
    company: FormOptions["company"] & {
        cs_default_credit_days: number;
        cs_invoice_notes_th: string | null;
        cs_invoice_notes_en: string | null;
        cs_promptpay_id: string | null;
    };
    bank_accounts: BankAccountOption[];
    invoiceApprovalLevels: FormOptions["approval"]["levels"];
};

type CompanyResponse = Omit<InvoiceOptions, "userBranchId" | "invoiceApprovalLevels" | "approval"> & {
    approval: FormOptions["approval"];
    invoice_approval: FormOptions["approval"];
};

export function useInvoiceOptions() {
    const [options, setOptions] = useState<InvoiceOptions | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<CompanyResponse>("/company"),
            apiFetch<{ user_branch_id: string | null }>("/users/me"),
        ]).then(([companyResult, meResult]) => {
            if (isLeftPage) return;
            if (companyResult.error) {
                setLoadError(companyResult.error);
                return;
            }
            const { invoice_approval: invoiceApproval, ...company } = companyResult.data;
            setOptions({
                ...company,
                invoiceApprovalLevels: invoiceApproval.levels,
                userBranchId: meResult.data?.user_branch_id ?? null,
            });
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    return { options, loadError };
}

/** บัญชีรับเงินที่เลือกได้ของสกุลเงินนี้ (เปิดใช้งาน + บัญชีที่ร่างเลือกไว้เดิม) */
export function bankAccountsFor(options: InvoiceOptions, currencyCode: string, selectedId: string | null) {
    return options.bank_accounts.filter(
        (account) =>
            account.ba_currency === currencyCode && (account.ba_status === "active" || account.ba_id === selectedId),
    );
}

/** บัญชีหลักของสกุลเงินนั้น (ค่าเริ่มต้นของร่างใหม่) */
export function defaultBankAccountId(options: InvoiceOptions, currencyCode: string) {
    const account = options.bank_accounts.find(
        (item) => item.ba_currency === currencyCode && item.ba_status === "active" && item.ba_is_default,
    );
    return account?.ba_id ?? null;
}
