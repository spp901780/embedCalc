# EmbedCalc 项目导读

## 项目目的

EmbedCalc 是面向嵌入式开发场景的混合进制表达式计算器。它让使用者在同一算式中书写十六进制、十进制和二进制数，并使用接近 C 语言的算术、移位和位运算符计算寄存器值、掩码和地址。

项目同时提供浏览器版和桌面版。两者共用 Svelte 前端；桌面版由 Tauri v2 将静态前端装入原生窗口。计算在客户端完成，不依赖应用服务器或远端计算 API。

## 总体架构

```text
用户输入
   │
   ▼
src/routes/+page.svelte  ── 派生状态 ──► src/lib/calc.ts
   │                                      │
   │                                      ├─ 词法分析
   │                                      ├─ Pratt 表达式解析与 BigInt 求值
   │                                      ├─ 多进制格式化
   │                                      └─ 输入视图布局模型
   │
   ├─ 输入、历史、结果和数字视图
   ├─ 浏览器能力：localStorage、Clipboard API
   └─ 桌面窗口能力（条件使用）
                  │
                  ▼
          Tauri v2 WebView 壳
          src-tauri/src/{main,lib}.rs
```

### 前端

- [src/routes/+page.svelte](../src/routes/+page.svelte) 是当前唯一主界面，负责输入编辑、即时求值状态、错误呈现、历史记录、结果复制和多进制数字视图。组件使用 Svelte 5 runes 管理响应式状态。
- 页面采用自绘输入框，而非原生 `<input>`：表达式按 token 分段着色，并由字符偏移模型绘制光标、选区、数字位号和跳词闪烁。输入、删除、粘贴、鼠标定位和键盘导航都在该组件中处理。
- 页面样式也内嵌在该 Svelte 文件中，包含历史面板折叠、可调节左右分栏以及 Tauri 无边框窗口的自绘标题栏。
- [src/routes/+layout.ts](../src/routes/+layout.ts) 关闭 SSR。页面只在浏览器/WebView 中运行，因而直接使用 `window`、`document`、`localStorage` 等浏览器 API。

### 计算引擎

[src/lib/calc.ts](../src/lib/calc.ts) 是无 UI 依赖的计算和显示辅助模块，主要职责如下：

1. `tokenize` 将字面量、运算符和括号变成 token，并记录源文本偏移；数字 token 附带 BigInt 值、书写进制和数字位起始位置。
2. `parse` 用 Pratt 解析器按 C 风格优先级求值。支持一元 `+ - ~`，二元 `+ - * / % << >> & ^ |` 和括号。
3. 所有数值运算使用 JavaScript `bigint`，不按 8/16/32/64 位自动截断。左移上限为 2048 位；除零、负数左移量、过大左移量等作为错误抛出。
4. 格式化函数生成 hex、dec、bin 文本及分组布局。负结果的二进制显示采用最小字节对齐的补码；二进制结果显示限制为 2048 位。
5. 光标辅助函数在源字符串位置、数字逻辑位和 nibble 高亮间换算，供界面切换进制及联动高亮使用。

支持的数字写法包括 `xFF` / `0xFF`（十六进制）、`b1010` / `0b1010`（二进制）、`42` / `d42` / `u42`（十进制）以及单字符形式如 `'A'`、`'\\n'`。数字可用 `_` 分组。

## 一次输入的处理流程

1. 用户编辑 `expr`，组件的派生状态对其调用 `tokenize`。
2. 词法成功后，页面对尚未闭合的尾部输入作宽容处理：末尾二元运算符和末尾左括号会暂时从求值 token 中移除，以便用户输入过程中仍能看到前缀表达式的结果。
3. `parse` 返回 BigInt，`buildLayout` 为输入中的数字构建多进制视图数据；右侧结果区域将最终值分别格式化为 hex、dec、bin。
4. 词法或语法错误显示在视图上方。页面保留最近一次成功求值的布局与结果，避免输入过程中布局突然消失。
5. 按 Enter 时，仅当当前表达式有成功结果才会写入历史。

## 用户状态与持久化

状态全部保存在客户端：

| 内容 | 存储方式 | 行为 |
| --- | --- | --- |
| 表达式历史 | `localStorage` 的 `embedcalc.history` | 最多 50 条；相同表达式去重后移到最新；保存表达式、结果及结果显示进制 |
| 左右栏宽度 | `localStorage` 的 `embedcalc.splitRatio` | 允许比例为 0.3–0.7，默认 0.56 |
| 当前输入、光标和选区 | 页面内 Svelte 状态 | 不持久化 |

