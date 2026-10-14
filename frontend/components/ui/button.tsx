// ปุ่มของระบบ (UI ใหม่ 13 ต.ค. 2026 — docs/plans/2026-10-13-ui-refresh.md)
// primary = ฟ้าไล่เฉด (การกระทำหลักของหน้า มีหน้าละ 1 ปุ่ม) · secondary = ขาวขอบเทา · ghost = โปร่ง · danger = แดง (ยืนยันลบ/ปิดเท่านั้น)
import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "sm";

const BASE =
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-normal transition " +
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 " +
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0";

const VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-brand-gradient font-medium text-white shadow-brand hover:brightness-105",
    secondary: "border border-gray-200 bg-white text-gray-700 shadow-xs hover:border-gray-300 hover:bg-gray-50",
    ghost: "text-gray-500 hover:bg-gray-100 hover:text-gray-900",
    danger: "bg-red-600 font-medium text-white shadow-xs hover:bg-red-700",
};

// มือถือ: ปุ่มเล็กสูง 40px (นิ้วกดโดนง่าย ไม่โดนปุ่มข้าง ๆ) · จอ 640px ขึ้นไปค่อยลดเหลือ 32px
const SIZES: Record<ButtonSize, string> = {
    md: "h-10 rounded-xl px-4 text-sm",
    sm: "h-10 rounded-lg px-3 text-sm sm:h-8",
};

/** class ของปุ่ม — ใช้กับ <Link> หรือ <label> ที่ต้องหน้าตาเหมือนปุ่มได้ด้วย */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className = ""): string {
    return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
};

export default function Button({
    variant = "secondary",
    size = "md",
    className = "",
    type = "button",
    ...props
}: ButtonProps) {
    return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
