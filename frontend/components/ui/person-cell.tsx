// ช่องแสดงคนในตาราง/รายการ: รูปโปรไฟล์ (หรืออักษรย่อ) + ชื่อ + บรรทัดรอง (เช่น @ชื่อผู้ใช้, ตำแหน่ง)
import Image from "next/image";
import { uploadedFileUrl } from "@/lib/api";

type PersonCellProps = {
    name: string;
    subtitle?: React.ReactNode;
    avatarPath?: string | null;
};

// สระหน้าของไทย (เ แ โ ใ ไ) ไม่ใช่ตัวแรกที่คนใช้เป็นอักษรย่อ — "ใจดี" ควรได้ "จ" ไม่ใช่ "ใ"
const THAI_LEADING_VOWELS = /^[เแโใไ]+/;

/** อักษรย่อจากชื่อ-นามสกุล เช่น "สมชาย ใจดี" → "สจ", "John Smith" → "JS" */
export function initialsOf(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const initials = parts
        .map((part) => part.replace(THAI_LEADING_VOWELS, "")[0] ?? "")
        .join("")
        .slice(0, 2)
        .toUpperCase();
    return initials || "?";
}

export default function PersonCell({ name, subtitle, avatarPath }: PersonCellProps) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            {avatarPath ? (
                <Image
                    src={uploadedFileUrl(avatarPath)}
                    alt=""
                    width={36}
                    height={36}
                    unoptimized
                    className="h-9 w-9 shrink-0 rounded-xl object-cover"
                />
            ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-blue-50 to-blue-100 text-xs font-medium text-blue-600">
                    {initialsOf(name)}
                </span>
            )}
            <div className="grid min-w-0 leading-tight">
                <span className="truncate text-gray-900">{name}</span>
                {subtitle && <span className="truncate text-xs text-gray-400">{subtitle}</span>}
            </div>
        </div>
    );
}
