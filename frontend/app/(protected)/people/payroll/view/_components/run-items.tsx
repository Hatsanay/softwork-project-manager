"use client";

// รายคนในรอบเงินเดือน (U-3 · 2026-10-23) — ค้นหาชื่อ/รหัส · จอคอมเป็นตาราง (หัวตารางค้าง · แถวรวมท้าย) · มือถือเป็นการ์ด
// ตัวเลขชิดขวา ทศนิยม 2 ตำแหน่งตรงกัน · แถวรวมบวกด้วย BigInt จากตัวเลขที่แสดง (ไม่ผ่าน float)
// สุทธิ = เงินได้ − รายหักอื่น − ประกันสังคม − ภาษี (สูตรเดียวกับ payroll-calc.service.js)
import { useState } from "react";
import { Search } from "lucide-react";
import { inputClass } from "@/components/ui/form-field";
import { CARD_CLASS } from "@/components/ui/card";
import { formatAmount, parseHundredths } from "@/lib/shared/money.mjs";
import type { PayrollItem } from "../../../_types";
import { attendanceDeductionText } from "../../_attendance-text";

type AmountField = "pri_gross" | "pri_other_deductions" | "pri_sso_employee" | "pri_tax" | "pri_net";

const AMOUNT_COLUMNS: { field: AmountField; label: string }[] = [
    { field: "pri_gross", label: "เงินได้" },
    { field: "pri_other_deductions", label: "รายหักอื่น" },
    { field: "pri_sso_employee", label: "ประกันสังคม" },
    { field: "pri_tax", label: "ภาษี" },
    { field: "pri_net", label: "สุทธิ" },
];

function sumOf(items: PayrollItem[], field: AmountField) {
    return items.reduce((total, item) => total + parseHundredths(item[field], "จำนวนเงิน"), 0n);
}

function isNegative(amount: string) {
    return parseHundredths(amount, "จำนวนเงิน") < 0n;
}

// บรรทัดรองใต้ชื่อ: รหัส · ทำงานไม่เต็มเดือน · ลาไม่รับค่าจ้าง
function itemNote(item: PayrollItem) {
    const parts = [item.pri_emp_code];
    if (item.pri_employed_days < item.pri_days_in_month) {
        parts.push(`ทำงาน ${item.pri_employed_days}/${item.pri_days_in_month} วัน`);
    }
    if (Number(item.pri_unpaid_leave_days) > 0) parts.push(`ลาไม่รับค่าจ้าง ${Number(item.pri_unpaid_leave_days)} วัน`);
    const attendance = attendanceDeductionText(item);
    if (attendance) parts.push(attendance);
    return parts.join(" · ");
}

