"use client";

// แท็บชุดรายการ (ปรับหน้า 2026-10-30): การ์ดวางเทียบกัน (ราคาชุดตอนนี้ · รายการแรกๆ · หน้าร้าน) + ค้นหา/กรอง
// เพิ่ม/แก้ในแผงกว้างด้านขวา 4 ส่วน: ข้อมูลชุด · รายการในชุด (ตาราง + ยอดต่อแถว) · หน้าร้าน · คำถามลูกค้า · ท้ายแผงบอกราคาชุดสด
// บันทึกแถวทั้งหมดทีเดียว · ลบผ่านหน้าต่างยืนยัน
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import EmptyState from "@/components/ui/empty-state";
import FormField, { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import { CARD_CLASS } from "@/components/ui/card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import Skeleton from "@/components/ui/skeleton";
import StatusPill from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import { apiFetch, uploadedFileUrl, type ApiError } from "@/lib/api";
import { useRecordEditor } from "@/lib/use-record-editor";
import { formatAmount, formatHundredths, trimQuantity } from "@/lib/shared/money.mjs";
import { productPackageSchema } from "@/lib/shared/schemas/product.mjs";
import { PRODUCT_MESSAGES } from "../_messages";
import type { ActiveStatus, Product, ProductCategory, ProductPackage, ProductPackageSummary } from "../_types";
import AddonRulesEditor, { type AddonRuleForm } from "./addon-rules-editor";
import CatalogImageField from "./catalog-image-field";
import CategoryChips from "./category-chips";
import CategorySelect from "./category-select";
import EditorDrawer, { confirmDiscard, DrawerButtons, DrawerSection } from "@/components/ui/editor-drawer";
import ItemQuestionsPanel, { type QuestionsTarget } from "./item-questions-panel";
import PackageItemsEditor, {
    emptyItem,
    newRowKey,
    packageTotalOf,
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

type ShowFilter = "all" | "active" | "inactive" | "public";

const SHOW_OPTIONS: { value: ShowFilter; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "active", label: "ใช้งาน" },
    { value: "inactive", label: "ปิดใช้งาน" },
    { value: "public", label: "อยู่บนหน้าร้าน" },
];

function emptyForm(): PackageForm {
    return {
        pkg_name: "",
        pkg_description: "",
        pkg_category_id: "",
        pkg_status: "active",
        pkg_is_public: false,
        items: [emptyItem("item")],
        addon_rules: [],
    };
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
            pki_quantity: trimQuantity(item.pki_quantity),
            pki_unit: item.pki_unit ?? "",
            pki_unit_price: item.pki_unit_price ?? "",
        })),
        addon_rules: (productPackage.addon_rules ?? []).map((rule) => ({
            product_id: rule.product_id,
            rule: rule.rule,
        })),
    };
}

// ช่องว่างในแถว = ไม่ระบุ (null) · ให้ชุดตรวจตัดสินว่าแถวชนิดไหนต้องมีอะไร
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

// เทียบว่าแก้อะไรไปหรือยัง (rowKey สร้างใหม่ทุกครั้งที่เปิด ไม่นับ)
function formSnapshot(form: PackageForm) {
    return JSON.stringify(toPayload(form));
}

