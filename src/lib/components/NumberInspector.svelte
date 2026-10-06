<script lang="ts">
 import type { Chunk } from '$lib/domain/view';
 let { layout, showError, highlight }: { layout: Chunk[] | null; showError: string | null; highlight: { tokenIndex: number; nibble: number | null } | null } = $props();
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