//! 桌面入口：调用库 crate 的 run()（移动端由 JNI 直接调 error_notebook_lib::run）。

fn main() {
    error_notebook_lib::run();
}
