// ข้อความระยะเวลา (ลงเวลา · 2026-10-24) — 150 → "2 ชม. 30 นาที" · 120 → "2 ชม." · 45 → "45 นาที"
export function durationText(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} นาที`;
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
}

// "2026-10-24 18:00:00" → "18:00"
export function clockOf(dateTimeText: string | null | undefined) {
    return dateTimeText ? dateTimeText.slice(11, 16) : "-";
}
