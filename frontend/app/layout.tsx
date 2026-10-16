import type { Metadata } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import "./globals.css";

// Kanit จากไฟล์ในเครื่อง (สัญญาอนุญาต OFL อยู่ที่ font/OFL.txt) — ไม่โหลดจาก Google หน้าพิมพ์เอกสารจึงได้ฟอนต์ไทยแม้ไม่มีเน็ต
// เนื้อความ 300 · ปกติ 400 · หัวข้อ 500 · SemiBold ใช้กับ 600 และ 700 ด้วย (หน้าเดิมที่ใช้ font-bold ได้ตัวหนาจริง ไม่ใช่ตัวหนาจำลอง)
const kanit = localFont({
    src: [
        { path: "../font/Kanit-Light.ttf", weight: "300", style: "normal" },
        { path: "../font/Kanit-Regular.ttf", weight: "400", style: "normal" },
        { path: "../font/Kanit-Medium.ttf", weight: "500", style: "normal" },
        { path: "../font/Kanit-SemiBold.ttf", weight: "600 700", style: "normal" },
    ],
    variable: "--font-kanit",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Softwork Project Manager",
    description: "Project status tracking for clients and team",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    // overflow-x-clip (ไม่ใช่ hidden): hidden ที่ html + body ทำให้ body กลายเป็นกล่องเลื่อนของตัวเอง (overflow-y: auto)
    // แล้ว position: sticky ของ sidebar / แถบด้านบน / แถบปุ่มล่างจอ เกาะกับ body ที่ไม่เคยเลื่อน → เลื่อนหน้าแล้วหลุดหายไป (แก้ 16 ต.ค. 2026)
    return (
        <html lang="th" className={`${kanit.variable} h-full antialiased overflow-x-clip`}>
            <body className={`${kanit.className} min-h-full flex flex-col overflow-x-clip`}>
                {children}
                <Toaster position="top-right" richColors />
            </body>
        </html>
    );
}
