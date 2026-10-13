"use client";

// แผงอัตรา ธปท. ในแท็บสกุลเงิน (2026-10-13 ขั้น 1A-2) — บอกว่าตั้งคีย์แล้วหรือยัง และลองดึงอัตราของสกุลที่เลือก
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import { apiFetch } from "@/lib/api";
import { formatDateOnly } from "@/app/function";
import type { Currency } from "../_types";

type BotStatus = { bot_configured: boolean; lookback_days: number };
type RateResult = {
    available: boolean;
    rate: string | null;
    rate_date: string | null;
    error: { code: string; message: string } | null;
};

// อัตรา 10 ทศนิยมจากฐานข้อมูล → ตัดศูนย์ท้ายออก เหลืออย่างน้อย 4 ตำแหน่ง ("34.5678000000" → "34.5678")
function displayRate(rate: string) {
    const [whole, fraction = ""] = rate.split(".");
    const trimmed = fraction.replace(/0+$/, "").padEnd(4, "0");
    return `${whole}.${trimmed}`;
}

export default function BotRateCheck({ currencies }: { currencies: Currency[] }) {
    const foreignCurrencies = currencies.filter((currency) => !currency.is_base_currency);
    const [status, setStatus] = useState<BotStatus | null>(null);
    const [currencyCode, setCurrencyCode] = useState("");
    const [result, setResult] = useState<RateResult | null>(null);
    const [isChecking, setIsChecking] = useState(false);
    const selectedCode = currencyCode || foreignCurrencies[0]?.cur_code || "";

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<BotStatus>("/exchange-rates/status").then(({ data }) => {
            if (!isLeftPage) setStatus(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    async function checkRate() {
        if (!selectedCode) return;
        setIsChecking(true);
        const { data, error } = await apiFetch<RateResult>(`/exchange-rates?currency=${selectedCode}`);
        setIsChecking(false);
        setResult(
            data ?? {
                available: false,
                rate: null,
                rate_date: null,
                error: { code: "", message: error?.message ?? "" },
            },
        );
    }

    if (!status) return null;

    return (
        <div className="grid gap-3 rounded-lg border border-gray-200 p-4">
            {status.bot_configured ? (
                <p className="text-sm text-gray-600">
                    อัตราแลกเปลี่ยนดึงจากธนาคารแห่งประเทศไทย (อัตราซื้อถัวเฉลี่ยเงินโอน) ของวันทำการล่าสุด ณ
                    วันที่เอกสาร — วันหยุดใช้อัตราวันทำการก่อนหน้า (ย้อนได้ไม่เกิน {status.lookback_days} วัน) ·
                    ผู้สร้างแก้อัตราในเอกสารได้พร้อมเหตุผล
                </p>
            ) : (
                <StatusBanner tone="warn" title="ยังไม่ได้ตั้งคีย์ API ของธนาคารแห่งประเทศไทย">
                    เอกสารสกุลต่างประเทศยังสร้างได้ แต่ผู้สร้างต้องกรอกอัตราแลกเปลี่ยนเอง ·
                    ผู้ดูแลเซิร์ฟเวอร์สมัครคีย์ที่ BOT API Portal แล้วใส่ BOT_API_KEY ในไฟล์ .env ของ backend จากนั้น
                    restart
                </StatusBanner>
            )}

            {foreignCurrencies.length > 0 && (
                <div className="flex flex-wrap items-end gap-2">
                    <label className="grid gap-1 text-sm text-gray-600">
                        ทดสอบดึงอัตราของวันนี้
                        <select
                            value={selectedCode}
                            onChange={(event) => {
                                setCurrencyCode(event.target.value);
                                setResult(null);
                            }}
                            className={`${inputClass()} w-48`}
                        >
                            {foreignCurrencies.map((currency) => (
                                <option key={currency.cur_code} value={currency.cur_code}>
                                    {currency.cur_code} · {currency.cur_name_th}
                                </option>
                            ))}
                        </select>
                    </label>
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        onClick={checkRate}
                        disabled={isChecking}
                    >
                        <RefreshCw size={16} className={isChecking ? "animate-spin" : ""} />
                        {isChecking ? "กำลังดึง..." : "ทดสอบดึงอัตรา"}
                    </button>
                </div>
            )}

            {result?.available && result.rate && (
                <StatusBanner tone="done" title={`1 ${selectedCode} = ${displayRate(result.rate)} บาท`}>
                    อัตราของวันที่ {formatDateOnly(result.rate_date)}
                    {result.error ? ` · ดึงอัตราใหม่ไม่สำเร็จ ใช้อัตราล่าสุดที่มี (${result.error.message})` : ""}
                </StatusBanner>
            )}
            {result && !result.available && (
                <StatusBanner tone="error" title="ดึงอัตราไม่สำเร็จ">
                    {result.error?.message}
                </StatusBanner>
            )}
        </div>
    );
}
