// กล่องฟอร์มแบบเดิม (หน้าเก่าเรียกใช้อยู่) — หน้าตาเป็นการ์ดแบบใหม่ (UI ใหม่ 13 ต.ค. 2026)
// จอมือถือเหลือคอลัมน์เดียวเสมอ · จอตั้งแต่ 640px ใช้จำนวนคอลัมน์ตาม cols (ช่องกว้างเต็มแถวใช้ col-span-full)
import { CSSProperties, FormHTMLAttributes } from "react";

type FormProps = FormHTMLAttributes<HTMLFormElement> & {
    cols?: number;
};

export default function Form({ className = "", cols = 1, style, children, ...props }: FormProps) {
    const columnStyle = { "--form-columns": cols, ...style } as CSSProperties;
    return (
        <form
            {...props}
            style={columnStyle}
            className={`grid grid-cols-1 gap-x-6 gap-y-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:grid-cols-[repeat(var(--form-columns),minmax(0,1fr))] sm:p-6 ${className}`}
        >
            {children}
        </form>
    );
}
