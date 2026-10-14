"use client";

// ข้อมูลที่ฟอร์มใบเสนอราคาต้องใช้: ตั้งค่าบริษัท (สาขา สกุลเงิน VAT กติกาอนุมัติ ค่าเริ่มต้น) + สาขาของผู้ใช้
import { useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";

export type FormOptions = {
    today: string;
    company: {
        cs_vat_registered_from: string | null;
        cs_quotation_valid_days: number;
        cs_quotation_terms_th: string | null;
        cs_quotation_terms_en: string | null;
    };
    vat_rate_today: string | null;
    branches: {
        branch_id: string;
        branch_code: string;
        branch_name_th: string;
        branch_status: "active" | "inactive";
        is_head_office: boolean;
    }[];
    currencies: {
        cur_code: string;
        cur_name_th: string;
        cur_decimals: number;
        cur_unit_th: string;
        cur_subunit_th: string | null;
        cur_unit_en: string;
        cur_subunit_en: string | null;
        cur_status: "active" | "inactive";
    }[];
    approval: {
        levels: {
            al_level: number;
            al_min_amount_thb: string;
            al_require_distinct: boolean;
            roles: { role_id: string; role_name: string }[];
        }[];
    };
    userBranchId: string | null;
};

export function useFormOptions() {
    const [options, setOptions] = useState<FormOptions | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        Promise.all([
            apiFetch<Omit<FormOptions, "userBranchId">>("/company"),
            apiFetch<{ user_branch_id: string | null }>("/users/me"),
        ]).then(([companyResult, meResult]) => {
            if (isLeftPage) return;
            if (companyResult.error) {
                setLoadError(companyResult.error);
                return;
            }
            setOptions({ ...companyResult.data, userBranchId: meResult.data?.user_branch_id ?? null });
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    return { options, loadError };
}

/** อัตรา VAT ที่ใบนี้จะใช้ถ้าอนุมัติวันนี้ — ยังไม่จด/เลือก 0% = "0" */
export function vatRateForForm(options: FormOptions, vatTreatment: "standard" | "zero") {
    const registeredFrom = options.company.cs_vat_registered_from;
    const isRegistered = registeredFrom !== null && registeredFrom <= options.today;
    if (!isRegistered || vatTreatment === "zero") return "0";
    return options.vat_rate_today ?? "0";
}
