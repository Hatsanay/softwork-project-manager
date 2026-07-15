"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import { toDateInputValue } from "@/app/function";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import SearchableSelect from "@/components/ui/SearchableSelect";

type FormState = {
    project_name: string;
    client_id: string;
    project_description: string;
    project_status: string;
    project_start_date: string;
    project_due_date: string;
};

const EMPTY_FORM: FormState = {
    project_name: "", client_id: "", project_description: "",
    project_status: "planning", project_start_date: "", project_due_date: "",
};

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function loadClientOptions(search: string) {
    const res = await fetch(`${api}/clients?${new URLSearchParams({ limit: "20", offset: "0", search })}`, {
        headers: authHeader(),
    });
    if (!res.ok) return [];
    const { data } = await res.json() as { data: { client_id: string; client_name: string }[] };
    return data.map((c) => ({ value: c.client_id, label: c.client_name }));
}

export default function EditProjectPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const id = searchParams.get("id");
    const [isPending, startTransition] = useTransition();

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const res = await fetch(`${api}/projects/${id}`, { headers: authHeader() });
            if (!res.ok) { setNotFound(true); return; }
            const data = await res.json();
            setForm({
                project_name: data.project_name ?? "",
                client_id: data.client_id ?? "",
                project_description: data.project_description ?? "",
                project_status: data.project_status ?? "planning",
                project_start_date: toDateInputValue(data.project_start_date),
                project_due_date: toDateInputValue(data.project_due_date),
            });
        });
    }, [id]);

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
            const res = await fetch(`${api}/projects/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push(`/projects/view?id=${id}`);
        });
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบโปรเจกต์นี้</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">แก้ไขโปรเจกต์</h1>

            <Form cols={2} onSubmit={handleSubmit} className="bg-white shadow-sm border-gray-100 rounded-xl">
                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">ชื่อโปรเจกต์</label>
                    <Input name="project_name" value={form.project_name} onChange={handleChange} required />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700 mb-1">ลูกค้า</label>
                    <SearchableSelect
                        loadOptions={loadClientOptions}
                        value={form.client_id}
                        onChange={(v) => setField("client_id", v)}
                        placeholder="— เลือกลูกค้า (ไม่บังคับ) —"
                        disabled={isPending}
                    />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">คำอธิบาย</label>
                    <textarea
                        name="project_description"
                        value={form.project_description}
                        onChange={handleChange}
                        rows={3}
                        className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                    />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สถานะ</label>
                    <select
                        value={form.project_status}
                        onChange={(e) => setField("project_status", e.target.value)}
                        className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                    >
                        <option value="planning">วางแผน</option>
                        <option value="in_progress">กำลังทำ</option>
                        <option value="on_hold">พักไว้</option>
                        <option value="completed">เสร็จแล้ว</option>
                        <option value="cancelled">ยกเลิก</option>
                    </select>
                </div>

                <div />

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">วันเริ่ม</label>
                    <Input type="date" name="project_start_date" value={form.project_start_date} onChange={handleChange} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">วันครบกำหนด</label>
                    <Input type="date" name="project_due_date" value={form.project_due_date} onChange={handleChange} />
                </div>

                {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

                <div className="col-span-2 flex justify-end gap-3">
                    <button type="button" onClick={() => router.push(`/projects/view?id=${id}`)}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
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
