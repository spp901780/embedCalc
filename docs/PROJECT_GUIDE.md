# EmbedCalc 项目导读

## 项目目的

EmbedCalc 是面向嵌入式开发场景的混合进制表达式计算器。它让使用者在同一算式中书写十六进制、十进制和二进制数，并使用接近 C 语言的算术、移位和位运算符计算寄存器值、掩码和地址。

项目同时提供浏览器版和桌面版。两者共用 Svelte 前端；桌面版由 Tauri v2 将静态前端装入原生窗口。计算在客户端完成，不依赖应用服务器或远端计算 API。

## 总体架构

```text
用户输入
   │
   ▼
src/routes/+page.svelte  ── 派生状态 ──► src/lib/domain/evaluate.ts
   │                                      │
   │                                      ├─ core.ts：词法、Pratt、BigInt
   │                                      ├─ format.ts：进制与补码格式化
   │                                      └─ view.ts：光标与数字布局
   │
   ├─ components/：原生编辑器、结果、数字检查、历史、标题栏
   ├─ state/：编辑操作、历史导航、持久化、窗口适配
   └─ workbench.css：深色工作台、焦点、响应式布局
                  │
                  ▼
          Tauri v2 WebView 壳
          src-tauri/src/{main,lib}.rs
```

### 前端

- [src/routes/+page.svelte](../src/routes/+page.svelte) 使用 Svelte 5 runes 编排表达式、求值、历史和分栏状态，不包含解析器、存储实现、Tauri API 或完整编辑算法。
- `components/ExpressionEditor.svelte` 用真实 textarea 承载文本、原生选区、输入法、剪贴板与普通编辑的系统撤销重做；辅助着色/位号层设为 `aria-hidden`，字体、padding、字符偏移与横向滚动一致。仅拦截既有进制/跳词/历史快捷键和 Enter/Esc；组合输入期间暂停特殊快捷键与自动拼接，换行统一为空格。
- `ResultPanel`、`NumberInspector`、`HistoryPanel` 和 `Titlebar` 分别负责结果、nibble 联动、历史列表及示例/桌面控件。`workbench.css` 统一工作台样式；窄窗口上下堆叠并隐藏分隔条，短窗口自动折叠历史，长结果局部滚动，复制按钮始终可见。
- [src/routes/+layout.ts](../src/routes/+layout.ts) 关闭 SSR。页面只在浏览器/WebView 中运行，因而直接使用 `window`、`document`、`localStorage` 等浏览器 API。

### 计算引擎

[src/lib/calc.ts](../src/lib/calc.ts) 保留原有导出 API，通过兼容入口重导出 `domain/core.ts`、`format.ts` 和 `view.ts`。这些纯领域模块没有 DOM、Svelte 或 Tauri 依赖，职责如下：

1. `tokenize` 将字面量、运算符和括号变成 token，并记录源文本偏移；数字 token 附带 BigInt 值、书写进制和数字位起始位置。
2. `parse` 用 Pratt 解析器按 C 风格优先级求值。支持一元 `+ - ~`，二元 `+ - * / % << >> & ^ |` 和括号。
3. 所有数值运算使用 JavaScript `bigint`，不按 8/16/32/64 位自动截断。左移上限为 2048 位；除零、负数左移量、过大左移量等作为错误抛出。
4. 格式化函数生成 hex、dec、bin 文本及分组布局。负结果的二进制显示采用最小字节对齐的补码；二进制结果显示限制为 2048 位。
5. 光标辅助函数在源字符串位置、数字逻辑位和 nibble 高亮间换算，供界面切换进制及联动高亮使用。

支持的数字写法包括 `xFF` / `0xFF`（十六进制）、`b1010` / `0b1010`（二进制）、`42` / `d42` / `u42`（十进制）以及单字符形式如 `'A'`、`'\\n'`。数字可用 `_` 分组。

## 一次输入的处理流程

