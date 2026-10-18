// ลวดลายบนบัตรพนักงาน (แบบทันสมัย ธีมฟ้า-ขาว 2026-10-18): พื้นไล่สีฟ้า + แสงนุ่ม + อนุภาค
// ลายสุ่มจาก seed (รหัสพนักงาน + ใบที่) → บัตรแต่ละใบลายไม่ซ้ำ แต่พิมพ์ซ้ำได้ลายเดิมทุกครั้ง
// วาดเป็น SVG หน่วยมิลลิเมตร (viewBox) — คมทั้งบนจอและตอนพิมพ์ ไม่ต้องโหลดรูป

type Particle = { x: number; y: number; radius: number; opacity: number };

// แปลงข้อความเป็นตัวเลขตั้งต้น (FNV-1a)
function hashText(text: string) {
    let hash = 2166136261;
    for (const character of text) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

// ตัวสุ่มที่กำหนดผลได้ (mulberry32) — seed เดิมได้ลำดับเดิมเสมอ
function seededRandom(seed: number) {
    let state = seed;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

const LINK_DISTANCE_MM = 8;

/**
 * อนุภาค (จุดเชื่อมเส้นแบบเครือข่าย) วางทับเต็มกรอบที่ครอบอยู่
 * @param color สีของจุด/เส้น · intensity คูณความทึบ (บนพื้นเข้มใช้ต่ำ ให้ดูเหมือนดาวจางๆ)
 */
export function CardParticles({
    seed,
    width,
    height,
    count = 24,
    color = "#fff",
    intensity = 1,
}: {
    seed: string;
    width: number;
    height: number;
    count?: number;
    color?: string;
    intensity?: number;
}) {
    const random = seededRandom(hashText(seed));
    const particles: Particle[] = Array.from({ length: count }, () => ({
        x: random() * width,
        y: random() * height,
        radius: 0.12 + random() * 0.38,
        opacity: (0.25 + random() * 0.6) * intensity,
    }));

    const links: { from: Particle; to: Particle; opacity: number }[] = [];
    particles.forEach((from, index) => {
        for (const to of particles.slice(index + 1)) {
            const distance = Math.hypot(from.x - to.x, from.y - to.y);
            if (distance < LINK_DISTANCE_MM) {
                links.push({ from, to, opacity: (1 - distance / LINK_DISTANCE_MM) * 0.35 * intensity });
            }
        }
    });

    return (
        <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
        >
            {links.map((link, index) => (
                <line
                    key={`link-${index}`}
                    x1={link.from.x}
                    y1={link.from.y}
                    x2={link.to.x}
                    y2={link.to.y}
                    stroke={color}
                    strokeWidth={0.08}
                    strokeOpacity={link.opacity}
                />
            ))}
            {particles.map((particle, index) => (
                <circle
                    key={`dot-${index}`}
                    cx={particle.x}
                    cy={particle.y}
                    r={particle.radius}
                    fill={color}
                    fillOpacity={particle.opacity}
                />
            ))}
        </svg>
    );
}

/** พื้นไล่สีฟ้าล้วน (blue-600 → blue-500) + แสงขาวนุ่มมุมขวาบน + เงาฟ้าเข้มมุมซ้ายล่าง ให้มีมิติ (ธีมฟ้า-ขาว) */
export const BLUE_MESH_CLASS =
    "bg-blue-600 [background-image:radial-gradient(ellipse_at_100%_0%,rgba(255,255,255,0.3),transparent_50%),radial-gradient(ellipse_at_0%_100%,rgba(30,64,175,0.35),transparent_55%),linear-gradient(135deg,var(--color-blue-600),var(--color-blue-500))]";

/** แสงฟ้านุ่มๆ มุมขวาบนบนพื้นขาว (ด้านหลัง) */
export const LIGHT_GLOW_CLASS =
    "bg-white [background-image:radial-gradient(ellipse_at_100%_0%,rgba(59,130,246,0.22),transparent_50%),radial-gradient(ellipse_at_0%_100%,rgba(37,99,235,0.08),transparent_45%)]";
