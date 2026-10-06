<script lang="ts">
 import { onDestroy } from 'svelte';
 import '$lib/workbench.css';
 import Titlebar from '$lib/components/Titlebar.svelte';
 import HistoryPanel from '$lib/components/HistoryPanel.svelte';
 import ResultPanel from '$lib/components/ResultPanel.svelte';
 import NumberInspector from '$lib/components/NumberInspector.svelte';
 import ExpressionEditor from '$lib/components/ExpressionEditor.svelte';
 import { joinBinary, changeBase, tokenJump } from '$lib/state/editor';
 import { older, newer, exit, recall, type HistoryNavigation } from '$lib/state/history';
 import { evaluate } from '$lib/domain/evaluate';
 import { HIST_KEY, RATIO_KEY, decodeHistory, decodeRatio, readStorage, writeStorage, appendHistory, resultIsHex, type HistEntry } from '$lib/state/persistence';
 let storageWarning = $state('');
 let copyError = $state('');
 let copyNotice = $state('');
 let historyScrollTimer: ReturnType<typeof setTimeout> | undefined;
	import {
		buildLayout, hexText, decText,
		locateNum,
		type Base
	} from '$lib/calc';

	let expr = $state('xDEADBEEF + b110 ^ x2 << 2');
	// 逻辑光标的物理载体：字符偏移。进制切换时经 (token, digitFromRight) 换算保持位置
	let cursor = $state(0);
	let focused = $state(false);
	let inputEl: HTMLTextAreaElement | undefined = $state();
	// 选区：anchor 为选区起点（null = 无选区），cursor 为另一端
	let selAnchor = $state<number | null>(null);
	function clearSel() { selAnchor = null; }
	// 位置记忆：tokenIndex -> 各进制下的逻辑位（从右数）
	const digitMem = new Map<number, Partial<Record<Base, number>>>();

	// ---------- 输入/结果 分栏宽度（拖动分隔条调整，持久化到 localStorage） ----------
 let splitRatio = $state(decodeRatio(readStorage(RATIO_KEY)));
 function persistRatio() { if (!writeStorage(RATIO_KEY, String(splitRatio))) storageWarning = '无法保存分栏设置'; }
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
	let history = $state<HistEntry[]>(decodeHistory(readStorage(HIST_KEY)));
	// -1 = 正常编辑态；-2 = 浏览中的草稿行（自动缓存，永不入库）；>=0 = 浏览历史第 i 条
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

 $effect(() => {
  const resize = () => { histAutoCollapsed = window.innerHeight < 360; };
  resize(); window.addEventListener('resize', resize);
  return () => window.removeEventListener('resize', resize);
 });

 function persistHistory() { if (!writeStorage(HIST_KEY, JSON.stringify(history))) storageWarning = '历史仅保存在内存中：无法写入存储'; }
	// Enter：求值成功且表达式非空时存入历史（去重、时间序旧→新、最多 50 条），结果一并记录
	function saveToHistory(e: string, result: bigint) {
		const t = e.trim();
		if (!t) return;
		const hex = resultIsHex(tokens);
		const entry: HistEntry = { expr: t, res: (hex ? hexText : decText)(result), hex };
		history = appendHistory(history, entry);
		histPos = -1; browsing = false;
		if (t === draft) draft = ''; // 草稿已正式保存 → 缓存行清空
		persistHistory();
		// 去重时长度可能不变，兜底确保滚到最新
		clearTimeout(historyScrollTimer);
		historyScrollTimer = setTimeout(() => { if (histListEl) histListEl.scrollTop = histListEl.scrollHeight; }, 0);
	}
 function navigation(): HistoryNavigation { return { pos: histPos, draft, browsing, expr }; }
 function applyNavigation(next: HistoryNavigation) { histPos = next.pos; draft = next.draft; browsing = next.browsing; expr = next.expr; cursor = expr.length; clearSel(); digitMem.clear(); }
 function histOlder() { if (!history.length) return; applyNavigation(older(history, navigation())); }
 function histNewer() { if (!browsing) return; applyNavigation(newer(history, navigation())); }
 function exitBrowse() { if (!browsing) return; applyNavigation(exit(navigation())); }
 function clickHistoryItem(i: number) { applyNavigation(recall(history, navigation(), i)); inputEl?.focus(); }
	function clearHistory() {
		if (!window.confirm("清空所有历史记录？")) return;
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

	// ---------- 结果一键复制（hex/dec/bin 各行右侧，复制成功短暂变 ✓） ----------
	let copied = $state<string | null>(null);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;
	async function copyResult(text: string, key: string) {
		try { await navigator.clipboard.writeText(text); copyError = ""; copyNotice = "已复制结果"; } catch { copyNotice = ""; copyError = "复制失败，请选择结果并使用系统复制"; return; }
		clearTimeout(copyTimer);
		copied = key;
		copyTimer = setTimeout(() => { copied = null; copyNotice = ""; }, 1200);
	}

	// ---------- 词元短暂高亮（Ctrl+←/→ 跳词后提示目标） ----------
	let flashToken = $state<number | null>(null);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	function flash(ti: number) {
		clearTimeout(flashTimer);
		flashToken = ti;
		flashTimer = setTimeout(() => { flashToken = null; }, 500);
	}


 let calc = $derived(evaluate(expr));
 let tokens = $derived(calc.tokens);
 let lastLayout = $state<ReturnType<typeof buildLayout> | null>(null);
 let lastResult = $state<bigint | null>(null);
 let lastBinary = $state<string[]>([]);
 let showError = $derived(calc.error);
 $effect(() => {
  if (calc.status === 'valid') { lastLayout = calc.layout; lastResult = calc.result; lastBinary = calc.binary; }
 });
 let displayedResult = $derived(calc.status === 'empty' ? null : calc.result ?? lastResult);
 let displayedLayout = $derived(calc.status === 'empty' ? null : calc.layout ?? lastLayout);
 let displayedBinary = $derived(calc.result !== null ? calc.binary : lastBinary);
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

 function autoJoin() { const next = joinBinary(expr, cursor); expr = next.expr; cursor = next.cursor; }
 function cycleBase(dir: 1 | -1) { const next = changeBase(expr, cursor, dir, digitMem); expr = next.expr; cursor = next.cursor; }
 function wordJump(dir: -1 | 1) { const next = tokenJump(expr, cursor, dir); cursor = next.cursor; if (next.token !== null) flash(next.token); }
 function onKeydown(e: KeyboardEvent) {
  if (e.metaKey || e.altKey || e.isComposing) return;
  if (e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
   if (e.shiftKey && selAnchor === null) selAnchor = cursor;
   wordJump(e.key === 'ArrowLeft' ? -1 : 1);
   if (!e.shiftKey) clearSel();
  } else if (e.ctrlKey && e.key === 'ArrowUp') { histOlder(); clearSel(); }
  else if (e.ctrlKey && e.key === 'ArrowDown') { histNewer(); clearSel(); }
  else if (!e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { cycleBase(e.key === 'ArrowUp' ? -1 : 1); clearSel(); }
  else if (e.key === 'Escape') { exitBrowse(); clearSel(); }
  else if (e.key === 'Enter') { if (calc.status === 'valid' && calc.result !== null) saveToHistory(expr, calc.result); }
  else return;
  e.preventDefault();
 }
 function onNativeEdit() { histPos = -1; browsing = false; digitMem.clear(); autoJoin(); }
 onDestroy(() => { clearTimeout(copyTimer); clearTimeout(flashTimer);  });
</script>

<svelte:head>
	<title>EmbedCalc - 混合进制计算器</title>
</svelte:head>

<main>
 <Titlebar {histCollapsed} expandHistory={() => { histManualCollapse = false; histAutoCollapsed = false; }} selectPreset={(value) => { expr = value; histPos = -1; browsing = false; cursor = value.length; clearSel(); digitMem.clear(); inputEl?.focus(); }} />

	<!-- 历史面板：展开态显示完整面板(头部+列表)，折叠态完全隐藏(控制项已并入标题栏) -->

 <div id="calc-status" class="status" role="status" aria-live="polite">
  {calc.status === 'empty' ? '输入算式开始计算' : calc.status === 'preview' ? '预览 · 算式未完成，不能保存' : calc.status === 'error' ? `错误 · ${calc.error}` : '有效 · Enter 保存'}
  {#if calc.result === null && displayedResult !== null} · 显示上次有效结果（已过期）{/if}
  {#if storageWarning} · {storageWarning}{/if}{#if copyError} · {copyError}{/if}{#if copyNotice} · {copyNotice}{/if}
 </div>
 <div class="base-actions"><button onclick={() => { cycleBase(-1); clearSel(); inputEl?.focus(); }}>↑ 向 hex 切换</button><button onclick={() => { cycleBase(1); clearSel(); inputEl?.focus(); }}>↓ 向 bin 切换</button></div>
	<div class="input-row" bind:this={rowEl} class:dragging>
  <ExpressionEditor bind:expr bind:cursor bind:selAnchor bind:focused bind:inputEl ratio={splitRatio} flashToken={flashToken} invalid={calc.status === 'error'} onkeydown={onKeydown} onedit={onNativeEdit} />
		<!-- 可拖动分隔条：调整输入框/结果框宽度比例，支持键盘 ←/→ 微调 -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="splitter"
			role="separator"
			aria-orientation="vertical"
            aria-valuemin={30} aria-valuemax={70} aria-valuenow={Math.round(splitRatio * 100)}
			aria-label="调整输入框与结果框宽度"
			tabindex="0"
			title="拖动调整左右宽度"
			onpointerdown={onSplitterDown}
			onpointermove={onSplitterMove}
			onpointerup={onSplitterUp}
			onpointercancel={onSplitterUp}
            onlostpointercapture={onSplitterUp}
			onkeydown={onSplitterKey}
		><div class="splitter-grip"></div></div>
  <ResultPanel result={displayedResult} binary={displayedBinary} {copied} {copyResult} />
	</div>

	<!-- 进制框常驻渲染：报错时保留最后布局、顶部浮出报错条，保持框高不变，避免输入框上下跳动 -->
	<NumberInspector layout={displayedLayout} {showError} {highlight} />

 <HistoryPanel {histCollapsed} {history} {histPos} {browsing} {draft} bind:histListEl collapse={() => histManualCollapse = true} {clearHistory} {clickHistoryItem} restoreDraft={() => { histPos = -2; expr = draft; cursor = expr.length; clearSel(); inputEl?.focus(); }} />

	<footer>
		光标移到数字内部，按 ↑/↓ 切换该数字进制·
		Shift+←/→ 或鼠标拖选选中文本 · Ctrl+←/→ 快速跳转词元 ·
		Ctrl+↑/↓ 翻阅历史记录 · Enter 保存算式到历史 · Esc 退出历史浏览
	</footer>
</main>
