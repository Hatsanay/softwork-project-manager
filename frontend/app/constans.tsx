// ตอน dev ตั้ง NEXT_PUBLIC_API_URL=http://localhost:3003/api/V1 ไว้ใน frontend/.env.local (ไฟล์นี้ไม่ถูก commit)
// production (Plesk build) ไม่มีไฟล์นั้น เลยใช้ค่า default ด้านล่าง — ไม่ต้องสลับบรรทัดเองก่อน deploy อีก
// frontend บนเครื่องห้ามชี้ไป backend จริง เพราะ CORS ของ backend จริงรับแค่ https://softwork.fasttiw.com
const api = process.env.NEXT_PUBLIC_API_URL ?? "https://softworkbackend.fasttiw.com/api/V1";


const theme = {
    sidebar: {
        bg:           "bg-white",
        border:       "border-r border-blue-100",
        headerBorder: "border-b border-blue-100",
        brandText:    "text-blue-600",
        brandIconBg:  "bg-blue-500",
        activeItem:   "bg-blue-500 text-white shadow-sm shadow-blue-200",
        inactiveItem: "text-gray-500 hover:bg-blue-50 hover:text-blue-600",
        tooltip:      "bg-blue-600 text-white",
        tooltipArrow: "border-r-blue-600",
        toggleBtn:    "border border-blue-200 bg-white text-blue-400 shadow-md hover:bg-blue-500 hover:text-white hover:border-blue-500",
    },
    navbar: {
        bg:          "bg-white border-b border-gray-200",
        brandText:   "text-blue-600",
        userText:    "text-gray-600",
        logoutText:  "text-red-500 hover:text-red-700",
        textNavbar: "text-gray-600 hover:text-gray-800",
    },
} as const;

export { api, theme };