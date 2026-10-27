"use client";

// ดูมุมมองลูกค้า (2026-10-26 Q-2 · docs/plans/2026-10-26-customer-questions.md ข้อ 4.5)
// ซ้าย = สถานการณ์ (ชนิดลิงก์ · ชุด/สินค้าที่เลือก · ทีมงานเลือกให้แล้ว) · ขวา = หน้าคำถามแบบที่ลูกค้าเห็นจริง ตอบเล่นได้ ข้อลูกโผล่จริง ไม่บันทึก
// ใช้กติกาเดียวกับหน้าร้าน (visibleQuestionnaire) และคอมโพเนนต์เดียวกับหน้าร้าน (OrderQuestions) → เห็นอะไรที่นี่ ลูกค้าเห็นแบบนั้น
// Q-3: เปิดจากฟอร์มลิงก์ = ตั้งสถานการณ์จากลิงก์นั้นให้แล้ว (initial) · ในแท็บคำถามเลือก "ใช้ค่าจากลิงก์" ได้ (links)
// กลุ่มที่ลิงก์ถามเพิ่ม/ไม่ถาม ติดมากับสถานการณ์ แก้ที่ฟอร์มลิงก์เท่านั้น
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { questionnaireSummary, visibleQuestionnaire } from "@/lib/shared/requirement-answers.mjs";
import OrderQuestions, { type AnswerValue } from "@/app/order/_components/order-questions";
import type { RequirementGroup, VisibleRequirementGroup } from "@/app/order/_types";
import { todayBangkokText } from "../../../people/employees/_card-status";
import type { ProductCategory } from "../_types";
import type { LinkableItems } from "./requirement-labels";
import {
    activeQuestionnaire,
    categoryIdsOf,
    EMPTY_SCENARIO,
    scenarioOfLink,
    type PreviewScenario,
    type ScenarioLink,
} from "./requirement-scenario";

type PreviewLinkKind = PreviewScenario["linkKind"];

// เกินนี้ลูกค้าเริ่มเหนื่อย (แบบข้อ 4.4) · เตือนให้ลองตัดหรือย้ายไปเป็นข้อลูก
const MANY_QUESTIONS = 15;
const MANY_REQUIRED = 8;

