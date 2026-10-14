"use client";

// งวดชำระ — แต่ละงวดระบุเป็น % หรือจำนวนเงิน · ผลรวมต้องเท่ายอดรวมทั้งสิ้นพอดี (งวดสุดท้ายรับเศษ)
import { Plus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { formatAmount } from "@/lib/shared/money.mjs";
import { QUOTATION_MESSAGES } from "../_messages";
import { emptyMilestone, type MilestoneForm } from "../_form-state";

type MilestonesEditorProps = {
    milestones: MilestoneForm[];
    amounts: (bigint | null)[];
    currencyDecimals: number;
    milestonesError: string | null;
    errors: Record<string, string>;
    onChange: (milestones: MilestoneForm[]) => void;
};

export default function MilestonesEditor({
    milestones,
    amounts,
    currencyDecimals,
    milestonesError,
    errors,
    onChange,
}: MilestonesEditorProps) {
    function update(index: number, changes: Partial<MilestoneForm>) {
        onChange(
            milestones.map((milestone, milestoneIndex) =>
                milestoneIndex === index ? { ...milestone, ...changes } : milestone,
            ),
        );
    }

    return (
        <div className="grid gap-2">
            {milestones.map((milestone, index) => {
                const amount = amounts[index];
                const rowError = errors[`milestones.${index}.qtm_name`] ?? errors[`milestones.${index}.qtm_percent`];
                return (
                    <div
                        key={milestone.rowKey}
                        className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-[1fr_1fr_10rem_8rem_auto] sm:items-end"
                    >
                        <label className="grid gap-1 text-xs text-gray-600">
                            งวดที่ {index + 1}
                            <input
                                value={milestone.qtm_name}
                                placeholder="เช่น มัดจำ"
                                onChange={(event) => update(index, { qtm_name: event.target.value })}
                                className={inputClass(Boolean(errors[`milestones.${index}.qtm_name`]))}
                            />
                        </label>
                        <label className="grid gap-1 text-xs text-gray-600">
                            เงื่อนไขการเรียกเก็บ
                            <input
                                value={milestone.qtm_condition}
                                placeholder="เช่น เมื่อเซ็นสัญญา"
                                onChange={(event) => update(index, { qtm_condition: event.target.value })}
                                className={inputClass()}
                            />
                        </label>
                        <label className="grid gap-1 text-xs text-gray-600">
                            {milestone.mode === "percent" ? "%" : "จำนวนเงิน"}
                            <div className="flex gap-1">
                                <input
                                    inputMode="decimal"
                                    value={milestone.value}
                                    onChange={(event) => update(index, { value: event.target.value })}
                                    className={inputClass(Boolean(errors[`milestones.${index}.qtm_percent`]))}
                                />
                                <select
                                    aria-label="ระบุเป็น"
                                    value={milestone.mode}
                                    onChange={(event) =>
                                        update(index, { mode: event.target.value as MilestoneForm["mode"] })
                                    }
                                    className={`${inputClass(false, "tight")} w-20`}
                                >
                                    <option value="percent">%</option>
                                    <option value="amount">เงิน</option>
                                </select>
                            </div>
                        </label>
                        <p className="py-2.5 text-right text-sm tabular-nums text-gray-800">
                            {amount !== null && amount !== undefined ? formatAmount(amount, currencyDecimals) : "—"}
                        </p>
                        <button
                            type="button"
                            aria-label={`ลบงวดที่ ${index + 1}`}
                            className={buttonClass("ghost", "sm")}
                            onClick={() => onChange(milestones.filter((_, milestoneIndex) => milestoneIndex !== index))}
                        >
                            <Trash2 size={15} />
                        </button>
                        {rowError && (
                            <p role="alert" className="text-xs text-red-600 sm:col-span-full">
                                {rowError}
                            </p>
                        )}
                    </div>
                );
            })}
            <div>
                <button
                    type="button"
                    className={buttonClass("secondary", "sm")}
                    onClick={() => onChange([...milestones, emptyMilestone()])}
                >
                    <Plus size={16} />
                    เพิ่มงวด
                </button>
            </div>
            <FieldHint error={milestones.length > 0 ? milestonesError : null}>
                {QUOTATION_MESSAGES.milestones}
            </FieldHint>
        </div>
    );
}
