"use client";

import { createContext, useContext } from "react";
import { PERMISSION_GROUPS, GROUP_STARTS } from "@/app/components/bit";

// สร้าง map: key → flat bit index จาก PERMISSION_GROUPS
export const BITS: Record<string, number> = Object.fromEntries(
    PERMISSION_GROUPS.flatMap((g, gi) =>
        g.bits.map((b, bi) => [b.key, GROUP_STARTS[gi] + bi])
    )
);

const PermissionContext = createContext<string>("");

export function PermissionProvider({
    permission,
    children,
}: {
    permission: string;
    children: React.ReactNode;
}) {
    return (
        <PermissionContext.Provider value={permission}>
            {children}
        </PermissionContext.Provider>
    );
}

// hasBit(BITS.editRole) → true/false
export function usePermission() {
    const permission = useContext(PermissionContext);
    return (bit: number) => permission[bit] === "1";
}
