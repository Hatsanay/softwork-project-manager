"use client";

// พื้นหลังอนุภาคลอย (2026-10-26) ใช้ที่หน้าลูกค้าทุกหน้า (components/customer) + หน้า login: จุดฟ้า/เทาลอยช้าๆ กะพริบเบาๆ + เส้นบางเชื่อมจุดที่อยู่ใกล้กัน
// + แสงฟ้านุ่มก้อนใหญ่ 3-4 ก้อนลอยช้ามาก: บนมือถือการ์ดบังพื้นเกือบหมด แสงนี้ลอดกระจกการ์ดให้เห็นว่าพื้นมีชีวิต
// จอที่มีเมาส์: จุดใกล้เมาส์มีเส้นโยงหาเมาส์ · มือถือไม่มี (นิ้วแตะแล้วเส้นค้าง ดูเหมือนบั๊ก)
// วาดบน canvas ชั้นหลังเนื้อหา (fixed · -z-10 · ไม่รับคลิก) · กรอบหน้าที่ใส่ต้องเป็น isolate ไม่งั้นจุดหลุดไปอยู่ใต้พื้นหลังของกรอบ · การ์ดกระจกเบลอจุดที่อยู่ข้างหลังเอง ตัวหนังสือยังอ่านง่าย
// ผู้ใช้ปิดการเคลื่อนไหวในเครื่อง → วาดภาพนิ่งครั้งเดียว · จำกัด 30 ภาพ/วินาที ให้มือถือไม่ร้อนไม่กินแบต
// แท็บที่ซ่อนอยู่ เบราว์เซอร์หยุด requestAnimationFrame ให้เอง
// ตำแหน่งจุดเก็บไว้ระดับโมดูล: หน้าโหลด (CustomerLoading) → หน้าจริง (CustomerShell) จุดลอยต่อ ไม่สุ่มใหม่จนภาพกระโดด
import { useEffect, useRef } from "react";

/** แสงนุ่ม: ตำแหน่งเป็นสัดส่วนของจอ (0-1) ไม่ต้องย้ายตอนจอเปลี่ยนขนาด · รัศมีเป็นสัดส่วนของด้านยาวของจอ */
type Glow = {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
    color: string;
    alpha: number;
};

type Particle = {
    x: number;
    y: number;
    velocityX: number;
    velocityY: number;
    radius: number;
    color: string;
    phase: number;
};

// สีในธีมเท่านั้น: blue-500 · blue-600 · gray-400 (ฟ้ามากกว่าเทา)
const COLORS = ["59 130 246", "59 130 246", "37 99 235", "152 162 179"];
const LINK_COLOR = "59 130 246";
const LINK_DISTANCE = 120;
const POINTER_DISTANCE = 170;
const FRAME_INTERVAL_MS = 1000 / 30;
// พื้นที่จอต่อ 1 จุด · มือถือ 400×860 ได้ราว 21 จุด · จอคอม 1440×900 ได้ราว 70 จุด
const AREA_PER_PARTICLE = 16000;
const MIN_PARTICLES = 16;
const MAX_PARTICLES = 70;
// จุดหลุดขอบจอแล้วโผล่อีกฝั่ง · เว้นระยะไว้ให้หายพ้นขอบก่อน ไม่ใช่หายกลางเส้น
const EDGE_MARGIN = 20;
// แสงเด้งกลับเมื่อเลยขอบจอไปสัดส่วนนี้ (ก้อนใหญ่ ถ้าวนไปโผล่อีกฝั่งจะเห็นแสงกระโดด)
const GLOW_EDGE = 0.15;

const particles: Particle[] = [];
const glows: Glow[] = [
    createGlow(0.15, 0.3, 0.34, "59 130 246", 0.13),
    createGlow(0.85, 0.2, 0.3, "37 99 235", 0.1),
    createGlow(0.7, 0.75, 0.38, "59 130 246", 0.11),
    createGlow(0.25, 0.9, 0.28, "37 99 235", 0.09),
];
let lastWidth = 0;
let lastHeight = 0;

function randomBetween(min: number, max: number) {
    return min + Math.random() * (max - min);
}

function createGlow(x: number, y: number, radius: number, color: string, alpha: number): Glow {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(0.00025, 0.0005);
    return { x, y, velocityX: Math.cos(angle) * speed, velocityY: Math.sin(angle) * speed, radius, color, alpha };
}

function createParticle(width: number, height: number): Particle {
    const angle = Math.random() * Math.PI * 2;
    const speed = randomBetween(0.12, 0.4);
    return {
        x: Math.random() * width,
        y: Math.random() * height,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: randomBetween(1.2, 3),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        phase: Math.random() * Math.PI * 2,
    };
}

/** ขนาดจอเปลี่ยน (หมุนจอ · แถบที่อยู่มือถือยุบ) → ย้ายจุดตามสัดส่วน แล้วเติม/ตัดให้จำนวนพอดีพื้นที่ใหม่ */
function fitParticles(width: number, height: number) {
    if (lastWidth > 0 && lastHeight > 0) {
        const scaleX = width / lastWidth;
        const scaleY = height / lastHeight;
        for (const particle of particles) {
            particle.x *= scaleX;
            particle.y *= scaleY;
        }
    }
    lastWidth = width;
    lastHeight = height;

    const target = Math.round(Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, (width * height) / AREA_PER_PARTICLE)));
    while (particles.length < target) {
        particles.push(createParticle(width, height));
    }
    particles.length = target;
}

