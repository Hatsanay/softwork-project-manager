"use client";

// หน้าร้านของลิงก์เลือกบริการ (2026-10-25 · S-1 · docs/plans/2026-10-25-client-order-link.md ข้อ 3, 5)
// ขั้น 1 เลือกบริการ (ตะกร้าจำไว้ในเครื่อง) → ขั้น 2 ตอบคำถาม (S-2 · เฉพาะกลุ่มที่เกี่ยว) → ขั้น 3 ข้อมูลติดต่อ ตรวจ และส่ง
// ตะกร้าแบบร้านออนไลน์: มือถือ = แถบล่างจอ กดเปิดแผ่นตะกร้า · จอคอม = แผงตะกร้าข้างขวา · แก้จำนวน/ลบได้ทุกขั้น
// โหลดราคาใหม่ (ราคาเปลี่ยน) ไม่ล้างสิ่งที่กรอกไว้
// ยอดคิดด้วย shared/order-cart-math.mjs ตัวเดียวกับ backend · ตอนส่ง backend คิดใหม่ ยอดไม่ตรง = แจ้งให้ดูยอดใหม่
// ลิงก์ Fastwork: ไม่ถามข้อมูลติดต่อ · บอกว่าราคาและการชำระเงินทำผ่าน Fastwork
// รายการที่ทีมเลือกให้ (ล็อก) อยู่บนสุดและในตะกร้าเสมอ · หมวดเลือกได้อย่างเดียว = ใส่อันใหม่แทนอันเดิม
// งานเพิ่มที่มีในแพ็กแล้ว = กดไม่ได้ · ใช้กับแพ็กไม่ได้ = ซ่อน · งานเพิ่มแบบ % คิดจากยอดรายการอื่น (เลือกได้ครั้งเดียว)
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Blocks,
    Check,
    ChevronUp,
    Code2,
    FileText,
    Globe,
    GraduationCap,
    Lock,
    ImageIcon,
    Megaphone,
    Package,
    Palette,
    Server,
    ShoppingBag,
    Smartphone,
    Sparkles,
    type LucideIcon,
} from "lucide-react";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { buttonClass } from "@/components/ui/button";
import { uploadedFileUrl } from "@/lib/api";
import { toFieldErrors, type FieldErrors } from "@/lib/form-errors";
import { formatAmount, formatHundredths } from "@/lib/shared/money.mjs";
import { cartTotals, fixedSubtotal, lineAmount, multiplyQuantity, percentAmount } from "@/lib/shared/order-cart-math.mjs";
import { MAX_SET_COUNT, orderContactSchema } from "@/lib/shared/schemas/order-link.mjs";
import { answerError, applicableGroups } from "@/lib/shared/requirement-answers.mjs";
import { publicFetch } from "../_public-api";
import type { Cart, Catalog, CatalogPackage, CatalogProduct, PresetItem, ShopResponse } from "../_types";
import OrderShell from "./order-shell";
import { CustomerSection } from "@/components/customer/customer-shell";
import OrderQuestions, { type AnswerValue } from "./order-questions";
import QuantityControl from "./quantity-control";
import { CartLines, CartSheet, CartSidePanel, CartTotalsBlock, type CartItem } from "./cart-panel";

type Step = "browse" | "questions" | "checkout";
type PricedLine = { unitPrice: string; quantity: string } | { percent: string };
type AddonRule = { rule: "included" | "not_available"; packageName: string };

const STORAGE_PREFIX = "order-cart:";
const ESTIMATE_NOTE = "ราคาประมาณการ ทีมงานจะยืนยันราคาสุดท้ายอีกครั้ง";
const FASTWORK_NOTE = "ราคาและการชำระเงินทำผ่าน Fastwork · หน้านี้ใช้เลือกขอบเขตงานเท่านั้น";

function readCart(code: string): Cart {
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + code);
        return raw ? (JSON.parse(raw) as Cart) : {};
    } catch {
        return {};
    }
}

function writeCart(code: string, cart: Cart) {
    try {
        if (Object.keys(cart).length === 0) localStorage.removeItem(STORAGE_PREFIX + code);
        else localStorage.setItem(STORAGE_PREFIX + code, JSON.stringify(cart));
    } catch {
        // เบราว์เซอร์ไม่ให้เก็บ (โหมดส่วนตัว) — ตะกร้ายังใช้ได้ แค่ไม่จำหลังปิดหน้า
    }
}

/** ตะกร้าที่ยังมีของจริงในหน้าร้าน (ของที่ถูกเอาออกจากร้านหายไปเอง) */
function validCart(cart: Cart, catalog: Catalog): Cart {
    const productIds = new Set(catalog.products.map((row) => row.product_id));
    const packageIds = new Set(catalog.packages.map((row) => row.pkg_id));
    return Object.fromEntries(
        Object.entries(cart).filter(([key, quantity]) => {
            if (!Number.isInteger(quantity) || quantity < 1) return false;
            const [kind, id] = key.split(":");
            return kind === "p" ? productIds.has(id) : packageIds.has(id);
        }),
    );
}

export function packagePrice(productPackage: CatalogPackage) {
    return productPackage.items.reduce((sum, item) => sum + lineAmount(item.unit_price, item.quantity), 0n);
}

/** ไอคอนแทนรูป (สินค้าที่ยังไม่มีรูป) — เดาจากชื่อหมวด · ไม่ตรงคำไหน = ไอคอนกลาง */
const CATEGORY_ICONS: { words: string[]; Icon: LucideIcon }[] = [
    { words: ["ออกแบบ", "ดีไซน์", "design", "ui"], Icon: Palette },
    { words: ["ข้อความ", "รูป", "บทความ", "content"], Icon: ImageIcon },
    { words: ["หน้า", "เนื้อหา", "page"], Icon: FileText },
    { words: ["ติดต่อ", "การตลาด", "โฆษณา", "marketing"], Icon: Megaphone },
    { words: ["ชื่อเว็บ", "โดเมน", "domain"], Icon: Globe },
    { words: ["ระบบเพิ่ม", "ระบบ", "system"], Icon: Blocks },
    { words: ["แอป", "มือถือ", "mobile", "app"], Icon: Smartphone },
    { words: ["โฮสติ้ง", "ดูแล", "เซิร์ฟเวอร์", "host", "server", "cloud"], Icon: Server },
    { words: ["อบรม", "ปรึกษา", "training", "consult"], Icon: GraduationCap },
    { words: ["เว็บ", "ซอฟต์แวร์", "พัฒนา", "web", "software", "dev"], Icon: Code2 },
];

