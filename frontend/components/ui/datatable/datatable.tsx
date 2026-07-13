"use client";

import { useState, useMemo } from "react";
import {
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Search,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";

export type Column<T> = {
    key: keyof T & string;
    header: string;
    sortable?: boolean;
    className?: string;
    render?: (value: T[keyof T & string], row: T) => React.ReactNode;
};

type SortDir = "asc" | "desc" | null;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

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
    searchPlaceholder = "Search...",
    emptyMessage = "No data found",
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
    const [sortKey, setSortKey]   = useState<string | null>(null);
    const [sortDir, setSortDir]   = useState<SortDir>(null);
    const [internalPage, setInternalPage] = useState(1);
    const [selected, setSelected] = useState<Set<unknown>>(new Set());
    const [pageSize, setPageSize] = useState(initialPageSize);

    const search      = isServerSide ? (searchValue ?? "") : internalSearch;
    const currentPage = isServerSide ? (controlledPage ?? 1) : internalPage;
    const totalRows   = isServerSide ? (total ?? 0) : undefined;

    const getRowId = (row: T, index: number): unknown =>
        rowKey ? row[rowKey] : index;

    const filtered = useMemo(() => {
        if (isServerSide || !search.trim()) return data;
        const q = search.toLowerCase();
        return data.filter((row) =>
            columns.some((col) => String(row[col.key] ?? "").toLowerCase().includes(q))
        );
    }, [data, search, columns, isServerSide]);

    const sorted = useMemo(() => {
        if (!sortKey || !sortDir) return filtered;
        return [...filtered].sort((a, b) => {
            const cmp = String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? ""), undefined, { numeric: true });
            return sortDir === "asc" ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    const rowCount   = totalRows ?? sorted.length;
    const showAll    = pageSize === -1;
    const totalPages = showAll ? 1 : Math.max(1, Math.ceil(rowCount / pageSize));
    const safePage   = Math.min(currentPage, totalPages);
    const paged      = isServerSide ? data : showAll ? sorted : sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

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
        if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
        else if (sortDir === "asc") setSortDir("desc");
        else { setSortKey(null); setSortDir(null); }
        if (!isServerSide) setInternalPage(1);
    }

    function handleSearch(val: string) {
        if (isServerSide) { onSearch?.(val); }
        else { setInternalSearch(val); setInternalPage(1); }
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

    function toggleRow(id: unknown, row: T) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            onSelectionChange?.(data.filter((r, i) => next.has(getRowId(r, i))));
            return next;
        });
        void row;
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
        paged.length > 0 &&
        paged.every((r, i) => selected.has(getRowId(r, (safePage - 1) * pageSize + i)));

    function SortIcon({ col }: { col: Column<T> }) {
        if (!col.sortable) return null;
        if (sortKey !== col.key) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-40" />;
        if (sortDir === "asc") return <ChevronUp className="w-3.5 h-3.5 text-blue-600" />;
        return <ChevronDown className="w-3.5 h-3.5 text-blue-600" />;
    }

    const from = rowCount === 0 ? 0 : showAll ? 1 : (safePage - 1) * pageSize + 1;
    const to   = showAll ? rowCount : Math.min(safePage * pageSize, rowCount);

    return (
        <div className="w-full flex flex-col gap-3">
            {searchable && (
                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                    />
                </div>
            )}

            <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-sm">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                {selectable && (
                                    <th className="w-10 px-3 py-2.5 sm:px-4 sm:py-3 text-center">
                                        <input type="checkbox" checked={allPageSelected} onChange={toggleAll}
                                            className="rounded border-gray-300 accent-blue-600 cursor-pointer" />
                                    </th>
                                )}
                                {columns.map((col) => (
                                    <th key={col.key} onClick={() => col.sortable && handleSort(col.key)}
                                        className={[
                                            "px-3 py-2.5 sm:px-4 sm:py-3 text-left text-sm font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none",
                                            col.sortable ? "cursor-pointer hover:text-gray-800 hover:bg-gray-100 transition-colors" : "",
                                            col.className ?? "",
                                        ].join(" ")}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            {col.header}
                                            <SortIcon col={col} />
                                        </div>
                                    </th>
                                ))}
                                {actions && <th className="px-3 py-2.5 sm:px-4 sm:py-3" />}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                                        className="px-4 py-16 text-center text-gray-400 text-sm">
                                        Loading...
                                    </td>
                                </tr>
                            ) : paged.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                                        className="px-4 py-16 text-center text-gray-400 text-sm">
                                        {emptyMessage}
                                    </td>
                                </tr>
                            ) : (
                                paged.map((row, i) => {
                                    const id = getRowId(row, (safePage - 1) * pageSize + i);
                                    const isSelected = selected.has(id);
                                    return (
                                        <tr key={String(id)} className={["transition-colors",
                                            isSelected ? "bg-blue-50" : "bg-white hover:bg-gray-50/80"].join(" ")}>
                                            {selectable && (
                                                <td className="w-10 px-3 py-2.5 sm:px-4 sm:py-3 text-center">
                                                    <input type="checkbox" checked={isSelected}
                                                        onChange={() => toggleRow(id, row)}
                                                        className="rounded border-gray-300 accent-blue-600 cursor-pointer" />
                                                </td>
                                            )}
                                            {columns.map((col) => (
                                                <td key={col.key} className={`px-3 py-2.5 sm:px-4 sm:py-3 text-gray-700 ${col.className ?? ""}`}>
                                                    {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "")}
                                                </td>
                                            ))}
                                            {actions && (
                                                <td className="px-3 py-2.5 sm:px-4 sm:py-3 text-right">
                                                    {actions(row)}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5 sm:px-4 sm:py-3 border-t border-gray-100 bg-gray-50/80">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400">
                            {rowCount === 0 ? "No results" : `${from}–${to} of ${rowCount} results`}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-lg text-gray-400">Rows</span>
                            <select
                                value={pageSize === -1 ? -1 : pageSize}
                                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                                className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 cursor-pointer transition"
                            >
                                {pageSizeOptions.map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                                <option value={-1}>All</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 flex-wrap">
                        <button onClick={() => goToPage(Math.max(1, safePage - 1))} disabled={safePage === 1}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        {pageNumbers.map((p, i) =>
                            p === "..." ? (
                                <span key={`e-${i}`} className="w-8 text-center text-gray-400 text-sm">…</span>
                            ) : (
                                <button key={p} onClick={() => goToPage(p)}
                                    className={["min-w-8 h-8 px-2 rounded-lg text-sm font-medium transition",
                                        safePage === p ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-gray-200 hover:text-gray-800"].join(" ")}>
                                    {p}
                                </button>
                            )
                        )}
                        <button onClick={() => goToPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
