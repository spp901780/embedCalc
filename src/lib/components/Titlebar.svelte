<script lang="ts">
 import { onDestroy } from 'svelte';
 import { isTauri, windowAction, setPinned, titlebarEligible } from '$lib/state/window';
 let { histCollapsed, expandHistory, selectPreset }: { histCollapsed: boolean; expandHistory: () => void; selectPreset: (value: string) => void } = $props();
 let presetMenuOpen = $state(false);
 let presetCloseTimer: ReturnType<typeof setTimeout> | undefined;
 function openPreset() { clearTimeout(presetCloseTimer); presetMenuOpen = true; }
 function scheduleClosePreset() { presetCloseTimer = setTimeout(() => { presetMenuOpen = false; }, 150); }
 onDestroy(() => clearTimeout(presetCloseTimer));
	// ---------- 自绘标题栏：窗口控制 + 手动拖拽（Tauri 桌面端专属，浏览器中隐藏） ----------
 let pinned = $state(false);
 async function togglePin() { if (await setPinned(!pinned)) pinned = !pinned; }
 const winMinimize = () => windowAction('minimize');
 const winClose = () => windowAction('close');
 function onTitlebarDown(e: MouseEvent) { if (titlebarEligible(e)) void windowAction('startDragging'); }
 function onTitlebarDbl(e: MouseEvent) { if (titlebarEligible(e)) void windowAction('toggleMaximize'); }
	const presets: [string, string][] = [
		['寄存器位操作', 'xDEADBEEF + b110 ^ x2 << 2'],
		['GPIO 配置', '(x1 << 5) | (x3 << 10) | b101'],
		['地址计算', 'x40000000 + x204*4 + 13'],
		['掩码组合', '~xFF & x12345678 | b1111_0000 << 8'],
		['64 位取值', 'x123456789ABCDEF0 >> 8 & xFFFFFFFF'],
		['字符运算', "'A' ^ x20"],
	];
</script>
	<!-- 自绘标题栏(无边框窗口):左侧标题+折叠态历史控制,右侧示例+窗口按钮 -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="titlebar" onmousedown={onTitlebarDown} ondblclick={onTitlebarDbl}>
		<span class="titlebar-name">EmbedCalc</span>
		{#if histCollapsed}
			<button class="titlebar-btn icon" title="展开历史记录" onclick={expandHistory}>
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
							<button onclick={() => { selectPreset(p); presetMenuOpen = false; }}>{name}</button>
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
