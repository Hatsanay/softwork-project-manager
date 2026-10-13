// สวิตช์เปิด/ปิด พร้อมชื่อและคำอธิบายผลที่เกิด (ใช้แทน checkbox สำหรับการตั้งค่า)
// ใช้ input checkbox จริงข้างใต้ — คีย์บอร์ด/โปรแกรมอ่านหน้าจอใช้ได้เหมือน checkbox ปกติ
type SwitchProps = {
    id: string;
    label: string;
    description?: React.ReactNode;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

export default function Switch({ id, label, description, checked, disabled = false, onChange }: SwitchProps) {
    return (
        <label
            htmlFor={id}
            className={`flex items-start gap-3.5 ${disabled ? "cursor-default opacity-70" : "cursor-pointer"}`}
        >
            <input
                id={id}
                type="checkbox"
                role="switch"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.target.checked)}
                className="peer sr-only"
            />
            <span
                aria-hidden="true"
                className="relative mt-0.5 h-6 w-[42px] shrink-0 rounded-full bg-gray-300 transition peer-checked:bg-blue-500 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-500/20 after:absolute after:left-[3px] after:top-[3px] after:h-[18px] after:w-[18px] after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-[18px]"
            />
            <span className="grid gap-0.5">
                <span className="text-sm text-gray-800">{label}</span>
                {description && <span className="text-xs leading-relaxed text-gray-500">{description}</span>}
            </span>
        </label>
    );
}
