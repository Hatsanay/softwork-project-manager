"use client";

// หน้าพิมพ์ใบแจ้งหนี้ A4 (2026-10-14 ขั้น 1B-3) — พิมพ์/บันทึก PDF จากเบราว์เซอร์ · โครงเดียวกับหน้าพิมพ์ใบเสนอราคา
// ใบที่ออกแล้วใช้ข้อมูลลูกค้า/บริษัท/บัญชี "ณ วันออก" (snapshot) เสมอ · ร่าง/รออนุมัติใช้ข้อมูลปัจจุบัน + ลายน้ำ ไม่แสดงลายเซ็น
// บัญชีรับเงิน + QR พร้อมเพย์ (ยอดหลังหัก ณ ที่จ่าย, เงินบาทเท่านั้น) มาจาก backend ใน detail.payment
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { ClientSnapshot, CompanySnapshot } from "@/app/(protected)/sales/quotations/_types";
import type { InvoiceDetail } from "@/app/(protected)/sales/invoices/_types";

import InvoiceDocument from "./invoice-document";

type CompanyResponse = {
    company: Omit<CompanySnapshot, "branch">;
    branches: (NonNullable<CompanySnapshot["branch"]> & { branch_id: string })[];
};

type PrintData = { detail: InvoiceDetail; company: CompanySnapshot; client: ClientSnapshot };

async function loadPrintData(invoiceId: string): Promise<{ data: PrintData | null; error: string | null }> {
    const { data: detail, error } = await apiFetch<InvoiceDetail>(`/invoices/${invoiceId}`);
    if (error || !detail) return { data: null, error: error?.message ?? "โหลดใบแจ้งหนี้ไม่สำเร็จ" };
    const { inv_company_snapshot: companySnapshot, inv_client_snapshot: clientSnapshot } = detail.invoice;
    if (companySnapshot && clientSnapshot)
        return { data: { detail, company: companySnapshot, client: clientSnapshot }, error: null };

    // ร่าง/รออนุมัติ: ยังไม่มี snapshot ใช้ข้อมูลปัจจุบัน
    const [companyResult, clientResult] = await Promise.all([
        apiFetch<CompanyResponse>("/company"),
        apiFetch<ClientSnapshot>(`/clients/${detail.invoice.inv_client_id}`),
    ]);
    if (!companyResult.data || !clientResult.data) return { data: null, error: "โหลดข้อมูลบริษัทหรือลูกค้าไม่สำเร็จ" };
    const branch = companyResult.data.branches.find((item) => item.branch_id === detail.invoice.inv_branch_id) ?? null;
    return {
        data: { detail, company: { ...companyResult.data.company, branch }, client: clientResult.data },
        error: null,
    };
}

export default function InvoicePrintPage() {
    const invoiceId = useSearchParams().get("id");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!invoiceId) return;
        let isLeftPage = false;
        loadPrintData(invoiceId).then(({ data, error }) => {
            if (isLeftPage) return;
            setPrintData(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [invoiceId]);

    if (!invoiceId || loadError) return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบแจ้งหนี้นี้"}</p>;
    if (!printData) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;


    const { detail, company, client } = printData;
    return <InvoiceDocument detail={detail} company={company} client={client} />;
}
