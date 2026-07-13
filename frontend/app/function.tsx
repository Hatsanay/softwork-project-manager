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
