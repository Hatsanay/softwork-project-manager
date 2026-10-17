"use client";

// ตั้งค่าบุคคล (ประกันสังคม ภาษี ประเภทลา เวลาทำงาน) — หน้าตั้งค่าและฟอร์มอื่นๆ ฝั่งบุคคลใช้ร่วมกัน
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError } from "@/lib/api";
import type { PeopleSetup } from "../_types";

export function usePeopleSetup() {
    const [setup, setSetup] = useState<PeopleSetup | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const reload = useCallback(async () => {
        const { data, error } = await apiFetch<PeopleSetup>("/people/setup");
        setSetup(data);
        setLoadError(error);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<PeopleSetup>("/people/setup").then(({ data, error }) => {
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
