mod sidecar;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            sidecar::start(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                sidecar::kill();
            }
        });
}
