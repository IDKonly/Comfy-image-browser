mod scanner;
mod metadata;
mod file_ops;
mod db;
mod thumbnails;
mod wildcard;

fn setup_logging() -> Result<(), fern::InitError> {
    fern::Dispatch::new()
        .format(|out, message, record| {
            out.finish(format_args!(
                "{}[{}][{}] {}",
                chrono::Local::now().format("[%Y-%m-%d][%H:%M:%S]"),
                record.target(),
                record.level(),
                message
            ))
        })
        .level(log::LevelFilter::Debug)
        .chain(std::io::stdout())
        .chain(fern::log_file("app.log")?)
        .apply()?;
    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = setup_logging();
    log::info!("Starting ComfyView application...");

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            scanner::scan_directory,
            scanner::get_batch_range,
            scanner::search_images,
            scanner::search_advanced_images,
            scanner::get_filter_options,
            db::get_db_status,
            metadata::get_metadata,
            file_ops::delete_to_trash,
            file_ops::move_to_keep,
            file_ops::move_files_to_folder,
            file_ops::undo_move,
            thumbnails::get_thumbnail,
            wildcard::generate_wildcards,
            wildcard::expand_wildcards,
            wildcard::compare_tags,
            wildcard::get_tag_counts,
            wildcard::read_filter_file,
            wildcard::write_filter_file,
            wildcard::save_to_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
