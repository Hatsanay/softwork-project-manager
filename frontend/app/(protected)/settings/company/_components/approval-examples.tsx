// ตัวอย่าง "ยอดเท่าไรต้องผ่านชั้นไหน" คำนวณจากค่าที่กำลังกรอกอยู่ (ยังไม่ต้องบันทึก) — เปลี่ยนตามที่พิมพ์ทันที
import { ArrowRight } from "lucide-react";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import type { RoleChoice } from "../_types";
import type { LevelForm } from "./approval-tab";

type ApprovalExamplesProps = {
    levels: LevelForm[];
    roles: RoleChoice[];
};

// ยอดขั้นต่ำของทุกชั้นเป็นร้อยส่วน — ถ้าช่องไหนยังกรอกไม่ถูก คืน null (ยังแสดงตัวอย่างไม่ได้)
function readMinimumAmounts(levels: LevelForm[]): bigint[] | null {
    const amounts: bigint[] = [];
    for (const level of levels) {
        try {
            amounts.push(parseHundredths(level.al_min_amount_thb, "ยอดขั้นต่ำ"));
        } catch {
            return null;
        }
    }
    const isIncreasing = amounts.every((amount, index) => index === 0 || amount > amounts[index - 1]);
    return isIncreasing ? amounts : null;
}

export default function ApprovalExamples({ levels, roles }: ApprovalExamplesProps) {
    const minimumAmounts = readMinimumAmounts(levels);
    if (!minimumAmounts) {
        return <p>แก้ยอดขั้นต่ำให้ถูกต้อง (เป็นตัวเลข และเพิ่มขึ้นทุกชั้น) แล้วตัวอย่างจะแสดงที่นี่</p>;
    }

    const roleNames = new Map(roles.map((role) => [role.role_id, role.role_name]));

    return (
        <div className="grid gap-3">
            {levels.map((level, index) => {
                const nextMinimum = minimumAmounts[index + 1];
                const rangeText =
                    nextMinimum === undefined
                        ? `ตั้งแต่ ${formatAmount(minimumAmounts[index])} บาท`
                        : `${formatAmount(minimumAmounts[index])} – ${formatAmount(nextMinimum - 1n)} บาท`;
                const passedLevels = levels.slice(0, index + 1);

                return (
                    <div key={index} className="grid gap-1">
                        <p className="font-medium text-gray-800">{rangeText}</p>
                        <div className="flex flex-wrap items-center gap-1">
                            {passedLevels.map((passedLevel, passedIndex) => (
                                <span key={passedIndex} className="inline-flex items-center gap-1">
                                    {passedIndex > 0 && <ArrowRight size={12} className="text-gray-400" />}
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                                        ชั้น {passedIndex + 1}
                                        {passedLevel.role_ids.length > 0 &&
                                            `: ${passedLevel.role_ids.map((roleId) => roleNames.get(roleId) ?? "?").join(", ")}`}
                                        {passedLevel.al_require_distinct && " (คนละคน)"}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                );
            })}
            <p className="text-xs text-gray-500">
                ยอดเทียบเป็นบาทก่อน VAT · ใบสกุลต่างประเทศแปลงด้วยอัตราแลกเปลี่ยนในใบ
            </p>
        </div>
    );
}
