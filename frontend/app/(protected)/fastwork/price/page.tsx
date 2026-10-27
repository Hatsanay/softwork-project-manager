"use client";

// ตัวคิดราคาภายใน (2026-10-25 · S-5 · docs/plans/2026-10-25-client-order-link.md ข้อ 13) — ใช้ตอนยังคุยในแชต Fastwork
// เลือกสินค้า/ชุดจากหน้าร้าน (ชุดเดียวกับที่ผู้ซื้อเห็นในลิงก์) → ราคาเสนอ → หักค่าธรรมเนียมตามตั้งค่า → เงินเข้าบัญชีโดยประมาณ
// คัดลอกคำถามของหมวดที่เลือกไปถามในแชต · สร้างงาน Fastwork จากตะกร้า (เติมชื่องานและงวดเดียวเท่าราคาเสนอ)
// ไม่บันทึกอะไรในระบบ (ตะกร้าหายเมื่อออกจากหน้า)
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ClipboardCopy, Search } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import StatusBanner from "@/components/ui/guidance/status-banner";
import FieldHint from "@/components/ui/guidance/field-hint";
import EmptyState from "@/components/ui/empty-state";
import { inputClass } from "@/components/ui/form-field";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import { cartTotals, fixedSubtotal, lineAmount, multiplyQuantity, percentAmount } from "@/lib/shared/order-cart-math.mjs";
import { suggestPayoutAmounts } from "@/lib/shared/fastwork-math.mjs";
import { numberRangeText, OTHER_OPTION, visibleQuestionnaire, YES_NO_VALUES } from "@/lib/shared/requirement-answers.mjs";
import { MAX_SET_COUNT } from "@/lib/shared/schemas/order-link.mjs";
import { packagePrice } from "@/app/order/_components/order-shop";
import QuantityControl from "@/app/order/_components/quantity-control";
import type { Catalog, RequirementGroup, RequirementQuestion } from "@/app/order/_types";
import type { FastworkSettings } from "../_types";

type PriceCatalog = { vat_rate: string | null; catalog: Catalog; questionnaire: RequirementGroup[] };
type PricedLine = { unitPrice: string; quantity: string } | { percent: string };
type CartLine = { key: string; name: string; categoryId: string | null; quantity: number; lines: PricedLine[] };

const ANSWER_HINT: Partial<Record<RequirementQuestion["rqq_type"], string>> = {
    yes_no: "ใช่/ไม่ใช่",
    file: "ส่งไฟล์ในแชต",
    date: "วันที่",
    number: "ตัวเลข",
    url: "ลิงก์",
    multi: "เลือกได้หลายข้อ",
};

/**
 * คำถามเป็นข้อความสำหรับวางในแชต Fastwork · ข้อลูกขึ้นทุกข้อพร้อมเงื่อนไข "(ถ้าข้อ 3 ตอบว่า มีแล้ว)" (ยังไม่รู้คำตอบ)
 * ตัวเลือก "อื่นๆ (ระบุ)" · ตัวเลขบอกช่วง/หน่วย · ไฟล์บอกให้ส่งในแชต
 */
function questionsText(groups: RequirementGroup[]) {
    const parts = ["รบกวนตอบคำถามเหล่านี้เพื่อประเมินงานครับ"];
    const numberById = new Map<number, number>();
    for (const group of groups) {
        parts.push("", `[${group.rqg_name}]`);
        for (const question of group.questions) {
            const number = numberById.size + 1;
            numberById.set(question.rqq_id, number);
            const parent = question.rqq_parent_id ? group.questions.find((row) => row.rqq_id === question.rqq_parent_id) : undefined;
            const condition = parent ? `(ถ้าข้อ ${numberById.get(parent.rqq_id)} ตอบว่า ${conditionLabels(parent, question.rqq_parent_values)}) ` : "";
            const hint = [ANSWER_HINT[question.rqq_type], choicesText(question), numberRangeText(question).trim() || null].filter(Boolean).join(" · ");
            parts.push(`${parent ? "   " : ""}${number}. ${condition}${question.rqq_text}${hint ? ` (${hint})` : ""}`);
        }
    }
    return parts.join("\n");
}

