// บรรทัดเล็กเหนือหัวข้อของหัวหน้าแบบสว่าง (surface-hero): จุดฟ้า + ข้อความฟ้า · เช่น "สวัสดีตอนเช้า" "สำหรับ บริษัท ก"
export default function HeroEyebrow({ children }: { children: React.ReactNode }) {
    return (
        <p className="flex items-center gap-2 text-sm text-blue-600">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 ring-4 ring-blue-500/15" aria-hidden="true" />
            <span className="min-w-0 truncate">{children}</span>
        </p>
    );
}
