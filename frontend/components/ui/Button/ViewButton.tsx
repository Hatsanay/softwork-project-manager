// ปุ่ม "ดู" ในแถวตาราง — มีตัวหนังสือเสมอ
import { ButtonHTMLAttributes } from "react";
import { Eye } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

interface ViewButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children?: React.ReactNode;
}

export default function ViewButton({ children, type = "button", ...props }: ViewButtonProps) {
    return (
        <button type={type} {...props} className={buttonClass("secondary", "sm")}>
            <Eye size={14} className="text-gray-400" />
            {children ?? "ดู"}
        </button>
    );
}
