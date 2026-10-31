"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import SearchableSelect from "@/components/ui/SearchableSelect";
import FieldHint from "@/components/ui/guidance/field-hint";
import { usePermission, BITS } from "@/app/components/permission-provider";
import PageHeader from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/form-field";
import CatalogTaskPicker, { tasksFromSelection, useTaskCatalog } from "@/components/feature/catalog-task-picker";
import type { CatalogSelection } from "@/lib/catalog-tasks";

type FormState = {
    project_name: string;
    client_id: string;
    project_description: string;
    project_status: string;
    project_type: string;
    project_start_date: string;
    project_due_date: string;
};

const EMPTY_FORM: FormState = {
    project_name: "", client_id: "", project_description: "",
    project_status: "planning", project_type: "waterfall", project_start_date: "", project_due_date: "",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function loadClientOptions(search: string) {
    const res = await fetch(`${api}/clients?${new URLSearchParams({ limit: "20", offset: "0", search, status: "active" })}`, {
        headers: authHeader(),
    });
    if (!res.ok) return [];
    const { data } = await res.json() as { data: { client_id: string; client_name: string }[] };
    return data.map((c) => ({ value: c.client_id, label: c.client_name }));
}

export default function CreateProjectPage() {
    const router = useRouter();
    const hasBit = usePermission();
    const [isPending, startTransition] = useTransition();

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);
    // งานจากสินค้าที่เลือก (2026-10-31) · ไม่เลือก = โปรเจกต์เปล่า เพิ่มงานเองทีหลัง
    const [selection, setSelection] = useState<CatalogSelection[]>([]);
    const { catalog, loadError: catalogError } = useTaskCatalog(hasBit(BITS.createProject));

    function setField<K extends keyof FormState>(name: K, value: FormState[K]) {
        setForm((prev) => ({ ...prev, [name]: value }));
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
        setField(e.target.name as keyof FormState, e.target.value);
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!form.project_name.trim()) { setError("กรุณากรอกชื่อโปรเจกต์"); return; }

        startTransition(async () => {
            const res = await fetch(`${api}/projects`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify({ ...form, tasks: tasksFromSelection(selection, catalog) }),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            if (data.task_count > 0) toast.success(`สร้างโปรเจกต์แล้ว · เพิ่ม ${data.task_count} งานจากสินค้าที่เลือก`);
            router.push(`/projects/view?id=${data.project_id}`);
        });
    }

    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="งาน · โปรเจกต์"
                title="สร้างโปรเจกต์"
                description="คุณจะได้เป็นสมาชิกตำแหน่ง PM ของโปรเจกต์นี้อัตโนมัติ · เลือกสินค้าเพื่อสร้างงานพร้อมกัน หรือเพิ่มงานเองหลังสร้าง"
            />

            <Form cols={2} onSubmit={handleSubmit}>
                <div className="flex flex-col gap-1 col-span-full">
                    <label className="text-sm font-medium text-gray-700">ชื่อโปรเจกต์</label>
                    <Input name="project_name" value={form.project_name} onChange={handleChange}
                        placeholder="เช่น เว็บไซต์ร้านค้าออนไลน์" required />
                </div>

                <div className="flex flex-col gap-1 col-span-full">
                    <div className="flex items-center justify-between mb-1">
                        <label className="text-sm font-medium text-gray-700">ลูกค้า</label>
                        {hasBit(BITS.createClient) && (
                            <a href="/clients/create" target="_blank" rel="noopener noreferrer"
                                className="-my-3 py-3 text-xs text-blue-600 hover:underline">
                                + เพิ่มลูกค้าใหม่
                            </a>
                        )}
                    </div>
                    <SearchableSelect
                        loadOptions={loadClientOptions}
                        value={form.client_id}
                        onChange={(v) => setField("client_id", v)}
                        placeholder="เลือกลูกค้า (ไม่บังคับ)"
                        disabled={isPending}
                    />
                    <FieldHint>แสดงเฉพาะลูกค้าที่เปิดใช้งาน · ลูกค้าที่ปิดใช้งานแล้วเปิดใหม่ได้ที่หน้าลูกค้า</FieldHint>
                </div>

                <div className="flex flex-col gap-1 col-span-full">
                    <label className="text-sm font-medium text-gray-700">คำอธิบาย</label>
                    <textarea
                        name="project_description"
                        value={form.project_description}
                        onChange={handleChange}
                        rows={3}
                        placeholder="รายละเอียดโปรเจกต์"
                        className={inputClass(false)}
                    />
                </div>

                <div className="col-span-full grid gap-3 rounded-xl border border-gray-200 p-4">
                    <div className="grid gap-0.5">
                        <p className="text-sm font-medium text-gray-700">สร้างงานจากสินค้า (ไม่บังคับ)</p>
                        <p className="text-xs leading-relaxed text-gray-500">
                            เลือกสินค้าหรือชุดรายการที่ลูกค้าจ้าง ระบบสร้างงานและงานย่อยให้ตอนบันทึก · ชุดรายการเป็นงานหลัก รายการในชุดเป็นงานย่อย
                        </p>
                    </div>
                    <CatalogTaskPicker
                        id="project_task_catalog"
                        catalog={catalog}
                        loadError={catalogError}
                        selection={selection}
                        onChange={setSelection}
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สถานะ</label>
                    <select
                        value={form.project_status}
                        onChange={(e) => setField("project_status", e.target.value)}
                        className={inputClass(false)}
                    >
                        <option value="planning">วางแผน</option>
                        <option value="in_progress">กำลังทำ</option>
                        <option value="on_hold">พักไว้</option>
                        <option value="completed">เสร็จแล้ว</option>
                        <option value="cancelled">ยกเลิก</option>
                    </select>
                    <p className="text-xs leading-relaxed text-gray-500">เปลี่ยนเป็น “เสร็จแล้ว” ระบบบันทึกวันที่เสร็จไว้คำนวณ KPI ส่งงานตรงเวลา</p>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">รูปแบบโปรเจกต์</label>
                    <select
                        value={form.project_type}
                        onChange={(e) => setField("project_type", e.target.value)}
                        className={inputClass(false)}
                    >
                        <option value="waterfall">Waterfall · มอบหมายงานโดยผู้มีสิทธิ์เท่านั้น</option>
                        <option value="agile">Agile · สมาชิกกดรับ task/subtask ที่ยังไม่มีคนรับผิดชอบได้เอง</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">วันเริ่ม</label>
                    <Input type="date" name="project_start_date" value={form.project_start_date} onChange={handleChange} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">วันครบกำหนด</label>
                    <Input type="date" name="project_due_date" value={form.project_due_date} onChange={handleChange} />
                    <p className="text-xs leading-relaxed text-gray-500">ใช้คำนวณงานที่ใกล้/เลยกำหนดบนแดชบอร์ด และ KPI ส่งงานตรงเวลา</p>
                </div>

                {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

                <div className="col-span-full flex justify-end gap-3">
                    <button type="button" onClick={() => router.push("/projects")}
                        className={buttonClass("secondary", "md")}>
                        ยกเลิก
                    </button>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? "กำลังบันทึก..." : "บันทึก"}
                    </Button>
                </div>
            </Form>
        </div>
    );
}
