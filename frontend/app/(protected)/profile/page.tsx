"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import AvatarCrop from "@/components/ui/AvatarCrop";
import { toast } from "sonner";

type FormState = {
    user_fname: string;
    user_lname: string;
    user_email: string;
    user_phone: string;
    user_line_id: string;
    user_whatApp_no: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function decodeToken(token: string): { user_id: string } {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload));
}

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

function validate(form: FormState): FormErrors {
    const errors: FormErrors = {};

    if (!form.user_fname.trim()) errors.user_fname = "กรุณากรอกชื่อ";
    if (!form.user_lname.trim()) errors.user_lname = "กรุณากรอกนามสกุล";

    if (!form.user_email.trim())
        errors.user_email = "กรุณากรอกอีเมล";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.user_email))
        errors.user_email = "รูปแบบอีเมลไม่ถูกต้อง";

    if (form.user_phone && !/^[0-9]{9,10}$/.test(form.user_phone.replace(/-/g, "")))
        errors.user_phone = "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก";

    return errors;
}

async function fetchMyProfile(userId: string) {
    const res = await fetch(`${api}/users/me?user_id=${userId}`, { headers: authHeader() });
    if (!res.ok) return null;
    return res.json();
}

async function submitUpdateProfile(body: FormState) {
    const res = await fetch(`${api}/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
    return data;
}

async function uploadMyAvatar(file: File) {
    const fd = new FormData();
    fd.append("image", file);
    const res = await fetch(`${api}/users/me/image`, {
        method: "PUT",
        headers: authHeader(),
        body: fd,
    });
    if (!res.ok) throw new Error("อัปโหลดรูปไม่สำเร็จ");
}

async function submitChangePassword(newPassword: string) {
    const res = await fetch(`${api}/users/me/password`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ new_password: newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message ?? "เกิดข้อผิดพลาด");
}

const EMPTY_FORM: FormState = {
    user_fname: "", user_lname: "", user_email: "",
    user_phone: "", user_line_id: "", user_whatApp_no: "",
};

const SERVER_BASE = new URL(api).origin;

export default function ProfilePage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [currentAvatar, setCurrentAvatar] = useState<string | undefined>(undefined);
    const [roleName, setRoleName] = useState("");
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordPending, setPasswordPending] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) return;
        const { user_id } = decodeToken(token);

        startTransition(async () => {
            const data = await fetchMyProfile(user_id);
            if (!data) return;
            setForm({
                user_fname: data.user_fname ?? "",
                user_lname: data.user_lname ?? "",
                user_email: data.user_email ?? "",
                user_phone: data.user_phone ?? "",
                user_line_id: data.user_line_uid ?? "",
                user_whatApp_no: data.user_whatsapp_no ?? "",
            });
            setRoleName(data.role_name ?? "");
            if (data.user_avatar_url) setCurrentAvatar(`${SERVER_BASE}${data.user_avatar_url}`);
        });
    }, []);

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
                await submitUpdateProfile(form);
                if (avatarFile) await uploadMyAvatar(avatarFile);
                toast.success("แก้ไขโปรไฟล์สำเร็จ");
                router.refresh();
            } catch (err) {
                setSubmitError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
            }
        });
    }

    function handlePasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setPasswordError(null);

        if (newPassword.length < 8) { setPasswordError("รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"); return; }
        if (newPassword !== confirmPassword) { setPasswordError("รหัสผ่านไม่ตรงกัน"); return; }

        setPasswordPending(true);
        submitChangePassword(newPassword)
            .then(() => {
                toast.success("เปลี่ยนรหัสผ่านสำเร็จ");
                setNewPassword("");
                setConfirmPassword("");
            })
            .catch((err) => setPasswordError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด"))
            .finally(() => setPasswordPending(false));
    }

    return (
        <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-800 mb-6">โปรไฟล์ของฉัน</h1>

                <Form cols={2} onSubmit={handleSubmit} className="bg-white shadow-sm border-gray-100 rounded-xl">
                    <div className="flex flex-col gap-1 col-span-2">
                        <label className="text-sm font-medium text-gray-700">รูปโปรไฟล์</label>
                        {/* key เปลี่ยนตาม currentAvatar เพื่อ remount ใหม่เมื่อ fetch เสร็จ */}
                        <AvatarCrop key={currentAvatar ?? "loading"} value={currentAvatar} onChange={setAvatarFile} disabled={isPending} />
                    </div>

                    {roleName && (
                        <div className="flex flex-col gap-1 col-span-2">
                            <label className="text-sm font-medium text-gray-700">สิทธิ์</label>
                            <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">{roleName}</p>
                        </div>
                    )}

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

                    {submitError && <p className="col-span-2 text-sm text-red-600">{submitError}</p>}

                    <div className="col-span-2 flex justify-end">
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    </div>
                </Form>
            </div>

            <div>
                <h2 className="text-lg font-bold text-gray-800 mb-3">เปลี่ยนรหัสผ่าน</h2>
                <form onSubmit={handlePasswordSubmit} className="bg-white shadow-sm border border-gray-100 rounded-xl p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">รหัสผ่านใหม่</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            error={!!passwordError}
                        />
                    </div>
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ยืนยันรหัสผ่านใหม่</label>
                        <Input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="กรอกรหัสผ่านอีกครั้ง"
                            error={!!passwordError}
                        />
                    </div>

                    {passwordError && <p className="sm:col-span-2 text-sm text-red-600">{passwordError}</p>}

                    <div className="sm:col-span-2 flex justify-end">
                        <Button type="submit" disabled={passwordPending}>
                            {passwordPending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
