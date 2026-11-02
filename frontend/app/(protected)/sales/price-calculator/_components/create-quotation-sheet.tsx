"use client";

// ออกใบเสนอราคาจากตะกร้า (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md ข้อ 2.3)
// ลูกค้าเดิม (ค้นหา) หรือพิมพ์ชื่อลูกค้าใหม่ (Q2 ก · สร้างเป็นบุคคล เติมข้อมูลภาษีทีหลัง) · ชื่อเรื่องเติมจากตะกร้า
// บันทึกแล้วไปหน้าร่างใบ (Q3 ก) · กดซ้ำไม่ได้ระหว่างบันทึก
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FormField, { inputClass } from "@/components/ui/form-field";
import SearchableSelect, { type SelectOption } from "@/components/ui/SearchableSelect";
import { apiFetch } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { quotationFromCartSchema } from "@/lib/shared/schemas/price-calculator.mjs";
import { SheetButtons, SheetFrame } from "../../../fastwork/_components/sheet-frame";

async function loadClientOptions(search: string): Promise<SelectOption[]> {
    const query = new URLSearchParams({ status: "active", limit: "20", offset: "0", search });
    const { data } = await apiFetch<{
        data: { client_id: string; client_name: string; client_company: string | null }[];
    }>(`/clients?${query}`);
    return (data?.data ?? []).map((client) => ({
        value: client.client_id,
        label: client.client_company ? `${client.client_name} (${client.client_company})` : client.client_name,
    }));
}

export default function CreateQuotationSheet({
    title,
    lines,
    startingPrices,
    onClose,
}: {
    title: string;
    lines: { kind: "product" | "package"; id: string; quantity: number }[];
    startingPrices: Record<string, string>;
    onClose: () => void;
}) {
    const router = useRouter();
    const [clientId, setClientId] = useState("");
    const [clientName, setClientName] = useState("");
    const [projectId, setProjectId] = useState("");
    const [projects, setProjects] = useState<{ project_id: string; project_name: string }[]>([]);
    const [quotationTitle, setQuotationTitle] = useState(title.slice(0, 200));
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // โปรเจกต์ที่ยังไม่ปิดของลูกค้าเดิม (เลือกผูกได้ · ไม่บังคับ)
    useEffect(() => {
        let isClosed = false;
        if (!clientId) return;
        apiFetch<{ data: { project_id: string; project_name: string }[] }>(
            `/price-calculator/client-projects?client_id=${encodeURIComponent(clientId)}`,
        ).then(({ data }) => {
            if (!isClosed) setProjects(data?.data ?? []);
        });
        return () => {
            isClosed = true;
        };
    }, [clientId]);

    async function submit(event: React.FormEvent) {
        event.preventDefault();
        setBanner(null);
        const checked = quotationFromCartSchema.safeParse({
            client_id: clientId || null,
            client_name: clientId ? null : clientName,
            project_id: clientId && projectId ? projectId : null,
            qt_title: quotationTitle,
            lines,
            starting_prices: startingPrices,
        });
        if (!checked.success) {
            setErrors(toFieldErrors(checked.error.issues));
            return;
        }
        setErrors({});
        setIsSaving(true);
        const { data, error } = await apiFetch<{ qt_id: string }>("/quotations/from-cart", {
            method: "POST",
            body: checked.data,
        });
        if (error) {
            setIsSaving(false);
            setErrors(error.fields);
            setBanner(error.message);
            return;
        }
        toast.success("สร้างร่างใบเสนอราคาแล้ว ตรวจรายการ งวด และเงื่อนไข แล้วส่งอนุมัติ");
        // ไปหน้าร่าง (replace: กดย้อนกลับไม่กลับมาสร้างซ้ำ)
        router.replace(`/sales/quotations/edit?id=${data.qt_id}`);
    }

    return (
        <SheetFrame
            titleId="create-quotation-title"
            title="ออกใบเสนอราคาจากตะกร้า"
            subtitle="สร้างเป็นร่าง ตรวจก่อนส่งอนุมัติ"
            onClose={onClose}
            onSubmit={submit}
        >
            {banner && (
                <StatusBanner tone="error" title="สร้างใบไม่สำเร็จ">
                    {banner}
                </StatusBanner>
            )}
            <FormField
                label="ลูกค้าเดิม"
                htmlFor="cart_client"
                error={errors.client_id}
                hint="ค้นหาชื่อ บริษัท หรือเบอร์ · ไม่เจอให้พิมพ์ชื่อลูกค้าใหม่ช่องถัดไป"
            >
                <SearchableSelect
                    loadOptions={loadClientOptions}
                    value={clientId}
                    onChange={(value) => {
                        setClientId(value);
                        setProjectId("");
                        setProjects([]);
                    }}
                    placeholder="เลือกลูกค้าเดิม"
                />
            </FormField>
            {!clientId && (
                <FormField
                    label="หรือชื่อลูกค้าใหม่"
                    htmlFor="cart_client_name"
                    error={errors.client_name}
                    hint="สร้างลูกค้าบุคคลให้ · เลขผู้เสียภาษีและที่อยู่เติมที่หน้าลูกค้าก่อนส่งใบ"
                >
                    <input
                        id="cart_client_name"
                        value={clientName}
                        maxLength={100}
                        onChange={(event) => setClientName(event.target.value)}
                        className={inputClass(Boolean(errors.client_name))}
                    />
                </FormField>
            )}
            {clientId && (
                <button
                    type="button"
                    className="justify-self-start text-sm text-blue-600 hover:underline"
                    onClick={() => setClientId("")}
                >
                    ไม่ใช้ลูกค้าเดิม (พิมพ์ชื่อลูกค้าใหม่)
                </button>
            )}
            {clientId && projects.length > 0 && (
                <FormField
                    label="ผูกโปรเจกต์เดิม"
                    htmlFor="cart_project"
                    error={errors.project_id}
                    hint="ไม่บังคับ · เลือกเมื่อเป็นงานเพิ่มในโปรเจกต์ที่กำลังทำ · ไม่เลือก = ตอนลูกค้าตอบรับค่อยเลือกเปิดโปรเจกต์ใหม่หรือผูกโปรเจกต์เดิม"
                >
                    <select
                        id="cart_project"
                        value={projectId}
                        onChange={(event) => setProjectId(event.target.value)}
                        className={inputClass(Boolean(errors.project_id))}
                    >
                        <option value="">ไม่ผูก</option>
                        {projects.map((project) => (
                            <option key={project.project_id} value={project.project_id}>
                                {project.project_name}
                            </option>
                        ))}
                    </select>
                </FormField>
            )}
            <FormField
                label="ชื่อเรื่อง"
                htmlFor="cart_title"
                required
                error={errors.qt_title}
                hint="เติมจากรายการในตะกร้า แก้ได้"
            >
                <input
                    id="cart_title"
                    value={quotationTitle}
                    maxLength={200}
                    onChange={(event) => setQuotationTitle(event.target.value)}
                    className={inputClass(Boolean(errors.qt_title))}
                />
            </FormField>
            <SheetButtons isSaving={isSaving} submitLabel="สร้างร่างใบเสนอราคา" onClose={onClose} />
        </SheetFrame>
    );
}
