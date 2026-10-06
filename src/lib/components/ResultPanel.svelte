<script lang="ts">
 import { hexText, decText, humanSize } from '$lib/calc';
 let { result, binary, copied, copyResult }: { result: bigint | null; binary: string[]; copied: string | null; copyResult: (text: string, key: string) => void } = $props();
</script>
		{#if result !== null}
			{@const r = result!}
			<div class="result" role="region" aria-label="计算结果">
				<!-- 当前结果同时显示三种进制（报错时保留最后结果，面板高度不变）；各行 hover 浮现一键复制 -->
			<div class="res-lines">
				<div class="res-line">
					<span class="lbl">hex</span><code>{hexText(r)}</code>
     {#if humanSize(r)}
      <span class="res-size" title="按 1024 进制换算的大小">≈ {humanSize(r)}</span>
     {/if}
					<button class="copy-btn" class:done={copied === 'hex'} aria-label="复制 hex 结果" title="复制 hex 结果" onclick={() => copyResult(hexText(r), 'hex')}>
						{#if copied === 'hex'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
				<div class="res-line">
					<span class="lbl">dec</span><code>{decText(r)}</code>
					<button class="copy-btn" class:done={copied === 'dec'} aria-label="复制 dec 结果" title="复制 dec 结果" onclick={() => copyResult(decText(r), 'dec')}>
						{#if copied === 'dec'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
				<div class="res-line">
					<span class="lbl">bin</span><code class="bin">{binary.join(' ')}</code>
					<button class="copy-btn" class:done={copied === 'bin'} aria-label="复制 bin 结果" title="复制 bin 结果" onclick={() => copyResult(binary.join(' '), 'bin')}>
						{#if copied === 'bin'}<span class="ok">✓</span>{:else}<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>{/if}
					</button>
				</div>
			</div>
			</div>
		{:else}
			<!-- 占位：保持 input-row 行高恒定，结果面板出现/消失时输入框不跳动 -->
			<div class="result result-placeholder" aria-hidden="true"></div>
		{/if}