export default function CustomerPreviewSheet({
    groups,
    categories,
    items,
    initial = EMPTY_SCENARIO,
    links = [],
    onClose,
}: {
    groups: RequirementGroup[];
    categories: ProductCategory[];
    items: LinkableItems;
    initial?: PreviewScenario;
    links?: ScenarioLink[];
    onClose: () => void;
}) {
    const [linkKind, setLinkKind] = useState<PreviewLinkKind>(initial.linkKind);
    const [packageIds, setPackageIds] = useState<string[]>(initial.packageIds);
    const [productIds, setProductIds] = useState<string[]>(initial.productIds);
    const [hasPreset, setHasPreset] = useState(initial.hasPreset);
    const [rules, setRules] = useState({ include: initial.includeGroupIds, exclude: initial.excludeGroupIds });
    const [linkId, setLinkId] = useState("");
    const [productSearch, setProductSearch] = useState("");
    const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
    const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
    const [files, setFiles] = useState<Record<number, File[]>>({});

    // เปิดซ้อนบนแผ่นอื่นได้ (ฟอร์มลิงก์): Esc ปิดแค่แผ่นนี้ · ฟังแบบ capture แล้วหยุด ไม่ให้แผ่นข้างล่างปิดตาม
    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape") return;
            event.stopImmediatePropagation();
            onClose();
        }
        window.addEventListener("keydown", handleKeyDown, true);
        return () => window.removeEventListener("keydown", handleKeyDown, true);
    }, [onClose]);

    const visible = visibleQuestionnaire(
        activeQuestionnaire(groups),
        {
            linkKind,
            categoryIds: categoryIdsOf(items, packageIds, productIds),
            packageIds,
            productIds,
            hasPreset,
            includeGroupIds: rules.include,
            excludeGroupIds: rules.exclude,
        },
        answers,
    ) as VisibleRequirementGroup[];

    function applyLink(value: string) {
        setLinkId(value);
        const link = links.find((row) => String(row.ol_id) === value);
        const scenario = link ? scenarioOfLink(link) : EMPTY_SCENARIO;
        setLinkKind(scenario.linkKind);
        setPackageIds(scenario.packageIds);
        setProductIds(scenario.productIds);
        setHasPreset(scenario.hasPreset);
        setRules({ include: scenario.includeGroupIds, exclude: scenario.excludeGroupIds });
    }
    const ruleNote =
        rules.include.length + rules.exclude.length > 0
            ? `ลิงก์นี้ถามเพิ่ม ${rules.include.length} กลุ่ม · ไม่ถาม ${rules.exclude.length} กลุ่ม (แก้ที่ฟอร์มลิงก์)`
            : null;
    const summary = questionnaireSummary(visible);

    function reasonOf(group: VisibleRequirementGroup) {
        const names = [
            ...group.matched.package_ids.map((id) => items.packages.find((row) => row.pkg_id === id)?.pkg_name),
            ...group.matched.product_ids.map((id) => items.products.find((row) => row.product_id === id)?.product_name),
            ...group.matched.category_ids.map((id) => categories.find((category) => category.pc_id === id)?.pc_name),
        ].filter((name): name is string => Boolean(name));
        return names.length > 0 ? `ถามเพราะคุณเลือก ${[...new Set(names)].join(", ")}` : null;
    }

    const keyword = productSearch.trim().toLowerCase();
    const shownProducts = items.products.filter(
        (row) =>
            productIds.includes(row.product_id) || keyword === "" || row.product_name.toLowerCase().includes(keyword),
    );
    const toggle = (list: string[], id: string, isOn: boolean) =>
        isOn ? [...list, id] : list.filter((value) => value !== id);

    // วางที่ body (portal): เปิดจากในฟอร์มลิงก์แล้วกด Enter ในช่องของหน้านี้ ฟอร์มลิงก์ต้องไม่ถูกส่ง
    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="preview-title"
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[94dvh] w-full max-w-6xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-t-2xl bg-white shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-4 sm:p-5">
                    <div className="grid gap-0.5">
                        <h2 id="preview-title" className="text-base font-medium text-gray-900">
                            ดูมุมมองลูกค้า
                        </h2>
                        <p className="text-sm text-gray-500">
                            ตั้งสถานการณ์ แล้วดูว่าลูกค้าเห็นคำถามข้อไหน · ลองตอบได้ ข้อที่ถามตามคำตอบจะโผล่จริง ·
                            ไม่บันทึก
                        </p>
                        {/* สรุปอยู่บนหัวแผ่น: มือถือเห็นทันทีแม้สถานการณ์ยาวเต็มจอ */}
                        <p
                            className="mt-1 w-fit rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 ring-1 ring-blue-100"
                            aria-live="polite"
                        >
                            {summary.questionCount === 0
                                ? "สถานการณ์นี้ลูกค้าไม่เห็นคำถามเลย (ข้ามขั้นตอบคำถามไปตรวจและส่ง)"
                                : `ลูกค้าเห็น ${visible.length} กลุ่ม ${summary.questionCount} ข้อ · ต้องตอบ ${summary.requiredCount} ข้อ · ราว ${summary.minutes} นาที`}
                        </p>
                        {ruleNote && <p className="text-xs text-gray-500">{ruleNote}</p>}
                    </div>
                    <button
                        type="button"
                        aria-label="ปิด"
                        className="-m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"
                        onClick={onClose}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="grid min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[20rem_minmax(0,1fr)] lg:overflow-hidden">
                    <div className="grid content-start gap-4 border-b border-gray-100 p-4 sm:p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
                        {links.length > 0 && (
                            <label className="grid gap-1.5 text-sm text-gray-800">
                                ใช้ค่าจากลิงก์ที่มีอยู่
                                <select
                                    value={linkId}
                                    onChange={(event) => applyLink(event.target.value)}
                                    className={inputClass(false)}
                                >
                                    <option value="">ไม่ใช้ (ตั้งเอง)</option>
                                    {links.map((link) => (
                                        <option key={link.ol_id} value={link.ol_id}>
                                            {link.label}
                                        </option>
                                    ))}
                                </select>
                                <FieldHint>
                                    เติมชนิดลิงก์ รายการที่ทีมเลือกให้ และกลุ่มที่ลิงก์ถามเพิ่ม/ไม่ถาม
                                </FieldHint>
                            </label>
                        )}
                        <fieldset className="grid gap-2">
                            <legend className="mb-1 text-sm text-gray-800">ชนิดลิงก์</legend>
                            <div className="grid grid-cols-2 gap-2">
                                {(["public", "fastwork"] as PreviewLinkKind[]).map((kind) => (
                                    <button
                                        key={kind}
                                        type="button"
                                        aria-pressed={linkKind === kind}
                                        onClick={() => setLinkKind(kind)}
                                        className={`min-h-10 rounded-xl border px-3 text-sm ${linkKind === kind ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-gray-200 text-gray-700"}`}
                                    >
                                        {kind === "public" ? "ลูกค้าตรง" : "Fastwork"}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-gray-800">
                            <input
                                type="checkbox"
                                className="h-4 w-4 accent-blue-600"
                                checked={hasPreset}
                                onChange={(event) => setHasPreset(event.target.checked)}
                            />
                            ทีมงานเลือกรายการให้แล้ว (ล็อกในลิงก์)
                        </label>
                        <fieldset className="grid gap-2">
                            <legend className="mb-1 text-sm text-gray-800">ชุดบริการที่เลือก</legend>
                            <div className="flex flex-wrap gap-2">
                                {items.packages
                                    .filter((row) => row.pkg_status === "active")
                                    .map((row) => (
                                        <PreviewChip
                                            key={row.pkg_id}
                                            label={row.pkg_name}
                                            isOn={packageIds.includes(row.pkg_id)}
                                            onToggle={(isOn) => setPackageIds(toggle(packageIds, row.pkg_id, isOn))}
                                        />
                                    ))}
                            </div>
                        </fieldset>
                        <fieldset className="grid gap-2">
                            <legend className="mb-1 text-sm text-gray-800">สินค้าที่เลือก</legend>
                            <input
                                aria-label="ค้นหาสินค้า"
                                placeholder="ค้นหาสินค้า"
                                value={productSearch}
                                onChange={(event) => setProductSearch(event.target.value)}
                                className={inputClass(false)}
                            />
                            <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto lg:max-h-64">
                                {shownProducts.map((row) => (
                                    <PreviewChip
                                        key={row.product_id}
                                        label={row.product_name}
                                        isOn={productIds.includes(row.product_id)}
                                        onToggle={(isOn) => setProductIds(toggle(productIds, row.product_id, isOn))}
                                    />
                                ))}
                            </div>
                            <FieldHint>หมวดคิดจากชุดและสินค้าที่เลือกให้เอง</FieldHint>
                        </fieldset>
                    </div>

                    <div className="bg-customer grid content-start gap-4 p-4 sm:p-5 lg:overflow-y-auto">
                        {(summary.questionCount > MANY_QUESTIONS || summary.requiredCount > MANY_REQUIRED) && (
                            <StatusBanner tone="warn" title="คำถามเยอะสำหรับลูกค้าแบบนี้">
                                เกิน {MANY_QUESTIONS} ข้อหรือต้องตอบเกิน {MANY_REQUIRED} ข้อ ลูกค้ามักทิ้งกลางทาง ·
                                ลองเปลี่ยนข้อที่ไม่จำเป็นเป็นไม่บังคับ หรือให้ถามตามคำตอบของข้ออื่น
                            </StatusBanner>
                        )}
                        {visible.length > 0 && (
                            <OrderQuestions
                                groups={visible.map((group) => ({ ...group, reason: reasonOf(group) }))}
                                answers={answers}
                                otherTexts={otherTexts}
                                files={files}
                                errors={{}}
                                today={todayBangkokText()}
                                onAnswer={(questionId, value) =>
                                    setAnswers((current) => ({ ...current, [questionId]: value }))
                                }
                                onOtherText={(questionId, text) =>
                                    setOtherTexts((current) => ({ ...current, [questionId]: text }))
                                }
                                onFiles={(questionId, list) =>
                                    setFiles((current) => ({ ...current, [questionId]: list }))
                                }
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body,
    );
}

function PreviewChip({ label, isOn, onToggle }: { label: string; isOn: boolean; onToggle: (isOn: boolean) => void }) {
    return (
        <label
            className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm ${isOn ? "border-blue-300 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-700"}`}
        >
            <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={isOn}
                onChange={(event) => onToggle(event.target.checked)}
            />
            {label}
        </label>
    );
}
