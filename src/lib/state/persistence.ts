import { tokenize, parse, type Token } from '../domain/core';
import { hexText, decText } from '../domain/format';
export interface HistEntry { expr: string; res: string; hex: boolean }
export const HIST_KEY = 'embedcalc.history';
export const RATIO_KEY = 'embedcalc.splitRatio';
export function resultIsHex(tokens: Token[] | null): boolean {
 return tokens?.some(t => t.kind === 'num' && (t.base === 2 || t.base === 16)) ?? false;
}
export function decodeHistory(raw: string | null): HistEntry[] {
 try {
  const data: unknown = JSON.parse(raw ?? '[]');
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry): HistEntry[] => {
   if (typeof entry === 'string') {
    try { const tokens = tokenize(entry); const hex = resultIsHex(tokens); return [{ expr: entry, res: (hex ? hexText : decText)(parse(tokens)), hex }]; }
    catch { return [{ expr: entry, res: '', hex: false }]; }
   }
   if (entry && typeof entry === 'object' && typeof entry.expr === 'string') {
    return [{ expr: entry.expr, res: typeof entry.res === 'string' ? entry.res : '', hex: entry.hex === true }];
   }
   return [];
  }).slice(-50);
 } catch { return []; }
}
export function appendHistory(history: HistEntry[], entry: HistEntry): HistEntry[] {
 return [...history.filter(h => h.expr !== entry.expr), entry].slice(-50);
}
export function readStorage(key: string): string | null {
 try { return localStorage.getItem(key); } catch { return null; }
}
export function writeStorage(key: string, value: string): boolean {
 try { localStorage.setItem(key, value); return true; } catch { return false; }
}
export function decodeRatio(raw: string | null): number {
 const ratio = Number.parseFloat(raw ?? '');
 return Number.isFinite(ratio) && ratio >= 0.3 && ratio <= 0.7 ? ratio : 0.56;
}
