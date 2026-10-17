// ส่วนของแบบหนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ที่ใช้ร่วมกัน — ของผู้ขาย (ขั้น 2-4) และของพนักงานประจำปี (ขั้น 4-5)

export const THAI_BAHT_WORDS = {
    cur_decimals: 2,
    cur_unit_th: "บาท",
    cur_subunit_th: "สตางค์",
    cur_unit_en: "Baht",
    cur_subunit_en: "Satang",
};

// แถวเงินได้ตามแบบ 50 ทวิ (ข้อความย่อ)
export const FORM_ROWS: { row: number; label: string }[] = [
    { row: 1, label: "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)" },
    { row: 2, label: "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" },
    { row: 3, label: "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" },
    { row: 4, label: "4. ดอกเบี้ย เงินปันผล ฯลฯ ตามมาตรา 40 (4)" },
    {
        row: 5,
        label: "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น ค่าจ้างทำของ ค่าบริการ ค่าโฆษณา ค่าเช่า ค่าขนส่ง รางวัล ฯลฯ",
    },
    { row: 6, label: "6. อื่นๆ (ระบุ)" },
];

export const COPIES = [
    { title: "ฉบับที่ 1", note: "สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี" },
    { title: "ฉบับที่ 2", note: "สำหรับผู้หักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน" },
];

export const PENALTY_NOTE =
    "คำเตือน ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร";

export function Checkbox({ checked, label }: { checked: boolean; label: string }) {
    return (
        <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-gray-700 text-[8pt] leading-none">
                {checked ? "✓" : ""}
            </span>
            {label}
        </span>
    );
}