function choicesText(question: RequirementQuestion) {
    if (!question.rqq_options?.length) return null;
    const choices = question.rqq_allow_other ? [...question.rqq_options, `${OTHER_OPTION} (ระบุ)`] : question.rqq_options;
    return `ตัวเลือก: ${choices.join(" / ")}`;
}

function conditionLabels(parent: RequirementQuestion, values: string[]) {
    const labels = values.map((value) => (parent.rqq_type === "yes_no" ? YES_NO_VALUES[value as keyof typeof YES_NO_VALUES] : value));
    return labels.join(" หรือ ");
}

export default function FastworkPricePage() {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const [data, setData] = useState<PriceCatalog | null>(null);
    const [settings, setSettings] = useState<FastworkSettings | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [search, setSearch] = useState("");

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        Promise.all([apiFetch<PriceCatalog>("/fastwork/price-catalog"), apiFetch<FastworkSettings>("/fastwork/settings")]).then(([catalogResult, settingsResult]) => {
            if (isLeftPage) return;
            setLoadError(catalogResult.error ?? settingsResult.error);
            if (catalogResult.data) setData(catalogResult.data);
            if (settingsResult.data) setSettings(settingsResult.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage]);

    const cart = useMemo<CartLine[]>(() => {
        if (!data) return [];
        const lines: CartLine[] = [];
        for (const product of data.catalog.products) {
            const quantity = quantities[`p:${product.product_id}`] ?? 0;
            if (quantity === 0) continue;
            // งานเพิ่มแบบ % คิดจากยอดรายการอื่น (เลือกได้ครั้งเดียว)
            const isPercent = product.product_price_mode === "percent" && product.product_percent;
            const productLines: PricedLine[] = isPercent ? [{ percent: product.product_percent as string }] : [{ unitPrice: product.product_price, quantity: String(quantity) }];
            lines.push({ key: `p:${product.product_id}`, name: product.product_name, categoryId: product.product_category_id, quantity: isPercent ? 1 : quantity, lines: productLines });
        }
        for (const productPackage of data.catalog.packages) {
            const quantity = quantities[`k:${productPackage.pkg_id}`] ?? 0;
            if (quantity === 0) continue;
            lines.push({
                key: `k:${productPackage.pkg_id}`,
                name: productPackage.pkg_name,
                categoryId: productPackage.pkg_category_id,
                quantity,
                lines: productPackage.items.map((item) => ({ unitPrice: item.unit_price, quantity: multiplyQuantity(item.quantity, quantity) })),
            });
        }
        return lines;
    }, [data, quantities]);

    const header = (
        <PageHeader
            eyebrow="Fastwork · ก่อนรับงาน"
            title="ตัวคิดราคา"
            description="เลือกสิ่งที่ผู้ซื้อต้องการ ดูราคาเสนอและเงินเข้าจริงหลังหักค่าธรรมเนียม"
            actions={
                <Link href="/fastwork" className={buttonClass("secondary", "md")}>
                    หน้า Fastwork
                </Link>
            }
        />
    );
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์จัดการงาน Fastwork" />
            </div>
        );
    }
    if (loadError) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="error" title="โหลดสินค้าไม่สำเร็จ">
                    {loadError.message}
                </StatusBanner>
            </div>
        );
    }
    if (!data || !settings) return <PageSkeleton />;

    const keyword = search.trim().toLowerCase();
    const matches = (name: string) => keyword === "" || name.toLowerCase().includes(keyword);
    const products = data.catalog.products.filter((product) => matches(product.product_name));
    const packages = data.catalog.packages.filter((productPackage) => matches(productPackage.pkg_name));
    const allLines = cart.flatMap((line) => line.lines);
    const totals = cartTotals({ lines: allLines, vatRate: data.vat_rate });
    const fixedBase = fixedSubtotal(allLines);
    const lineTotalOf = (lines: PricedLine[]) => lines.reduce((sum, item) => sum + ("percent" in item ? percentAmount(fixedBase, item.percent) : lineAmount(item.unitPrice, item.quantity)), 0n);
    const offer = formatHundredths(totals.total);
    const payout = suggestPayoutAmounts({
        gross: offer,
        feeRate: settings.cs_fastwork_fee_rate,
        feeVatRate: settings.cs_fastwork_fee_vat_rate,
        whtRate: settings.cs_fastwork_wht_rate,
    });
    // ก่อนจ้าง: ยังไม่มีรายการที่ทีมเลือกให้ · ถามแบบลิงก์ Fastwork (ไม่ถามช่องทางติดต่อนอกแพลตฟอร์ม) · ยังไม่รู้คำตอบ = ข้อลูกขึ้นทุกข้อ
    const groups = visibleQuestionnaire(
        data.questionnaire,
        {
            linkKind: "fastwork",
            categoryIds: cart.map((line) => line.categoryId).filter((id): id is string => Boolean(id)),
            packageIds: cart.filter((line) => line.key.startsWith("k:")).map((line) => line.key.slice(2)),
            productIds: cart.filter((line) => line.key.startsWith("p:")).map((line) => line.key.slice(2)),
            hasPreset: false,
        },
        null,
    ) as RequirementGroup[];
    const questionCount = groups.reduce((count, group) => count + group.questions.length, 0);
    const title = cart.map((line) => (line.quantity > 1 ? `${line.name} × ${line.quantity}` : line.name)).join(" + ");

    function setQuantity(key: string, quantity: number) {
        setQuantities((current) => ({ ...current, [key]: Math.max(0, Math.min(quantity, MAX_SET_COUNT)) }));
    }

    async function copy(text: string, doneMessage: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(doneMessage);
        } catch {
            toast.error("คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง");
        }
    }

    const newJobHref = `/fastwork/new?${new URLSearchParams({ name: title.slice(0, 150), amount: offer })}`;

    return (
        <div className="grid w-full grid-cols-1 gap-5">
            {header}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
                <SectionCard title="สินค้าและชุด" description="รายการที่เปิดหน้าร้าน (ชุดเดียวกับที่ผู้ซื้อเห็นในลิงก์)">
                    <label className="relative block">
                        <span className="sr-only">ค้นหาสินค้า</span>
                        <Search size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อสินค้า/ชุด" className={`${inputClass()} pl-10`} />
                    </label>
                    {products.length === 0 && packages.length === 0 ? (
                        <EmptyState title="ไม่พบสินค้า" description='เปิด "แสดงบนหน้าร้าน" ที่สินค้า/ชุดในหน้าสินค้าและบริการก่อน' />
                    ) : (
                        <ul className="grid gap-2">
                            {packages.map((productPackage) => (
                                <PriceRow
                                    key={`k:${productPackage.pkg_id}`}
                                    name={productPackage.pkg_name}
                                    detail={`ชุด · ${productPackage.items.map((item) => item.name).join(", ")}`}
                                    price={formatHundredths(packagePrice(productPackage))}
                                    unit="ชุด"
                                    quantity={quantities[`k:${productPackage.pkg_id}`] ?? 0}
                                    onChange={(quantity) => setQuantity(`k:${productPackage.pkg_id}`, quantity)}
                                />
                            ))}
                            {products.map((product) => (
                                <PriceRow
                                    key={`p:${product.product_id}`}
                                    name={product.product_name}
                                    detail={product.product_description}
                                    price={product.product_price_mode === "percent" ? "0" : product.product_price}
                                    priceText={product.product_price_mode === "percent" ? `+${Number(product.product_percent)}% ของยอด` : null}
                                    unit={product.product_unit}
                                    quantity={quantities[`p:${product.product_id}`] ?? 0}
                                    onChange={(quantity) => setQuantity(`p:${product.product_id}`, quantity)}
                                />
                            ))}
                        </ul>
                    )}
                </SectionCard>

                <div className="grid gap-5 lg:sticky lg:top-4">
                    <SectionCard title="ราคาและเงินเข้าจริง">
                        {cart.length === 0 ? (
                            <p className="text-sm text-gray-500">เลือกสินค้าหรือชุดทางซ้าย (มือถือ: ด้านบน) เพื่อคิดราคา</p>
                        ) : (
                            <div className="grid gap-1 text-sm">
                                {cart.map((line) => (
                                    <div key={line.key} className="flex justify-between gap-3 text-gray-700">
                                        <span className="min-w-0 wrap-break-word">
                                            {line.name} × {line.quantity}
                                        </span>
                                        <span className="shrink-0 tabular-nums">{formatAmount(formatHundredths(lineTotalOf(line.lines)))}</span>
                                    </div>
                                ))}
                                {data.vat_rate && (
                                    <div className="flex justify-between gap-3 border-t border-gray-100 pt-1.5 text-gray-700">
                                        <span>+ VAT {Number(data.vat_rate)}%</span>
                                        <span className="tabular-nums">{formatAmount(formatHundredths(totals.vat))}</span>
                                    </div>
                                )}
                                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 font-medium text-gray-900">
                                    <span>= ราคาเสนอบน Fastwork</span>
                                    <span className="tabular-nums">{formatAmount(offer)}</span>
                                </div>
                                <div className="flex justify-between gap-3 text-gray-700">
                                    <span>− ค่าธรรมเนียม {Number(settings.cs_fastwork_fee_rate)}%</span>
                                    <span className="tabular-nums">{formatAmount(payout.fee)}</span>
                                </div>
                                {Number(payout.fee_vat) > 0 && (
                                    <div className="flex justify-between gap-3 text-gray-700">
                                        <span>− VAT ค่าธรรมเนียม {Number(settings.cs_fastwork_fee_vat_rate)}%</span>
                                        <span className="tabular-nums">{formatAmount(payout.fee_vat)}</span>
                                    </div>
                                )}
                                {Number(payout.wht) > 0 && (
                                    <div className="flex justify-between gap-3 text-gray-700">
                                        <span>− หัก ณ ที่จ่าย {Number(settings.cs_fastwork_wht_rate)}%</span>
                                        <span className="tabular-nums">{formatAmount(payout.wht)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5">
                                    <span className="font-medium text-gray-900">= เงินเข้าบัญชีโดยประมาณ</span>
                                    <span className="text-base font-medium text-blue-700 tabular-nums">{formatAmount(payout.net)} บาท</span>
                                </div>
                            </div>
                        )}
                        <FieldHint>อัตราหักจากตั้งค่าในหน้า Fastwork · ราคาขั้นต่ำของหมวดบน Fastwork ระบบไม่รู้ ตรวจเองก่อนส่งข้อเสนอ</FieldHint>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                            {cart.length > 0 ? (
                                <Link href={newJobHref} className={buttonClass("primary", "md")}>
                                    สร้างงาน Fastwork จากตะกร้านี้
                                </Link>
                            ) : (
                                <button type="button" className={buttonClass("primary", "md")} disabled>
                                    สร้างงาน Fastwork จากตะกร้านี้
                                </button>
                            )}
                            <button type="button" className={buttonClass("secondary", "md")} disabled={groups.length === 0} onClick={() => copy(questionsText(groups), "คัดลอกคำถามแล้ว วางในแชต Fastwork ได้เลย")}>
                                <ClipboardCopy size={16} />
                                คัดลอกคำถาม ({questionCount} ข้อ)
                            </button>
                        </div>
                        <FieldHint>
                            สร้างงานเมื่อผู้ซื้อจ่ายบน Fastwork แล้ว · หน้ารับงานเติมชื่องานและงวดเดียวเท่าราคาเสนอ แบ่งงวดเพิ่มได้ · คำถาม = ข้อที่ลิงก์ Fastwork ถามสำหรับรายการที่เลือก (ข้อที่ถามตามคำตอบ มีเงื่อนไขเขียนกำกับ)
                        </FieldHint>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}

function PriceRow({
    name,
    detail,
    price,
    priceText = null,
    unit,
    quantity,
    onChange,
}: {
    name: string;
    detail: string | null;
    price: string;
    priceText?: string | null;
    unit: string | null;
    quantity: number;
    onChange: (quantity: number) => void;
}) {
    return (
        <li className={`grid gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${quantity > 0 ? "border-blue-200 bg-blue-50/40" : "border-gray-200"}`}>
            <div className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium wrap-break-word text-gray-900">{name}</span>
                {detail && <span className="line-clamp-2 text-xs text-gray-500">{detail}</span>}
                <span className="text-sm text-gray-700 tabular-nums">
                    {priceText ?? `${formatAmount(price)} บาท${unit ? ` / ${unit}` : ""}`}
                </span>
            </div>
            <div className="justify-self-end">
                <QuantityControl quantity={quantity} onChange={onChange} label={name} />
            </div>
        </li>
    );
}
