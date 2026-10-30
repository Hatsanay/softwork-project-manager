"use client";

// แท็บหมวดหมู่ — เพิ่ม/แก้/ลบ (ลบได้เสมอ สินค้าในหมวดกลายเป็น "ไม่มีหมวด")
import { useState } from "react";
import { FolderTree, Plus } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/empty-state";
import FormField, { inputClass } from "@/components/ui/form-field";
import Switch from "@/components/ui/switch";
import { RecordList, RecordRow, StatusPill } from "@/components/ui/record-list";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON } from "@/components/ui/section-card";
import EditorDrawer, { confirmDiscard, DrawerButtons } from "@/components/ui/editor-drawer";
import { apiFetch } from "@/lib/api";
import { toNumberOrNaN, useRecordEditor } from "@/lib/use-record-editor";
import { productCategorySchema } from "@/lib/shared/schemas/product.mjs";
import { PRODUCT_MESSAGES } from "../_messages";
import type { ActiveStatus, ProductCategory } from "../_types";

const EMPTY_FORM = {
    pc_name: "",
    pc_sort_order: "0",
    pc_status: "active" as ActiveStatus,
    pc_is_single_choice: false,
};

type CategoryForm = typeof EMPTY_FORM;

function toForm(category: ProductCategory): CategoryForm {
    return {
        pc_name: category.pc_name,
        pc_sort_order: String(category.pc_sort_order),
        pc_status: category.pc_status,
        pc_is_single_choice: Boolean(category.pc_is_single_choice),
    };
}

type CategoriesTabProps = {
    categories: ProductCategory[];
    canEdit: boolean;
    onSaved: () => Promise<void>;
};

export default function CategoriesTab({ categories, canEdit, onSaved }: CategoriesTabProps) {
    const messages = PRODUCT_MESSAGES.categories;
    const editor = useRecordEditor<CategoryForm>(EMPTY_FORM, onSaved);
    const { form, fieldErrors } = editor;
    const editingCategory = categories.find((category) => category.pc_id === editor.editingId) ?? null;

    const [deleteTarget, setDeleteTarget] = useState<ProductCategory | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: productCategorySchema,
            updateSchema: productCategorySchema,
            createPath: "/product-categories",
            updatePath: (categoryId) => `/product-categories/${categoryId}`,
            toPayload: (currentForm) => ({ ...currentForm, pc_sort_order: toNumberOrNaN(currentForm.pc_sort_order) }),
        });
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await apiFetch(`/product-categories/${deleteTarget.pc_id}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success(`ลบหมวด "${deleteTarget.pc_name}" แล้ว`);
        closeDeleteDialog();
        await onSaved();
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    return (
        <SectionCard
            icon={FolderTree}
            title={PRODUCT_MESSAGES.tabs.categories}
            description={messages.description}
            actions={
                canEdit && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={editor.openCreate}>
                        <Plus size={16} />
                        เพิ่มหมวด
                    </button>
                )
            }
        >
            {editor.isOpen && (
                <EditorDrawer
                    title={editingCategory ? `แก้ไขหมวด ${editingCategory.pc_name}` : "เพิ่มหมวด"}
                    subtitle="ใช้จัดกลุ่มสินค้าและชุดรายการ"
                    isDirty={editor.isDirty}
                    onClose={editor.close}
                    onSubmit={handleSubmit}
                    footer={
                        <DrawerButtons
                            isSaving={editor.isSaving}
                            submitLabel="บันทึกหมวด"
                            onCancel={() => confirmDiscard(editor.isDirty) && editor.close()}
                        />
                    }
                >
                    <div className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                        <FormField label="ชื่อหมวด" htmlFor="pc_name" required error={fieldErrors.pc_name}>
                            <input
                                id="pc_name"
                                value={form.pc_name}
                                onChange={(event) => editor.updateField("pc_name", event.target.value)}
                                className={inputClass(Boolean(fieldErrors.pc_name))}
                            />
                        </FormField>
                        <FormField
                            label="ลำดับ"
                            htmlFor="pc_sort_order"
                            hint={messages.sortOrder}
                            error={fieldErrors.pc_sort_order}
                        >
                            <input
                                id="pc_sort_order"
                                inputMode="numeric"
                                value={form.pc_sort_order}
                                onChange={(event) => editor.updateField("pc_sort_order", event.target.value)}
                                aria-describedby="pc_sort_order-hint"
                                className={inputClass(Boolean(fieldErrors.pc_sort_order))}
                            />
                        </FormField>
                        <FormField
                            label="สถานะ"
                            htmlFor="pc_status"
                            hint={form.pc_status === "inactive" ? messages.inactive : undefined}
                            error={fieldErrors.pc_status}
                        >
                            <select
                                id="pc_status"
                                value={form.pc_status}
                                onChange={(event) =>
                                    editor.updateField("pc_status", event.target.value as ActiveStatus)
                                }
                                className={inputClass(Boolean(fieldErrors.pc_status))}
                            >
                                <option value="active">ใช้งาน</option>
                                <option value="inactive">ปิดใช้งาน</option>
                            </select>
                        </FormField>
                    </div>
                    <Switch
                        id="pc_is_single_choice"
                        label="ลูกค้าเลือกได้รายการเดียวในหมวดนี้"
                        description="ใช้กับหมวดแพ็กเกจ · ลูกค้ากดแพ็กใหม่ = เปลี่ยนแทนแพ็กเดิมในตะกร้า (หน้าร้านของลิงก์เลือกบริการ)"
                        checked={form.pc_is_single_choice}
                        onChange={(checked) => editor.updateField("pc_is_single_choice", checked)}
                    />
                    </div>
                    <SaveErrorBanner error={editor.saveError} />
                </EditorDrawer>
            )}

            {categories.length === 0 ? (
                <EmptyState title="ยังไม่มีหมวด" description="หมวดไม่บังคับ สินค้าไม่มีหมวดก็ใช้ได้ตามปกติ" />
            ) : (
                <RecordList>
                    {categories.map((category) => (
                        <RecordRow
                            key={category.pc_id}
                            title={category.pc_name}
                            details={`ลำดับ ${category.pc_sort_order} · สินค้าในหมวด ${category.product_count} รายการ${category.pc_is_single_choice ? " · เลือกได้รายการเดียว" : ""}`}
                            pills={<StatusPill isActive={category.pc_status === "active"} />}
                            canEdit={canEdit}
                            onEdit={() => editor.openEdit(category.pc_id, toForm(category))}
                            onDelete={() => setDeleteTarget(category)}
                        />
                    ))}
                </RecordList>
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="ลบหมวดนี้?"
                description={deleteTarget ? `หมวด "${deleteTarget.pc_name}" จะถูกลบถาวร` : undefined}
                consequences={
                    deleteTarget
                        ? [
                              `สินค้า ${deleteTarget.product_count} รายการในหมวดนี้จะกลายเป็น "ไม่มีหมวด" (ไม่ถูกลบ)`,
                              "ชุดรายการในหมวดนี้ก็กลายเป็นไม่มีหมวดเช่นกัน · เอกสารที่ออกไปแล้วไม่กระทบ",
                          ]
                        : undefined
                }
                confirmLabel="ลบหมวด"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDelete}
                onCancel={closeDeleteDialog}
            />
        </SectionCard>
    );
}
