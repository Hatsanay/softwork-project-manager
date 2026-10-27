"use client";

// สินค้า/บริการ หมวดหมู่ และชุดรายการ (2026-10-13 ขั้น 1A-1d — docs/plans/2026-10-08-sales-cycle.md หัวข้อ 4.1)
// ทุกคนที่เข้าระบบดูได้ (คนทำใบเสนอราคาต้องค้นสินค้า) · เพิ่ม/แก้/ลบต้องมีสิทธิ์ productManagement
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { apiFetch } from "@/lib/api";
import { PRODUCT_MESSAGES } from "./_messages";
import type { ProductCategory } from "./_types";
import ProductsTab from "./_components/products-tab";
import CategoriesTab from "./_components/categories-tab";
import PackagesTab from "./_components/packages-tab";
import QuestionsTab from "./_components/questions-tab";
import type { QuestionsTarget } from "./_components/item-questions-panel";

type TabKey = "products" | "categories" | "packages" | "questions";

export default function ProductsPage() {
    const hasBit = usePermission();
    const canEdit = hasBit(BITS.productManagement);
    // คำถามลูกค้า (ลิงก์เลือกบริการ): ผู้จัดการสินค้าแก้ได้ · ผู้ดูแลคำขอดูได้
    const canSeeQuestions = canEdit || hasBit(BITS.manageServiceRequests);
    const [activeTab, setActiveTab] = useState<TabKey>("products");
    const [categories, setCategories] = useState<ProductCategory[]>([]);
    // จากแผ่นแก้สินค้า/ชุด → แท็บคำถาม: เลื่อนไปกลุ่มนั้น หรือเปิดแผ่นเพิ่มกลุ่มที่ผูกรายการนั้นไว้แล้ว (Q-2)
    const [questionsTarget, setQuestionsTarget] = useState<QuestionsTarget | null>(null);

    function openQuestions(target: QuestionsTarget) {
        setQuestionsTarget(target);
        setActiveTab("questions");
        window.scrollTo({ top: 0 });
    }

    // หมวดใช้ทั้ง 3 แท็บ (ตัวกรอง ตัวเลือกในฟอร์ม) — แก้หมวดแล้วโหลดใหม่ที่เดียว
    const reloadCategories = useCallback(async () => {
        const { data } = await apiFetch<{ data: ProductCategory[] }>("/product-categories");
        if (data) setCategories(data.data);
    }, []);

    useEffect(() => {
        let isLeftPage = false;
        apiFetch<{ data: ProductCategory[] }>("/product-categories").then(({ data }) => {
            if (!isLeftPage && data) setCategories(data.data);
        });
        return () => {
            isLeftPage = true;
        };
    }, []);

    const tabs = PRODUCT_MESSAGES.tabs;

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader eyebrow="ขาย" title="สินค้า/บริการ" description={PRODUCT_MESSAGES.pageDescription} />
            {!canEdit && <StatusBanner title="ดูอย่างเดียว">{PRODUCT_MESSAGES.readOnly}</StatusBanner>}

            <Segmented<TabKey>
                label="ส่วนของหน้าสินค้า"
                role="tablist"
                idPrefix="products"
                value={activeTab}
                onChange={(tab) => {
                    setQuestionsTarget(null);
                    setActiveTab(tab);
                }}
                options={[
                    { value: "products", label: tabs.products },
                    { value: "categories", label: tabs.categories, count: categories.length },
                    { value: "packages", label: tabs.packages },
                    ...(canSeeQuestions ? [{ value: "questions" as const, label: "คำถามลูกค้า" }] : []),
                ]}
            />

            <div role="tabpanel" id={`products-panel-${activeTab}`} aria-labelledby={`products-tab-${activeTab}`}>
                {activeTab === "products" && <ProductsTab categories={categories} canEdit={canEdit} onOpenQuestions={openQuestions} />}
                {activeTab === "categories" && (
                    <CategoriesTab categories={categories} canEdit={canEdit} onSaved={reloadCategories} />
                )}
                {activeTab === "packages" && <PackagesTab categories={categories} canEdit={canEdit} onOpenQuestions={openQuestions} />}
                {activeTab === "questions" && <QuestionsTab categories={categories} canEdit={canEdit} target={questionsTarget} />}
            </div>
        </div>
    );
}
