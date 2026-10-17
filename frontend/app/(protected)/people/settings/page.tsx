"use client";

// ตั้งค่าบุคคล (2026-10-17 เฟส 4 ขั้น 4-1) — เวลาทำงาน · ประกันสังคม · ภาษีเงินได้ · วันหยุดบริษัท · ประเภทลา
// ทุกคนดูได้ · แก้ได้เฉพาะสิทธิ์ตั้งค่าบุคคล · ตัวเลขเริ่มต้นต้องให้นักบัญชียืนยันก่อนจ่ายเงินเดือนจริง (Y1/Y2)
import PageHeader from "@/components/ui/page-header";
import StatusBanner from "@/components/ui/guidance/status-banner";
import { PageSkeleton } from "@/components/ui/skeleton";
import { usePermission, BITS } from "@/app/components/permission-provider";
import { usePeopleSetup } from "../_hooks/use-people-setup";
import { SETUP_MESSAGES } from "../_messages";
import WorkSettingsSection from "./_components/work-settings-section";
import SsoRatesSection from "./_components/sso-rates-section";
import TaxYearsSection from "./_components/tax-years-section";
import HolidaysSection from "./_components/holidays-section";
import LeaveTypesSection from "./_components/leave-types-section";

export default function PeopleSettingsPage() {
    const hasBit = usePermission();
    const canEdit = hasBit(BITS.manageHrSettings);
    const { setup, loadError, reload } = usePeopleSetup();

    if (loadError)
        return (
            <StatusBanner tone="error" title="โหลดตั้งค่าบุคคลไม่สำเร็จ">
                {loadError.message}
            </StatusBanner>
        );
    if (!setup) return <PageSkeleton />;

    return (
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6">
            <PageHeader eyebrow="บุคคล" title="ตั้งค่าบุคคล" description={SETUP_MESSAGES.description} />
            <StatusBanner tone="warn" title="ตรวจกับนักบัญชีก่อนจ่ายเงินเดือนจริง">
                {SETUP_MESSAGES.accountantNote}
                {!canEdit && " · คุณดูได้อย่างเดียว (แก้ได้เฉพาะผู้มีสิทธิ์ตั้งค่าบุคคล)"}
            </StatusBanner>
            {setup.settings && <WorkSettingsSection settings={setup.settings} canEdit={canEdit} onChanged={reload} />}
            <SsoRatesSection setup={setup} canEdit={canEdit} onChanged={reload} />
            <TaxYearsSection setup={setup} canEdit={canEdit} onChanged={reload} />
            <HolidaysSection today={setup.today} canEdit={canEdit} />
            <LeaveTypesSection setup={setup} canEdit={canEdit} onChanged={reload} />
        </div>
    );
}
