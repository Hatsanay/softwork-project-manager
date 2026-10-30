"use client";

// ชิปกรองตามหมวด (หน้าสินค้า · ปรับหน้า 2026-10-30) — จอคอมขึ้นบรรทัดใหม่ได้ · มือถือเลื่อนซ้ายขวาแถวเดียว
// value "" = ทุกหมวด · "none" = ไม่มีหมวด (withNone)
import type { ProductCategory } from "../_types";

export default function CategoryChips({
    categories,
    value,
    withNone = false,
    onChange,
}: {
    categories: ProductCategory[];
    value: string;
    withNone?: boolean;
    onChange: (categoryId: string) => void;
}) {
    if (categories.length === 0) return null;
    const chips = [
        { value: "", label: "ทุกหมวด" },
        ...categories.map((category) => ({ value: category.pc_id, label: category.pc_name })),
        ...(withNone ? [{ value: "none", label: "ไม่มีหมวด" }] : []),
    ];
    return (
        <div
            className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
            role="group"
            aria-label="กรองตามหมวด"
        >
            <div className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap sm:pb-0">
                {chips.map((chip) => (
                    <button
                        key={chip.value || "all"}
                        type="button"
                        aria-pressed={value === chip.value}
                        onClick={() => onChange(chip.value)}
                        className={`min-h-10 rounded-full border px-4 text-sm whitespace-nowrap transition ${
                            value === chip.value
                                ? "border-blue-600 bg-blue-600 text-white shadow-brand"
                                : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                        }`}
                    >
                        {chip.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
