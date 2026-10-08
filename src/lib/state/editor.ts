import { tokenize, locateNum, numText, digitLen, digitToOffset, convertDigit, type Base } from '../calc';
import { evaluate } from '../domain/evaluate';
export interface Edit { expr: string; cursor: number }
export function flipBit(expr: string, cursor: number, tokenIndex: number, bit: number): Edit {
 const calc = evaluate(expr), token = calc.tokens?.[tokenIndex];
 if (calc.status !== 'valid' || token?.kind !== 'num' || !Number.isInteger(bit) || bit < 0 || bit >= Math.ceil(token.value!.toString(2).length / 8) * 8) return { expr, cursor };
 const text = numText(token.value! ^ (1n << BigInt(bit)), token.base!);
 const next = expr.slice(0, token.start) + text + expr.slice(token.end);
 let position = cursor;
 if (cursor >= token.end) position += text.length - token.text.length;
 else if (cursor > token.start) {
  const info = locateNum(calc.tokens!, cursor);
  position = info?.index === tokenIndex ? digitToOffset(tokenize(next)[tokenIndex], Math.min(info.digit, digitLen(tokenize(next)[tokenIndex]))) : token.start;
 }
 return { expr: next, cursor: Math.max(0, Math.min(position, next.length)) };
}
export function truncatePreview(text: string, width: number): string {
 const limit = Math.max(2, Math.floor(width));
 return text.length <= limit ? text : limit === 2 ? text.slice(0, 2) : text.slice(0, limit - 1) + '…';
}
export function basePreviews(expr: string, cursor: number): { start: number; width: number; up: string | null; down: string | null } | null {
 try {
  const info = locateNum(tokenize(expr), cursor);
  if (!info) return null;
  const { token } = info, order: Base[] = [16, 10, 2], index = order.indexOf(token.base!);
  return { start: token.start, width: token.text.length, up: index > 0 ? numText(token.value!, order[index - 1]) : null, down: index < 2 ? numText(token.value!, order[index + 1]) : null };
 } catch { return null; }
}
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
