"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/constans";
import Button from "@/components/ui/Button/Button";
import Input from "@/components/ui/Input/input";
import Form from "@/components/ui/form/Form";
import AvatarCrop from "@/components/ui/AvatarCrop";
import EmailOtpForm from "@/app/components/email-otp-form";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import MySignatureCard from "./_components/my-signature-card";
import StatusBanner from "@/components/ui/guidance/status-banner";

// อีเมลไม่อยู่ในฟอร์มนี้แล้ว — เปลี่ยนได้ทางเดียวคือยืนยันด้วย OTP (ส่วน "อีเมล" ด้านล่าง) backend ก็ไม่รับอีเมลจาก PUT /users/me แล้ว
type FormState = {
    user_fname: string;
    user_lname: string;
    user_phone: string;
    user_line_id: string;
    user_whatApp_no: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

// isLinked: ผูกกับพนักงาน → ชื่อ/เบอร์มาจากทะเบียนพนักงาน (backend ไม่รับค่าที่ส่งมา) ไม่ต้องตรวจ
function validate(form: FormState, isLinked: boolean): FormErrors {
    const errors: FormErrors = {};
    if (isLinked) return errors;

    if (!form.user_fname.trim()) errors.user_fname = "กรุณากรอกชื่อ";
    if (!form.user_lname.trim()) errors.user_lname = "กรุณากรอกนามสกุล";

    if (form.user_phone && !/^[0-9]{9,10}$/.test(form.user_phone.replace(/-/g, "")))
        errors.user_phone = "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก";

    return errors;
}

async function fetchMyProfile() {
    const res = await fetch(`${api}/users/me`, { headers: authHeader() });
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
    user_fname: "", user_lname: "",
    user_phone: "", user_line_id: "", user_whatApp_no: "",
};

const SERVER_BASE = new URL(api).origin;

export default function ProfilePage() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [currentAvatar, setCurrentAvatar] = useState<string | undefined>(undefined);
    const [roleName, setRoleName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [changingEmail, setChangingEmail] = useState(false);
    // พนักงานปัจจุบันที่ผูกบัญชีนี้ (2026-10-18) — ชื่อ เบอร์แก้โดยฝ่ายบุคคลที่ทะเบียนพนักงาน
    const [linkedEmployeeCode, setLinkedEmployeeCode] = useState<string | null>(null);
    const isLinked = linkedEmployeeCode !== null;
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [errors, setErrors] = useState<FormErrors>({});
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordPending, setPasswordPending] = useState(false);

    useEffect(() => {
        startTransition(async () => {
            const data = await fetchMyProfile();
            if (!data) return;
            setUsername(data.user_username ?? "");
            setEmail(data.user_email ?? "");
            setForm({
                user_fname: data.user_fname ?? "",
                user_lname: data.user_lname ?? "",
                user_phone: data.user_phone ?? "",
                user_line_id: data.user_line_uid ?? "",
                user_whatApp_no: data.user_whatsapp_no ?? "",
            });
            setRoleName(data.role_name ?? "");
            setLinkedEmployeeCode(data.linked_employee?.emp_code ?? null);
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
        const fieldErrors = validate(form, isLinked);
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
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="บัญชีของฉัน"
                title="โปรไฟล์ของฉัน"
                description="ชื่อและรูปที่คนอื่นเห็นในระบบ · เปลี่ยนอีเมลต้องยืนยันด้วยรหัส OTP ที่ส่งไปอีเมลใหม่"
            />
            <div>
                <Form cols={2} onSubmit={handleSubmit}>
                    <div className="flex flex-col gap-1 col-span-full">
                        <label className="text-sm font-medium text-gray-700">รูปโปรไฟล์</label>
                        {/* key เปลี่ยนตาม currentAvatar เพื่อ remount ใหม่เมื่อ fetch เสร็จ */}
                        <AvatarCrop key={currentAvatar ?? "loading"} value={currentAvatar} onChange={setAvatarFile} disabled={isPending} />
                    </div>

                    {linkedEmployeeCode && (
                        <div className="col-span-full">
                            <StatusBanner tone="info" title={`ชื่อและเบอร์โทรมาจากทะเบียนพนักงาน ${linkedEmployeeCode}`}>
                                ถ้าต้องการเปลี่ยนชื่อ นามสกุล หรือเบอร์โทร ติดต่อฝ่ายบุคคล · รูป LINE WhatsApp และอีเมลเปลี่ยนเองที่หน้านี้ได้
                            </StatusBanner>
                        </div>
                    )}

                    {roleName && (
                        <div className="flex flex-col gap-1 col-span-full">
                            <label className="text-sm font-medium text-gray-700">สิทธิ์</label>
                            <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm">{roleName}</p>
                        </div>
                    )}

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ชื่อ</label>
                        <Input name="user_fname" value={form.user_fname} onChange={handleChange} disabled={isLinked}
                            placeholder="ชื่อ" error={!!errors.user_fname} />
                        {errors.user_fname && <p className="text-xs text-red-600">{errors.user_fname}</p>}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">นามสกุล</label>
                        <Input name="user_lname" value={form.user_lname} onChange={handleChange} disabled={isLinked}
                            placeholder="นามสกุล" error={!!errors.user_lname} />
                        {errors.user_lname && <p className="text-xs text-red-600">{errors.user_lname}</p>}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">ชื่อผู้ใช้</label>
                        <p className="px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm break-all">{username || "-"}</p>
                        <p className="text-xs leading-relaxed text-gray-500">ใช้เข้าสู่ระบบแทนอีเมลได้ · เปลี่ยนเองไม่ได้ ให้ผู้ดูแลระบบเปลี่ยนให้</p>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">อีเมล</label>
                        <div className="flex items-center gap-2">
                            <p className="flex-1 min-w-0 px-3 py-2 bg-gray-50 rounded-lg text-gray-600 text-sm break-all">{email || "-"}</p>
                            {!changingEmail && (
                                <button type="button" onClick={() => setChangingEmail(true)}
                                    className="-my-2 shrink-0 px-2 py-3 text-sm text-blue-600 hover:text-blue-700">
                                    {email ? "เปลี่ยน" : "เพิ่ม"}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">เบอร์โทรศัพท์</label>
                        <Input name="user_phone" value={form.user_phone} onChange={handleChange} disabled={isLinked}
                            placeholder="0812345678" error={!!errors.user_phone} />
                        {errors.user_phone && <p className="text-xs text-red-600">{errors.user_phone}</p>}
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">Line ID</label>
                        <Input name="user_line_id" value={form.user_line_id} onChange={handleChange}
                            placeholder="Line ID" />
                    </div>

                    <div className="flex flex-col gap-1 col-span-full">
                        <label className="text-sm font-medium text-gray-700">WhatsApp No.</label>
                        <Input name="user_whatApp_no" value={form.user_whatApp_no} onChange={handleChange}
                            placeholder="WhatsApp No." />
                    </div>

                    {submitError && <p className="col-span-full text-sm text-red-600">{submitError}</p>}

                    <div className="col-span-full flex justify-end">
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    </div>
                </Form>
            </div>

            {/* อยู่นอก <Form> ด้านบนโดยตั้งใจ — EmailOtpForm เป็น <form> ของตัวเอง ซ้อน form ใน form ไม่ได้ */}
            {changingEmail && (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-base font-medium text-gray-900">{email ? "เปลี่ยนอีเมล" : "เพิ่มอีเมล"}</h2>
                        <button type="button" onClick={() => setChangingEmail(false)}
                            className="text-sm text-gray-500 hover:text-gray-700">ยกเลิก</button>
                    </div>
                    <EmailOtpForm onVerified={(verified) => { setEmail(verified); setChangingEmail(false); }} />
                </div>
            )}

            <MySignatureCard />

            <div>
                <h2 className="mb-3 text-base font-medium text-gray-900">เปลี่ยนรหัสผ่าน</h2>
                <form onSubmit={handlePasswordSubmit} className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-card sm:grid-cols-2 sm:p-6">
                    <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-gray-700">รหัสผ่านใหม่</label>
                        <Input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="อย่างน้อย 8 ตัวอักษร"
                            error={!!passwordError}
                        />
                        <p className="text-xs leading-relaxed text-gray-500">อย่างน้อย 8 ตัวอักษร · ใช้รหัสใหม่ตั้งแต่การเข้าสู่ระบบครั้งถัดไป</p>
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

                    {passwordError && <p className="sm:col-span-full text-sm text-red-600">{passwordError}</p>}

                    <div className="sm:col-span-full flex justify-end">
                        <Button type="submit" disabled={passwordPending}>
                            {passwordPending ? "กำลังบันทึก..." : "เปลี่ยนรหัสผ่าน"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
