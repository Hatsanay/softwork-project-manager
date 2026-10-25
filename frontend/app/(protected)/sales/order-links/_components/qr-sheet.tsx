"use client";

// QR code ของลิงก์เลือกบริการ (2026-10-25) — ใช้ส่งเป็นรูปเมื่อแชตซ่อนลิงก์ (เช่น Fastwork)
// รูป PNG: ชื่อร้าน + QR + "สแกนเพื่อเลือกบริการ" + ที่อยู่แบบสั้นให้พิมพ์เอง · วาดในเครื่องด้วย qrcode (ตัวเดียวกับ QR พร้อมเพย์)
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, X } from "lucide-react";
import QRCode from "qrcode";
import FieldHint from "@/components/ui/guidance/field-hint";
import { buttonClass } from "@/components/ui/button";

const WIDTH = 720;
const HEIGHT = 920;

async function drawImage({ shopName, title, shortUrl, fullUrl }: { shopName: string; title: string; shortUrl: string; fullUrl: string }) {
    const qrDataUrl = await QRCode.toDataURL(fullUrl, { errorCorrectionLevel: "M", margin: 1, width: 560 });
    const qrImage = new Image();
    await new Promise((resolve, reject) => {
        qrImage.onload = resolve;
        qrImage.onerror = reject;
        qrImage.src = qrDataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d") as CanvasRenderingContext2D;
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.textAlign = "center";
    context.fillStyle = "#111827";
    context.font = `500 40px ${font}`;
    context.fillText(shopName, WIDTH / 2, 80, WIDTH - 80);
    context.fillStyle = "#2563eb";
    context.font = `500 30px ${font}`;
    context.fillText(title, WIDTH / 2, 130, WIDTH - 80);
    context.drawImage(qrImage, (WIDTH - 560) / 2, 170, 560, 560);
    context.fillStyle = "#374151";
    context.font = `400 28px ${font}`;
    context.fillText("หรือพิมพ์ที่อยู่นี้ในเบราว์เซอร์", WIDTH / 2, 790);
    context.fillStyle = "#111827";
    context.font = `500 30px ${font}`;
    context.fillText(shortUrl.replace(/^https?:\/\//, ""), WIDTH / 2, 840, WIDTH - 60);
    return canvas;
}

export default function QrSheet({
    shopName,
    shortUrl,
    fullUrl,
    fileName,
    onClose,
}: {
    shopName: string;
    shortUrl: string;
    fullUrl: string;
    fileName: string;
    onClose: () => void;
}) {
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    useEffect(() => {
        let isClosed = false;
        drawImage({ shopName, title: "สแกนเพื่อเลือกบริการ", shortUrl, fullUrl }).then((drawn) => {
            if (isClosed) return;
            setCanvas(drawn);
            setImageUrl(drawn.toDataURL("image/png"));
        });
        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") onClose();
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            isClosed = true;
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [shopName, shortUrl, fullUrl, onClose]);

    async function copyImage() {
        if (!canvas) return;
        try {
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
            if (!blob) throw new Error("no image");
            await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
            toast.success("คัดลอกรูปแล้ว วางในแชตได้เลย");
        } catch {
            toast.error("เบราว์เซอร์นี้คัดลอกรูปไม่ได้ ใช้ปุ่มบันทึกรูปแทน");
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/40 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="qr-title"
                onClick={(event) => event.stopPropagation()}
                className="grid max-h-[92dvh] w-full max-w-md gap-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-float sm:rounded-2xl"
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 id="qr-title" className="text-base font-medium text-gray-900">
                        QR code ของลิงก์
                    </h2>
                    <button type="button" aria-label="ปิด" className="-m-2 flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100" onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>
                {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt={`QR code ไปที่ ${shortUrl}`} className="mx-auto w-full max-w-xs rounded-xl border border-gray-100" />
                ) : (
                    <div className="mx-auto aspect-[18/23] w-full max-w-xs animate-pulse rounded-xl bg-gray-100" />
                )}
                <FieldHint>
                    ส่งรูปนี้ในแชตเมื่อแชตซ่อนลิงก์ · ลูกค้าบนมือถือกดค้างที่รูปเพื่อเปิด QR หรือบันทึกรูปแล้วสแกนจากคลังภาพ · ใต้รูปมีที่อยู่แบบสั้นให้พิมพ์เอง
                </FieldHint>
                <div className="flex flex-wrap justify-end gap-2">
                    <button type="button" className={buttonClass("secondary", "md")} onClick={copyImage} disabled={!canvas}>
                        <Copy size={16} />
                        คัดลอกรูป
                    </button>
                    {imageUrl && (
                        <a href={imageUrl} download={fileName} className={buttonClass("primary", "md")}>
                            <Download size={16} />
                            บันทึกรูป
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
