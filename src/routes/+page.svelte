<script lang="ts">
	import {
		tokenize, parse, buildLayout, hexText, decText, binLines, resultBinLines,
		numText, digitLen, digitToOffset, locateNum, convertDigit, bitMarkPositions, humanSize,
		type Base, type Token
	} from '$lib/calc';

	let expr = $state('xDEADBEEF + b110 ^ x2 << 2');
	// 逻辑光标的物理载体：字符偏移。进制切换时经 (token, digitFromRight) 换算保持位置
	let cursor = $state(0);
	let focused = $state(false);
	let inputEl: HTMLDivElement | undefined = $state();
	let caretEl: HTMLDivElement | undefined = $state();
	// 选区：anchor 为选区起点（null = 无选区），cursor 为另一端
	let selAnchor = $state<number | null>(null);
	let selection = $derived.by((): { start: number; end: number } | null => {
		if (selAnchor === null || selAnchor === cursor) return null;
		return { start: Math.min(selAnchor, cursor), end: Math.max(selAnchor, cursor) };
	});
	function clearSel() { selAnchor = null; }
	// 位置记忆：tokenIndex -> 各进制下的逻辑位（从右数）
	const digitMem = new Map<number, Partial<Record<Base, number>>>();

	// ---------- 输入/结果 分栏宽度（拖动分隔条调整，持久化到 localStorage） ----------
	const RATIO_KEY = 'embedcalc.splitRatio';
	let splitRatio = $state(loadRatio());
	function loadRatio(): number {
		try {
			const v = parseFloat(localStorage.getItem(RATIO_KEY) ?? '');
			if (Number.isFinite(v) && v >= 0.3 && v <= 0.7) return v;
		} catch { /* ignore */ }
		return 0.56; // 默认输入框略宽（分隔位置偏右）
	}
	function persistRatio() {
		try { localStorage.setItem(RATIO_KEY, String(splitRatio)); } catch { /* ignore */ }
	}
	let rowEl: HTMLDivElement | undefined = $state();
	let dragging = $state(false);
	function onSplitterDown(e: PointerEvent) {
		e.preventDefault();
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
		dragging = true;
	}
	function onSplitterMove(e: PointerEvent) {
		if (!dragging || !rowEl) return;
		const rect = rowEl.getBoundingClientRect();
		const x = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
		splitRatio = Math.min(0.7, Math.max(0.3, x / rect.width));
	}
	function onSplitterUp() {
		if (!dragging) return;
		dragging = false;
		persistRatio();
	}
	function onSplitterKey(e: KeyboardEvent) {
		const step = 0.02;
		if (e.key === 'ArrowLeft') { splitRatio = Math.max(0.3, splitRatio - step); persistRatio(); e.preventDefault(); }
		else if (e.key === 'ArrowRight') { splitRatio = Math.min(0.7, splitRatio + step); persistRatio(); e.preventDefault(); }
	}

	// ---------- 历史记录（localStorage 持久化，与原型约定一致：Web 版 localStorage） ----------
	const HIST_KEY = 'embedcalc.history';
	interface HistEntry { expr: string; res: string; hex: boolean; }
	let history = $state<HistEntry[]>(loadHistory());
	// -1 = 正常编辑态；-2 = 浏览中的草稿行（自动缓存，永不入库）；-3 = 点击回填；>=0 = 浏览历史第 i 条
	let histPos = $state(-1);
	let histListEl: HTMLUListElement | undefined = $state();
	// Ctrl+↑ 进入历史浏览时，把当前算式缓存为末行草稿（永远只保留一行、不写入持久历史）
	let draft = $state('');
	let browsing = $state(false);
	// 历史面板折叠态：折叠后仅显示头部单行，窗口最小高度可大幅压缩
	// histManualCollapse: 用户手动折叠 → 不自动展开
	// histCollapsed: 实际显示状态(手动折叠 || 窗口过矮自动折叠)
	let histManualCollapse = $state(false);
	let histAutoCollapsed = $state(false);
	let histCollapsed = $derived(histManualCollapse || histAutoCollapsed);

	// 自动折叠：窗口剩余空间不足时折叠历史面板,空间恢复时自动展开(手动折叠优先)
	let mainEl: HTMLElement | undefined = $state();
	let autoCollapseThreshold = 360; // 视口低于此高度(px)时自动折叠历史面板
	$effect(() => {
		const el = mainEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(([entry]) => {
			const h = entry.contentRect.height;
			if (h < autoCollapseThreshold) { histAutoCollapsed = true; }
			else if (!histManualCollapse) { histAutoCollapsed = false; }
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	// 表达式含 2/16 进制数 → 结果显示 hex，否则显示十进制
	function resultIsHex(toks: Token[] | null): boolean {
		return toks?.some(t => t.kind === 'num' && (t.base === 2 || t.base === 16)) ?? false;
	}
	function loadHistory(): HistEntry[] {
		try {
			const raw = localStorage.getItem(HIST_KEY);
			if (!raw) return [];
			const arr = JSON.parse(raw) as unknown[];
			// 兼容旧版纯字符串记录：尝试补算结果
			return arr
				.map((e): HistEntry | null => {
					if (typeof e === 'string') {
						try {
							const toks = tokenize(e);
							const hex = resultIsHex(toks);
							return { expr: e, res: (hex ? hexText : decText)(parse(toks)), hex };
						} catch { return { expr: e, res: '', hex: false }; }
					}
					if (e && typeof e === 'object' && typeof (e as HistEntry).expr === 'string') return e as HistEntry;
					return null;
				})
				.filter((e): e is HistEntry => e !== null);
		} catch { return []; }
	}
	function persistHistory() {
		try { localStorage.setItem(HIST_KEY, JSON.stringify(history)); } catch { /* ignore */ }
	}
	// Enter：求值成功且表达式非空时存入历史（去重、时间序旧→新、最多 50 条），结果一并记录
	function saveToHistory(e: string, result: bigint) {
		const t = e.trim();
		if (!t) return;
		const hex = resultIsHex(tokens);
		const entry: HistEntry = { expr: t, res: (hex ? hexText : decText)(result), hex };
		history = [...history.filter(h => h.expr !== t), entry].slice(-50);
		histPos = -1; browsing = false;
		if (t === draft) draft = ''; // 草稿已正式保存 → 缓存行清空
		persistHistory();
		// 去重时长度可能不变，兜底确保滚到最新
		setTimeout(() => { if (histListEl) histListEl.scrollTop = histListEl.scrollHeight; }, 0);
	}
	// Ctrl+↑ 进入历史浏览：首次把当前算式缓存为末行草稿（不入持久历史，永远只有一行）
	function histOlder() {
		if (history.length === 0) return;
		if (!browsing) { draft = expr; browsing = true; histPos = history.length - 1; }
		else if (histPos === -2) histPos = history.length - 1; // 草稿行 → 最新一条
		else if (histPos <= 0) return; // 已在最老一条，不再上翻
		else histPos = histPos - 1;
		expr = history[histPos].expr;
		cursor = expr.length;
	}
	// Ctrl+↓ 向更新方向翻；越过最新一条 → 恢复草稿算式（仍停留在草稿行），再按一次退出浏览
	function histNewer() {
		if (!browsing) return;
		if (histPos < 0) { exitBrowse(); return; }
		if (histPos >= history.length - 1) { histPos = -2; expr = draft; }
		else { histPos++; expr = history[histPos].expr; }
		cursor = expr.length;
	}
	function exitBrowse() {
		if (!browsing) return;
		browsing = false; histPos = -1;
		expr = draft; cursor = expr.length;
	}
	function clickHistoryItem(i: number) {
		if (!browsing) { draft = expr; browsing = true; }
		else { draft = expr; } // 浏览态中点击其他条目时，更新草稿为当前表达式
		histPos = i;
		expr = history[i].expr;
		cursor = expr.length;
		inputEl?.focus();
	}
	function clearHistory() {
		history = [];
		histPos = -1; browsing = false; draft = '';
		persistHistory();
	}
	// 历史列表滚动逻辑（统一处理，避免多个 $effect 竞争）：
	//  - 进入浏览态 → 先滚到底部（最新记录+草稿行同屏），再 scrollIntoView 到当前行
	//  - 正常态 + 新增记录 → 滚到底部
	//  - 点击/翻阅 → scrollIntoView 保持当前行可见
	$effect(() => {
		const pos = histPos;
		const len = history.length;
		const el = histListEl;
		if (!el) return;
		if (browsing) {
			// 浏览态：滚到底部让草稿行可见
			el.scrollTop = el.scrollHeight;
			// 如果当前浏览的不是草稿行，scrollIntoView 保持该行可见
			if (pos >= 0) {
				const li = el.children[pos] as HTMLElement | undefined;
				li?.querySelector('.hist-item')?.scrollIntoView({ block: 'nearest' });
			}
		} else if (len > 0) {
			el.scrollTop = el.scrollHeight;
		}
	});

	// ---------- 示例下拉菜单 ----------
	let presetMenuOpen = $state(false);
	let presetCloseTimer: ReturnType<typeof setTimeout> | undefined;
	function openPreset() { clearTimeout(presetCloseTimer); presetMenuOpen = true; }
	function scheduleClosePreset() { presetCloseTimer = setTimeout(() => { presetMenuOpen = false; }, 150); }

	// ---------- 结果一键复制（hex/dec/bin 各行右侧，复制成功短暂变 ✓） ----------
	let copied = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	async function copyResult(text: string, key: string) {
		try { await navigator.clipboard.writeText(text); } catch { /* 剪贴板不可用时静默 */ }
		clearTimeout(copyTimer);
		copied = key;
		copyTimer = setTimeout(() => { copied = null; }, 1200);
	}

	// ---------- 自绘标题栏：窗口控制 + 手动拖拽（Tauri 桌面端专属，浏览器中隐藏） ----------
	const isTauri = '__TAURI_INTERNALS__' in window;
	let pinned = $state(false);
	async function togglePin() {
		try {
			const { getCurrentWindow } = await import('@tauri-apps/api/window');
			await getCurrentWindow().setAlwaysOnTop(!pinned);
			pinned = !pinned;
		} catch { /* 权限或环境异常时保持原状态 */ }
	}
	async function winMinimize() {
		try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().minimize(); } catch { /* ignore */ }
	}
	async function winClose() {
		try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().close(); } catch { /* ignore */ }
	}
	// 标题栏手动拖拽:不用 data-tauri-drag-region(它会与 tao 的边缘 resize hit-test 抢事件、导致边缘光标消失)。
	// 排除按钮与窗口边缘(左/上/右 6px,留给系统 resize),其余区域按下才发起拖拽。
	async function onTitlebarDown(e: MouseEvent) {
		if (!isTauri || e.button !== 0) return;
		if ((e.target as HTMLElement).closest('button, .preset-menu')) return;
		const EDGE = 6;
		if (e.clientY < EDGE || e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
		try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().startDragging(); } catch { /* ignore */ }
	}
	// 双击标题栏切换最大化(同样排除按钮与边缘)
	async function onTitlebarDbl(e: MouseEvent) {
		if (!isTauri || (e.target as HTMLElement).closest('button, .preset-menu')) return;
		const EDGE = 6;
		if (e.clientY < EDGE || e.clientX < EDGE || e.clientX > window.innerWidth - EDGE) return;
		try { const { getCurrentWindow } = await import('@tauri-apps/api/window'); await getCurrentWindow().toggleMaximize(); } catch { /* ignore */ }
	}

	// ---------- 词元短暂高亮（Ctrl+←/→ 跳词后提示目标） ----------
	let flashToken = $state<number | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function flash(ti: number) {
		clearTimeout(flashTimer);
		flashToken = ti;
		flashTimer = setTimeout(() => { flashToken = null; }, 500);
	}

	const presets: [string, string][] = [
		['寄存器位操作', 'xDEADBEEF + b110 ^ x2 << 2'],
		['GPIO 配置', '(x1 << 5) | (x3 << 10) | b101'],
		['地址计算', 'x40000000 + x204*4 + 13'],
		['掩码组合', '~xFF & x12345678 | b1111_0000 << 8'],
		['64 位取值', 'x123456789ABCDEF0 >> 8 & xFFFFFFFF'],
		['字符运算', "'A' ^ x20"],
	];

	// 词法分析失败时 tokens 为 null（输入框仍可编辑，只是无高亮/无求值），同时捕获词法错误信息
	let lex = $derived.by((): { tokens: Token[] | null; error: string | null } => {
		try { return { tokens: tokenize(expr), error: null }; }
		catch (e) { return { tokens: null, error: (e as Error).message }; }
	});
	let tokens = $derived(lex.tokens);

	interface CalcResult { layout: ReturnType<typeof buildLayout> | null; result: bigint | null; error: string | null; }
	let calc = $derived.by((): CalcResult => {
		// 非法字符等词法错误优先报出
		if (lex.error) return { layout: null, result: null, error: lex.error };
		if (!tokens || tokens.length === 0) return { layout: tokens ? [] : null, result: null, error: null };
		// 表达式以二元运算符结尾时多半是用户正在输入：忽略尾部运算符，按截断后的式子求值，不报错
		let eff = tokens;
		while (eff.length > 0) {
			const last = eff[eff.length - 1];
			if (last.kind === 'op') eff = eff.slice(0, -1); // 结尾二元运算符，忽略
			else if (last.kind === 'lparen') eff = eff.slice(0, -1); // 结尾左括号（含 '(' 后紧跟运算符），忽略
			else break;
		}
		if (eff.length === 0) return { layout: null, result: null, error: null };
		try {
			const value = parse(eff);
			return { layout: buildLayout(eff), result: value, error: null };
		} catch (e) {
			return { layout: null, result: null, error: (e as Error).message };
		}
	});

	// 报错时保留最后一次成功的进制框布局与结果：框内容高不变，仅顶部浮出报错条，输入框不跳动
	let lastLayout = $state<ReturnType<typeof buildLayout> | null>(null);
	let lastResult = $state<bigint | null>(null);
	let showError = $state<string | null>(null);
	$effect(() => {
		if (calc.layout) { lastLayout = calc.layout; lastResult = calc.result; showError = null; }
		else if (calc.error) showError = calc.error;
		else { lastLayout = null; lastResult = null; }
	});

	// 输入框渲染分段（token 间空白也保留，保证字符偏移 1:1）
	interface Seg { text: string; cls: string; start: number; tokenIndex: number | null; }
	let segments = $derived.by((): Seg[] => {
		if (!tokens) return [{ text: expr, cls: 'gap', start: 0, tokenIndex: null }];
		const segs: Seg[] = [];
		let p = 0;
		tokens.forEach((t, ti) => {
			if (t.start > p) segs.push({ text: expr.slice(p, t.start), cls: 'gap', start: p, tokenIndex: null });
			segs.push({ text: t.text, cls: t.kind === 'num' ? `num b${t.base}` : t.kind, start: t.start, tokenIndex: ti });
			p = t.end;
		});
		if (p < expr.length) segs.push({ text: expr.slice(p), cls: 'gap', start: p, tokenIndex: null });
		return segs;
	});

	// 进制切换提示：光标在数字内时，数字中心上方 ▲（可按↑）、下方 ▼（可按↓）
	let hintInfo = $derived.by(() => {
		if (!tokens || !focused) return null;
		const info = locateNum(tokens, cursor);
		if (!info) return null;
		const order: Base[] = [16, 10, 2];
		const i = order.indexOf(info.token.base!);
		return {
			center: info.token.start + info.token.text.length / 2, // ch 单位，可为半字符
			canUp: i > 0,          // 未到 hex 顶部
			canDown: i < order.length - 1, // 未到 bin 底部
		};
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
		histPos = -1; browsing = false;
		if (selection) { expr = expr.slice(0, selection.start) + s + expr.slice(selection.end); cursor = selection.start + s.length; clearSel(); }
		else { expr = expr.slice(0, cursor) + s + expr.slice(cursor); cursor += s.length; }
		autoJoin();
	}

	function deleteBackward() {
		histPos = -1; browsing = false;
		if (selection) { expr = expr.slice(0, selection.start) + expr.slice(selection.end); cursor = selection.start; clearSel(); }
		else if (cursor > 0) { expr = expr.slice(0, cursor - 1) + expr.slice(cursor); cursor--; }
		autoJoin();
	}

	function deleteForward() {
		histPos = -1; browsing = false;
		if (selection) { expr = expr.slice(0, selection.start) + expr.slice(selection.end); cursor = selection.start; clearSel(); }
		else { expr = expr.slice(0, cursor) + expr.slice(cursor + 1); }
		autoJoin();
	}

	// 二进制显示模式下，空格分隔的相邻 bin 段自动拼接为连续位流
	// 用 tokenize 检测相邻 bin num token，如果有空格分隔就合并
	function autoJoin() {
		try {
			const toks = tokenize(expr);
			for (let i = 0; i < toks.length - 1; i++) {
				const a = toks[i], b = toks[i + 1];
				if (a.kind === 'num' && a.base === 2 && b.kind === 'num' && b.base === 2) {
					const gap = expr.slice(a.end, b.start);
					if (/^\s+$/.test(gap)) {
						const removeStart = a.end;
						const removeLen = gap.length + 1; // 去掉空格 + 第二个 b 前缀
						expr = expr.slice(0, removeStart) + expr.slice(removeStart + removeLen);
						if (cursor > removeStart) cursor = Math.max(removeStart, cursor - removeLen);
						autoJoin(); // 递归合并更多
						return;
					}
				}
			}
		} catch { /* ignore parse errors */ }
	}

	// ↑: hex→dec→bin，↓: bin→dec→hex，到头/到尾即停，不循环（与显示顺序一致）
	function cycleBase(dir: 1 | -1) {
		if (!tokens) return;
		const info = locateNum(tokens, cursor);
		if (!info) return;
		const { index, token, digit } = info;
		const order: Base[] = [16, 10, 2]; // ↓ 沿显示顺序 hex→dec→bin，↑ 逆序
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

	// Ctrl+←/→：跳到上一个/下一个 token 起始位置，并短暂闪烁目标词元
	// 数字词元落在 digitStart（前缀右侧），保证光标进入数字位区域、可直接 ↑/↓ 切换进制
	function wordJump(dir: -1 | 1) {
		if (!tokens || tokens.length === 0) { cursor = dir < 0 ? 0 : expr.length; return; }
		// 跳转目标：num 取 digitStart（跳过 x/b 前缀），其余取 start
		const starts = tokens.map(t => (t.kind === 'num' ? t.digitStart! : t.start));
		if (dir < 0) {
			// 向左：找 cursor 之前的最近 token 起始（允许等于 cursor 时跳到再前一个）
			for (let i = starts.length - 1; i >= 0; i--) {
				if (starts[i] < cursor) { cursor = starts[i]; flash(i); return; }
			}
			cursor = 0;
		} else {
			// 向右：跳过当前 token，直接到下一个 token 起始
			for (let i = 0; i < starts.length; i++) {
				if (starts[i] > cursor) { cursor = starts[i]; flash(i); return; }
			}
			cursor = expr.length;
		}
	}

	// 光标移动统一入口：按住 Shift → 以当前光标为锚点扩展选区，否则清除选区
	function moveCursor(to: () => number, extend: boolean) {
		if (extend && selAnchor === null) selAnchor = cursor;
		cursor = to();
		if (!extend) clearSel();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.altKey) return; // 放行系统快捷键
		if (e.ctrlKey) {
			if (e.key === 'a' || e.key === 'A') { selAnchor = 0; cursor = expr.length; e.preventDefault(); return; }
			if (e.key === 'c' || e.key === 'C') { if (selection) { navigator.clipboard?.writeText(expr.slice(selection.start, selection.end)); } e.preventDefault(); return; }
			if (e.key === 'x' || e.key === 'X') { if (selection) { navigator.clipboard?.writeText(expr.slice(selection.start, selection.end)); insertText(''); } e.preventDefault(); return; }
			if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
				// Ctrl+Shift+←/→：按词元扩展选区
				if (e.shiftKey && selAnchor === null) selAnchor = cursor;
				wordJump(e.key === 'ArrowLeft' ? -1 : 1);
				if (!e.shiftKey) clearSel();
				e.preventDefault();
			}
			else if (e.key === 'ArrowUp') { histOlder(); e.preventDefault(); }
			else if (e.key === 'ArrowDown') { histNewer(); e.preventDefault(); }
			return; // 其余 Ctrl 组合放行
		}
		const k = e.key;
		const sh = e.shiftKey; // Shift+方向键/Home/End：扩展选区
		if (k === 'ArrowLeft') moveCursor(() => Math.max(0, cursor - 1), sh);
		else if (k === 'ArrowRight') moveCursor(() => Math.min(expr.length, cursor + 1), sh);
		else if (k === 'Home') moveCursor(() => 0, sh);
		else if (k === 'End') moveCursor(() => expr.length, sh);
		else if (k === 'ArrowUp' || k === 'ArrowDown') {
			// 光标在数字内 → 切换该数字进制；不在数字上 → 不响应（历史浏览走 Ctrl+↑/↓）
			const info = tokens ? locateNum(tokens, cursor) : null;
			if (info) cycleBase(k === 'ArrowUp' ? -1 : 1);
		}
		else if (k === 'Escape') { exitBrowse(); return; }
		else if (k === 'Backspace') { deleteBackward(); }
		else if (k === 'Delete') { deleteForward(); }
		else if (k === 'Enter') {
			// 求值成功后连同结果一起存入历史
			if (calc.result !== null) saveToHistory(expr, calc.result);
		}
		else if (k.length === 1) { insertText(k); }
		else return;
		e.preventDefault();
	}

	function onPaste(e: ClipboardEvent) {
		e.preventDefault();
		const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\n\s*/g, ' ');
		insertText(text);
	}

	// 鼠标位置 → 字符偏移（caretRangeFromPoint / caretPositionFromPoint）
	function offsetFromPoint(x: number, y: number): number {
		const doc = document as Document & {
			caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
		};
		let node: Node | null = null, off = 0;
		if (doc.caretRangeFromPoint) {
			const r = doc.caretRangeFromPoint(x, y);
			if (r) { node = r.startContainer; off = r.startOffset; }
		} else if (doc.caretPositionFromPoint) {
			const p = doc.caretPositionFromPoint(x, y);
			if (p) { node = p.offsetNode; off = p.offset; }
		}
		return node ? globalOffset(node, off) : expr.length;
	}

	// mousedown：定位光标；拖动 → 以按下点为锚点扩展选区；Shift+点击 → 扩展选区到点击处
	function onMousedown(e: MouseEvent) {
		e.preventDefault();
		inputEl?.focus();
		if (e.shiftKey) {
			if (selAnchor === null) selAnchor = cursor;
			cursor = offsetFromPoint(e.clientX, e.clientY);
			return;
		}
		clearSel();
		const down = offsetFromPoint(e.clientX, e.clientY);
		cursor = down;
		const onMove = (ev: MouseEvent) => {
			selAnchor = down;
			cursor = offsetFromPoint(ev.clientX, ev.clientY);
		};
		const onUp = () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
			if (selAnchor === cursor) clearSel(); // 原地松开（未拖动）→ 无选区
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
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
	<title>EmbedCalc - 混合进制计算器</title>
</svelte:head>

<main bind:this={mainEl}>
	<!-- 自绘标题栏(无边框窗口):左侧标题+折叠态历史控制,右侧示例+窗口按钮 -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="titlebar" onmousedown={onTitlebarDown} ondblclick={onTitlebarDbl}>
		<span class="titlebar-name">EmbedCalc</span>
		{#if histCollapsed}
			<button class="titlebar-btn icon" title="展开历史记录" onclick={() => { histManualCollapse = false; histAutoCollapsed = false; }}>
				<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>
			</button>
			<span class="titlebar-hint">历史记录</span>
		{/if}
		<div class="titlebar-right">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="preset-wrap" role="presentation" onmouseenter={openPreset} onmouseleave={scheduleClosePreset}>
				<button
					class="titlebar-btn"
					aria-expanded={presetMenuOpen}
					onclick={() => { clearTimeout(presetCloseTimer); presetMenuOpen = !presetMenuOpen; }}
				>示例 ▾</button>
				{#if presetMenuOpen}
					<div class="preset-menu">
						{#each presets as [name, p]}
							<button onclick={() => { expr = p; histPos = -1; cursor = p.length; presetMenuOpen = false; inputEl?.focus(); }}>{name}</button>
						{/each}
					</div>
				{/if}
			</div>
			{#if isTauri}
				<button
					class="titlebar-btn icon"
					class:active={pinned}
					aria-pressed={pinned}
					title={pinned ? '取消窗口置顶' : '窗口置顶'}
					onclick={togglePin}
				>
					<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
				</button>
				<button class="titlebar-btn icon" title="最小化" onclick={winMinimize}>
					<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
				</button>
				<button class="titlebar-btn icon close" title="关闭" onclick={winClose}>
					<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			{/if}
		</div>
	</div>

	<!-- 历史面板：展开态显示完整面板(头部+列表)，折叠态完全隐藏(控制项已并入标题栏) -->
	{#if !histCollapsed}
		<section class="history">
			<div class="hist-head">
				<button class="hist-collapse-btn" title="折叠历史记录" onclick={() => { histManualCollapse = true; }}>
					<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 10l4-4 4 4"/></svg>
				</button>
				<span class="hist-title">历史记录 <span class="hist-hint">Enter 保存 · Ctrl+↑/↓ 翻阅 · 点击回填 · Esc 退出</span></span>
			{#if history.length > 0}
				<button class="hist-clear" onclick={clearHistory}>清空</button>
			{/if}
		</div>
		{#if history.length > 0 || (browsing && draft !== '')}
				<ul class="hist-list" bind:this={histListEl}>
					{#each history as h, i}
						<li>
							<button
								class="hist-item"
								class:current={histPos === i}
								onclick={() => clickHistoryItem(i)}
							>
								<span class="hist-expr">{h.expr}</span>
								<span class="hist-res" class:hex-res={h.hex}>{h.res}</span>
							</button>
						</li>
					{/each}
					{#if browsing && draft !== ''}
						<li>
							<button
								class="hist-item draft"
								class:current={histPos === -2}
								onclick={() => { if (!browsing) { draft = expr; browsing = true; } histPos = -2; expr = draft; cursor = expr.length; inputEl?.focus(); }}
							>
								<span class="hist-expr">{draft}</span>
								<span class="hist-draft-tag">当前算式</span>
							</button>
						</li>
					{/if}
				</ul>
			{:else}
				<div class="hist-empty">暂无记录 —— 输入算式后按 Enter 保存</div>
			{/if}
		</section>
	{/if}

	<div class="input-row" bind:this={rowEl} class:dragging>
		<!-- 自绘输入框：keydown 接管 + 绝对定位光标条。等宽字体下光标 left = cursor × 1ch -->
		<!-- 彩色流光边框：conic-gradient 在伪元素层旋转，主体层盖住中心，仅露出 1px 边框 -->
		<div
			class="expr-input"
			class:focused
			class:has-error={showError !== null}
			style="flex: 0 1 calc({splitRatio * 100}% - 8px)"
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
			<!-- 空输入时的淡色示例：定位到 padding 区左上角，与 .inner 文字起点对齐 -->
			{#if expr === '' && !focused}
				<div class="placeholder">xDEADBEEF + b110 ^ x2 {'<<'} 2</div>
			{/if}
			<div class="inner">
				{#each segments as seg}
					<span
						class="{seg.cls}{' '}{seg.tokenIndex === flashToken ? 'flash' : ''}"
						data-start={seg.start}
					>{seg.text}</span>
				{/each}
				{#if selection}
					<div class="sel-highlight" style="left: calc({selection.start} * 1ch); width: calc({selection.end - selection.start} * 1ch)"></div>
				{/if}
				{#if focused}
					<div class="caret" bind:this={caretEl} style="left: calc({cursor} * 1ch)"></div>
				{/if}
				<!-- 光标在数字内时：数字中心上方 ▲（可按↑切换）、下方 ▼（可按↓切换） -->
				{#if hintInfo}
					{#if hintInfo.canUp}
						<div class="base-hint hint-up" style="left: calc({hintInfo.center} * 1ch)" title="↑ 向 hex 切换"><span>▲</span></div>
					{/if}
					{#if hintInfo.canDown}
						<div class="base-hint hint-down" style="left: calc({hintInfo.center} * 1ch)" title="↓ 向 bin 切换"><span>▼</span></div>
					{/if}
				{/if}
			</div>
			<!-- bin 显示时，对应数字下方用小子标注位数（每 8 位一组，标注组末位 bit 号） -->
			{#if tokens}
				<div class="bitmarks" aria-hidden="true">
					{#each tokens as t}
						{#if t.kind === 'num' && t.base === 2}
							{#each bitMarkPositions(t.text) as m}
								<span class="bitmark-anchor" style="left: calc({t.start + m.pos} * 1ch + 0.5ch)"><span class="bitmark">{m.count}</span></span>
							{/each}
						{/if}
					{/each}
				</div>
			{/if}
		</div>
		<!-- 可拖动分隔条：调整输入框/结果框宽度比例，支持键盘 ←/→ 微调 -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="splitter"
			role="separator"
			aria-orientation="vertical"
			aria-label="调整输入框与结果框宽度"
			tabindex="0"
			title="拖动调整左右宽度"
			onpointerdown={onSplitterDown}
			onpointermove={onSplitterMove}
			onpointerup={onSplitterUp}
			onpointercancel={onSplitterUp}
			onkeydown={onSplitterKey}
		><div class="splitter-grip"></div></div>
		{#if calc.result ?? lastResult}
			{@const r = calc.result ?? lastResult!}
			<div class="result">
				<!-- 当前结果同时显示三种进制（报错时保留最后结果，面板高度不变）；各行 hover 浮现一键复制 -->
			<div class="res-lines">
				<div class="res-line">
					<span class="lbl">hex</span><code>{hexText(r)}</code>
					<button class="copy-btn" class:done={copied === 'hex'} title="复制 hex 结果" onclick={() => copyResult(hexText(r), 'hex')}>
						{#if copied === 'hex'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
				<div class="res-line">
					<span class="lbl">dec</span><code>{decText(r)}</code>
					<button class="copy-btn" class:done={copied === 'dec'} title="复制 dec 结果" onclick={() => copyResult(decText(r), 'dec')}>
						{#if copied === 'dec'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
				<div class="res-line">
					<span class="lbl">bin</span><code class="bin">{resultBinLines(r).join(' ')}</code>
					<button class="copy-btn" class:done={copied === 'bin'} title="复制 bin 结果" onclick={() => copyResult(resultBinLines(r).join(' '), 'bin')}>
						{#if copied === 'bin'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
			</div>
			<!-- 结果 ≥ 1024 时右侧附注人性化大小（≈ 表示约等于，报错保留结果时同样跟随） -->
			{#if humanSize(r)}
				{@const size = humanSize(r)!}
				<div class="res-size" title="按 1024 进制换算的大小">
					<span class="approx">≈</span>
					<span class="size-val">{size.slice(0, size.lastIndexOf(' '))}</span>
					<span class="size-unit">{size.slice(size.lastIndexOf(' ') + 1)}</span>
				</div>
			{/if}
			</div>
		{:else}
			<!-- 占位：保持 input-row 行高恒定，结果面板出现/消失时输入框不跳动 -->
			<div class="result result-placeholder" aria-hidden="true"></div>
		{/if}
	</div>

	<!-- 进制框常驻渲染：报错时保留最后布局、顶部浮出报错条，保持框高不变，避免输入框上下跳动 -->
	<section class="views" class:has-error={showError !== null}>
		{#if showError}
			<div class="error-float"><div class="error">{showError}</div></div>
		{/if}
		{#if calc.layout ?? lastLayout}
			<div class="band">
				{#each calc.layout ?? lastLayout ?? [] as chunk}
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
		{/if}
	</section>

	<footer>
		光标移到数字内部，按 ↑/↓ 切换该数字进制·
		Shift+←/→ 或鼠标拖选选中文本 · Ctrl+←/→ 快速跳转词元 ·
		Ctrl+↑/↓ 翻阅历史记录 · Enter 保存算式到历史 · Esc 退出历史浏览
	</footer>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #14171c;
		color: #d7dce2;
		font-family: system-ui, sans-serif;
		/* 无边框窗口:整体圆角 + 阴影由合成器绘制,这里只需圆角防内容溢出方角 */
		border-radius: 10px;
		overflow: hidden;
	}
	:global(html, body) { height: 100%; }
	/* 视口高度弹性列布局：历史面板填充剩余空间，输入框与进制框优先完整显示（紧凑间距） */
	main {
		box-sizing: border-box;
		height: 100vh; max-width: 1080px;
		margin: 0 auto; padding: 8px 14px 8px;
		display: flex; flex-direction: column;
	}

	/* 自绘标题栏：通栏贴窗口顶部（负 margin 抵消 main padding），圆角与窗口一致 */
	.titlebar {
		flex: 0 0 auto;
		display: flex; align-items: center; gap: 8px;
		height: 34px;
		margin: -8px -14px 8px;
		padding: 0 8px 0 14px;
		background: #171b22;
		border-bottom: 1px solid #232a33;
		border-radius: 10px 10px 0 0;
		user-select: none;
		cursor: default;
	}
	.titlebar-name { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: #66707c; }
	.titlebar-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }
	.titlebar-btn {
		background: transparent; color: #9aa4af; border: none; border-radius: 5px;
		font-size: 12px; padding: 3px 9px; line-height: 1; cursor: pointer;
		transition: color 0.12s, background 0.12s;
	}
	.titlebar-btn:hover { background: #242b35; color: #d7dce2; }
	.titlebar-btn.icon { width: 28px; height: 20px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
	.titlebar-btn.icon.active { color: #7ee0a3; background: #1c2a24; }
	.titlebar-btn.icon.close:hover { background: #5c2b27; color: #ff9d8a; }
	/* 折叠态历史记录提示文字（标题栏内） */
	.titlebar-hint { font-size: 12px; color: #9aa4af; margin-left: 4px; }

	/* 示例入口（标题栏内），下拉向右展开 */
	.preset-wrap { position: relative; }
	.preset-menu {
		position: absolute; top: calc(100% + 6px); right: 0; z-index: 20;
		display: flex; flex-direction: column; gap: 2px;
		min-width: 300px; padding: 6px;
		background: #1a1f26; border: 1px solid #333a44; border-radius: 8px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
	}
	.preset-menu button {
		text-align: left; background: transparent; color: #9aa4af;
		border: none; border-radius: 5px; padding: 6px 10px;
		font-size: 12px; cursor: pointer; white-space: nowrap;
	}
	.preset-menu button:hover { background: #242b35; color: #d7dce2; }

	.input-row { display: flex; gap: 1px; align-items: stretch; flex: 0 0 auto; margin-top: 10px; }

	/* 自绘输入框。彩色流光彩边：双层背景 —— 底层是旋转的 conic 渐变（铺满 border 区），
	   顶层实色背景裁到 padding-box，仅露出 border 那一圈；
	   未聚焦：暗色慢速流动，提示输入位置；聚焦：亮色快速流动，视觉焦点明确 */
	.expr-input {
		position: relative;
		min-width: 0; box-sizing: border-box;
		color: #e8edf2;
		border: 1.5px solid transparent; border-radius: 8px;
		padding: 23px 14px 12px 14px; font-size: 17px;
		font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
		outline: none; overflow-x: auto; overflow-y: visible;
		cursor: text;
		/* stretch 布局下保持内容顶部对齐，避免 bitmarks/hint 垂直漂移 */
		display: flex; flex-direction: column; justify-content: flex-start;
		/* 未聚焦：暗绿-暗紫慢速流转（低调提示位置） */
		background:
			linear-gradient(#10131a, #10131a) padding-box,
			conic-gradient(
				from var(--flow-angle, 0deg),
				#24312a 0deg,
				#2e5540 70deg,
				#3a4a42 140deg,
				#2a3a4a 210deg,
				#3d2a52 280deg,
				#2e5540 330deg,
				#24312a 360deg
			) border-box;
		animation: border-flow 10s linear infinite;
		transition: box-shadow 0.3s;
	}
	.expr-input.focused {
		/* 聚焦：亮绿-青-紫快速流转（视觉焦点） */
		background:
			linear-gradient(#10131a, #10131a) padding-box,
			conic-gradient(
				from var(--flow-angle, 0deg),
				#2e5540 0deg,
				#4d9e6e 70deg,
				#7ee0a3 140deg,
				#7ec8ff 210deg,
				#b48ce8 280deg,
				#4d9e6e 330deg,
				#2e5540 360deg
			) border-box;
		animation-duration: 4s;
		box-shadow: 0 0 12px rgba(126, 224, 163, 0.22);
	}
	/* @property 使自定义属性可动画（Chromium / Safari 16.4+）；不支持则静止显示渐变 */
	@property --flow-angle {
		syntax: '<angle>';
		initial-value: 0deg;
		inherits: false;
	}
	@keyframes border-flow {
		to { --flow-angle: 360deg; }
	}
	@media (prefers-reduced-motion: reduce) {
		.expr-input { animation: none; }
	}

	.expr-input.has-error {
		/* 错误：暗红-暗橙流转，提示输入有误 */
		background:
			linear-gradient(#10131a, #10131a) padding-box,
			conic-gradient(
				from var(--flow-angle, 0deg),
				#4a2a2a 0deg,
				#8a4a3a 70deg,
				#b45a4a 140deg,
				#c46a5a 210deg,
				#8a4a3a 280deg,
				#4a2a2a 330deg,
				#4a2a2a 360deg
			) border-box;
	}
	.expr-input.has-error.focused {
		background:
			linear-gradient(#10131a, #10131a) padding-box,
			conic-gradient(
				from var(--flow-angle, 0deg),
				#5c2b27 0deg,
				#c45c4c 70deg,
				#ff9d8a 140deg,
				#e8a07d 210deg,
				#c45c4c 280deg,
				#5c2b27 330deg,
				#5c2b27 360deg
			) border-box;
		box-shadow: 0 0 12px rgba(255, 157, 138, 0.22);
	}

	/* 空输入框时的淡色示例提示：绝对定位于 .expr-input 的 padding 区左上角，
	   与 .inner 文字起点对齐（14px padding + 1.5px border），不干扰字符宽度基准 */
	.placeholder {
		position: absolute; top: 23px; left: 15.5px;
		color: #3d4552; font-style: italic;
		pointer-events: none; user-select: none;
		white-space: pre; line-height: 1.5;
	}

	/* 分栏拖动条：2px 细线 + 8px 热区，hover/拖动时显示绿色指示，支持键盘 ←/→ */
	.splitter {
		flex: 0 0 2px; margin: 0; padding: 0 4px;
		display: flex; align-items: center; justify-content: center;
		cursor: col-resize; z-index: 6;
		touch-action: none;
		outline: none;
	}
	.splitter-grip {
		width: 2px; height: 20px; border-radius: 1px;
		background: #333a44;
		transition: background 0.15s, height 0.15s;
	}
	.splitter:hover .splitter-grip,
	.splitter:focus-visible .splitter-grip,
	.input-row.dragging .splitter-grip { background: #4d9e6e; height: 55%; }
	.input-row.dragging { cursor: col-resize; user-select: none; }
	.expr-input .inner {
		position: relative; width: max-content; min-width: 100%;
		white-space: pre; line-height: 1.5;
	}
	.expr-input .num.b16 { color: #7ec8ff; }
	.expr-input .num.b10 { color: #e8c07d; }
	.expr-input .num.b2 { color: #7ee0a3; }
	.expr-input .op, .expr-input .lparen, .expr-input .rparen { color: #8b95a1; }
	/* 光标在数字内时，数字中心上方 ▲ / 下方 ▼（指示可按 ↑/↓ 切换进制） */
	.base-hint {
		position: absolute;
		z-index: 3;
		height: 8px; line-height: 8px;
		color: #6bcf8f;
		transform: translateX(-50%);
		pointer-events: none; user-select: none;
	}
	.base-hint span { font-size: 8px; display: inline-block; line-height: 8px; vertical-align: top; }
	/* 上方 ▲：位于文字行上方 padding 区内（相对 .inner） */
	.base-hint.hint-up { top: -14px; bottom: auto; }
	/* 下方 ▼：位于 bitmarks 区域内，不超出输入框边界（相对 .inner） */
	.base-hint.hint-down { top: auto; bottom: -19px; }
	/* Ctrl+←/→ 跳词后目标词元的短暂高亮 */
	.expr-input .flash { animation: token-flash 0.5s ease-out; border-radius: 3px; }
	@keyframes token-flash {
		0% { background: rgba(77, 158, 110, 0.45); }
		100% { background: transparent; }
	}
	/* bin 位号标注：容器与文字同字号保证 ch 对齐，内部缩放显示 */
	/* 位号显示在数字下方：容器预留实际高度，标注不会被裁剪、无需滚动 */
	.bitmarks { position: relative; height: 13px; font-size: 17px; }
	.bitmark-anchor {
		position: absolute; top: 1px;
		transform: translateX(-50%); /* 水平居中于对应数字的正下方 */
		line-height: 1;
		pointer-events: none; white-space: pre;
	}
	.bitmark {
		font-size: 9px; line-height: 1; color: #4a6b57;
		font-family: ui-monospace, monospace;
	}
	.caret {
		position: absolute; top: 0; height: 25.5px; width: 2.5px;
		background: #f0f4f8;
		box-shadow: 0 0 4px rgba(240, 244, 248, 0.4);
		animation: blink 1.1s ease-in-out infinite;
		pointer-events: none;
	}
	/* 选区高亮 */
	.sel-highlight {
		position: absolute; top: 0; bottom: 0;
		background: rgba(77, 158, 110, 0.25);
		border-radius: 2px;
		pointer-events: none;
	}
	@keyframes blink { 50% { opacity: 0.2; } }

	/* 结果框相对定位，res-size 绝对定位于右上角层叠显示，不占布局空间 */
	.result {
		flex: 1 1 0; min-width: 0; box-sizing: border-box;
		min-height: 77px; position: relative;
		display: flex; flex-direction: row; align-items: center; gap: 14px;
		background: #10131a; border: 1px solid #2e5540; border-radius: 8px;
		padding: 8px 12px; overflow: hidden;
	}
	/* 无结果时的占位框：仅保留极淡描边暗示分栏，撑满高度与输入框一致 */
	.result-placeholder {
		background: transparent;
		border-color: #23293066;
		border-style: dashed;
	}
	.res-lines { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; }
	/* 人性化大小附注：绝对定位于结果框右上角，层叠显示，不占布局空间 */
	.res-size {
		position: absolute; top: 8px; right: 12px;
		padding-left: 14px; border-left: 1px solid #2e5540;
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 12px; line-height: 1.4; white-space: nowrap;
		color: #66707c; background: #10131a80; padding-right: 2px;
	}
	.res-size .approx { margin-right: 4px; color: #4a5461; }
	.res-size .size-val { color: #9aa4af; margin-right: 3px; }
	.res-size .size-unit { font-size: 10px; letter-spacing: 0.05em; }
	.res-line { display: flex; gap: 10px; align-items: baseline; margin: 1px 0; white-space: nowrap; min-height: 20px; }
	/* 一键复制按钮：默认隐身，hover 该行浮现；复制成功 1.2s 内显示绿色 ✓ */
	.copy-btn {
		flex: 0 0 auto; align-self: center;
		width: 18px; height: 18px; margin-left: 4px; padding: 0;
		display: inline-flex; align-items: center; justify-content: center;
		background: transparent; border: none; border-radius: 4px;
		color: #5c6672; cursor: pointer; line-height: 1;
		opacity: 0; transition: opacity 0.12s, color 0.12s, background 0.12s;
	}
	.res-line:hover .copy-btn, .copy-btn.done { opacity: 1; }
	.copy-btn:hover { color: #d7dce2; background: #1e2530; }
	.copy-btn.done { color: #7ee0a3; }
	.copy-btn .ok { font-size: 12px; line-height: 1; }
	.lbl { width: 26px; font-size: 10px; color: #66707c; text-align: right; flex: 0 0 auto; }
	.res-line code {
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 13px; color: #e8edf2;
		flex: 1 1 auto; min-width: 0;
	}
	.res-line code.bin { font-size: 11px; color: #7ee0a3; letter-spacing: 0.02em; }

	/* 报错信息浮动在进制框内顶部（不占布局空间），框高不变、输入框不跳动 */
	.error-float { position: sticky; top: 0; z-index: 5; height: 0; overflow: visible; }
	/* 报错时进制解析内容模糊+降透明度，避免与报错信息重叠、增强可读性 */
	.views.has-error .band {
		filter: blur(2px) saturate(0.6);
		opacity: 0.3;
		transition: filter 0.15s, opacity 0.15s;
	}
	.error {
		display: inline-block;
		padding: 8px 12px; font-size: 13px;
		color: #ff9d8a; background: #2b1d1a; border: 1px solid #54322b;
		border-radius: 6px; font-family: ui-monospace, monospace;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	/* 历史记录面板：占据剩余空间，至少两行高度（2×22px 行高 + 头部），内部滚动 */
	.history {
		flex: 1 1 auto; min-height: 76px;
		display: flex; flex-direction: column;
		margin-top: 4px; background: #10131a; border: 1px solid #262c36;
		border-radius: 10px; padding: 8px 12px;
	}
	.hist-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex: 0 0 auto; }
	.hist-collapse-btn {
		width: 18px; height: 18px; padding: 0;
		display: inline-flex; align-items: center; justify-content: center;
		background: transparent; border: none; border-radius: 4px;
		color: #5c6672; cursor: pointer; transition: color 0.12s, background 0.12s;
	}
	.hist-collapse-btn:hover { color: #d7dce2; background: #242b35; }
	.hist-title { font-size: 12px; color: #9aa4af; }
	.hist-hint { font-size: 10px; color: #5c6672; }
	.hist-clear {
		margin-left: auto; background: transparent; border: 1px solid #2c333d;
		color: #5c6672; border-radius: 5px; font-size: 10px; padding: 1px 8px;
		cursor: pointer;
	}
	.hist-clear:hover { color: #d7dce2; border-color: #46505c; }
	.hist-list {
		list-style: none; margin: 0; padding: 0;
		flex: 1 1 auto; min-height: 0; /* 填充剩余空间，内部滚动 */
		overflow-y: auto;
		display: flex; flex-direction: column; gap: 1px;
	}
	.hist-empty {
		flex: 1 1 auto; min-height: 0;
		padding: 6px 8px; font-size: 11px; color: #4a5461;
	}
	.hist-item {
		display: flex; align-items: baseline; gap: 12px; width: 100%; text-align: left;
		background: transparent; border: none; border-radius: 5px;
		padding: 3px 8px; cursor: pointer;
		font-family: ui-monospace, 'SF Mono', Consolas, monospace;
		font-size: 12px; color: #8b95a1;
	}
	.hist-item:hover { background: #1a2029; color: #d7dce2; }
	.hist-item.current { background: #1e2b25; color: #7ee0a3; }
	.hist-expr { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.hist-res { flex: 0 0 auto; color: #5c6672; }
	.hist-res.hex-res { color: #4f7ea8; } /* hex 结果用蓝调与表达式区分 */
	.hist-item:hover .hist-res { color: #9aa4af; }
	.hist-item.current .hist-res, .hist-item.current .hist-res.hex-res { color: #7ee0a3; }
	/* Ctrl+↑ 浏览时自动缓存的当前算式行（仅临时，不写入持久历史） */
	.hist-item.draft { border-top: 1px dashed #2c333d; margin-top: 2px; padding-top: 4px; }
	.hist-draft-tag { flex: 0 0 auto; font-size: 10px; color: #4d9e6e; font-style: normal; }

	/* 进制框：预留约 32 位数字高度（hex/dec 两行 + 4 行 bin），输入时框高不变、输入框不跳动 */
	.views {
		flex: 0 0 auto;
		box-sizing: border-box;
		min-height: 120px;
		margin-top: 10px;
		background: #10131a; border: 1px solid #262c36; border-radius: 10px;
		padding: 16px 16px; overflow-x: auto;
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
		flex: 0 0 auto;
		margin-top: 10px; font-size: 11px; color: #5c6672; line-height: 1.5;
	}
</style>
