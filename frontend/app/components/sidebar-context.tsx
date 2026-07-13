"use client";

import { createContext, useContext, useState } from "react";

type SidebarContextType = {
    mobileOpen: boolean;
    setMobileOpen: (open: boolean) => void;
};

const SidebarContext = createContext<SidebarContextType>({
    mobileOpen: false,
    setMobileOpen: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [mobileOpen, setMobileOpen] = useState(false);
    return (
        <SidebarContext.Provider value={{ mobileOpen, setMobileOpen }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    return useContext(SidebarContext);
}
