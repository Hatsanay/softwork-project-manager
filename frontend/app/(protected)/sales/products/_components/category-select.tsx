// ช่องเลือกหมวด — แสดงเฉพาะหมวดที่เปิดใช้งาน + หมวดเดิมของรายการที่กำลังแก้ (แม้ถูกปิดไปแล้ว)
import { inputClass } from "@/components/ui/form-field";
import type { ProductCategory } from "../_types";

type CategorySelectProps = {
    id: string;
    value: string;
    onChange: (categoryId: string) => void;
    categories: ProductCategory[];
    savedCategoryId?: string | null;
    hasError?: boolean;
};

export default function CategorySelect({
    id,
    value,
    onChange,
    categories,
    savedCategoryId = null,
    hasError = false,
}: CategorySelectProps) {
    const choices = categories.filter(
        (category) => category.pc_status === "active" || category.pc_id === savedCategoryId,
    );
    return (
        <select
            id={id}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-describedby={`${id}-hint`}
            className={inputClass(hasError)}
        >
            <option value="">— ไม่มีหมวด —</option>
            {choices.map((category) => (
                <option key={category.pc_id} value={category.pc_id}>
                    {category.pc_name}
                    {category.pc_status !== "active" ? " (ปิดใช้งาน)" : ""}
                </option>
            ))}
        </select>
    );
}
