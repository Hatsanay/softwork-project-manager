// สีป้ายบนบอร์ดงาน — ชุดสีแบบ Trello 10 สี (ข้อยกเว้นของกติกาธีม เฉพาะป้ายบนบอร์ด · เจ้าของระบบเลือก 17 ต.ค. 2026 — K8)
// ที่เดียวที่ผูกรหัสสี (backend เก็บแค่รหัส) กับ class จริง · ตัวหนังสือบนป้ายเลือกให้อ่านออก (contrast ≥ 4.5:1)
// ป้ายเป็นแถบสีทึบมีชื่อเสมอ — ต่างจากป้ายสถานะ (จุดสี + ขอบอ่อน) กันอ่านเป็นสถานะ (R-K9)
export type LabelColor = "green" | "yellow" | "orange" | "red" | "purple" | "blue" | "sky" | "lime" | "pink" | "black";

export const LABEL_COLOR_CLASSES: Record<LabelColor, string> = {
    green: "bg-green-700 text-white",
    yellow: "bg-yellow-400 text-gray-900",
    orange: "bg-orange-700 text-white",
    red: "bg-red-600 text-white",
    purple: "bg-purple-600 text-white",
    blue: "bg-blue-600 text-white",
    sky: "bg-sky-700 text-white",
    lime: "bg-lime-400 text-gray-900",
    pink: "bg-pink-600 text-white",
    black: "bg-gray-800 text-white",
};

export const LABEL_COLOR_NAMES: Record<LabelColor, string> = {
    green: "เขียว",
    yellow: "เหลือง",
    orange: "ส้ม",
    red: "แดง",
    purple: "ม่วง",
    blue: "น้ำเงิน",
    sky: "ฟ้า",
    lime: "เขียวมะนาว",
    pink: "ชมพู",
    black: "ดำ",
};
