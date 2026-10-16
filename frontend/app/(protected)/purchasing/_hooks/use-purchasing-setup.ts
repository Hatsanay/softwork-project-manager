"use client";

// ตั้งค่าฝั่งจัดซื้อ (หมวดค่าใช้จ่าย + ประเภทเงินได้พร้อมอัตรา) — ฟอร์มผู้ขาย/ค่าใช้จ่าย/เบิกเงิน และหน้าตั้งค่าใช้ร่วมกัน
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { PurchasingSetup } from "../_types";

export function usePurchasingSetup() {
    const [setup, setSetup] = useState<PurchasingSetup | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const reload = useCallback(async () => {
        const { data, error } = await apiFetch<PurchasingSetup>("/purchasing/setup");
        setSetup(data);
        setLoadError(error);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<PurchasingSetup>("/purchasing/setup").then(({ data, error }) => {
            if (isLeftPage) return;
            setSetup(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    return { setup, loadError, reload };
}
