// ปุ่ม "แก้ไข" ในแถวตาราง — มีตัวหนังสือเสมอ (ไม่ใช้ไอคอนล้วนที่ต้องเดาความหมาย และระบบไม่ใช้ tooltip)
import { ButtonHTMLAttributes } from "react";
import { Pencil } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

interface EditButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
}

export default function EditButton({ children, type = "button", ...props }: EditButtonProps) {
    return (
        <button type={type} {...props} className={buttonClass("secondary", "sm")}>
            <Pencil size={14} className="text-gray-400" />
            {children ?? "แก้ไข"}
        </button>
    );
}
