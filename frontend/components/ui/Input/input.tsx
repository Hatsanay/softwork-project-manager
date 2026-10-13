// ช่องกรอกแบบเดิม (หน้าเก่าเรียกใช้อยู่) — หน้าตาตามแบบใหม่ ใช้ class เดียวกับ form-field.tsx
import { InputHTMLAttributes } from "react";
import { inputClass } from "@/components/ui/form-field";

type InputProps = InputHTMLAttributes<HTMLInputElement> & { error?: boolean };

export default function Input({ className = "", error, ...props }: InputProps) {
    return <input {...props} className={`${inputClass(error)} ${className}`} />;
}
