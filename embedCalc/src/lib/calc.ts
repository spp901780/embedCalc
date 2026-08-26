// 词法 + Pratt 解析 + BigInt 求值 + 布局模型（TypeScript 版）
// 字面量: x1A / 0x1A (hex), b0110 / 0b0110 (bin), d42 / 42 / u7 (dec)
// 数字内允许 `_` 分隔符（如 b1111_0000）

export type Base = 2 | 10 | 16;
export type TokenKind = 'num' | 'op' | 'lparen' | 'rparen';

export interface Token {
	kind: TokenKind;
	text: string;
	start: number; // 在源串中的起始偏移
	end: number; // 结束偏移（exclusive）
	id: number; // num token 的顺序号（仅 num 递增）
	// 以下仅 num token 有效：
	value?: bigint; // 字面量原始值（未按位宽截断）
	base?: Base; // 书写进制（由前缀推断）
	digitStart?: number; // 数字位部分的起始偏移（跳过 x/0x/b/0b/d/u 前缀）
}

const isDigit = (c: string) => c >= '0' && c <= '9';
const isHex = (c: string) => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');

export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	let numId = 0;

	while (i < src.length) {
		const c = src[i];
		if (c === ' ' || c === '\t') { i++; continue; }

		// 数字字面量（前缀字母后紧跟该进制的合法数字字符才视为字面量）
		let base: Base | null = null;
		const start = i;
		if ((c === 'x' || c === 'X') && i + 1 < src.length && isHex(src[i + 1])) { base = 16; i++; }
		else if ((c === 'b' || c === 'B') && i + 1 < src.length && (src[i + 1] === '0' || src[i + 1] === '1')) { base = 2; i++; }
		else if ((c === 'd' || c === 'D' || c === 'u' || c === 'U') && i + 1 < src.length && isDigit(src[i + 1])) { base = 10; i++; }
		else if (c === '0' && i + 1 < src.length && (src[i + 1] === 'x' || src[i + 1] === 'X')) { base = 16; i += 2; }
		else if (c === '0' && i + 1 < src.length && (src[i + 1] === 'b' || src[i + 1] === 'B')) { base = 2; i += 2; }
		else if (isDigit(c)) { base = 10; }

		if (base !== null) {
			const dstart = i;
			while (i < src.length && (isHex(src[i]) || src[i] === '_')) i++;
			const raw = src.slice(dstart, i);
			const digits = raw.replace(/_/g, '');
			if (!digits) throw new Error(`位置 ${start + 1}: 缺少数字`);
			let value: bigint;
			try {
				value = BigInt(base === 16 ? '0x' + digits : base === 2 ? '0b' + digits : digits);
			} catch {
				throw new Error(`位置 ${start + 1}: "${src.slice(start, i)}" 不是合法的 ${base} 进制数字`);
			}
			tokens.push({ kind: 'num', id: numId++, value, base, text: src.slice(start, i), start, end: i, digitStart: dstart });
			continue;
		}

		// 运算符
		const two = src.slice(i, i + 2);
		if (two === '<<' || two === '>>') { tokens.push({ kind: 'op', text: two, start: i, end: i + 2, id: -1 }); i += 2; continue; }
		if ('+-*/%&|^~()'.includes(c)) {
			tokens.push({ kind: c === '(' ? 'lparen' : c === ')' ? 'rparen' : 'op', text: c, start: i, end: i + 1, id: -1 });
			i++; continue;
		}
		throw new Error(`位置 ${i + 1}: 无法识别的字符 "${c}"`);
	}
	return tokens;
}

// C 优先级
const BP: Record<string, number> = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

// 纯数学求值，不做位宽截断
export function parse(tokens: Token[]): bigint {
	let pos = 0;
	const peek = () => tokens[pos];
	const next = () => tokens[pos++];

	function expr(minBp: number): bigint {
		const t = next();
		let lhs: bigint;
		if (!t) throw new Error('表达式意外结束');
		if (t.kind === 'num') lhs = t.value!;
		else if (t.kind === 'lparen') {
			lhs = expr(0);
			const r = next();
			if (!r || r.kind !== 'rparen') throw new Error('缺少右括号');
		} else if (t.kind === 'op' && t.text === '-') lhs = -expr(7);
		else if (t.kind === 'op' && t.text === '~') lhs = ~expr(7);
		else if (t.kind === 'op' && t.text === '+') lhs = expr(7);
		else throw new Error(`意外的 "${t.text}"`);

		for (;;) {
			const t = peek();
			if (!t || t.kind !== 'op' || t.text === '(' || t.text === ')') break;
			const bp = BP[t.text];
			if (bp === undefined || bp < minBp) break;
			next();
			const rhs = expr(bp + 1);
			lhs = apply(t.text, lhs, rhs);
		}
		return lhs;
	}

	function apply(op: string, a: bigint, b: bigint): bigint {
		switch (op) {
			case '+': return a + b;
			case '-': return a - b;
			case '*': return a * b;
			case '/': if (b === 0n) throw new Error('除以零'); return a / b;
			case '%': if (b === 0n) throw new Error('对零取模'); return a % b;
			case '<<': return a << (b & 63n);
			case '>>': return a >> (b & 63n);
			case '&': return a & b;
			case '|': return a | b;
			case '^': return a ^ b;
			default: throw new Error(`未知运算符 ${op}`);
		}
	}

	const v = expr(0);
	if (pos < tokens.length) throw new Error(`"${tokens[pos].text}" 之后的内容无法解析`);
	return v;
}