function iconOf(categoryName: string | undefined): LucideIcon {
    const name = (categoryName ?? "").toLowerCase();
    return CATEGORY_ICONS.find((entry) => entry.words.some((word) => name.includes(word)))?.Icon ?? Sparkles;
}

const STEP_LABELS: Record<Step, string> = { browse: "เลือกบริการ", questions: "บอกความต้องการ", checkout: "ตรวจและส่ง" };

/**
 * ขั้นของหน้า (ไม่มีคำถาม = ข้ามขั้น 2) · แถบเท่ากันทุกขั้น หน้าตาเดียวกับเส้นทางในหน้าสถานะคำขอ
 * จอแคบ: ชื่อขั้นตัดบรรทัดในช่องตัวเอง ไม่ล้นลงบรรทัดใหม่ทั้งแถว
 */
function StepIndicator({ step, hasQuestions }: { step: Step; hasQuestions: boolean }) {
    const steps: Step[] = hasQuestions ? ["browse", "questions", "checkout"] : ["browse", "checkout"];
    const currentIndex = steps.indexOf(step);
    return (
        <ol className="grid max-w-md gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="ขั้นตอน">
            {steps.map((item, index) => {
                const isDone = index < currentIndex;
                const isCurrent = index === currentIndex;
                const bar = isDone ? "bg-blue-600" : isCurrent ? "bg-blue-400 motion-safe:animate-pulse" : "bg-gray-200";
                const text = isDone || isCurrent ? "text-gray-900" : "text-gray-500";
                return (
                    <li key={item} className="grid gap-1.5" aria-current={isCurrent ? "step" : undefined}>
                        <span className={`h-1.5 rounded-full ${bar}`} aria-hidden="true" />
                        <span className={`flex items-start gap-1 text-xs leading-snug ${text}`}>
                            {isDone ? <Check size={13} className="mt-px shrink-0" aria-hidden="true" /> : <span className="shrink-0 tabular-nums">{index + 1}.</span>}
                            <span className={isCurrent ? "font-medium" : undefined}>{STEP_LABELS[item]}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * เลื่อนไปข้อแรกที่ยังผิด (ลูกค้าอยู่ท้ายหน้าตอนกดถัดไป ป้ายเตือนอยู่บนสุด มองไม่เห็นว่าข้อไหน)
 * คำถาม = answers.<id> → กล่อง question_<id> · ข้อมูลติดต่อ = ชื่อช่องตรงกับ id ของช่อง
 * รอหน้าวาดข้อความสีแดงก่อน (setTimeout 0) แล้วเลื่อนให้อยู่กลางจอ
 */
function scrollToFirstError(fieldKeys: string[]) {
    const firstKey = fieldKeys[0];
    if (!firstKey) return;
    const elementId = firstKey.startsWith("answers.") ? `question_${firstKey.slice("answers.".length)}` : firstKey;
    window.setTimeout(() => {
        const element = document.getElementById(elementId) ?? document.getElementById(`${elementId}-hint`);
        if (!element) {
            window.scrollTo({ top: 0, behavior: "smooth" });
            return;
        }
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus({ preventScroll: true });
    }, 0);
}

/** แถวคิดเงินของสินค้า (แบบ % = คิดจากยอดรายการอื่น) และของชุด */
function productLines(product: CatalogProduct, quantity: number): PricedLine[] {
    if (product.product_price_mode === "percent" && product.product_percent) return [{ percent: product.product_percent }];
    return [{ unitPrice: product.product_price, quantity: String(quantity) }];
}

function packageLines(productPackage: CatalogPackage, quantity: number): PricedLine[] {
    return productPackage.items.map((item) => ({ unitPrice: item.unit_price, quantity: multiplyQuantity(item.quantity, quantity) }));
}

function presetLines(item: PresetItem): PricedLine[] {
    return item.kind === "product" ? productLines(item.product, item.quantity) : packageLines(item.package, item.quantity);
}

const percentLabel = (product: CatalogProduct) => `+${Number(product.product_percent)}% ของยอด`;

function priceLabel(price: string | bigint, unit: string | null) {
    const isZero = typeof price === "bigint" ? price === 0n : Number(price) === 0;
    if (isZero) return "สอบถามราคา";
    return `${formatAmount(price)} บาท${unit ? ` / ${unit}` : ""}`;
}

export default function OrderShop({ code, data, onReload }: { code: string; data: ShopResponse; onReload: () => Promise<void> }) {
    const router = useRouter();
    const catalog = data.catalog as Catalog;
    const isFastwork = data.link.kind === "fastwork";
    const [cart, setCart] = useState<Cart>(() => validCart(readCart(code), catalog));
    const [step, setStep] = useState<Step>("browse");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const prefill = data.prefill;
    const [contact, setContact] = useState({
        contact_name: prefill?.contact_name ?? "",
        contact_phone: prefill?.contact_phone ?? "",
        contact_email: prefill?.contact_email ?? "",
        contact_line: "",
        company_name: prefill?.company_name ?? "",
        wants_tax_invoice: prefill?.wants_tax_invoice ?? false,
        tax_id: prefill?.tax_id ?? "",
        address: prefill?.address ?? "",
        consent: false,
    });
    const [note, setNote] = useState("");
    const [website, setWebsite] = useState("");
    const [submitKey] = useState(() => crypto.randomUUID());
    const [errors, setErrors] = useState<FieldErrors>({});
    const [banner, setBanner] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [justAdded, setJustAdded] = useState<string | null>(null);
    const justAddedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
    const [files, setFiles] = useState<Record<number, File[]>>({});

    const productsById = useMemo(() => new Map(catalog.products.map((row) => [row.product_id, row])), [catalog]);
    const packagesById = useMemo(() => new Map(catalog.packages.map((row) => [row.pkg_id, row])), [catalog]);

    useEffect(() => () => {
        if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
    }, []);

    const preset = data.preset ?? [];
    const allowMore = data.allow_more !== false;
    const presetPackages = preset.flatMap((item) => (item.kind === "package" ? [item.package] : []));
    const presetCategoryIds = preset.map((item) => (item.kind === "product" ? item.product.product_category_id : item.package.pkg_category_id));
    const singleChoiceIds = new Set(catalog.categories.filter((category) => category.pc_is_single_choice).map((category) => category.pc_id));
    const categoryOfKey = (key: string) => {
        const [kind, id] = key.split(":");
        return kind === "p" ? productsById.get(id)?.product_category_id ?? null : packagesById.get(id)?.pkg_category_id ?? null;
    };

    function setQuantity(key: string, quantity: number) {
        const [kind, id] = key.split(":");
        const product = kind === "p" ? productsById.get(id) : undefined;
        const productPackage = kind === "k" ? packagesById.get(id) : undefined;
        const next = { ...cart };
        let message: string | null = null;
        if (!cart[key] && quantity > 0) {
            const name = product?.product_name ?? productPackage?.pkg_name ?? "";
            message = `เพิ่ม ${name} แล้ว`;
            // หมวดเลือกได้อย่างเดียว (เช่น แพ็กเกจ): เอาอันเดิมในหมวดออก
            const categoryId = categoryOfKey(key);
            if (categoryId && singleChoiceIds.has(categoryId)) {
                for (const otherKey of Object.keys(next)) {
                    if (otherKey === key || categoryOfKey(otherKey) !== categoryId) continue;
                    delete next[otherKey];
                    message = `เปลี่ยนเป็น ${name} แล้ว`;
                }
            }
            // แพ็กใหม่: งานเพิ่มที่มีในแพ็กแล้ว/ใช้กับแพ็กนี้ไม่ได้ เอาออกจากตะกร้า
            for (const rule of productPackage?.addon_rules ?? []) {
                if (!next[`p:${rule.product_id}`]) continue;
                delete next[`p:${rule.product_id}`];
                message = `${message} · เอางานเพิ่มที่${rule.rule === "included" ? "มีในแพ็กแล้ว" : "ใช้กับแพ็กนี้ไม่ได้"}ออกให้`;
            }
        }
        // งานเพิ่มแบบ % เลือกได้ครั้งเดียว
        const limit = product?.product_price_mode === "percent" ? 1 : MAX_SET_COUNT;
        if (quantity < 1) delete next[key];
        else next[key] = Math.min(quantity, limit);
        if (message) {
            setJustAdded(message);
            if (justAddedTimer.current) clearTimeout(justAddedTimer.current);
            justAddedTimer.current = setTimeout(() => setJustAdded(null), 2500);
        }
        setCart(next);
        writeCart(code, next);
    }

    // ตะกร้าที่ยังมีของในร้าน (หลังโหลดราคาใหม่ ของที่ถูกเอาออกไม่ถูกส่ง)
    const cartEntries = Object.entries(cart).filter(([key]) => {
        const [kind, id] = key.split(":");
        return kind === "p" ? productsById.has(id) : packagesById.has(id);
    });
    const cartPackages = [...presetPackages, ...cartEntries.flatMap(([key]) => (key.startsWith("k:") ? [packagesById.get(key.slice(2)) as CatalogPackage] : []))];
    /** กติกาของงานเพิ่มจากแพ็กในตะกร้า (รายการล็อก + ที่ลูกค้าเลือก) */
    function addonRuleOf(productId: string): AddonRule | null {
        for (const productPackage of cartPackages) {
            const rule = productPackage.addon_rules.find((item) => item.product_id === productId);
            if (rule) return { rule: rule.rule, packageName: productPackage.pkg_name };
        }
        return null;
    }

    // แถวคิดเงิน: รายการล็อก + ที่ลูกค้าเลือก · แถว % คิดจากผลรวมแถวราคาตายตัว (สูตรเดียวกับ backend)
    const pricedLines: PricedLine[] = [
        ...preset.flatMap(presetLines),
        ...cartEntries.flatMap(([key, quantity]) => {
            const [kind, id] = key.split(":");
            const product = productsById.get(id);
            const productPackage = packagesById.get(id);
            if (kind === "p" && product) return productLines(product, quantity);
            if (kind === "k" && productPackage) return packageLines(productPackage, quantity);
            return [];
        }),
    ];
    const totals = cartTotals({ lines: pricedLines, vatRate: data.vat_rate ?? null });
    const fixedBase = fixedSubtotal(pricedLines);
    const itemCount = preset.reduce((sum, item) => sum + item.quantity, 0) + Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);

    // หมวดเลือกได้อย่างเดียวที่ทีมเลือกให้แล้ว: ไม่แสดงรายการอื่นในหมวดนั้น
    const lockedCategoryIds = new Set(presetCategoryIds.filter((categoryId): categoryId is string => Boolean(categoryId) && singleChoiceIds.has(categoryId as string)));
    const isOffered = (categoryId: string | null) => !categoryId || !lockedCategoryIds.has(categoryId);
    const offeredPackages = catalog.packages.filter((row) => isOffered(row.pkg_category_id));
    const offeredProducts = catalog.products.filter((row) => isOffered(row.product_category_id) && addonRuleOf(row.product_id)?.rule !== "not_available");

    const visibleCategories = catalog.categories.filter(
        (category) => offeredProducts.some((row) => row.product_category_id === category.pc_id) || offeredPackages.some((row) => row.pkg_category_id === category.pc_id),
    );
    const hasUncategorized = offeredProducts.some((row) => !row.product_category_id) || offeredPackages.some((row) => !row.pkg_category_id);
    const inFilter = (categoryId: string | null) =>
        categoryFilter === "all" || (categoryFilter === "none" ? categoryId === null : categoryId === categoryFilter);
    // แพ็กเรียงจากราคาถูกไปแพง (แบบตารางราคา) · ราคาเท่ากันเรียงตามชื่อ
    const shownPackages = offeredPackages
        .filter((row) => inFilter(row.pkg_category_id))
        .sort((first, second) => {
            const difference = packagePrice(first) - packagePrice(second);
            if (difference !== 0n) return difference < 0n ? -1 : 1;
            return first.pkg_name.localeCompare(second.pkg_name, "th");
        });
    const shownProducts = offeredProducts.filter((row) => inFilter(row.product_category_id));

    // กลุ่มคำถาม: ทั่วไป + หมวด/ชุดของสิ่งที่เลือก (กติกาเดียวกับ backend)
    const cartCategoryIds = [...presetCategoryIds, ...cartEntries.map(([key]) => categoryOfKey(key))];
    const groups = applicableGroups(
        data.questionnaire ?? [],
        cartCategoryIds.filter((value): value is string => Boolean(value)),
        cartPackages.map((row) => row.pkg_id),
    );
    const hasQuestions = groups.some((group) => group.questions.length > 0);

    function questionErrors() {
        const found: FieldErrors = {};
        for (const group of groups) {
            for (const question of group.questions) {
                const error = answerError(question, answers[question.rqq_id] ?? null, files[question.rqq_id]?.length ?? 0);
                if (error) found[`answers.${question.rqq_id}`] = error;
            }
        }
        return found;
    }

    function goNext() {
        setBanner(null);
        if (step === "browse" && hasQuestions) {
            setStep("questions");
        } else {
            if (step === "questions") {
                const found = questionErrors();
                setErrors(found);
                if (Object.keys(found).length > 0) {
                    setBanner("ตอบข้อที่มี * ให้ครบ และแก้ข้อที่มีข้อความสีแดง");
                    scrollToFirstError(Object.keys(found));
                    return;
                }
            }
            setStep("checkout");
        }
        window.scrollTo({ top: 0 });
    }

    async function submit() {
        setBanner(null);
        let contactPayload: Record<string, unknown> | undefined;
        if (!isFastwork) {
            const checked = orderContactSchema.safeParse(contact);
            if (!checked.success) {
                const contactErrors = toFieldErrors(checked.error.issues);
                setErrors(contactErrors);
                setBanner("กรอกข้อมูลติดต่อให้ครบก่อนส่ง");
                scrollToFirstError(Object.keys(contactErrors));
                return;
            }
            contactPayload = contact;
        }
        setErrors({});
        setIsSubmitting(true);
        const askedQuestions = groups.flatMap((group) => group.questions);
        const payload = {
            submit_key: submitKey,
            items: cartEntries.map(([key, quantity]) => {
                const [kind, id] = key.split(":");
                return { kind: kind === "p" ? "product" : "package", id, quantity };
            }),
            contact: contactPayload,
            note,
            seen_total: formatHundredths(totals.total),
            website,
            answers: askedQuestions.filter((question) => question.rqq_type !== "file").map((question) => ({ question_id: question.rqq_id, value: answers[question.rqq_id] ?? null })),
        };
        // มีไฟล์แนบ = ส่งแบบ multipart (ข้อมูลอยู่ในช่อง payload) · ไม่มี = JSON
        const attached = askedQuestions.filter((question) => question.rqq_type === "file" && (files[question.rqq_id]?.length ?? 0) > 0);
        let body: unknown = payload;
        if (attached.length > 0) {
            const form = new FormData();
            form.append("payload", JSON.stringify(payload));
            for (const question of attached) {
                for (const file of files[question.rqq_id]) form.append(`file_${question.rqq_id}`, file, file.name);
            }
            body = form;
        }
        const { data: result, error } = await publicFetch<{ svr_id: string; access_token: string }>(`/order/${code}/requests`, { method: "POST", body });
        setIsSubmitting(false);
        if (error) {
            if (error.code === "ORDER_ALREADY_SUBMITTED" && error.fields.access_token) {
                router.push(`/order/r/${error.fields.access_token}`);
                return;
            }
            if (error.code === "ORDER_PRICE_CHANGED" || error.code === "ORDER_ITEM_UNAVAILABLE" || error.code === "ORDER_CART_RULE" || error.code === "ORDER_LINK_UNAVAILABLE") {
                setBanner(error.message);
                await onReload();
                return;
            }
            setErrors(error.fields);
            setBanner(error.message);
            if (Object.keys(error.fields).some((field) => field.startsWith("answers."))) setStep("questions");
            scrollToFirstError(Object.keys(error.fields));
            return;
        }
        writeCart(code, {});
        router.push(`/order/r/${result.access_token}`);
    }

    function updateContact<Field extends keyof typeof contact>(field: Field, value: (typeof contact)[Field]) {
        setContact((current) => ({ ...current, [field]: value }));
    }

    const subtitle = isFastwork ? "เลือกขอบเขตงาน" : "เลือกบริการและส่งความต้องการ";
    const categoryNameOf = (categoryId: string | null) => catalog.categories.find((category) => category.pc_id === categoryId)?.pc_name;
    const priceNote = isFastwork ? FASTWORK_NOTE : ESTIMATE_NOTE;
    // สินค้าแยกกลุ่มตามหมวด (ลำดับหมวดตามที่ตั้งไว้) · ไม่มีหมวด = "อื่นๆ" ท้ายสุด
    const productGroups = [
        ...catalog.categories.map((category) => ({ key: category.pc_id, name: category.pc_name, products: shownProducts.filter((row) => row.product_category_id === category.pc_id) })),
        { key: "none", name: "อื่นๆ", products: shownProducts.filter((row) => !row.product_category_id) },
    ].filter((group) => group.products.length > 0);
    const nextLabel = step === "browse" && hasQuestions ? "ถัดไป: บอกความต้องการ" : "ถัดไป: ตรวจและส่ง";

    // แถวในตะกร้า · ยอดแถวคิดเหมือนยอดรวม (ชุด = ผลรวมของรายการในชุดคูณจำนวนชุด · % = จากแถวราคาตายตัว)
    const lineTotalOf = (lines: PricedLine[]) => lines.reduce((sum, line) => sum + ("percent" in line ? percentAmount(fixedBase, line.percent) : lineAmount(line.unitPrice, line.quantity)), 0n);
    function productCartItem(key: string, product: CatalogProduct, quantity: number, isLocked: boolean): CartItem {
        const isPercent = product.product_price_mode === "percent";
        return {
            key,
            name: product.product_name,
            isPackage: false,
            isLocked,
            isPercent,
            quantity,
            priceText: isPercent ? percentLabel(product) : priceLabel(product.product_price, product.product_unit),
            lineTotal: lineTotalOf(productLines(product, quantity)),
            Icon: iconOf(categoryNameOf(product.product_category_id)),
            imageUrl: product.product_image_url,
            packageItems: [],
        };
    }
    function packageCartItem(key: string, productPackage: CatalogPackage, quantity: number, isLocked: boolean): CartItem {
        return {
            key,
            name: productPackage.pkg_name,
            isPackage: true,
            isLocked,
            isPercent: false,
            quantity,
            priceText: priceLabel(packagePrice(productPackage), "ชุด"),
            lineTotal: lineTotalOf(packageLines(productPackage, quantity)),
            Icon: Package,
            imageUrl: productPackage.pkg_image_url,
            packageItems: productPackage.items.map((item) => item.name),
        };
    }
    const cartItems: CartItem[] = [
        ...preset.map((item, index) =>
            item.kind === "product" ? productCartItem(`preset:${index}`, item.product, item.quantity, true) : packageCartItem(`preset:${index}`, item.package, item.quantity, true),
        ),
        ...cartEntries.flatMap(([key, quantity]): CartItem[] => {
            const [kind, id] = key.split(":");
            const product = productsById.get(id);
            const productPackage = packagesById.get(id);
            if (kind === "p" && product) return [productCartItem(key, product, quantity, false)];
            if (kind === "k" && productPackage) return [packageCartItem(key, productPackage, quantity, false)];
            return [];
        }),
    ];
    const closeCart = useCallback(() => setIsCartOpen(false), []);
    const cartPanelProps = {
        items: cartItems,
        totals,
        vatRate: data.vat_rate ?? null,
        note: priceNote,
        nextLabel,
        onChange: setQuantity,
        onNext: () => {
            setIsCartOpen(false);
            goNext();
        },
    };
    const categoryChips = [
        { value: "all", label: "ทั้งหมด" },
        ...visibleCategories.map((category) => ({ value: category.pc_id, label: category.pc_name })),
        ...(hasUncategorized ? [{ value: "none", label: "อื่นๆ" }] : []),
    ];

    return (
        <OrderShell shop={data.shop} subtitle={subtitle} wide={step === "browse"} hasBottomBar>
            {banner && (
                <StatusBanner tone="warn" title="ตรวจอีกครั้งก่อนส่ง">
                    {banner}
                </StatusBanner>
            )}

            {step === "browse" ? (
                <>
                    <section className="surface-hero p-[clamp(1.25rem,0.9rem+1.6vw,2.25rem)]">
                        <div className="grid gap-4">
                            <StepIndicator step={step} hasQuestions={hasQuestions} />
                            <div className="grid gap-1.5">
                                <h1 className="text-fluid-display font-medium text-gray-900">{isFastwork && data.buyer_name ? `สวัสดีคุณ ${data.buyer_name}` : "เลือกบริการที่ต้องการ"}</h1>
                                <p className="text-fluid-lead text-gray-500">
                                    {preset.length > 0
                                        ? allowMore
                                            ? "ทีมงานเลือกรายการที่ตกลงกันไว้ให้แล้ว เลือกงานเพิ่มได้ถ้าต้องการ แล้วกดถัดไป"
                                            : "ตรวจรายการที่ทีมงานเลือกให้ แล้วกดถัดไปเพื่อบอกความต้องการ"
                                        : isFastwork
                                          ? "เลือกสิ่งที่อยากได้ แล้วตอบคำถามสั้นๆ เพื่อให้ทีมประเมินงานได้ตรง"
                                          : "เลือกได้หลายรายการ เห็นยอดทันที แล้วบอกความต้องการให้ทีมงานประเมิน"}
                                </p>
                            </div>
                            <p className="w-fit rounded-full bg-blue-50 px-3 py-1 text-xs text-blue-700 ring-1 ring-blue-100">{priceNote}</p>
                        </div>
                    </section>

                    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
                        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-5">
                            {preset.length > 0 && <PresetSection items={preset} categoryNameOf={categoryNameOf} />}

                            {allowMore && categoryChips.length > 2 && (
                                <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="หมวด">
                                    <div className="flex w-max gap-2 pb-1">
                                        {categoryChips.map((chip) => (
                                            <button
                                                key={chip.value}
                                                type="button"
                                                aria-pressed={categoryFilter === chip.value}
                                                onClick={() => setCategoryFilter(chip.value)}
                                                className={`min-h-10 rounded-full border px-4 text-sm whitespace-nowrap transition ${
                                                    categoryFilter === chip.value ? "border-blue-600 bg-blue-600 text-white shadow-brand" : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                                                }`}
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!allowMore ? null : shownPackages.length === 0 && shownProducts.length === 0 ? (
                                <p className={`p-6 text-center text-sm text-gray-500 card-customer`}>ยังไม่มีบริการในหมวดนี้</p>
                            ) : (
                                <>
                                    {shownPackages.length > 0 && (
                                        <section className="grid gap-3" aria-labelledby="packages-title">
                                            <h2 id="packages-title" className="text-fluid-title flex items-center gap-2 font-medium text-gray-900">
                                                <Package size={18} className="text-blue-600" aria-hidden="true" />
                                                ชุดบริการ (รวมหลายอย่างในชุดเดียว)
                                            </h2>
                                            <ul className={`grid gap-3 ${shownPackages.length > 1 ? "sm:grid-cols-2" : ""} ${shownPackages.length > 2 ? "xl:grid-cols-3" : ""}`}>
                                                {shownPackages.map((productPackage) => (
                                                    <PackageCard
                                                        key={productPackage.pkg_id}
                                                        productPackage={productPackage}
                                                        quantity={cart[`k:${productPackage.pkg_id}`] ?? 0}
                                                        onChange={(quantity) => setQuantity(`k:${productPackage.pkg_id}`, quantity)}
                                                    />
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                    {shownProducts.length > 0 && (
                                        <section className="grid gap-3" aria-labelledby="products-title">
                                            <h2 id="products-title" className="text-fluid-title flex items-center gap-2 font-medium text-gray-900">
                                                <Sparkles size={18} className="text-blue-600" aria-hidden="true" />
                                                บริการแยกรายการ
                                            </h2>
                                            {productGroups.map((group) => (
                                                <div key={group.key} className="grid gap-2">
                                                    {productGroups.length > 1 && <h3 className="text-sm font-medium text-gray-500">{group.name}</h3>}
                                                    <ul className="grid gap-2.5 sm:grid-cols-2">
                                                        {group.products.map((product) => (
                                                            <ProductCard
                                                                key={product.product_id}
                                                                product={product}
                                                                rule={addonRuleOf(product.product_id)}
                                                                percentAmountText={product.product_price_mode === "percent" && product.product_percent ? formatAmount(percentAmount(fixedBase, product.product_percent)) : null}
                                                                Icon={iconOf(categoryNameOf(product.product_category_id))}
                                                                quantity={cart[`p:${product.product_id}`] ?? 0}
                                                                onChange={(quantity) => setQuantity(`p:${product.product_id}`, quantity)}
                                                            />
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </section>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="hidden lg:sticky lg:top-20 lg:block">
                            <CartSidePanel {...cartPanelProps} />
                        </div>
                    </div>
                </>
            ) : step === "questions" ? (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep("browse")}>
                            <ArrowLeft size={16} />
                            กลับไปเลือกบริการ
                        </button>
                        <div className="w-full sm:w-96">
                            <StepIndicator step={step} hasQuestions={hasQuestions} />
                        </div>
                    </div>
                    <OrderQuestions
                        groups={groups}
                        answers={answers}
                        files={files}
                        errors={errors}
                        onAnswer={(questionId, value) => setAnswers((current) => ({ ...current, [questionId]: value }))}
                        onFiles={(questionId, list) => setFiles((current) => ({ ...current, [questionId]: list }))}
                    />
                </>
            ) : (
                <>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setStep(hasQuestions ? "questions" : "browse")}>
                            <ArrowLeft size={16} />
                            {hasQuestions ? "กลับไปแก้คำตอบ" : "กลับไปเลือกบริการ"}
                        </button>
                        <div className="w-full sm:w-96">
                            <StepIndicator step={step} hasQuestions={hasQuestions} />
                        </div>
                    </div>
                    <CustomerSection
                        index={1}
                        id="summary"
                        title="สิ่งที่เลือก"
                        actions={
                            allowMore && (
                                <button type="button" className="-my-2 min-h-10 text-sm text-blue-600 hover:underline" onClick={() => setStep("browse")}>
                                    + เลือกเพิ่ม
                                </button>
                            )
                        }
                    >
                        {cartItems.length === 0 ? (
                            <p className="text-sm text-gray-500">ตะกร้าว่างแล้ว กด &quot;เลือกเพิ่ม&quot; เพื่อเลือกบริการ</p>
                        ) : (
                            <CartLines items={cartItems} onChange={setQuantity} />
                        )}
                        <CartTotalsBlock totals={totals} vatRate={data.vat_rate ?? null} note={priceNote} />
                    </CustomerSection>

                    {!isFastwork && (
                        <CustomerSection index={2} id="contact" title="ข้อมูลติดต่อ" description="ทีมงานใช้ติดต่อกลับเรื่องรายละเอียดและใบเสนอราคา">
                            <div className="grid gap-3 sm:grid-cols-2">
                                <FormField label="ชื่อผู้ติดต่อ" htmlFor="contact_name" required error={errors.contact_name}>
                                    <input id="contact_name" autoComplete="name" value={contact.contact_name} onChange={(event) => updateContact("contact_name", event.target.value)} className={inputClass(Boolean(errors.contact_name))} />
                                </FormField>
                                <FormField label="เบอร์โทร" htmlFor="contact_phone" required error={errors.contact_phone}>
                                    <input id="contact_phone" type="tel" inputMode="tel" autoComplete="tel" value={contact.contact_phone} onChange={(event) => updateContact("contact_phone", event.target.value)} className={inputClass(Boolean(errors.contact_phone))} />
                                </FormField>
                                <FormField label="อีเมล" htmlFor="contact_email" hint="ไม่บังคับ" error={errors.contact_email}>
                                    <input id="contact_email" type="email" inputMode="email" autoComplete="email" value={contact.contact_email} onChange={(event) => updateContact("contact_email", event.target.value)} className={inputClass(Boolean(errors.contact_email))} />
                                </FormField>
                                <FormField label="LINE ID" htmlFor="contact_line" hint="ไม่บังคับ" error={errors.contact_line}>
                                    <input id="contact_line" value={contact.contact_line} onChange={(event) => updateContact("contact_line", event.target.value)} className={inputClass(Boolean(errors.contact_line))} />
                                </FormField>
                                <FormField label="ชื่อบริษัท/ร้าน" htmlFor="company_name" hint="ไม่บังคับ" error={errors.company_name} className="sm:col-span-2">
                                    <input id="company_name" autoComplete="organization" value={contact.company_name} onChange={(event) => updateContact("company_name", event.target.value)} className={inputClass(Boolean(errors.company_name))} />
                                </FormField>
                            </div>
                            <label className="flex min-h-11 items-start gap-3 text-sm text-gray-800">
                                <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-600" checked={contact.wants_tax_invoice} onChange={(event) => updateContact("wants_tax_invoice", event.target.checked)} />
                                ต้องการใบกำกับภาษี/ใบเสร็จในนามบริษัท
                            </label>
                            {contact.wants_tax_invoice && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <FormField label="เลขประจำตัวผู้เสียภาษี" htmlFor="tax_id" required error={errors.tax_id}>
                                        <input id="tax_id" inputMode="numeric" value={contact.tax_id} onChange={(event) => updateContact("tax_id", event.target.value)} className={inputClass(Boolean(errors.tax_id))} />
                                    </FormField>
                                    <FormField label="ที่อยู่สำหรับออกเอกสาร" htmlFor="address" required error={errors.address} className="sm:col-span-2">
                                        <textarea id="address" rows={2} value={contact.address} onChange={(event) => updateContact("address", event.target.value)} className={inputClass(Boolean(errors.address))} />
                                    </FormField>
                                </div>
                            )}
                        </CustomerSection>
                    )}

                    <CustomerSection index={isFastwork ? 2 : 3} id="send" title="ฝากถึงทีมงาน" description="ไม่บังคับ · ตรวจแล้วกดส่งคำขอที่แถบด้านล่าง">
                        <FormField label="ข้อความถึงทีมงาน" htmlFor="order_note" hint="ไม่บังคับ เช่น อยากได้ภายในวันไหน มีตัวอย่างที่ชอบ" error={errors.note}>
                            <textarea id="order_note" rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className={inputClass(Boolean(errors.note))} />
                        </FormField>
                        {/* ช่องดักบอท: ซ่อนจากคน (ไม่ใช้ display:none เพื่อให้บอทกรอก) */}
                        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                            <label htmlFor="order_website">เว็บไซต์</label>
                            <input id="order_website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
                        </div>
                        {!isFastwork && (
                            <div className="grid gap-1">
                                <label className="flex min-h-11 items-start gap-3 text-sm text-gray-800">
                                    <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-blue-600" checked={contact.consent} onChange={(event) => updateContact("consent", event.target.checked)} />
                                    <span>
                                        ยินยอมให้เก็บชื่อ เบอร์โทร และข้อมูลที่กรอก เพื่อติดต่อกลับและจัดทำใบเสนอราคาของงานนี้เท่านั้น ไม่เปิดเผยต่อผู้อื่น · ขอลบข้อมูลได้โดยแจ้งทีมงาน
                                    </span>
                                </label>
                                <FieldHint error={errors.consent} />
                            </div>
                        )}
                    </CustomerSection>
                </>
            )}

            <CartBar
                itemCount={itemCount}
                total={totals.total}
                step={step}
                nextLabel={nextLabel}
                justAdded={justAdded}
                isSubmitting={isSubmitting}
                onOpenCart={() => setIsCartOpen(true)}
                onNext={goNext}
                onSubmit={submit}
            />
            {isCartOpen && <CartSheet {...cartPanelProps} onClose={closeCart} />}
        </OrderShell>
    );
}

/** รายการที่ทีมเลือกให้ (ล็อก): ลูกค้าเห็นว่าตกลงอะไรไว้ แก้ไม่ได้ */
function PresetSection({ items, categoryNameOf }: { items: PresetItem[]; categoryNameOf: (categoryId: string | null) => string | undefined }) {
    return (
        <section className="grid gap-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5" aria-labelledby="preset-title">
            <h2 id="preset-title" className="text-fluid-title flex items-center gap-2 font-medium text-gray-900">
                <Lock size={17} className="text-blue-600" aria-hidden="true" />
                ทีมงานเลือกให้แล้ว
            </h2>
            <ul className="grid gap-2.5">
                {items.map((item, index) => {
                    const isPackage = item.kind === "package";
                    const name = isPackage ? item.package.pkg_name : item.product.product_name;
                    const Icon = isPackage ? Package : iconOf(categoryNameOf(item.product.product_category_id));
                    const price = isPackage
                        ? priceLabel(packagePrice(item.package), "ชุด")
                        : item.product.product_price_mode === "percent"
                          ? percentLabel(item.product)
                          : priceLabel(item.product.product_price, item.product.product_unit);
                    return (
                        <li key={index} className="flex gap-3 rounded-xl bg-white p-3 shadow-card">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                <Icon size={20} aria-hidden="true" />
                            </span>
                            <div className="grid min-w-0 flex-1 gap-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                    <span className="text-sm font-medium wrap-break-word text-gray-900">{name}</span>
                                    <span className="text-sm text-blue-700 tabular-nums">
                                        {price} × {item.quantity}
                                    </span>
                                </div>
                                {isPackage && (
                                    <ul className="grid gap-0.5 text-xs text-gray-600">
                                        {item.package.items.map((packageItem, itemIndex) => (
                                            <li key={itemIndex} className="flex items-start gap-1.5">
                                                <Check size={12} className="mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                                                <span className="min-w-0 wrap-break-word">{packageItem.name}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
            <p className="text-xs text-gray-600">รายการนี้ทีมงานเลือกตามที่คุยกันไว้ แก้หรือเอาออกเองไม่ได้ · อยากเปลี่ยนให้ทักทีมงาน</p>
        </section>
    );
}

function ProductCard({
    product,
    rule,
    percentAmountText,
    Icon,
    quantity,
    onChange,
}: {
    product: CatalogProduct;
    rule: AddonRule | null;
    percentAmountText: string | null;
    Icon: LucideIcon;
    quantity: number;
    onChange: (quantity: number) => void;
}) {
    const isSelected = quantity > 0;
    const isIncluded = rule?.rule === "included";
    const isPercent = product.product_price_mode === "percent";
    return (
        <li
            className={`relative flex gap-3 rounded-2xl border p-3 shadow-card transition ${
                isIncluded ? "border-gray-200 bg-gray-50" : isSelected ? "border-blue-300 bg-white ring-2 ring-blue-100" : "border-gray-200 bg-white"
            }`}
        >
            {product.product_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadedFileUrl(product.product_image_url)} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" loading="lazy" />
            ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-50 to-blue-100 text-blue-600">
                    <Icon size={26} aria-hidden="true" />
                </span>
            )}
            <div className="grid min-w-0 flex-1 content-between gap-2">
                <div className="grid gap-0.5">
                    <h3 className="text-sm font-medium wrap-break-word text-gray-900">{product.product_name}</h3>
                    {product.product_description && <p className="line-clamp-2 text-xs text-gray-500">{product.product_description}</p>}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    {isPercent ? (
                        <span className="grid text-sm font-medium text-blue-700 tabular-nums">
                            {percentLabel(product)}
                            {percentAmountText && <span className="text-xs font-normal text-gray-500">ตอนนี้ {percentAmountText} บาท</span>}
                        </span>
                    ) : (
                        <span className="text-sm font-medium text-blue-700 tabular-nums">{priceLabel(product.product_price, product.product_unit)}</span>
                    )}
                    {isIncluded ? (
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                            <Check size={13} aria-hidden="true" />
                            มีใน{rule.packageName}แล้ว
                        </span>
                    ) : isPercent ? (
                        <button
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => onChange(isSelected ? 0 : 1)}
                            className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition active:scale-95 ${
                                isSelected ? "border border-blue-200 bg-white text-blue-700" : "bg-blue-600 text-white shadow-brand hover:bg-blue-700"
                            }`}
                        >
                            {isSelected ? <Check size={16} aria-hidden="true" /> : null}
                            {isSelected ? "เลือกแล้ว (กดเอาออก)" : "+ เลือก"}
                        </button>
                    ) : (
                        <QuantityControl quantity={quantity} onChange={onChange} label={product.product_name} compact />
                    )}
                </div>
            </div>
        </li>
    );
}

function PackageCard({ productPackage, quantity, onChange }: { productPackage: CatalogPackage; quantity: number; onChange: (quantity: number) => void }) {
    const isSelected = quantity > 0;
    const price = packagePrice(productPackage);
    return (
        <li className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-card transition ${isSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-gray-200"}`}>
            {productPackage.pkg_image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={uploadedFileUrl(productPackage.pkg_image_url)} alt="" className="aspect-[16/9] w-full object-cover" loading="lazy" />
            )}
            <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
                <div className="grid gap-1">
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-medium wrap-break-word text-gray-900">{productPackage.pkg_name}</h3>
                        {isSelected && (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                                <Check size={12} aria-hidden="true" />
                                เลือกแล้ว
                            </span>
                        )}
                    </div>
                    {productPackage.pkg_description && <p className="text-sm whitespace-pre-line text-gray-500">{productPackage.pkg_description}</p>}
                </div>
                <div className="flex items-baseline gap-1.5">
                    {price === 0n ? (
                        <span className="text-xl font-medium text-blue-700">สอบถามราคา</span>
                    ) : (
                        <>
                            {/* ราคาตัวใหญ่: ไม่แสดง .00 ให้อ่านง่าย (ตะกร้าและยอดรวมยังแสดงทศนิยมครบ) */}
                            <span className="text-3xl font-medium text-blue-700 tabular-nums">{formatAmount(price).replace(/.00$/, "")}</span>
                            <span className="text-sm text-gray-500">บาท</span>
                        </>
                    )}
                </div>
                <ul className="grid flex-1 content-start gap-2 border-t border-gray-100 pt-4 text-sm text-gray-700">
                    {productPackage.items.map((item, index) => (
                        <li key={index} className="flex items-start gap-2">
                            <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                                <Check size={12} aria-hidden="true" />
                            </span>
                            <span className="min-w-0 wrap-break-word">
                                {item.name}
                                {/* จำนวน 1 ไม่ต้องบอก (เช่น "ดูแลฟรี 30 วัน") */}
                                {Number(item.quantity) !== 1 && (
                                    <span className="text-gray-500 tabular-nums">
                                        {" "}· {Number(item.quantity)} {item.unit ?? ""}
                                    </span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
                <QuantityControl quantity={quantity} onChange={onChange} label={productPackage.pkg_name} fullWidth />
            </div>
        </li>
    );
}

/**
 * แถบตะกร้าล่างจอ · กดฝั่งซ้าย = เปิดตะกร้า · ใส่ของใหม่ = บอก "เพิ่ม ... แล้ว" ชั่วครู่
 * ขั้นเลือกบริการบนจอคอมซ่อน (มีแผงตะกร้าข้างขวาแทน)
 */
function CartBar({
    itemCount,
    total,
    step,
    nextLabel,
    justAdded,
    isSubmitting,
    onOpenCart,
    onNext,
    onSubmit,
}: {
    itemCount: number;
    total: bigint;
    step: Step;
    nextLabel: string;
    justAdded: string | null;
    isSubmitting: boolean;
    onOpenCart: () => void;
    onNext: () => void;
    onSubmit: () => void;
}) {
    const isEmpty = itemCount === 0;
    return (
        <div className={`fixed inset-x-0 bottom-0 z-30 px-3 pb-3 ${step === "browse" ? "lg:hidden" : ""}`} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}>
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white/95 p-2 shadow-float backdrop-blur">
                <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 text-left hover:bg-gray-50 disabled:hover:bg-transparent"
                    disabled={isEmpty}
                    onClick={onOpenCart}
                    aria-label={isEmpty ? "ตะกร้าว่าง" : `เปิดตะกร้า ${itemCount} ชิ้น`}
                >
                    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isEmpty ? "bg-gray-100 text-gray-400" : "bg-blue-50 text-blue-600"}`}>
                        <ShoppingBag size={20} aria-hidden="true" />
                        {!isEmpty && (
                            <span key={itemCount} className="absolute -top-1.5 -right-1.5 min-w-5 animate-[pulse_0.6s_ease-out_1] rounded-full bg-blue-600 px-1.5 text-center text-xs font-medium text-white tabular-nums">
                                {itemCount}
                            </span>
                        )}
                    </span>
                    <span className="grid min-w-0">
                        {justAdded ? (
                            <span className="flex items-center gap-1 truncate text-xs font-medium text-green-600" aria-live="polite">
                                <Check size={13} aria-hidden="true" />
                                {justAdded}
                            </span>
                        ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                                {isEmpty ? "ยังไม่ได้เลือก" : "ดูตะกร้า"}
                                {!isEmpty && <ChevronUp size={13} aria-hidden="true" />}
                            </span>
                        )}
                        <span className="truncate text-base font-medium text-gray-900 tabular-nums">{formatAmount(total)} บาท</span>
                    </span>
                </button>
                {step !== "checkout" ? (
                    <button type="button" className={`${buttonClass("primary", "md")} min-h-11 shrink-0`} disabled={isEmpty} onClick={onNext}>
                        <span className="sm:hidden">ถัดไป</span>
                        <span className="hidden sm:inline">{nextLabel}</span>
                        <ArrowRight size={16} aria-hidden="true" />
                    </button>
                ) : (
                    <button type="button" className={`${buttonClass("primary", "md")} min-h-11 shrink-0`} disabled={isEmpty || isSubmitting} onClick={onSubmit}>
                        {isSubmitting ? "กำลังส่ง..." : "ส่งคำขอ"}
                    </button>
                )}
            </div>
        </div>
    );
}
