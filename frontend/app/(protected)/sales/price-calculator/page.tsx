"use client";

// ตัวคิดราคา ขาย › ตัวคิดราคา (2026-11-01 · docs/plans/2026-11-01-calculator-direct-quotation.md · เดิม /fastwork/price 2026-10-25)
// 2 โหมด ตะกร้าเดียวกัน: ลูกค้าตรง (สิทธิ์สร้างใบเสนอราคา · ออกร่างใบจากตะกร้า) · Fastwork (สิทธิ์จัดการ Fastwork · ราคาเสนอ/ค่าธรรมเนียม/เงินเข้า)
// โหมดล่าสุดจำในเครื่อง · ?mode=fastwork|direct เปิดโหมดนั้น (ลิงก์เดิม /fastwork/price พามาโหมด Fastwork)
// เลือกสินค้า/ชุดจากหน้าร้าน (ชุดเดียวกับที่ผู้ซื้อเห็นในลิงก์) → ราคาเสนอ → หักค่าธรรมเนียมตามตั้งค่า → เงินเข้าบัญชีโดยประมาณ
// ทีมเลือกให้ลูกค้าได้อิสระ (2026-11-01): ทุกสินค้า/ชุดที่เปิดใช้งาน · กติกาหน้าร้าน (หมวดเลือกได้อย่างเดียว · งานเพิ่มที่มีในแพ็ก/ใช้ไม่ได้) เตือน ไม่เอาออกเอง · งานเพิ่มแบบ % ได้ครั้งเดียว
// คัดลอกคำถาม/ขอบเขตงานไปวางในแชต · สร้างงาน Fastwork จากตะกร้า (เติมชื่องานและงวดเดียวเท่าราคาเสนอ) · ไม่บันทึกอะไรในระบบ
// ราคาเริ่มต้น (2026-11-01): ช่องกรอกราคาจริงต่อสินค้า (ใช้กับแถวในชุดด้วย) · คัดลอก/สร้างงาน/เพิ่มงวด ก่อนตรวจราคา = ถามก่อน (กดใช้ราคาเดิมต่อได้)
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FieldHint from "@/components/ui/guidance/field-hint";
import FormField, { inputClass } from "@/components/ui/form-field";
import SectionCard from "@/components/ui/section-card";
import { PageSkeleton } from "@/components/ui/skeleton";
import { buttonClass } from "@/components/ui/button";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch, type ApiError } from "@/lib/api";
import { formatAmount, formatHundredths, formatQuantity } from "@/lib/shared/money.mjs";
import { Tags } from "lucide-react";
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
import type { FastworkSettings } from "../../fastwork/_types";
import PriceCatalog, { type AddonState } from "../../fastwork/price/_components/price-catalog";
import PriceSummary, { PriceMobileBar } from "../../fastwork/price/_components/price-summary";
import { offerText, priceListText, questionsText } from "../../fastwork/price/_components/price-texts";
import AddToJobSheet from "../../fastwork/price/_components/add-to-job-sheet";
import DirectSummary from "./_components/direct-summary";
import CreateQuotationSheet from "./_components/create-quotation-sheet";
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

/** ราคาที่ทีมกรอก (ราคาเริ่มต้น) · กรอกไม่ครบ/ผิดรูปแบบ = ใช้ราคาเริ่มต้นไปก่อน */
type StartingPrices = Record<string, string>;
const isPriceText = (value: string | undefined) => value !== undefined && /^\d+(\.\d{1,2})?$/.test(value.trim());

type Mode = "direct" | "fastwork";
const MODE_STORAGE_KEY = "price-calculator-mode";

function readSavedMode(): Mode | null {
    try {
        const saved = localStorage.getItem(MODE_STORAGE_KEY);
        return saved === "direct" || saved === "fastwork" ? saved : null;
    } catch {
        return null;
    }
}

export default function PriceCalculatorPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <PriceCalculator />
        </Suspense>
    );
}

