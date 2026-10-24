"use client";

// วัน WFH ประจำของพนักงาน (2026-10-24) — เลือกวันในสัปดาห์ที่ทำงานที่บ้านประจำ · ทุกวัน = WFH เต็มเวลา
// วัน WFH กดเข้า/ออกได้ทุกที่ไม่ตรวจตำแหน่ง · มีผลกับการกดหลังจากบันทึก (การกดเดิมไม่เปลี่ยน)
import { useState } from "react";
import { toast } from "sonner";
import { House } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { WEEKDAY_LABELS } from "@/lib/shared/schemas/people.mjs";
import { WFH_MESSAGES } from "../../../_messages";
import { wfhWeekdaysText } from "../../../_schedule-label";
import type { Employee } from "../../../_types";

const NO_WFH_DAYS = "0000000";
const FULL_TIME_WFH = "1111111";

export default function WfhDaysCard({ employee, onChanged }: { employee: Employee; onChanged: () => Promise<void> }) {
    const [weekdays, setWeekdays] = useState(employee.emp_wfh_weekdays);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const isChanged = weekdays !== employee.emp_wfh_weekdays;
    const savedText = wfhWeekdaysText(employee.emp_wfh_weekdays);

    function toggleWeekday(index: number) {
        const days = weekdays.split("");
        days[index] = days[index] === "1" ? "0" : "1";
        setWeekdays(days.join(""));
    }

    async function save() {
        setError(null);
        setIsSaving(true);
        const { error: saveError } = await apiFetch(`/employees/${employee.emp_id}/wfh-days`, {
            method: "PUT",
            body: { emp_wfh_weekdays: weekdays },
        });
        setIsSaving(false);
        if (saveError) {
            setError(saveError.fields.emp_wfh_weekdays ?? saveError.message);
            return;
        }
        toast.success("บันทึกวัน WFH แล้ว");
        await onChanged();
    }

    return (
        <SectionCard icon={House} title="ทำงานที่บ้าน (WFH)" description="วันที่ทำงานที่บ้านประจำทุกสัปดาห์">
            <div className="grid gap-1 rounded-xl bg-gray-50 p-4">
                <span className="text-xs text-gray-500">ตอนนี้</span>
                <span className="text-base font-medium text-gray-900">{savedText ? `WFH ${savedText}` : "ไม่มีวัน WFH ประจำ"}</span>
                <span className="text-xs text-gray-500">วันอื่นพนักงานขอ WFH รายวันได้เอง แล้วรอผู้อนุมัติลงเวลาอนุมัติ</span>
            </div>

            <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm text-gray-800">วัน WFH ประจำ</legend>
                <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((label, index) => {
                        const isWfh = weekdays[index] === "1";
                        return (
                            <button
                                key={label}
                                type="button"
                                aria-pressed={isWfh}
                                onClick={() => toggleWeekday(index)}
                                className={`min-h-10 rounded-xl border px-3 text-sm ${
                                    isWfh ? "border-blue-200 bg-blue-50 text-blue-600" : "border-gray-200 bg-white text-gray-500"
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <button type="button" className="min-h-9 text-blue-600 hover:underline" onClick={() => setWeekdays(FULL_TIME_WFH)}>
                        เลือกทุกวัน (WFH เต็มเวลา)
                    </button>
                    <button type="button" className="min-h-9 text-blue-600 hover:underline" onClick={() => setWeekdays(NO_WFH_DAYS)}>
                        ไม่มีวัน WFH
                    </button>
                </div>
                <FieldHint error={error}>
                    {WFH_MESSAGES.employeeDays}
                    {!employee.emp_attendance_required && " · คนนี้ตั้งไว้ว่าไม่ต้องลงเวลา วัน WFH จึงยังไม่มีผล"}
                </FieldHint>
            </fieldset>

            {isChanged && (
                <div className="flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "md")}
                        disabled={isSaving}
                        onClick={() => setWeekdays(employee.emp_wfh_weekdays)}
                    >
                        ยกเลิก
                    </button>
                    <button type="button" className={buttonClass("primary", "md")} disabled={isSaving} onClick={save}>
                        {isSaving ? "กำลังบันทึก..." : "บันทึกวัน WFH"}
                    </button>
                </div>
            )}
        </SectionCard>
    );
}
