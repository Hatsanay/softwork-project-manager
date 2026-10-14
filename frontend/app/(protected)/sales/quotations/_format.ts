// รูปแบบการแสดงผลที่ใช้หลายหน้าในโมดูลใบเสนอราคา

/** "QT-20261014-000001 Rev.1" · ร่างที่ยังไม่มีเลข = "ยังไม่มีเลขที่" */
export function documentNumberLabel(row: { qt_number: string | null; qt_revision: number }) {
    if (!row.qt_number) return "ยังไม่มีเลขที่";
    return row.qt_revision > 0 ? `${row.qt_number} Rev.${row.qt_revision}` : row.qt_number;
}

/** อัตรา 10 ทศนิยมจากฐานข้อมูล → ตัดศูนย์ท้าย เหลืออย่างน้อย 4 ตำแหน่ง ("34.5678000000" → "34.5678") */
export function displayRate(rate: string) {
    const [whole, fraction = ""] = rate.split(".");
    return `${whole}.${fraction.replace(/0+$/, "").padEnd(4, "0")}`;
}
