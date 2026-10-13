// ป้ายสถานะแบบจุดสี — สีตามความหมายเท่านั้น: สำเร็จ/ใช้งาน (เขียว) · รอ (เหลือง) · มีปัญหา/เลยกำหนด (แดง) · ปิด (เทา) · ข้อมูล (ฟ้า)
export type PillTone = "success" | "wait" | "danger" | "neutral" | "info";

const TONES: Record<PillTone, string> = {
    success: "border-green-600/15 bg-green-50 text-green-600",
    wait: "border-amber-600/15 bg-amber-50 text-amber-600",
    danger: "border-red-600/15 bg-red-50 text-red-600",
    neutral: "border-gray-200 bg-gray-50 text-gray-500",
    info: "border-blue-600/15 bg-blue-50 text-blue-600",
};

export default function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
    return (
        <span
            className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs ${TONES[tone]}`}
        >
            <span className="h-1.5 w-1.5 rounded-full bg-current ring-[3px] ring-current/15" aria-hidden="true" />
            {children}
        </span>
    );
}

/** ป้ายเปิด/ปิดใช้งาน ใช้ซ้ำหลายหน้า */
export function ActiveStatusPill({ isActive }: { isActive: boolean }) {
    return <StatusPill tone={isActive ? "success" : "neutral"}>{isActive ? "ใช้งาน" : "ปิดใช้งาน"}</StatusPill>;
}
