mod scanner;
mod metadata;
mod file_ops;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            scanner::scan_directory,
            metadata::get_metadata,
            file_ops::delete_to_trash,
            file_ops::move_to_keep
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
