# EmbedCalc — Embedded Mixed-Radix Calculator

**[简体中文](README.md)** | English

## Quick Start

**Type an expression, get the result instantly.**

- Hexadecimal numbers use `x` or `0x` prefix: `xFF`, `0xDEADBEEF`
- Binary numbers use `b` or `0b` prefix: `b110`, `0b1010_0011`
- Decimal numbers are written directly: `255`, `1024`, or with `d` `0d` prefix
- Supports C-style operators: `+ - * / %`, `& | ^ ~`, `<< >>`, `()`

**Example**: Type `xFF + 10` and press Enter to get `265`.

![1787739503678](image/README/1787739503678.png)

### Common Operations

| Operation           | How to                                                                        |
| ------------------- | ----------------------------------------------------------------------------- |
| Calculate           | Results update instantly as you type                                          |
| Switch number radix | Move cursor inside a number, press **↑** (to higher radix) or **↓** (to lower radix) |
| Browse history      | Press **Ctrl+↑** to browse history, **Ctrl+↓** to go back, **Esc** to exit   |
| Jump between tokens | **Ctrl+← / Ctrl+→** to quickly jump to previous/next number or operator      |
| Save record         | Press **Enter** to save the expression to history                            |

### Notes

- Results are exact mathematical values with no bit-width truncation (not limited to 32/64 bits)
- Binary numbers can use `_` separator for readability: `b1010_0011_1111`
- Adjacent binary numbers separated by spaces are automatically concatenated: `b110 b11` equals `b11011`
- History is saved locally, up to 50 entries

---

## Installation

Download the installer for your platform from the [Releases page](https://github.com/spp901780/embedCalc/releases):

| Platform | Format |
|----------|--------|
| Linux (x64) | `.deb`, `.rpm` |
| macOS (Apple Silicon / Intel) | `.dmg` |
| Windows (x64) | `.msi`, `.exe` |

---

## Installation & Development

A mixed-radix calculator designed for embedded developers. Freely mix hexadecimal, decimal, and binary numbers
in the same expression, with C-style syntax for bitwise operations.

## Features

- **Mixed-radix input**: `xDEADBEEF + b110 ^ x2 << 2` — no manual conversion needed
- **Multi-radix display**: Results shown simultaneously in hex / dec / bin
- **Per-number radix switching**: Move cursor into a number, press ↑/↓ to switch between hex↔dec↔bin
- **Bit position annotations**: Binary numbers automatically show bit positions for each 8-bit group (LSB = 0)
- **Token highlighting**: Ctrl+←/→ jumps between tokens with a brief flash; linked nibble highlighting in the multi-radix view below
- **History**: Enter to save expressions, Ctrl+↑/↓ to browse history (current expression auto-cached as last line), Esc to exit
- **BigInt full precision**: No precision loss for 64-bit and larger integers, pure mathematical evaluation without bit-width truncation

## Tech Stack

| Layer   | Technology                              |
| ------- | --------------------------------------- |
| Frontend | Svelte 5 (runes), TypeScript, Vite 6   |
| Desktop | Tauri v2 (Rust + WebView)               |
| Build   | pnpm, SvelteKit adapter-static          |

## Project Structure

```
├── src/                      # Svelte frontend
│   ├── app.html              # HTML entry
│   ├── lib/calc.ts           # Core engine: tokenizer, Pratt parser, radix conversion, layout builder
│   └── routes/
│       ├── +layout.ts        # SvelteKit static adapter config
│       └── +page.svelte      # Main page: custom input, history, multi-radix view, keyboard interactions
├── src-tauri/                # Tauri desktop
│   ├── Cargo.toml            # Rust dependencies
│   ├── tauri.conf.json       # Window config, version, build targets (deb / rpm)
│   ├── capabilities/         # Tauri v2 permission declarations
│   ├── icons/                # Application icons (multi-platform)
│   └── src/
│       ├── main.rs           # Tauri entry point
│       └── lib.rs            # Tauri plugin registration
├── static/                   # Static assets (favicon, etc.)
├── image/                    # Image assets (README screenshots, app icon source)
├── .github/workflows/        # CI/CD (release.yml pipeline)
└── .vscode/                  # VS Code workspace config
```

## Getting Started

```bash
# Prerequisites: pnpm, Rust toolchain, Tauri CLI
pnpm install

# Web development mode (http://localhost:1420)
pnpm dev

# Type checking
pnpm check

# Build Tauri desktop app (deb / rpm)
pnpm tauri build

# Run Tauri desktop window in development mode
pnpm tauri dev
```

## License

MIT
