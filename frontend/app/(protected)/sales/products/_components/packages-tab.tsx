"use client";

// แท็บชุดรายการ — รายการชุด + แผงเพิ่ม/แก้ทั้งชุด (บันทึกแถวทั้งหมดทีเดียว) + ลบ
import { useEffect, useState } from "react";
import { Boxes, Plus } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/empty-state";
import FormField, { inputClass } from "@/components/ui/form-field";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { InfoPill, RecordList, RecordRow, StatusPill } from "@/components/ui/record-list";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";
import { apiFetch, type ApiError } from "@/lib/api";
import { useRecordEditor } from "@/lib/use-record-editor";
import { productPackageSchema } from "@/lib/shared/schemas/product.mjs";
import { PRODUCT_MESSAGES } from "../_messages";
import type { ActiveStatus, Product, ProductCategory, ProductPackage, ProductPackageSummary } from "../_types";
import CategorySelect from "./category-select";
import CatalogImageField from "./catalog-image-field";
import Switch from "@/components/ui/switch";
import AddonRulesEditor, { type AddonRuleForm } from "./addon-rules-editor";
import ItemQuestionsPanel, { type QuestionsTarget } from "./item-questions-panel";
import PackageItemsEditor, {
    emptyItem,
    newRowKey,
    type PackageItemForm,
    type ProductChoice,
} from "./package-items-editor";

// ตัวเลือกสินค้าในแถว: สินค้าที่เปิดใช้งาน (สูงสุด 200 รายการ เรียงตามชื่อ) + สินค้าที่แถวเดิมอ้างอยู่
const PRODUCT_CHOICE_LIMIT = 200;

type PackageForm = {
    pkg_name: string;
    pkg_description: string;
    pkg_category_id: string;
    pkg_status: ActiveStatus;
    pkg_is_public: boolean;
    items: PackageItemForm[];
    addon_rules: AddonRuleForm[];
};

function emptyForm(): PackageForm {
    return { pkg_name: "", pkg_description: "", pkg_category_id: "", pkg_status: "active", pkg_is_public: false, items: [emptyItem("item")], addon_rules: [] };
}

function toForm(productPackage: ProductPackage): PackageForm {
    return {
        pkg_name: productPackage.pkg_name,
        pkg_description: productPackage.pkg_description ?? "",
        pkg_category_id: productPackage.pkg_category_id ?? "",
        pkg_status: productPackage.pkg_status,
        pkg_is_public: Boolean(productPackage.pkg_is_public),
        items: productPackage.items.map((item) => ({
            rowKey: newRowKey(),
            pki_type: item.pki_type,
            pki_product_id: item.pki_product_id ?? "",
            pki_description: item.pki_description,
            pki_quantity: item.pki_quantity ?? "",
            pki_unit: item.pki_unit ?? "",
            pki_unit_price: item.pki_unit_price ?? "",
        })),
        addon_rules: (productPackage.addon_rules ?? []).map((rule) => ({ product_id: rule.product_id, rule: rule.rule })),
    };
}

// ช่องว่างในแถว = ไม่ระบุ (null) — ให้ชุดตรวจตัดสินว่าแถวชนิดไหนต้องมีอะไร
function toPayload(form: PackageForm) {
    return {
        pkg_name: form.pkg_name,
        pkg_description: form.pkg_description,
        pkg_category_id: form.pkg_category_id,
        pkg_status: form.pkg_status,
        pkg_is_public: form.pkg_is_public,
        items: form.items.map((item) => ({
            pki_type: item.pki_type,
            pki_product_id: item.pki_product_id || null,
            pki_description: item.pki_description,
            pki_quantity: item.pki_quantity.trim() === "" ? null : item.pki_quantity.trim(),
            pki_unit: item.pki_unit,
            pki_unit_price: item.pki_unit_price.trim() === "" ? null : item.pki_unit_price.trim(),
        })),
        addon_rules: form.addon_rules,
    };
}

// สินค้าที่แถวของชุดเดิมอ้างอยู่ — อาจปิดใช้งานแล้วหรือไม่อยู่ใน 200 รายการแรก ต้องมีในตัวเลือกเสมอ
function productsReferencedBy(productPackage: ProductPackage): ProductChoice[] {
    return productPackage.items
        .filter((item) => item.pki_product_id && item.product_name)
        .map((item) => ({
            product_id: item.pki_product_id as string,
            product_name: item.product_name as string,
            product_code: item.product_code,
            product_unit: item.product_unit,
            product_price: item.product_price ?? "0.00",
            product_status: item.product_status ?? "inactive",
        }));
}

function mergeChoices(first: ProductChoice[], second: ProductChoice[]) {
    const byId = new Map<string, ProductChoice>();
    for (const product of [...first, ...second]) byId.set(product.product_id, product);
    return [...byId.values()];
}

