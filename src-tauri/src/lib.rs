//! 错题集 Tauri 2 桌面壳。
//! 进程内嵌 axum HTTP 服务（127.0.0.1 动态端口），主窗口直接加载本地服务页面。

pub mod ai;
pub mod api;
pub mod db;
pub mod parse_docx;
pub mod prompts;
pub mod providers;
pub mod server;

use tauri::Manager;

/// 追加一行带时间戳的日志到数据目录 app.log。
fn log_line(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(db::data_dir().join("app.log"))
    {
        let _ = writeln!(f, "{}\t{}", db::now_iso(), msg);
    }
}

/// Tauri 应用入口。
pub fn run() {
    // 启动日志写入 ~/.cuotiji/app.log（windowed 模式下 stderr 不可见）
    log_line(&format!(
        "错题集 Rust 版启动，数据目录：{}",
        db::data_dir().display()
    ));

    // 无窗口模式（对拍测试用）：CUOTIJI_HEADLESS=1 时只起内嵌 HTTP 服务
    if std::env::var("CUOTIJI_HEADLESS").is_ok() {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("无法创建 tokio runtime");
        let port = rt
            .block_on(server::start_on(
                std::env::var("CUOTIJI_HEADLESS_PORT")
                    .ok()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(0),
            ))
            .expect("内嵌 HTTP 服务启动失败");
        eprintln!("CUOTIJI_HEADLESS_PORT={port}");
        loop {
            std::thread::park();
        }
    }

    // 内嵌 HTTP 服务跑在独立 tokio runtime 线程里
    let (tx, rx) = std::sync::mpsc::channel::<Result<u16, String>>();
    std::thread::spawn(move || {
        let rt = tokio::runtime::Builder::new_multi_thread()
            .worker_threads(2)
            .enable_all()
            .build()
            .expect("无法创建 tokio runtime");
        let port = rt.block_on(server::start());
        let _ = tx.send(port);
        // 保持 runtime 存活：服务任务在其中运行
        loop {
            std::thread::park();
        }
    });

    tauri::Builder::default()
        .setup(move |app| {
            let port = match rx.recv() {
                Ok(Ok(p)) => p,
                Ok(Err(e)) => {
                    log_line(&format!("内嵌 HTTP 服务启动失败：{e}"));
                    0
                }
                Err(_) => 0,
            };
            if port > 0 {
                log_line(&format!("本地服务地址：http://127.0.0.1:{port}/"));
                if let Some(window) = app.get_webview_window("main") {
                    // 平台标记（CSS 按平台适配材质/兜底）
                    let platform = if cfg!(target_os = "macos") {
                        "macos"
                    } else if cfg!(target_os = "windows") {
                        "windows"
                    } else {
                        "linux"
                    };
                    let _ = window.eval(format!("document.documentElement.dataset.platform='{platform}'"));
                    // 系统级窗口材质（方案 §8.3）：
                    // macOS 26+ 液态玻璃（NSGlassEffectView，与系统同源）；旧 macOS 回退 NSVisualEffectView
                    #[cfg(target_os = "macos")]
                    {
                        use window_vibrancy::{apply_liquid_glass, apply_vibrancy, LiquidGlassOptions, NSGlassEffectViewStyle, NSVisualEffectMaterial};
                        // Regular 样式（macOS 27 原生应用同款）：标准液态玻璃，含内容适配的底色，
                        // 不是 Clear（过度透明）。tint 淡靛蓝呼应应用主题色。
                        let glass = LiquidGlassOptions::new(NSGlassEffectViewStyle::Regular)
                            .radius(0.0)
                            .opaque(true);
                        if apply_liquid_glass(&window, glass).is_err() {
                            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                            log_line("液态玻璃不可用（macOS < 26），已回退 sidebar vibrancy");
                        } else {
                            log_line("已启用 macOS 液态玻璃（Regular + opaque）");
                        }
                    }
                    // Windows 11 Mica（Win10 自动跳过）
                    #[cfg(target_os = "windows")]
                    {
                        use window_vibrancy::apply_mica;
                        if apply_mica(&window, Some(false)).is_ok() {
                            log_line("已启用 Windows Mica");
                        }
                    }
                    let url: tauri::Url = format!("http://127.0.0.1:{port}/")
                        .parse()
                        .expect("无效的本地服务 URL");
                    let _ = window.navigate(url);
                    // 单窗口应用：macOS 默认关窗口后应用驻留菜单栏（进程不退出）。
                    // 本应用为工具类，统一为「关闭窗口即退出全部进程」（内嵌服务线程一并终止）。
                    window.on_window_event(|event| {
                        if let tauri::WindowEvent::CloseRequested { .. } = event {
                            std::process::exit(0);
                        }
                    });
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri application")
        .run(|_app, event| {
            // Cmd+Q 等系统退出路径：确认退出（.run 返回后进程结束，tokio 线程随之终止）
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
                std::process::exit(0);
            }
        });
}
