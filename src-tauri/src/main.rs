// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Wayland 会话下 GTK 默认走 wayland 后端,导致:
    //   1. 置顶无效 —— wayland 协议无客户端置顶接口,Mutter 只尊重 X11 客户端的 _NET_WM_STATE_ABOVE;
    //   2. 无边框窗口边缘缩放光标不显示、双击标题栏不最大化 —— tao 的 hit-test 光标设置与 GTK 的
    //      begin_move_drag 双击最大化均依赖 X11 路径。
    // 强制 x11 后端(XWayland)后以上全部生效。注意必须在任何 GTK 初始化之前设置;
    // 且本机环境变量里 GDK_BACKEND=wayland 已被预置,不能用 is_none() 判断,必须无条件覆盖。
    // 如需调试原生 wayland 渲染,可临时注释此段。
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && std::env::var_os("DISPLAY").is_some()
        {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    embedcalc_lib::run()
}
