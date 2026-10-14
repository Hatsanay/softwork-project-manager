import { ChartColumn } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import PageHeader from "@/components/ui/page-header";

// ยังไม่มีรายงาน — รายงานยอดขาย/ลูกหนี้มาในวงจรขายช่วง 1D (docs/plans/2026-10-08-sales-cycle.md)
export default function ReportsPage() {
    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader title="รายงาน" />
            <EmptyState
                icon={ChartColumn}
                title="ยังไม่มีรายงาน"
                description="รายงานยอดขาย ลูกหนี้คงค้าง และไฟล์ส่งนักบัญชี จะมาพร้อมระบบใบแจ้งหนี้และใบเสร็จ"
            />
        </div>
    );
}
