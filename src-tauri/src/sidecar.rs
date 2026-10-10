//! Python sidecar 生命周期管理：
//! 1. Rust bind 0 探测空闲端口；
//! 2. spawn python-server sidecar（Tauri 把 externalBin 放在可执行文件旁），传入 --port N；
//! 3. 轮询 GET /healthz（5s 间隔，60s 超时；超时显示错误页并附日志路径）；
//! 4. 就绪后把主窗口 navigate 到 http://127.0.0.1:N/；
//! 5. 应用退出时 kill sidecar（见 main.rs 的 RunEvent::Exit）。

use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Url};

#[cfg(unix)]
use std::os::unix::process::CommandExt;

static CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .expect("无法绑定 127.0.0.1")
        .local_addr()
        .unwrap()
        .port()
}

/// externalBin 的位置约定：
/// - 打包产物（.app / 安装目录）：bundler 会去掉 target triple 后缀，与主程序同目录，名 `python-server[.exe]`；
/// - 开发模式（cargo tauri dev）：保留后缀 `python-server-<triple>[.exe]`。
fn sidecar_path() -> PathBuf {
    let triple = if cfg!(target_os = "windows") {
        "x86_64-pc-windows-msvc"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64-apple-darwin"
    } else {
        "x86_64-apple-darwin"
    };
    let exe_ext = if cfg!(windows) { ".exe" } else { "" };
    let exe = std::env::current_exe().expect("无法定位当前可执行文件");
    let dir = exe.parent().expect("可执行文件无父目录");
    let candidates = [
        dir.join(format!("python-server{exe_ext}")),
        dir.join(format!("python-server-{triple}{exe_ext}")),
    ];
    for c in &candidates {
        if c.exists() {
            return c.clone();
        }
    }
    panic!(
        "未找到 python-server sidecar，已尝试：{} 与 {}",
        candidates[0].display(),
        candidates[1].display()
    );
}

fn healthz_ok(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    let Ok(mut stream) = TcpStream::connect(addr) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    if stream
        .write_all(b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut buf = Vec::new();
    if stream.read_to_end(&mut buf).is_err() {
        return false;
    }
    let s = String::from_utf8_lossy(&buf);
    // FastAPI JSONResponse 使用紧凑分隔符，body 实际是 {"ok":true}（无空格），先去除空白再匹配
    let compact: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    compact.contains("200") && compact.contains("{\"ok\":true}")
}

/// 启动 sidecar 并等待就绪，就绪后导航主窗口；失败则显示错误页。
pub fn start(app: &AppHandle) {
    let port = find_free_port();
    let path = sidecar_path();
    let mut cmd = Command::new(&path);
    cmd.arg("--port").arg(port.to_string());
    #[cfg(unix)]
    cmd.process_group(0); // 独立进程组，退出时整组 kill（PyInstaller onefile 会再派生子进程）
    let child = cmd
        .spawn()
        .unwrap_or_else(|e| panic!("启动 sidecar 失败：{}（{}）", path.display(), e));
    *CHILD.lock().unwrap() = Some(child);

    let app = app.clone();
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(60);
        while !healthz_ok(port) {
            if Instant::now() > deadline {
                eprintln!("python-server 60s 内未就绪，端口 {port}");
                show_error_page(&app);
                return;
            }
            std::thread::sleep(Duration::from_secs(5));
        }
        if let Some(window) = app.get_webview_window("main") {
            let url: Url = format!("http://127.0.0.1:{port}/")
                .parse()
                .expect("无效的本地服务 URL");
            let _ = window.navigate(url);
        }
    });
}

/// 服务超时未就绪：主窗口显示错误页（data URL，附日志路径，全部 ASCII 避免编码问题）。
fn show_error_page(app: &AppHandle) {
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let log = format!("{home}/.cuotiji/app.log");
    let html = format!(
        "<html><body style='font-family:sans-serif;padding:40px;background:#f4f6fa'>\
         <h2 style='color:#dc2626'>Local service failed to start</h2>\
         <p>The embedded python-server did not become ready within 60 seconds.</p>\
         <p>Please check the log file:</p>\
         <code style='background:#fff;padding:6px 10px;border:1px solid #e2e8f0'>{log}</code>\
         </body></html>"
    );
    if let Some(window) = app.get_webview_window("main") {
        if let Ok(url) = format!("data:text/html;charset=utf-8,{html}").parse::<Url>() {
            let _ = window.navigate(url);
        }
    }
}

/// 应用退出时杀掉 sidecar（由 main.rs 的 RunEvent::Exit 调用）。
/// Unix：整个进程组 kill，确保 PyInstaller onefile 派生的孙进程也被清理。
pub fn kill() {
    if let Some(mut child) = CHILD.lock().unwrap().take() {
        #[cfg(unix)]
        let pgid = child.id() as i32;
        let _ = child.kill();
        let _ = child.wait();
        #[cfg(unix)]
        unsafe {
            libc::killpg(pgid, libc::SIGKILL);
        }
    }
}
