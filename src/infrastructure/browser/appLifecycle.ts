declare global {
    interface Window {
        __automenuRecovery?: {
            reload(reason: string, force?: boolean): boolean;
            ready(): void;
            begin(): void;
            readonly reloading: boolean;
        };
    }
}
export const requestAppReload = (reason: string) => typeof window !== 'undefined' && Boolean(window.__automenuRecovery?.reload(reason));
export const isAppReloading = () => typeof window !== 'undefined' && Boolean(window.__automenuRecovery?.reloading);
export function markAppReady() {
    if (getComputedStyle(document.documentElement).getPropertyValue('--automenu-ui-ready').trim() !== '1') return false;
    window.__automenuRecovery?.ready();
    return true;
}
