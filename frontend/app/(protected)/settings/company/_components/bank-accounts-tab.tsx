"use client";

// แท็บบัญชีธนาคาร · บัญชีหลักมีได้ 1 บัญชีต่อสกุลเงิน (backend ปลดบัญชีหลักเดิมให้) · เพิ่ม/แก้ในแผงด้านขวา (2026-10-30)
import { Landmark, Plus } from "lucide-react";
import EmptyState from "@/components/ui/empty-state";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import Switch from "@/components/ui/switch";
import { bankAccountSchema } from "@/lib/shared/schemas/company.mjs";
import { COMPANY_MESSAGES } from "../_messages";
import type { BankAccount, Currency } from "../_types";
import { useRecordEditor } from "@/lib/use-record-editor";
import { InfoPill, RecordList, RecordRow, StatusPill } from "@/components/ui/record-list";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON } from "@/components/ui/section-card";
import EditorDrawer, { confirmDiscard, DrawerButtons } from "@/components/ui/editor-drawer";

const EMPTY_FORM = {
    ba_bank_name: "",
    ba_account_name: "",
    ba_account_no: "",
    ba_bank_branch: "",
    ba_swift_code: "",
    ba_currency: "THB",
    ba_is_default: false,
    ba_status: "active" as "active" | "inactive",
};

type BankAccountForm = typeof EMPTY_FORM;

function toForm(account: BankAccount): BankAccountForm {
    return {
        ba_bank_name: account.ba_bank_name,
        ba_account_name: account.ba_account_name,
        ba_account_no: account.ba_account_no,
        ba_bank_branch: account.ba_bank_branch ?? "",
        ba_swift_code: account.ba_swift_code ?? "",
        ba_currency: account.ba_currency,
        ba_is_default: account.ba_is_default,
        ba_status: account.ba_status,
    };
}

