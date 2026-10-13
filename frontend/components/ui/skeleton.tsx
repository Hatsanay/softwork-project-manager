// โครงร่างระหว่างโหลด — บอกว่ากำลังโหลดอะไรโดยไม่กระพริบเป็นหน้าว่าง
export default function Skeleton({ className = "" }: { className?: string }) {
    return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-gray-200/70 ${className}`} />;
}

/** โครงร่างหน้าทั่วไป: หัวหน้า + การ์ด 2 ใบ */
export function PageSkeleton({ label = "กำลังโหลด..." }: { label?: string }) {
    return (
        <div className="grid gap-6" role="status" aria-label={label}>
            <div className="grid gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-4 w-96 max-w-full" />
            </div>
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
    );
}
