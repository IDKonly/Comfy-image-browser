mod scanner;
mod metadata;
mod file_ops;
mod db;
mod thumbnails;
mod wildcard;
mod twitter;
mod crop;
#[cfg(test)]
mod benchmarks;

use std::sync::Mutex;
use tauri::Manager;

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

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_logs() -> Result<String, String> {
    let path = std::path::Path::new("app.log");
    if !path.exists() {
        return Ok("No log file found.".to_string());
    }
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let lines: Vec<&str> = content.lines().collect();
    let start = if lines.len() > 100 { lines.len() - 100 } else { 0 };
    Ok(lines[start..].join("\n"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = setup_logging();
    log::info!("Starting ComfyView application...");

    tauri::Builder::default()
        .manage(scanner::WatcherState(Mutex::new(scanner::FolderWatcher {
            watcher: None,
            current_path: None,
        })))
        .manage(db::DbState(Mutex::new(None)))
        .setup(|app| {
            let app_handle = app.handle();
            let mut db_path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
            if !db_path.exists() {
                std::fs::create_dir_all(&db_path).map_err(|e| e.to_string())?;
            }
            db_path.push(".image_manager_v2.db");
            
            let database = db::DB::open(&db_path).map_err(|e| e.to_string())?;
            let db_state = app.state::<db::DbState>();
            *db_state.0.lock().unwrap() = Some(database);
            
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_logs,
            scanner::scan_directory,
            scanner::scan_paths,
            scanner::update_scan_focus,
            scanner::get_batch_range,
            scanner::search_images,
            scanner::search_advanced_images,
            scanner::get_tag_suggestions,
            scanner::get_filter_options,
            db::get_db_status,
            db::clear_database,
            db::get_all_prompts,
            db::get_prompts_by_paths,
            db::get_folder_prompts_map,
            db::get_prompts_map_by_paths,
            metadata::get_metadata,
            file_ops::delete_to_trash,
            file_ops::move_to_keep,
            file_ops::move_files_to_folder,
            file_ops::undo_move,
            file_ops::auto_classify,
            thumbnails::get_thumbnail,
            wildcard::generate_wildcards,
            wildcard::expand_wildcards,
            wildcard::compare_tags,
            wildcard::get_tag_counts,
            wildcard::read_filter_file,
            wildcard::write_filter_file,
            wildcard::save_to_file,
            wildcard::classify_prompts_command,
            twitter::twitter_upload,
            crop::process_batch_crop
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
