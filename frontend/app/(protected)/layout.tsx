import Navbar from "@/app/components/navbar";
import Sidebar from "@/app/components/sidebar";
import Footer from "@/app/components/footer";
import { SidebarProvider } from "@/app/components/sidebar-context";
import { PermissionProvider } from "@/app/components/permission-provider";
import FirstLoginOnboarding from "@/app/components/first-login-onboarding";
import { getUserProfile } from "@/app/login/actions";
import { cookies } from "next/headers";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const {
        fullname,
        avatarUrl,
        mustChangePassword,
        roleName,
        username,
        needsEmail,
        permission: currentPermission,
    } = await getUserProfile();

    // ใช้สิทธิ์ล่าสุดจาก backend ทุกครั้งที่เปลี่ยนหน้า — ถ้าต่อ backend ไม่ได้ ถอยไปใช้ค่าที่จำไว้ตอน login
    // (เดิมใช้แต่ cookie: แอดมินเปลี่ยนสิทธิ์/ระบบเพิ่มเมนูใหม่ ผู้ใช้ต้อง login ใหม่ถึงจะเห็นเมนูถูก)
    const permission = currentPermission || (cookieStore.get("permission")?.value ?? "");

    // เข้าระบบครั้งแรก: ต้องตั้งรหัสผ่านใหม่ และ/หรือ ยืนยันอีเมล (ถ้าแอดมินไม่ได้ใส่ไว้) ให้ครบก่อนถึงจะใช้งานระบบได้
    if (mustChangePassword || needsEmail) {
        return (
            <FirstLoginOnboarding
                mustChangePassword={mustChangePassword}
                needsEmail={needsEmail}
                fullname={fullname}
                username={username}
            />
        );
    }

    // แจ้งเตือน (toast) มีตัวเดียวที่ layout ราก — เดิมมีซ้ำที่นี่ด้วย ข้อความแจ้งสำเร็จเลยขึ้นสองครั้ง
    return (
        <PermissionProvider permission={permission}>
            <SidebarProvider>
                <div className="relative isolate flex min-h-screen">
                    {/* แสงฟ้าจางด้านบนของพื้นหลัง (UI ใหม่ 13 ต.ค. 2026) */}
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(60%_100%_at_70%_0%,rgb(59_130_246/0.10),transparent_70%),radial-gradient(40%_80%_at_10%_0%,rgb(96_165_250/0.08),transparent_70%)]"
                    />
                    <Sidebar permission={permission} fullname={fullname} roleName={roleName} avatarUrl={avatarUrl} />
                    <div className="flex min-w-0 flex-1 flex-col">
                        <Navbar fullname={fullname} avatarUrl={avatarUrl} roleName={roleName} />
                        <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8">{children}</main>
                        <Footer />
                    </div>
                </div>
            </SidebarProvider>
        </PermissionProvider>
    );
}
