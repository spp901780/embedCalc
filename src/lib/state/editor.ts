import { tokenize, locateNum, numText, digitLen, digitToOffset, convertDigit, type Base } from '../calc';
export interface Edit { expr: string; cursor: number }
export function joinBinary(expr: string, cursor: number): Edit {
 try {
  for (;;) {
   const tokens = tokenize(expr);
   const index = tokens.findIndex((a, i) => a.kind === 'num' && a.base === 2 && tokens[i + 1]?.kind === 'num' && tokens[i + 1]?.base === 2 && /^\s+$/.test(expr.slice(a.end, tokens[i + 1].start)));
   if (index < 0) break;
   const a = tokens[index], b = tokens[index + 1];
   const removed = b.digitStart! - a.end;
   expr = expr.slice(0, a.end) + expr.slice(b.digitStart!);
   if (cursor > a.end) cursor = Math.max(a.end, cursor - removed);
  }
 } catch { /* Invalid input remains editable. */ }
 return { expr, cursor };
}
export function changeBase(expr: string, cursor: number, direction: 1 | -1, memory: Map<number, Partial<Record<Base, number>>>): Edit {
 try {
  const tokens = tokenize(expr), info = locateNum(tokens, cursor);
  if (!info) return { expr, cursor };
  const { index, token, digit } = info, order: Base[] = [16, 10, 2];
  const current = token.base!, next = order[order.indexOf(current) + direction];
  if (!next) return { expr, cursor };
  const mem = memory.get(index) ?? {}; mem[current] = digit; memory.set(index, mem);
  expr = expr.slice(0, token.start) + numText(token.value!, next) + expr.slice(token.end);
  const replacement = tokenize(expr)[index];
  cursor = digitToOffset(replacement, Math.min(mem[next] ?? convertDigit(digit, current, next), digitLen(replacement)));
 } catch { /* Invalid input cannot be converted. */ }
 return { expr, cursor };
}
export function tokenJump(expr: string, cursor: number, direction: -1 | 1): { cursor: number; token: number | null } {
 try {
  const tokens = tokenize(expr), starts = tokens.map(t => t.kind === 'num' ? t.digitStart! : t.start);
  const indices = starts.map((_, i) => i); if (direction < 0) indices.reverse();
  for (const index of indices) if (direction < 0 ? starts[index] < cursor : starts[index] > cursor) return { cursor: starts[index], token: index };
 } catch { /* Fall back to expression boundaries. */ }
 return { cursor: direction < 0 ? 0 : expr.length, token: null };
}
