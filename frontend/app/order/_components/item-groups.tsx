// รายการแบบจัดกลุ่มตามชุด (2026-10-25) — หน้าสถานะของลูกค้า (ใบเสนอราคา · สิ่งที่ส่งตอนแรก)
// ชุด = กล่องเดียว: ชื่อชุด + ราคาชุดครั้งเดียว · รายการข้างในเป็นเช็กลิสต์ ✓ (แถวราคา 0 = รวมในชุด ไม่แสดง 0.00)
// ชุดที่มีหลายแถวมีราคา: แสดงยอดของแถวนั้นด้วย · รายการเดี่ยว (ไม่อยู่ในชุด): ราคา × จำนวน และยอด
import { Check, Package } from "lucide-react";
import { formatAmount, formatHundredths, formatQuantity, parseHundredths } from "@/lib/shared/money.mjs";

export type GroupRow = {
    type: "item" | "note";
    name: string;
    quantity: string | null;
    unit: string | null;
    unitPrice: string | null;
    amount: string;
    // ป้ายต่อท้าย เช่น "+30% ของยอด" แทนราคา × จำนวน
    priceNote?: string | null;
};

export type ItemGroup = { key: string; title: string | null; setCount: string | null; rows: GroupRow[] };

// สร้างจากข้อความ (เป้าหมาย TypeScript ของโปรเจกต์ยังไม่รับ regex ตัวกรอง \p{...} แบบเขียนตรง)
const STARTS_WITH_EMOJI = new RegExp("^\\p{Extended_Pictographic}", "u");
const isPriced = (row: GroupRow) => row.type === "item" && Number(row.amount) !== 0;
const sumOf = (rows: GroupRow[]) => rows.filter((row) => row.type === "item").reduce((sum, row) => sum + parseHundredths(row.amount, "ยอด"), 0n);

export default function ItemGroupList({ groups }: { groups: ItemGroup[] }) {
    return (
        <div className="grid gap-3">
            {groups.map((group) =>
                group.title ? <PackageGroup key={group.key} group={group} /> : <StandaloneRows key={group.key} rows={group.rows} />,
            )}
        </div>
    );
}

function PackageGroup({ group }: { group: ItemGroup }) {
    const showRowAmounts = group.rows.filter(isPriced).length > 1;
    const setCount = Number(group.setCount ?? 1);
    // ชื่อชุดขึ้นต้นด้วยอีโมจิอยู่แล้ว (เช่น 🌱) = ไม่ต้องมีไอคอนกล่องซ้ำ
    const hasEmoji = STARTS_WITH_EMOJI.test(group.title ?? "");
    return (
        <section className="grid gap-2.5 rounded-xl border border-blue-100 bg-blue-50/40 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 items-start gap-2">
                    {!hasEmoji && <Package size={17} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />}
                    <span className="min-w-0 text-sm font-medium wrap-break-word text-gray-900">
                        {group.title}
                        {setCount > 1 && <span className="font-normal text-gray-500"> × {setCount} ชุด</span>}
                    </span>
                </span>
                <span className="shrink-0 text-sm font-medium text-gray-900 tabular-nums">{formatAmount(formatHundredths(sumOf(group.rows)))}</span>
            </div>
            <ul className="grid gap-1.5 text-sm text-gray-700">
                {group.rows.map((row, index) =>
                    row.type === "note" ? (
                        <li key={index} className="pl-6 text-xs whitespace-pre-line wrap-break-word text-gray-500">
                            {row.name}
                        </li>
                    ) : (
                        <li key={index} className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
                                <Check size={11} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 flex-1 whitespace-pre-line wrap-break-word">
                                {row.name}
                                {/* จำนวน 1 ไม่ต้องบอก (เช่น "ดูแลบั๊ก 30 วัน") */}
                                {row.quantity && Number(row.quantity) !== 1 && (
                                    <span className="text-gray-500 tabular-nums">
                                        {" "}· {formatQuantity(row.quantity)} {row.unit ?? ""}
                                    </span>
                                )}
                            </span>
                            {showRowAmounts && isPriced(row) && <span className="shrink-0 text-xs text-gray-500 tabular-nums">{formatAmount(row.amount)}</span>}
                        </li>
                    ),
                )}
            </ul>
        </section>
    );
}

function StandaloneRows({ rows }: { rows: GroupRow[] }) {
    return (
        <ul className="grid gap-2 text-sm">
            {rows.map((row, index) =>
                row.type === "note" ? (
                    <li key={index} className="text-xs whitespace-pre-line wrap-break-word text-gray-500">
                        {row.name}
                    </li>
                ) : (
                    <li key={index} className="flex items-baseline justify-between gap-3 text-gray-800">
                        <span className="min-w-0 whitespace-pre-line wrap-break-word">
                            {row.name}
                            <span className="block text-xs text-gray-500 tabular-nums">
                                {row.priceNote ?? `${formatAmount(row.unitPrice ?? "0")} × ${formatQuantity(row.quantity ?? 0)} ${row.unit ?? ""}`}
                            </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{formatAmount(row.amount)}</span>
                    </li>
                ),
            )}
        </ul>
    );
}

/** ใบเสนอราคา: หัวข้อ = เริ่มชุดใหม่ · รายการ/หมายเหตุที่ตามมาอยู่ในชุดนั้น · ก่อนหัวข้อแรก = รายการเดี่ยว */
export function quotationGroups(
    items: {
        type: "heading" | "item" | "note";
        description: string;
        quantity: string | null;
        unit: string | null;
        unit_price: string | null;
        discount: string | null;
        amount: string | null;
    }[],
): ItemGroup[] {
    const groups: ItemGroup[] = [];
    for (const [index, item] of items.entries()) {
        if (item.type === "heading") {
            groups.push({ key: `h${index}`, title: item.description, setCount: null, rows: [] });
            continue;
        }
        let current = groups.at(-1);
        if (!current) {
            current = { key: `s${index}`, title: null, setCount: null, rows: [] };
            groups.push(current);
        }
        const hasDiscount = Number(item.discount ?? 0) !== 0;
        current.rows.push({
            type: item.type,
            name: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unit_price,
            amount: item.amount ?? "0",
            priceNote: hasDiscount
                ? `${formatAmount(item.unit_price ?? "0")} × ${formatQuantity(item.quantity ?? 0)} ${item.unit ?? ""} · ส่วนลด ${formatAmount(item.discount ?? "0")}`
                : null,
        });
    }
    return groups.filter((group) => group.rows.length > 0 || group.title);
}
