<script lang="ts">
 import type { HistEntry } from '$lib/state/persistence';
 let { histCollapsed, history, histPos, browsing, draft, histListEl = $bindable<HTMLUListElement | undefined>(), collapse, clearHistory, clickHistoryItem, restoreDraft }: {
 histCollapsed: boolean; history: HistEntry[]; histPos: number; browsing: boolean; draft: string; histListEl: HTMLUListElement | undefined;
 collapse: () => void; clearHistory: () => void; clickHistoryItem: (i: number) => void; restoreDraft: () => void;
 } = $props();
</script>
	{#if !histCollapsed}
		<section class="history" aria-label="历史记录">
			<div class="hist-head">
				<button class="hist-collapse-btn" title="折叠历史记录" onclick={collapse}>
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
								onclick={restoreDraft}
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
