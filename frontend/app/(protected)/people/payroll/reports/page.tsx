"use client";

// แบบยื่นภาษี/ประกันสังคมจากรอบเงินเดือน (ขั้น 4-5) — เลือกเดือน/ปี แล้วเปิดหน้าพิมพ์
// นับเฉพาะรอบที่บันทึกจ่ายแล้ว · ไฟล์ยื่นออนไลน์ยังไม่มี (รอรูปแบบจากนักบัญชี — Y5)
import { useState } from "react";
import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import SectionCard from "@/components/ui/section-card";
import FormField, { inputClass } from "@/components/ui/form-field";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { currentPeriodBangkok } from "../_lib";

function previousPeriod(period: string) {
    const [year, month] = period.split("-").map(Number);
    return new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);
}

function PrintLink({ href, label }: { href: string; label: string }) {
    return (
        <Link href={href} target="_blank" className={`${buttonClass("secondary", "md")} justify-start`}>
            <Printer size={16} />
            {label}
        </Link>
    );
}

export default function PayrollReportsPage() {
    // ส่วนใหญ่ยื่นของเดือนก่อน (ภายในวันที่ 7/15 ของเดือนนี้)
    const [month, setMonth] = useState(() => previousPeriod(currentPeriodBangkok()));
    const [year, setYear] = useState(() => Number(currentPeriodBangkok().slice(0, 4)) - 1);

    return (
        <div className="grid w-full grid-cols-1 gap-6">
            <PageHeader
                eyebrow="บุคคล"
                title="แบบยื่นภาษีและประกันสังคม"
                description="ใบแนบ ภ.ง.ด.1 · สปส.1-10 รายเดือน และ ภ.ง.ด.1ก · 50 ทวิ ประจำปี จากรอบเงินเดือนที่บันทึกจ่ายแล้ว"
            />

            <SectionCard
                icon={FileText}
                title="รายเดือน"
                description="ยื่นภายในวันที่ 7 ของเดือนถัดไป (ออนไลน์ 15) · ประกันสังคมภายในวันที่ 15"
            >
                <div className="grid gap-4">
                    <FormField label="เดือนที่จ่ายเงินเดือน" htmlFor="report-month">
                        <input
                            id="report-month"
                            type="month"
                            value={month}
                            onChange={(event) => setMonth(event.target.value)}
                            className={`${inputClass(false)} max-w-xs`}
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <PrintLink href={`/people/payroll/pnd1/print?month=${month}`} label="ใบแนบ ภ.ง.ด.1" />
                        <PrintLink href={`/people/payroll/sso/print?month=${month}`} label="รายการเงินสมทบ สปส.1-10" />
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                icon={FileText}
                title="ประจำปี"
                description="ภ.ง.ด.1ก ยื่นภายในสิ้นเดือนกุมภาพันธ์ของปีถัดไป · 50 ทวิ ให้พนักงานภายในเดือนกุมภาพันธ์"
            >
                <div className="grid gap-4">
                    <FormField label="ปีภาษี (ค.ศ.)" htmlFor="report-year" hint={`พ.ศ. ${year + 543}`}>
                        <input
                            id="report-year"
                            type="number"
                            inputMode="numeric"
                            min={2000}
                            max={2100}
                            value={year}
                            onChange={(event) => setYear(Number(event.target.value) || year)}
                            className={`${inputClass(false)} max-w-xs`}
                        />
                    </FormField>
                    <div className="flex flex-wrap gap-2">
                        <PrintLink href={`/people/payroll/pnd1a/print?year=${year}`} label="ใบแนบ ภ.ง.ด.1ก" />
                        <PrintLink href={`/people/payroll/certificates/print?year=${year}`} label="50 ทวิ ทุกคน" />
                    </div>
                </div>
            </SectionCard>

            <FieldHint>
                นับเฉพาะรอบเงินเดือนที่บันทึกจ่ายแล้ว (หน้าพิมพ์เตือนถ้ามีรอบที่ยังไม่จ่าย) · ภ.ง.ด.1ก และ 50 ทวิ
                รวมยอดยกมาของปีที่เป็นของบริษัทนี้ (ยอดยกมาจากที่ทำงานเดิมไม่รวม) · ไฟล์สำหรับยื่นออนไลน์ยังไม่มี
                รอรูปแบบจากนักบัญชี
            </FieldHint>
        </div>
    );
}
