import Navbar from "@/app/components/navbar";
import Sidebar from "@/app/components/sidebar";
import Footer from "@/app/components/footer";
import { SidebarProvider } from "@/app/components/sidebar-context";
import { PermissionProvider } from "@/app/components/permission-provider";
import ForcePasswordChange from "@/app/components/force-password-change";
import { getUserProfile } from "@/app/login/actions";
import { cookies } from "next/headers";
import { Toaster } from "sonner";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies();
    const permission = cookieStore.get("permission")?.value ?? "";

    const { fullname, avatarUrl, mustChangePassword, roleName } = await getUserProfile();

    if (mustChangePassword) {
        return (
            <>
                <ForcePasswordChange />
                <Toaster position="top-right" richColors />
            </>
        );
    }

    return (
        <PermissionProvider permission={permission}>
            <SidebarProvider>
                <div className="min-h-screen flex flex-col">
                    <Navbar fullname={fullname} avatarUrl={avatarUrl} roleName={roleName} />
                    <div className="flex flex-1">
                        <Sidebar />
                        <main className="flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 bg-gray-50">
                            {children}
                        </main>
                    </div>
                    <Footer />
                </div>
                <Toaster position="top-right" richColors />
            </SidebarProvider>
        </PermissionProvider>
    );
}