function moveParticles(width: number, height: number, time: number) {
    for (const glow of glows) {
        glow.x += glow.velocityX;
        glow.y += glow.velocityY;
        if (glow.x < -GLOW_EDGE || glow.x > 1 + GLOW_EDGE) glow.velocityX = -glow.velocityX;
        if (glow.y < -GLOW_EDGE || glow.y > 1 + GLOW_EDGE) glow.velocityY = -glow.velocityY;
    }

    for (const particle of particles) {
        // ส่ายเบาๆ ตามคลื่น ให้ดูลอยในอากาศ ไม่ใช่วิ่งเป็นเส้นตรง
        particle.x += particle.velocityX + Math.sin(time * 0.0006 + particle.phase) * 0.08;
        particle.y += particle.velocityY + Math.cos(time * 0.0005 + particle.phase) * 0.08;

        if (particle.x < -EDGE_MARGIN) particle.x = width + EDGE_MARGIN;
        if (particle.x > width + EDGE_MARGIN) particle.x = -EDGE_MARGIN;
        if (particle.y < -EDGE_MARGIN) particle.y = height + EDGE_MARGIN;
        if (particle.y > height + EDGE_MARGIN) particle.y = -EDGE_MARGIN;
    }
}

function drawParticles(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    time: number,
    pointer: { x: number; y: number } | null,
) {
    context.clearRect(0, 0, width, height);

    const longSide = Math.max(width, height);
    for (const glow of glows) {
        const centerX = glow.x * width;
        const centerY = glow.y * height;
        const radius = glow.radius * longSide;
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, `rgb(${glow.color} / ${glow.alpha})`);
        gradient.addColorStop(1, `rgb(${glow.color} / 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
    }

    context.lineWidth = 1;

    for (let first = 0; first < particles.length; first++) {
        for (let second = first + 1; second < particles.length; second++) {
            const distance = Math.hypot(
                particles[first].x - particles[second].x,
                particles[first].y - particles[second].y,
            );
            if (distance >= LINK_DISTANCE) continue;

            const alpha = (1 - distance / LINK_DISTANCE) * 0.22;
            context.strokeStyle = `rgb(${LINK_COLOR} / ${alpha})`;
            context.beginPath();
            context.moveTo(particles[first].x, particles[first].y);
            context.lineTo(particles[second].x, particles[second].y);
            context.stroke();
        }
    }

    if (pointer) {
        for (const particle of particles) {
            const distance = Math.hypot(particle.x - pointer.x, particle.y - pointer.y);
            if (distance >= POINTER_DISTANCE) continue;

            const alpha = (1 - distance / POINTER_DISTANCE) * 0.4;
            context.strokeStyle = `rgb(${LINK_COLOR} / ${alpha})`;
            context.beginPath();
            context.moveTo(particle.x, particle.y);
            context.lineTo(pointer.x, pointer.y);
            context.stroke();
        }
    }

    for (const particle of particles) {
        const twinkle = 0.5 + Math.sin(time * 0.0015 + particle.phase) * 0.25;
        context.fillStyle = `rgb(${particle.color} / ${twinkle})`;
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
    }
}

export default function ParticleBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
        let width = 0;
        let height = 0;
        let pointer: { x: number; y: number } | null = null;
        let frameId = 0;
        let lastFrameAt = 0;

        const resize = () => {
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            if (width === 0 || height === 0) return;

            // จอความละเอียดสูงคมชัด แต่ไม่เกิน 2 เท่า (3 เท่าบนมือถือบางรุ่นหนักเกินไป)
            const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(width * pixelRatio);
            canvas.height = Math.round(height * pixelRatio);
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
            fitParticles(width, height);
            drawParticles(context, width, height, performance.now(), pointer);
        };

        const animate = (time: number) => {
            frameId = requestAnimationFrame(animate);
            if (time - lastFrameAt < FRAME_INTERVAL_MS) return;

            lastFrameAt = time;
            moveParticles(width, height, time);
            drawParticles(context, width, height, time, pointer);
        };

        const start = () => {
            cancelAnimationFrame(frameId);
            if (reducedMotion.matches) {
                drawParticles(context, width, height, 0, null);
                return;
            }
            frameId = requestAnimationFrame(animate);
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (!finePointer.matches || reducedMotion.matches) return;
            pointer = { x: event.clientX, y: event.clientY };
        };
        const handlePointerLeave = () => {
            pointer = null;
        };

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(canvas);
        resize();
        start();

        reducedMotion.addEventListener("change", start);
        window.addEventListener("pointermove", handlePointerMove, { passive: true });
        document.documentElement.addEventListener("pointerleave", handlePointerLeave);

        return () => {
            cancelAnimationFrame(frameId);
            resizeObserver.disconnect();
            reducedMotion.removeEventListener("change", start);
            window.removeEventListener("pointermove", handlePointerMove);
            document.documentElement.removeEventListener("pointerleave", handlePointerLeave);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="pointer-events-none fixed inset-0 -z-10 h-full w-full print:hidden"
            aria-hidden="true"
        />
    );
}
