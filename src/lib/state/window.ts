export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
export async function windowAction(action: 'minimize' | 'close' | 'startDragging' | 'toggleMaximize'): Promise<void> {
 if (!isTauri) return;
 try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow()[action](); } catch { /* Keep web and unavailable desktop APIs non-fatal. */ }
}
export async function setPinned(value: boolean): Promise<boolean> {
 if (!isTauri) return false;
 try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().setAlwaysOnTop(value); return true; } catch { return false; }
}
export function titlebarEligible(event: MouseEvent): boolean {
 return isTauri && event.button === 0 && !(event.target as HTMLElement).closest('button, .preset-menu') && event.clientY >= 6 && event.clientX >= 6 && event.clientX <= window.innerWidth - 6;
}
