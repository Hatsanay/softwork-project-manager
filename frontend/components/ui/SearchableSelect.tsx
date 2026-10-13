"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, X, Loader2 } from "lucide-react";

export type SelectOption = { value: string | number; label: string };

type Props = {
    options?: SelectOption[];
    loadOptions?: (search: string) => Promise<SelectOption[]>;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    disabled?: boolean;
    error?: boolean;
};

export default function SearchableSelect({
    options: staticOptions,
    loadOptions,
    value,
    onChange,
    placeholder = "— เลือก —",
    className = "",
    disabled = false,
    error = false,
}: Props) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState("");
    const [asyncOptions, setAsyncOptions] = useState<SelectOption[]>([]);
    const [loading, setLoading] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const options = loadOptions ? asyncOptions : (staticOptions ?? []);
    const selected = options.find((o) => String(o.value) === value);
    const displayed = loadOptions
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()));

    // Load initial list on mount so selected label is visible before first open
    useEffect(() => {
        if (loadOptions) {
            loadOptions("").then(setAsyncOptions);
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Server-side search with debounce; immediate on empty search
    useEffect(() => {
        if (!open || !loadOptions) return;
        let alive = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag must be set before the debounced fetch starts
        setLoading(true);
        const timer = setTimeout(() => {
            loadOptions(search)
                .then((opts) => { if (alive) { setAsyncOptions(opts); setLoading(false); } })
                .catch(() => { if (alive) setLoading(false); });
        }, search ? 300 : 0);
        return () => { alive = false; clearTimeout(timer); };
    }, [search, open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Close on outside click
    useEffect(() => {
        function onMouseDown(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node))
                setOpen(false);
        }
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, []);

    function toggleOpen() {
        if (disabled) return;
        setOpen((v) => {
            const next = !v;
            if (next) setTimeout(() => inputRef.current?.focus(), 0);
            return next;
        });
        setSearch("");
    }

    function select(opt: SelectOption) {
        onChange(String(opt.value));
        setOpen(false);
    }

    function clear(e: React.MouseEvent) {
        e.stopPropagation();
        onChange("");
    }

    const borderCls = error
        ? "border-red-400 focus:border-red-400 focus:ring-red-500/20"
        : "border-gray-200 hover:border-gray-300 focus:border-blue-500 focus:ring-blue-500/15";

    return (
        <div ref={containerRef} className={`relative ${className}`}>
            <button
                type="button"
                disabled={disabled}
                onClick={toggleOpen}
                className={`w-full flex items-center justify-between gap-2 px-3.5 py-2.5 border rounded-xl text-sm font-light text-left shadow-xs transition focus:outline-none focus:ring-4
                    ${disabled
                        ? "bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200"
                        : `bg-white cursor-pointer ${borderCls}`}`}
            >
                <span className={selected ? "text-gray-800" : "text-gray-400"}>
                    {selected ? selected.label : placeholder}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                    {value && !disabled && (
                        <span onClick={clear} className="text-gray-400 hover:text-gray-600 p-0.5 rounded">
                            <X size={14} />
                        </span>
                    )}
                    <ChevronDown
                        size={16}
                        className={`text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
                    />
                </span>
            </button>

            {open && (
                <div className="absolute z-50 mt-1.5 w-full overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-float">
                    <div className="p-2 border-b border-gray-100">
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50">
                            {loading
                                ? <Loader2 size={14} className="text-blue-400 shrink-0 animate-spin" />
                                : <Search size={14} className="text-gray-400 shrink-0" />
                            }
                            <input
                                ref={inputRef}
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="ค้นหา..."
                                className="flex-1 text-sm outline-none text-gray-700 bg-transparent"
                            />
                        </div>
                    </div>
                    <ul className="max-h-60 overflow-y-auto p-1.5">
                        {displayed.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-gray-400">
                                {loading ? "กำลังโหลด..." : "ไม่พบข้อมูล"}
                            </li>
                        ) : (
                            displayed.map((opt) => (
                                <li
                                    key={opt.value}
                                    onClick={() => select(opt)}
                                    className={`px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700
                                        ${String(opt.value) === value
                                            ? "bg-blue-50 text-blue-700 font-medium"
                                            : "text-gray-700"}`}
                                >
                                    {opt.label}
                                </li>
                            ))
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
