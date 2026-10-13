// แถบสถานะ (แบบที่ 3 ใน docs/plans/2026-10-12-ui-guidance.md) — บอก "ตอนนี้เป็นอย่างไร · รออะไร · ทำอะไรได้/ไม่ได้ เพราะอะไร"
// ใช้แทน toast สำหรับเหตุผลที่ทำไม่ได้/error — อยู่บนหน้าจนกว่าจะแก้
import { CircleCheck, CircleX, Clock, Info, TriangleAlert } from "lucide-react";

type Tone = "info" | "wait" | "warn" | "error" | "done";

const TONE_STYLES: Record<Tone, { box: string; icon: string; Icon: typeof Info }> = {
    info: { box: "border-blue-200 bg-blue-50", icon: "text-blue-600", Icon: Info },
    wait: { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", Icon: Clock },
    warn: { box: "border-amber-200 bg-amber-50", icon: "text-amber-600", Icon: TriangleAlert },
    error: { box: "border-red-200 bg-red-50", icon: "text-red-600", Icon: CircleX },
    done: { box: "border-green-200 bg-green-50", icon: "text-green-600", Icon: CircleCheck },
};

type StatusBannerProps = {
    tone?: Tone;
    title: string;
    children?: React.ReactNode;
};

export default function StatusBanner({ tone = "info", title, children }: StatusBannerProps) {
    const { box, icon, Icon } = TONE_STYLES[tone];
    const isError = tone === "error";

    return (
        <div role={isError ? "alert" : "status"} className={`flex gap-3 rounded-lg border px-4 py-3 ${box}`}>
            <Icon size={20} className={`mt-0.5 shrink-0 ${icon}`} aria-hidden="true" />
            <div className="grid min-w-0 gap-1">
                <p className="font-medium text-gray-800">{title}</p>
                {children && <div className="text-sm text-gray-700">{children}</div>}
            </div>
        </div>
    );
}
