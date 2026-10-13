"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import Segmented from "@/components/ui/segmented";
import AuditLogTab from "./audit-log-tab";
import ErrorLogTab from "./error-log-tab";
import LoginLogTab from "./login-log-tab";

// หน้า Log ของระบบ (บิตสิทธิ์ loginLogs เดิม) — อ่านอย่างเดียวทั้งหมด ไม่มีปุ่มแก้/ลบ log โดยตั้งใจ
// (log ที่ลบได้จากหน้าเว็บใช้ตรวจสอบย้อนหลังไม่ได้) ของเก่าถูกลบอัตโนมัติเมื่อเกินระยะเก็บเท่านั้น
const TABS = [
    { key: "audit", label: "ประวัติการใช้งาน" },
    { key: "errors", label: "ข้อผิดพลาดของระบบ" },
    { key: "logins", label: "การเข้าสู่ระบบ" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function LogsPage() {
    const [tab, setTab] = useState<TabKey>("audit");

    return (
        <div className="grid gap-6">
            <PageHeader
                eyebrow="ตั้งค่าระบบ"
                title="Log ข้อมูล"
                description={
                    <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                        บันทึกอัตโนมัติทุกการใช้งาน แก้ไขหรือลบไม่ได้ · เก็บย้อนหลัง 2 ปี
                    </span>
                }
            />

            <Segmented
                role="tablist"
                idPrefix="logs"
                label="ประเภท log"
                value={tab}
                onChange={setTab}
                options={TABS.map(({ key, label }) => ({ value: key, label }))}
            />

            {tab === "audit" && <AuditLogTab />}
            {tab === "errors" && <ErrorLogTab />}
            {tab === "logins" && <LoginLogTab />}
        </div>
    );
}
