<script>
  import { tokenize, parse, buildLayout, hexText, decText, binLines } from './lib/calc.js'

  let expr = $state('xDEADBEEF + b110 ^ x2 << 2')
  let width = $state(32)

  const presets = [
    ['寄存器位操作', 'xDEADBEEF + b110 ^ x2 << 2'],
    ['GPIO 配置', '(x1 << 5) | (x3 << 10) | b101'],
    ['地址计算', 'x40000000 + x204*4 + 13'],
    ['掩码组合', '~xFF & x12345678 | b1111_0000 << 8'],
    ['64 位取值', 'x123456789ABCDEF0 >> 8 & xFFFFFFFF'],
  ]

  let derived = $derived.by(() => {
    try {
      const tokens = tokenize(expr)
      if (tokens.length === 0) return { layout: [], result: null, error: null }
      const value = parse(tokens, width)
      return { layout: buildLayout(tokens), result: value, error: null }
    } catch (e) {
      return { layout: null, result: null, error: e.message }
    }
  })
</script>

<main>
  <header>
    <h1>嵌入式混合进制计算器 <span class="tag">排版原型</span></h1>
    <label class="width-sel">
      位宽
      <select bind:value={width}>
        <option value={8}>8</option>
        <option value={16}>16</option>
        <option value={32}>32</option>
        <option value={64}>64</option>
      </select>
    </label>
  </header>

  <div class="presets">
    {#each presets as [name, p]}
      <button onclick={() => { expr = p; if (name === '64 位取值') width = 64 }}>{name}</button>
    {/each}
  </div>

  <div class="input-row">
    <input
      class="expr-input"
      bind:value={expr}
      spellcheck="false"
      placeholder="x1A + b0110 ^ u2 << 2"
    />
    {#if derived.result !== null && derived.result !== undefined}
      <div class="result" title="计算结果">
        <div class="res-line"><span class="lbl">hex</span><code>{hexText(derived.result)}</code></div>
        <div class="res-line"><span class="lbl">dec</span><code>{decText(derived.result)}</code></div>
        <div class="res-line"><span class="lbl">bin</span><code class="bin">{binLines(derived.result).join(' ')}</code></div>
      </div>
    {/if}
  </div>

  {#if derived.error}
    <div class="error">{derived.error}</div>
  {/if}

  {#if derived.layout}
    <section class="views">
      <div class="band">
        {#each derived.layout as chunk}
          {#if chunk.type === 'num'}
            <div class="num">
              <div class="row hex">{chunk.hex}</div>
              <div class="row dec">{chunk.dec}</div>
              <div class="spacer"></div>
              {#each chunk.bin as line}
                <div class="binline">{line}</div>
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
    hex/dec 顶行连续 · bin 窄字多行、每行 8 位、块内右对齐、带内底对齐 —— 同一行带中所有数字的 bit 0 在同一水平线上
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
  .tag {
    font-size: 11px; font-weight: 500; color: #7ee0a3;
    border: 1px solid #2e5540; border-radius: 4px; padding: 1px 6px;
    vertical-align: middle;
  }
  .width-sel { margin-left: auto; font-size: 13px; color: #9aa4af; }
  select {
    background: #1d2128; color: #d7dce2; border: 1px solid #333a44;
    border-radius: 6px; padding: 3px 8px; margin-left: 6px;
  }

  .presets { display: flex; gap: 8px; flex-wrap: wrap; margin: 14px 0 10px; }
  .presets button {
    background: #1d2128; color: #9aa4af; border: 1px solid #2c333d;
    border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer;
  }
  .presets button:hover { color: #d7dce2; border-color: #46505c; }

  .input-row { display: flex; gap: 12px; align-items: stretch; }
  .expr-input {
    flex: 1; min-width: 0; box-sizing: border-box;
    background: #10131a; color: #e8edf2;
    border: 1px solid #333a44; border-radius: 8px;
    padding: 12px 14px; font-size: 17px;
    font-family: ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, monospace;
    outline: none;
  }
  .expr-input:focus { border-color: #4d9e6e; }

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
  .num, .op { display: flex; flex-direction: column; }
  .num {
    border-radius: 6px; padding: 2px 4px;
    transition: background 0.12s;
  }
  .num:hover { background: #1a2220; }
  .row {
    height: 1.55em; line-height: 1.55em;
    text-align: right; white-space: pre;
  }
  .hex { color: #7ec8ff; }
  .dec { color: #e8c07d; }
  .spacer { flex: 1; min-height: 2px; }
  .binline {
    font-size: 0.72em; line-height: 1.5em; height: 1.5em;
    letter-spacing: 0.02em;
    text-align: right; white-space: pre;
    color: #7ee0a3;
  }
  .op .row { color: #8b95a1; text-align: center; padding: 0 1px; }

  footer {
    margin-top: 26px; font-size: 12px; color: #5c6672; line-height: 1.7;
  }
</style>
