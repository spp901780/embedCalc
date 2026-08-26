# EmbedCalc — 嵌入式混合进制计算器

为嵌入式开发者设计的混合进制计算器，支持在同一个算式中自由混用十六进制、十进制和二进制数，  
并以 C 语言风格语法进行位运算求值。

## 特性

- **混合进制输入**：`xDEADBEEF + b110 ^ x2 << 2`，无需手动转换
- **多进制并显**：结果同时显示 hex / dec / bin 三种进制
- **逐数字进制切换**：光标移入数字，按 ↑/↓ 在 hex↔dec↔bin 间切换
- **位号标注**：二进制数字下方自动标注每 8 位分组的位号（LSB = 0）
- **词元高亮**：Ctrl+←/→ 跳转词元，目标短暂闪烁；联动下方多进制视图的 nibble 高亮
- **历史记录**：Enter 保存算式，Ctrl+↑/↓ 浏览历史（当前算式自动缓存到末行），Esc 退出
- **BigInt 全精度**：64 位及以上整数无精度丢失，纯数学求值无位宽截断

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Svelte 5（runes）、TypeScript、Vite 6 |
| 桌面 | Tauri v2（Rust + WebView） |
| 构建 | pnpm、SvelteKit adapter-static |

前端总大小 ~18 KB gzip，无外部 UI 依赖。

## 项目结构

```
├── src/                    # Svelte 前端
│   ├── lib/calc.ts         # 核心引擎：词法分析、Pratt 解析器、进制转换、布局构建
│   └── routes/
│       ├── +layout.ts      # SvelteKit 静态 adapter 配置
│       └── +page.svelte    # 主页面：自绘输入框、历史记录、多进制视图、键盘交互
├── src-tauri/              # Tauri 桌面端
│   ├── Cargo.toml          # Rust 依赖
│   ├── tauri.conf.json     # 窗口配置（最小 720×560）、打包目标（deb / rpm）
│   ├── capabilities/       # Tauri v2 权限声明
│   └── src/
│       ├── main.rs         # Tauri 入口
│       └── lib.rs          # Tauri 插件注册
├── static/                 # 静态资源
├── docs/                   # 原型交接文档（Kimi Agent 生成的初版参考）
└── .vscode/                # VS Code 工作区配置
```

## 快速开始

```bash
# 前置条件：pnpm、Rust toolchain、Tauri CLI
pnpm install

# Web 开发模式（http://localhost:1420）
pnpm dev

# 类型检查
pnpm check

# 构建 Tauri 桌面应用（deb / rpm）
pnpm tauri build

# 开发模式启动 Tauri 桌面窗口
pnpm tauri dev
```

## 键盘快捷键

| 快捷键 | 作用 |
|---|---|
| `↑` / `↓` | 光标在数字内：切换进制（hex→dec→bin，不循环） |
| `Ctrl+←` / `Ctrl+→` | 跳转到上/下一个词元 |
| `Ctrl+↑` / `Ctrl+↓` | 浏览历史记录（当前算式自动缓存到末行） |
| `Enter` | 保存当前算式到历史 |
| `Esc` | 退出历史浏览，恢复原算式 |

## 数字前缀约定

| 前缀 | 进制 | 示例 |
|---|---|---|
| `x` 或 `0x` | 十六进制 | `xFF`, `0xDEADBEEF` |
| `b` 或 `0b` | 二进制 | `b110`, `0b1010_0011` |
| （无前缀） | 十进制 | `255`, `1024` |

支持 `_` 作为数字分隔符：`b1010_0011`、`xFFFF_FFFF`。

## License

MIT
