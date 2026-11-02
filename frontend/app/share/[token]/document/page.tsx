"use client";

// หน้าเอกสาร A4 ในลิงก์ติดตามงาน /share/<token>/document?type=&id= (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md ข้อ 2.3)
// ใช้ตัวเอกสารเดียวกับหน้าพิมพ์ของทีม · ไม่มีรูปลายเซ็น (ต้อง login) · เปิดได้เมื่อทีมเปิด "แสดงเอกสารในลิงก์ติดตามงาน"
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { FileX } from "lucide-react";
import { CustomerLoading, CustomerNotice } from "@/components/customer/customer-shell";
import { api } from "@/app/constans";
import QuotationDocument from "@/app/(print)/sales/quotations/print/quotation-document";
import InvoiceDocument from "@/app/(print)/sales/invoices/print/invoice-document";
import ReceiptDocument from "@/app/(print)/sales/receipts/print/receipt-document";
import type { QuotationDetail } from "@/app/(protected)/sales/quotations/_types";
import type { InvoiceDetail } from "@/app/(protected)/sales/invoices/_types";
import type { ReceiptDetail } from "@/app/(protected)/sales/receipts/_types";

type SharedDocumentDetail =
    | ({ type: "quotation" } & QuotationDetail)
    | ({ type: "invoice" } & InvoiceDetail)
    | ({ type: "receipt" } & ReceiptDetail);

export default function SharedDocumentPage() {
    return (
        <Suspense fallback={<CustomerLoading label="กำลังเปิดเอกสาร..." />}>
            <SharedDocument />
        </Suspense>
    );
}

function SharedDocument() {
    const token = useParams<{ token: string }>().token;
    const searchParams = useSearchParams();
    const type = searchParams.get("type") ?? "";
    const documentId = searchParams.get("id") ?? "";
    const [detail, setDetail] = useState<SharedDocumentDetail | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        if (!token || !type || !documentId) return;
        let isLeftPage = false;
        fetch(`${api}/share/${token}/documents/${encodeURIComponent(type)}/${encodeURIComponent(documentId)}`)
            .then(async (response) => {
                const body = await response.json().catch(() => null);
                if (isLeftPage) return;
                if (!response.ok) {
                    setLoadError(body?.message ?? "เปิดเอกสารไม่สำเร็จ");
                    return;
                }
                setDetail(body);
            })
            .catch(() => {
                if (!isLeftPage) setLoadError("เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง");
            });
        return () => {
            isLeftPage = true;
        };
    }, [token, type, documentId]);

    if (loadError || !type || !documentId) {
        return (
            <div className="p-4">
                <CustomerNotice icon={FileX} title="เปิดเอกสารไม่ได้">
                    {loadError ?? "ลิงก์เอกสารไม่ครบ"}
                </CustomerNotice>
            </div>
        );
    }
    if (!detail) return <CustomerLoading label="กำลังเปิดเอกสาร..." />;

    if (detail.type === "quotation") {
        const { quotation } = detail;
        if (!quotation.qt_company_snapshot || !quotation.qt_client_snapshot) return null;
        return (
            <QuotationDocument
                data={{
                    ...detail,
                    company: quotation.qt_company_snapshot,
                    client: quotation.qt_client_snapshot,
                    isFastworkInternal: false,
                }}
                renderSignature={() => null}
                toolbarNote={
                    <span>
                        กด &quot;พิมพ์ / บันทึก PDF&quot; แล้วเลือก &quot;บันทึกเป็น PDF&quot; · กระดาษ A4 · ปิด
                        &quot;ส่วนหัวและส่วนท้าย&quot;
                    </span>
                }
            />
        );
    }
    if (detail.type === "invoice") {
        const { invoice } = detail;
        if (!invoice.inv_company_snapshot || !invoice.inv_client_snapshot) return null;
        return (
            <InvoiceDocument
                detail={detail}
                company={invoice.inv_company_snapshot}
                client={invoice.inv_client_snapshot}
                showSignatures={false}
            />
        );
    }
    return <ReceiptDocument detail={detail} />;
}
