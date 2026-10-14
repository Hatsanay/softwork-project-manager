"use client";

// อัตราแลกเปลี่ยนของใบสกุลต่างประเทศ — ดึงจาก ธปท. หรือกรอกเองพร้อมเหตุผล (sales-cycle หัวข้อ 5)
import { useState } from "react";
import { PencilLine, RefreshCw } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { formatDateOnly } from "@/app/function";
import { apiFetch } from "@/lib/api";
import { QUOTATION_MESSAGES } from "../_messages";
import { displayRate } from "../_format";

type RateResult = {
    available: boolean;
    rate: string | null;
    rate_date: string | null;
    error: { code: string; message: string } | null;
};

export type RateChange = {
    qt_exchange_rate: string;
    qt_rate_source: "bot" | "manual";
    qt_rate_date: string | null;
    qt_rate_bot: string | null;
};

type RatePanelProps = {
    currency: string;
    rate: string;
    source: "bot" | "manual" | null;
    rateDate: string | null;
    rateBot: string | null;
    reason: string;
    errors: Record<string, string>;
    onRateChange: (change: RateChange) => void;
    onReasonChange: (reason: string) => void;
};

export default function RatePanel({
    currency,
    rate,
    source,
    rateDate,
    rateBot,
    reason,
    errors,
    onRateChange,
    onReasonChange,
}: RatePanelProps) {
    const [isFetching, setIsFetching] = useState(false);
    const [fetchMessage, setFetchMessage] = useState<string | null>(null);

    async function fetchBotRate() {
        setIsFetching(true);
        setFetchMessage(null);
        const { data, error } = await apiFetch<RateResult>(`/exchange-rates?currency=${currency}`);
        setIsFetching(false);
        if (error || !data?.available || !data.rate) {
            setFetchMessage(data?.error?.message ?? error?.message ?? "ดึงอัตราไม่สำเร็จ — กรอกอัตราเองพร้อมเหตุผล");
            onRateChange({ qt_exchange_rate: rate, qt_rate_source: "manual", qt_rate_date: null, qt_rate_bot: null });
            return;
        }
        if (data.error) setFetchMessage(`ใช้อัตราล่าสุดที่มี เพราะดึงใหม่ไม่ได้: ${data.error.message}`);
        onRateChange({
            qt_exchange_rate: data.rate,
            qt_rate_source: "bot",
            qt_rate_date: data.rate_date,
            qt_rate_bot: data.rate,
        });
    }

    function switchToManual() {
        onRateChange({
            qt_exchange_rate: rate,
            qt_rate_source: "manual",
            qt_rate_date: rateDate,
            qt_rate_bot: rateBot,
        });
    }

    return (
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-gray-800">อัตราแลกเปลี่ยน (บาทต่อ 1 {currency})</p>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "sm")}
                        onClick={fetchBotRate}
                        disabled={isFetching}
                    >
                        <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
                        {isFetching ? "กำลังดึง..." : "ดึงอัตรา ธปท."}
                    </button>
                    {source === "bot" && (
                        <button type="button" className={buttonClass("ghost", "sm")} onClick={switchToManual}>
                            <PencilLine size={15} />
                            แก้อัตราเอง
                        </button>
                    )}
                </div>
            </div>

            {source === "bot" && (
                <p className="text-sm text-gray-700">
                    <span className="font-medium tabular-nums">{displayRate(rate)}</span> บาท/{currency}
                    <span className="block text-xs text-gray-500">
                        {QUOTATION_MESSAGES.rateBot(displayRate(rate), currency, formatDateOnly(rateDate))}
                    </span>
                </p>
            )}

            {source === "manual" && (
                <div className="grid gap-3 sm:grid-cols-2">
                    <FormField
                        label="อัตราที่ใช้"
                        htmlFor="qt_exchange_rate"
                        required
                        error={errors.qt_exchange_rate}
                        hint={rateBot ? `อัตรา ธปท. ที่ดึงไว้: ${displayRate(rateBot)}` : undefined}
                    >
                        <input
                            id="qt_exchange_rate"
                            inputMode="decimal"
                            value={rate}
                            onChange={(event) =>
                                onRateChange({
                                    qt_exchange_rate: event.target.value,
                                    qt_rate_source: "manual",
                                    qt_rate_date: rateDate,
                                    qt_rate_bot: rateBot,
                                })
                            }
                            className={inputClass(Boolean(errors.qt_exchange_rate))}
                        />
                    </FormField>
                    <FormField
                        label="เหตุผลที่กรอกเอง"
                        htmlFor="qt_rate_override_reason"
                        required
                        hint={QUOTATION_MESSAGES.rateManual}
                        error={errors.qt_rate_override_reason}
                    >
                        <input
                            id="qt_rate_override_reason"
                            value={reason}
                            placeholder="เช่น ตกลงอัตราคงที่ 35 บาทกับลูกค้า"
                            onChange={(event) => onReasonChange(event.target.value)}
                            className={inputClass(Boolean(errors.qt_rate_override_reason))}
                        />
                    </FormField>
                </div>
            )}

            {source === null && (
                <p className="text-sm text-gray-500">
                    กด &quot;ดึงอัตรา ธปท.&quot; เพื่อเริ่ม — ไม่มีอัตรา ธปท. ก็กรอกเองได้
                </p>
            )}
            {fetchMessage && (
                <StatusBanner tone="warn" title="อัตราแลกเปลี่ยน">
                    {fetchMessage}
                </StatusBanner>
            )}
        </div>
    );
}
