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
import PageHeader from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import BranchSelect from "../_components/branch-select";
import UserSignaturePanel from "../_components/user-signature-panel";
import { KeyRound } from "lucide-react";
import { inputClass } from "@/components/ui/form-field";
import Link from "next/link";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { formatDateOnly } from "@/app/function";
import { usePermission, BITS } from "@/app/components/permission-provider";

// พนักงานปัจจุบันที่ผูกบัญชีนี้ (2026-10-18) — ชื่อ เบอร์ สาขาแก้ที่ทะเบียนพนักงาน (docs/plans/2026-10-18-user-employee-link.md)
type LinkedEmployee = { emp_id: string; emp_code: string; full_name: string };

type FormState = {
    user_fname: string;
    user_lname: string;
    user_username: string;
    user_email: string;
    user_phone: string;
    user_line_id: string;
    user_whatApp_no: string;
    user_role_id: string;
    user_status: "active" | "inactive";
    user_branch_id: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

// ต้องตรงกับ USERNAME_PATTERN ใน backend/src/controllers/user.controller.js — ห้ามมี @ (ช่อง login รับทั้งอีเมลและชื่อผู้ใช้)
const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,50}$/;

// isLinked: ผูกพนักงาน → ชื่อ นามสกุล เบอร์มาจากทะเบียนพนักงาน (backend ไม่รับค่าที่ส่งมา) ไม่ต้องตรวจ
function validate(form: FormState, isLinked: boolean): FormErrors {
    const errors: FormErrors = {};

    if (!isLinked) {
        if (!form.user_fname.trim()) errors.user_fname = "กรุณากรอกชื่อ";
        else if (form.user_fname.trim().length < 2) errors.user_fname = "ชื่อต้องมีอย่างน้อย 2 ตัวอักษร";

        if (!form.user_lname.trim()) errors.user_lname = "กรุณากรอกนามสกุล";
        else if (form.user_lname.trim().length < 2) errors.user_lname = "นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร";

        if (form.user_phone && !/^[0-9]{9,10}$/.test(form.user_phone.replace(/-/g, "")))
            errors.user_phone = "เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก";
    }

    if (!form.user_username.trim())
        errors.user_username = "กรุณากรอกชื่อผู้ใช้";
    else if (!USERNAME_PATTERN.test(form.user_username.trim()))
        errors.user_username = "ยาว 3-50 ตัว ใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง, ขีดล่าง";

    // อีเมลไม่บังคับ — ล้างทิ้ง = ผู้ใช้จะถูกขอให้ยืนยันอีเมลใหม่ด้วย OTP ตอนเข้าระบบครั้งถัดไป
    if (form.user_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.user_email.trim()))
        errors.user_email = "รูปแบบอีเมลไม่ถูกต้อง";

    return errors;
}

function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

