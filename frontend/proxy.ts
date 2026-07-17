import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/", "/login"];

export function proxy(request: NextRequest) {
    const { pathname, search } = request.nextUrl;

    if (PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/share/")) {
        return NextResponse.next();
    }

    const token = request.cookies.get("token")?.value;
    if (!token) {
        const loginUrl = new URL("/login", request.url);
        loginUrl.searchParams.set("redirect", pathname + search);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    // ต้องกันไฟล์ static ใน public/ (รูป .png/.svg ฯลฯ) ออกจาก proxy ด้วย ไม่ใช่แค่ _next/static|_next/image
    // เพราะ Image Optimization API (/_next/image) ต้อง fetch ไฟล์ต้นทาง (เช่น /defult.png) เองภายในเซิร์ฟเวอร์
    // request นั้นไม่มี cookie "token" ของ browser ติดไปด้วย ถ้า proxy ยังเช็ค auth กับ path นี้อยู่จะโดน redirect
    // ไป /login (ได้ HTML กลับมาแทนรูป) ทำให้ next/image คิดว่ารูปโหลดไม่ได้ (400 "isn't a valid image")
    matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
