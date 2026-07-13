"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import AvatarCrop from "@/components/ui/AvatarCrop";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { toast } from "sonner";

type FormState = {
    user_fname:     string;
    user_lname:     string;
    user_email:     string;
    user_phone:     string;
    user_line_id:   string;
    user_whatApp_no: string;
    user_role_id:   string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function validate(form: FormState): FormErrors {
    const errors: FormErrors = {};

    if (!form.user_fname.trim())              errors.user_fname = "กรุณากรอกชื่อ";
    else if (form.user_fname.trim().length < 2) errors.user_fname = "ชื่อต้องมีอย่างน้อย 2 ตัวอักษร";

    if (!form.user_lname.trim())              errors.user_lname = "กรุณากรอกนามสกุล";
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

async function submitCreateUser(body: FormState): Promise<{ user_id: number; temp_password: string }> {
    const res = await window.fetch(`${api}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
    return data;
}

async function uploadAvatar(userId: number, file: File) {
    const fd = new FormData();
    fd.append("image", file);
    await window.fetch(`${api}/users/${userId}/image`, {
        method: "PUT",
        headers: authHeader(),
        body: fd,
    });
}

const EMPTY_FORM: FormState = {
    user_fname: "", user_lname: "", user_email: "",
    user_phone: "", user_line_id: "", user_whatApp_no: "", user_role_id: "",
};

export default function CreateUserPage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [form, setForm]             = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors]         = useState<FormErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);

    function setField(name: keyof FormState, value: string) {
        setForm((prev) => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
    }

    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
        setField(e.target.name as keyof FormState, e.target.value);
    }

    function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
        e.preventDefault();
        setSubmitError(null);
        const fieldErrors = validate(form);
        if (Object.keys(fieldErrors).length > 0) { setErrors(fieldErrors); return; }

        startTransition(async () => {
            try {
                const { user_id, temp_password } = await submitCreateUser(form);
                if (avatarFile) await uploadAvatar(user_id, avatarFile);
                setTempPassword(temp_password);
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
            }
        });
    }

    async function copyTempPasswordAndClose() {
        if (tempPassword) {
            const text = `อีเมล: ${form.user_email}\nรหัสผ่านชั่วคราว: ${tempPassword}`;
            await navigator.clipboard.writeText(text).catch(() => {});
        }
        toast.success("คัดลอกอีเมลและรหัสผ่านชั่วคราวแล้ว");
        router.push("/users");
    }

    function closeTempPasswordDialog() {
        router.push("/users");
    }

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">สร้างผู้ใช้งาน</h1>

            <Form cols={2} onSubmit={handleSubmit} className="bg-white shadow-sm border-gray-100 rounded-xl">

                <div className="flex flex-col gap-1 col-span-2">
                    <label className="text-sm font-medium text-gray-700">รูปโปรไฟล์</label>
                    <AvatarCrop onChange={setAvatarFile} disabled={isPending} />
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
                open={!!tempPassword}
                variant="info"
                title="สร้างผู้ใช้งานสำเร็จ"
                description={`อีเมล: ${form.user_email}  /  รหัสผ่านชั่วคราว: ${tempPassword} — ระบบจะบังคับให้ผู้ใช้ตั้งรหัสผ่านใหม่ตอน login ครั้งแรก กรุณาคัดลอกไปให้ผู้ใช้ก่อนปิดหน้าต่างนี้`}
                confirmLabel="คัดลอกอีเมล + รหัสผ่าน"
                cancelLabel="ปิด"
                onConfirm={copyTempPasswordAndClose}
                onCancel={closeTempPasswordDialog}
            />
        </div>
    );
}
