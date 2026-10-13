// ปุ่มหลักแบบเดิม (หน้าเก่าเรียกใช้อยู่) — หน้าตาตามปุ่มใหม่แบบ primary · โมดูลใหม่ใช้ components/ui/button.tsx
import { ButtonHTMLAttributes } from "react";
import { buttonClass } from "@/components/ui/button";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
}

export default function Button({ children, className = "", ...props }: ButtonProps) {
    return (
        <button {...props} className={buttonClass("primary", "md", className)}>
            {children}
        </button>
    );
}
