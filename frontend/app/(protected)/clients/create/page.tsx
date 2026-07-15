"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";

type FormState = {
    client_name: string;
    client_company: string;
    client_email: string;
    client_phone: string;
};

const EMPTY_FORM: FormState = { client_name: "", client_company: "", client_email: "", client_phone: "" };

export default function CreateClientPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [error, setError] = useState<string | null>(null);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!form.client_name.trim()) { setError("กรุณากรอกชื่อลูกค้า"); return; }

        const token = localStorage.getItem("token");
        if (!token) { setError("ไม่พบ token กรุณาเข้าสู่ระบบใหม่"); return; }

        startTransition(async () => {
            const res = await fetch(`${api}/clients`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(form),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/clients");
        });
    }

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">สร้างลูกค้า</h1>

            <Form cols={2} onSubmit={handleSubmit} className="bg-white shadow-sm border-gray-100 rounded-xl">
                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">ชื่อลูกค้า</label>
                    <Input name="client_name" value={form.client_name} onChange={handleChange} required />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">บริษัท</label>
                    <Input name="client_company" value={form.client_company} onChange={handleChange} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">อีเมล</label>
                    <Input type="email" name="client_email" value={form.client_email} onChange={handleChange} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                    <Input name="client_phone" value={form.client_phone} onChange={handleChange} />
                </div>

                {error && <p className="col-span-2 text-sm text-red-600">{error}</p>}

                <div className="col-span-2 flex justify-end gap-3">
                    <button type="button" onClick={() => router.push("/clients")}
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
