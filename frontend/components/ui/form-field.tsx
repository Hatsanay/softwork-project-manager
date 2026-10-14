// ช่องกรอกพร้อมชื่อช่อง + ข้อความใต้ช่อง (FieldHint) — ใช้กับฟอร์มของโมดูลใหม่
// error มาจากชุดตรวจ zod เดียวกับ backend (ชื่อช่อง = ชื่อคอลัมน์) แสดงแทนที่ข้อความใต้ช่อง
import FieldHint from "@/components/ui/guidance/field-hint";

type FormFieldProps = {
    label: string;
    htmlFor: string;
    required?: boolean;
    hint?: React.ReactNode;
    error?: string | null;
    className?: string;
    children: React.ReactNode;
};

export default function FormField({
    label,
    htmlFor,
    required = false,
    hint,
    error,
    className = "",
    children,
}: FormFieldProps) {
    return (
        <div className={`grid min-w-0 content-start gap-1.5 ${className}`}>
            <label htmlFor={htmlFor} className="text-sm font-normal text-gray-800">
                {label}
                {required && <span className="ml-0.5 text-red-600">*</span>}
            </label>
            {children}
            <FieldHint id={`${htmlFor}-hint`} error={error}>
                {hint}
            </FieldHint>
        </div>
    );
}

// ขนาดช่องกรอก — ใช้ตัวเลือกนี้แทนการต่อคลาส py-/px-/h- ทับ (คลาสระยะชนกัน Tailwind เลือกตัวไหนก็ได้ → ตัวหนังสือโดนตัด)
//   md  = ช่องในฟอร์มปกติ · sm = ตัวกรองบนหัวการ์ด/ช่องในตาราง (สูง 36px) · tight = ช่องเลือกแคบ เช่น ฿/% (ระยะซ้ายขวาน้อย)
const INPUT_SIZES = {
    md: "px-3.5 py-2.5",
    sm: "h-9 px-3 py-1.5",
    tight: "px-2 py-2.5",
} as const;

// class ของช่องกรอกตามธีม (UI ใหม่ 13 ต.ค. 2026): มุมโค้ง ขอบเทาบาง โฟกัสเป็นวงฟ้าอ่อน — มี error เป็นขอบแดง
export function inputClass(hasError?: boolean, size: keyof typeof INPUT_SIZES = "md") {
    const base =
        `w-full rounded-xl border bg-white ${INPUT_SIZES[size]} text-sm font-light text-gray-800 shadow-xs transition ` +
        "placeholder:text-gray-400 focus:outline-none focus:ring-4 disabled:bg-gray-50 disabled:text-gray-500";
    if (hasError) return `${base} border-red-400 focus:border-red-500 focus:ring-red-500/15`;
    return `${base} border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-blue-500/15`;
}
