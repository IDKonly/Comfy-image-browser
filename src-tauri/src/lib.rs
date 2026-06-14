mod scanner;
mod metadata;
mod file_ops;
mod db;
mod thumbnails;
mod wildcard;
mod twitter;
mod crop;
mod mobile_server;
mod secrets;
#[cfg(test)]
mod benchmarks;

use std::sync::{Arc, Mutex};
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

    let mobile_shared_state: mobile_server::SharedState = Arc::new(Mutex::new(mobile_server::GlobalMobileState {
        settings: mobile_server::MobileServerSettings {
            enabled: false,
            port: 4882,
            local_only: true,
            authorized_folders: Vec::new(),
        },
        state: mobile_server::MobileState {
            recent_folders: Vec::new(),
            authorized_folders: Vec::new(),
        },
        handle: None,
        app_handle: None,
    }));

    tauri::Builder::default()
        .manage(scanner::WatcherState(Mutex::new(scanner::FolderWatcher {
            watcher: None,
            current_path: None,
            current_recursive: None,
            current_sort: None,
        })))
        .manage(db::DbState(Mutex::new(None)))
        .manage(mobile_shared_state)
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
            scanner::search_similar_images,
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
            secrets::save_twitter_secrets,
            secrets::load_twitter_secrets,
            secrets::has_twitter_secrets,
            secrets::delete_twitter_secrets,
            crop::process_batch_crop,
            mobile_server::update_mobile_server,
            mobile_server::get_local_ip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
