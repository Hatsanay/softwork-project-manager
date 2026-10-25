// เรียก API สาธารณะของหน้าร้าน (ไม่แนบ token · 401 ไม่พาไปหน้า login เพราะลูกค้าไม่มีบัญชี)
// รูปของ error เหมือน apiFetch ({ message, code, fields }) ให้หน้าใช้แบบเดียวกัน
import { api } from "@/app/constans";
import type { ApiError, ApiResult } from "@/lib/api";

const NETWORK_ERROR = "เชื่อมต่อไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่";

export async function publicFetch<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<ApiResult<T>> {
    let response: Response;
    try {
        // FormData = แนบไฟล์ (เบราว์เซอร์ตั้ง Content-Type multipart เอง) · object = JSON
        const isForm = options.body instanceof FormData;
        response = await fetch(`${api}${path}`, {
            method: options.method ?? "GET",
            headers: options.body === undefined || isForm ? undefined : { "Content-Type": "application/json" },
            body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
        });
    } catch {
        return { data: null, error: { status: 0, message: NETWORK_ERROR, code: null, fields: {}, request_id: null } };
    }
    const text = await response.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = null;
    }
    if (response.ok) return { data: parsed as T, error: null };
    const payload = (parsed ?? {}) as Partial<ApiError>;
    return {
        data: null,
        error: {
            status: response.status,
            message: typeof payload.message === "string" ? payload.message : "เกิดข้อผิดพลาด กรุณาลองใหม่",
            code: typeof payload.code === "string" ? payload.code : null,
            fields: payload.fields && typeof payload.fields === "object" ? payload.fields : {},
            request_id: null,
        },
    };
}
