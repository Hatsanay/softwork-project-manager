export default function formatDate(value: unknown): string {
    if (!value) return "-";
    const d = new Date(value as string);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH", {
        year:     "numeric",
        month:    "short",
        day:      "2-digit",
        hour:     "2-digit",
        minute:   "2-digit",
        timeZone: "Asia/Bangkok",
    });
}

// สำหรับคอลัมน์ DATE ล้วนๆ (เช่น วันเริ่ม/วันครบกำหนด) ไม่ต้องโชว์เวลา
export function formatDateOnly(value: unknown): string {
    if (!value) return "-";
    const d = new Date(value as string);
    if (isNaN(d.getTime())) return "-";
    return d.toLocaleString("th-TH", {
        year:     "numeric",
        month:    "short",
        day:      "2-digit",
        timeZone: "Asia/Bangkok",
    });
}

// สำหรับ <input type="date"> ต้องเป็น yyyy-mm-dd ตรงๆ ไม่ผ่าน timezone conversion
export function toDateInputValue(value: unknown): string {
    if (!value) return "";
    const d = new Date(value as string);
    if (isNaN(d.getTime())) return "";
    const bangkok = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    const yyyy = bangkok.getFullYear();
    const mm = String(bangkok.getMonth() + 1).padStart(2, "0");
    const dd = String(bangkok.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
