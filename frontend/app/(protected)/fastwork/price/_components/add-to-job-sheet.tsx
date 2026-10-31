"use client";

// ลูกค้าจ้างเพิ่มในงานเดิม (2026-10-31): ต่องวดใหม่ท้ายงาน Fastwork ที่กำลังทำ + เพิ่มรายการเป็นงานในโปรเจกต์ (เลือกได้)
// ใช้หลังผู้ซื้อจ่ายงานเพิ่มบน Fastwork แล้ว · งานที่จบแล้วไม่อยู่ในรายการ (รับเป็นงานใหม่แทน)
// งานที่ปิดยอดส่วนแบ่งแล้ว: เพิ่มงวดได้ แต่บันทึกเงินงวดนี้ไม่ได้จนกว่าจะยกเลิกการปิดยอด → เตือนก่อนกด
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Switch from "@/components/ui/switch";
import { buttonClass } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import { fastworkAddMilestonesSchema } from "@/lib/shared/schemas/fastwork.mjs";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { SheetButtons, SheetFrame } from "../../_components/sheet-frame";
import { NEXT_STEP } from "../../_next-step";
import type { FastworkOverview } from "../../_types";
import { countTasks, type AddedTask } from "@/lib/catalog-tasks";

// ขั้นที่แปลว่าปิดยอดส่วนแบ่งแล้ว (หน้า Fastwork คิดให้)
const SETTLED_STEPS = new Set(["pay", "done"]);
const MAX_MILESTONE_NAME = 200;

// ราคาที่ยังพิมพ์ไม่ครบ/ไม่ใช่ตัวเลข = แสดง "-" (ข้อผิดพลาดจริงขึ้นใต้ช่องตอนกด)
function amountText(value: string) {
    try {
        return formatAmount(value);
    } catch {
        return "-";
    }
}

