// เรียก API ของ backend — ที่เดียวของหน้าเว็บ (2026-10-13, docs/CODING_GUIDELINES.md หัวข้อ 5)
//
//   const { data, error } = await apiFetch<CompanySettings>("/company");
//   if (error) { setBanner(error.message); setFieldErrors(error.fields); return; }
//
// - แนบ token ให้เอง · body ที่เป็น object ส่งเป็น JSON · FormData ส่งแบบ multipart (อัปโหลดไฟล์)
// - error ทุกแบบแปลงเป็นรูปเดียว { message, code, fields, request_id } ตามหัวข้อ 3.3 — ไม่ต้องเช็ก res.ok เองทุกหน้า
// - 401 (token หมดอายุ/ถูกออกจากระบบ) → ไปหน้า login แล้วกลับมาหน้าเดิมหลัง login
// หน้าเดิมที่ยังใช้ fetch ตรงๆ ย้ายมาใช้ตัวนี้เมื่อแก้หน้านั้น
import { api } from "@/app/constans";

export type ApiError = {
    status: number;
    message: string;
    code: string | null;
    fields: Record<string, string>;
    request_id: string | null;
};

export type ApiResult<T> = { data: T; error: null } | { data: null; error: ApiError };

type ApiOptions = {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
};

const NETWORK_ERROR_MESSAGE = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";
const UNKNOWN_ERROR_MESSAGE = "เกิดข้อผิดพลาด กรุณาลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ";

// โหลดหน้าใหม่ทั้งหน้า (ไม่ใช้ router) — ล้าง state ของผู้ใช้เดิมที่ค้างอยู่ในหน้าทิ้งทั้งหมด และเรียกจากนอก component ได้
function goToLogin() {
    const currentPath = window.location.pathname + window.location.search;
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
}

function toApiError(status: number, body: unknown): ApiError {
    const payload = (body ?? {}) as Partial<ApiError>;
    return {
        status,
        message: typeof payload.message === "string" ? payload.message : UNKNOWN_ERROR_MESSAGE,
        code: typeof payload.code === "string" ? payload.code : null,
        fields: payload.fields && typeof payload.fields === "object" ? payload.fields : {},
        request_id: typeof payload.request_id === "string" ? payload.request_id : null,
    };
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<ApiResult<T>> {
    const { method = "GET", body } = options;
    const isForm = body instanceof FormData;

    const headers: Record<string, string> = {};
    const token = localStorage.getItem("token");
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

    let response: Response;
    try {
        response = await fetch(`${api}${path}`, {
            method,
            headers,
            body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
        });
    } catch {
        return { data: null, error: toApiError(0, { message: NETWORK_ERROR_MESSAGE }) };
    }

    if (response.status === 401) {
        goToLogin();
        return { data: null, error: toApiError(401, { message: "หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่" }) };
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }

    if (!response.ok) {
        return { data: null, error: toApiError(response.status, parsed) };
    }
    return { data: parsed as T, error: null };
}

// ไฟล์ที่ต้อง login ถึงเปิดได้ (เช่น รูปลายเซ็น) — <img src> แนบ token ไม่ได้ จึงโหลดเป็น Blob แล้วทำ URL ชั่วคราว
// ไม่สำเร็จคืน null (ผู้เรียกแสดงช่องว่างแทน) · 401 ไปหน้า login เหมือน apiFetch
export async function apiFetchBlob(path: string): Promise<Blob | null> {
    const headers: Record<string, string> = {};
    const token = localStorage.getItem("token");
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
        const response = await fetch(`${api}${path}`, { headers });
        if (response.status === 401) {
            goToLogin();
            return null;
        }
        return response.ok ? await response.blob() : null;
    } catch {
        return null;
    }
}

// path ไฟล์ที่อัปโหลดไว้ในเซิร์ฟเวอร์ (เช่น "/uploads/company/logo-1.png") → URL เต็ม
// backend เสิร์ฟ /uploads ที่ origin เดียวกับ API (คนละโดเมนกับหน้าเว็บ)
export function uploadedFileUrl(path: string): string {
    return `${new URL(api).origin}${path}`;
}
