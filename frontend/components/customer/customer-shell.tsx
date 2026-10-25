// กรอบหน้าที่ลูกค้าเห็น (2026-10-26) — ลิงก์เลือกบริการ · สถานะคำขอ · ติดตามงาน ใช้ตัวเดียวกัน
// หัวกระจกติดบน (โลโก้ + ชื่อร้าน + ชื่อหน้า) · พื้นแสงฟ้านุ่ม · ความกว้างและระยะขอบ fluid (globals.css: px-fluid, bg-customer)
// narrow = อ่านเป็นเอกสาร (สถานะ/ติดตามงาน) · wide = หน้าร้านที่มีตะกร้าข้างขวาบนจอคอม
// hasBottomBar = มีแถบติดล่างจอ (ตะกร้า) → เว้นที่ท้ายหน้าให้ข้อความท้ายหน้าไม่ถูกบัง
// พื้นมีอนุภาคลอย (components/ui/particle-background) ชั้น -z-10 ใต้เนื้อหา · กรอบนอกเป็น isolate ให้ -z-10 ไม่หลุดไปอยู่ใต้พื้นสีเทา
// ไม่ตั้ง z ให้ main/footer: ถ้าตั้ง แผงตะกร้า (fixed z-40) ข้างในจะถูกขังอยู่ใต้หัวหน้า
// ไม่ใส่ช่องทางติดต่อของร้าน: ลิงก์ Fastwork ห้ามมีช่องทางนอกแพลตฟอร์ม
import { ShieldCheck, type LucideIcon } from "lucide-react";
import { uploadedFileUrl } from "@/lib/api";
import Skeleton from "@/components/ui/skeleton";
import ParticleBackground from "@/components/ui/particle-background";

export type CustomerShop = { name: string | null; logo_url: string | null };

const WIDTH = { narrow: "max-w-[56rem]", wide: "max-w-[88rem]" } as const;

export default function CustomerShell({
    shop,
    label,
    width = "narrow",
    headerAside,
    hasBottomBar = false,
    children,
}: {
    shop: CustomerShop | null | undefined;
    label: string;
    width?: keyof typeof WIDTH;
    headerAside?: React.ReactNode;
    hasBottomBar?: boolean;
    children: React.ReactNode;
}) {
    const shopName = shop?.name || "Softwork";
    return (
        <div className="bg-customer isolate min-h-screen">
            <ParticleBackground />
            <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur-md">
                <div className={`px-fluid mx-auto flex ${WIDTH[width]} items-center justify-between gap-3 py-3`}>
                    <div className="flex min-w-0 items-center gap-3">
                        {shop?.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={uploadedFileUrl(shop.logo_url)}
                                alt=""
                                className="h-10 w-10 shrink-0 rounded-2xl border border-gray-100 bg-white object-contain p-1 shadow-card"
                            />
                        ) : (
                            <span
                                className="bg-brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-base font-medium text-white shadow-brand"
                                aria-hidden="true"
                            >
                                {shopName.slice(0, 1)}
                            </span>
                        )}
                        <div className="grid min-w-0 leading-tight">
                            <span className="truncate text-sm font-medium text-gray-900">{shopName}</span>
                            <span className="truncate text-xs text-gray-500">{label}</span>
                        </div>
                    </div>
                    {headerAside}
                </div>
            </header>
            <main
                className={`px-fluid gap-fluid mx-auto grid ${WIDTH[width]} grid-cols-[minmax(0,1fr)] pt-[clamp(1.25rem,0.8rem+2vw,2.5rem)] pb-8`}
            >
                {children}
            </main>
            <footer className={`px-fluid mx-auto ${WIDTH[width]} ${hasBottomBar ? "pb-32" : "pb-10"}`}>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-gray-400">
                    <ShieldCheck size={14} aria-hidden="true" />
                    {shopName} · หน้านี้เปิดได้โดยไม่ต้องสมัครหรือเข้าระบบ
                </p>
            </footer>
        </div>
    );
}

