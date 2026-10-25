"use client";

// ผูกลูกค้ากับคำขอ (2026-10-25 · S-3) — ระบบเสนอลูกค้าเดิมที่ตรง (เบอร์ อีเมล เลขผู้เสียภาษี ชื่อ) ให้กดเลือก
// ไม่ตรงใคร = สร้างลูกค้าใหม่จากข้อมูลที่ลูกค้ากรอก (เติมให้ แก้ได้ · ใช้สิทธิ์สร้างลูกค้าเดิม) แล้วผูกทันที
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { clientSchema } from "@/lib/shared/schemas/client.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";
import type { ClientMatch, ServiceRequestRow } from "../../order-links/_types";

async function loadClientOptions(search: string): Promise<SelectOption[]> {
    const query = new URLSearchParams({ limit: "20", offset: "0", search, status: "active" });
    const { data } = await apiFetch<{ data: { client_id: string; client_name: string }[] }>(`/clients?${query}`);
    return (data?.data ?? []).map((client) => ({ value: client.client_id, label: client.client_name }));
}

export default function ClientPanel({
    request,
    matches,
    onBind,
}: {
    request: ServiceRequestRow;
    matches: ClientMatch[];
    onBind: (clientId: string) => Promise<boolean>;
}) {
    const hasBit = usePermission();
    const canCreateClient = hasBit(BITS.createClient);
    const [otherClientId, setOtherClientId] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    return (
        <div className="grid gap-3">
            {matches.length > 0 ? (
                <div className="grid gap-2">
                    <span className="text-sm text-gray-800">ลูกค้าเดิมที่น่าจะเป็นคนเดียวกัน</span>
                    <ul className="grid gap-2">
                        {matches.map((client) => (
                            <li key={client.client_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 p-3">
                                <span className="grid min-w-0 gap-0.5">
                                    <span className="text-sm font-medium wrap-break-word text-gray-900">{client.client_name}</span>
                                    <span className="text-xs text-gray-500">{[client.client_company, client.client_phone, client.client_email].filter(Boolean).join(" · ")}</span>
                                </span>
                                <button type="button" className={buttonClass("primary", "sm")} onClick={() => onBind(client.client_id)}>
                                    ใช้ลูกค้านี้
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
                <FieldHint>ไม่พบลูกค้าเดิมที่เบอร์ อีเมล หรือชื่อตรงกัน</FieldHint>
            )}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <FormField label="หรือเลือกลูกค้าอื่น" htmlFor="other_client">
                    <SearchableSelect loadOptions={loadClientOptions} value={otherClientId} onChange={setOtherClientId} placeholder="ค้นหาลูกค้า" />
                </FormField>
                <button type="button" className={buttonClass("secondary", "md")} disabled={!otherClientId} onClick={() => onBind(otherClientId)}>
                    ผูกลูกค้านี้
                </button>
            </div>
            {canCreateClient ? (
                <button type="button" className={`${buttonClass("secondary", "md")} justify-self-start`} onClick={() => setIsCreating(true)}>
                    <UserPlus size={16} />
                    สร้างลูกค้าใหม่จากข้อมูลในคำขอ
                </button>
            ) : (
                <FieldHint>สร้างลูกค้าใหม่ต้องมีสิทธิ์สร้างลูกค้า</FieldHint>
            )}
            {isCreating && <NewClientSheet request={request} onClose={() => setIsCreating(false)} onCreated={onBind} />}
        </div>
    );
}

function NewClientSheet({ request, onClose, onCreated }: { request: ServiceRequestRow; onClose: () => void; onCreated: (clientId: string) => Promise<boolean> }) {
    const isCompany = Boolean(request.svr_company_name);
    const [form, setForm] = useState({
        client_name: request.svr_company_name || request.svr_contact_name || "",
        client_contact_name: request.svr_contact_name ?? "",
        client_phone: request.svr_contact_phone ?? "",
        client_email: request.svr_contact_email ?? "",
        client_type: (isCompany && request.svr_tax_id ? "juristic" : "individual") as "juristic" | "individual",
        client_tax_id: request.svr_tax_id ?? "",
        client_address: request.svr_address ?? "",
    });
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function update<Field extends keyof typeof form>(field: Field, value: (typeof form)[Field]) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBanner(null);
        const checked = clientSchema.safeParse(form);
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ client_id: string }>("/clients", { method: "POST", body: checked.data });
        if (error) {
            setIsSaving(false);
            setErrors(error.fields);
            if (Object.keys(error.fields).length === 0) setBanner(error.message);
            return;
        }
        toast.success("สร้างลูกค้าแล้ว");
        const isBound = await onCreated(data.client_id);
        setIsSaving(false);
        if (isBound) onClose();
    }

    return (
        <SheetFrame titleId="new-client-title" title="สร้างลูกค้าใหม่" subtitle="เติมจากข้อมูลที่ลูกค้ากรอกในลิงก์ แก้ได้ก่อนบันทึก" onClose={onClose} onSubmit={submit}>
            {banner && (
                <StatusBanner tone="error" title="บันทึกไม่สำเร็จ">
                    {banner}
                </StatusBanner>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="ชื่อลูกค้า" htmlFor="new_client_name" required error={errors.client_name} className="sm:col-span-2">
                    <input id="new_client_name" value={form.client_name} maxLength={100} onChange={(event) => update("client_name", event.target.value)} className={inputClass(Boolean(errors.client_name))} />
                </FormField>
                <FormField label="ประเภท" htmlFor="new_client_type" error={errors.client_type}>
                    <select id="new_client_type" value={form.client_type} onChange={(event) => update("client_type", event.target.value as "juristic" | "individual")} className={inputClass(false)}>
                        <option value="individual">บุคคล</option>
                        <option value="juristic">นิติบุคคล</option>
                    </select>
                </FormField>
                <FormField label="ชื่อผู้ติดต่อ" htmlFor="new_client_contact" error={errors.client_contact_name}>
                    <input id="new_client_contact" value={form.client_contact_name} maxLength={100} onChange={(event) => update("client_contact_name", event.target.value)} className={inputClass(false)} />
                </FormField>
                <FormField label="เบอร์โทร" htmlFor="new_client_phone" error={errors.client_phone}>
                    <input id="new_client_phone" value={form.client_phone} maxLength={20} onChange={(event) => update("client_phone", event.target.value)} className={inputClass(Boolean(errors.client_phone))} />
                </FormField>
                <FormField label="อีเมล" htmlFor="new_client_email" error={errors.client_email}>
                    <input id="new_client_email" value={form.client_email} onChange={(event) => update("client_email", event.target.value)} className={inputClass(Boolean(errors.client_email))} />
                </FormField>
                <FormField label="เลขประจำตัวผู้เสียภาษี" htmlFor="new_client_tax" hint="ไม่บังคับ" error={errors.client_tax_id}>
                    <input id="new_client_tax" value={form.client_tax_id} maxLength={30} onChange={(event) => update("client_tax_id", event.target.value)} className={inputClass(Boolean(errors.client_tax_id))} />
                </FormField>
                <FormField label="ที่อยู่สำหรับออกเอกสาร" htmlFor="new_client_address" hint="ไม่บังคับ" error={errors.client_address} className="sm:col-span-2">
                    <textarea id="new_client_address" rows={2} value={form.client_address} onChange={(event) => update("client_address", event.target.value)} className={inputClass(false)} />
                </FormField>
            </div>
            <SheetButtons isSaving={isSaving} submitLabel="สร้างและผูกกับคำขอ" onClose={onClose} />
        </SheetFrame>
    );
}
