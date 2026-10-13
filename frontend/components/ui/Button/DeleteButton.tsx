// ปุ่ม "ลบ" ในแถวตาราง — โปร่ง ตัวหนังสือแดง (สีแดงเต็มปุ่มเก็บไว้ให้ปุ่มยืนยันในหน้าต่างยืนยันเท่านั้น)
import { ButtonHTMLAttributes } from "react";
import { Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

interface DeleteButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
}

export default function DeleteButton({ children, type = "button", ...props }: DeleteButtonProps) {
    return (
        <button
            type={type}
            {...props}
            className={buttonClass("ghost", "sm", "text-red-600 hover:bg-red-50 hover:text-red-700")}
        >
            <Trash2 size={14} />
            {children ?? "ลบ"}
        </button>
    );
}