function PriceCalculator() {
    const router = useRouter();
    const requestedMode = useSearchParams().get("mode");
    const hasBit = usePermission();
    const canFastwork = hasBit(BITS.manageFastwork);
    const canDirect = hasBit(BITS.createQuotation);
    const canManage = canFastwork || canDirect;
    // โหมด: ที่ขอใน URL → ที่ใช้ล่าสุด → ลูกค้าตรง (ถ้ามีสิทธิ์) · เห็นเฉพาะโหมดที่มีสิทธิ์
    const [preferredMode, setPreferredMode] = useState<Mode | null>(() =>
        requestedMode === "direct" || requestedMode === "fastwork" ? requestedMode : readSavedMode(),
    );
    const mode: Mode = !canFastwork ? "direct" : !canDirect ? "fastwork" : (preferredMode ?? "direct");
    const [isCreatingQuotation, setIsCreatingQuotation] = useState(false);

    function changeMode(next: Mode) {
        setPreferredMode(next);
        try {
            localStorage.setItem(MODE_STORAGE_KEY, next);
        } catch {
            // เครื่องไม่ให้เก็บ = จำไม่ได้ ไม่เป็นไร
        }
    }
    const [data, setData] = useState<PriceCatalog | null>(null);
    const [settings, setSettings] = useState<FastworkSettings | null>(null);
    const [loadError, setLoadError] = useState<ApiError | null>(null);
    const [quantities, setQuantities] = useState<Record<string, number>>({});
    const [isAddingToJob, setIsAddingToJob] = useState(false);
    const [showHidden, setShowHidden] = useState(false);
    // ราคาเริ่มต้น: ราคาจริงต่อสินค้า · สินค้าที่ทีมตรวจราคาแล้ว (แก้ราคา หรือกดใช้ราคาเดิมต่อ)
    const [startingPrices, setStartingPrices] = useState<StartingPrices>({});
    const [checkedPriceIds, setCheckedPriceIds] = useState<Set<string>>(new Set());
    const [guardedAction, setGuardedAction] = useState<(() => void) | null>(null);

    useEffect(() => {
        if (!canManage) return;
        let isLeftPage = false;
        // ค่าธรรมเนียม Fastwork โหลดเฉพาะคนที่มีสิทธิ์ Fastwork
        Promise.all([
            apiFetch<PriceCatalog>("/price-calculator/catalog"),
            canFastwork
                ? apiFetch<FastworkSettings>("/fastwork/settings")
                : Promise.resolve({ data: null, error: null }),
        ]).then(([catalogResult, settingsResult]) => {
            if (isLeftPage) return;
            setLoadError(catalogResult.error ?? settingsResult.error);
            if (catalogResult.data) setData(catalogResult.data);
            if (settingsResult.data) setSettings(settingsResult.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, [canManage, canFastwork]);

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
            if (product) productLines.push(productCartLine(product, quantity, startingPrices));
            if (productPackage) packageLines.push(packageCartLine(productPackage, quantity, startingPrices));
        }
        return [...packageLines, ...productLines];
    }, [quantities, productsById, packagesById, startingPrices]);

    const header = (
        <PageHeader
            eyebrow="ขาย · ตัวคิดราคา"
            title="ตัวคิดราคา"
            description={
                mode === "fastwork"
                    ? "เลือกสิ่งที่ผู้ซื้อต้องการ ดูราคาเสนอและเงินเข้าจริงหลังหักค่าธรรมเนียม Fastwork"
                    : "เลือกสิ่งที่ลูกค้าต้องการ ดูยอดทันที แล้วออกใบเสนอราคาจากตะกร้า"
            }
            actions={
                mode === "fastwork" && (
                    <Link href="/fastwork" className={buttonClass("secondary", "md")}>
                        หน้า Fastwork
                    </Link>
                )
            }
        />
    );
    if (!canManage) {
        return (
            <div className="grid w-full grid-cols-1 gap-6">
                {header}
                <StatusBanner tone="info" title="ต้องมีสิทธิ์สร้างใบเสนอราคา หรือจัดการงาน Fastwork" />
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
    if (!data || (mode === "fastwork" && !settings)) return <PageSkeleton />;

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
            // กติกาหน้าร้าน = คำเตือน (ทีมเลือกให้ลูกค้าได้อิสระ) · ไม่เอาของในตะกร้าออกเอง
            const categoryId = categoryOfKey(key);
            if (categoryId && singleChoiceIds.has(categoryId)) {
                for (const otherKey of Object.keys(next)) {
                    if (otherKey === key || categoryOfKey(otherKey) !== categoryId) continue;
                    const [otherKind, otherId] = otherKey.split(":");
                    const otherName =
                        otherKind === "k"
                            ? packagesById.get(otherId)?.pkg_name
                            : productsById.get(otherId)?.product_name;
                    notes.push(`หมวดนี้ลูกค้าเลือกได้อย่างเดียว · ตะกร้ามี ${otherName} อยู่แล้ว`);
                }
            }
            for (const rule of productPackage?.addon_rules ?? []) {
                if (!next[`p:${rule.product_id}`]) continue;
                notes.push(
                    `${productsById.get(rule.product_id)?.product_name} ${rule.rule === "included" ? "มีในแพ็กนี้แล้ว" : "ใช้กับแพ็กนี้ไม่ได้ (หน้าร้าน)"}`,
                );
            }
            const rule = product ? addonStateOf(product.product_id) : null;
            if (product && rule)
                notes.push(
                    `${product.product_name} ${rule.rule === "included" ? `มีใน ${rule.packageName} แล้ว` : `หน้าร้านใช้กับ ${rule.packageName} ไม่ได้`}`,
                );
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
    const payout = settings
        ? suggestPayoutAmounts({
              gross: offer,
              feeRate: settings.cs_fastwork_fee_rate,
              feeVatRate: settings.cs_fastwork_fee_vat_rate,
              whtRate: settings.cs_fastwork_wht_rate,
          })
        : null;
    // ยังไม่มีรายการที่ทีมเลือกให้ · Fastwork ถามแบบลิงก์ Fastwork (ไม่ถามช่องทางติดต่อนอกแพลตฟอร์ม) · ลูกค้าตรงถามแบบลิงก์ลูกค้าตรง
    // ยังไม่รู้คำตอบ = ข้อลูกขึ้นทุกข้อ
    const groups = visibleQuestionnaire(
        data.questionnaire,
        {
            linkKind: mode === "fastwork" ? "fastwork" : "public",
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

    // สินค้าราคาเริ่มต้นในตะกร้า (เดี่ยว + แถวในชุด) · สินค้าเดียวกันกรอกราคาครั้งเดียว
    const startingRows = [
        ...new Map(
            cart.flatMap((line) => {
                const [kind, id] = line.key.split(":");
                if (kind === "p") {
                    const product = productsById.get(id);
                    return product?.product_price_mode === "from"
                        ? [
                              [
                                  product.product_id,
                                  {
                                      productId: product.product_id,
                                      name: product.product_name,
                                      basePrice: product.product_price,
                                      note: product.product_price_note,
                                  },
                              ] as const,
                          ]
                        : [];
                }
                return (packagesById.get(id)?.items ?? [])
                    .filter((item) => item.needs_price && item.product_id)
                    .map(
                        (item) =>
                            [
                                item.product_id as string,
                                {
                                    productId: item.product_id as string,
                                    name: item.name,
                                    basePrice: item.unit_price,
                                    note: item.price_note,
                                },
                            ] as const,
                    );
            }),
        ).values(),
    ];
    const uncheckedRows = startingRows.filter((row) => !checkedPriceIds.has(row.productId));
    const priceOf = (row: (typeof startingRows)[number]) =>
        isPriceText(startingPrices[row.productId]) ? startingPrices[row.productId].trim() : row.basePrice;
    const priceNotes = startingRows.map(
        (row) => `${row.name} ${formatAmount(priceOf(row))} บาท${row.note ? ` (ราคาขึ้นกับ${row.note})` : ""}`,
    );

    /** ส่งราคาออกไป (คัดลอก/สร้างงาน/เพิ่มงวด): ยังไม่ตรวจราคาเริ่มต้น = ถามก่อน */
    function withPriceCheck(action: () => void) {
        if (uncheckedRows.length > 0) {
            setGuardedAction(() => action);
            return;
        }
        action();
    }

    return (
        <div className={`grid w-full grid-cols-1 gap-5 ${cart.length > 0 ? "max-lg:pb-24" : ""}`}>
            {header}
            {canFastwork && canDirect && (
                <Segmented<Mode>
                    label="โหมด"
                    value={mode}
                    onChange={changeMode}
                    options={[
                        { value: "direct", label: "ลูกค้าตรง" },
                        { value: "fastwork", label: "Fastwork" },
                    ]}
                />
            )}
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:items-start">
                <PriceCatalog
                    catalog={data.catalog}
                    quantities={quantities}
                    addonStateOf={addonStateOf}
                    onChange={setQuantity}
                    showHidden={showHidden}
                    onShowHiddenChange={setShowHidden}
                />
                <div className="grid gap-5">
                    {startingRows.length > 0 && (
                        <SectionCard
                            icon={Tags}
                            title="ราคาเริ่มต้น"
                            description="ราคาขึ้นกับรายละเอียดของผู้ซื้อ · กรอกราคาจริงก่อนเสนอ"
                        >
                            <div className="grid gap-3">
                                {startingRows.map((row) => (
                                    <FormField
                                        key={row.productId}
                                        label={`${row.name} (บาทต่อหน่วย)`}
                                        htmlFor={`starting_${row.productId}`}
                                        hint={`เริ่มต้น ${formatAmount(row.basePrice)} บาท${row.note ? ` · ขึ้นกับ${row.note}` : ""}${checkedPriceIds.has(row.productId) ? " · ตรวจแล้ว" : ""}`}
                                        error={
                                            startingPrices[row.productId] !== undefined &&
                                            !isPriceText(startingPrices[row.productId])
                                                ? "ใส่ตัวเลข เช่น 1200 (ตอนนี้ใช้ราคาเริ่มต้นไปก่อน)"
                                                : undefined
                                        }
                                    >
                                        <input
                                            id={`starting_${row.productId}`}
                                            inputMode="decimal"
                                            value={startingPrices[row.productId] ?? row.basePrice}
                                            onChange={(event) => {
                                                setStartingPrices((current) => ({
                                                    ...current,
                                                    [row.productId]: event.target.value,
                                                }));
                                                setCheckedPriceIds((current) => new Set([...current, row.productId]));
                                            }}
                                            className={`${inputClass(false)} text-right tabular-nums`}
                                        />
                                    </FormField>
                                ))}
                                <FieldHint>
                                    ใช้กับทุกแถวของสินค้านั้น (รวมแถวในชุด) · ราคาเสนอและขอบเขตงานที่คัดลอกใช้ราคานี้
                                </FieldHint>
                            </div>
                        </SectionCard>
                    )}
                    {mode === "direct" ? (
                        <DirectSummary
                            lines={cart.map((line) => ({
                                key: line.key,
                                name: line.name,
                                quantity: line.quantity,
                                amount: amountOf(line.lines),
                            }))}
                            vatRate={data.vat_rate}
                            subtotal={totals.subtotal}
                            vat={totals.vat}
                            total={totals.total}
                            questionCount={questionCount}
                            isEstimate={uncheckedRows.length > 0}
                            onCreateQuotation={() => withPriceCheck(() => setIsCreatingQuotation(true))}
                            onCopyPrices={() =>
                                withPriceCheck(() =>
                                    copy(
                                        priceListText(
                                            cart.map((line) => ({ ...line, amount: amountOf(line.lines) })),
                                            {
                                                subtotal: totals.subtotal,
                                                vat: totals.vat,
                                                total: totals.total,
                                                vatRate: data.vat_rate,
                                            },
                                            priceNotes,
                                        ),
                                        "คัดลอกรายการและราคาแล้ว วางในแชตลูกค้าได้เลย",
                                    ),
                                )
                            }
                            onCopyQuestions={() => copy(questionsText(groups), "คัดลอกคำถามแล้ว วางในแชตลูกค้าได้เลย")}
                            onRemove={(key) => setQuantity(key, 0)}
                            onClear={() => setQuantities({})}
                        />
                    ) : (
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
                            settings={settings as FastworkSettings}
                            payout={payout as NonNullable<typeof payout>}
                            questionCount={questionCount}
                            onNewJob={() => withPriceCheck(() => router.push(newJobHref))}
                            onAddToJob={() => withPriceCheck(() => setIsAddingToJob(true))}
                            onRemove={(key) => setQuantity(key, 0)}
                            onClear={() => setQuantities({})}
                            onCopyQuestions={() =>
                                copy(questionsText(groups), "คัดลอกคำถามแล้ว วางในแชต Fastwork ได้เลย")
                            }
                            onCopyOffer={() =>
                                withPriceCheck(() =>
                                    copy(
                                        offerText(cart, offer, priceNotes),
                                        "คัดลอกขอบเขตงานแล้ว วางในข้อเสนอ Fastwork ได้เลย",
                                    ),
                                )
                            }
                        />
                    )}
                </div>
            </div>
            <ConfirmDialog
                open={guardedAction !== null}
                title="ตรวจราคาเริ่มต้นแล้วหรือยัง?"
                description={`ยังไม่ได้แก้ราคา: ${uncheckedRows.map((row) => `${row.name} ${formatAmount(priceOf(row))} บาท`).join(", ")} · ใช้ราคานี้ต่อ หรือกลับไปกรอกราคาจริงในกล่องราคาเริ่มต้น`}
                confirmLabel="ใช้ราคานี้ต่อ"
                cancelLabel="กลับไปแก้ราคา"
                onConfirm={() => {
                    const action = guardedAction;
                    setCheckedPriceIds((current) => new Set([...current, ...startingRows.map((row) => row.productId)]));
                    setGuardedAction(null);
                    action?.();
                }}
                onCancel={() => setGuardedAction(null)}
            />
            {cart.length > 0 && <PriceMobileBar itemCount={itemCount} offer={offer} net={payout?.net ?? null} />}
            {isCreatingQuotation && (
                <CreateQuotationSheet
                    title={title}
                    lines={cart.map((line) => ({
                        kind: line.key.startsWith("k:") ? "package" : "product",
                        id: line.key.slice(2),
                        quantity: line.quantity,
                    }))}
                    startingPrices={Object.fromEntries(startingRows.map((row) => [row.productId, priceOf(row)]))}
                    onClose={() => setIsCreatingQuotation(false)}
                />
            )}
            {isAddingToJob && (
                <AddToJobSheet
                    title={title}
                    offer={offer}
                    tasks={tasksFromSources(cart.map((line) => line.taskSource))}
                    onClose={() => setIsAddingToJob(false)}
                />
            )}
        </div>
    );
}

// งานเพิ่มแบบ % คิดจากยอดรายการอื่น (เลือกได้ครั้งเดียว)
// ราคาเริ่มต้น: ใช้ราคาที่ทีมกรอก (ถ้ากรอกถูกรูปแบบ)
function productCartLine(product: CatalogProduct, quantity: number, startingPrices: StartingPrices): CartLine {
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
            : [
                  {
                      unitPrice:
                          product.product_price_mode === "from" && isPriceText(startingPrices[product.product_id])
                              ? startingPrices[product.product_id].trim()
                              : product.product_price,
                      quantity: String(quantity),
                  },
              ],
    };
}

function packageCartLine(productPackage: CatalogPackage, quantity: number, startingPrices: StartingPrices): CartLine {
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
            unitPrice:
                item.needs_price && item.product_id && isPriceText(startingPrices[item.product_id])
                    ? startingPrices[item.product_id].trim()
                    : item.unit_price,
            quantity: multiplyQuantity(item.quantity, quantity),
        })),
    };
}