export default function RunItems({ items, onOpen }: { items: PayrollItem[]; onOpen: (itemId: number) => void }) {
    const [search, setSearch] = useState("");
    const keyword = search.trim().toLowerCase();
    const shownItems = keyword
        ? items.filter(
              (item) =>
                  item.pri_full_name.toLowerCase().includes(keyword) || item.pri_emp_code.toLowerCase().includes(keyword),
          )
        : items;
    const isFiltered = shownItems.length !== items.length;

    return (
        <section className="grid gap-3" aria-label="รายคน">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-gray-900">
                    รายคน ({isFiltered ? `${shownItems.length} จาก ${items.length}` : items.length}) · กดชื่อเพื่อดูที่มาของตัวเลข
                </h2>
                <label className="relative w-full sm:w-64">
                    <span className="sr-only">ค้นหาชื่อหรือรหัส</span>
                    <Search size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-gray-400" />
                    <input
                        type="search"
                        value={search}
                        placeholder="ค้นหาชื่อหรือรหัส"
                        onChange={(event) => setSearch(event.target.value)}
                        className={`${inputClass(false)} pl-9`}
                    />
                </label>
            </div>

            {shownItems.length === 0 && (
                <p className="rounded-2xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                    ไม่พบชื่อหรือรหัสที่ค้นหา
                </p>
            )}

            {/* จอคอม: ตาราง — หัวตารางค้างเมื่อเลื่อน (ไม่ห่อด้วยกล่อง overflow เพื่อให้ sticky ทำงาน) */}
            {shownItems.length > 0 && (
                <div className={`hidden md:block ${CARD_CLASS}`}>
                    <table className="w-full border-collapse text-sm">
                        <thead>
                            <tr>
                                <th
                                    scope="col"
                                    className="sticky top-0 z-10 rounded-tl-2xl border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-left font-medium text-gray-600"
                                >
                                    พนักงาน
                                </th>
                                {AMOUNT_COLUMNS.map((column, index) => (
                                    <th
                                        key={column.field}
                                        scope="col"
                                        className={`sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-4 py-2.5 text-right font-medium text-gray-600 ${
                                            index === AMOUNT_COLUMNS.length - 1 ? "rounded-tr-2xl" : ""
                                        }`}
                                    >
                                        {column.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {shownItems.map((item) => (
                                <tr
                                    key={item.pri_id}
                                    className="cursor-pointer border-b border-gray-100 hover:bg-blue-50/40"
                                    onClick={() => onOpen(item.pri_id)}
                                >
                                    <td className="px-4 py-2.5">
                                        <button
                                            type="button"
                                            className="grid text-left"
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onOpen(item.pri_id);
                                            }}
                                        >
                                            <span className="font-medium text-gray-900 hover:text-blue-600">
                                                {item.pri_full_name}
                                            </span>
                                            <span className="text-xs text-gray-500">{itemNote(item)}</span>
                                        </button>
                                    </td>
                                    {AMOUNT_COLUMNS.map((column) => {
                                        const isNet = column.field === "pri_net";
                                        const tone = isNet && isNegative(item.pri_net) ? "text-red-600" : isNet ? "text-gray-900" : "text-gray-700";
                                        return (
                                            <td
                                                key={column.field}
                                                className={`px-4 py-2.5 text-right tabular-nums ${isNet ? "font-medium" : ""} ${tone}`}
                                            >
                                                {formatAmount(item[column.field])}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-gray-50">
                                <th scope="row" className="rounded-bl-2xl px-4 py-3 text-left font-medium text-gray-700">
                                    {isFiltered ? `รวม ${shownItems.length} คนที่แสดง` : "รวมทั้งรอบ"}
                                </th>
                                {AMOUNT_COLUMNS.map((column, index) => (
                                    <td
                                        key={column.field}
                                        className={`px-4 py-3 text-right font-medium tabular-nums ${
                                            column.field === "pri_net" ? "text-blue-600" : "text-gray-900"
                                        } ${index === AMOUNT_COLUMNS.length - 1 ? "rounded-br-2xl" : ""}`}
                                    >
                                        {formatAmount(sumOf(shownItems, column.field))}
                                    </td>
                                ))}
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* มือถือ: การ์ด */}
            <div className="grid gap-2 md:hidden">
                {shownItems.map((item) => (
                    <button
                        key={item.pri_id}
                        type="button"
                        onClick={() => onOpen(item.pri_id)}
                        className={`grid gap-2 p-4 text-left hover:border-blue-200 ${CARD_CLASS}`}
                    >
                        <span className="flex items-start justify-between gap-3">
                            <span className="grid min-w-0 gap-0.5">
                                <span className="font-medium text-gray-900">{item.pri_full_name}</span>
                                <span className="text-xs text-gray-500">{itemNote(item)}</span>
                            </span>
                            <span
                                className={`shrink-0 text-right font-medium tabular-nums ${isNegative(item.pri_net) ? "text-red-600" : "text-gray-900"}`}
                            >
                                {formatAmount(item.pri_net)}
                            </span>
                        </span>
                        <span className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-600 tabular-nums">
                            <span>เงินได้ {formatAmount(item.pri_gross)}</span>
                            <span>ประกันสังคม {formatAmount(item.pri_sso_employee)}</span>
                            <span>รายหักอื่น {formatAmount(item.pri_other_deductions)}</span>
                            <span>ภาษี {formatAmount(item.pri_tax)}</span>
                        </span>
                    </button>
                ))}
            </div>
        </section>
    );
}
