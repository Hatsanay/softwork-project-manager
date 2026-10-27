"use client";

// แท็บสินค้า/บริการ — ค้นหา กรองตามหมวด/สถานะ เพิ่ม/แก้ในแผงด้านบน ลบผ่านหน้าต่างยืนยัน
import { useEffect, useState } from "react";
import { Package, Plus } from "lucide-react";
import DataTable, { type Column } from "@/components/ui/datatable/datatable";
import EditButton from "@/components/ui/Button/EditButton";
import DeleteButton from "@/components/ui/Button/DeleteButton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard, { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui/section-card";
import SaveErrorBanner from "@/components/ui/save-error-banner";
import { ActiveStatusPill } from "@/components/ui/status-pill";
import { apiFetch } from "@/lib/api";
import { useRecordEditor } from "@/lib/use-record-editor";
import { formatAmount } from "@/lib/shared/money.mjs";
import { productSchema } from "@/lib/shared/schemas/product.mjs";
import { toast } from "sonner";
import { PRODUCT_MESSAGES } from "../_messages";
import type { ActiveStatus, Product, ProductCategory } from "../_types";
import CategorySelect from "./category-select";
import CatalogImageField from "./catalog-image-field";
import Switch from "@/components/ui/switch";
import StatusPill from "@/components/ui/status-pill";
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
type StatusFilter = "all" | ActiveStatus;

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
    const [search, setSearch] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [reloadCount, setReloadCount] = useState(0);

    const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const editor = useRecordEditor<ProductForm>(EMPTY_FORM, async () => setReloadCount((count) => count + 1));
    const { form, fieldErrors } = editor;
    const editingProduct = products.find((product) => product.product_id === editor.editingId) ?? null;

    useEffect(() => {
        let isLeftPage = false;
        const query = new URLSearchParams({
            limit: String(pageSize),
            offset: String((page - 1) * pageSize),
            search,
        });
        if (categoryFilter) query.set("category_id", categoryFilter);
        if (statusFilter !== "all") query.set("status", statusFilter);

        apiFetch<{ data: Product[]; total: number }>(`/products?${query}`).then(({ data }) => {
            if (isLeftPage) return;
            setProducts(data?.data ?? []);
            setTotal(data?.total ?? 0);
            setIsLoading(false);
        });
        return () => {
            isLeftPage = true;
        };
    }, [page, pageSize, search, categoryFilter, statusFilter, reloadCount]);

    function changeFilter(update: () => void) {
        update();
        setPage(1);
    }

    // แผงแก้ไขอยู่เหนือตาราง — เลื่อนขึ้นไปให้เห็นทันที
    function openEdit(product: Product) {
        editor.openEdit(product.product_id, toForm(product));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        await editor.submit({
            createSchema: productSchema,
            updateSchema: productSchema,
            createPath: "/products",
            updatePath: (productId) => `/products/${productId}`,
            // แบบ %: ราคาตั้งต้นไม่ใช้ (ส่ง 0)
            toPayload: (currentForm) => (currentForm.product_price_mode === "percent" ? { ...currentForm, product_price: "0" } : currentForm),
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
    ) {
        return (
            <input
                id={field}
                inputMode={inputMode}
                value={form[field]}
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
            render: (_, row) => (
                <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium text-gray-800">{row.product_name}</span>
                    <span className="text-xs text-gray-500">
                        {[row.product_code, row.category_name ?? "ไม่มีหมวด"].filter(Boolean).join(" · ")}
                    </span>
                </div>
            ),
        },
        { key: "product_unit", header: "หน่วย", render: (value) => (value as string | null) || "-" },
        {
            key: "product_price",
            header: "ราคาตั้งต้น (บาท)",
            className: "text-right tabular-nums",
            render: (value, row) => (row.product_price_mode === "percent" ? `+${Number(row.product_percent)}% ของยอด` : formatAmount(value as string)),
        },
        {
            key: "product_status",
            header: "สถานะ",
            render: (_, row) => (
                <div className="flex flex-wrap gap-1.5">
                    <ActiveStatusPill isActive={row.product_status === "active"} />
                    {Boolean(row.product_is_public) && <StatusPill tone="info">หน้าร้าน</StatusPill>}
                </div>
            ),
        },
    ];

    return (
        <div className="grid gap-5">
            {editor.isOpen && (
                <SectionCard
                    icon={Package}
                    title={editingProduct ? `แก้ไข ${editingProduct.product_name}` : "เพิ่มสินค้า/บริการ"}
                >
                    <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                label="ชื่อสินค้า/บริการ"
                                htmlFor="product_name"
                                required
                                hint={messages.name}
                                error={fieldErrors.product_name}
                            >
                                {textInput("product_name")}
                            </FormField>
                            <FormField
                                label="รหัสสินค้า"
                                htmlFor="product_code"
                                hint={messages.code}
                                error={fieldErrors.product_code}
                            >
                                {textInput("product_code")}
                            </FormField>
                            <FormField
                                label="วิธีคิดราคา"
                                htmlFor="product_price_mode"
                                hint={form.product_price_mode === "percent" ? "คิดเป็น % ของยอดรายการอื่นก่อน VAT เช่น งานด่วน +30% · ลูกค้าเลือกได้ครั้งเดียว · ใส่ในชุดรายการไม่ได้" : undefined}
                                error={fieldErrors.product_price_mode}
                            >
                                <select
                                    id="product_price_mode"
                                    value={form.product_price_mode}
                                    onChange={(event) => editor.updateField("product_price_mode", event.target.value as "fixed" | "percent")}
                                    className={inputClass(Boolean(fieldErrors.product_price_mode))}
                                >
                                    <option value="fixed">ราคาตายตัว (บาท)</option>
                                    <option value="percent">% ของยอดรายการอื่น</option>
                                </select>
                            </FormField>
                            {form.product_price_mode === "percent" ? (
                                <FormField label="อัตรา %" htmlFor="product_percent" required hint="เช่น 30 = เพิ่ม 30% ของยอด" error={fieldErrors.product_percent}>
                                    {textInput("product_percent", "decimal")}
                                </FormField>
                            ) : (
                                <FormField
                                    label="ราคาตั้งต้น (บาท)"
                                    htmlFor="product_price"
                                    required
                                    hint={messages.price}
                                    error={fieldErrors.product_price}
                                >
                                    {textInput("product_price", "decimal")}
                                </FormField>
                            )}
                            <FormField
                                label="หน่วย"
                                htmlFor="product_unit"
                                hint={messages.unit}
                                error={fieldErrors.product_unit}
                            >
                                {textInput("product_unit")}
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
                            <FormField
                                label="สถานะ"
                                htmlFor="product_status"
                                hint={form.product_status === "inactive" ? messages.inactive : undefined}
                                error={fieldErrors.product_status}
                            >
                                <select
                                    id="product_status"
                                    value={form.product_status}
                                    onChange={(event) =>
                                        editor.updateField("product_status", event.target.value as ActiveStatus)
                                    }
                                    className={inputClass(Boolean(fieldErrors.product_status))}
                                >
                                    <option value="active">ใช้งาน</option>
                                    <option value="inactive">ปิดใช้งาน</option>
                                </select>
                            </FormField>
                            <div className="grid gap-3 sm:col-span-2">
                                <Switch
                                    id="product_is_public"
                                    label="แสดงบนหน้าร้าน (ลิงก์เลือกบริการ)"
                                    description={messages.isPublic}
                                    checked={form.product_is_public}
                                    onChange={(checked) => editor.updateField("product_is_public", checked)}
                                />
                                {form.product_is_public && (
                                    <CatalogImageField
                                        basePath={editingProduct ? `/products/${editingProduct.product_id}` : null}
                                        imageUrl={editingProduct?.product_image_url ?? null}
                                        onChanged={() => setReloadCount((count) => count + 1)}
                                    />
                                )}
                            </div>
                            <FormField
                                label="รายละเอียด"
                                htmlFor="product_description"
                                hint={messages.description}
                                error={fieldErrors.product_description}
                                className="sm:col-span-2"
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
                        </div>
                        <ItemQuestionsPanel kind="product" itemId={editor.editingId} categoryId={form.product_category_id || null} onOpenQuestions={onOpenQuestions} />
                        <SaveErrorBanner error={editor.saveError} />
                        <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" className={SECONDARY_BUTTON} onClick={editor.close}>
                                ยกเลิก
                            </button>
                            <button type="submit" className={PRIMARY_BUTTON} disabled={editor.isSaving}>
                                {editor.isSaving ? "กำลังบันทึก..." : "บันทึกสินค้า"}
                            </button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                    <label className="grid gap-1 text-sm text-gray-600">
                        หมวด
                        <select
                            value={categoryFilter}
                            onChange={(event) => changeFilter(() => setCategoryFilter(event.target.value))}
                            className={`${inputClass()} sm:w-56`}
                        >
                            <option value="">ทุกหมวด</option>
                            <option value="none">ไม่มีหมวด</option>
                            {categories.map((category) => (
                                <option key={category.pc_id} value={category.pc_id}>
                                    {category.pc_name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="grid gap-1 text-sm text-gray-600">
                        สถานะ
                        <select
                            value={statusFilter}
                            onChange={(event) =>
                                changeFilter(() => setStatusFilter(event.target.value as StatusFilter))
                            }
                            className={`${inputClass()} sm:w-40`}
                        >
                            <option value="all">ทั้งหมด</option>
                            <option value="active">ใช้งาน</option>
                            <option value="inactive">ปิดใช้งาน</option>
                        </select>
                    </label>
                </div>
                {canEdit && !editor.isOpen && (
                    <button type="button" className={PRIMARY_BUTTON} onClick={editor.openCreate}>
                        <Plus size={16} />
                        เพิ่มสินค้า/บริการ
                    </button>
                )}
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
                searchable
                searchPlaceholder="ค้นหาชื่อ รหัส หรือรายละเอียด..."
                searchValue={search}
                onSearch={(value) => changeFilter(() => setSearch(value))}
                emptyMessage={
                    canEdit ? 'ยังไม่มีสินค้า/บริการ — กด "เพิ่มสินค้า/บริการ" ด้านบน' : "ยังไม่มีสินค้า/บริการ"
                }
                actions={
                    canEdit
                        ? (row) => (
                              <div className="flex items-center justify-end gap-2">
                                  <EditButton onClick={() => openEdit(row)} />
                                  <DeleteButton onClick={() => setDeleteTarget(row)} />
                              </div>
                          )
                        : undefined
                }
            />

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
