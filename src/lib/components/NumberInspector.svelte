<script lang="ts">
 import type { Chunk } from '$lib/domain/view';
 let { layout, showError, highlight, editable, onflip }: { layout: Chunk[] | null; showError: string | null; highlight: { tokenIndex: number; nibble: number | null } | null; editable: boolean; onflip: (tokenIndex: number, bit: number) => void } = $props();
 function binGroups(lines: string[], li: number) { const groups = lines[li].split('_'); return groups.map((text, gi) => ({ text, nib: (lines.length - 1 - li) * 2 + groups.length - 1 - gi })); }
</script>
	<section class="views" aria-label="数字检查" class:has-error={showError !== null}>
		{#if showError}
			<div class="error-float"><div class="error">{showError}</div></div>
		{/if}
		{#if layout}
			<div class="band">
				{#each layout ?? [] as chunk}
					{#if chunk.type === 'num'}
						<div class="num" class:hl={highlight?.tokenIndex === chunk.tokenIndex}>
							<div class="row hex">{#each [...chunk.hex] as ch, ci}<span class:hl={highlight?.tokenIndex === chunk.tokenIndex && highlight.nibble !== null && ci >= 2 && chunk.hex.length - 1 - ci === highlight.nibble}>{ch}</span>{/each}</div>
							<div class="row dec">{chunk.dec}</div>
							<div class="spacer"></div>
							{#each chunk.bin as line, li}
								<div class="binline">{#each binGroups(chunk.bin, li) as g, gi}<span class:hl={highlight?.tokenIndex === chunk.tokenIndex && g.nib === highlight?.nibble}>{#each [...g.text] as bit, bi}<button type="button" class="bit" disabled={!editable} aria-label={`数字 ${chunk.tokenIndex + 1}，位 ${g.nib * 4 + g.text.length - 1 - bi}，当前 ${bit}，翻转`} aria-pressed={bit === '1'} onclick={() => onflip(chunk.tokenIndex, g.nib * 4 + g.text.length - 1 - bi)}>{bit}</button>{/each}</span>{#if gi < line.split('_').length - 1}<span class="sep">_</span>{/if}{/each}</div>
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
<style>
 .bit { font: inherit; color: inherit; background: transparent; border: 0; border-radius: 2px; padding: 0; margin: 0; width: 1ch; cursor: pointer; vertical-align: baseline; transition: color .12s, background .12s; }
 .bit[aria-pressed='true'] { color: #b5f5ce; }
 .bit:hover:not(:disabled) { background: #42775a; color: white; }
 .bit:focus-visible { outline: 2px solid #7ec8ff; outline-offset: 1px; }
 .bit:active:not(:disabled) { background: #7ec8ff; color: #10151d; }
 .bit:disabled { cursor: not-allowed; opacity: .55; }
 @media (prefers-reduced-motion: reduce) { .bit { transition: none; } }
</style>