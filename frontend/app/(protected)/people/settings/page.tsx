"use client";

// ตั้งค่าบุคคล (2026-10-17 เฟส 4 ขั้น 4-1) — เวลาทำงาน · กะทำงาน · จุดลงเวลา (2026-10-23) · ประกันสังคม · ภาษีเงินได้ · วันหยุดบริษัท · ประเภทลา
// ทุกคนดูได้ · แก้ได้เฉพาะสิทธิ์ตั้งค่าบุคคล · ตัวเลขเริ่มต้นต้องให้นักบัญชียืนยันก่อนจ่ายเงินเดือนจริง (Y1/Y2)
// U-3 (2026-10-23): แยกหมวด — จอคอมเมนูย่อยด้านซ้าย · มือถือปุ่มเลือกด้านบน · จำหมวดใน URL (?section=) กดย้อนกลับได้
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
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
import WorkSchedulesSection from "./_components/work-schedules-section";
import AttendanceLocationsSection from "./_components/attendance-locations-section";

type Section = "work" | "schedules" | "locations" | "sso" | "tax" | "holidays" | "leave";

const SECTIONS: { value: Section; label: string; summary: string }[] = [
    { value: "work", label: "เวลาทำงาน", summary: "วันทำงาน ชั่วโมงต่อวัน วันจ่าย" },
    { value: "schedules", label: "กะทำงาน", summary: "เวลาเข้า-เลิก ผ่อนผันสาย" },
    { value: "locations", label: "จุดลงเวลา", summary: "พิกัดและรัศมีของออฟฟิศ" },
    { value: "sso", label: "ประกันสังคม", summary: "อัตราและเพดานตามวันที่มีผล" },
    { value: "tax", label: "ภาษีเงินได้", summary: "ขั้นภาษีและค่าลดหย่อนรายปี" },
    { value: "holidays", label: "วันหยุดบริษัท", summary: "วันหยุดประจำปี" },
    { value: "leave", label: "ประเภทลา", summary: "โควตา ยกยอด เงื่อนไข" },
];

function isSection(value: string | null): value is Section {
    return SECTIONS.some((section) => section.value === value);
}

// useSearchParams (?section=) ต้องอยู่ใน Suspense (Next.js 16)
export default function PeopleSettingsPage() {
    return (
        <Suspense fallback={<PageSkeleton />}>
            <PeopleSettingsContent />
        </Suspense>
    );
}

function PeopleSettingsContent() {
    const router = useRouter();
    const requestedSection = useSearchParams().get("section");
    const section: Section = isSection(requestedSection) ? requestedSection : "work";
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

    function changeSection(nextSection: Section) {
        router.replace(`/people/settings?section=${nextSection}`, { scroll: false });
    }

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader eyebrow="บุคคล" title="ตั้งค่าบุคคล" description={SETUP_MESSAGES.description} />
            <StatusBanner tone="warn" title="ตรวจกับนักบัญชีก่อนจ่ายเงินเดือนจริง">
                {SETUP_MESSAGES.accountantNote}
                {!canEdit && " · คุณดูได้อย่างเดียว (แก้ได้เฉพาะผู้มีสิทธิ์ตั้งค่าบุคคล)"}
            </StatusBanner>

            <div className="lg:hidden">
                <Segmented<Section>
                    label="หมวดตั้งค่า"
                    role="tablist"
                    value={section}
                    onChange={changeSection}
                    options={SECTIONS.map(({ value, label }) => ({ value, label }))}
                />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[14rem_1fr] lg:items-start">
                <nav aria-label="หมวดตั้งค่า" className="sticky top-4 hidden gap-1 lg:grid">
                    {SECTIONS.map((item) => {
                        const isSelected = item.value === section;
                        return (
                            <button
                                key={item.value}
                                type="button"
                                aria-current={isSelected ? "page" : undefined}
                                onClick={() => changeSection(item.value)}
                                className={`grid gap-0.5 rounded-xl px-3.5 py-2.5 text-left transition ${
                                    isSelected ? "bg-white shadow-sm ring-1 ring-gray-200" : "hover:bg-white/70"
                                }`}
                            >
                                <span className={`text-sm ${isSelected ? "font-medium text-blue-600" : "text-gray-800"}`}>
                                    {item.label}
                                </span>
                                <span className="text-xs text-gray-500">{item.summary}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* ทุกหมวดยังอยู่ในหน้า แค่ซ่อน — สลับหมวดแล้วสิ่งที่กรอกค้างไว้ไม่หาย */}
                <div className="grid min-w-0">
                    <div hidden={section !== "work"}>
                        {setup.settings && (
                            <WorkSettingsSection
                                settings={setup.settings}
                                schedules={setup.work_schedules}
                                canEdit={canEdit}
                                onChanged={reload}
                            />
                        )}
                    </div>
                    <div hidden={section !== "schedules"}>
                        <WorkSchedulesSection setup={setup} canEdit={canEdit} onChanged={reload} />
                    </div>
                    <div hidden={section !== "locations"}>
                        <AttendanceLocationsSection setup={setup} canEdit={canEdit} onChanged={reload} />
                    </div>
                    <div hidden={section !== "sso"}>
                        <SsoRatesSection setup={setup} canEdit={canEdit} onChanged={reload} />
                    </div>
                    <div hidden={section !== "tax"}>
                        <TaxYearsSection setup={setup} canEdit={canEdit} onChanged={reload} />
                    </div>
                    <div hidden={section !== "holidays"}>
                        <HolidaysSection today={setup.today} canEdit={canEdit} />
                    </div>
                    <div hidden={section !== "leave"}>
                        <LeaveTypesSection setup={setup} canEdit={canEdit} onChanged={reload} />
                    </div>
                </div>
            </div>
        </div>
    );
}