// แสดงเฉพาะ role ที่มอบได้ (สิทธิ์ไม่เกินคนที่ใช้งานอยู่ — risk-fixes R25)
// ยกเว้น role ปัจจุบันของผู้ใช้คนนี้ ต้องแสดงไว้เสมอ ไม่งั้นช่องจะว่างเปล่า
async function loadRolesOptions(search: string, currentRoleId: string) {
    const res = await window.fetch(`${api}/roles?${new URLSearchParams({ limit: "20", offset: "0", search })}`, {
        headers: authHeader(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    type RoleOption = { role_id: number; role_name: string; can_assign: boolean };
    return (data.data ?? [])
        .filter((r: RoleOption) => r.can_assign || String(r.role_id) === currentRoleId)
        .map((r: RoleOption) => ({ value: r.role_id, label: r.role_name }));
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
    user_fname: "", user_lname: "", user_username: "", user_email: "", user_phone: "",
    user_line_id: "", user_whatApp_no: "", user_role_id: "", user_status: "active", user_branch_id: "",
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

    // จัดการได้เฉพาะผู้ใช้ที่สิทธิ์ไม่เกินตัวเอง และเปลี่ยน role/สถานะของตัวเองไม่ได้ (risk-fixes R25) — backend ส่งธงมาให้
    const [canManage, setCanManage] = useState(true);
    const [isSelf, setIsSelf] = useState(false);
    const [currentRoleId, setCurrentRoleId] = useState<string | null>(null);
    const [savedBranchId, setSavedBranchId] = useState("");
    const [linkedEmployee, setLinkedEmployee] = useState<LinkedEmployee | null>(null);
    const [loginClosedAfter, setLoginClosedAfter] = useState<string | null>(null);
    const isLinked = linkedEmployee !== null;
    // ยังไม่ใช่พนักงาน: ฝ่ายบุคคลกด "เพิ่มเป็นพนักงาน" แล้วฟอร์มเติมชื่อ เบอร์ อีเมลจากบัญชีนี้ให้ (2026-10-19)
    const hasBit = usePermission();
    const isLoaded = currentRoleId !== null;
    const canAddAsEmployee = isLoaded && !isLinked && hasBit(BITS.manageEmployees);

    useEffect(() => {
        if (!id) return;
        startTransition(async () => {
            const data = await fetchUser(id);
            if (!data) { setNotFound(true); return; }
            setForm({
                user_fname: data.user_fname ?? "",
                user_lname: data.user_lname ?? "",
                user_username: data.user_username ?? "",
                user_email: data.user_email ?? "",
                user_phone: data.user_phone ?? "",
                user_line_id: data.user_line_uid ?? "",
                user_whatApp_no: data.user_whatsapp_no ?? "",
                user_role_id: String(data.user_role_id ?? ""),
                user_status: data.user_status === "inactive" ? "inactive" : "active",
                user_branch_id: data.user_branch_id ?? "",
            });
            setSavedBranchId(data.user_branch_id ?? "");
            if (data.user_avatar_url) setCurrentAvatar(`${SERVER_BASE}${data.user_avatar_url}`);
            setCanManage(data.can_manage !== false);
            setIsSelf(data.is_self === true);
            setCurrentRoleId(String(data.user_role_id ?? ""));
            setLinkedEmployee(data.linked_employee ?? null);
            setLoginClosedAfter(data.login_closed_after ?? null);
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
        const fieldErrors = validate(form, isLinked);
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

    // ชื่อผู้ใช้ใช้ login ได้เสมอ (อีเมลใช้ได้ด้วยถ้ามี)
    function credentialLines(temp: string) {
        return [
            `ชื่อผู้ใช้: ${form.user_username}`,
            form.user_email.trim() ? `อีเมล: ${form.user_email.trim()}` : null,
            `รหัสผ่านชั่วคราว: ${temp}`,
        ].filter((line): line is string => !!line);
    }

    async function copyTempPassword() {
        if (tempPassword) await navigator.clipboard.writeText(credentialLines(tempPassword).join("\n")).catch(() => {});
        toast.success("คัดลอกข้อมูลเข้าสู่ระบบแล้ว");
        setTempPassword(null);
    }

    if (!id || notFound) return <p className="p-6 text-gray-500">ไม่พบผู้ใช้งาน</p>;

    return (
        <div className="grid w-full gap-6">
            <PageHeader
                eyebrow="จัดการข้อมูลผู้ใช้งาน"
                title="แก้ไขผู้ใช้งาน"
                description="แก้ข้อมูล สิทธิ์ และสถานะของผู้ใช้ · เปลี่ยนสิทธิ์หรือสถานะของตัวเองไม่ได้ · ปิดใช้งานแล้วผู้ใช้เข้าระบบไม่ได้ทันที แต่ประวัติยังอยู่ครบ"
                actions={
                    canManage && (
                        <button type="button" onClick={() => setConfirmResetOpen(true)} className={buttonClass("secondary", "md")}>
                            <KeyRound size={16} className="text-gray-400" />
                            ตั้งรหัสผ่านชั่วคราวใหม่
                        </button>
                    )
                }
            />

            <Form cols={2} onSubmit={handleSubmit}>

                {!canManage && (
                    <div role="status" className="col-span-full rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-600">
                        <p className="font-medium">คุณจัดการผู้ใช้นี้ไม่ได้</p>
                        <p>
                            ผู้ใช้นี้มีสิทธิ์บางข้อที่คุณไม่มี จึงแก้ไขข้อมูลหรือเปลี่ยนรหัสผ่านไม่ได้
กันการเข้าถึงบัญชีที่มีสิทธิ์สูงกว่า ให้ผู้ที่มีสิทธิ์สูงกว่าเป็นคนจัดการ
                        </p>
                    </div>
                )}

                {loginClosedAfter && (
                    <div className="col-span-full">
                        <StatusBanner tone="warn" title="ปิดการเข้าระบบแล้วเพราะพ้นสภาพพนักงาน">
                            วันทำงานวันสุดท้าย {formatDateOnly(loginClosedAfter)} · เปิดให้เข้าระบบต่อได้ที่หน้าพนักงาน (ฝ่ายบุคคล) ·
                            สถานะใช้งานด้านล่างไม่ต้องเปลี่ยน
                        </StatusBanner>
                    </div>
                )}
                {linkedEmployee && (
                    <div className="col-span-full">
                        <StatusBanner tone="info" title={`ผูกกับพนักงาน ${linkedEmployee.emp_code} · ${linkedEmployee.full_name}`}>
                            ชื่อ นามสกุล เบอร์โทร และสาขามาจากทะเบียนพนักงาน แก้ที่{" "}
                            <Link href={`/people/employees/view?id=${linkedEmployee.emp_id}`} className="text-blue-600 underline">
                                หน้าพนักงาน
                            </Link>{" "}
                            (ฝ่ายบุคคล) · อีเมล รูป LINE และ WhatsApp ของบัญชีแก้ที่นี่ได้
                        </StatusBanner>
                    </div>
                )}

                {canAddAsEmployee && (
                    <div className="col-span-full">
                        <StatusBanner tone="info" title="บัญชีนี้ยังไม่ได้เป็นพนักงาน">
                            ถ้าเป็นพนักงานบริษัท เพิ่มเข้าทะเบียนได้เลย ระบบเติมชื่อ เบอร์ และอีเมลจากบัญชีนี้ให้ ·{" "}
                            <Link href={`/people/employees/new?user=${id}`} className="-my-2 inline-flex min-h-10 items-center font-medium text-blue-600 underline">
                                เพิ่มเป็นพนักงาน
                            </Link>
                        </StatusBanner>
                    </div>
                )}

                <div className="flex flex-col gap-1 col-span-full">
                    <label className="text-sm font-medium text-gray-700">รูปโปรไฟล์</label>
                    {/* key เปลี่ยนตาม currentAvatar เพื่อ remount ใหม่เมื่อ fetch เสร็จ — AvatarCrop เก็บ preview เป็น internal state ที่ตั้งค่าแค่ตอน mount */}
                    <AvatarCrop key={currentAvatar ?? "loading"} value={currentAvatar} onChange={setAvatarFile} disabled={isPending} />
                </div>

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
                    <Input name="user_username" value={form.user_username} onChange={handleChange}
                        placeholder="ชื่อผู้ใช้" autoComplete="off" error={!!errors.user_username} />
                    {errors.user_username && <p className="text-xs text-red-600">{errors.user_username}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">อีเมล <span className="text-gray-400 font-normal">(ไม่บังคับ)</span></label>
                    <Input type="email" name="user_email" value={form.user_email} onChange={handleChange}
                        placeholder="อีเมล" error={!!errors.user_email} />
                    {errors.user_email
                        ? <p className="text-xs text-red-600">{errors.user_email}</p>
                        : <p className="text-xs text-gray-400">เว้นว่าง = ผู้ใช้ต้องยืนยันอีเมลเองด้วย OTP ตอนเข้าระบบครั้งถัดไป</p>}
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

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สิทธิ์</label>
                    {/* key: โหลดรายการ role ใหม่หลังรู้ role ปัจจุบันแล้ว (SearchableSelect โหลดตัวเลือกครั้งเดียวตอน mount) */}
                    <SearchableSelect
                        key={currentRoleId ?? "loading"}
                        loadOptions={(search) => loadRolesOptions(search, currentRoleId ?? "")}
                        value={form.user_role_id}
                        onChange={(v) => setField("user_role_id", v)}
                        placeholder="เลือกสิทธิ์"
                        disabled={isPending || isSelf || !canManage}
                        error={!!errors.user_role_id}
                    />
                    {errors.user_role_id
                        ? <p className="text-xs text-red-600">{errors.user_role_id}</p>
                        : <p className="text-xs text-gray-400">
                            {isSelf
                                ? "เปลี่ยนสิทธิ์ของตัวเองไม่ได้ ให้ผู้ดูแลคนอื่นเป็นคนเปลี่ยน"
                                : "แสดงเฉพาะสิทธิ์ที่ไม่เกินสิทธิ์ของคุณ"}
                        </p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">สถานะการใช้งาน</label>
                    <select
                        value={form.user_status}
                        onChange={handleStatusChange}
                        disabled={isSelf || !canManage}
                        className={inputClass(false)}
                    >
                        <option value="active">ใช้งาน</option>
                        <option value="inactive">ยกเลิกใช้งาน</option>
                    </select>
                    {isSelf && <p className="text-xs text-gray-400">ปิดใช้งานบัญชีของตัวเองไม่ได้</p>}
                </div>

                <BranchSelect
                    value={form.user_branch_id}
                    onChange={(branchId) => setField("user_branch_id", branchId)}
                    savedBranchId={savedBranchId}
                    disabled={isPending || !canManage || isLinked}
                />

                {submitError && <p className="col-span-full text-sm text-red-600">{submitError}</p>}

                <div className="col-span-full flex justify-end gap-3">
                    <button type="button" onClick={() => router.push("/users")}
                        className={buttonClass("secondary", "md")}>
                        ยกเลิก
                    </button>
                    {canManage && (
                        <Button type="submit" disabled={isPending}>
                            {isPending ? "กำลังบันทึก..." : "บันทึก"}
                        </Button>
                    )}
                </div>
            </Form>

            {id && !notFound && <UserSignaturePanel userId={id} canManage={canManage} />}

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
                description={tempPassword ? `${credentialLines(tempPassword).join("  /  ")} · กรุณาคัดลอกไปให้ผู้ใช้ก่อนปิดหน้าต่างนี้` : ""}
                confirmLabel="คัดลอกข้อมูลเข้าสู่ระบบ"
                cancelLabel="ปิด"
                onConfirm={copyTempPassword}
                onCancel={() => setTempPassword(null)}
            />
        </div>
    );
}
