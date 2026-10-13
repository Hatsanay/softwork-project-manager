import { cookies } from "next/headers";
import SidebarClient from "./sidebar-client";
import { MENU_DEFS, getVisibleItems, hasPermissionKey } from "./bit";

export type { MenuItem } from "./bit";

type SidebarProps = {
    // สิทธิ์ล่าสุดจาก backend (layout) — เมนูตรงกับสิทธิ์ปัจจุบันเสมอโดยไม่ต้อง login ใหม่
    permission: string;
    fullname: string;
    roleName: string;
    avatarUrl: string | null;
};

export default async function Sidebar({ permission, fullname, roleName, avatarUrl }: SidebarProps) {
    const cookieStore = await cookies();
    const initialCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

    const visibleItems = getVisibleItems(MENU_DEFS, permission);
    // ค้นหาใช้ API ของแดชบอร์ด (ต้องมีสิทธิ์แดชบอร์ด และดูโปรเจกต์ได้อย่างน้อยของตัวเอง)
    const canSearch =
        hasPermissionKey(permission, "dashboard") &&
        (hasPermissionKey(permission, "viewAllProjects") || hasPermissionKey(permission, "viewOwnProjects"));

    return (
        <SidebarClient
            items={visibleItems}
            initialCollapsed={initialCollapsed}
            canSearch={canSearch}
            user={{ fullname, roleName, avatarUrl }}
        />
    );
}
