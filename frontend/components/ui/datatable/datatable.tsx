"use client";

// ตารางกลางของระบบ (UI ใหม่ 13 ต.ค. 2026 — docs/plans/2026-10-13-ui-refresh.md)
// วิธีเรียกใช้เหมือนเดิมทุกอย่าง (props เดิม) — เปลี่ยนแค่หน้าตา + จอแคบกว่า 640px แสดงเป็นการ์ดทีละแถว (ไม่ต้องเลื่อนแนวนอน)
// การ์ดบนมือถือ: คอลัมน์แรก = หัวการ์ด, คอลัมน์ที่เหลือ = ชื่อคอลัมน์ : ค่า, ปุ่มจัดการอยู่ท้ายการ์ด
// การ์ดกะทัดรัด (2026-10-30 · docs/plans/2026-10-30-quote-pdf-mobile-refactor.md B3): คอลัมน์ที่ตั้ง mobile จัดที่ตามนั้น
//   title = ใช้เป็นหัวการ์ดแทนคอลัมน์แรก (คอลัมน์แรกเป็นรหัส/เวลา) · trailing = ชิดขวาข้างหัวการ์ด (เช่น ยอดเงิน) · meta = บรรทัดเล็กใต้หัว วางเรียงกัน · badge = แถวป้าย + ปุ่มจัดการ · hidden = ไม่แสดง
//   คอลัมน์ที่ไม่ตั้ง = แบบเดิม (ชื่อคอลัมน์ : ค่า)
import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import Skeleton from "@/components/ui/skeleton";

export type Column<T> = {
    key: keyof T & string;
    header: string;
    sortable?: boolean;
    className?: string;
    render?: (value: T[keyof T & string], row: T) => React.ReactNode;
    // ที่อยู่บนการ์ดมือถือ (ไม่ตั้ง = แถว "ชื่อคอลัมน์ : ค่า" แบบเดิม)
    mobile?: "title" | "trailing" | "meta" | "badge" | "hidden";
    // คำนำหน้าค่าในบรรทัด meta เช่น "ครบ" → "ครบ 12 ต.ค. 2569" (ค่าที่อ่านแล้วไม่รู้ว่าคืออะไร)
    mobileLabel?: string;
};

type SortDir = "asc" | "desc" | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const SKELETON_ROWS = 5;
// คอลัมน์ปุ่ม (ดู/แก้ไข/ลบ) ติดขอบขวาเสมอ — ตารางที่กว้างเกินการ์ดจะเลื่อนซ้ายขวาได้โดยปุ่มไม่หลุดจอ
// พื้นหลังต้องทึบ (ใช้ color-mix แทนสีโปร่ง) ไม่งั้นข้อความที่เลื่อนลอดใต้ปุ่มจะซ้อนกันอ่านไม่ออก
const STICKY_ACTIONS_CLASS = "sticky right-0 z-[1] shadow-[-10px_0_10px_-10px_rgb(17_24_39/0.12)]";

type Props<T extends Record<string, unknown>> = {
    columns: Column<T>[];
    data: T[];
    rowKey?: keyof T & string;
    pageSize?: number;
    pageSizeOptions?: number[];
    searchable?: boolean;
    searchPlaceholder?: string;
    emptyMessage?: string;
    selectable?: boolean;
    onSelectionChange?: (rows: T[]) => void;
    actions?: (row: T) => React.ReactNode;
    // server-side props
    loading?: boolean;
    total?: number;
    page?: number;
    onPageChange?: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
    searchValue?: string;
    onSearch?: (search: string) => void;
};

