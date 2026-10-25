"use client";

// รูปบนหน้าร้านของลิงก์เลือกบริการ (2026-10-25) — ใช้ทั้งสินค้าและชุดสินค้า
// อัปโหลดได้เมื่อบันทึกรายการแล้ว (ต้องมีรหัส) · backend ย่อเป็น WebP ด้านยาวไม่เกิน 1200px
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";
import { apiFetch, uploadedFileUrl } from "@/lib/api";

type CatalogImageFieldProps = {
    // "/products/PRD..." หรือ "/product-packages/PKG..." · null = ยังไม่ได้บันทึก
    basePath: string | null;
    imageUrl: string | null;
    onChanged: (imageUrl: string | null) => void;
};

export default function CatalogImageField({ basePath, imageUrl, onChanged }: CatalogImageFieldProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [isWorking, setIsWorking] = useState(false);

    async function upload(file: File) {
        if (!basePath) return;
        setError(null);
        setIsWorking(true);
        const form = new FormData();
        form.append("image", file);
        const { data, error: uploadError } = await apiFetch<{ image_url: string }>(`${basePath}/image`, { method: "POST", body: form });
        setIsWorking(false);
        if (uploadError) {
            setError(uploadError.fields.image ?? uploadError.message);
            return;
        }
        toast.success("อัปโหลดรูปแล้ว");
        onChanged(data.image_url);
    }

    async function remove() {
        if (!basePath) return;
        setIsWorking(true);
        const { error: removeError } = await apiFetch(`${basePath}/image`, { method: "DELETE" });
        setIsWorking(false);
        if (removeError) {
            setError(removeError.message);
            return;
        }
        onChanged(null);
    }

    return (
        <div className="grid gap-2">
            <span className="text-sm text-gray-800">รูปบนหน้าร้าน</span>
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                    {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={uploadedFileUrl(imageUrl)} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <ImagePlus size={22} className="text-gray-300" aria-hidden="true" />
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        className={buttonClass("secondary", "sm")}
                        disabled={!basePath || isWorking}
                        onClick={() => inputRef.current?.click()}
                    >
                        <ImagePlus size={15} />
                        {imageUrl ? "เปลี่ยนรูป" : "เพิ่มรูป"}
                    </button>
                    {imageUrl && (
                        <button type="button" className={buttonClass("ghost", "sm")} disabled={isWorking} onClick={remove}>
                            <Trash2 size={15} />
                            ลบรูป
                        </button>
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) upload(file);
                    }}
                />
            </div>
            <FieldHint error={error}>
                {basePath ? "PNG, JPG หรือ WebP · ระบบย่อให้เอง · แนวนอน 4:3 ดูดีที่สุดบนมือถือ" : "บันทึกรายการก่อน แล้วจึงเพิ่มรูปได้"}
            </FieldHint>
        </div>
    );
}
