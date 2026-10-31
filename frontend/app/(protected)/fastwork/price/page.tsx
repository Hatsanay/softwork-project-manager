"use client";

// ตัวคิดราคาภายใน (2026-10-25 · S-5 · docs/plans/2026-10-25-client-order-link.md ข้อ 13 · ปรับหน้า 2026-10-30) — ใช้ตอนยังคุยในแชต Fastwork
// เลือกสินค้า/ชุดจากหน้าร้าน (ชุดเดียวกับที่ผู้ซื้อเห็นในลิงก์) → ราคาเสนอ → หักค่าธรรมเนียมตามตั้งค่า → เงินเข้าบัญชีโดยประมาณ
// กติกาตะกร้าเดียวกับหน้าร้าน: หมวดเลือกได้อย่างเดียว = เปลี่ยนแทน · แพ็กใหม่เอางานเพิ่มที่มีในแพ็กแล้ว/ใช้ไม่ได้ออก · งานเพิ่มแบบ % ได้ครั้งเดียว
// คัดลอกคำถาม/ขอบเขตงานไปวางในแชต · สร้างงาน Fastwork จากตะกร้า (เติมชื่องานและงวดเดียวเท่าราคาเสนอ) · ไม่บันทึกอะไรในระบบ
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatHundredths, formatQuantity } from "@/lib/shared/money.mjs";
import {
    cartTotals,
    fixedSubtotal,
    lineAmount,
    multiplyQuantity,
    percentAmount,
} from "@/lib/shared/order-cart-math.mjs";
import { suggestPayoutAmounts } from "@/lib/shared/fastwork-math.mjs";
import { visibleQuestionnaire } from "@/lib/shared/requirement-answers.mjs";
import { MAX_SET_COUNT } from "@/lib/shared/schemas/order-link.mjs";
import type { Catalog, CatalogPackage, CatalogProduct, RequirementGroup } from "@/app/order/_types";
import type { FastworkSettings } from "../_types";
import PriceCatalog, { type AddonState } from "./_components/price-catalog";
import PriceSummary, { PriceMobileBar } from "./_components/price-summary";
import { offerText, questionsText } from "./_components/price-texts";
import AddToJobSheet from "./_components/add-to-job-sheet";
import { selectionToParam, tasksFromSources, type TaskSource } from "@/lib/catalog-tasks";

type PriceCatalog = { vat_rate: string | null; catalog: Catalog; questionnaire: RequirementGroup[] };
type PricedLine = { unitPrice: string; quantity: string } | { percent: string };
type CartLine = {
    key: string;
    name: string;
    categoryId: string | null;
    quantity: number;
    unit: string | null;
    packageItems: string[];
    lines: PricedLine[];
    // แถวนี้เป็นงานอะไรในโปรเจกต์ (lib/catalog-tasks)
    taskSource: TaskSource;
};