/**
 * ส่วนหนึ่งของหน้าลูกค้า: เลขลำดับ (01, 02…) + หัวข้อ + คำอธิบาย · การ์ดกระจก ระยะ fluid
 * เลขลำดับช่วยให้ลูกค้าเห็นว่าหน้านี้มีกี่ส่วน อ่านไล่ลงมาได้
 */
export function CustomerSection({
    index,
    title,
    description,
    actions,
    id,
    className = "",
    children,
}: {
    index?: number;
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
    id?: string;
    className?: string;
    children: React.ReactNode;
}) {
    const titleId = id ? `${id}-title` : undefined;
    return (
        <section className={`card-customer p-fluid grid gap-4 ${className}`} aria-labelledby={titleId} id={id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    {index !== undefined && (
                        <span
                            className="mt-0.5 flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 px-1.5 text-xs font-medium text-blue-700 tabular-nums"
                            aria-hidden="true"
                        >
                            {String(index).padStart(2, "0")}
                        </span>
                    )}
                    <div className="grid min-w-0 gap-0.5">
                        <h2 id={titleId} className="text-fluid-title font-medium text-gray-900">
                            {title}
                        </h2>
                        {description && <p className="text-sm text-gray-500">{description}</p>}
                    </div>
                </div>
                {actions}
            </div>
            {children}
        </section>
    );
}

/**
 * ระหว่างโหลดหน้าลูกค้า: กรอบเดียวกับหน้าจริง (หัว · แถบฟ้า · การ์ด) → โหลดเสร็จแล้วหน้าไม่กระโดด
 * ยังไม่รู้ชื่อร้าน → หัวเป็นโครงร่าง ไม่โชว์ชื่อสำรองแล้วเปลี่ยนทีหลัง
 */
export function CustomerLoading({ label, width = "narrow" }: { label: string; width?: keyof typeof WIDTH }) {
    return (
        <div className="bg-customer isolate min-h-screen" role="status" aria-label={label}>
            <ParticleBackground />
            <header className="sticky top-0 z-20 border-b border-white/70 bg-white/75 backdrop-blur-md">
                <div className={`px-fluid mx-auto flex ${WIDTH[width]} items-center gap-3 py-3`}>
                    <Skeleton className="h-10 w-10 rounded-2xl" />
                    <div className="grid gap-1.5">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3 w-24" />
                    </div>
                </div>
            </header>
            <main
                className={`px-fluid gap-fluid mx-auto grid ${WIDTH[width]} grid-cols-[minmax(0,1fr)] pt-[clamp(1.25rem,0.8rem+2vw,2.5rem)] pb-8`}
            >
                <div className="grid h-[clamp(11rem,9rem+8vw,15rem)] animate-pulse content-center gap-3 rounded-[1.75rem] bg-blue-100/70 p-[clamp(1.25rem,0.9rem+1.6vw,2.25rem)]">
                    <span className="block h-8 w-3/5 rounded-lg bg-white/70" />
                    <span className="block h-4 w-4/5 rounded-lg bg-white/60" />
                </div>
                <div className="card-customer p-fluid grid gap-3">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-2/3" />
                </div>
                <p className="text-center text-sm text-gray-400">{label}</p>
            </main>
        </div>
    );
}

/**
 * หน้าลูกค้าที่เปิดต่อไม่ได้ (ไม่พบลิงก์ · หมดอายุ · ปิดรับ): ไอคอนบอกเหตุ + หัวข้อ + ทางไปต่อ
 * ข้อความต้องบอกลูกค้าว่าทำอะไรต่อได้ ไม่ใช่แค่ว่า "ผิดพลาด"
 */
export function CustomerNotice({
    icon: Icon,
    title,
    children,
}: {
    icon: LucideIcon;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <section className="card-customer grid justify-items-center gap-3 px-6 py-[clamp(2.5rem,2rem+3vw,4.5rem)] text-center">
            <span
                className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"
                aria-hidden="true"
            >
                <Icon size={26} />
            </span>
            <h1 className="text-fluid-title font-medium text-gray-900">{title}</h1>
            <p className="text-fluid-lead max-w-xl text-gray-500">{children}</p>
        </section>
    );
}
