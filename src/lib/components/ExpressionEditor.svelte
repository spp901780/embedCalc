<script lang="ts">
 import { tokenize, bitMarkPositions, locateNum, type Token } from '$lib/calc';
 import { basePreviews, truncatePreview } from '$lib/state/editor';
 let { expr = $bindable(''), cursor = $bindable(0), selAnchor = $bindable<number | null>(null), focused = $bindable(false), inputEl = $bindable<HTMLTextAreaElement | undefined>(), ratio, invalid, flashToken, onkeydown, onedit }: {
  expr: string; cursor: number; selAnchor: number | null; focused: boolean; inputEl: HTMLTextAreaElement | undefined;
  ratio: number; invalid: boolean; flashToken: number | null; onkeydown: (e: KeyboardEvent) => void; onedit: () => void;
 } = $props();
 let composing = $state(false);
 let scroll = $state(0);
 let tokens = $derived.by((): Token[] => { try { return tokenize(expr); } catch { return []; } });
 let segments = $derived.by(() => {
  const result: { text: string; kind: string; index?: number }[] = []; let end = 0;
  for (const [index, token] of tokens.entries()) {
   result.push({ text: expr.slice(end, token.start), kind: 'gap' }, { text: token.text, kind: token.kind === 'num' ? `b${token.base}` : 'op', index }); end = token.end;
  }
  result.push({ text: expr.slice(end), kind: 'gap' }); return result;
 });
 let active = $derived(locateNum(tokens, cursor));
 let preview = $derived(focused && !composing ? basePreviews(expr, cursor) : null);
 function selection() {
  if (!inputEl) return;
  const { selectionStart: start, selectionEnd: end, selectionDirection: direction } = inputEl;
  cursor = direction === 'backward' ? start : end;
  selAnchor = start === end ? null : direction === 'backward' ? end : start;
 }
 function input() {
  if (!inputEl) return;
  expr = inputEl.value.replace(/\s*[\r\n]+\s*/g, ' '); selection();
  cursor = Math.min(cursor, expr.length); if (selAnchor !== null) selAnchor = Math.min(selAnchor, expr.length);
  if (!composing) onedit();
 }
 $effect(() => {
  const value = expr, position = cursor, anchor = selAnchor, el = inputEl;
  if (!el || composing) return;
  if (el.value !== value) el.value = value;
  const start = Math.min(anchor ?? position, position), end = Math.max(anchor ?? position, position);
  if (el.selectionStart !== start || el.selectionEnd !== end) el.setSelectionRange(start, end, anchor !== null && position < anchor ? 'backward' : 'forward');
 });
</script>
<div class="editor" class:invalid style="flex: 0 1 calc({ratio * 100}% - 8px)">
 <div class="display" aria-hidden="true" style="transform: translateX(-{scroll}px)">
  {#if preview}
   {#each [{ text: preview.up, direction: 'up' }, { text: preview.down, direction: 'down' }] as hint}
    {#if hint.text !== null}<span class="preview {hint.direction}" style="left: calc(12px + {preview.start + preview.width / 2} * 1ch); width: {Math.max(2, preview.width)}ch">{truncatePreview(hint.text, preview.width)}</span>{/if}
   {/each}
  {/if}
  <span class="expression-text">{#each segments as segment}<span class={segment.kind} class:flash={segment.index === flashToken} class:active={segment.index === active?.index && focused}>{segment.text}</span>{/each}</span>
  {#each tokens as token}{#if token.base === 2}{#each bitMarkPositions(token.text) as mark}<span class="bitmark-anchor" style="left: calc(12px + {token.start + mark.pos} * 1ch)"><small>{mark.count}</small></span>{/each}{/if}{/each}
 </div>
 <textarea placeholder="输入算式，如 (x1 << 5) | b101 · Enter 保存" bind:this={inputEl} aria-label="算式输入" aria-describedby="calc-status" aria-invalid={invalid} rows="1" wrap="off" spellcheck="false" autocapitalize="off" autocomplete="off"
  oninput={input} onselect={selection} onclick={selection} onkeyup={selection}
  onkeydown={(event) => { if (!composing && !event.isComposing) onkeydown(event); }}
  oncompositionstart={() => composing = true} oncompositionend={() => { composing = false; input(); }}
  onscroll={() => { scroll = inputEl?.scrollLeft ?? 0; }} onfocus={() => focused = true} onblur={() => focused = false}
 ></textarea>
</div>
<style>
 .editor { position: relative; min-width: 0; min-height: 88px; box-sizing: border-box; overflow: hidden; border: 1px solid #34404f; border-radius: 8px; background: #10151d; }
 .editor:focus-within { border-color: #7ec8ff; box-shadow: 0 0 0 2px #7ec8ff22; }
 .editor.invalid { border-color: #f09083; }
 .display, textarea { box-sizing: border-box; margin: 0; padding: 24px 12px 26px; font: 17px/1.5 ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace; letter-spacing: 0; tab-size: 4; white-space: pre; }
 .display { position: absolute; inset: 0; padding: 0; white-space: normal; pointer-events: none; color: #e8edf2; }
 .expression-text { position: absolute; top: 24px; left: 12px; white-space: pre; }
 textarea { position: absolute; inset: 0; width: 100%; height: 100%; resize: none; border: 0; outline: none; background: transparent; color: transparent; caret-color: #e8edf2; overflow: auto; }
 textarea::selection { background: #4277aa66; color: transparent; }
 textarea::placeholder { color: #8496ac; font: 12px/2.125 system-ui, sans-serif; opacity: 1; }
 .b16 { color: #7ec8ff; } .b2 { color: #7ee0a3; } .b10 { color: #e8c07d; } .op { color: #c3cbd6; }
 .active { background: #7ec8ff15; } .flash { animation: flash 0.5s ease-out; }
 @keyframes flash { from { background: #7ec8ff55; } to { background: transparent; } }
 .preview { position: absolute; transform: translateX(-50%); text-align: center; overflow: hidden; white-space: pre; font: inherit; line-height: 16px; color: #a6bbce; opacity: .35; animation: preview-in .15s ease-out; }
 .preview.up { top: 5px; } .preview.down { top: 51px; }
 @keyframes preview-in { from { opacity: 0; } to { opacity: .35; } }
 @media (prefers-reduced-motion: reduce) { .preview, .flash { animation: none; } }
 .bitmark-anchor { position: absolute; top: 70px; font: inherit; line-height: 12px; color: #8895a6; }
 small { display: block; font-size: 10px; line-height: 12px; }
 @media (max-width: 640px) { .editor { flex: none !important; width: 100%; } }
 @media (forced-colors: active) { .display { display: none; } textarea { color: CanvasText; caret-color: CanvasText; } }
</style>