剪贴板通过浏览器 Clipboard API 访问。Tauri 窗口置顶、最小化、关闭、拖动和最大化则通过 `@tauri-apps/api/window` 延迟调用；在浏览器环境中不显示桌面窗口控制。

## 桌面与 Web 构建

- [svelte.config.js](../svelte.config.js) 使用 `@sveltejs/adapter-static`，输出 SPA 所需的 `index.html` fallback。环境变量 `BASE_PATH` 用于 GitHub Pages 子路径部署。
- [vite.config.js](../vite.config.js) 配置 SvelteKit 插件；开发服务器端口固定为 `1420`，Tauri 开发时可通过 `TAURI_DEV_HOST` 配置监听主机。
- [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) 配置产品标识、窗口尺寸、无系统装饰窗口、前端构建命令和打包图标。
- [src-tauri/capabilities/default.json](../src-tauri/capabilities/default.json) 声明前端可用的 Tauri 核心窗口操作和 opener 插件权限。
- Rust 入口在 [src-tauri/src/main.rs](../src-tauri/src/main.rs) 和 [src-tauri/src/lib.rs](../src-tauri/src/lib.rs)。Linux 下若同时检测到 Wayland 与 X11 显示环境，入口将 GTK 后端设为 X11，以适配置顶、无边框窗口缩放和标题栏操作。lib 中的 `greet` 是模板示例命令，不参与计算流程。

常用命令（见 `package.json`）：

```bash
pnpm install
pnpm dev       # Web 开发服务器，默认 http://localhost:1420
pnpm check     # Svelte/TypeScript 检查
pnpm build     # 静态前端构建
pnpm tauri dev # Tauri 桌面开发运行
pnpm tauri build
```

## 目录速览

```text
src/
  app.html                 HTML 外壳
  lib/calc.ts              词法、解析、求值、格式化及光标布局辅助
  routes/+layout.ts        SPA/SSR 设置
  routes/+page.svelte      主界面与交互
src-tauri/
  Cargo.toml               Rust/Tauri 依赖
  tauri.conf.json          桌面窗口与打包配置
  capabilities/            Tauri v2 权限声明
  src/main.rs              原生应用入口及 Linux GTK 后端适配
  src/lib.rs               Tauri Builder、插件和命令注册
static/                    Web 静态资源
image/                     README 截图和图标源文件
packaging/rpm/              RPM 仓库配置及使用说明
.github/workflows/          桌面 Release 构建和 GitHub Pages 部署
.vscode/                    VS Code 工作区设置与任务
```

发布方面，`.github/workflows/release.yml` 在推送 `v*` 标签后为 macOS（Apple Silicon/Intel）、Linux（x64/ARM64）和 Windows 构建桌面安装包，并创建草稿 Release；`.github/workflows/publish-channels.yml` 在 Release 发布后构建静态前端并部署到 GitHub Pages，也支持手动触发。

## 阅读和维护建议

- 修改运算符、优先级、字面量规则或求值限制时，从 `src/lib/calc.ts` 入手，再核对页面错误处理和帮助文字。
- 修改光标定位、进制切换、token 高亮和位号显示时，同时检查 `calc.ts` 的偏移换算函数与 `+page.svelte` 的自绘输入实现；二者共享字符偏移约定。
- 修改历史或布局持久化时，检查 `+page.svelte` 中对应的 localStorage 键及旧历史格式兼容逻辑。
- 修改桌面窗口操作时，检查页面中的 Tauri API 调用、Tauri capability 权限和 `tauri.conf.json` 窗口设置。

## 当前实现边界

- 应用没有服务端组件或独立后端；Rust 层是桌面运行壳，核心算术在 TypeScript 前端执行。
- README 介绍的“无位宽截断”表示 BigInt 精确数学值，不等同于模拟特定 MCU 寄存器宽度或 C 语言无符号溢出语义。
- RPM 使用说明位于 `packaging/rpm/README.md`；CI 发布流程由 `.github/workflows/` 下的两个工作流定义。
- 前端包、Tauri 配置和 Cargo crate 中的版本号分别维护；阅读版本时应以对应配置文件为准。
