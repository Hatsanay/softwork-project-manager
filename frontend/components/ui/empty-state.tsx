// หน้าว่าง — บอกว่าที่นี่จะมีอะไร ทำไมยังว่าง และปุ่มทำขั้นแรก (ถ้ามี)
import { Inbox, type LucideIcon } from "lucide-react";

type EmptyStateProps = {
    title: string;
    description?: React.ReactNode;
    icon?: LucideIcon;
    action?: React.ReactNode;
};

export default function EmptyState({ title, description, icon: Icon = Inbox, action }: EmptyStateProps) {
    return (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 px-6 py-10 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-card">
                <Icon size={20} />
            </span>
            <div className="grid max-w-md gap-1">
                <p className="font-normal text-gray-800">{title}</p>
                {description && <p className="text-sm text-gray-500">{description}</p>}
            </div>
            {action}
        </div>
    );
}
