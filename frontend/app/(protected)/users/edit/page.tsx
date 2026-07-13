"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import AvatarCrop from "@/components/ui/AvatarCrop";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";

type FormState = {
    user_fname: string;
    user_lname: string;
    user_email: string;
    user_phone: string;
    user_line_id: string;
    user_whatApp_no: string;
    user_role_id: string;
    user_status: "active" | "inactive";
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FormErrors {
    const errors: FormErrors = {};

    if (!form.user_fname.trim()) errors.user_fname = "กรุณากรอกชื่อ";
    else if (form.user_fname.trim().length < 2) errors.user_fname = "ชื่อต้องมีอย่างน้อย 2 ตัวอักษร";

    if (!form.user_lname.trim()) errors.user_lname = "กรุณากรอกนามสกุล";
    else if (form.user_lname.trim().length < 2) errors.user_lname = "นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร";

    if (!form.user_email.trim())
        errors.user_email = "กรุณากรอกอีเมล";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.user_email))
        errors.user_email = "รูปแบบอีเมลไม่ถูกต้อง";

    if (form.user_phone && !/^[0-9]{9,10}$/.test(form.user_phone.replace(/-/g, "")))
        errors.user_phone = "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก";

    return errors;
}

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function loadRolesOptions(search: string) {
    const res = await window.fetch(`${api}/roles?${new URLSearchParams({ limit: "20", offset: "0", search })}`, {
        headers: authHeader(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []).map((r: { role_id: number; role_name: string }) => ({
        value: r.role_id,
        label: r.role_name,
    }));
}

async function fetchUser(id: string) {
    const res = await window.fetch(`${api}/users/${id}`, { headers: authHeader() });
    if (!res.ok) return null;
    return res.json();
}

async function submitUpdateUser(id: string, body: FormState) {
    const res = await window.fetch(`${api}/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
    return data;
}

async function uploadAvatar(userId: string, file: File) {
    const fd = new FormData();
    fd.append("image", file);
    await window.fetch(`${api}/users/${userId}/image`, {
        method: "PUT",
        headers: authHeader(),
        body: fd,
    });
}

async function resetPassword(id: string): Promise<{ temp_password: string }> {
    const res = await window.fetch(`${api}/users/${id}/reset-password`, {
        method: "PUT",
        headers: authHeader(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
    return data;
}

const SERVER_BASE = new URL(api).origin;

const EMPTY_FORM: FormState = {
    user_fname: "", user_lname: "", user_email: "", user_phone: "",
    user_line_id: "", user_whatApp_no: "", user_role_id: "", user_status: "active",
};

export default function EditUserPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [isPending, startTransition] = useTransition();

    const id = searchParams.get("id") ?? "";

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [currentAvatar, setCurrentAvatar] = useState<string | undefined>(undefined);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [notFound, setNotFound] = useState(false);

    const [confirmResetOpen, setConfirmResetOpen] = useState(false);
    const [resetPending, setResetPending] = useState(false);
    const [tempPassword, setTempPassword] = useState<string | null>(null);

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchUser(id);
            if (!data) { setNotFound(true); return; }
            setForm({
                user_fname: data.user_fname ?? "",
                user_lname: data.user_lname ?? "",
                user_email: data.user_email ?? "",
                user_phone: data.user_phone ?? "",
                user_line_id: data.user_line_uid ?? "",
                user_whatApp_no: data.user_whatsapp_no ?? "",
                user_role_id: String(data.user_role_id ?? ""),
                user_status: data.user_status === "inactive" ? "inactive" : "active",
            });
            if (data.user_avatar_url) setCurrentAvatar(`${SERVER_BASE}${data.user_avatar_url}`);
        });
    }, [id]);

    function setField(name: keyof FormState, value: string) {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setField(e.target.name as keyof FormState, e.target.value);
    }

    function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
        setForm((prev) => ({ ...prev, user_status: e.target.value === "inactive" ? "inactive" : "active" }));
    }

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitError(null);
        const fieldErrors = validate(form);
        if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }

        startTransition(async () => {
            try {
                await submitUpdateUser(id, form);
                if (avatarFile) await uploadAvatar(id, avatarFile);
                toast.success("แก้ไขผู้ใช้งานสำเร็จ");
                router.push("/users");
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
            }
        });
    }

    async function handleResetPassword() {
        setResetPending(true);
        try {
            const { temp_password } = await resetPassword(id);
            setConfirmResetOpen(false);
            setTempPassword(temp_password);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
        } finally {
            setResetPending(false);
        }
    }

    async function copyTempPassword() {
        if (tempPassword) {
            const text = `อีเมล: ${form.user_email}\nรหัสผ่านชั่วคราว: ${tempPassword}`;
            await navigator.clipboard.writeText(text).catch(() => {});
        }
        toast.success("คัดลอกอีเมลและรหัสผ่านชั่วคราวแล้ว");
        setTempPassword(null);
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบผู้ใช้งาน</p>;

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800">แก้ไขผู้ใช้งาน</h1>
                <button
                    type="button"
                    onClick={() => setConfirmResetOpen(true)}
                    className="px-4 py-2 text-sm text-amber-600 border border-amber-200 rounded hover:bg-amber-50"
                >
                    เปลี่ยนรหัสผ่าน
                </button>
            </div>

            <Form cols={2} onSubmit={handleSubmit} className="bg-white shadow-sm border-gray-100 rounded-xl">

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">รูปโปรไฟล์</label>
                    {/* key เปลี่ยนตาม currentAvatar เพื่อ remount ใหม่เมื่อ fetch เสร็จ — AvatarCrop เก็บ preview เป็น internal state ที่ตั้งค่าแค่ตอน mount */}
                    <AvatarCrop key={currentAvatar ?? "loading"} value={currentAvatar} onChange={setAvatarFile} disabled={isPending} />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">ชื่อ</label>
                    <Input name="user_fname" value={form.user_fname} onChange={handleChange}
                        placeholder="ชื่อ" error={!!errors.user_fname} />
                    {errors.user_fname && <p className="text-xs text-red-500">{errors.user_fname}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">นามสกุล</label>
                    <Input name="user_lname" value={form.user_lname} onChange={handleChange}
                        placeholder="นามสกุล" error={!!errors.user_lname} />
                    {errors.user_lname && <p className="text-xs text-red-500">{errors.user_lname}</p>}
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">อีเมล</label>
                    <Input type="email" name="user_email" value={form.user_email} onChange={handleChange}
                        placeholder="อีเมล" error={!!errors.user_email} />
                    {errors.user_email && <p className="text-xs text-red-500">{errors.user_email}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                    <Input name="user_phone" value={form.user_phone} onChange={handleChange}
                        placeholder="0812345678" error={!!errors.user_phone} />
                    {errors.user_phone && <p className="text-xs text-red-500">{errors.user_phone}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Line ID</label>
                    <Input name="user_line_id" value={form.user_line_id} onChange={handleChange}
                        placeholder="Line ID" />
                </div>

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">WhatsApp No.</label>
                    <Input name="user_whatApp_no" value={form.user_whatApp_no} onChange={handleChange}
                        placeholder="WhatsApp No." />
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สิทธิ์</label>
                    <SearchableSelect
                        loadOptions={loadRolesOptions}
                        value={form.user_role_id}
                        onChange={(v) => setField("user_role_id", v)}
                        placeholder="— เลือกสิทธิ์ —"
                        disabled={isPending}
                        error={!!errors.user_role_id}
                    />
                    {errors.user_role_id && <p className="text-xs text-red-500">{errors.user_role_id}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สถานะการใช้งาน</label>
                    <select
                        value={form.user_status}
                        onChange={handleStatusChange}
                        className="px-4 py-2 border rounded focus:outline-none focus:ring-2 border-gray-300 focus:border-blue-400 focus:ring-blue-500/20"
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ยกเลิกใช้งาน</option>
                    </select>
                </div>

                {submitError && <p className="col-span-2 text-sm text-red-600">{submitError}</p>}

                <div className="col-span-2 flex justify-end gap-3">
                    <button type="button" onClick={() => router.push("/users")}
                        className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50">
                        ยกเลิก
                    </button>
                    <Button type="submit" disabled={isPending}>
                        {isPending ? "กำลังบันทึก..." : "บันทึก"}
                    </Button>
                </div>
            </Form>

            <ConfirmDialog
                open={confirmResetOpen}
                variant="warning"
                title="เปลี่ยนรหัสผ่านผู้ใช้นี้?"
                description="ระบบจะ gen รหัสผ่านชั่วคราวใหม่ให้ และบังคับให้ผู้ใช้ตั้งรหัสผ่านใหม่ตอน login ครั้งถัดไป รหัสผ่านเดิมจะใช้ไม่ได้ทันที"
                confirmLabel="เปลี่ยนรหัสผ่าน"
                loading={resetPending}
                onConfirm={handleResetPassword}
                onCancel={() => setConfirmResetOpen(false)}
            />

            <ConfirmDialog
                open={!!tempPassword}
                variant="info"
                title="เปลี่ยนรหัสผ่านสำเร็จ"
                description={`อีเมล: ${form.user_email}  /  รหัสผ่านชั่วคราว: ${tempPassword} — กรุณาคัดลอกไปให้ผู้ใช้ก่อนปิดหน้าต่างนี้`}
                confirmLabel="คัดลอกอีเมล + รหัสผ่าน"
                cancelLabel="ปิด"
                onConfirm={copyTempPassword}
                onCancel={() => setTempPassword(null)}
            />
        </div>
    );
}
