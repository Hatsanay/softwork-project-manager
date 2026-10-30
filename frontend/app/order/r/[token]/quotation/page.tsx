"use client";

// ใบเสนอราคาขนาด A4 ให้ลูกค้าเปิด/บันทึก PDF จากลิงก์หน้าสถานะ (2026-10-30 · docs/plans/2026-10-30-quote-pdf-mobile-refactor.md ส่วน A)
// ตัวเอกสารเดียวกับหน้าพิมพ์ภายใน · เปิดได้เฉพาะตอนลูกค้าเห็นใบอยู่แล้ว (รอยอมรับ / ยอมรับแล้ว) ไม่งั้นบอกเหตุผลแล้วพากลับหน้าสถานะ
// ลายเซ็นฝังมากับข้อมูล (data URL) · ชื่อแท็บ = เลขที่ใบ (เป็นชื่อไฟล์ตอนบันทึก PDF)
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, FileX } from "lucide-react";
import { CustomerLoading, CustomerNotice } from "@/components/customer/customer-shell";
import { buttonClass } from "@/components/ui/button";
import type { ApiError } from "@/lib/api";
import QuotationDocument, { type QuotationDocumentData } from "@/app/(print)/sales/quotations/print/quotation-document";
import OrderShell from "../../../_components/order-shell";
import { publicFetch } from "../../../_public-api";

type DocumentResponse = Omit<QuotationDocumentData, "isFastworkInternal"> & {
    signatures: { creator: string | null; approver: string | null };
};

export default function CustomerQuotationDocumentPage() {
    const params = useParams<{ token: string }>();
    const token = params.token;
    const [quotationDocument, setQuotationDocument] = useState<DocumentResponse | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        publicFetch<DocumentResponse>(`/order/requests/${token}/quotation-document`).then(({ data, error }) => {
            if (isLeftPage) return;
            setLoadError(error);
            if (data) setQuotationDocument(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [token]);

    // ชื่อแท็บเป็นชื่อไฟล์ตอนบันทึก PDF
    useEffect(() => {
        if (!quotationDocument) return;
        const { qt_number: number, qt_revision: revision } = quotationDocument.quotation;
        document.title = `ใบเสนอราคา ${number ?? ""}${revision > 0 ? ` Rev.${revision}` : ""}`.trim();
    }, [quotationDocument]);

    const statusHref = `/order/r/${token}`;
    if (loadError) {
        return (
            <OrderShell shop={null} subtitle="ใบเสนอราคา">
                <CustomerNotice icon={FileX} title="ยังเปิดใบเสนอราคาไม่ได้">
                    <span className="grid justify-items-center gap-4">
                        <span>{loadError.message}</span>
                        <Link href={statusHref} className={buttonClass("primary", "md", "min-h-11")}>
                            <ArrowLeft size={16} aria-hidden="true" />
                            กลับหน้าสถานะคำขอ
                        </Link>
                    </span>
                </CustomerNotice>
            </OrderShell>
        );
    }
    if (!quotationDocument) return <CustomerLoading label="กำลังเตรียมใบเสนอราคา..." />;

    const { signatures, ...printed } = quotationDocument;
    return (
        <QuotationDocument
            data={{ ...printed, isFastworkInternal: false }}
            renderSignature={(signer) => {
                const image = signatures[signer];
                // eslint-disable-next-line @next/next/no-img-element -- รูปลายเซ็นฝังมาเป็น data URL ใช้ next/image ไม่ได้
                return image ? <img src={image} alt="" className="h-14 w-40 object-contain" /> : null;
            }}
            toolbarNote={
                <span className="grid gap-1">
                    <span>
                        กด &quot;พิมพ์ / บันทึก PDF&quot; แล้วเลือก &quot;บันทึกเป็น PDF&quot; · กระดาษ A4 · ปิด
                        &quot;ส่วนหัวและส่วนท้าย&quot;
                    </span>
                    <span>มือถือ: ใบย่อให้พอดีจอ ถ่างนิ้วซูมดูได้ · ปุ่มพิมพ์เปิดหน้าต่างที่บันทึกหรือแชร์เป็น PDF ได้</span>
                    <Link
                        href={statusHref}
                        className="inline-flex min-h-10 items-center gap-1 text-blue-600 hover:underline"
                    >
                        <ArrowLeft size={14} aria-hidden="true" />
                        กลับหน้าสถานะคำขอ
                    </Link>
                </span>
            }
        />
    );
}
