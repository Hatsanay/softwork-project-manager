// รายการแถวแบบการ์ด (ใช้ได้ที่ความกว้างมือถือ ไม่ต้องเลื่อนแนวนอน) + ป้ายสถานะ
// ใช้ร่วมกัน: แท็บสาขา/บัญชี/สกุลเงินของหน้าตั้งค่าบริษัท และหมวดหมู่/ชุดรายการของหน้าสินค้า
import { Pencil, Trash2 } from "lucide-react";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { buttonClass } from "@/components/ui/button";

export function StatusPill({ isActive }: { isActive: boolean }) {
    return <ActiveStatusPill isActive={isActive} />;
}

export function InfoPill({ children }: { children: React.ReactNode }) {
    return (
        <span className="inline-flex h-6 items-center rounded-lg bg-blue-50 px-2.5 text-xs text-blue-600">
            {children}
        </span>
    );
}

type RecordRowProps = {
    title: React.ReactNode;
    details?: React.ReactNode;
    pills?: React.ReactNode;
    canEdit: boolean;
    onEdit: () => void;
    // ไม่ส่ง = ไม่มีปุ่มลบ (เช่น สาขา/บัญชีที่อยู่บนเอกสารแล้ว ใช้ปิดใช้งานแทน)
    onDelete?: () => void;
};

export function RecordRow({ title, details, pills, canEdit, onEdit, onDelete }: RecordRowProps) {
    return (
        <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="grid min-w-0 gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-800">{title}</p>
                    {pills}
                </div>
                {details && <p className="text-xs text-gray-500">{details}</p>}
            </div>
            {canEdit && (
                <div className="flex gap-2">
                    <button type="button" className={buttonClass("secondary", "sm")} onClick={onEdit}>
                        <Pencil size={16} />
                        แก้ไข
                    </button>
                    {onDelete && (
                        <button type="button" className={buttonClass("ghost", "sm")} onClick={onDelete}>
                            <Trash2 size={16} />
                            ลบ
                        </button>
                    )}
                </div>
            )}
        </li>
    );
}

export function RecordList({ children }: { children: React.ReactNode }) {
    return <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">{children}</ul>;
}
