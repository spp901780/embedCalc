// 词法 + Pratt 解析 + BigInt 求值 + 布局模型
// 字面量: x1A / 0x1A (hex), b0110 / 0b0110 (bin), d42 / 42 (dec), u7 (dec)

export function tokenize(src) {
  const tokens = []
  let i = 0
  let numId = 0
  const isDigit = c => c >= '0' && c <= '9'
  const isHex = c => (c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')

  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t') { i++; continue }

    // 数字字面量
    let base = null, start = i
    if ((c === 'x' || c === 'X') && i + 1 < src.length && isHex(src[i + 1])) { base = 16; i++ }
    else if ((c === 'b' || c === 'B') && i + 1 < src.length && (src[i + 1] === '0' || src[i + 1] === '1')) { base = 2; i++ }
    else if ((c === 'd' || c === 'D' || c === 'u' || c === 'U') && i + 1 < src.length && isDigit(src[i + 1])) { base = 10; i++ }
    else if (c === '0' && i + 1 < src.length && (src[i + 1] === 'x' || src[i + 1] === 'X')) { base = 16; i += 2 }
    else if (c === '0' && i + 1 < src.length && (src[i + 1] === 'b' || src[i + 1] === 'B')) { base = 2; i += 2 }
    else if (isDigit(c)) { base = 10 }

    if (base !== null) {
      const dstart = i
      while (i < src.length && (isHex(src[i]) || src[i] === '_')) i++
      const digits = src.slice(dstart, i).replace(/_/g, '')
      if (!digits) throw new Error(`位置 ${start + 1}: 缺少数字`)
      let value
      try { value = BigInt(base === 16 ? '0x' + digits : base === 2 ? '0b' + digits : digits) }
      catch { throw new Error(`位置 ${start + 1}: "${src.slice(start, i)}" 不是合法的 ${base} 进制数字`) }
      tokens.push({ kind: 'num', id: numId++, value, text: src.slice(start, i) })
      continue
    }

    // 运算符
    const two = src.slice(i, i + 2)
    if (two === '<<' || two === '>>') { tokens.push({ kind: 'op', text: two }); i += 2; continue }
    if ('+-*/%&|^~()'.includes(c)) {
      tokens.push({ kind: c === '(' ? 'lparen' : c === ')' ? 'rparen' : 'op', text: c })
      i++; continue
    }
    throw new Error(`位置 ${i + 1}: 无法识别的字符 "${c}"`)
  }
  return tokens
}

// C 优先级
const BP = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 }

export function parse(tokens, width) {
  let pos = 0
  const mask = (1n << BigInt(width)) - 1n
  const trunc = v => v & mask
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function expr(minBp) {
    let t = next()
    let lhs
    if (!t) throw new Error('表达式意外结束')
    if (t.kind === 'num') lhs = trunc(t.value)
    else if (t.kind === 'lparen') {
      lhs = expr(0)
      const r = next()
      if (!r || r.kind !== 'rparen') throw new Error('缺少右括号')
    } else if (t.kind === 'op' && t.text === '-') lhs = trunc(-expr(7))
    else if (t.kind === 'op' && t.text === '~') lhs = trunc(~expr(7))
    else if (t.kind === 'op' && t.text === '+') lhs = expr(7)
    else throw new Error(`意外的 "${t.text}"`)

    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'op' || t.text === '(' || t.text === ')') break
      const bp = BP[t.text]
      if (bp === undefined || bp < minBp) break
      next()
      const rhs = expr(bp + 1)
      lhs = apply(t.text, lhs, rhs)
    }
    return lhs
  }

  function apply(op, a, b) {
    switch (op) {
      case '+': return trunc(a + b)
      case '-': return trunc(a - b)
      case '*': return trunc(a * b)
      case '/': if (b === 0n) throw new Error('除以零'); return trunc(a / b)
      case '%': if (b === 0n) throw new Error('对零取模'); return trunc(a % b)
      case '<<': return trunc(a << (b & 63n))
      case '>>': return trunc(a >> (b & 63n))
      case '&': return trunc(a & b)
      case '|': return trunc(a | b)
      case '^': return trunc(a ^ b)
      default: throw new Error(`未知运算符 ${op}`)
    }
  }

  const v = expr(0)
  if (pos < tokens.length) throw new Error(`"${tokens[pos].text}" 之后的内容无法解析`)
  return v
}

// ---------- 显示 ----------

function groupBin(bits) {
  // 从右往左每 4 位加下划线: "1101101" -> "110_1101"
  let out = '', n = 0
  for (let i = bits.length - 1; i >= 0; i--) {
    out = bits[i] + out
    if (++n % 4 === 0 && i > 0) out = '_' + out
  }
  return out
}

export function binLines(value) {
  // 底行 = bit[7:0], 顶行 = 最高有效位; 返回从顶到底的字符串数组
  const bits = value.toString(2)
  const lines = []
  for (let hi = bits.length; hi > 0; hi -= 8) {
    lines.unshift(groupBin(bits.slice(Math.max(0, hi - 8), hi)))
  }
  return lines
}

export function hexText(v) { return '0x' + v.toString(16).toUpperCase() }
export function decText(v) { return v.toString(10) }

// 布局模型: token 流 -> 渲染块
export function buildLayout(tokens) {
  return tokens.map(t =>
    t.kind === 'num'
      ? { type: 'num', id: t.id, hex: hexText(t.value), dec: decText(t.value), bin: binLines(t.value) }
      : { type: 'op', text: t.text }
  )
}
