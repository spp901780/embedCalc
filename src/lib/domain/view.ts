import type { Base, Token } from './core';
import { hexText, decText, binLines } from './format';
// ---------- 光标模型辅助 ----------

/** num token 文本中数字位的个数（不含前缀与 `_`） */
export function digitLen(t: Token): number {
	let n = 0;
	for (let i = t.digitStart!; i < t.end; i++) if (t.text[i - t.start] !== '_') n++;
	return n;
}

/** 字符偏移 → 该 num token 内的逻辑位（光标右侧的数字位个数）。调用前需保证 offset ∈ [digitStart, end] */
export function offsetToDigit(t: Token, offset: number): number {
	let k = 0;
	for (let i = t.digitStart!; i < t.end; i++) {
		if (i >= offset && t.text[i - t.start] !== '_') k++;
	}
	return k;
}

/** 逻辑位（从右数第 k 位的左侧边界）→ 字符偏移 */
export function digitToOffset(t: Token, digit: number): number {
	let k = 0;
	let i = t.end;
	while (i > t.digitStart! && k < digit) {
		i--;
		if (t.text[i - t.start] !== '_') k++;
	}
	return i;
}

/** 在 token 流中定位字符偏移所在的 num token（仅当偏移落在数字位区域 [digitStart, end] 内） */
export function locateNum(tokens: Token[], offset: number): { index: number; token: Token; digit: number } | null {
	for (let index = 0; index < tokens.length; index++) {
		const t = tokens[index];
		if (t.kind === 'num' && offset >= t.digitStart! && offset <= t.end) {
			return { index, token: t, digit: offsetToDigit(t, offset) };
		}
	}
	return null;
}

/** 进制切换时的位置换算：hex 第 n 位 ↔ bin 第 4n 位；dec 与 bit 不对齐，退化为从右序号 */
export function convertDigit(digit: number, from: Base, to: Base): number {
	if (from === to) return digit;
	if (from === 16 && to === 2) return digit * 4;
	if (from === 2 && to === 16) return Math.floor(digit / 4);
	return digit; // dec 参与时按从右序号原样传递（由调用方 clamp）
}

/**
 * bin token 的位号标注点：从右（LSB）起每 8 位一组，
 * 返回每组最高位的位号（0 起，LSB=0）及该位数字的字符偏移；
 * 顶部不足 8 位的组也标注其最高位。[{ count, pos }]
 */
export function bitMarkPositions(tokenText: string): { count: number; pos: number }[] {
	let i = 0;
	// 跳过前缀 b/0b/B/0B
	if (tokenText[0] === '0' && (tokenText[1] === 'b' || tokenText[1] === 'B')) i = 2;
	else if (tokenText[0] === 'b' || tokenText[0] === 'B') i = 1;
	// 所有位数字的字符偏移（左 → 右）
	const digitPos: number[] = [];
	for (; i < tokenText.length; i++) {
		if (tokenText[i] !== '_') digitPos.push(i);
	}
	const n = digitPos.length;
	const marks: { count: number; pos: number }[] = [];
	// 左起第 k 位的位号 = n-1-k；组的最高位满足 位号≡7 (mod 8)，整体 MSB 也标注
	for (let k = 0; k < n; k++) {
		const bitNo = n - 1 - k;
		if (bitNo == 0 || bitNo % 8 === 7 || k === 0) marks.push({ count: bitNo, pos: digitPos[k] });
	}
	return marks;
}

// ---------- 布局模型 ----------

export interface NumChunk { type: 'num'; id: number; tokenIndex: number; hex: string; dec: string; bin: string[]; }
export interface OpChunk { type: 'op'; text: string; }
export type Chunk = NumChunk | OpChunk;

export function buildLayout(tokens: Token[]): Chunk[] {
	return tokens.map((t, tokenIndex) =>
		t.kind === 'num'
			? { type: 'num', id: t.id, tokenIndex, hex: hexText(t.value!), dec: decText(t.value!), bin: binLines(t.value!, true) }
			: { type: 'op', text: t.text }
	);
}