export default function FastworkPricePage() {
    const hasBit = usePermission();
    const canManage = hasBit(BITS.manageFastwork);
    const [data, setData] = useState<PriceCatalog | null>(null);
    const [settings, setSettings] = useState<FastworkSettings | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [isAddingToJob, setIsAddingToJob] = useState(false);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        Promise.all([
            apiFetch<PriceCatalog>("/fastwork/price-catalog"),
            apiFetch<FastworkSettings>("/fastwork/settings"),
        ]).then(([catalogResult, settingsResult]) => {
            if (isLeftPage) return;
            setLoadError(catalogResult.error ?? settingsResult.error);
            if (catalogResult.data) setData(catalogResult.data);
            if (settingsResult.data) setSettings(settingsResult.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage]);

    const productsById = useMemo(
        () => new Map((data?.catalog.products ?? []).map((row) => [row.product_id, row])),
        [data],
    );
    const packagesById = useMemo(() => new Map((data?.catalog.packages ?? []).map((row) => [row.pkg_id, row])), [data]);

    // แพ็กขึ้นก่อน งานเพิ่มตามหลัง (อ่านเหมือนใบเสนอราคา)
    const cart = useMemo<CartLine[]>(() => {
        const packageLines: CartLine[] = [];
        const productLines: CartLine[] = [];
        for (const [key, quantity] of Object.entries(quantities)) {
            const [kind, id] = key.split(":");
            const product = kind === "p" ? productsById.get(id) : undefined;
            const productPackage = kind === "k" ? packagesById.get(id) : undefined;
            if (product) productLines.push(productCartLine(product, quantity));
            if (productPackage) packageLines.push(packageCartLine(productPackage, quantity));
        }
        return [...packageLines, ...productLines];
    }, [quantities, productsById, packagesById]);

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

    const singleChoiceIds = new Set(
        data.catalog.categories.filter((category) => category.pc_is_single_choice).map((category) => category.pc_id),
    );
    const categoryOfKey = (key: string) => {
        const [kind, id] = key.split(":");
        if (kind === "p") return productsById.get(id)?.product_category_id ?? null;
        return packagesById.get(id)?.pkg_category_id ?? null;
    };
    const chosenPackages = cart.flatMap((line) =>
        line.key.startsWith("k:") ? [packagesById.get(line.key.slice(2)) as CatalogPackage] : [],
    );

    function addonStateOf(productId: string): AddonState {
        for (const productPackage of chosenPackages) {
            const rule = productPackage.addon_rules.find((item) => item.product_id === productId);
            if (rule) return { rule: rule.rule, packageName: productPackage.pkg_name };
        }
        return null;
    }

    function setQuantity(key: string, quantity: number) {
        const [kind, id] = key.split(":");
        const product = kind === "p" ? productsById.get(id) : undefined;
        const productPackage = kind === "k" ? packagesById.get(id) : undefined;
        const next = { ...quantities };
        const notes: string[] = [];
        if (!quantities[key] && quantity > 0) {
            // หมวดเลือกได้อย่างเดียว (เช่น แพ็กเกจ): เอาอันเดิมในหมวดออก
            const categoryId = categoryOfKey(key);
            if (categoryId && singleChoiceIds.has(categoryId)) {
                for (const otherKey of Object.keys(next)) {
                    if (otherKey === key || categoryOfKey(otherKey) !== categoryId) continue;
                    delete next[otherKey];
                    notes.push(`เปลี่ยนเป็น ${productPackage?.pkg_name ?? product?.product_name} แล้ว`);
                }
            }
            // แพ็กใหม่: งานเพิ่มที่มีในแพ็กแล้ว/ใช้กับแพ็กนี้ไม่ได้ เอาออกจากตะกร้า
            for (const rule of productPackage?.addon_rules ?? []) {
                if (!next[`p:${rule.product_id}`]) continue;
                delete next[`p:${rule.product_id}`];
                notes.push(
                    `เอา ${productsById.get(rule.product_id)?.product_name} ออก (${rule.rule === "included" ? "มีในแพ็กแล้ว" : "ใช้กับแพ็กนี้ไม่ได้"})`,
                );
            }
        }
        // งานเพิ่มแบบ % เลือกได้ครั้งเดียว
        const limit = product?.product_price_mode === "percent" ? 1 : MAX_SET_COUNT;
        if (quantity < 1) delete next[key];
        else next[key] = Math.min(quantity, limit);
        setQuantities(next);
        if (notes.length > 0) toast.info([...new Set(notes)].join(" · "));
    }

    async function copy(text: string, doneMessage: string) {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(doneMessage);
        } catch {
            toast.error("คัดลอกไม่ได้ ลองเลือกข้อความแล้วคัดลอกเอง");
        }
    }

    const allLines = cart.flatMap((line) => line.lines);
    const totals = cartTotals({ lines: allLines, vatRate: data.vat_rate });
    const fixedBase = fixedSubtotal(allLines);
    const amountOf = (lines: PricedLine[]) =>
        lines.reduce(
            (sum, item) =>
                sum +
                ("percent" in item
                    ? percentAmount(fixedBase, item.percent)
                    : lineAmount(item.unitPrice, item.quantity)),
            0n,
        );
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
    // ส่งตะกร้าไปด้วย (id + จำนวน) หน้ารับงานเลือกสินค้าไว้ให้ สร้างงานในโปรเจกต์ตอนบันทึก
    const newJobHref = `/fastwork/new?${new URLSearchParams({
        name: title.slice(0, 150),
        amount: offer,
        cart: selectionToParam(cart.map((line) => ({ key: line.key, quantity: line.quantity }))),
    })}`;
    const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);

    return (
        <div className={`grid w-full grid-cols-1 gap-5 ${cart.length > 0 ? "max-lg:pb-24" : ""}`}>
            {header}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
                <PriceCatalog
                    catalog={data.catalog}
                    quantities={quantities}
                    addonStateOf={addonStateOf}
                    onChange={setQuantity}
                />
                <PriceSummary
                    lines={cart.map((line) => ({
                        key: line.key,
                        name: line.name,
                        quantity: line.quantity,
                        amount: amountOf(line.lines),
                    }))}
                    vatRate={data.vat_rate}
                    vat={totals.vat}
                    offer={offer}
                    settings={settings}
                    payout={payout}
                    questionCount={questionCount}
                    newJobHref={newJobHref}
                    onAddToJob={() => setIsAddingToJob(true)}
                    onRemove={(key) => setQuantity(key, 0)}
                    onClear={() => setQuantities({})}
                    onCopyQuestions={() => copy(questionsText(groups), "คัดลอกคำถามแล้ว วางในแชต Fastwork ได้เลย")}
                    onCopyOffer={() => copy(offerText(cart, offer), "คัดลอกขอบเขตงานแล้ว วางในข้อเสนอ Fastwork ได้เลย")}
                />
            </div>
            {cart.length > 0 && <PriceMobileBar itemCount={itemCount} offer={offer} net={payout.net} />}
            {isAddingToJob && <AddToJobSheet title={title} offer={offer} tasks={tasksFromSources(cart.map((line) => line.taskSource))} onClose={() => setIsAddingToJob(false)} />}
        </div>
    );
}

