<script lang="ts">
	import {
		tokenize, parse, buildLayout, hexText, decText, binLines, resultBinLines,
		numText, digitLen, digitToOffset, locateNum, convertDigit, joinBinSpaces,
		type Base, type Token
	} from '$lib/calc';

	let expr = $state('xDEADBEEF + b110 ^ x2 << 2');
	// 逻辑光标的物理载体：字符偏移。进制切换时经 (token, digitFromRight) 换算保持位置
	let cursor = $state(0);
	let focused = $state(false);
	let inputEl: HTMLDivElement | undefined = $state();
	let caretEl: HTMLDivElement | undefined = $state();
	// 位置记忆：tokenIndex -> 各进制下的逻辑位（从右数）
	const digitMem = new Map<number, Partial<Record<Base, number>>>();

	const presets: [string, string][] = [
		['寄存器位操作', 'xDEADBEEF + b110 ^ x2 << 2'],
		['GPIO 配置', '(x1 << 5) | (x3 << 10) | b101'],
		['地址计算', 'x40000000 + x204*4 + 13'],
		['掩码组合', '~xFF & x12345678 | b1111_0000 << 8'],
		['64 位取值', 'x123456789ABCDEF0 >> 8 & xFFFFFFFF'],
	];

	// 词法分析失败时 tokens 为 null（输入框仍可编辑，只是无高亮/无求值）
	let tokens = $derived.by((): Token[] | null => {
		try { return tokenize(expr); } catch { return null; }
	});

	interface CalcResult { layout: ReturnType<typeof buildLayout> | null; result: bigint | null; error: string | null; }
	let calc = $derived.by((): CalcResult => {
		if (!tokens || tokens.length === 0) return { layout: tokens ? [] : null, result: null, error: null };
		try {
			const value = parse(tokens);
			return { layout: buildLayout(tokens), result: value, error: null };
		} catch (e) {
			return { layout: null, result: null, error: (e as Error).message };
		}
	});

	// 输入框渲染分段（token 间空白也保留，保证字符偏移 1:1）
	interface Seg { text: string; cls: string; start: number; }
	let segments = $derived.by((): Seg[] => {
		if (!tokens) return [{ text: expr, cls: 'gap', start: 0 }];
		const segs: Seg[] = [];
		let p = 0;
		for (const t of tokens) {
			if (t.start > p) segs.push({ text: expr.slice(p, t.start), cls: 'gap', start: p });
			segs.push({ text: t.text, cls: t.kind === 'num' ? `num b${t.base}` : t.kind, start: t.start });
			p = t.end;
		}
		if (p < expr.length) segs.push({ text: expr.slice(p), cls: 'gap', start: p });
		return segs;
	});

	// 联动高亮：光标在数字内部 → 该 token + 对应 nibble
	let highlight = $derived.by(() => {
		if (!tokens) return null;
		const info = locateNum(tokens, cursor);
		if (!info) return null;
		const { index, token, digit } = info;
		// digit = 光标右侧的数字位数；光标"覆盖"其左侧位（从右第 digit-1 位），末尾取第 0 位
		const fromRight = digit > 0 ? digit - 1 : 0;
		if (token.base === 10) return { tokenIndex: index, nibble: null as number | null };
		const nibble = token.base === 16 ? fromRight : Math.floor(fromRight / 4);
		return { tokenIndex: index, nibble };
	});

	// ---------- 编辑 ----------

	function insertText(s: string) {
		expr = expr.slice(0, cursor) + s + expr.slice(cursor);
		cursor += s.length;
		autoJoin();
	}

	function deleteBackward() {
		if (cursor > 0) { expr = expr.slice(0, cursor - 1) + expr.slice(cursor); cursor--; }
		autoJoin();
	}

	function deleteForward() {
		expr = expr.slice(0, cursor) + expr.slice(cursor + 1);
		autoJoin();
	}

	// 二进制显示模式下，空格分隔的相邻 bin 段自动拼接为连续位流
	function autoJoin() {
		let joined = joinBinSpaces(expr);
		if (joined === null) return;
		// 可能有多个可合并点，循环处理
		while (joined !== null) {
			const oldLen = expr.length;
			expr = joined;
			cursor -= oldLen - joined.length; // 空格被移除，光标前移
			joined = joinBinSpaces(expr);
		}
	}

	// ↑: hex→bin→dec，↓: dec→bin→hex，到顶/到底即停，不循环（与视图区顺序一致）
	function cycleBase(dir: 1 | -1) {
		if (!tokens) return;
		const info = locateNum(tokens, cursor);
		// TODO(待办#2): 光标不在数字上时，↑/↓ 翻历史记录
		if (!info) return;
		const { index, token, digit } = info;
		const order: Base[] = [16, 2, 10]; // ↓ 沿视图顺序，↑ 逆序
		const i = order.indexOf(token.base!);
		const ni = i + dir;
		if (ni < 0 || ni >= order.length) return; // 已到 hex/dec，不再切换
		const cur = order[i], next = order[ni];
		// 位置记忆：先记下当前进制的位
		const mem = digitMem.get(index) ?? {};
		mem[cur] = digit;
		digitMem.set(index, mem);
		// 改写该 token 文本为等值的目标进制表示（token 数量与顺序不变）
		expr = expr.slice(0, token.start) + numText(token.value!, next) + expr.slice(token.end);
		const nt = tokenize(expr)[index]; // 同值改写必然解析成功
		const len = digitLen(nt);
		const d = Math.min(mem[next] ?? convertDigit(digit, cur, next), len);
		cursor = digitToOffset(nt, d);
	}

	// Ctrl+←/→：跳到上一个/下一个 token 边界
	function wordJump(dir: -1 | 1) {
		if (!tokens || tokens.length === 0) { cursor = dir < 0 ? 0 : expr.length; return; }
		const edges: number[] = [];
		for (const t of tokens) edges.push(t.start, t.end);
		edges.sort((a, b) => a - b);
		if (dir < 0) {
			for (let i = edges.length - 1; i >= 0; i--) {
				if (edges[i] < cursor) { cursor = edges[i]; return; }
			}
			cursor = 0;
		} else {
			for (const e of edges) {
				if (e > cursor) { cursor = e; return; }
			}
			cursor = expr.length;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.altKey) return; // 放行系统快捷键
		if (e.ctrlKey) {
			if (e.key === 'ArrowLeft') { wordJump(-1); e.preventDefault(); }
			else if (e.key === 'ArrowRight') { wordJump(1); e.preventDefault(); }
			return; // 其余 Ctrl 组合放行
		}
		const k = e.key;
		if (k === 'ArrowLeft') { cursor = Math.max(0, cursor - 1); }
		else if (k === 'ArrowRight') { cursor = Math.min(expr.length, cursor + 1); }
		else if (k === 'Home') { cursor = 0; }
		else if (k === 'End') { cursor = expr.length; }
		else if (k === 'ArrowUp') { cycleBase(-1); }
		else if (k === 'ArrowDown') { cycleBase(1); }
		else if (k === 'Backspace') { deleteBackward(); }
		else if (k === 'Delete') { deleteForward(); }
		else if (k === 'Enter') { /* 单行输入，忽略 */ }
		else if (k.length === 1) { insertText(k); }
		else return;
		e.preventDefault();
	}

	function onPaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ');
		insertText(text);
	}

	// 鼠标点击 → 字符偏移（caretRangeFromPoint / caretPositionFromPoint）
	function onMousedown(e: MouseEvent) {
		e.preventDefault();
		inputEl?.focus();
		const doc = document as Document & {
			caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		};
		let node: Node | null = null, off = 0;
		if (doc.caretRangeFromPoint) {
			const r = doc.caretRangeFromPoint(e.clientX, e.clientY);
			if (r) { node = r.startContainer; off = r.startOffset; }
		} else if (doc.caretPositionFromPoint) {
			const p = doc.caretPositionFromPoint(e.clientX, e.clientY);
			if (p) { node = p.offsetNode; off = p.offset; }
		}
		cursor = node ? globalOffset(node, off) : expr.length;
	}

	function globalOffset(node: Node, off: number): number {
		let el: HTMLElement | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : node as HTMLElement;
		while (el && el !== inputEl) {
			if (el.dataset?.start !== undefined) return +el.dataset.start + off;
			el = el.parentElement;
		}
		return expr.length; // 点在空白处 → 末尾
	}

	// 光标移动后保证可见（横向滚动跟随）
	$effect(() => {
		cursor;
		caretEl?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});

	/** bin 行按 nibble 切组：返回 [{ text, nib }]，nib 为全局 nibble 编号（从底行、每行从右数） */
	function binGroups(lines: string[], li: number): { text: string; nib: number }[] {
		const groups = lines[li].split('_');
		const r = lines.length - 1 - li; // 行从底编号
		return groups.map((text, gi) => ({ text, nib: r * 2 + (groups.length - 1 - gi) }));
	}
