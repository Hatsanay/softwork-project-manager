"use client";

// แท็บสินค้า/บริการ (ปรับหน้า 2026-10-30): แถบเครื่องมือแถวเดียว (ค้นหา · แสดง · เพิ่ม) + ชิปหมวด · ตารางบอกเฉพาะสิ่งที่ต่างจากปกติ
// เพิ่ม/แก้ในแผงด้านขวา (รายการด้านหลังอยู่ที่เดิม) แบ่ง 3 ส่วน: ข้อมูลบนเอกสาร · ราคา · การใช้งานและหน้าร้าน · ลบผ่านหน้าต่างยืนยัน
import { useEffect, useState } from "react";
import { Percent, Plus, Search, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import EditButton from "@/components/ui/Button/EditButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import { buttonClass } from "@/components/ui/button";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import StatusPill from "@/components/ui/status-pill";
import Switch from "@/components/ui/switch";
import { apiFetch } from "@/lib/api";
import { useRecordEditor } from "@/lib/use-record-editor";
import { formatAmount } from "@/lib/shared/money.mjs";
import { productSchema } from "@/lib/shared/schemas/product.mjs";
import { PRODUCT_MESSAGES } from "../_messages";
import type { ActiveStatus, Product, ProductCategory } from "../_types";
import CategorySelect from "./category-select";
import CatalogImageField from "./catalog-image-field";
import CategoryChips from "./category-chips";
import EditorDrawer, { confirmDiscard, DrawerButtons, DrawerSection } from "@/components/ui/editor-drawer";
import ItemQuestionsPanel, { type QuestionsTarget } from "./item-questions-panel";

const EMPTY_FORM = {
    product_code: "",
    product_name: "",
    product_description: "",
    product_unit: "",
    product_price: "",
    product_category_id: "",
    product_status: "active" as ActiveStatus,
    product_is_public: false,
    product_price_mode: "fixed" as "fixed" | "percent",
    product_percent: "",
};

type ProductForm = typeof EMPTY_FORM;
// ตัวกรอง "แสดง": สถานะ หรือ อยู่/ไม่อยู่บนหน้าร้าน (เลือกได้ทีละอย่าง พอสำหรับงานประจำ)
type ShowFilter = "all" | "active" | "inactive" | "public" | "not_public";

const SHOW_OPTIONS: { value: ShowFilter; label: string }[] = [
    { value: "all", label: "ทั้งหมด" },
    { value: "active", label: "ใช้งาน" },
    { value: "inactive", label: "ปิดใช้งาน" },
    { value: "public", label: "อยู่บนหน้าร้าน" },
    { value: "not_public", label: "ไม่อยู่บนหน้าร้าน" },
];

// พิมพ์ค้นหาแล้วรอสักครู่ค่อยโหลด (ไม่ยิงทุกตัวอักษร)
const SEARCH_DELAY_MS = 250;

function toForm(product: Product): ProductForm {
    return {
        product_code: product.product_code ?? "",
        product_name: product.product_name,
        product_description: product.product_description ?? "",
        product_unit: product.product_unit ?? "",
        product_price: product.product_price,
        product_category_id: product.product_category_id ?? "",
        product_status: product.product_status,
        product_is_public: Boolean(product.product_is_public),
        product_price_mode: product.product_price_mode ?? "fixed",
        product_percent: product.product_percent ?? "",
    };
}

/** ราคาที่คนอ่านเข้าใจทันที: "18,000.00 บาท / ปี" หรือ "+30% ของยอด" */
function priceText(
    product: Pick<Product, "product_price_mode" | "product_percent" | "product_price" | "product_unit">,
) {
    if (product.product_price_mode === "percent") return `+${Number(product.product_percent)}% ของยอด`;
    return `${formatAmount(product.product_price)} บาท${product.product_unit ? ` / ${product.product_unit}` : ""}`;
}

type ProductsTabProps = {
    categories: ProductCategory[];
    canEdit: boolean;
    // ไปแก้คำถามลูกค้าของรายการนี้ในแท็บคำถาม (Q-2)
    onOpenQuestions: (target: QuestionsTarget) => void;
};

export default function ProductsTab({ categories, canEdit, onOpenQuestions }: ProductsTabProps) {
    const messages = PRODUCT_MESSAGES.products;
    const [products, setProducts] = useState<Product[]>([]);
    const [total, setTotal] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(25);
    const [searchText, setSearchText] = useState("");
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [showFilter, setShowFilter] = useState<ShowFilter>("all");
    const [reloadCount, setReloadCount] = useState(0);

    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const editor = useRecordEditor<ProductForm>(EMPTY_FORM, async () => setReloadCount((count) => count + 1));
    const { form, fieldErrors } = editor;
    // สินค้าที่กำลังแก้ เก็บไว้ตอนเปิด (เปลี่ยนหน้า/ตัวกรองระหว่างแก้ก็ยังรู้ว่าแก้อะไร)
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [openedFormJson, setOpenedFormJson] = useState("");
    const isDirty = editor.isOpen && JSON.stringify(form) !== openedFormJson;

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchText.trim());
            setPage(1);
        }, SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
    }, [searchText]);

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
            search,
        });
        if (categoryFilter) query.set("category_id", categoryFilter);
        if (showFilter === "active" || showFilter === "inactive") query.set("status", showFilter);
        if (showFilter === "public") query.set("public", "yes");
        if (showFilter === "not_public") query.set("public", "no");

        apiFetch<{ data: Product[]; total: number }>(`/products?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setProducts(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [page, pageSize, search, categoryFilter, showFilter, reloadCount]);

    function changeFilter(update: () => void) {
        update();
        setPage(1);
    }

    // เพิ่มใหม่: เลือกหมวดที่กรองอยู่ไว้ให้
    function openCreate() {
        const prefilled = {
            ...EMPTY_FORM,
            product_category_id: categoryFilter && categoryFilter !== "none" ? categoryFilter : "",
        };
        setEditingProduct(null);
        editor.openCreate();
        editor.updateField("product_category_id", prefilled.product_category_id);
        setOpenedFormJson(JSON.stringify(prefilled));
    }

    function openEdit(product: Product) {
        const productForm = toForm(product);
        setEditingProduct(product);
        editor.openEdit(product.product_id, productForm);
        setOpenedFormJson(JSON.stringify(productForm));
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: productSchema,
            updateSchema: productSchema,
            createPath: "/products",
            updatePath: (productId) => `/products/${productId}`,
            // แบบ %: ราคาตั้งต้นไม่ใช้ (ส่ง 0) · ราคาตายตัว: ไม่ส่งช่อง % ที่ซ่อนอยู่ (ค่าค้างจากตอนสลับโหมดไม่ทำให้บันทึกไม่ได้)
            toPayload: (currentForm) =>
                currentForm.product_price_mode === "percent"
                    ? { ...currentForm, product_price: "0" }
                    : { ...currentForm, product_percent: "" },
        });
    }

    async function handleDelete() {
        if (!deleteTarget) return;
        setIsDeleting(true);
        const { error } = await apiFetch(`/products/${deleteTarget.product_id}`, { method: "DELETE" });
        setIsDeleting(false);
        if (error) {
            setDeleteError(error.message);
            return;
        }
        toast.success(`ลบ "${deleteTarget.product_name}" แล้ว`);
        closeDeleteDialog();
        setReloadCount((count) => count + 1);
    }

    function closeDeleteDialog() {
        setDeleteTarget(null);
        setDeleteError(null);
    }

    function textInput(
        field: "product_code" | "product_name" | "product_unit" | "product_price" | "product_percent",
        inputMode?: "decimal",
        placeholder?: string,
    ) {
        return (
            <input
                id={field}
                inputMode={inputMode}
                value={form[field]}
                placeholder={placeholder}
                onChange={(event) => editor.updateField(field, event.target.value)}
                aria-describedby={`${field}-hint`}
                className={inputClass(Boolean(fieldErrors[field]))}
            />
        );
    }

    const columns: Column<Product>[] = [
        {
            key: "product_name",
            header: "สินค้า/บริการ",
            // ป้ายขึ้นเฉพาะที่ต่างจากปกติ (ปิดใช้งาน · อยู่บนหน้าร้าน) ข้างชื่อ ไม่ต้องมีคอลัมน์สถานะที่ส่วนใหญ่ว่าง
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                            className={`font-medium wrap-break-word ${row.product_status === "active" ? "text-gray-900" : "text-gray-500"}`}
                        >
                            {row.product_name}
                        </span>
                        {row.product_status !== "active" && <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>}
                        {Boolean(row.product_is_public) && <StatusPill tone="info">หน้าร้าน</StatusPill>}
                    </span>
                    <span className="text-xs text-gray-500">
                        {[row.product_code, row.category_name ?? "ไม่มีหมวด"].filter(Boolean).join(" · ")}
                    </span>
                </div>
            ),
        },
        {
            key: "product_price",
            mobile: "trailing",
            header: "ราคาตั้งต้น",
            className: "text-right tabular-nums whitespace-nowrap",
            render: (_, row) => <span className="text-gray-900">{priceText(row)}</span>,
        },
    ];

    const isPercent = form.product_price_mode === "percent";
    const pricePreview = isPercent
        ? form.product_percent.trim() && !Number.isNaN(Number(form.product_percent))
            ? priceText({
                  product_price_mode: "percent",
                  product_percent: form.product_percent,
                  product_price: "0",
                  product_unit: null,
              })
            : null
        : form.product_price.trim() && !Number.isNaN(Number(form.product_price))
          ? priceText({
                product_price_mode: "fixed",
                product_percent: null,
                product_price: form.product_price,
                product_unit: form.product_unit.trim() || null,
            })
          : null;

    return (
        <div className="grid gap-4">
            <div className="grid gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <label className="relative min-w-0 flex-[1_1_16rem]">
                        <span className="sr-only">ค้นหาสินค้า</span>
                        <Search
                            size={16}
                            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400"
                            aria-hidden="true"
                        />
                        <input
                            type="search"
                            value={searchText}
                            onChange={(event) => setSearchText(event.target.value)}
                            placeholder="ค้นหาชื่อ รหัส หรือรายละเอียด"
                            className={`${inputClass()} pl-10`}
                        />
                    </label>
                    <label className="flex min-w-0 flex-[1_1_12rem] items-center gap-2 text-sm text-gray-600 sm:flex-none">
                        <span className="shrink-0">แสดง</span>
                        <select
                            value={showFilter}
                            onChange={(event) => changeFilter(() => setShowFilter(event.target.value as ShowFilter))}
                            className={`${inputClass()} sm:w-48`}
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
                            เพิ่มสินค้า/บริการ
                        </button>
                    )}
                </div>
                <CategoryChips
                    categories={categories}
                    value={categoryFilter}
                    withNone
                    onChange={(categoryId) => changeFilter(() => setCategoryFilter(categoryId))}
                />
            </div>

            <DataTable
                columns={columns}
                data={products}
                rowKey="product_id"
                loading={isLoading}
                total={total}
                page={page}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => changeFilter(() => setPageSize(size))}
                emptyMessage={
                    search || categoryFilter || showFilter !== "all"
                        ? "ไม่พบรายการตามที่ค้นหรือกรอง"
                        : canEdit
                          ? 'ยังไม่มีสินค้า/บริการ กด "เพิ่มสินค้า/บริการ" ด้านบน'
                          : "ยังไม่มีสินค้า/บริการ"
                }
                actions={
                    canEdit
                        ? (row) => (
                              <div className="flex items-center justify-end gap-1">
                                  <EditButton onClick={() => openEdit(row)} />
                                  <button
                                      type="button"
                                      aria-label={`ลบ ${row.product_name}`}
                                      className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                                      onClick={() => setDeleteTarget(row)}
                                  >
                                      <Trash2 size={16} />
                                  </button>
                              </div>
                          )
                        : undefined
                }
            />

            {editor.isOpen && (
                <EditorDrawer
                    title={editingProduct ? `แก้ไข ${editingProduct.product_name}` : "เพิ่มสินค้า/บริการ"}
                    subtitle={
                        editingProduct
                            ? "แก้แล้วใบเสนอราคาเดิมไม่เปลี่ยน (เอกสารเก็บสำเนาไว้เอง)"
                            : "กรอก 3 ส่วนแล้วกดบันทึก"
                    }
                    isDirty={isDirty}
                    onClose={editor.close}
                    onSubmit={handleSubmit}
                    footer={
                        <DrawerButtons
                            summary={pricePreview && <span className="tabular-nums">ราคา {pricePreview}</span>}
                            isSaving={editor.isSaving}
                            submitLabel="บันทึกสินค้า"
                            onCancel={() => confirmDiscard(isDirty) && editor.close()}
                        />
                    }
                >
                    <DrawerSection
                        number={1}
                        title="ข้อมูลที่พิมพ์บนเอกสาร"
                        description="ชื่อและรายละเอียดติดไปกับรายการในใบเสนอราคา แก้ในแต่ละใบได้"
                    >
                        <FormField
                            label="ชื่อสินค้า/บริการ"
                            htmlFor="product_name"
                            required
                            hint={messages.name}
                            error={fieldErrors.product_name}
                        >
                            {textInput("product_name", undefined, "เช่น ออกแบบเว็บไซต์")}
                        </FormField>
                        <FormField
                            label="รายละเอียด"
                            htmlFor="product_description"
                            hint={messages.description}
                            error={fieldErrors.product_description}
                        >
                            <textarea
                                id="product_description"
                                rows={3}
                                value={form.product_description}
                                onChange={(event) => editor.updateField("product_description", event.target.value)}
                                aria-describedby="product_description-hint"
                                className={inputClass(Boolean(fieldErrors.product_description))}
                            />
                        </FormField>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                label="รหัสสินค้า"
                                htmlFor="product_code"
                                hint={messages.code}
                                error={fieldErrors.product_code}
                            >
                                {textInput("product_code", undefined, "เช่น WEB-01")}
                            </FormField>
                            <FormField
                                label="หมวด"
                                htmlFor="product_category_id"
                                hint={messages.category}
                                error={fieldErrors.product_category_id}
                            >
                                <CategorySelect
                                    id="product_category_id"
                                    value={form.product_category_id}
                                    onChange={(categoryId) => editor.updateField("product_category_id", categoryId)}
                                    categories={categories}
                                    savedCategoryId={editingProduct?.product_category_id}
                                    hasError={Boolean(fieldErrors.product_category_id)}
                                />
                            </FormField>
                        </div>
                    </DrawerSection>

                    <DrawerSection
                        number={2}
                        title="ราคา"
                        description="ราคาตั้งต้นเป็นบาท ก่อน VAT · ในใบเสนอราคาแก้ได้ทุกใบ"
                    >
                        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="วิธีคิดราคา">
                            <PriceModeCard
                                icon={Tag}
                                title="ราคาตายตัว"
                                description="บาทต่อหน่วย เช่น 1,500 บาท / หน้า"
                                isSelected={!isPercent}
                                onSelect={() => editor.updateField("product_price_mode", "fixed")}
                            />
                            <PriceModeCard
                                icon={Percent}
                                title="% ของยอดรายการอื่น"
                                description="เช่น งานด่วน +30% · เลือกได้ครั้งเดียว ใส่ในชุดไม่ได้"
                                isSelected={isPercent}
                                onSelect={() => editor.updateField("product_price_mode", "percent")}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            {isPercent ? (
                                <FormField
                                    label="อัตรา %"
                                    htmlFor="product_percent"
                                    required
                                    hint="เช่น 30 = เพิ่ม 30% ของยอดรายการอื่นก่อน VAT"
                                    error={fieldErrors.product_percent}
                                >
                                    {textInput("product_percent", "decimal", "30")}
                                </FormField>
                            ) : (
                                <FormField
                                    label="ราคาตั้งต้น (บาท)"
                                    htmlFor="product_price"
                                    required
                                    hint={messages.price}
                                    error={fieldErrors.product_price}
                                >
                                    {textInput("product_price", "decimal", "0.00")}
                                </FormField>
                            )}
                            <FormField
                                label="หน่วย"
                                htmlFor="product_unit"
                                hint={messages.unit}
                                error={fieldErrors.product_unit}
                            >
                                {textInput("product_unit", undefined, "งาน")}
                            </FormField>
                        </div>
                    </DrawerSection>

                    <DrawerSection number={3} title="การใช้งานและหน้าร้าน">
                        <Switch
                            id="product_status"
                            label="ใช้งาน"
                            description={
                                form.product_status === "active"
                                    ? "เลือกใส่ใบเสนอราคาและชุดรายการได้"
                                    : messages.inactive
                            }
                            checked={form.product_status === "active"}
                            onChange={(checked) =>
                                editor.updateField("product_status", checked ? "active" : "inactive")
                            }
                        />
                        <Switch
                            id="product_is_public"
                            label="แสดงบนหน้าร้าน (ลิงก์เลือกบริการ)"
                            description={messages.isPublic}
                            checked={form.product_is_public}
                            onChange={(checked) => editor.updateField("product_is_public", checked)}
                        />
                        {form.product_is_public && (
                            <div className="rounded-xl bg-gray-50 p-3">
                                <CatalogImageField
                                    basePath={editingProduct ? `/products/${editingProduct.product_id}` : null}
                                    imageUrl={editingProduct?.product_image_url ?? null}
                                    onChanged={(imageUrl) => {
                                        setEditingProduct(
                                            (current) => current && { ...current, product_image_url: imageUrl },
                                        );
                                        setReloadCount((count) => count + 1);
                                    }}
                                />
                            </div>
                        )}
                    </DrawerSection>

                    <ItemQuestionsPanel
                        kind="product"
                        itemId={editor.editingId}
                        categoryId={form.product_category_id || null}
                        onOpenQuestions={(target) => confirmDiscard(isDirty) && onOpenQuestions(target)}
                    />
                    <SaveErrorBanner error={editor.saveError} />
                </EditorDrawer>
            )}

            <ConfirmDialog
                open={deleteTarget !== null}
                title="ลบสินค้า/บริการนี้?"
                description={deleteTarget ? `"${deleteTarget.product_name}" จะถูกลบถาวร` : undefined}
                consequences={[messages.deleteNote]}
                confirmLabel="ลบ"
                loading={isDeleting}
                errorMessage={deleteError}
                onConfirm={handleDelete}
                onCancel={closeDeleteDialog}
            />
        </div>
    );
}

function PriceModeCard({
    icon: Icon,
    title,
    description,
    isSelected,
    onSelect,
}: {
    icon: typeof Tag;
    title: string;
    description: string;
    isSelected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={onSelect}
            className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                isSelected
                    ? "border-blue-500 bg-blue-50/60 ring-2 ring-blue-100"
                    : "border-gray-200 bg-white hover:border-blue-300"
            }`}
        >
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}
            >
                <Icon size={17} aria-hidden="true" />
            </span>
            <span className="grid gap-0.5">
                <span className="text-sm font-medium text-gray-900">{title}</span>
                <span className="text-xs text-gray-500">{description}</span>
            </span>
        </button>
    );
}
