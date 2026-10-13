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
    return (
        <html lang="th" className={`${kanit.variable} h-full antialiased overflow-x-hidden`}>
            <body className={`${kanit.className} min-h-full flex flex-col overflow-x-hidden`}>
                {children}
                <Toaster position="top-right" richColors />
            </body>
        </html>
    );
}