// สินค้าที่แถวของชุดเดิมอ้างอยู่ · อาจปิดใช้งานแล้วหรือไม่อยู่ใน 200 รายการแรก ต้องมีในตัวเลือกเสมอ
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
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [showFilter, setShowFilter] = useState<ShowFilter>("all");
    const [activeProducts, setActiveProducts] = useState<ProductChoice[]>([]);
    const [referencedProducts, setReferencedProducts] = useState<ProductChoice[]>([]);
    const [savedCategoryId, setSavedCategoryId] = useState<string | null>(null);
    const [editingImageUrl, setEditingImageUrl] = useState<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);
    const [openError, setOpenError] = useState<ApiError | null>(null);
    const [openedSnapshot, setOpenedSnapshot] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<ProductPackageSummary | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const editor = useRecordEditor<PackageForm>(emptyForm(), async () => setReloadCount((count) => count + 1));
    const { form, fieldErrors } = editor;
    const editingPackage = packages?.find((productPackage) => productPackage.pkg_id === editor.editingId) ?? null;
    const isDirty = editor.isOpen && formSnapshot(form) !== openedSnapshot;

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

    // เพิ่มใหม่: เลือกหมวดที่กรองอยู่ไว้ให้
    async function openCreate() {
        setOpenError(null);
        setReferencedProducts([]);
        setSavedCategoryId(null);
        setEditingImageUrl(null);
        await loadActiveProducts();
        const prefilled = {
            ...emptyForm(),
            pkg_category_id: categoryFilter && categoryFilter !== "none" ? categoryFilter : "",
        };
        editor.openCreate();
        editor.updateField("pkg_category_id", prefilled.pkg_category_id);
        setOpenedSnapshot(formSnapshot(prefilled));
    }

    async function openEdit(packageId: string) {
        setOpenError(null);
        setOpeningId(packageId);
        const { data, error } = await apiFetch<ProductPackage>(`/product-packages/${packageId}`);
        if (error) {
            setOpeningId(null);
            setOpenError(error);
            return;
        }
        await loadActiveProducts();
        setOpeningId(null);
        setReferencedProducts(productsReferencedBy(data));
        setSavedCategoryId(data.pkg_category_id);
        setEditingImageUrl(data.pkg_image_url);
        const packageForm = toForm(data);
        editor.openEdit(packageId, packageForm);
        setOpenedSnapshot(formSnapshot(packageForm));
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

    const keyword = search.trim().toLowerCase();
    const shownPackages = (packages ?? []).filter((row) => {
        if (
            keyword &&
            ![row.pkg_name, row.pkg_description ?? "", ...row.preview_items].some((text) =>
                text.toLowerCase().includes(keyword),
            )
        )
            return false;
        if (categoryFilter === "none" && row.pkg_category_id) return false;
        if (categoryFilter && categoryFilter !== "none" && row.pkg_category_id !== categoryFilter) return false;
        if (showFilter === "active" || showFilter === "inactive") return row.pkg_status === showFilter;
        if (showFilter === "public") return Boolean(row.pkg_is_public);
        return true;
    });
    const usedCategories = categories.filter((category) =>
        (packages ?? []).some((row) => row.pkg_category_id === category.pc_id),
    );
    const hasNoCategory = (packages ?? []).some((row) => !row.pkg_category_id);

    const choices = mergeChoices(referencedProducts, activeProducts);
    // งานเพิ่มแบบ % ใส่ในชุดไม่ได้ (backend ไม่รับ) ไม่ให้เลือกในแถว · กติกางานเพิ่มยังเลือกได้
    const rowChoices = choices.filter(
        (product) => !("product_price_mode" in product) || product.product_price_mode !== "percent",
    );
    const { total, incompleteCount } = packageTotalOf(form.items, rowChoices);
    const itemRowCount = form.items.filter((item) => item.pki_type === "item").length;

    return (
        <div className="grid gap-4">
            <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative min-w-0 flex-[1_1_16rem]">
                        <span className="sr-only">ค้นหาชุดรายการ</span>
                        <Search
                            size={16}
                            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="ค้นหาชื่อชุดหรือรายการในชุด"
                            className={`${inputClass()} pl-10`}
                        />
                    </label>
                    <label className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 text-sm text-gray-600 sm:flex-none">
                        <span className="shrink-0">แสดง</span>
                        <select
                            value={showFilter}
                            onChange={(event) => setShowFilter(event.target.value as ShowFilter)}
                            className={`${inputClass()} sm:w-44`}
                        >
                            {SHOW_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {canEdit && (
                        <button
                            type="button"
                            className={`${buttonClass("primary", "md")} min-h-11 flex-[1_1_100%] justify-center sm:flex-none`}
                            onClick={openCreate}
                        >
                            <Plus size={16} />
                            เพิ่มชุดรายการ
                        </button>
                    )}
                </div>
                {usedCategories.length > 0 && (
                    <CategoryChips
                        categories={usedCategories}
                        value={categoryFilter}
                        withNone={hasNoCategory}
                        onChange={setCategoryFilter}
                    />
                )}
                <p className="text-xs text-gray-500">{messages.description}</p>
            </div>

            {openError && (
                <StatusBanner tone="error" title="เปิดชุดรายการไม่สำเร็จ">
                    {openError.message}
                </StatusBanner>
            )}

            {packages === null && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {[0, 1, 2].map((index) => (
                        <div key={index} className={`grid gap-3 p-4 ${CARD_CLASS}`}>
                            <Skeleton className="h-5 w-2/3" />
                            <Skeleton className="h-7 w-1/3" />
                            <Skeleton className="h-16 w-full" />
                        </div>
                    ))}
                </div>
            )}
            {packages !== null && packages.length === 0 && (
                <EmptyState
                    title="ยังไม่มีชุดรายการ"
                    description="สร้างชุดสำหรับงานที่ขายเป็นแพ็กเกจบ่อยๆ จะทำใบเสนอราคาได้เร็วขึ้น"
                />
            )}
            {packages !== null && packages.length > 0 && shownPackages.length === 0 && (
                <EmptyState title="ไม่พบชุดรายการ" description="ลองค้นด้วยคำอื่น หรือเปลี่ยนตัวกรอง" />
            )}
            {shownPackages.length > 0 && (
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {shownPackages.map((row) => (
                        <PackageCard
                            key={row.pkg_id}
                            productPackage={row}
                            canEdit={canEdit}
                            isOpening={openingId === row.pkg_id}
                            onEdit={() => openEdit(row.pkg_id)}
                            onDelete={() => setDeleteTarget(row)}
                        />
                    ))}
                </ul>
            )}

            {editor.isOpen && (
                <EditorDrawer
                    size="lg"
                    title={editingPackage ? `แก้ไขชุด ${editingPackage.pkg_name}` : "เพิ่มชุดรายการ"}
                    subtitle={
                        editingPackage
                            ? "แก้ชุดทีหลังไม่กระทบใบเสนอราคาที่ใส่ชุดนี้ไปแล้ว"
                            : "กรอกข้อมูลชุดและรายการในชุด แล้วกดบันทึก"
                    }
                    isDirty={isDirty}
                    onClose={editor.close}
                    onSubmit={handleSubmit}
                    footer={
                        <DrawerButtons
                            summary={
                                <span className="grid">
                                    <span>
                                        ราคาชุด{" "}
                                        <span className="text-base font-medium text-gray-900 tabular-nums">
                                            {formatAmount(formatHundredths(total))}
                                        </span>{" "}
                                        บาท
                                    </span>
                                    <span className="text-xs text-gray-500">
                                        {itemRowCount} รายการ
                                        {incompleteCount > 0
                                            ? ` · ยังไม่นับ ${incompleteCount} แถวที่จำนวน/ราคายังไม่ครบ`
                                            : ""}
                                    </span>
                                </span>
                            }
                            isSaving={editor.isSaving}
                            submitLabel="บันทึกชุดรายการ"
                            onCancel={() => confirmDiscard(isDirty) && editor.close()}
                        />
                    }
                >
                    <DrawerSection number={1} title="ข้อมูลชุด">
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField label="ชื่อชุดรายการ" htmlFor="pkg_name" required error={fieldErrors.pkg_name}>
                                <input
                                    id="pkg_name"
                                    value={form.pkg_name}
                                    placeholder="เช่น แพ็กเกจเว็บไซต์"
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
                                hint={
                                    form.pkg_is_public
                                        ? "แสดงบนการ์ดในหน้าร้าน · ไม่พิมพ์บนเอกสาร"
                                        : "สำหรับคนในทีม · ไม่พิมพ์บนเอกสาร"
                                }
                                error={fieldErrors.pkg_description}
                                className="sm:col-span-2"
                            >
                                <input
                                    id="pkg_description"
                                    value={form.pkg_description}
                                    onChange={(event) => editor.updateField("pkg_description", event.target.value)}
                                    aria-describedby="pkg_description-hint"
                                    className={inputClass(Boolean(fieldErrors.pkg_description))}
                                />
                            </FormField>
                        </div>
                        <Switch
                            id="pkg_status"
                            label="ใช้งาน"
                            description={
                                form.pkg_status === "active"
                                    ? "เลือกใส่ใบเสนอราคาได้"
                                    : "ปิดใช้งาน = เลือกใส่ใบเสนอราคาใหม่ไม่ได้"
                            }
                            checked={form.pkg_status === "active"}
                            onChange={(checked) => editor.updateField("pkg_status", checked ? "active" : "inactive")}
                        />
                    </DrawerSection>

                    <DrawerSection
                        number={2}
                        title="รายการในชุด"
                        description="กดใส่ชุดในใบเสนอราคาแล้ว ทุกแถวลงใบตามลำดับนี้"
                    >
                        <PackageItemsEditor
                            items={form.items}
                            onChange={(items) => editor.updateField("items", items)}
                            products={rowChoices}
                            fieldErrors={fieldErrors}
                        />
                    </DrawerSection>

                    <DrawerSection number={3} title="หน้าร้าน" description="ลิงก์เลือกบริการที่ส่งให้ลูกค้า">
                        <Switch
                            id="pkg_is_public"
                            label="แสดงบนหน้าร้าน"
                            description={messages.isPublic}
                            checked={form.pkg_is_public}
                            onChange={(checked) => editor.updateField("pkg_is_public", checked)}
                        />
                        {form.pkg_is_public && (
                            <div className="grid gap-4 rounded-xl bg-gray-50 p-3 sm:p-4">
                                <CatalogImageField
                                    basePath={editor.editingId ? `/product-packages/${editor.editingId}` : null}
                                    imageUrl={editingImageUrl}
                                    onChanged={(imageUrl) => {
                                        setEditingImageUrl(imageUrl);
                                        setReloadCount((count) => count + 1);
                                    }}
                                />
                                <AddonRulesEditor
                                    rules={form.addon_rules}
                                    products={choices}
                                    error={fieldErrors.addon_rules}
                                    onChange={(rules) => editor.updateField("addon_rules", rules)}
                                />
                            </div>
                        )}
                    </DrawerSection>

                    <ItemQuestionsPanel
                        kind="package"
                        itemId={editor.editingId}
                        categoryId={form.pkg_category_id || null}
                        onOpenQuestions={(target) => confirmDiscard(isDirty) && onOpenQuestions(target)}
                    />
                    <SaveErrorBanner error={editor.saveError} />
                </EditorDrawer>
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
        </div>
    );
}

function PackageCard({
    productPackage,
    canEdit,
    isOpening,
    onEdit,
    onDelete,
}: {
    productPackage: ProductPackageSummary;
    canEdit: boolean;
    isOpening: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const isActive = productPackage.pkg_status === "active";
    const isPublic = Boolean(productPackage.pkg_is_public);
    return (
        <li
            className={`flex flex-col gap-3 p-4 transition hover:border-blue-200 ${CARD_CLASS} ${isActive ? "" : "opacity-75"}`}
        >
            <div className="flex items-start gap-3">
                {productPackage.pkg_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- รูปจาก backend (ไฟล์ที่อัปโหลด) ไม่ผ่าน next/image
                    <img
                        src={uploadedFileUrl(productPackage.pkg_image_url)}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl border border-gray-100 object-cover"
                    />
                )}
                <div className="grid min-w-0 flex-1 gap-0.5">
                    <h3 className="text-base font-medium wrap-break-word text-gray-900">{productPackage.pkg_name}</h3>
                    <p className="text-xs text-gray-500">
                        {productPackage.category_name ?? "ไม่มีหมวด"} · {productPackage.item_count} แถว
                    </p>
                </div>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-2xl font-medium text-gray-900 tabular-nums">
                    {formatAmount(productPackage.pkg_total)}
                    <span className="ml-1 text-sm font-normal text-gray-500">บาท</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                    {!isActive && <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>}
                    {isPublic && <StatusPill tone="info">หน้าร้าน</StatusPill>}
                </div>
            </div>
            {productPackage.pkg_description && (
                <p className="line-clamp-2 text-xs text-gray-500">{productPackage.pkg_description}</p>
            )}
            {productPackage.preview_items.length > 0 && (
                <ul className="grid gap-1 text-sm text-gray-700">
                    {productPackage.preview_items.map((name, index) => (
                        <li key={`${name}-${index}`} className="flex items-start gap-1.5">
                            <Check size={14} className="mt-1 shrink-0 text-blue-600" aria-hidden="true" />
                            <span className="line-clamp-1 min-w-0 wrap-break-word">{name}</span>
                        </li>
                    ))}
                </ul>
            )}
            {productPackage.inactive_product_count > 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {PRODUCT_MESSAGES.packages.inactiveProducts(productPackage.inactive_product_count)} (ไม่นับในราคา)
                </p>
            )}
            {canEdit && (
                <div className="mt-auto flex gap-2 border-t border-gray-100 pt-3">
                    <button
                        type="button"
                        className={`${buttonClass("secondary", "md")} min-h-10 flex-1 justify-center`}
                        onClick={onEdit}
                        disabled={isOpening}
                    >
                        <Pencil size={15} />
                        {isOpening ? "กำลังเปิด..." : "แก้ไข"}
                    </button>
                    <button
                        type="button"
                        aria-label={`ลบชุด ${productPackage.pkg_name}`}
                        className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        onClick={onDelete}
                    >
                        <Trash2 size={16} />
                    </button>
                </div>
            )}
        </li>
    );
}