// ---------- 显示 ----------

function groupBin(bits: string): string {
	// 从右往左每 4 位加下划线: "1101101" -> "110_1101"
	let out = '', n = 0;
	for (let i = bits.length - 1; i >= 0; i--) {
		out = bits[i] + out;
		if (++n % 4 === 0 && i > 0) out = '_' + out;
	}
	return out;
}

export function binLines(value: bigint, pad = false): string[] {
	// 底行 = bit[7:0], 顶行 = 最高有效位; 返回从顶到底的字符串数组
	// pad=true 时前导补零到 8 的倍数位（视图区使用，方便位号对齐）
	let bits = value.toString(2);
	if (pad) bits = bits.padStart(Math.ceil(bits.length / 8) * 8, '0');
	const lines: string[] = [];
	for (let hi = bits.length; hi > 0; hi -= 8) {
		lines.unshift(groupBin(bits.slice(Math.max(0, hi - 8), hi)));
	}
	return lines;
}

export function hexText(v: bigint): string {
	if (v < 0n) return '-0x' + (-v).toString(16).toUpperCase();
	return '0x' + v.toString(16).toUpperCase();
}
export function decText(v: bigint): string { return v.toString(10); }

/** 生成某数字在指定进制下的输入框文本：hex → x1A，bin → b1111_0000（完全展开），dec → 42 */
export function numText(value: bigint, base: Base): string {
	if (base === 16) return 'x' + value.toString(16).toUpperCase();
	if (base === 2) return 'b' + groupBin(value.toString(2));
	return value.toString(10);
}

/** 结果区 bin 显示：负数显示二进制补码（8 位对齐），正数直接展开 */
export function resultBinLines(v: bigint): string[] {
	if (v >= 0n) return binLines(v, true);
	const bits = Math.max(8, Math.ceil((-v).toString(2).length / 8) * 8);
	return binLines((1n << BigInt(bits)) + v, true);
}

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

/**
 * 二进制显示模式下，空格分隔的相邻 bin token（`b110 b0110`）视为连续位流，自动拼接。
 * 只合并 base=2 的 num token；合并发生在编辑之后、展示之前。
 * 返回 null 表示没有可合并项。
 */
export function joinAdjacentBin(src: string, tokens: Token[]): string | null {
	for (let i = 0; i < tokens.length - 1; i++) {
		const a = tokens[i], b = tokens[i + 1];
		if (a.kind === 'num' && a.base === 2 && b.kind === 'num' && b.base === 2) {
			const gap = src.slice(a.end, b.start);
			if (/^\s+$/.test(gap)) {
				const joined = a.text + b.text.slice(1); // 去掉第二个 token 的 'b' 前缀
				return joinAdjacentBin(src.slice(0, a.start) + joined + src.slice(b.end), tokenize(src.slice(0, a.start) + joined + src.slice(b.end))) ?? src.slice(0, a.start) + joined + src.slice(b.end);
			}
		}
	}
	return null;
}

/** 纯字符串层面的 bin 空格合并（不依赖 tokenize，立即可用） */
export function joinBinSpaces(src: string): string | null {
	// 匹配 b[01_]+ 后跟空白再 b[01_]+
	const m = src.match(/(b[01_]+)(\s+)(b[01_]+)/);
	if (!m || m.index === undefined) return null;
	const joined = m[1] + m[3].slice(1); // 去掉第二个 b
	return src.slice(0, m.index) + joined + src.slice(m.index + m[0].length);
}

/** 检查 offset 处是否处于两个 bin token 之间（用空格分隔），是则返回合并后的字符串 */
export function shouldJoinBins(src: string, offset: number): string | null {
	// 向左找 b[01_]* 的结尾，向右找 b[01_]* 的开头
	let l = offset;
	while (l > 0 && (src[l - 1] === '0' || src[l - 1] === '1' || src[l - 1] === '_')) l--;
	if (l > 0 && src[l - 1] === 'b') l--;
	let r = offset;
	while (r < src.length && src[r] === ' ') r++;
	if (r >= src.length || src[r] !== 'b') return null;
	let r2 = r + 1;
	while (r2 < src.length && (src[r2] === '0' || src[r2] === '1' || src[r2] === '_')) r2++;
	if (r2 === r + 1) return null; // b 后面没数字
	// 检查左边是否真的是 bin token（前面是边界或运算符）
	if (l > 0 && !'+-*/%&|^~() '.includes(src[l - 1])) return null;
	// 检查右边是否真的是 bin token（后面是边界或运算符）
	if (r2 < src.length && !'+-*/%&|^~() '.includes(src[r2])) return null;
	return src.slice(0, l) + src.slice(l, offset) + src.slice(r + 1, r2) + src.slice(r2);
}

/** 进制切换时的位置换算：hex 第 n 位 ↔ bin 第 4n 位；dec 与 bit 不对齐，退化为从右序号 */
export function convertDigit(digit: number, from: Base, to: Base): number {
	if (from === to) return digit;
	if (from === 16 && to === 2) return digit * 4;
	if (from === 2 && to === 16) return Math.floor(digit / 4);
	return digit; // dec 参与时按从右序号原样传递（由调用方 clamp）
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
