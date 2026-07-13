"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { Upload, ZoomIn, ZoomOut } from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────

function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(reader.result as string));
        reader.addEventListener("error", reject);
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener("load", () => resolve(img));
        img.addEventListener("error", reject);
        img.setAttribute("crossOrigin", "anonymous");
        img.src = src;
    });
}

async function cropToFile(imageSrc: string, pixelCrop: Area): Promise<File> {
    const image = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    const OUTPUT = 256; // px — ขนาด output รูปโปรไฟล์
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;

    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
        image,
        pixelCrop.x, pixelCrop.y,
        pixelCrop.width, pixelCrop.height,
        0, 0, OUTPUT, OUTPUT,
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => blob
                ? resolve(new File([blob], "avatar.jpg", { type: "image/jpeg" }))
                : reject(new Error("Canvas is empty")),
            "image/jpeg",
            0.92,
        );
    });
}

// ─── component ────────────────────────────────────────────────────────────────

type Props = {
    value?: string;
    onChange: (file: File) => void;
    disabled?: boolean;
};

export default function AvatarCrop({ value, onChange, disabled }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);

    const [imageSrc, setImageSrc]   = useState<string | null>(null); // raw image ก่อน crop
    const [preview, setPreview]     = useState<string | null>(value ?? null); // ผลลัพธ์หลัง crop
    const [crop, setCrop]           = useState({ x: 0, y: 0 });
    const [zoom, setZoom]           = useState(1);
    const [croppedArea, setCroppedArea] = useState<Area | null>(null);
    const [error, setError]         = useState<string | null>(null);

    const onCropComplete = useCallback((_: Area, pixels: Area) => {
        setCroppedArea(pixels);
    }, []);

    async function handleFile(file: File) {
        setError(null);
        if (!file.type.startsWith("image/")) {
            setError("กรุณาอัพโหลดไฟล์รูปภาพเท่านั้น");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError("ขนาดไฟล์ต้องไม่เกิน 10 MB");
            return;
        }
        const dataUrl = await readFileAsDataUrl(file);
        setImageSrc(dataUrl);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
    }

    async function handleConfirm() {
        if (!imageSrc || !croppedArea) return;
        try {
            const file = await cropToFile(imageSrc, croppedArea);
            const blobUrl = URL.createObjectURL(file);
            if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
            setPreview(blobUrl);
            setImageSrc(null);
            onChange(file);
        } catch {
            setError("เกิดข้อผิดพลาดในการครอปรูป");
        }
    }

    function handleCancel() {
        setImageSrc(null);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    return (
        <div className="flex flex-col items-center gap-2">
            {/* วงกลม preview / dropzone */}
            <div
                onClick={() => !disabled && inputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={[
                    "relative w-32 h-32 rounded-full border-2 border-dashed overflow-hidden",
                    "flex items-center justify-center bg-gray-50 transition-colors",
                    disabled
                        ? "opacity-50 cursor-not-allowed border-gray-200"
                        : "cursor-pointer border-gray-300 hover:border-blue-400 hover:bg-blue-50",
                ].join(" ")}
            >
                {preview ? (
                    <img src={preview} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-400">
                        <Upload size={22} />
                        <span className="text-xs text-center leading-tight">อัพโหลด<br />รูปภาพ</span>
                    </div>
                )}
            </div>

            <p className="text-xs text-gray-400">PNG, JPG, WEBP • ลากวางหรือคลิก • ไม่เกิน 10 MB</p>
            {error && <p className="text-xs text-red-600">{error}</p>}

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                disabled={disabled}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                }}
            />

            {/* Modal crop */}
            {imageSrc && (
                <div className="fixed inset-0 z-50 flex flex-col bg-black/85">
                    {/* Crop area */}
                    <div className="relative flex-1">
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            aspect={1}
                            cropShape="round"
                            showGrid={false}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={onCropComplete}
                        />
                    </div>

                    {/* Controls */}
                    <div className="bg-gray-900 px-6 py-5 flex flex-col gap-4">
                        <p className="text-center text-sm text-gray-400">ลากเพื่อปรับตำแหน่ง • Scroll หรือเลื่อน slider เพื่อซูม</p>

                        {/* Zoom slider */}
                        <div className="flex items-center gap-3">
                            <ZoomOut size={18} className="text-gray-400 shrink-0" />
                            <input
                                type="range"
                                min={1}
                                max={3}
                                step={0.01}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="flex-1 accent-blue-500 cursor-pointer"
                            />
                            <ZoomIn size={18} className="text-gray-400 shrink-0" />
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-3 justify-end">
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="px-5 py-2 rounded-lg text-sm text-gray-300 border border-gray-600 hover:bg-gray-700 transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                className="px-5 py-2 rounded-lg text-sm text-white bg-blue-500 hover:bg-blue-600 transition-colors"
                            >
                                ตกลง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
