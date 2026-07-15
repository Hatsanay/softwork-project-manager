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
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
