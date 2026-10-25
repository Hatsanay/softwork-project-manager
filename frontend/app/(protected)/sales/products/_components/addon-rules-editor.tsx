"use client";

// กติกางานเพิ่มของชุด (2026-10-25) — หน้าร้านของลิงก์เลือกบริการ: ลูกค้าเลือกชุดนี้แล้ว
// "มีในแพ็กแล้ว" = การ์ดงานเพิ่มขึ้นว่ามีในแพ็กแล้ว กดซื้อไม่ได้ · "ใช้กับแพ็กนี้ไม่ได้" = ซ่อนงานเพิ่มนั้น · ไม่ตั้ง = ซื้อได้
import { useState } from "react";
import { Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { inputClass } from "@/components/ui/form-field";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { buttonClass } from "@/components/ui/button";

export type AddonRuleForm = { product_id: string; rule: "included" | "not_available" };

const RULE_LABEL: Record<AddonRuleForm["rule"], string> = {
    included: "มีในแพ็กแล้ว",
    not_available: "ใช้กับแพ็กนี้ไม่ได้",
};

export default function AddonRulesEditor({
    rules,
    products,
    error,
    onChange,
}: {
    rules: AddonRuleForm[];
    products: { product_id: string; product_name: string }[];
    error?: string | null;
    onChange: (rules: AddonRuleForm[]) => void;
}) {
    const [choice, setChoice] = useState("");
    const nameOf = new Map(products.map((product) => [product.product_id, product.product_name]));
    const options = products
        .filter((product) => !rules.some((rule) => rule.product_id === product.product_id))
        .map((product) => ({ value: product.product_id, label: product.product_name }));

    return (
        <section className="grid gap-2 rounded-xl border border-gray-200 p-3" aria-labelledby="addon-rules-title">
            <h3 id="addon-rules-title" className="text-sm font-medium text-gray-900">
                งานเพิ่มที่เกี่ยวกับชุดนี้ (หน้าร้าน)
            </h3>
            {rules.length > 0 && (
                <ul className="grid gap-2">
                    {rules.map((rule, index) => (
                        <li key={rule.product_id} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-center">
                            <span className="text-sm wrap-break-word text-gray-900">{nameOf.get(rule.product_id) ?? rule.product_id}</span>
                            <select
                                aria-label={`กติกาของ ${nameOf.get(rule.product_id) ?? ""}`}
                                value={rule.rule}
                                onChange={(event) =>
                                    onChange(rules.map((item, itemIndex) => (itemIndex === index ? { ...item, rule: event.target.value as AddonRuleForm["rule"] } : item)))
                                }
                                className={inputClass(false, "sm")}
                            >
                                {(Object.keys(RULE_LABEL) as AddonRuleForm["rule"][]).map((value) => (
                                    <option key={value} value={value}>
                                        {RULE_LABEL[value]}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                aria-label={`เอากติกาของ ${nameOf.get(rule.product_id) ?? ""} ออก`}
                                className={`${buttonClass("ghost", "sm")} justify-self-end`}
                                onClick={() => onChange(rules.filter((_, itemIndex) => itemIndex !== index))}
                            >
                                <Trash2 size={15} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <SearchableSelect
                options={options}
                value={choice}
                onChange={(productId) => {
                    setChoice("");
                    if (productId) onChange([...rules, { product_id: productId, rule: "included" }]);
                }}
                placeholder="+ เลือกงานเพิ่ม"
            />
            <FieldHint error={error}>
                ลูกค้าเลือกชุดนี้แล้ว: &quot;มีในแพ็กแล้ว&quot; = งานเพิ่มขึ้นว่ามีในแพ็กแล้ว กดซื้อไม่ได้ · &quot;ใช้กับแพ็กนี้ไม่ได้&quot; = ซ่อน · ไม่ตั้ง = ซื้อเพิ่มได้ตามปกติ
            </FieldHint>
        </section>
    );
}
