"use client";

// แท็บกติกาอนุมัติหลายชั้นตามยอดเงิน — แก้ทั้งชุดแล้วบันทึกทีเดียว (docs/plans/2026-10-08-sales-cycle.md หัวข้อ 3)
// แต่ละประเภทเอกสารมีกติกาของตัวเอง: QT ใบเสนอราคา · IV ใบแจ้งหนี้ที่สร้างเอง (ช่วง 1B — ใบจากงวดไม่ต้องอนุมัติ)
import { useState } from "react";
import { Check, GitBranch, Lightbulb, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import HowItWorks from "@/components/ui/guidance/how-it-works";
import StatusBanner from "@/components/ui/guidance/status-banner";
import Switch from "@/components/ui/switch";
import { apiFetch, type ApiError } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { approvalLevelsSchema, MAX_APPROVAL_LEVELS } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import type { ApprovalRules, RoleChoice } from "../_types";
import ApprovalExamples from "./approval-examples";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";
import Segmented from "@/components/ui/segmented";

export type LevelForm = {
    al_min_amount_thb: string;
    al_require_distinct: boolean;
    role_ids: string[];
};

type DocumentType = "QT" | "IV";

type ApprovalTabProps = {
    approval: ApprovalRules;
    invoiceApproval: ApprovalRules;
    roles: RoleChoice[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

type RulesEditorProps = {
    documentType: DocumentType;
    approval: ApprovalRules;
    roles: RoleChoice[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

function toLevelForms(approval: ApprovalRules): LevelForm[] {
    return approval.levels.map((level) => ({
        al_min_amount_thb: level.al_min_amount_thb,
        al_require_distinct: level.al_require_distinct,
        role_ids: level.roles.map((role) => role.role_id),
    }));
}

function sameRoles(first: string[], second: string[]): boolean {
    return first.length === second.length && first.every((roleId) => second.includes(roleId));
}

export default function ApprovalTab({ approval, invoiceApproval, roles, canEdit, onSaved }: ApprovalTabProps) {
    const messages = COMPANY_MESSAGES.approval;
    const [documentType, setDocumentType] = useState<DocumentType>("QT");

    return (
        <div className="grid gap-4">
            <div className="grid gap-1.5">
                <Segmented
                    label="กติกาอนุมัติของเอกสาร"
                    value={documentType}
                    onChange={setDocumentType}
                    options={[
                        { value: "QT", label: messages.documentTypes.QT },
                        { value: "IV", label: messages.documentTypes.IV },
                    ]}
                />
                <FieldHint>{messages.documentTypeHint}</FieldHint>
            </div>
            {/* key = ประเภทเอกสาร: สลับประเภทแล้วฟอร์มเริ่มจากกติกาที่บันทึกไว้ของประเภทนั้น (ไม่เอาค่าที่พิมพ์ค้างข้ามประเภท) */}
            <ApprovalRulesEditor
                key={documentType}
                documentType={documentType}
                approval={documentType === "QT" ? approval : invoiceApproval}
                roles={roles}
                canEdit={canEdit}
                onSaved={onSaved}
            />
        </div>
    );
}

function ApprovalRulesEditor({ documentType, approval, roles, canEdit, onSaved }: RulesEditorProps) {
    const messages = COMPANY_MESSAGES.approval;
    const [levels, setLevels] = useState<LevelForm[]>(() => toLevelForms(approval));
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [saveError, setSaveError] = useState<ApiError | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    function updateLevel(index: number, changes: Partial<LevelForm>) {
        setLevels((current) =>
            current.map((level, levelIndex) => (levelIndex === index ? { ...level, ...changes } : level)),
        );
    }

    function toggleRole(index: number, roleId: string) {
        const roleIds = levels[index].role_ids;
        const nextRoleIds = roleIds.includes(roleId) ? roleIds.filter((id) => id !== roleId) : [...roleIds, roleId];
        updateLevel(index, { role_ids: nextRoleIds });
    }

    function addLevel() {
        setLevels((current) => [...current, { al_min_amount_thb: "", al_require_distinct: false, role_ids: [] }]);
    }

    function removeLastLevel() {
        setLevels((current) => current.slice(0, -1));
    }

    async function handleSave() {
        setSaveError(null);
        const checked = approvalLevelsSchema.safeParse({ doc_type: documentType, levels });
        if (!checked.success) {
            setFieldErrors(toFieldErrors(checked.error.issues));
            return;
        }

        setIsSaving(true);
        const { data, error } = await apiFetch<ApprovalRules>("/company/approval-levels", {
            method: "PUT",
            body: checked.data,
        });
        setIsSaving(false);
        if (error) {
            setFieldErrors(error.fields);
            setSaveError(error);
            return;
        }
        setFieldErrors({});
        setLevels(toLevelForms(data));
        toast.success(COMPANY_MESSAGES.saved);
        await onSaved();
    }

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <SectionCard
                icon={GitBranch}
                title={`การอนุมัติ${messages.documentTypes[documentType]}`}
                description={documentType === "QT" ? messages.description : messages.invoiceDescription}
            >
                {approval.warnings.length > 0 && (
                    <StatusBanner tone="warn" title={messages.warningsTitle}>
                        <ul className="list-disc space-y-1 pl-5">
                            {approval.warnings.map((warning) => (
                                <li key={warning}>{warning}</li>
                            ))}
                        </ul>
                    </StatusBanner>
                )}

                <ol className="grid gap-4">
                    {levels.map((level, index) => {
                        const levelNumber = index + 1;
                        const savedLevel = approval.levels[index];
                        const isUnchangedRoles =
                            savedLevel !== undefined &&
                            sameRoles(
                                savedLevel.roles.map((role) => role.role_id),
                                level.role_ids,
                            );
                        const amountField = `levels.${index}.al_min_amount_thb`;
                        const rolesField = `levels.${index}.role_ids`;

                        return (
                            <li key={levelNumber} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 font-medium text-blue-600">
                                    {levelNumber}
                                </span>
                                <div className="grid gap-4 rounded-lg border border-gray-200 p-4">
                                    <FormField
                                        label={`ยอดขั้นต่ำของชั้น ${levelNumber} (บาท ก่อน VAT)`}
                                        htmlFor={`level-${index}-amount`}
                                        hint={index === 0 ? messages.firstLevelAmount : messages.minAmount}
                                        error={fieldErrors[amountField]}
                                        className="max-w-xs"
                                    >
                                        <input
                                            id={`level-${index}-amount`}
                                            inputMode="decimal"
                                            value={level.al_min_amount_thb}
                                            onChange={(event) =>
                                                updateLevel(index, { al_min_amount_thb: event.target.value })
                                            }
                                            disabled={!canEdit || index === 0}
                                            className={`${inputClass(Boolean(fieldErrors[amountField]))} text-right`}
                                        />
                                    </FormField>

                                    <div className="grid gap-1.5">
                                        <p className="text-sm font-medium text-gray-700">
                                            role ที่อนุมัติชั้นนี้ได้<span className="ml-0.5 text-red-600">*</span>
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {roles.map((role) => {
                                                const isSelected = level.role_ids.includes(role.role_id);
                                                return (
                                                    <button
                                                        key={role.role_id}
                                                        type="button"
                                                        aria-pressed={isSelected}
                                                        disabled={!canEdit}
                                                        onClick={() => toggleRole(index, role.role_id)}
                                                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm sm:py-1 ${
                                                            isSelected
                                                                ? "border-blue-300 bg-blue-50 font-medium text-blue-600"
                                                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                                        } disabled:cursor-default`}
                                                    >
                                                        {isSelected && <Check size={14} />}
                                                        {role.role_name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <FieldHint error={fieldErrors[rolesField]}>{messages.roles}</FieldHint>
                                        {isUnchangedRoles && (
                                            <p className="text-xs text-gray-500">
                                                {savedLevel.eligible_users.length > 0
                                                    ? messages.eligibleUsers(
                                                          savedLevel.eligible_users
                                                              .map((user) => user.full_name)
                                                              .join(", "),
                                                      )
                                                    : messages.noEligibleUsers}
                                            </p>
                                        )}
                                    </div>

                                    {index > 0 && (
                                        <div className="grid gap-1.5">
                                            <Switch
                                                id={`level-${index}-distinct`}
                                                label="ต้องเป็นคนละคนกับผู้อนุมัติชั้นก่อนหน้า"
                                                description={messages.requireDistinct}
                                                checked={level.al_require_distinct}
                                                disabled={!canEdit}
                                                onChange={(checked) =>
                                                    updateLevel(index, { al_require_distinct: checked })
                                                }
                                            />
                                            <FieldHint error={fieldErrors[`levels.${index}.al_require_distinct`]} />
                                        </div>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ol>

                <FieldHint error={fieldErrors.levels}>{null}</FieldHint>

                {canEdit && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={SECONDARY_BUTTON}
                            onClick={addLevel}
                            disabled={levels.length >= MAX_APPROVAL_LEVELS}
                        >
                            <Plus size={16} />
                            เพิ่มชั้น
                        </button>
                        {levels.length > 1 && (
                            <button type="button" className={SECONDARY_BUTTON} onClick={removeLastLevel}>
                                <Trash2 size={16} />
                                ลบชั้นสุดท้าย
                            </button>
                        )}
                    </div>
                )}
            </SectionCard>

            <aside className="grid gap-4 lg:sticky lg:top-4">
                <SectionCard icon={Lightbulb} title={messages.howTitle}>
                    <HowItWorks defaultOpen>
                        <ApprovalExamples levels={levels} roles={roles} />
                    </HowItWorks>
                </SectionCard>
                <SaveErrorBanner error={saveError} />
                {canEdit && (
                    <div className="grid gap-2">
                        <button type="button" className={PRIMARY_BUTTON} onClick={handleSave} disabled={isSaving}>
                            {isSaving ? "กำลังบันทึก..." : "บันทึกกติกาอนุมัติ"}
                        </button>
                        <FieldHint>{messages.pendingNote}</FieldHint>
                    </div>
                )}
            </aside>
        </div>
    );
}
