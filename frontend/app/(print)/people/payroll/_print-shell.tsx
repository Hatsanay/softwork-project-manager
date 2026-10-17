"use client";

// กรอบหน้าพิมพ์แบบยื่นรายงานเงินเดือน (ขั้น 4-5) — แถบปุ่มพิมพ์ (ไม่พิมพ์) + ขนาดกระดาษ + คำเตือนก่อนยื่น
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export default function PrintShell({
    landscape = false,
    hint,
    warnings,
    children,
}: {
    landscape?: boolean;
    hint: string;
    warnings: string[];
    children: React.ReactNode;
}) {
    const width = landscape ? "max-w-[297mm]" : "max-w-[210mm]";
    return (
        <div className="min-h-screen bg-gray-100 py-6 print:bg-white print:py-0">
            <style>{`
                @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm 12mm 14mm; @bottom-right { content: "หน้า " counter(page) "/" counter(pages); font-size: 9pt; color: #6b7280; } }
                @media print { .no-print { display: none !important; } body { background: white; } }
                .print-row { break-inside: avoid; }
            `}</style>
            <div className={`no-print mx-auto mb-4 grid ${width} gap-2 px-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-gray-600">{hint}</p>
                    <button type="button" className={buttonClass("primary", "md")} onClick={() => window.print()}>
                        <Printer size={16} />
                        พิมพ์ / บันทึก PDF
                    </button>
                </div>
                {warnings.length > 0 && (
                    <ul className="list-disc rounded-lg border border-amber-600/20 bg-amber-50 px-6 py-2 text-sm text-amber-700">
                        {warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                        ))}
                    </ul>
                )}
            </div>
            {children}
        </div>
    );
}

// "2026-10" → "ตุลาคม 2569"
export function monthLabel(period: string) {
    return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${period}-01T00:00:00Z`),
    );
}
