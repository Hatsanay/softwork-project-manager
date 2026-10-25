"use client";

// ปุ่มจำนวนในตะกร้า (หน้าร้าน · ตะกร้า · ตัวคิดราคา Fastwork)
// ยังไม่เลือก: compact = ปุ่ม + กลม (แถวสินค้า) · ปกติ = ปุ่ม "ใส่ตะกร้า" · เลือกแล้ว = − จำนวน +
// fullWidth = เต็มความกว้าง (การ์ดแพ็กที่วางเทียบกัน ปุ่มตรงกันทุกใบ)
import { Minus, Plus } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export default function QuantityControl({
    quantity,
    onChange,
    label,
    compact = false,
    fullWidth = false,
}: {
    quantity: number;
    onChange: (quantity: number) => void;
    label: string;
    compact?: boolean;
    fullWidth?: boolean;
}) {
    if (quantity === 0) {
        if (compact) {
            return (
                <button type="button" className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white shadow-brand transition hover:bg-blue-700 active:scale-95" onClick={() => onChange(1)} aria-label={`ใส่ ${label} ลงตะกร้า`}>
                    <Plus size={20} />
                </button>
            );
        }
        return (
            <button type="button" className={`${buttonClass("primary", "md")} min-h-11 ${fullWidth ? "w-full justify-center" : ""}`} onClick={() => onChange(1)} aria-label={`ใส่ ${label} ลงตะกร้า`}>
                <Plus size={16} />
                ใส่ตะกร้า
            </button>
        );
    }
    return (
        <div className={`flex items-center gap-0.5 rounded-full border border-blue-200 bg-white p-0.5 ${fullWidth ? "w-full justify-between" : ""}`} role="group" aria-label={`จำนวน ${label}`}>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-700 hover:bg-gray-100 active:scale-95" onClick={() => onChange(quantity - 1)} aria-label="ลดจำนวน">
                <Minus size={18} />
            </button>
            <span className="w-8 text-center text-base font-medium text-gray-900 tabular-nums" aria-live="polite">
                {quantity}
            </span>
            <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 active:scale-95" onClick={() => onChange(quantity + 1)} aria-label="เพิ่มจำนวน">
                <Plus size={18} />
            </button>
        </div>
    );
}
