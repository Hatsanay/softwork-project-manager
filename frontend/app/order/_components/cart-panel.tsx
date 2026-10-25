"use client";

// ตะกร้าของหน้าร้าน (2026-10-25) — ใช้ทั้งแผ่นเลื่อนขึ้นบนมือถือ แผงข้างขวาบนจอคอม และสรุปในขั้นตรวจและส่ง
// แก้จำนวน/ลบได้ทุกที่ (ยกเว้นรายการที่ทีมเลือกให้ = ล็อก · งานเพิ่มแบบ % ลบได้ แก้จำนวนไม่ได้)
// ยอดแต่ละแถวคิดแบบเดียวกับยอดรวม (ชุด = ผลรวมรายการในชุด · % = จากแถวราคาตายตัว) แถวจึงรวมกันได้ยอดรวมพอดี
import { useEffect } from "react";
import { Lock, Package, ShoppingBag, Trash2, X, type LucideIcon } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { uploadedFileUrl } from "@/lib/api";
import { formatAmount } from "@/lib/shared/money.mjs";
import QuantityControl from "./quantity-control";

export type CartItem = {
    key: string;
    name: string;
    isPackage: boolean;
    isLocked: boolean;
    isPercent: boolean;
    priceText: string;
    lineTotal: bigint;
    quantity: number;
    Icon: LucideIcon;
    imageUrl: string | null;
    packageItems: string[];
};

export type CartTotals = { subtotal: bigint; vat: bigint; total: bigint };

