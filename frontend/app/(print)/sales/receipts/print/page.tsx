"use client";

// หน้าพิมพ์ใบเสร็จรับเงิน A4 (2026-10-15 ขั้น 1C-3) — โครงเดียวกับหน้าพิมพ์ใบวางบิล
// ใบเสร็จไม่มีร่าง (C1) จึงใช้ข้อมูลลูกค้า/บริษัท/บัญชี "ณ วันออก" (snapshot) เสมอ · ใบที่ยกเลิกมีตรายกเลิก
// ส่วนต่างอัตราแลกเปลี่ยน/บันทึกภายใน ไม่พิมพ์ (ข้อมูลภายใน)
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { ReceiptDetail } from "@/app/(protected)/sales/receipts/_types";

import ReceiptDocument from "./receipt-document";

export default function ReceiptPrintPage() {
    const receiptId = useSearchParams().get("id");
    const [detail, setDetail] = useState<ReceiptDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!receiptId) return;
        let isLeftPage = false;
        apiFetch<ReceiptDetail>(`/receipts/${receiptId}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setDetail(data);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [receiptId]);

    if (!receiptId || loadError) return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบเสร็จนี้"}</p>;
    if (!detail) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    return <ReceiptDocument detail={detail} />;
}
