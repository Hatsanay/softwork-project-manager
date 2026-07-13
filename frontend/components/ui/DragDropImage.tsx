"use client";

import { useRef, useState, useCallback } from "react";
import { Upload, X } from "lucide-react";

type Props = {
    value?: string;            // URL รูปปัจจุบัน (สำหรับ edit)
    onChange: (file: File) => void;
    disabled?: boolean;
    maxSizeMB?: number;
};

export default function DragDropImage({ value, onChange, disabled, maxSizeMB = 5 }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<string | null>(value ?? null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFile = useCallback((file: File) => {
        setError(null);
        if (!file.type.startsWith("image/")) {
            setError("กรุณาอัพโหลดไฟล์รูปภาพเท่านั้น");
            return;
        }
        if (file.size > maxSizeMB * 1024 * 1024) {
            setError(`ขนาดไฟล์ต้องไม่เกิน ${maxSizeMB} MB`);
            return;
        }
        // revoke URL เดิมก่อนสร้างใหม่เพื่อป้องกัน memory leak
        if (preview && preview.startsWith("blob:")) URL.revokeObjectURL(preview);
        setPreview(URL.createObjectURL(file));
        onChange(file);
    }, [onChange, maxSizeMB, preview]);

    const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop      = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };
    const handleClick       = () => { if (!disabled) inputRef.current?.click(); };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = ""; // reset เพื่อให้เลือกไฟล์เดิมซ้ำได้
    };
    const handleRemove = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
        setPreview(null);
        setError(null);
    };

    return (
        <div className="flex flex-col gap-2">
            <div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={[
                    "relative border-2 border-dashed rounded-xl overflow-hidden transition-colors",
                    disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                    isDragging
                        ? "border-blue-400 bg-blue-50"
                        : "border-gray-300 hover:border-blue-400 hover:bg-gray-50",
                ].join(" ")}
            >
                {preview ? (
                    <div className="relative w-full h-48">
                        <img src={preview} alt="preview" className="w-full h-full object-cover" />
                        {!disabled && (
                            <button
                                type="button"
                                onClick={handleRemove}
                                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center gap-3 py-12 text-gray-400">
                        <Upload className="w-10 h-10" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-gray-600">
                                ลากรูปมาวางที่นี่ หรือ{" "}
                                <span className="text-blue-500 underline">คลิกเพื่อเลือก</span>
                            </p>
                            <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP ไม่เกิน {maxSizeMB} MB</p>
                        </div>
                    </div>
                )}
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
                disabled={disabled}
            />
        </div>
    );
}
