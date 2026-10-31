"use client";

// เลือกสินค้า/ชุดรายการ → สร้างงานพร้อมโปรเจกต์ (2026-10-31 · docs/plans/2026-10-31-project-tasks-from-catalog.md)
// ใช้ในหน้าสร้างโปรเจกต์และหน้ารับงาน Fastwork · แสดงงานที่จะสร้างให้เห็นก่อนกดบันทึก (ดูอย่างเดียว แก้ทีหลังในหน้าโปรเจกต์)
// รายการสินค้าจาก /projects/task-catalog: เปิดใช้งานทุกตัว ไม่มีราคา ไม่มีสินค้าแบบ %
import { useEffect, useState } from "react";
import { Minus, Package, Plus, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import { apiFetch } from "@/lib/api";
import {
    countTasks,
    tasksFromSources,
    type AddedTask,
    type CatalogSelection,
    type TaskSource,
} from "@/lib/catalog-tasks";

export type TaskCatalog = {
    products: { product_id: string; product_name: string; product_unit: string | null }[];
    packages: { pkg_id: string; pkg_name: string; items: { name: string; quantity: string; unit: string | null }[] }[];
};

const MAX_QUANTITY = 99;

/** โหลดรายการสินค้าครั้งเดียวตอนเปิดหน้า · isEnabled = false (เช่น รับงานจากคำขอ) ไม่โหลด */
export function useTaskCatalog(isEnabled: boolean) {
    const [catalog, setCatalog] = useState<TaskCatalog | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    useEffect(() => {
        if (!isEnabled) return;
        let isLeftPage = false;
        apiFetch<TaskCatalog>("/projects/task-catalog").then(({ data, error }) => {
            if (isLeftPage) return;
            if (error) setLoadError(error.message);
            else setCatalog(data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [isEnabled]);
    return { catalog, loadError };
}

function sourceOf(row: CatalogSelection, catalog: TaskCatalog): TaskSource | null {
    const [kind, id] = row.key.split(":");
    if (kind === "p") {
        const product = catalog.products.find((item) => item.product_id === id);
        return product ? { kind: "product", name: product.product_name, quantity: row.quantity } : null;
    }
    const productPackage = catalog.packages.find((item) => item.pkg_id === id);
    return productPackage
        ? { kind: "package", name: productPackage.pkg_name, quantity: row.quantity, items: productPackage.items }
        : null;
}

/** ตัวที่เลือก → งาน · ตัวที่ไม่อยู่ในรายการแล้ว (ปิดใช้งาน/ลบ) ข้ามไป */
export function tasksFromSelection(selection: CatalogSelection[], catalog: TaskCatalog | null): AddedTask[] {
    if (!catalog) return [];
    const sources = selection
        .map((row) => sourceOf(row, catalog))
        .filter((source): source is TaskSource => source !== null);
    return tasksFromSources(sources);
}

export default function CatalogTaskPicker({
    id,
    catalog,
    loadError,
    selection,
    onChange,
}: {
    id: string;
    catalog: TaskCatalog | null;
    loadError: string | null;
    selection: CatalogSelection[];
    onChange: (selection: CatalogSelection[]) => void;
}) {
    const chosenKeys = new Set(selection.map((row) => row.key));
    const tasks = tasksFromSelection(selection, catalog);
    const { mainCount, subCount } = countTasks(tasks);
    const visibleRows = catalog ? selection.filter((row) => sourceOf(row, catalog) !== null) : [];
    const missingCount = catalog ? selection.length - visibleRows.length : 0;
    const isEmptyCatalog = catalog !== null && catalog.products.length === 0 && catalog.packages.length === 0;

    function add(key: string) {
        if (!key || chosenKeys.has(key)) return;
        onChange([...selection, { key, quantity: 1 }]);
    }

    function setQuantity(key: string, quantity: number) {
        const bounded = Math.min(Math.max(quantity, 1), MAX_QUANTITY);
        onChange(selection.map((row) => (row.key === key ? { ...row, quantity: bounded } : row)));
    }

    return (
        <div className="grid gap-3">
            <label htmlFor={id} className="text-sm text-gray-800">
                เพิ่มสินค้าหรือชุดรายการ
            </label>
            <select
                id={id}
                value=""
                disabled={catalog === null || isEmptyCatalog}
                onChange={(event) => add(event.target.value)}
                className={inputClass(false)}
            >
                <option value="">{catalog === null ? "กำลังโหลด..." : "เลือกเพื่อเพิ่ม"}</option>
                {catalog && catalog.packages.length > 0 && (
                    <optgroup label="ชุดรายการ (เป็นงานหลัก + งานย่อย)">
                        {catalog.packages.map((productPackage) => (
                            <option
                                key={productPackage.pkg_id}
                                value={`k:${productPackage.pkg_id}`}
                                disabled={chosenKeys.has(`k:${productPackage.pkg_id}`)}
                            >
                                {productPackage.pkg_name} ({productPackage.items.length} รายการ)
                            </option>
                        ))}
                    </optgroup>
                )}
                {catalog && catalog.products.length > 0 && (
                    <optgroup label="สินค้า (เป็นงานหลัก)">
                        {catalog.products.map((product) => (
                            <option
                                key={product.product_id}
                                value={`p:${product.product_id}`}
                                disabled={chosenKeys.has(`p:${product.product_id}`)}
                            >
                                {product.product_name}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
            {loadError && <FieldHint error={`โหลดรายการสินค้าไม่สำเร็จ: ${loadError}`} />}
            {isEmptyCatalog && <FieldHint>ยังไม่มีสินค้าที่เปิดใช้งาน · เพิ่มได้ที่หน้าสินค้าและบริการ</FieldHint>}
            {missingCount > 0 && (
                <FieldHint>บางรายการที่ส่งมาปิดใช้งานแล้ว ไม่ได้เพิ่ม ({missingCount} รายการ)</FieldHint>
            )}

            {visibleRows.length > 0 && catalog && (
                <ul className="grid gap-2">
                    {visibleRows.map((row) => {
                        const source = sourceOf(row, catalog) as TaskSource;
                        return (
                            <li
                                key={row.key}
                                className="flex flex-wrap items-center gap-x-2 rounded-xl border border-gray-200 py-1 pr-1 pl-3"
                            >
                                <span className="flex min-w-0 basis-full items-center gap-2 pt-1.5 text-sm text-gray-800 sm:flex-1 sm:basis-0 sm:pt-0">
                                    {source.kind === "package" && (
                                        <Package size={15} className="shrink-0 text-blue-600" aria-hidden="true" />
                                    )}
                                    <span className="min-w-0 wrap-break-word">
                                        {source.name}
                                        <span className="ml-1.5 text-xs text-gray-500">
                                            {source.kind === "package"
                                                ? `ชุด · ${source.items.length} รายการ`
                                                : "สินค้า"}
                                        </span>
                                    </span>
                                </span>
                                <span className="ml-auto flex shrink-0 items-center">
                                    <button
                                        type="button"
                                        aria-label={`ลดจำนวน ${source.name}`}
                                        disabled={row.quantity <= 1}
                                        onClick={() => setQuantity(row.key, row.quantity - 1)}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <Minus size={15} />
                                    </button>
                                    <span className="w-7 text-center text-sm tabular-nums" aria-live="polite">
                                        {row.quantity}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`เพิ่มจำนวน ${source.name}`}
                                        disabled={row.quantity >= MAX_QUANTITY}
                                        onClick={() => setQuantity(row.key, row.quantity + 1)}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-40"
                                    >
                                        <Plus size={15} />
                                    </button>
                                    <button
                                        type="button"
                                        aria-label={`เอา ${source.name} ออก`}
                                        onClick={() => onChange(selection.filter((item) => item.key !== row.key))}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-red-600"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {tasks.length > 0 && (
                <div className="grid gap-2 rounded-xl bg-gray-50 p-3">
                    <p className="text-sm text-gray-800">
                        งานที่จะสร้าง:{" "}
                        <span className="font-medium tabular-nums">
                            งานหลัก {mainCount}
                            {subCount > 0 ? ` · งานย่อย ${subCount}` : ""}
                        </span>
                    </p>
                    <TaskTree tasks={tasks} />
                    <p className="text-xs text-gray-500">
                        สร้างตอนกดบันทึก · แก้ชื่อ ลบ หรือมอบหมายคนต่อได้ในหน้าโปรเจกต์
                    </p>
                </div>
            )}
        </div>
    );
}

// งานหลักกับงานย่อยที่อยู่ใต้ (ย่อหน้าระดับเดียว)
function TaskTree({ tasks }: { tasks: AddedTask[] }) {
    const groups: { title: string; subtasks: string[] }[] = [];
    let hasHeading = false;
    for (const task of tasks) {
        if (task.type === "heading") {
            hasHeading = true;
            groups.push({ title: task.description, subtasks: [] });
        } else if (hasHeading) {
            groups[groups.length - 1].subtasks.push(task.description);
        } else {
            groups.push({ title: task.description, subtasks: [] });
        }
    }
    return (
        <ul className="grid gap-1.5 text-sm">
            {groups.map((group, index) => (
                <li key={index} className="grid gap-1">
                    <span className="wrap-break-word font-medium text-gray-900">{group.title}</span>
                    {group.subtasks.length > 0 && (
                        <ul className="grid gap-0.5 border-l border-gray-200 pl-3">
                            {group.subtasks.map((subtask, subIndex) => (
                                <li key={subIndex} className="wrap-break-word text-gray-600">
                                    {subtask}
                                </li>
                            ))}
                        </ul>
                    )}
                </li>
            ))}
        </ul>
    );
}
