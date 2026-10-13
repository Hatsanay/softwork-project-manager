"use client";

// ปุ่มเลือกแบบแบ่งช่อง (แท็บ/ตัวกรอง) — เลื่อนแนวนอนในตัวเองบนจอแคบ ทั้งหน้าไม่เลื่อนตาม
type SegmentedOption<Value extends string> = {
    value: Value;
    label: string;
    count?: number;
};

type SegmentedProps<Value extends string> = {
    label: string;
    options: SegmentedOption<Value>[];
    value: Value;
    onChange: (value: Value) => void;
    role?: "tablist" | "group";
    idPrefix?: string;
};

export default function Segmented<Value extends string>({
    label,
    options,
    value,
    onChange,
    role = "group",
    idPrefix,
}: SegmentedProps<Value>) {
    const isTabs = role === "tablist";

    return (
        <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:max-w-full sm:px-0">
            <div role={role} aria-label={label} className="inline-flex gap-0.5 rounded-2xl bg-gray-100 p-1">
                {options.map((option) => {
                    const isSelected = option.value === value;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role={isTabs ? "tab" : undefined}
                            id={idPrefix ? `${idPrefix}-tab-${option.value}` : undefined}
                            aria-controls={idPrefix ? `${idPrefix}-panel-${option.value}` : undefined}
                            aria-selected={isTabs ? isSelected : undefined}
                            aria-pressed={isTabs ? undefined : isSelected}
                            onClick={() => onChange(option.value)}
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 ${
                                isSelected
                                    ? "bg-white font-medium text-gray-900 shadow-sm"
                                    : "text-gray-500 hover:text-gray-800"
                            }`}
                        >
                            {option.label}
                            {option.count !== undefined && (
                                <span className="text-xs text-gray-400 tabular-nums">{option.count}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
