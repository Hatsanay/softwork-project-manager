// เปิดไฟล์ที่โหลดมาเป็น Blob (2026-10-26 Q-1 docs/plans/2026-10-26-customer-questions.md ข้อ 7.7)
// รูป/PDF เปิดในแท็บใหม่ได้ · ไฟล์อื่น (ไฟล์งานออกแบบ SVG PSD ZIP) ดาวน์โหลดเท่านั้น
// เหตุผล: blob URL มีโดเมนเดียวกับหน้าเว็บเรา SVG ที่ฝังสคริปต์ถ้าเปิดในแท็บ สคริปต์จะอ่าน token ใน localStorage ได้

const REVOKE_AFTER_MS = 60_000;

/**
 * @param blob ไฟล์ที่โหลดมา
 * @param fileName ชื่อไฟล์เดิม (ใช้ตอนดาวน์โหลด)
 * @param isViewable backend บอกว่าเปิดดูในแท็บได้ปลอดภัย (รูป/PDF)
 */
export function openOrDownloadBlob(blob: Blob, fileName: string, isViewable: boolean) {
    const url = URL.createObjectURL(blob);
    if (isViewable) {
        window.open(url, "_blank", "noopener");
    } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
    }
    // แท็บใหม่/การดาวน์โหลดยังอ่าน URL อยู่ช่วงหนึ่ง จึงคืนหน่วยความจำทีหลัง
    window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS);
}