1. textarea 的 input/selection/composition 事件同步 `expr`、字符光标和选区；纯编辑操作位于 `state/editor.ts`，不会依赖 DOM 或 Svelte。
2. `domain/evaluate.ts` 统一产生 `empty`、`preview`、`valid`、`error`。尾部运算符/左括号仍可求前缀预览，未闭合括号也标记为未完成；预览不替代上次有效值。
3. 管线完成 BigInt 求值、数字布局和二进制显示范围检查，再把已验证的 binary 数据交给结果组件；模板不再调用可能抛出范围错误的格式化函数。
4. 错误或没有可求值前缀时可保留上次有效结果，状态栏明确标记过期；空输入不显示旧值。状态栏通过 live region 通知计算状态与复制/存储失败。
5. 仅 `valid` 允许 Enter 保存历史。`state/history.ts` 管理草稿与浏览导航，回填清除旧选区，连续点击记录不会覆盖原始草稿。

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
pnpm test      # Node 22.15+：聚焦领域/状态回归
pnpm check     # Svelte/TypeScript 检查
pnpm build     # 静态前端构建
pnpm tauri dev # Tauri 桌面开发运行
pnpm tauri build
```

## 目录速览

```text
src/
  app.html                 HTML 外壳
  lib/calc.ts              兼容重导出入口
  lib/domain/              core、format、view、evaluate 纯领域模块
  lib/state/               editor、history、persistence、window 边界
  lib/components/          ExpressionEditor、ResultPanel、NumberInspector、HistoryPanel、Titlebar
  lib/workbench.css        工作台样式和响应式策略
  routes/+layout.ts        SPA/SSR 设置
  routes/+page.svelte      主界面编排
 tests/                     原生 Node 回归测试与 TypeScript 加载钩子
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

- 修改运算符、优先级、字面量规则或限制时，从 `domain/core.ts` 入手，再核对 `domain/evaluate.ts` 的错误与预览分类；`calc.ts` 仅为兼容重导出入口。
- 修改光标定位、进制切换和位号时，检查 `domain/view.ts`、`state/editor.ts` 和 `ExpressionEditor.svelte`；二者的文本与高亮层必须共享字符偏移。
- 修改持久化时，检查 `state/persistence.ts` 的键、类型检查、50 条限制和旧字符串格式兼容逻辑。写入失败仅提示，不回滚内存中的操作。
- 修改桌面操作时，检查 `state/window.ts`、`Titlebar.svelte`、Tauri capability 权限和窗口配置；计时器、resize 监听及指针捕获应随组件生命周期清理。

### 回归验证

`pnpm test` 使用 Node 内建测试运行器及项目现有 TypeScript 转译器，不增加测试依赖。测试运行环境需 Node **22.15+**（`module.registerHooks`）；覆盖混合进制、字符、C 优先级、BigInt、补码、显示上限、状态分类、光标映射、进制记忆、两种二进制前缀拼接、旧历史、去重/上限、草稿恢复及存储失败。随后运行 `pnpm check` 和 `pnpm build`。

浏览器回归应包含预览不能保存、过期值、原生选区与替换、撤销/重做、换行粘贴、组合输入、历史恢复、复制/存储拒绝、分隔条键盘与持久化、窄窗口及短高度、2048 位结果。自动触发 composition 事件不等同于真实操作系统输入法；触屏、屏幕阅读器和 Tauri WebView/原生窗口仍需对应设备实测。

## 当前实现边界

- 应用没有服务端组件或独立后端；Rust 层是桌面运行壳，核心算术在 TypeScript 前端执行。
- README 介绍的“无位宽截断”表示 BigInt 精确数学值，不等同于模拟特定 MCU 寄存器宽度或 C 语言无符号溢出语义。
- RPM 使用说明位于 `packaging/rpm/README.md`；CI 发布流程由 `.github/workflows/` 下的两个工作流定义。
- 前端包、Tauri 配置和 Cargo crate 中的版本号分别维护；阅读版本时应以对应配置文件为准。