// งานเพิ่มแบบ % คิดจากยอดรายการอื่น (เลือกได้ครั้งเดียว)
function productCartLine(product: CatalogProduct, quantity: number): CartLine {
    const isPercent = product.product_price_mode === "percent" && Boolean(product.product_percent);
    return {
        key: `p:${product.product_id}`,
        name: product.product_name,
        categoryId: product.product_category_id,
        quantity: isPercent ? 1 : quantity,
        unit: product.product_unit,
        packageItems: [],
        taskSource: { kind: "product", name: product.product_name, quantity: isPercent ? 1 : quantity, isPercent },
        lines: isPercent
            ? [{ percent: product.product_percent as string }]
            : [{ unitPrice: product.product_price, quantity: String(quantity) }],
    };
}

function packageCartLine(productPackage: CatalogPackage, quantity: number): CartLine {
    return {
        key: `k:${productPackage.pkg_id}`,
        name: productPackage.pkg_name,
        categoryId: productPackage.pkg_category_id,
        quantity,
        unit: "ชุด",
        packageItems: productPackage.items.map((item) =>
            Number(item.quantity) === 1
                ? item.name
                : `${item.name} × ${formatQuantity(item.quantity)}${item.unit ? ` ${item.unit}` : ""}`,
        ),
        taskSource: { kind: "package", name: productPackage.pkg_name, quantity, items: productPackage.items },
        lines: productPackage.items.map((item) => ({
            unitPrice: item.unit_price,
            quantity: multiplyQuantity(item.quantity, quantity),
        })),
    };
}