type PackagesTabProps = {
    categories: ProductCategory[];
    canEdit: boolean;
    // ไปแก้คำถามลูกค้าของชุดนี้ในแท็บคำถาม (Q-2)
    onOpenQuestions: (target: QuestionsTarget) => void;
};

export default function PackagesTab({ categories, canEdit, onOpenQuestions }: PackagesTabProps) {
    const messages = PRODUCT_MESSAGES.packages;
    const [packages, setPackages] = useState<ProductPackageSummary[] | null>(null);
    const [reloadCount, setReloadCount] = useState(0);
    const [activeProducts, setActiveProducts] = useState<ProductChoice[]>([]);
    const [referencedProducts, setReferencedProducts] = useState<ProductChoice[]>([]);
    const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null);
    const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
    const [openError, setOpenError] = useState<ApiError | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<ProductPackageSummary | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const editor = useRecordEditor<PackageForm>(emptyForm(), async () => setReloadCount((count) => count + 1));
    const { form, fieldErrors } = editor;
    const editingPackage = packages?.find((productPackage) => productPackage.pkg_id === editor.editingId) ?? null;

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: ProductPackageSummary[] }>("/product-packages").then(({ data }) => {
            if (!isLeftPage) setPackages(data?.data ?? []);
        });
        return () => {
            isLeftPage = true;
        };
    }, [reloadCount]);

    async function loadActiveProducts() {
        const query = new URLSearchParams({ status: "active", limit: String(PRODUCT_CHOICE_LIMIT), offset: "0" });
        const { data } = await apiFetch<{ data: Product[] }>(`/products?${query}`);
        setActiveProducts(data?.data ?? []);
    }

    async function openCreate() {
        setOpenError(null);
        setReferencedProducts([]);
        setSavedCategoryId(null);
        setEditingImageUrl(null);
        await loadActiveProducts();
        editor.openCreate();
    }

    async function openEdit(packageId: string) {
        setOpenError(null);
        const { data, error } = await apiFetch<ProductPackage>(`/product-packages/${packageId}`);
        if (error) {
            setOpenError(error);
            return;
        }
        await loadActiveProducts();
        setReferencedProducts(productsReferencedBy(data));
        setSavedCategoryId(data.pkg_category_id);
        setEditingImageUrl(data.pkg_image_url);
        editor.openEdit(packageId, toForm(data));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: productPackageSchema,
            updateSchema: productPackageSchema,
            createPath: "/product-packages",
            updatePath: (packageId) => `/product-packages/${packageId}`,
            toPayload,
        });
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await apiFetch(`/product-packages/${deleteTarget.pkg_id}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success(`ลบชุด "${deleteTarget.pkg_name}" แล้ว`);
        closeDeleteDialog();
        setReloadCount((count) => count + 1);
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    return (
        <SectionCard
            icon={Boxes}
            title={PRODUCT_MESSAGES.tabs.packages}
            description={messages.description}
            actions={
                canEdit &&
                !editor.isOpen && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={openCreate}>
                        <Plus size={16} />
                        เพิ่มชุดรายการ
                    </button>
                )
            }
        >
            {openError && (
                <StatusBanner tone="error" title="เปิดชุดรายการไม่สำเร็จ">
                    {openError.message}
                </StatusBanner>
            )}

            {editor.isOpen && (
                <form onSubmit={handleSubmit} className="grid gap-4 rounded-lg bg-gray-50 p-4" noValidate>
                    <p className="font-medium text-gray-800">
                        {editingPackage ? `แก้ไขชุด ${editingPackage.pkg_name}` : "เพิ่มชุดรายการ"}
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField label="ชื่อชุดรายการ" htmlFor="pkg_name" required error={fieldErrors.pkg_name}>
                            <input
                                id="pkg_name"
                                value={form.pkg_name}
                                onChange={(event) => editor.updateField("pkg_name", event.target.value)}
                                className={inputClass(Boolean(fieldErrors.pkg_name))}
                            />
                        </FormField>
                        <FormField
                            label="หมวด"
                            htmlFor="pkg_category_id"
                            hint={PRODUCT_MESSAGES.products.category}
                            error={fieldErrors.pkg_category_id}
                        >
                            <CategorySelect
                                id="pkg_category_id"
                                value={form.pkg_category_id}
                                onChange={(categoryId) => editor.updateField("pkg_category_id", categoryId)}
                                categories={categories}
                                savedCategoryId={savedCategoryId}
                                hasError={Boolean(fieldErrors.pkg_category_id)}
                            />
                        </FormField>
                        <FormField
                            label="รายละเอียด"
                            htmlFor="pkg_description"
                            hint="สำหรับคนในทีม — ไม่พิมพ์บนเอกสาร"
                            error={fieldErrors.pkg_description}
                        >
                            <input
                                id="pkg_description"
                                value={form.pkg_description}
                                onChange={(event) => editor.updateField("pkg_description", event.target.value)}
                                aria-describedby="pkg_description-hint"
                                className={inputClass(Boolean(fieldErrors.pkg_description))}
                            />
                        </FormField>
                        <FormField
                            label="สถานะ"
                            htmlFor="pkg_status"
                            hint={
                                form.pkg_status === "inactive" ? "ปิดใช้งาน = เลือกใส่ใบเสนอราคาใหม่ไม่ได้" : undefined
                            }
                            error={fieldErrors.pkg_status}
                        >
                            <select
                                id="pkg_status"
                                value={form.pkg_status}
                                onChange={(event) =>
                                    editor.updateField("pkg_status", event.target.value as ActiveStatus)
                                }
                                className={inputClass(Boolean(fieldErrors.pkg_status))}
                            >
                                <option value="active">ใช้งาน</option>
                                <option value="inactive">ปิดใช้งาน</option>
                            </select>
                        </FormField>
                    </div>

                    <div className="grid gap-3">
                        <Switch
                            id="pkg_is_public"
                            label="แสดงบนหน้าร้าน (ลิงก์เลือกบริการ)"
                            description={messages.isPublic}
                            checked={form.pkg_is_public}
                            onChange={(checked) => editor.updateField("pkg_is_public", checked)}
                        />
                        {form.pkg_is_public && (
                            <CatalogImageField
                                basePath={editor.editingId ? `/product-packages/${editor.editingId}` : null}
                                imageUrl={editingImageUrl}
                                onChanged={(imageUrl) => {
                                    setEditingImageUrl(imageUrl);
                                    setReloadCount((count) => count + 1);
                                }}
                            />
                        )}
                    </div>

                    <PackageItemsEditor
                        items={form.items}
                        onChange={(items) => editor.updateField("items", items)}
                        products={mergeChoices(referencedProducts, activeProducts)}
                        fieldErrors={fieldErrors}
                    />

                    <AddonRulesEditor
                        rules={form.addon_rules}
                        products={mergeChoices(referencedProducts, activeProducts)}
                        error={fieldErrors.addon_rules}
                        onChange={(rules) => editor.updateField("addon_rules", rules)}
                    />
                    <ItemQuestionsPanel kind="package" itemId={editor.editingId} categoryId={form.pkg_category_id || null} onOpenQuestions={onOpenQuestions} />

                    <SaveErrorBanner error={editor.saveError} />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" className={SECONDARY_BUTTON} onClick={editor.close}>
                            ยกเลิก
                        </button>
                        <button type="submit" className={PRIMARY_BUTTON} disabled={editor.isSaving}>
                            {editor.isSaving ? "กำลังบันทึก..." : "บันทึกชุดรายการ"}
                        </button>
                    </div>
                </form>
            )}

            {packages !== null && packages.length === 0 && (
                <EmptyState
                    title="ยังไม่มีชุดรายการ"
                    description="สร้างชุดสำหรับงานที่ขายเป็นแพ็กเกจบ่อยๆ จะทำใบเสนอราคาได้เร็วขึ้น"
                />
            )}
            {packages !== null && packages.length > 0 && (
                <RecordList>
                    {packages.map((productPackage) => (
                        <RecordRow
                            key={productPackage.pkg_id}
                            title={productPackage.pkg_name}
                            details={[
                                `${productPackage.item_count} แถว`,
                                productPackage.category_name ?? "ไม่มีหมวด",
                                productPackage.inactive_product_count > 0
                                    ? messages.inactiveProducts(productPackage.inactive_product_count)
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(" · ")}
                            pills={
                                <>
                                    {productPackage.inactive_product_count > 0 && (
                                        <InfoPill>มีสินค้าปิดใช้งาน</InfoPill>
                                    )}
                                    <StatusPill isActive={productPackage.pkg_status === "active"} />
                                    {Boolean(productPackage.pkg_is_public) && <InfoPill>หน้าร้าน</InfoPill>}
                                </>
                            }
                            canEdit={canEdit}
                            onEdit={() => openEdit(productPackage.pkg_id)}
                            onDelete={() => setDeleteTarget(productPackage)}
                        />
                    ))}
                </RecordList>
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="ลบชุดรายการนี้?"
                description={
                    deleteTarget
                        ? `ชุด "${deleteTarget.pkg_name}" และแถวทั้ง ${deleteTarget.item_count} แถวจะถูกลบถาวร`
                        : undefined
                }
                consequences={[messages.deleteNote, "สินค้าที่อยู่ในชุดไม่ถูกลบ"]}
                confirmLabel="ลบชุดรายการ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDelete}
                onCancel={closeDeleteDialog}
            />
        </SectionCard>
    );
}
