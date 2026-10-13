"use client";

// ช่องเซ็นบนจอ — ใช้ได้ทั้งเมาส์ ปากกา และนิ้ว (Pointer Events) · พื้นโปร่งใส ส่งออกเป็น PNG
// ความละเอียดตาม devicePixelRatio ลายเส้นจึงคมบนจอมือถือ · เซิร์ฟเวอร์ตัดขอบและย่อให้อีกรอบ
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

const STROKE_COLOR = "#1f2937"; // gray-800 — ใกล้หมึกดำบนเอกสาร
const STROKE_WIDTH = 2.5;
const PAD_HEIGHT = 180;

export type SignaturePadHandle = {
    // ไม่ได้เซ็น = null
    toPngBlob: () => Promise<Blob | null>;
    clear: () => void;
};

type SignaturePadProps = {
    onChange?: (hasDrawing: boolean) => void;
};

const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(function SignaturePad({ onChange }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasDrawing, setHasDrawing] = useState(false);

    function updateHasDrawing(value: boolean) {
        setHasDrawing(value);
        onChange?.(value);
    }

    // ตั้งขนาดจริงของ canvas ตามขนาดที่เห็น × ความละเอียดจอ — ทำตอนเริ่มเซ็นครั้งแรก (ตอนนั้นรู้ขนาดแน่นอนแล้ว)
    function prepareCanvas(canvas: HTMLCanvasElement) {
        const scale = window.devicePixelRatio || 1;
        const width = Math.round(canvas.clientWidth * scale);
        const height = Math.round(canvas.clientHeight * scale);
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = width;
        canvas.height = height;
    }

    function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
        const canvas = event.currentTarget;
        const bounds = canvas.getBoundingClientRect();
        return {
            x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
            y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
        };
    }

    function handlePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
        const canvas = event.currentTarget;
        if (!hasDrawing) prepareCanvas(canvas);
        canvas.setPointerCapture(event.pointerId);
        lastPointRef.current = pointFromEvent(event);
        drawTo(canvas, lastPointRef.current); // แตะครั้งเดียวก็เป็นจุด
    }

    function handlePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
        if (!lastPointRef.current) return;
        drawTo(event.currentTarget, pointFromEvent(event));
    }

    function handlePointerUp() {
        lastPointRef.current = null;
    }

    function drawTo(canvas: HTMLCanvasElement, point: { x: number; y: number }) {
        const context = canvas.getContext("2d");
        const from = lastPointRef.current;
        if (!context || !from) return;
        context.strokeStyle = STROKE_COLOR;
        context.lineWidth = STROKE_WIDTH * (window.devicePixelRatio || 1);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(point.x + 0.01, point.y);
        context.stroke();
        lastPointRef.current = point;
        if (!hasDrawing) updateHasDrawing(true);
    }

    function clear() {
        const canvas = canvasRef.current;
        canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
        updateHasDrawing(false);
    }

    useImperativeHandle(ref, () => ({
        clear,
        toPngBlob: () =>
            new Promise((resolve) => {
                const canvas = canvasRef.current;
                if (!canvas || !hasDrawing) return resolve(null);
                canvas.toBlob((blob) => resolve(blob), "image/png");
            }),
    }));

    return (
        <div className="grid gap-2">
            <div className="relative rounded-xl border border-dashed border-gray-300 bg-white">
                <canvas
                    ref={canvasRef}
                    aria-label="ช่องเซ็นชื่อ ใช้เมาส์หรือนิ้วเซ็น"
                    style={{ height: PAD_HEIGHT, touchAction: "none" }}
                    className="block w-full cursor-crosshair rounded-xl"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                />
                {!hasDrawing && (
                    <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
                        เซ็นชื่อในกรอบนี้
                    </p>
                )}
                <span className="pointer-events-none absolute right-6 bottom-10 left-6 border-b border-gray-200" />
            </div>
            <div className="flex justify-end">
                <button type="button" className={buttonClass("ghost", "sm")} onClick={clear} disabled={!hasDrawing}>
                    <Eraser size={16} />
                    ล้าง
                </button>
            </div>
        </div>
    );
});

export default SignaturePad;