export function CartLines({ items, onChange }: { items: CartItem[]; onChange: (key: string, quantity: number) => void }) {
    return (
        <ul className="grid gap-3">
            {items.map((item) => (
                <li key={item.key} className="grid gap-2 border-b border-gray-100 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex gap-3">
                        {item.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={uploadedFileUrl(item.imageUrl)} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                        ) : (
                            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                {item.isPackage ? <Package size={20} aria-hidden="true" /> : <item.Icon size={20} aria-hidden="true" />}
                            </span>
                        )}
                        <div className="grid min-w-0 flex-1 gap-0.5">
                            <span className="text-sm font-medium wrap-break-word text-gray-900">{item.name}</span>
                            {item.isLocked && (
                                <span className="flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                                    <Lock size={11} aria-hidden="true" />
                                    ทีมงานเลือกให้
                                </span>
                            )}
                            <span className="text-xs text-gray-500 tabular-nums">{item.priceText}</span>
                            {item.packageItems.length > 0 && <span className="line-clamp-2 text-xs text-gray-500">รวม: {item.packageItems.join(", ")}</span>}
                        </div>
                        {!item.isLocked && (
                            <button
                                type="button"
                                className="-m-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600"
                                onClick={() => onChange(item.key, 0)}
                                aria-label={`ลบ ${item.name} ออกจากตะกร้า`}
                            >
                                <Trash2 size={17} />
                            </button>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-3 pl-15">
                        {item.isLocked || item.isPercent ? (
                            <span className="text-sm text-gray-600 tabular-nums">จำนวน {item.quantity}</span>
                        ) : (
                            <QuantityControl quantity={item.quantity} onChange={(quantity) => onChange(item.key, quantity)} label={item.name} />
                        )}
                        <span className="text-sm font-medium text-gray-900 tabular-nums">{formatAmount(item.lineTotal)}</span>
                    </div>
                </li>
            ))}
        </ul>
    );
}

/** ยอดบนลงล่าง: รวม → + VAT → = ยอดประมาณการ */
export function CartTotalsBlock({ totals, vatRate, note }: { totals: CartTotals; vatRate: string | null; note: string }) {
    return (
        <div className="grid gap-1 rounded-xl bg-gray-50 p-3 text-sm">
            <div className="flex justify-between gap-3 text-gray-700">
                <span>รวม</span>
                <span className="tabular-nums">{formatAmount(totals.subtotal)}</span>
            </div>
            {vatRate && (
                <div className="flex justify-between gap-3 text-gray-700">
                    <span>+ VAT {Number(vatRate)}%</span>
                    <span className="tabular-nums">{formatAmount(totals.vat)}</span>
                </div>
            )}
            <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5">
                <span className="font-medium text-gray-900">= ยอดประมาณการ</span>
                <span className="text-base font-medium text-blue-700 tabular-nums">{formatAmount(totals.total)} บาท</span>
            </div>
            <FieldHint>{note}</FieldHint>
        </div>
    );
}

function EmptyCart() {
    return (
        <div className="grid justify-items-center gap-2 py-8 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400">
                <ShoppingBag size={26} aria-hidden="true" />
            </span>
            <p className="text-sm font-medium text-gray-700">ตะกร้ายังว่าง</p>
            <p className="text-xs text-gray-500">กด + ที่บริการที่ต้องการ</p>
        </div>
    );
}

type PanelProps = {
    items: CartItem[];
    totals: CartTotals;
    vatRate: string | null;
    note: string;
    nextLabel: string;
    onChange: (key: string, quantity: number) => void;
    onNext: () => void;
};

/** แผงตะกร้าข้างขวา (จอคอม · ติดอยู่ตอนเลื่อน) */
export function CartSidePanel({ items, totals, vatRate, note, nextLabel, onChange, onNext }: PanelProps) {
    const count = items.reduce((sum, item) => sum + item.quantity, 0);
    return (
        <aside className="card-customer grid max-h-[calc(100vh-6rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4" aria-label="ตะกร้า">
            <h2 className="flex items-center gap-2 text-base font-medium text-gray-900">
                <ShoppingBag size={18} className="text-blue-600" aria-hidden="true" />
                ตะกร้า
                {count > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 tabular-nums">{count} ชิ้น</span>}
            </h2>
            <div className="overflow-x-hidden overflow-y-auto pr-1">{items.length === 0 ? <EmptyCart /> : <CartLines items={items} onChange={onChange} />}</div>
            <div className="grid gap-3">
                <CartTotalsBlock totals={totals} vatRate={vatRate} note={note} />
                <button type="button" className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white shadow-brand hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none" disabled={items.length === 0} onClick={onNext}>
                    {nextLabel}
                </button>
            </div>
        </aside>
    );
}

/** แผ่นตะกร้าเลื่อนขึ้นจากล่าง (มือถือ) · ปิดด้วยปุ่ม X พื้นหลัง หรือปุ่ม Esc */
export function CartSheet({ items, totals, vatRate, note, nextLabel, onChange, onNext, onClose }: PanelProps & { onClose: () => void }) {
    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-labelledby="cart-sheet-title">
            <button type="button" className="absolute inset-0 bg-gray-900/40 backdrop-blur-[2px]" aria-label="ปิดตะกร้า" onClick={onClose} />
            <div
                className="relative mx-auto grid max-h-[85vh] w-full max-w-3xl grid-rows-[auto_minmax(0,1fr)_auto] gap-3 rounded-t-3xl bg-white p-4 shadow-float"
                style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
            >
                <div className="grid gap-2">
                    <span className="mx-auto h-1.5 w-10 rounded-full bg-gray-200" aria-hidden="true" />
                    <div className="flex items-center justify-between gap-3">
                        <h2 id="cart-sheet-title" className="flex items-center gap-2 text-base font-medium text-gray-900">
                            <ShoppingBag size={18} className="text-blue-600" aria-hidden="true" />
                            ตะกร้าของคุณ
                        </h2>
                        <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" onClick={onClose} aria-label="ปิดตะกร้า">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                <div className="overflow-x-hidden overflow-y-auto">{items.length === 0 ? <EmptyCart /> : <CartLines items={items} onChange={onChange} />}</div>
                <div className="grid gap-3">
                    <CartTotalsBlock totals={totals} vatRate={vatRate} note={note} />
                    <div className="flex gap-2">
                        <button type="button" className="min-h-11 shrink-0 rounded-xl border border-gray-200 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50" onClick={onClose}>
                            เลือกต่อ
                        </button>
                        <button type="button" className="min-h-11 flex-1 rounded-xl bg-blue-600 px-3 text-sm font-medium whitespace-nowrap text-white shadow-brand hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none" disabled={items.length === 0} onClick={onNext}>
                            {nextLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
