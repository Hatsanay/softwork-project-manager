"use client";

// แท็บสาขา — เพิ่ม/แก้/ปิดใช้งาน (ไม่มีลบ: สาขาอยู่บนเอกสารภาษีแล้ว)
import { Plus, Store } from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { branchCreateSchema, branchUpdateSchema } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import type { Branch } from "../_types";
import { useRecordEditor } from "@/lib/use-record-editor";
import { InfoPill, RecordList, RecordRow, StatusPill } from "@/components/ui/record-list";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";

const EMPTY_FORM = {
    branch_code: "",
    branch_name_th: "",
    branch_name_en: "",
    branch_address_th: "",
    branch_address_en: "",
    branch_phone: "",
    branch_status: "active" as "active" | "inactive",
};

type BranchForm = typeof EMPTY_FORM;

function toForm(branch: Branch): BranchForm {
    return {
        branch_code: branch.branch_code,
        branch_name_th: branch.branch_name_th,
        branch_name_en: branch.branch_name_en ?? "",
        branch_address_th: branch.branch_address_th ?? "",
        branch_address_en: branch.branch_address_en ?? "",
        branch_phone: branch.branch_phone ?? "",
        branch_status: branch.branch_status,
    };
}

type BranchesTabProps = {
    branches: Branch[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

export default function BranchesTab({ branches, canEdit, onSaved }: BranchesTabProps) {
    const messages = COMPANY_MESSAGES.branches;
    const editor = useRecordEditor<BranchForm>(EMPTY_FORM, onSaved);
    const { form, fieldErrors } = editor;
    const editingBranch = branches.find((branch) => branch.branch_id === editor.editingId) ?? null;
    const isEditingHeadOffice = editingBranch?.is_head_office ?? false;

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: branchCreateSchema,
            updateSchema: branchUpdateSchema,
            createPath: "/company/branches",
            updatePath: (branchId) => `/company/branches/${branchId}`,
            toPayload: (currentForm) => currentForm,
        });
    }

    function textInput(field: keyof Omit<BranchForm, "branch_status">, disabled = false) {
        return (
            <input
                id={field}
                value={form[field]}
                onChange={(event) => editor.updateField(field, event.target.value)}
                disabled={disabled}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <SectionCard
            icon={Store}
            title={COMPANY_MESSAGES.tabs.branches}
            description={messages.description}
            actions={
                canEdit &&
                !editor.isOpen && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={editor.openCreate}>
                        <Plus size={16} />
                        เพิ่มสาขา
                    </button>
                )
            }
        >
            {editor.isOpen && (
                <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg bg-gray-50 p-4" noValidate>
                    <p className="font-medium text-gray-800">
                        {editingBranch ? `แก้ไขสาขา ${editingBranch.branch_code}` : "เพิ่มสาขา"}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label="รหัสสาขา"
                            htmlFor="branch_code"
                            required
                            hint={messages.code}
                            error={fieldErrors.branch_code}
                        >
                            {textInput("branch_code", editingBranch !== null)}
                        </FormField>
                        <FormField
                            label="สถานะ"
                            htmlFor="branch_status"
                            hint={isEditingHeadOffice ? messages.headOffice : undefined}
                            error={fieldErrors.branch_status}
                        >
                            <select
                                id="branch_status"
                                value={form.branch_status}
                                onChange={(event) =>
                                    editor.updateField(
                                        "branch_status",
                                        event.target.value as BranchForm["branch_status"],
                                    )
                                }
                                disabled={isEditingHeadOffice}
                                className={inputClass(Boolean(fieldErrors.branch_status))}
                            >
                                <option value="active">ใช้งาน</option>
                                <option value="inactive">ปิดใช้งาน</option>
                            </select>
                        </FormField>
                        <FormField
                            label="ชื่อสาขา (ภาษาไทย)"
                            htmlFor="branch_name_th"
                            required
                            error={fieldErrors.branch_name_th}
                        >
                            {textInput("branch_name_th")}
                        </FormField>
                        <FormField
                            label="ชื่อสาขา (ภาษาอังกฤษ)"
                            htmlFor="branch_name_en"
                            error={fieldErrors.branch_name_en}
                        >
                            {textInput("branch_name_en")}
                        </FormField>
                        <FormField
                            label="ที่อยู่สาขา (ภาษาไทย)"
                            htmlFor="branch_address_th"
                            hint={messages.address}
                            error={fieldErrors.branch_address_th}
                        >
                            {textInput("branch_address_th")}
                        </FormField>
                        <FormField
                            label="ที่อยู่สาขา (ภาษาอังกฤษ)"
                            htmlFor="branch_address_en"
                            hint={messages.address}
                            error={fieldErrors.branch_address_en}
                        >
                            {textInput("branch_address_en")}
                        </FormField>
                        <FormField label="เบอร์โทรสาขา" htmlFor="branch_phone" error={fieldErrors.branch_phone}>
                            {textInput("branch_phone")}
                        </FormField>
                    </div>
                    {form.branch_status === "inactive" && (
                        <StatusBanner tone="warn" title="ปิดใช้งานสาขานี้">
                            {messages.inactiveNote(editingBranch?.user_count ?? 0)}
                        </StatusBanner>
                    )}
                    <SaveErrorBanner error={editor.saveError} />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={SECONDARY_BUTTON} onClick={editor.close}>
                            ยกเลิก
                        </button>
                        <button type="submit" className={PRIMARY_BUTTON} disabled={editor.isSaving}>
                            {editor.isSaving ? "กำลังบันทึก..." : "บันทึกสาขา"}
                        </button>
                    </div>
                </form>
            )}

            <RecordList>
                {branches.map((branch) => (
                    <RecordRow
                        key={branch.branch_id}
                        title={`${branch.branch_code} · ${branch.branch_name_th}`}
                        details={`ผู้ใช้ที่ใช้สาขานี้เป็นค่าเริ่มต้น ${branch.user_count} คน${branch.branch_address_th ? "" : " · ใช้ที่อยู่บริษัท"}`}
                        pills={
                            <>
                                {branch.is_head_office && <InfoPill>สำนักงานใหญ่</InfoPill>}
                                <StatusPill isActive={branch.branch_status === "active"} />
                            </>
                        }
                        canEdit={canEdit}
                        onEdit={() => editor.openEdit(branch.branch_id, toForm(branch))}
                    />
                ))}
            </RecordList>
        </SectionCard>
    );
}
