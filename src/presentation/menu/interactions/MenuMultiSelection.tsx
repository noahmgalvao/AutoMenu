import { createContext, useMemo, useState, type ReactNode } from 'react';

export const MenuMultiSelection = createContext<{
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
} | null>(null);

export function MenuMultiSelectionProvider({ children }: { children: ReactNode }) {
    const [enabled, setEnabled] = useState(false);
    const value = useMemo(() => ({ enabled, setEnabled }), [enabled]);
    return <MenuMultiSelection.Provider value={value}>{children}</MenuMultiSelection.Provider>;
}
