import type { HistEntry } from './persistence';
export interface HistoryNavigation { pos: number; draft: string; browsing: boolean; expr: string }
export function older(entries: HistEntry[], state: HistoryNavigation): HistoryNavigation {
 if (!entries.length) return state;
 let { pos, draft, browsing, expr } = state;
 if (!browsing) { draft = expr; browsing = true; pos = entries.length - 1; }
 else if (pos === -2) pos = entries.length - 1;
 else if (pos <= 0) return state;
 else pos--;
 return { pos, draft, browsing, expr: entries[pos].expr };
}
export function newer(entries: HistEntry[], state: HistoryNavigation): HistoryNavigation {
 if (!state.browsing) return state;
 if (state.pos < 0) return exit(state);
 if (state.pos >= entries.length - 1) return { ...state, pos: -2, expr: state.draft };
 const pos = state.pos + 1; return { ...state, pos, expr: entries[pos].expr };
}
export function exit(state: HistoryNavigation): HistoryNavigation {
 return state.browsing ? { ...state, browsing: false, pos: -1, expr: state.draft } : state;
}
export function recall(entries: HistEntry[], state: HistoryNavigation, pos: number): HistoryNavigation {
 if (!entries[pos]) return state;
 return { pos, browsing: true, draft: state.browsing ? state.draft : state.expr, expr: entries[pos].expr };
}
