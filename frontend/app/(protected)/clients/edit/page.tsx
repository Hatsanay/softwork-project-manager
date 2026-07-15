"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export default function EditClientPage() {
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
            const res = await fetch(`${api}/clients/${id}`, { headers: authHeader() });
            if (!res.ok) { setNotFound(true); return; }
            const data = await res.json();
            setForm({
                client_name: data.client_name ?? "",
                client_company: data.client_company ?? "",
                client_email: data.client_email ?? "",
                client_phone: data.client_phone ?? "",
            });
        });
    }, [id]);

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);

        if (!form.client_name.trim()) { setError("กรุณากรอกชื่อลูกค้า"); return; }

        startTransition(async () => {
            const res = await fetch(`${api}/clients/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", ...authHeader() },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                setError(data.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่");
                return;
            }

            router.push("/clients");
        });
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบลูกค้านี้</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">แก้ไขลูกค้า</h1>

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
