import { cookies } from "next/headers";
import SidebarClient from "./sidebar-client";
import { MENU_DEFS, getVisibleItems } from "./bit";

export type { MenuItem } from "./bit";

export default async function Sidebar() {
    const cookieStore = await cookies();
    const permission = cookieStore.get("permission")?.value ?? "";
    const initialCollapsed = cookieStore.get("sidebar-collapsed")?.value === "true";

    const visibleItems = getVisibleItems(MENU_DEFS, permission);

    return <SidebarClient items={visibleItems} initialCollapsed={initialCollapsed} />;
}
