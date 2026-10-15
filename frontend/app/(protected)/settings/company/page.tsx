"use client";

// ตั้งค่า › ข้อมูลบริษัท (วงจรขาย 1A, docs/plans/2026-10-08-sales-cycle.md หัวข้อ 8)
// ทุกแท็บอยู่ในหน้าเดียวและเปิดค้างไว้ (แค่ซ่อน) — สลับแท็บแล้วสิ่งที่พิมพ์ค้างไว้ไม่หาย
import { useState } from "react";
import StatusBanner from "@/components/ui/guidance/status-banner";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import { PageSkeleton } from "@/components/ui/skeleton";
import { COMPANY_MESSAGES } from "./_messages";
import { useCompanySettings } from "./_hooks/use-company-settings";
import ApprovalTab from "./_components/approval-tab";
import BankAccountsTab from "./_components/bank-accounts-tab";
import BranchesTab from "./_components/branches-tab";
import CompanyInfoTab from "./_components/company-info-tab";
import CurrenciesTab from "./_components/currencies-tab";
import QuotationDefaultsTab from "./_components/quotation-defaults-tab";
import VatTab from "./_components/vat-tab";

const TAB_KEYS = ["info", "vat", "quotation", "approval", "currencies", "branches", "bankAccounts"] as const;
type TabKey = (typeof TAB_KEYS)[number];

export default function CompanySettingsPage() {
    const { settings, loadError, reload } = useCompanySettings();
    const [activeTab, setActiveTab] = useState<TabKey>("info");

    if (loadError) {
        return (
            <div>
                <StatusBanner tone="error" title={COMPANY_MESSAGES.loadErrorTitle}>
                    <p>{loadError.message}</p>
                    {loadError.request_id && (
                        <p className="mt-1 text-xs text-gray-500">
                            {COMPANY_MESSAGES.requestIdNote(loadError.request_id)}
                        </p>
                    )}
                </StatusBanner>
            </div>
        );
    }
    if (!settings) {
        return <PageSkeleton label="กำลังโหลดข้อมูลบริษัท" />;
    }

    const canEdit = settings.can_edit;

    return (
        <div className="grid grid-cols-1 gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ"
                title={COMPANY_MESSAGES.pageTitle}
                description={COMPANY_MESSAGES.pageDescription}
            />

            {!canEdit && (
                <StatusBanner tone="info" title={COMPANY_MESSAGES.readOnlyTitle}>
                    {COMPANY_MESSAGES.readOnlyText}
                </StatusBanner>
            )}

            <Segmented
                role="tablist"
                idPrefix="company"
                label="ส่วนของการตั้งค่า"
                value={activeTab}
                onChange={setActiveTab}
                options={TAB_KEYS.map((tabKey) => ({ value: tabKey, label: COMPANY_MESSAGES.tabs[tabKey] }))}
            />

            <TabPanel tabKey="info" activeTab={activeTab}>
                <CompanyInfoTab company={settings.company} canEdit={canEdit} onSaved={reload} />
            </TabPanel>
            <TabPanel tabKey="vat" activeTab={activeTab}>
                <VatTab
                    company={settings.company}
                    vatRates={settings.vat_rates}
                    vatRateToday={settings.vat_rate_today}
                    today={settings.today}
                    canEdit={canEdit}
                    onSaved={reload}
                />
            </TabPanel>
            <TabPanel tabKey="quotation" activeTab={activeTab}>
                <QuotationDefaultsTab company={settings.company} canEdit={canEdit} onSaved={reload} />
            </TabPanel>
            <TabPanel tabKey="approval" activeTab={activeTab}>
                <ApprovalTab
                    approval={settings.approval}
                    invoiceApproval={settings.invoice_approval}
                    roles={settings.roles}
                    canEdit={canEdit}
                    onSaved={reload}
                />
            </TabPanel>
            <TabPanel tabKey="currencies" activeTab={activeTab}>
                <CurrenciesTab currencies={settings.currencies} canEdit={canEdit} onSaved={reload} />
            </TabPanel>
            <TabPanel tabKey="branches" activeTab={activeTab}>
                <BranchesTab branches={settings.branches} canEdit={canEdit} onSaved={reload} />
            </TabPanel>
            <TabPanel tabKey="bankAccounts" activeTab={activeTab}>
                <BankAccountsTab
                    bankAccounts={settings.bank_accounts}
                    currencies={settings.currencies}
                    canEdit={canEdit}
                    onSaved={reload}
                />
            </TabPanel>
        </div>
    );
}

function TabPanel({ tabKey, activeTab, children }: { tabKey: TabKey; activeTab: TabKey; children: React.ReactNode }) {
    return (
        <div
            role="tabpanel"
            id={`company-panel-${tabKey}`}
            aria-labelledby={`company-tab-${tabKey}`}
            hidden={activeTab !== tabKey}
        >
            {children}
        </div>
    );
}
