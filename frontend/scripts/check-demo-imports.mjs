// ตรวจว่าเดโมหน้า login (app/login/components/system-demo) ไม่ดึงโค้ดที่เรียก API / เปลี่ยนหน้า / เด้ง toast เข้ามา
// (docs/plans/2026-10-18-login-demo-real-ui.md ข้อ R4) — เดโมใช้ส่วนแสดงผล (View) ของหน้าจริง ถ้า View ไปเรียก apiFetch
// บนหน้า login แล้วได้ 401 ระบบจะพาไปหน้า login ซ้ำไม่จบ · ไล่ทุกไฟล์ที่เดโม import ต่อกันไปจนสุด แล้วฟ้องไฟล์ที่ผิดกติกา
// รันพร้อม `npm run lint`
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO_DIR = path.join(FRONTEND_ROOT, "app/login/components/system-demo");
const EXTENSIONS = [".tsx", ".ts", ".mjs", ".js"];

// แพ็กเกจ/โมดูลที่ห้ามมีในโค้ดที่เดโมใช้ และเหตุผล (แสดงตอนฟ้อง)
const FORBIDDEN_MODULES = {
    "next/navigation": "เปลี่ยนหน้า/อ่าน URL ของหน้า login — รับค่าและ callback ผ่าน props แทน",
    "next/link": "prefetch หน้าในระบบ — ใช้ ViewLink (components/ui/view-link.tsx)",
    sonner: "toast จะเด้งบนหน้า login — ให้ตัวโหลดข้อมูล (page) เป็นคนเรียก",
    "@/app/logout": "server action ออกจากระบบ",
};
// ไฟล์ที่ได้รับยกเว้น: ViewLink คือตัวห่อ next/link ที่ปิด prefetch ในเดโมได้ (ตัวที่ให้ใช้แทน)
const ALLOWED_FILES = new Set(["components/ui/view-link.tsx"]);
// โมดูลที่ import ได้ แต่ห้ามบางชื่อ (และไม่ต้องไล่เข้าไปข้างใน)
const FORBIDDEN_NAMES = { "@/lib/api": ["apiFetch"] };

function resolveImport(fromFile, specifier) {
    let base;
    if (specifier.startsWith("@/")) base = path.join(FRONTEND_ROOT, specifier.slice(2));
    else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
    else return null;
    const candidates = [
        base,
        ...EXTENSIONS.map((ext) => base + ext),
        ...EXTENSIONS.map((ext) => path.join(base, "index" + ext)),
    ];
    return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function importsOf(source) {
    const found = [];
    const pattern =
        /import\s+(type\s+)?([\s\S]*?)\s*from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g;
    for (const match of source.matchAll(pattern)) {
        if (match[1]) continue; // import type — ไม่มีโค้ดจริง
        found.push({ clause: match[2] ?? "", specifier: match[3] ?? match[4] ?? match[5] });
    }
    return found;
}

const problems = [];
const visited = new Set();
const queue = fs
    .readdirSync(DEMO_DIR)
    .filter((name) => EXTENSIONS.some((ext) => name.endsWith(ext)))
    .map((name) => path.join(DEMO_DIR, name));

while (queue.length > 0) {
    const file = queue.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const source = fs.readFileSync(file, "utf8");
    const relative = path.relative(FRONTEND_ROOT, file).replaceAll("\\", "/");
    if (ALLOWED_FILES.has(relative)) continue;
    if (/(^|[^.\w])fetch\(/.test(source.replace(/\/\/.*$/gm, ""))) problems.push(`${relative}: เรียก fetch() ตรง`);
    for (const { clause, specifier } of importsOf(source)) {
        if (FORBIDDEN_MODULES[specifier]) {
            problems.push(`${relative}: import "${specifier}" — ${FORBIDDEN_MODULES[specifier]}`);
            continue;
        }
        if (FORBIDDEN_NAMES[specifier]) {
            for (const name of FORBIDDEN_NAMES[specifier]) {
                if (new RegExp(`\\b${name}\\b`).test(clause))
                    problems.push(`${relative}: import ${name} จาก "${specifier}"`);
            }
            continue;
        }
        const resolved = resolveImport(file, specifier);
        if (resolved) queue.push(resolved);
    }
}

if (problems.length > 0) {
    console.error(`เดโมหน้า login ใช้โค้ดที่ห้ามใช้ (${problems.length} จุด):\n- ${problems.join("\n- ")}`);
    process.exit(1);
}
console.log(`เดโมหน้า login: ตรวจ ${visited.size} ไฟล์ ไม่พบการเรียก API/เปลี่ยนหน้า/toast`);
