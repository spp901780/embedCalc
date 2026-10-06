// 词法 + Pratt 解析 + BigInt 求值 + 布局模型（TypeScript 版）
// 字面量: x1A / 0x1A (hex), b0110 / 0b0110 (bin), d42 / 42 / u7 (dec), 'A' / '\n' (字符)
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
		else if (c === '0' && i + 1 < src.length && (src[i + 1] === 'd' || src[i + 1] === 'D')) { base = 10; i += 2; }
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

		// 字符字面量 'A' / '\n' / '\'' 等（值 = 字符码，按十进制参与运算）
		if (c === "'") {
			const start = i;
			i++;
			let code: number;
			if (src[i] === '\\') {
				i++;
				const esc = src[i];
				const map: Record<string, number> = { n: 10, t: 9, r: 13, '0': 0, '\\': 92, "'": 39 };
				if (esc === undefined || !(esc in map)) throw new Error(`位置 ${start + 1}: 不支持的转义 "\\${esc ?? ''}"`);
				code = map[esc];
				i++;
			} else if (src[i] !== undefined && src[i] !== "'") {
				code = src.charCodeAt(i);
				i++;
			} else {
				throw new Error(`位置 ${start + 1}: 字符字面量不能为空`);
			}
			if (src[i] !== "'") throw new Error(`位置 ${start + 1}: 缺少闭合引号`);
			i++;
			tokens.push({ kind: 'num', id: numId++, value: BigInt(code), base: 10, text: src.slice(start, i), start, end: i, digitStart: start + 1 });
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
			case '<<': {
				if (b < 0n) throw new Error('左移位数不能为负');
				if (b > 2048n) throw new Error(`左移位数 ${b} 过大（最大 2048）`);
				return a << b;
			}
			case '>>': return a >> b;
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

