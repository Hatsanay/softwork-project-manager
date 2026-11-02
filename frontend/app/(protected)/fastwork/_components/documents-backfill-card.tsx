"use client";

// ออกเอกสารย้อนหลังให้งาน Fastwork เดิม (2026-11-01 · docs/plans/2026-11-01-fastwork-documents.md Q5 ข)
// ขึ้นเฉพาะตอนมีงานที่ยังขาดเอกสาร · กดซ้ำได้ ไม่ออกซ้ำ · ทำทีละงาน งานที่ออกไม่สำเร็จบอกชื่อไว้
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FileStack } from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { CARD_CLASS } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

type MissingRow = { project_id: string; needs_quotation: boolean; missing_payouts: number };
type BackfillResult = {
    projects: number;
    quotations: number;
    payouts: number;
    failed: { project_id: string; message: string }[];
};

export default function DocumentsBackfillCard({ onDone }: { onDone: () => Promise<void> | void }) {
    const [missing, setMissing] = useState<MissingRow[] | null>(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [isRunning, setIsRunning] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: MissingRow[] }>("/fastwork/documents/missing").then(({ data }) => {
            if (!isLeftPage) setMissing(data?.data ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    if (!missing || missing.length === 0) return null;
    const quotationCount = missing.filter((row) => row.needs_quotation).length;
    const payoutCount = missing.reduce((sum, row) => sum + row.missing_payouts, 0);

    async function run() {
        setIsRunning(true);
        setErrorMessage(null);
        const { data, error } = await apiFetch<BackfillResult>("/fastwork/documents/backfill", { method: "POST" });
        setIsRunning(false);
        if (error || !data) {
            setErrorMessage(error?.message ?? "ออกเอกสารไม่สำเร็จ");
            return;
        }
        setIsConfirming(false);
        if (data.failed.length > 0) {
            toast.error(`ออกไม่สำเร็จ ${data.failed.length} งาน: ${data.failed.map((row) => row.message).join(" · ")}`);
        } else {
            toast.success(
                `ออกเอกสารแล้ว ${data.projects} งาน (ใบเสนอราคา ${data.quotations} ใบ · เงินงวด ${data.payouts} รายการ)`,
            );
        }
        const { data: refreshed } = await apiFetch<{ data: MissingRow[] }>("/fastwork/documents/missing");
        setMissing(refreshed?.data ?? []);
        await onDone();
    }

    return (
        <section
            className={`flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 ${CARD_CLASS}`}
            aria-label="เอกสารย้อนหลัง"
        >
            <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <FileStack size={19} aria-hidden="true" />
                </span>
                <div className="grid gap-0.5">
                    <h2 className="text-base font-medium text-gray-900">
                        งานเดิมที่ยังไม่มีเอกสาร {missing.length} งาน
                    </h2>
                    <p className="text-sm text-gray-500">
                        ใบเสนอราคา {quotationCount} งาน · ใบแจ้งหนี้และใบเสร็จของเงินงวด {payoutCount} รายการ ·
                        ลงวันที่ตามวันรับงานและวันที่ลูกค้ายืนยันงวดจริง
                    </p>
                </div>
            </div>
            <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsConfirming(true)}>
                ออกเอกสารย้อนหลัง
            </button>
            <ConfirmDialog
                open={isConfirming}
                title="ออกเอกสารย้อนหลังให้งานเดิม?"
                description="ระบบออกใบเสนอราคา (ตอบรับแล้ว) ใบแจ้งหนี้ และใบเสร็จ ราคาเต็มที่ลูกค้าจ่าย · เป็นเอกสารประกอบ รายได้ยังนับจากเงินที่ Fastwork โอน · ออกแล้วยกเลิกได้ด้วยการยกเลิกรายการเงิน"
                confirmLabel="ออกเอกสาร"
                loading={isRunning}
                errorMessage={errorMessage}
                onConfirm={run}
                onCancel={() => setIsConfirming(false)}
            />
        </section>
    );
}
