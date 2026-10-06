import type { Base } from './core';
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

/** 结果区 bin 显示：负数显示二进制补码（8 位对齐），正数直接展开。超过 MAX_DISPLAY_BITS 位时抛出错误 */
	const MAX_DISPLAY_BITS = 2048;
	export function resultBinLines(v: bigint): string[] {
		const bits = v < 0n ? (-v).toString(2).length : v.toString(2).length;
		if (bits > MAX_DISPLAY_BITS) throw new Error(`结果 ${bits} 位，超出显示范围（最大 ${MAX_DISPLAY_BITS} 位）`);
		if (v >= 0n) return binLines(v, true);
		// 负数补码：找最小 n 使 2^(n-1) ≥ |v|（n 位补码范围 [-2^(n-1), 2^(n-1)-1]），再对齐到 8 的倍数
		// 如 -250 需 n=9（2^8=256≥250）→ 16 位；-128 需 n=8（2^7=128≥128）→ 8 位
		const abs = -v;
		let n = 1;
		while ((1n << BigInt(n - 1)) < abs) n++;
		const padBits = Math.max(8, Math.ceil(n / 8) * 8);
		return binLines((1n << BigInt(padBits)) + v, true);
	}

export function humanSize(v: bigint): string | null {
	if (v < 1024n) return null;
	const units = ['K', 'M', 'G', 'T', 'P', 'E'];
	const S = 100n; // 定点放大系数：100 = 保留 2 位小数
	let ui = 0;
	let div = 1024n;
	// 选最大可用单位（该单位下数值 ≥ 1）
	while (ui < units.length - 1 && v >= div * 1024n) { div *= 1024n; ui++; }
	// 超过 1024E（最大单位的 1024 倍）时不再显示估算
	if (v >= div * 1024n) return null;
	// 四舍五入到 S 位小数：q = round(v * S / div)（BigInt 无小数，加半除数再整除模拟四舍五入）
	let q = (v * S + div / 2n) / div;
	// 舍入进位到 1024.00 → 升一级单位（恰为 1.00），避免出现 "1024.00 K"
	if (q >= 1024n * S && ui < units.length - 1) { q /= 1024n; ui++; }
	// 小数部分不足两位必须补零：5 → "05"，否则 1.05 会错显示成 1.5
	const frac = (q % S).toString().padStart(2, '0');
	return `${q / S}.${frac} ${units[ui]}`;
}

