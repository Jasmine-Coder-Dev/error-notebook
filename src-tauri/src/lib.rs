//! 错题集 Tauri 2 桌面壳。
//! 进程内嵌 axum HTTP 服务（127.0.0.1 动态端口），主窗口直接加载本地服务页面。

pub mod ai;
pub mod api;
pub mod db;
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
                    let url: tauri::Url = format!("http://127.0.0.1:{port}/")
                        .parse()
                        .expect("无效的本地服务 URL");
                    let _ = window.navigate(url);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri application")
        .run(|_app, _event| {});
}
