import { api } from "@/app/constans";
import { PERMISSION_GROUPS } from "@/app/components/bit";
import { PROJECT_PERMISSION_BITS } from "@/app/components/project-position-bits";

export function authHeader() {
    return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export async function getJson<T>(path: string, params: Record<string, string | number | undefined>): Promise<T | null> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
    const res = await fetch(`${api}${path}?${query}`, { headers: authHeader() });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
}

// ชื่อสิทธิ์ภาษาไทยของ key ในบิตสิทธิ์ — ใช้แสดง "ได้เพิ่ม/ถูกถอน" ในรายละเอียด log ของ role/ตำแหน่ง
export const PERMISSION_LABEL: Record<string, string> = Object.fromEntries([
    ...PERMISSION_GROUPS.flatMap((g) => g.bits.map((b) => [b.key, `${g.groupLabel} › ${b.label}`])),
    ...PROJECT_PERMISSION_BITS.map((b) => [b.key, b.label]),
]);

// ชื่อคอลัมน์ที่พบบ่อยเป็นภาษาไทย — คอลัมน์ที่ไม่อยู่ในนี้แสดงชื่อเดิม (ผู้ดูแลระบบยังอ่านออก)
export const FIELD_LABEL: Record<string, string> = {
    user_username: "ชื่อผู้ใช้", user_email: "อีเมล", user_fname: "ชื่อ", user_lname: "นามสกุล", user_phone: "เบอร์โทร",
    user_line_uid: "Line ID", user_whatsapp_no: "WhatsApp", user_avatar_url: "รูปโปรไฟล์", user_role_id: "สิทธิ์ (role)",
    user_status: "สถานะบัญชี", user_must_change_password: "บังคับเปลี่ยนรหัสผ่าน", user_last_login_at: "เข้าสู่ระบบล่าสุด",
    role_name: "ชื่อสิทธิ์", role_permission: "สิทธิ์ที่เปิด", role_department: "แผนก",
    dep_name: "ชื่อแผนก", dep_status: "สถานะ",
    position_name: "ชื่อตำแหน่ง", position_permission: "สิทธิ์ในโปรเจกต์", position_status: "สถานะ",
    client_name: "ชื่อลูกค้า", client_company: "บริษัท", client_email: "อีเมลลูกค้า", client_phone: "เบอร์ลูกค้า",
    project_name: "ชื่อโปรเจกต์", project_description: "รายละเอียด", project_status: "สถานะโปรเจกต์", project_type: "รูปแบบโปรเจกต์",
    project_start_date: "วันเริ่ม", project_due_date: "วันครบกำหนด", project_completed_at: "เสร็จเมื่อ", client_id: "ลูกค้า",
    project_progress_percent: "ความคืบหน้า (%)", project_share_token: "ลิงก์ลูกค้า", project_share_enabled: "เปิดลิงก์ลูกค้า",
    project_use_task_weight: "ใช้น้ำหนักงาน",
    task_title: "ชื่องาน", task_description: "รายละเอียดงาน", task_status: "สถานะงาน", task_start_date: "วันเริ่ม",
    task_due_date: "วันครบกำหนด", task_completed_at: "เสร็จเมื่อ", task_weight: "น้ำหนัก", assignee_ids: "ผู้รับผิดชอบ",
    task_parent_id: "งานแม่", position_ids: "ตำแหน่ง",
    issue_title: "หัวข้อปัญหา", issue_description: "รายละเอียดปัญหา", issue_status: "สถานะปัญหา", issue_resolved_at: "แก้ไขเมื่อ",
    tagged_user_ids: "ผู้ถูกแท็ก", image_urls: "รูปแนบ",
};

export const EVENT_META: Record<string, { label: string; className: string }> = {
    create: { label: "สร้าง", className: "bg-green-50 text-green-700" },
    update: { label: "แก้ไข", className: "bg-blue-50 text-blue-700" },
    delete: { label: "ลบ", className: "bg-red-50 text-red-700" },
    action: { label: "ดำเนินการ", className: "bg-indigo-50 text-indigo-700" },
    view: { label: "เปิดดู", className: "bg-gray-100 text-gray-700" },
    denied: { label: "ถูกปฏิเสธ", className: "bg-amber-50 text-amber-700" },
    error: { label: "ผิดพลาด", className: "bg-red-100 text-red-800" },
};

export const ENTITY_LABEL: Record<string, string> = {
    user: "ผู้ใช้งาน", role: "สิทธิ์", department: "แผนก", project_position: "ตำแหน่ง", client: "ลูกค้า",
    project: "โปรเจกต์", project_member: "สมาชิกโปรเจกต์", task: "งาน", issue: "ปัญหา", issue_reply: "ตอบกลับปัญหา",
    task_chat: "แชทงาน", project_chat: "แชทโปรเจกต์", log: "Log",
};

// เวลาใน log ต้องละเอียดถึงวินาที (formatDate กลางของระบบตัดวินาทีทิ้ง) — ลำดับเหตุการณ์ในนาทีเดียวกันต้องแยกออก
export function formatLogTime(v: unknown): string {
    if (!v) return "-";
    const d = new Date(v as string);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok", year: "numeric", month: "short", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
}

export function formatValue(v: unknown): string {
    if (v === null || v === undefined || v === "") return "—";
    if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
    if (typeof v === "boolean") return v ? "ใช่" : "ไม่ใช่";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "medium", timeStyle: "medium" });
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
}

export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
    return (
        <div className="flex items-center gap-2 text-sm">
            <input type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)}
                className="h-9 rounded border border-gray-300 px-2 text-gray-700" aria-label="ตั้งแต่วันที่" />
            <span className="text-gray-400">ถึง</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)}
                className="h-9 rounded border border-gray-300 px-2 text-gray-700" aria-label="ถึงวันที่" />
        </div>
    );
}

export function FilterSelect({ value, onChange, options, label }: {
    value: string; onChange: (v: string) => void; options: [string, string][]; label: string;
}) {
    return (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
            className="h-9 rounded border border-gray-300 bg-white px-2 text-sm text-gray-700">
            {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
    );
}
