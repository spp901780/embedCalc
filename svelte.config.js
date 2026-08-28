// Tauri doesn't have a Node.js server to do proper SSR
// so we use adapter-static with a fallback to index.html to put the site in SPA mode
// See: https://svelte.dev/docs/kit/single-page-apps
// See: https://v2.tauri.app/start/frontend/sveltekit/ for more info
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    // GitHub Pages 项目站点部署在子路径下（如 /embedCalc），通过环境变量注入；
    // 本地 dev / Tauri 构建不传该变量，保持根路径不变
    paths: {
      base: process.env.BASE_PATH ?? "",
    },
  },
};

export default config;
