"use client";

// หน้าพิมพ์ใบเสนอราคา A4 (2026-10-14 ขั้น 1A-4 · sales-cycle หัวข้อ 8) · พิมพ์/บันทึก PDF จากเบราว์เซอร์
// อยู่นอกกรอบเมนูของระบบ (route group "(print)") · ยังต้อง login (proxy ตรวจ cookie, API ตรวจ token)
// ตัวเอกสารอยู่ที่ quotation-document.tsx (ใช้ร่วมกับหน้าเอกสารของลูกค้า 2026-10-30) · หน้านี้โหลดข้อมูล + ลายเซ็นจาก /signatures
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SignatureImage from "@/components/signature/signature-image";
import { apiFetch } from "@/lib/api";
import type { ClientSnapshot, CompanySnapshot, QuotationDetail } from "@/app/(protected)/sales/quotations/_types";
import QuotationDocument from "./quotation-document";

type CompanyResponse = {
    company: Omit<CompanySnapshot, "branch">;
    branches: (NonNullable<CompanySnapshot["branch"]> & { branch_id: string })[];
};

type PrintData = { detail: QuotationDetail; company: CompanySnapshot; client: ClientSnapshot };

async function loadPrintData(quotationId: string): Promise<{ data: PrintData | null; error: string | null }> {
    const { data: detail, error } = await apiFetch<QuotationDetail>(`/quotations/${quotationId}`);
    if (error || !detail) return { data: null, error: error?.message ?? "โหลดใบเสนอราคาไม่สำเร็จ" };
    const { qt_company_snapshot: companySnapshot, qt_client_snapshot: clientSnapshot } = detail.quotation;
    if (companySnapshot && clientSnapshot)
        return { data: { detail, company: companySnapshot, client: clientSnapshot }, error: null };

    // ร่าง/รออนุมัติ: ยังไม่มี snapshot ใช้ข้อมูลปัจจุบัน
    const [companyResult, clientResult] = await Promise.all([
        apiFetch<CompanyResponse>("/company"),
        apiFetch<ClientSnapshot>(`/clients/${detail.quotation.qt_client_id}`),
    ]);
    if (!companyResult.data || !clientResult.data) return { data: null, error: "โหลดข้อมูลบริษัทหรือลูกค้าไม่สำเร็จ" };
    const branch = companyResult.data.branches.find((item) => item.branch_id === detail.quotation.qt_branch_id) ?? null;
    return {
        data: { detail, company: { ...companyResult.data.company, branch }, client: clientResult.data },
        error: null,
    };
}

export default function QuotationPrintPage() {
    const quotationId = useSearchParams().get("id");
    const [printData, setPrintData] = useState<PrintData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!quotationId) return;
        let isLeftPage = false;
        loadPrintData(quotationId).then(({ data, error }) => {
            if (isLeftPage) return;
            setPrintData(data);
            setLoadError(error);
        });
        return () => {
            isLeftPage = true;
        };
    }, [quotationId]);

    if (!quotationId || loadError)
        return <p className="p-8 text-sm text-red-600">{loadError ?? "ไม่พบใบเสนอราคานี้"}</p>;
    if (!printData) return <p className="p-8 text-sm text-gray-500">กำลังเตรียมหน้าพิมพ์...</p>;

    const { detail, company, client } = printData;
    const { quotation } = detail;
    return (
        <QuotationDocument
            data={{ ...detail, company, client, isFastworkInternal: Boolean(detail.fastwork_internal) }}
            renderSignature={(signer) => {
                const signatureId =
                    signer === "creator" ? quotation.qt_creator_signature_id : quotation.qt_approver_signature_id;
                return signatureId ? <SignatureImage signatureId={signatureId} alt="" className="h-14 w-40" /> : null;
            }}
            toolbarNote={
                'ตั้งค่าการพิมพ์: กระดาษ A4 · ปิด "ส่วนหัวและส่วนท้าย" ของเบราว์เซอร์ · บันทึกเป็น PDF ได้จากหน้าต่างพิมพ์'
            }
        />
    );
}
