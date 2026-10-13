// ข้อความสั้นใต้ช่องกรอก (แบบที่ 1 ใน docs/plans/2026-10-12-ui-guidance.md) — เห็นตลอด ไม่ต้องชี้เมาส์
// มี error → แสดงข้อความ error สีแดงแทนที่ตำแหน่งเดิม (บอกวิธีแก้)
type FieldHintProps = {
    id?: string;
    error?: string | null;
    children?: React.ReactNode;
};

export default function FieldHint({ id, error, children }: FieldHintProps) {
    if (error) {
        return (
            <p id={id} role="alert" className="text-xs leading-relaxed text-red-600">
                {error}
            </p>
        );
    }
    if (!children) return null;
    return (
        <p id={id} className="text-xs leading-relaxed text-gray-500">
            {children}
        </p>
    );
}
