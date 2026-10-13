"use client";

// โหลดการตั้งค่าบริษัททั้งหมดจาก GET /company — ทุกแท็บใช้ข้อมูลชุดเดียวกัน บันทึกแท็บไหนแล้วโหลดใหม่ทั้งชุด
import { useCallback, useEffect, useState } from "react";
import { apiFetch, type ApiError, type ApiResult } from "@/lib/api";
import type { CompanySettings } from "../_types";

export function useCompanySettings() {
    const [settings, setSettings] = useState<CompanySettings | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    const applyResult = useCallback(({ data, error }: ApiResult<CompanySettings>) => {
        if (error) {
            setLoadError(error);
            return;
        }
        setLoadError(null);
        setSettings(data);
    }, []);

    // โหลดใหม่หลังบันทึก
    const reload = useCallback(async () => {
        applyResult(await apiFetch<CompanySettings>("/company"));
    }, [applyResult]);

    // โหลดครั้งแรกตอนเปิดหน้า — ออกจากหน้าก่อนโหลดเสร็จ ไม่ต้องตั้งค่า state ที่ไม่มีใครใช้แล้ว
    useEffect(() => {
        let isLeftPage = false;
        apiFetch<CompanySettings>("/company").then((result) => {
            if (!isLeftPage) applyResult(result);
        });
        return () => {
            isLeftPage = true;
        };
    }, [applyResult]);

    return { settings, loadError, reload };
}
