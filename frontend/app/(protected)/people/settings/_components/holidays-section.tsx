"use client";

// วันหยุดบริษัทรายปี — เลือกปี · เพิ่ม · ลบ (โหลดแยกจากตั้งค่าอื่น เพราะสะสมหลายปี)
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { holidaySchema } from "@/lib/shared/schemas/people.mjs";
import { SETUP_MESSAGES } from "../../_messages";
import type { Holiday } from "../../_types";

// "2026-12-31" → "พฤ. 31 ธ.ค." (วันที่ล้วน ไม่ผ่านเขตเวลาเครื่อง)
function holidayLabel(dateText: string) {
    return new Intl.DateTimeFormat("th-TH", {
        weekday: "short",
        day: "numeric",
        month: "short",
        timeZone: "UTC",
    }).format(new Date(`${dateText}T00:00:00Z`));
}

export default function HolidaysSection({ today, canEdit }: { today: string; canEdit: boolean }) {
    const [year, setYear] = useState(Number(today.slice(0, 4)));
    const [holidays, setHolidays] = useState<Holiday[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const load = useCallback(async (targetYear: number) => {
        const { data, error } = await apiFetch<{ holidays: Holiday[] }>(`/people/holidays?year=${targetYear}`);
        setHolidays(data?.holidays ?? []);
        setLoadError(error?.message ?? null);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ holidays: Holiday[] }>(`/people/holidays?year=${year}`).then(({ data, error }) => {
            if (isLeftPage) return;
            setHolidays(data?.holidays ?? []);
            setLoadError(error?.message ?? null);
        });
        return () => {
            isLeftPage = true;
        };
    }, [year]);

    async function confirmDelete() {
        if (!deleteTarget) return;
        const { error } = await apiFetch(`/people/holidays/${deleteTarget.hd_date}`, { method: "DELETE" });
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success("ลบวันหยุดแล้ว");
        setDeleteTarget(null);
        setDeleteError(null);
        await load(year);
    }

    return (
        <SectionCard
            icon={CalendarDays}
            title="วันหยุดบริษัท"
            description={SETUP_MESSAGES.holidays}
            actions={
                canEdit && (
                    <button type="button" className={buttonClass("secondary", "md")} onClick={() => setIsAdding(true)}>
                        <Plus size={16} />
                        เพิ่มวันหยุด
                    </button>
                )
            }
        >
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    aria-label="ปีก่อนหน้า"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setYear((current) => current - 1)}
                >
                    <ChevronLeft size={16} />
                </button>
                <span className="min-w-28 text-center text-sm font-medium text-gray-900">
                    ปี {year} (พ.ศ. {year + 543})
                </span>
                <button
                    type="button"
                    aria-label="ปีถัดไป"
                    className={buttonClass("secondary", "md")}
                    onClick={() => setYear((current) => current + 1)}
                >
                    <ChevronRight size={16} />
                </button>
            </div>
            {isAdding && (
                <HolidayForm
                    year={year}
                    onDone={async (saved, savedYear) => {
                        setIsAdding(false);
                        if (!saved) return;
                        if (savedYear !== year) {
                            setYear(savedYear);
                            return;
                        }
                        await load(year);
                    }}
                />
            )}
            {loadError && <p className="text-sm text-red-600">{loadError}</p>}
            {holidays && holidays.length === 0 && (
                <p className="text-sm text-gray-500">ยังไม่มีวันหยุดของปีนี้ — ทุกวันทำงานตามสัปดาห์นับเป็นวันทำงาน</p>
            )}
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {holidays?.map((holiday) => (
                    <li
                        key={holiday.hd_date}
                        className="flex items-center justify-between gap-2 rounded-xl border border-gray-200 px-3 py-2"
                    >
                        <span className="grid min-w-0 gap-0.5">
                            <span className="text-gray-900">{holiday.hd_name}</span>
                            <span className="text-xs text-gray-500">{holidayLabel(holiday.hd_date)}</span>
                        </span>
                        {canEdit && (
                            <button
                                type="button"
                                aria-label={`ลบ ${holiday.hd_name}`}
                                className="-my-1 flex h-10 w-10 items-center justify-center text-red-600"
                                onClick={() => setDeleteTarget(holiday)}
                            >
                                <Trash2 size={16} />
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="ลบวันหยุดนี้?"
                description={deleteTarget ? `"${deleteTarget.hd_name}" จะกลับเป็นวันทำงานปกติ` : undefined}
                confirmLabel="ลบวันหยุด"
                errorMessage={deleteError}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setDeleteTarget(null);
                    setDeleteError(null);
                }}
            />
        </SectionCard>
    );
}

function HolidayForm({ year, onDone }: { year: number; onDone: (saved: boolean, year: number) => Promise<void> }) {
    const [form, setForm] = useState({ hd_date: "", hd_name: "" });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [isSaving, setIsSaving] = useState(false);

    async function save(event: React.FormEvent) {
        event.preventDefault();
        const checked = holidaySchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setIsSaving(true);
        const { error } = await apiFetch("/people/holidays", { method: "POST", body: checked.data });
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            toast.error(error.message);
            return;
        }
        toast.success("เพิ่มวันหยุดแล้ว");
        setForm({ hd_date: "", hd_name: "" });
        await onDone(true, Number(checked.data.hd_date.slice(0, 4)));
    }

    return (
        <form onSubmit={save} noValidate className="grid gap-3 rounded-xl bg-gray-50 p-4 sm:grid-cols-2">
            <FormField label="วันที่" htmlFor="hd_date" required error={errors.hd_date}>
                <input
                    id="hd_date"
                    type="date"
                    min={`${year}-01-01`}
                    value={form.hd_date}
                    onChange={(event) => setForm((current) => ({ ...current, hd_date: event.target.value }))}
                    className={inputClass(Boolean(errors.hd_date))}
                />
            </FormField>
            <FormField label="ชื่อวันหยุด" htmlFor="hd_name" required error={errors.hd_name}>
                <input
                    id="hd_name"
                    placeholder="เช่น วันสงกรานต์"
                    value={form.hd_name}
                    onChange={(event) => setForm((current) => ({ ...current, hd_name: event.target.value }))}
                    className={inputClass(Boolean(errors.hd_name))}
                />
            </FormField>
            <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                <button type="button" className={buttonClass("secondary", "md")} onClick={() => onDone(false, year)}>
                    ปิด
                </button>
                <button type="submit" className={buttonClass("primary", "md")} disabled={isSaving}>
                    เพิ่มวันหยุด
                </button>
            </div>
        </form>
    );
}
