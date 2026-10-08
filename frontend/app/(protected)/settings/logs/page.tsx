"use client";

import { useState } from "react";
import { History, LogIn, ShieldCheck, TriangleAlert } from "lucide-react";
import AuditLogTab from "./audit-log-tab";
import ErrorLogTab from "./error-log-tab";
import LoginLogTab from "./login-log-tab";

// หน้า Log ของระบบ (บิตสิทธิ์ loginLogs เดิม) — อ่านอย่างเดียวทั้งหมด ไม่มีปุ่มแก้/ลบ log โดยตั้งใจ
// (log ที่ลบได้จากหน้าเว็บใช้ตรวจสอบย้อนหลังไม่ได้) ของเก่าถูกลบอัตโนมัติเมื่อเกินระยะเก็บเท่านั้น
const TABS = [
    { key: "audit", label: "ประวัติการใช้งาน", icon: History },
    { key: "errors", label: "ข้อผิดพลาดของระบบ", icon: TriangleAlert },
    { key: "logins", label: "การเข้าสู่ระบบ", icon: LogIn },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function LogsPage() {
    const [tab, setTab] = useState<TabKey>("audit");

    return (
        <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <h1 className="text-xl font-bold text-gray-800 sm:text-2xl">Log ข้อมูล</h1>
                <p className="flex items-center gap-1.5 text-xs text-gray-400">
                    <ShieldCheck className="h-4 w-4" />
                    บันทึกอัตโนมัติ แก้ไขหรือลบไม่ได้ · เก็บย้อนหลัง 2 ปี
                </p>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                            tab === key ? "border-blue-500 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                ))}
            </div>

            {tab === "audit" && <AuditLogTab />}
            {tab === "errors" && <ErrorLogTab />}
            {tab === "logins" && <LoginLogTab />}
        </div>
    );
}