export default function DataTable<T extends Record<string, unknown>>({
    columns = [],
    data = [],
    rowKey,
    pageSize: initialPageSize = 10,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    searchable = false,
    searchPlaceholder = "ค้นหา...",
    emptyMessage = "ยังไม่มีข้อมูล",
    selectable = false,
    onSelectionChange,
    actions,
    loading = false,
    total,
    page: controlledPage,
    onPageChange,
    onPageSizeChange,
    searchValue,
    onSearch,
}: Props<T>) {
    const isServerSide = onPageChange !== undefined;

    const [internalSearch, setInternalSearch] = useState("");
    const [sortKey, setSortKey] = useState<string | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>(null);
    const [internalPage, setInternalPage] = useState(1);
    const [selected, setSelected] = useState<Set<unknown>>(new Set());
    const [pageSize, setPageSize] = useState(initialPageSize);

    const search = isServerSide ? (searchValue ?? "") : internalSearch;
    const currentPage = isServerSide ? (controlledPage ?? 1) : internalPage;
    const totalRows = isServerSide ? (total ?? 0) : undefined;

    const getRowId = (row: T, index: number): unknown => (rowKey ? row[rowKey] : index);

    const filtered = useMemo(() => {
        if (isServerSide || !search.trim()) return data;
        const q = search.toLowerCase();
        return data.filter((row) =>
            columns.some((col) =>
                String(row[col.key] ?? "")
                    .toLowerCase()
                    .includes(q),
            ),
        );
    }, [data, search, columns, isServerSide]);

    const sorted = useMemo(() => {
        if (!sortKey || !sortDir) return filtered;
        return [...filtered].sort((a, b) => {
            const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true });
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    const rowCount = totalRows ?? sorted.length;
    const showAll = pageSize === -1;
    const totalPages = showAll ? 1 : Math.max(1, Math.ceil(rowCount / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const paged = isServerSide ? data : showAll ? sorted : sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

    const pageNumbers = useMemo(() => {
        const pages: (number | "...")[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (safePage > 3) pages.push("...");
            for (let i = Math.max(2, safePage - 1); i <= Math.min(totalPages - 1, safePage + 1); i++) pages.push(i);
            if (safePage < totalPages - 2) pages.push("...");
            pages.push(totalPages);
        }
        return pages;
    }, [totalPages, safePage]);

    function handleSort(key: string) {
        if (sortKey !== key) {
            setSortKey(key);
            setSortDir("asc");
        } else if (sortDir === "asc") {
            setSortDir("desc");
        } else {
            setSortKey(null);
            setSortDir(null);
        }
        if (!isServerSide) setInternalPage(1);
    }

    function handleSearch(val: string) {
        if (isServerSide) {
            onSearch?.(val);
        } else {
            setInternalSearch(val);
            setInternalPage(1);
        }
    }

    function goToPage(p: number) {
        if (isServerSide) onPageChange?.(p);
        else setInternalPage(p);
    }

    function handlePageSizeChange(size: number) {
        setPageSize(size);
        goToPage(1);
        onPageSizeChange?.(size);
    }

    function toggleRow(id: unknown) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            onSelectionChange?.(data.filter((r, i) => next.has(getRowId(r, i))));
            return next;
        });
    }

    function toggleAll() {
        const allIds = paged.map((r, i) => getRowId(r, (safePage - 1) * pageSize + i));
        const allSelected = allIds.every((id) => selected.has(id));
        const next = new Set(selected);
        if (allSelected) allIds.forEach((id) => next.delete(id));
        else allIds.forEach((id) => next.add(id));
        setSelected(next);
        onSelectionChange?.(data.filter((r, i) => next.has(getRowId(r, i))));
    }

    const allPageSelected =
        paged.length > 0 && paged.every((r, i) => selected.has(getRowId(r, (safePage - 1) * pageSize + i)));

    function SortIcon({ col }: { col: Column<T> }) {
        if (!col.sortable) return null;
        if (sortKey !== col.key) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />;
        if (sortDir === "asc") return <ChevronUp className="h-3.5 w-3.5 text-blue-600" />;
        return <ChevronDown className="h-3.5 w-3.5 text-blue-600" />;
    }

    function renderCell(col: Column<T>, row: T) {
        return col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "");
    }

    const from = rowCount === 0 ? 0 : showAll ? 1 : (safePage - 1) * pageSize + 1;
    const to = showAll ? rowCount : Math.min(safePage * pageSize, rowCount);
    const columnCount = columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0);
    const isEmpty = !loading && paged.length === 0;
    const titleColumn = columns.find((col) => col.mobile === "title") ?? columns[0];
    const otherColumns = columns.filter((col) => col !== titleColumn);
    const columnsAt = (place: Column<T>["mobile"]) => otherColumns.filter((col) => col.mobile === place);
    const trailingColumns = columnsAt("trailing");
    const metaColumns = columnsAt("meta");
    const badgeColumns = columnsAt("badge");
    const detailColumns = otherColumns.filter((col) => !col.mobile);
    const isCompactCard = otherColumns.some((col) => col.mobile);

    return (
        <div className="flex w-full min-w-0 flex-col gap-3">
            {searchable && (
                <div className="relative w-full sm:w-80">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder}
                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-light shadow-xs transition placeholder:text-gray-400 hover:border-gray-300 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
                    />
                </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
                {/* ตาราง — จอ 640px ขึ้นไป */}
                <div className="hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                        <thead>
                            <tr>
                                {selectable && (
                                    <th className="w-10 border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 text-center">
                                        <input
                                            type="checkbox"
                                            checked={allPageSelected}
                                            onChange={toggleAll}
                                            aria-label="เลือกทั้งหน้า"
                                            className="cursor-pointer rounded border-gray-300 accent-blue-500"
                                        />
                                    </th>
                                )}
                                {columns.map((col) => (
                                    <th
                                        key={col.key}
                                        onClick={() => col.sortable && handleSort(col.key)}
                                        className={[
                                            "select-none whitespace-nowrap border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 text-left text-xs font-normal tracking-wide text-gray-500",
                                            col.sortable ? "cursor-pointer transition-colors hover:text-gray-800" : "",
                                            col.className ?? "",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {col.header}
                                            <SortIcon col={col} />
                                        </div>
                                    </th>
                                ))}
                                {actions && (
                                    <th className={`border-b border-gray-100 px-4 py-2.5 ${STICKY_ACTIONS_CLASS} bg-[color-mix(in_oklab,var(--color-gray-50)_70%,white)]`}>
                                        <span className="sr-only">จัดการ</span>
                                    </th>
                                )}
                            </tr>
                        </thead>

                        <tbody>
                            {loading &&
                                Array.from({ length: SKELETON_ROWS }, (_, index) => (
                                    <tr key={`loading-${index}`}>
                                        <td colSpan={columnCount} className="border-b border-gray-100 px-4 py-4">
                                            <Skeleton className="h-4 w-full" />
                                        </td>
                                    </tr>
                                ))}
                            {isEmpty && (
                                <tr>
                                    <td colSpan={columnCount} className="px-4 py-14">
                                        <EmptyRows message={emptyMessage} />
                                    </td>
                                </tr>
                            )}
                            {!loading &&
                                paged.map((row, i) => {
                                    const id = getRowId(row, (safePage - 1) * pageSize + i);
                                    const isSelected = selected.has(id);
                                    return (
                                        <tr
                                            key={String(id)}
                                            className={`group transition-colors ${isSelected ? "bg-blue-50" : "hover:bg-blue-50/40"}`}
                                        >
                                            {selectable && (
                                                <td className="w-10 border-b border-gray-100 px-4 py-3.5 text-center">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleRow(id)}
                                                        aria-label="เลือกแถวนี้"
                                                        className="cursor-pointer rounded border-gray-300 accent-blue-500"
                                                    />
                                                </td>
                                            )}
                                            {columns.map((col) => (
                                                <td
                                                    key={col.key}
                                                    className={`border-b border-gray-100 px-4 py-3.5 text-gray-700 ${col.className ?? ""}`}
                                                >
                                                    {renderCell(col, row)}
                                                </td>
                                            ))}
                                            {actions && (
                                                <td
                                                    className={`border-b border-gray-100 px-4 py-3.5 text-right transition-colors ${STICKY_ACTIONS_CLASS} ${
                                                        isSelected
                                                            ? "bg-blue-50"
                                                            : "bg-white group-hover:bg-[color-mix(in_oklab,var(--color-blue-50)_40%,white)]"
                                                    }`}
                                                >
                                                    <div className="flex justify-end">{actions(row)}</div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>

                {/* การ์ดทีละแถว — จอแคบกว่า 640px */}
                <div className="divide-y divide-gray-100 sm:hidden">
                    {loading &&
                        Array.from({ length: SKELETON_ROWS }, (_, index) => (
                            <div key={`loading-card-${index}`} className="grid gap-2 px-4 py-4">
                                <Skeleton className="h-4 w-2/3" />
                                <Skeleton className="h-3 w-1/2" />
                            </div>
                        ))}
                    {isEmpty && (
                        <div className="px-4 py-12">
                            <EmptyRows message={emptyMessage} />
                        </div>
                    )}
                    {!loading &&
                        titleColumn &&
                        paged.map((row, i) => {
                            const id = getRowId(row, (safePage - 1) * pageSize + i);
                            const isSelected = selected.has(id);
                            return (
                                <div
                                    key={String(id)}
                                    className={`grid ${isCompactCard ? "gap-2 py-3" : "gap-3 py-4"} px-4 ${isSelected ? "bg-blue-50" : ""}`}
                                >
                                    <div className="flex items-start gap-3">
                                        {selectable && (
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleRow(id)}
                                                aria-label="เลือกแถวนี้"
                                                className="mt-1 cursor-pointer rounded border-gray-300 accent-blue-500"
                                            />
                                        )}
                                        <div className="min-w-0 flex-1 font-normal text-gray-900">
                                            {renderCell(titleColumn, row)}
                                        </div>
                                        {trailingColumns.length > 0 && (
                                            <div className="grid shrink-0 justify-items-end gap-0.5 text-right text-sm text-gray-900 tabular-nums">
                                                {trailingColumns.map((col) => (
                                                    <div key={col.key}>{renderCell(col, row)}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {metaColumns.length > 0 && (
                                        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-xs text-gray-500">
                                            {metaColumns.map((col) => (
                                                <div key={col.key} className="min-w-0">
                                                    {col.mobileLabel && `${col.mobileLabel} `}
                                                    {renderCell(col, row)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {detailColumns.length > 0 && (
                                        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                                            {detailColumns.map((col) => (
                                                <div key={col.key} className="contents">
                                                    <dt className="text-gray-400">{col.header}</dt>
                                                    <dd className="min-w-0 text-gray-700">{renderCell(col, row)}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    )}
                                    {isCompactCard && (badgeColumns.length > 0 || actions) ? (
                                        <div className="flex flex-wrap items-center gap-2">
                                            {badgeColumns.map((col) => (
                                                <div key={col.key} className="min-w-0">
                                                    {renderCell(col, row)}
                                                </div>
                                            ))}
                                            {actions && <div className="ml-auto flex flex-wrap justify-end gap-2">{actions(row)}</div>}
                                        </div>
                                    ) : (
                                        actions && <div className="flex flex-wrap gap-2">{actions(row)}</div>
                                    )}
                                </div>
                            );
                        })}
                </div>

                <div className="flex flex-col gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="tabular-nums">
                            {rowCount === 0 ? "ไม่มีรายการ" : `แสดง ${from}–${to} จาก ${rowCount} รายการ`}
                        </span>
                        <label className="flex items-center gap-1.5">
                            <span>แถวละ</span>
                            <select
                                value={pageSize === -1 ? -1 : pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                className="cursor-pointer rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 transition focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/15"
                            >
                                {pageSizeOptions.map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                                <option value={-1}>ทั้งหมด</option>
                            </select>
                        </label>
                    </div>
                    <nav className="flex flex-wrap items-center gap-1" aria-label="เลือกหน้า">
                        <button
                            type="button"
                            onClick={() => goToPage(Math.max(1, safePage - 1))}
                            disabled={safePage === 1}
                            aria-label="หน้าก่อนหน้า"
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 sm:h-8 sm:w-8 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        {pageNumbers.map((p, i) =>
                            p === "..." ? (
                                <span key={`gap-${i}`} className="w-8 text-center text-sm text-gray-400">
                                    …
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    key={p}
                                    onClick={() => goToPage(p)}
                                    aria-current={safePage === p ? "page" : undefined}
                                    className={[
                                        "h-10 min-w-10 rounded-lg px-2 text-sm tabular-nums transition sm:h-8 sm:min-w-8",
                                        safePage === p
                                            ? "border border-gray-200 bg-white font-medium text-gray-900 shadow-xs"
                                            : "text-gray-500 hover:bg-gray-100 hover:text-gray-800",
                                    ].join(" ")}
                                >
                                    {p}
                                </button>
                            ),
                        )}
                        <button
                            type="button"
                            onClick={() => goToPage(Math.min(totalPages, safePage + 1))}
                            disabled={safePage === totalPages}
                            aria-label="หน้าถัดไป"
                            className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 sm:h-8 sm:w-8 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    );
}

function EmptyRows({ message }: { message: string }) {
    return (
        <div className="grid justify-items-center gap-2 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gray-50 text-gray-400">
                <Inbox size={18} />
            </span>
            <p className="text-sm text-gray-500">{message}</p>
        </div>
    );
}
