// หัวหน้าแบบเดียวทุกหน้า: หมวด (เล็ก ฟ้า) · หัวข้อ · คำอธิบายสั้นว่าหน้านี้ทำอะไร · ปุ่มการกระทำชิดขวา
type PageHeaderProps = {
    eyebrow?: string;
    title: string;
    description?: React.ReactNode;
    actions?: React.ReactNode;
};

export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
    return (
        <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="grid min-w-0 gap-1">
                {eyebrow && <p className="text-xs font-medium tracking-wide text-blue-600">{eyebrow}</p>}
                <h1 className="text-2xl font-medium text-gray-900 sm:text-[1.75rem]">{title}</h1>
                {description && <p className="max-w-3xl text-sm text-gray-500">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
    );
}