export default function AddToJobSheet({
    title,
    offer,
    tasks,
    onClose,
}: {
    // ชื่อรายการในตะกร้า (ใช้ตั้งชื่องวด)
    title: string;
    // ราคาเสนอ = ราคางวด
    offer: string;
    tasks: AddedTask[];
    onClose: () => void;
}) {
    const titleId = useId();
    const [projects, setProjects] = useState<FastworkOverview["projects"] | null>(null);
    const [projectId, setProjectId] = useState("");
    const [milestoneName, setMilestoneName] = useState(`จ้างเพิ่ม: ${title}`.slice(0, MAX_MILESTONE_NAME));
    const [amount, setAmount] = useState(offer);
    const [dueDate, setDueDate] = useState("");
    const [withTasks, setWithTasks] = useState(true);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [bannerError, setBannerError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [added, setAdded] = useState<{ projectId: string; projectName: string; isSettled: boolean } | null>(null);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<FastworkOverview>("/fastwork/overview").then(({ data }) => {
            if (!isLeftPage) setProjects(data?.projects ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const taskCount = countTasks(tasks);
    const chosen = projects?.find((project) => project.project_id === projectId) ?? null;
    const isChosenSettled = chosen ? SETTLED_STEPS.has(chosen.next_step) : false;

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBannerError(null);
        if (!projectId) {
            setErrors({ project_id: "เลือกงานที่ลูกค้าจ้างเพิ่ม" });
            return;
        }
        const body = {
            milestones: [{ fwm_id: null, fwm_name: milestoneName, fwm_amount: amount, fwm_due_date: dueDate || null }],
            tasks: withTasks ? tasks : [],
        };
        const checked = fastworkAddMilestonesSchema.safeParse(body);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ shares_settled: boolean; task_count: number }>(
            `/fastwork/projects/${encodeURIComponent(projectId)}/milestones`,
            { method: "POST", body: checked.data },
        );
        setIsSaving(false);
        if (error) {
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBannerError(error.message);
            return;
        }
        toast.success(
            `เพิ่มงวดใหม่ในงาน ${chosen?.project_name ?? ""} แล้ว${data && data.task_count > 0 ? ` · เพิ่ม ${data.task_count} งาน` : ""}`,
        );
        setAdded({ projectId, projectName: chosen?.project_name ?? "", isSettled: Boolean(data?.shares_settled) });
    }

    if (added) {
        return (
            <SheetFrame
                titleId={titleId}
                title="เพิ่มงวดแล้ว"
                subtitle={added.projectName}
                onClose={onClose}
                onSubmit={(event) => event.preventDefault()}
            >
                {added.isSettled && (
                    <StatusBanner tone="wait" title="งานนี้ปิดยอดส่วนแบ่งแล้ว">
                        บันทึกเงินของงวดใหม่ไม่ได้จนกว่าจะยกเลิกการปิดยอด (ทำได้เมื่อยังไม่ได้จ่ายใคร)
                    </StatusBanner>
                )}
                <p className="text-sm text-gray-600">
                    ผู้ซื้อยืนยันงวดบน Fastwork เมื่อไร บันทึกเงินได้ที่หน้ารายการเงินเหมือนงวดอื่น
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={onClose}>
                        ปิด
                    </button>
                    <Link href={`/projects/view?id=${added.projectId}`} className={buttonClass("primary", "md")}>
                        เปิดงาน
                    </Link>
                </div>
            </SheetFrame>
        );
    }

    return (
        <SheetFrame
            titleId={titleId}
            title="เพิ่มเป็นงวดของงานเดิม"
            subtitle="ลูกค้าจ้างเพิ่มระหว่างงานยังไม่จบ · กดหลังผู้ซื้อจ่ายงานเพิ่มบน Fastwork แล้ว"
            onClose={onClose}
            onSubmit={submit}
        >
            {bannerError && (
                <StatusBanner tone="error" title="เพิ่มงวดไม่สำเร็จ">
                    {bannerError}
                </StatusBanner>
            )}
            <FormField label="งาน Fastwork ที่กำลังทำ" htmlFor="add_job_project" required error={errors.project_id}>
                <select
                    id="add_job_project"
                    value={projectId}
                    disabled={projects === null}
                    onChange={(event) => setProjectId(event.target.value)}
                    className={inputClass(Boolean(errors.project_id))}
                >
                    <option value="">{projects === null ? "กำลังโหลด..." : "เลือกงาน"}</option>
                    {(projects ?? []).map((project) => (
                        <option key={project.project_id} value={project.project_id}>
                            {project.project_name}
                            {project.client_name ? ` · ${project.client_name}` : ""} (
                            {NEXT_STEP[project.next_step].label})
                        </option>
                    ))}
                </select>
            </FormField>
            {projects !== null && projects.length === 0 && (
                <FieldHint>
                    ไม่มีงาน Fastwork ที่กำลังทำ · ลูกค้าจ้างหลังงานจบแล้ว ให้กด &quot;สร้างงาน Fastwork
                    จากตะกร้านี้&quot; แทน
                </FieldHint>
            )}
            {isChosenSettled && (
                <StatusBanner tone="wait" title="งานนี้ปิดยอดส่วนแบ่งแล้ว">
                    เพิ่มงวดได้ แต่บันทึกเงินงวดนี้ไม่ได้จนกว่าจะยกเลิกการปิดยอด · ถ้าจ่ายส่วนแบ่งไปแล้ว
                    ให้สร้างเป็นงานใหม่แทน
                </StatusBanner>
            )}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_11rem]">
                <FormField label="ชื่องวด" htmlFor="add_job_name" required error={errors["milestones.0.fwm_name"]}>
                    <input
                        id="add_job_name"
                        value={milestoneName}
                        maxLength={MAX_MILESTONE_NAME}
                        onChange={(event) => setMilestoneName(event.target.value)}
                        className={inputClass(Boolean(errors["milestones.0.fwm_name"]))}
                    />
                </FormField>
                <FormField
                    label="ราคางวด (บาท)"
                    htmlFor="add_job_amount"
                    required
                    error={errors["milestones.0.fwm_amount"]}
                    hint="ก่อนหักค่าธรรมเนียม"
                >
                    <input
                        id="add_job_amount"
                        inputMode="decimal"
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        className={`${inputClass(Boolean(errors["milestones.0.fwm_amount"]))} text-right tabular-nums`}
                    />
                </FormField>
                <FormField
                    label="กำหนดส่ง"
                    htmlFor="add_job_due"
                    error={errors["milestones.0.fwm_due_date"]}
                    hint="ไม่บังคับ"
                >
                    <input
                        id="add_job_due"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                        className={inputClass(false)}
                    />
                </FormField>
            </div>
            {errors.milestones && <FieldHint error={errors.milestones} />}
            {/* ตะกร้ามีแต่ค่าบริการแบบ % = ไม่มีชิ้นงานให้สร้าง */}
            {taskCount.total > 0 && (
                <div className="grid gap-2 rounded-xl bg-gray-50 p-3">
                    <Switch
                        id="add_job_tasks"
                        label={`เพิ่มรายการเป็นงานในโปรเจกต์ (งานหลัก ${taskCount.mainCount}${taskCount.subCount > 0 ? ` · งานย่อย ${taskCount.subCount}` : ""})`}
                        description="แพ็กเป็นงานหลัก รายการในแพ็กเป็นงานย่อย · ค่าบริการแบบ % ไม่เป็นงาน · ปิดได้ถ้าจะแบ่งงานเอง"
                        checked={withTasks}
                        onChange={setWithTasks}
                    />
                </div>
            )}
            <p className="text-sm text-gray-600">
                งวดนี้ต่อท้ายงวดเดิม ราคา{" "}
                <span className="font-medium text-gray-900 tabular-nums">{amountText(amount)}</span> บาท ·
                ส่วนแบ่งและเงินทุนของงานนี้คิดรวมให้เอง
            </p>
            <SheetButtons isSaving={isSaving} submitLabel="เพิ่มงวด" onClose={onClose} />
        </SheetFrame>
    );
}