</script>

<svelte:head>
	<title>嵌入式混合进制计算器</title>
</svelte:head>

<main>
	<header>
		<h1>嵌入式混合进制计算器</h1>
	</header>

	<div class="presets">
		{#each presets as [name, p]}
			<button onclick={() => { expr = p; cursor = p.length; inputEl?.focus(); }}>{name}</button>
		{/each}
	</div>

	<div class="input-row">
		<!-- 自绘输入框：keydown 接管 + 绝对定位光标条。等宽字体下光标 left = cursor × 1ch -->
		<div
			class="expr-input"
			class:focused
			role="textbox"
			aria-label="算式输入"
			tabindex="0"
			bind:this={inputEl}
			onkeydown={onKeydown}
			onmousedown={onMousedown}
			onpaste={onPaste}
			onfocus={() => (focused = true)}
			onblur={() => (focused = false)}
		>
			<div class="inner">
				{#each segments as seg}
					<span class={seg.cls} data-start={seg.start}>{seg.text}</span>
				{/each}
				{#if focused}
					<div class="caret" bind:this={caretEl} style="left: calc({cursor} * 1ch)"></div>
				{/if}
			</div>
			<!-- bin 显示时，对应数字下方用小子标注位数（每 8 位一组，标注组末位 bit 号） -->
			{#if tokens}
				<div class="bitmarks" aria-hidden="true">
					{#each tokens as t}
						{#if t.kind === 'num' && t.base === 2}
							{@const len = digitLen(t)}
							{@const n8 = Math.ceil(len / 8)}
							<!-- bin 文本布局: 1ch 前缀 + 每 8 位 9ch（含 '_'） -->
							{#each Array(n8) as _, g}
								<span class="bitmark" style="left: calc({t.start + 1 + g * 9 + 8} * 1ch)">{Math.min((g + 1) * 8 - 1, len - 1)}</span>
							{/each}
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		{#if calc.result !== null && calc.result !== undefined}
			<div class="result" title="计算结果">
				<div class="res-line"><span class="lbl">hex</span><code>{hexText(calc.result)}</code></div>
				<div class="res-line"><span class="lbl">dec</span><code>{decText(calc.result)}</code></div>
				<div class="res-line"><span class="lbl">bin</span><code class="bin">{resultBinLines(calc.result).join(' ')}</code></div>
			</div>
		{/if}
	</div>

	{#if calc.error}
		<div class="error">{calc.error}</div>
	{/if}

	{#if calc.layout}
		<section class="views">
			<div class="band">
				{#each calc.layout as chunk}
					{#if chunk.type === 'num'}
						<div class="num" class:hl={highlight?.tokenIndex === chunk.tokenIndex}>
							<div class="row hex">{#each [...chunk.hex] as ch, ci}<span class:hl={highlight?.tokenIndex === chunk.tokenIndex && highlight.nibble !== null && ci >= 2 && chunk.hex.length - 1 - ci === highlight.nibble}>{ch}</span>{/each}</div>
							<div class="row dec">{chunk.dec}</div>
							<div class="spacer"></div>
							{#each chunk.bin as line, li}
								<div class="binline">{#each binGroups(chunk.bin, li) as g, gi}<span class:hl={highlight?.tokenIndex === chunk.tokenIndex && g.nib === highlight?.nibble}>{g.text}</span>{#if gi < line.split('_').length - 1}<span class="sep">_</span>{/if}{/each}</div>
							{/each}
						</div>
					{:else}
						<div class="op">
							<div class="row hex">{chunk.text}</div>
							<div class="row dec">{chunk.text}</div>
							<div class="spacer"></div>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<footer>
		光标移到数字内部，↑ 向 hex、↓ 向 dec 切换显示进制（bin 居中，不循环）·
		Ctrl+←/→ 跳转到上/下一个词元 · bin 空格自动连接 · 每 8 位下方标注位号 · 纯数学求值，无位宽截断
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #14171c;
		color: #d7dce2;
		font-family: system-ui, sans-serif;
	}
	main {
		max-width: 1080px;
		margin: 0 auto;
		padding: 28px 24px 60px;
	}
	header { display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap; }
	h1 { font-size: 20px; font-weight: 600; margin: 0 0 4px; }

	.presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 10px; }
	.presets button {
		background: #1d2128; color: #9aa4af; border: 1px solid #2c333d;
		border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;
	}
	.presets button:hover { color: #d7dce2; border-color: #46505c; }

	.input-row { display: flex; gap: 12px; align-items: flex-start; }

	/* 自绘输入框 */
	.expr-input {
		flex: 1; min-width: 0; box-sizing: border-box;
		background: #10131a; color: #e8edf2;
		border: 1px solid #333a44; border-radius: 8px;
		padding: 12px 14px; font-size: 17px;
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
		outline: none; overflow-x: auto; overflow-y: hidden;
		cursor: text;
	}
	.expr-input.focused { border-color: #4d9e6e; }
	.expr-input .inner {
		position: relative; width: max-content; min-width: 100%;
		white-space: pre; line-height: 1.5;
	}
	.expr-input .num.b16 { color: #7ec8ff; }
	.expr-input .num.b10 { color: #e8c07d; }
	.expr-input .num.b2 { color: #7ee0a3; }
	.expr-input .op, .expr-input .lparen, .expr-input .rparen { color: #8b95a1; }
	/* bin 位号标注 */
	.bitmarks { position: relative; height: 0; }
	.bitmark {
		position: absolute; top: -2px;
		font-size: 9px; line-height: 1; color: #4a6b57;
		font-family: ui-monospace, monospace;
		pointer-events: none; white-space: pre;
		transform: translateX(-100%);
	}
	.caret {
		position: absolute; top: 1px; bottom: 1px; width: 2px;
		background: #e8edf2;
		animation: blink 1.1s step-end infinite;
		pointer-events: none;
	}
	@keyframes blink { 50% { opacity: 0; } }

	.result {
		flex: 0 0 auto; min-width: 240px; max-width: 42%;
		display: flex; flex-direction: column; justify-content: center;
		background: #10131a; border: 1px solid #2e5540; border-radius: 8px;
		padding: 6px 12px; overflow-x: auto;
	}
	.res-line { display: flex; gap: 10px; align-items: baseline; margin: 1px 0; white-space: nowrap; }
	.lbl { width: 26px; font-size: 10px; color: #66707c; text-align: right; }
	.res-line code {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 13px; color: #e8edf2;
	}
	.res-line code.bin { font-size: 11px; color: #7ee0a3; letter-spacing: 0.02em; }

	.error {
		margin-top: 10px; padding: 8px 12px; font-size: 13px;
		color: #ff9d8a; background: #2b1d1a; border: 1px solid #54322b;
		border-radius: 6px; font-family: ui-monospace, monospace;
	}

	.views {
		margin-top: 18px;
		background: #10131a; border: 1px solid #262c36; border-radius: 10px;
		padding: 18px 16px; overflow-x: auto;
	}
	.band {
		display: flex; flex-wrap: wrap; align-items: stretch;
		column-gap: 10px; row-gap: 22px;
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
		font-size: 15px;
	}
	.band .num, .band .op { display: flex; flex-direction: column; justify-content: flex-end; }
	.band .num {
		border-radius: 6px; padding: 2px 4px;
		transition: background 0.12s;
	}
	.band .num:hover { background: #1a2220; }
	.band .num.hl { background: #1c2a24; box-shadow: inset 0 0 0 1px #2e5540; }
	.band .row {
		height: 1.55em; line-height: 1.55em;
		text-align: right; white-space: pre;
	}
	.band .hex { color: #7ec8ff; }
	.band .dec { color: #e8c07d; }
	.band .spacer { flex: 1; min-height: 2px; }
	.band .binline {
		font-size: 0.72em; line-height: 1.5em; height: 1.5em;
		letter-spacing: 0.02em;
		text-align: right; white-space: pre;
		color: #7ee0a3;
		padding: 0; /* 水平方向不加 padding，保证 ch 对齐 */
	}
	.band .binline .sep { color: #3d5c4c; }
	.band .binline span.hl, .band .row span.hl {
		background: #2e5540; color: #d8ffe9; border-radius: 2px;
	}
	.band .op .row { color: #8b95a1; text-align: center; padding: 0 1px; }

	footer {
		margin-top: 26px; font-size: 12px; color: #5c6672; line-height: 1.7;
	}
</style>
