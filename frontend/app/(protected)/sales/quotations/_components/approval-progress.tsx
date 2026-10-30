// ความคืบหน้าการอนุมัติ (รอบปัจจุบัน) + ประวัติทุกรอบ รวมการตีกลับพร้อมเหตุผล
import { CheckCircle2, Circle, Clock, Undo2 } from "lucide-react";
import { CARD_CLASS } from "@/components/ui/card";
import formatDate from "@/app/function";
import type { ApprovalHistoryRow, Quotation } from "../_types";

type ApprovalProgressProps = {
    quotation: Quotation;
    history: ApprovalHistoryRow[];
};

export default function ApprovalProgress({ quotation, history }: ApprovalProgressProps) {
    const plan = quotation.qt_approval_plan ?? [];
    const thisRound = history.filter(
        (row) => row.qta_round === quotation.qt_approval_round && row.qta_action === "approve",
    );
    const showPlan = plan.length > 0 && quotation.qt_status !== "draft";

    // ร่างที่ยังไม่เคยส่ง: ยังไม่มีแผนอนุมัติ (ระบบล็อกจำนวนชั้นตอนกดส่ง) — บอกกติกาแทนการเว้นคอลัมน์ว่าง
    if (quotation.qt_status === "draft" && history.length === 0) {
        return (
            <section className={`grid gap-2 p-5 ${CARD_CLASS}`}>
                <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
                <p className="text-sm text-gray-500">
                    ยังไม่ได้ส่งขออนุมัติ · ระบบเลือกจำนวนชั้นจากยอดก่อน VAT (คิดเป็นบาท) ตอนกดส่ง
                    ตามกติกาในตั้งค่าระบบ &gt; ข้อมูลบริษัท &gt; การอนุมัติ
                </p>
            </section>
        );
    }

    if (!showPlan && history.length === 0) return null;

    return (
        <section className={`grid gap-4 p-5 ${CARD_CLASS}`}>
            <h2 className="text-base font-medium text-gray-900">การอนุมัติ</h2>
            {showPlan && (
                <ol className="grid gap-2">
                    {plan.map((level) => {
                        const approval = thisRound.find((row) => row.qta_level === level.level);
                        const isWaiting =
                            quotation.qt_status === "pending_approval" &&
                            quotation.qt_approval_current_level === level.level;
                        const Icon = approval ? CheckCircle2 : isWaiting ? Clock : Circle;
                        const tone = approval ? "text-green-600" : isWaiting ? "text-amber-600" : "text-gray-300";
                        return (
                            <li key={level.level} className="flex items-start gap-3">
                                <Icon size={18} className={`mt-0.5 shrink-0 ${tone}`} />
                                <div className="grid gap-0.5 text-sm">
                                    <span className="text-gray-800">
                                        ชั้น {level.level} · {level.roles.map((role) => role.role_name).join(", ")}
                                        {level.require_distinct ? " (ต้องเป็นคนละคน)" : ""}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {approval
                                            ? `อนุมัติโดย ${approval.qta_user_name} · ${formatDate(approval.qta_created_at)}`
                                            : isWaiting
                                              ? "รออนุมัติชั้นนี้"
                                              : quotation.qt_status === "pending_approval"
                                                ? "รอชั้นก่อนหน้า"
                                                : "-"}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            {history.length > 0 && (
                <details className="text-sm">
                    <summary className="-my-2 cursor-pointer py-2 text-blue-600">
                        ประวัติการอนุมัติทุกรอบ ({history.length})
                    </summary>
                    <ul className="mt-2 grid gap-1.5">
                        {history.map((row) => (
                            <li key={row.qta_id} className="flex items-start gap-2 text-xs text-gray-600">
                                {row.qta_action === "approve" ? (
                                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                                ) : (
                                    <Undo2 size={14} className="mt-0.5 shrink-0 text-amber-600" />
                                )}
                                <span>
                                    รอบ {row.qta_round} ชั้น {row.qta_level} ·{" "}
                                    {row.qta_action === "approve" ? "อนุมัติ" : "ตีกลับ"}โดย {row.qta_user_name}
                                    {row.qta_role_name ? ` (${row.qta_role_name})` : ""} ·{" "}
                                    {formatDate(row.qta_created_at)}
                                    {row.qta_reason ? ` · เหตุผล: ${row.qta_reason}` : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </section>
    );
}