type BankAccountsTabProps = {
    bankAccounts: BankAccount[];
    currencies: Currency[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

export default function BankAccountsTab({ bankAccounts, currencies, canEdit, onSaved }: BankAccountsTabProps) {
    const messages = COMPANY_MESSAGES.bankAccounts;
    const editor = useRecordEditor<BankAccountForm>(EMPTY_FORM, onSaved);
    const { form, fieldErrors } = editor;
    const editingAccount = bankAccounts.find((account) => account.ba_id === editor.editingId) ?? null;

    // เลือกได้เฉพาะสกุลที่เปิดใช้งาน + สกุลเดิมของบัญชีที่กำลังแก้ (เผื่อสกุลนั้นถูกปิดไปแล้ว)
    const currencyChoices = currencies.filter(
        (currency) => currency.cur_status === "active" || currency.cur_code === editingAccount?.ba_currency,
    );

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: bankAccountSchema,
            updateSchema: bankAccountSchema,
            createPath: "/company/bank-accounts",
            updatePath: (accountId) => `/company/bank-accounts/${accountId}`,
            toPayload: (currentForm) => currentForm,
        });
    }

    function textInput(
        field: "ba_bank_name" | "ba_account_name" | "ba_account_no" | "ba_bank_branch" | "ba_swift_code",
    ) {
        return (
            <input
                id={field}
                value={form[field]}
                onChange={(event) => editor.updateField(field, event.target.value)}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    return (
        <SectionCard
            icon={Landmark}
            title={COMPANY_MESSAGES.tabs.bankAccounts}
            description={messages.description}
            actions={
                canEdit && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={editor.openCreate}>
                        <Plus size={16} />
                        เพิ่มบัญชี
                    </button>
                )
            }
        >
            {editor.isOpen && (
                <EditorDrawer
                    title={editingAccount ? `แก้ไขบัญชี ${editingAccount.ba_bank_name} ${editingAccount.ba_account_no}` : "เพิ่มบัญชีธนาคาร"}
                    subtitle="บัญชีที่พิมพ์บนเอกสารขายให้ลูกค้าโอนเข้า"
                    isDirty={editor.isDirty}
                    onClose={editor.close}
                    onSubmit={handleSubmit}
                    footer={
                        <DrawerButtons
                            isSaving={editor.isSaving}
                            submitLabel="บันทึกบัญชี"
                            onCancel={() => confirmDiscard(editor.isDirty) && editor.close()}
                        />
                    }
                >
                    <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
                        <FormField label="ธนาคาร" htmlFor="ba_bank_name" required error={fieldErrors.ba_bank_name}>
                            {textInput("ba_bank_name")}
                        </FormField>
                        <FormField label="สาขาธนาคาร" htmlFor="ba_bank_branch" error={fieldErrors.ba_bank_branch}>
                            {textInput("ba_bank_branch")}
                        </FormField>
                        <FormField
                            label="ชื่อบัญชี"
                            htmlFor="ba_account_name"
                            required
                            error={fieldErrors.ba_account_name}
                        >
                            {textInput("ba_account_name")}
                        </FormField>
                        <FormField
                            label="เลขที่บัญชี"
                            htmlFor="ba_account_no"
                            required
                            error={fieldErrors.ba_account_no}
                        >
                            {textInput("ba_account_no")}
                        </FormField>
                        <FormField
                            label="สกุลเงิน"
                            htmlFor="ba_currency"
                            required
                            hint={messages.currency}
                            error={fieldErrors.ba_currency}
                        >
                            <select
                                id="ba_currency"
                                value={form.ba_currency}
                                onChange={(event) => editor.updateField("ba_currency", event.target.value)}
                                className={inputClass(Boolean(fieldErrors.ba_currency))}
                            >
                                {currencyChoices.map((currency) => (
                                    <option key={currency.cur_code} value={currency.cur_code}>
                                        {currency.cur_code} · {currency.cur_name_th}
                                    </option>
                                ))}
                            </select>
                        </FormField>
                        <FormField
                            label="รหัส SWIFT"
                            htmlFor="ba_swift_code"
                            hint={messages.swift}
                            error={fieldErrors.ba_swift_code}
                        >
                            {textInput("ba_swift_code")}
                        </FormField>
                        <FormField label="สถานะ" htmlFor="ba_status" error={fieldErrors.ba_status}>
                            <select
                                id="ba_status"
                                value={form.ba_status}
                                onChange={(event) =>
                                    editor.updateField("ba_status", event.target.value as BankAccountForm["ba_status"])
                                }
                                className={inputClass(Boolean(fieldErrors.ba_status))}
                            >
                                <option value="active">ใช้งาน</option>
                                <option value="inactive">ปิดใช้งาน</option>
                            </select>
                        </FormField>
                    </div>
                    <div className="grid gap-1.5 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                        <Switch
                            id="ba_is_default"
                            label="เป็นบัญชีหลักของสกุลเงินนี้"
                            description={messages.isDefault}
                            checked={form.ba_is_default}
                            onChange={(checked) => editor.updateField("ba_is_default", checked)}
                        />
                        <FieldHint
                            error={
                                form.ba_is_default && form.ba_status === "inactive" ? messages.inactiveDefault : null
                            }
                        />
                    </div>
                    <SaveErrorBanner error={editor.saveError} />
                </EditorDrawer>
            )}

            {bankAccounts.length === 0 ? (
                <EmptyState icon={Landmark} title="ยังไม่มีบัญชีธนาคาร" description={messages.empty} />
            ) : (
                <RecordList>
                    {bankAccounts.map((account) => (
                        <RecordRow
                            key={account.ba_id}
                            title={`${account.ba_bank_name} ${account.ba_account_no}`}
                            details={`${account.ba_account_name}${account.ba_bank_branch ? ` · สาขา${account.ba_bank_branch}` : ""}`}
                            pills={
                                <>
                                    <InfoPill>{account.ba_currency}</InfoPill>
                                    {account.ba_is_default && <InfoPill>บัญชีหลัก</InfoPill>}
                                    <StatusPill isActive={account.ba_status === "active"} />
                                </>
                            }
                            canEdit={canEdit}
                            onEdit={() => editor.openEdit(account.ba_id, toForm(account))}
                        />
                    ))}
                </RecordList>
            )}
        </SectionCard>
    );
}
