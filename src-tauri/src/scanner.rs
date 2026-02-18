use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use std::time::UNIX_EPOCH;
use rayon::prelude::*;
use crate::db::DB;
use crate::metadata::read_metadata;
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub mtime: u64,
    pub size: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub enum SortMethod {
    Newest,
    Oldest,
    NameAsc,
    NameDesc,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScanResult {
    pub images: Vec<ImageInfo>,
    pub initial_index: usize,
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(".image_manager_v2.db");
    Ok(path)
}

#[tauri::command]
pub fn scan_directory(app_handle: tauri::AppHandle, path: String, sort_method: Option<SortMethod>, recursive: Option<bool>) -> Result<ScanResult, String> {
    let input_path = Path::new(&path);
    let (root, target_file) = if input_path.is_file() {
        (input_path.parent().ok_or("No parent directory")?, Some(input_path))
    } else if input_path.is_dir() {
        (input_path, None)
    } else {
        return Err("Path does not exist".to_string());
    };

    let db_path = get_db_path(&app_handle)?;
    let _ = DB::open(&db_path).map_err(|e| e.to_string())?;
    
    let depth = if recursive.unwrap_or(false) { 99 } else { 1 };

    let entries: Vec<_> = WalkDir::new(root)
        .max_depth(depth)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .collect();

    let extensions = ["png", "jpg", "jpeg", "webp"];

    let mut images: Vec<ImageInfo> = entries.par_iter().filter_map(|entry| {
        if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
            if extensions.contains(&ext.to_lowercase().as_str()) {
                let metadata = entry.metadata().ok()?;
                let mtime = metadata.modified().ok()?
                    .duration_since(UNIX_EPOCH).ok()?
                    .as_secs();

                return Some(ImageInfo {
                    path: entry.path().to_string_lossy().to_string(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    mtime,
                    size: metadata.len(),
                });
            }
        }
        None
    }).collect();

    // Sorting
    let method = sort_method.unwrap_or(SortMethod::NameAsc);
    match method {
        SortMethod::Newest => images.sort_by(|a, b| b.mtime.cmp(&a.mtime)),
        SortMethod::Oldest => images.sort_by(|a, b| a.mtime.cmp(&b.mtime)),
        SortMethod::NameAsc => images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        SortMethod::NameDesc => images.sort_by(|a, b| b.name.to_lowercase().cmp(&a.name.to_lowercase())),
    }

    let mut initial_index = 0;
    if let Some(target) = target_file {
        let target_str = target.to_string_lossy().to_string();
        if let Some(pos) = images.iter().position(|img| img.path == target_str) {
            initial_index = pos;
        }
    }

    // Background indexing for missing or changed metadata
    let images_to_index = images.clone();
    let db_path_clone = db_path.clone();
    std::thread::spawn(move || {
        let db = DB::open(&db_path_clone).unwrap();
        
        // Filter images that actually need update first (sequential check is fast)
        let needs_update: Vec<_> = images_to_index.into_iter().filter(|img| {
            match db.get_indexed_mtime(&img.path) {
                Ok(Some(m)) => m != img.mtime,
                _ => true,
            }
        }).collect();

        if needs_update.is_empty() { return; }

        // Read metadata in parallel
        let results: Vec<_> = needs_update.par_iter().map(|img| {
            (img, read_metadata(&img.path))
        }).collect();

        // Batch insert results (DB write must be sequential for now, but WAL mode helps)
        for (img, meta_res) in results {
            if let Ok(meta) = meta_res {
                let _ = db.insert_image(img, &meta);
            }
        }
    });

    Ok(ScanResult { images, initial_index })
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FilterOptions {
    models: Vec<String>,
    samplers: Vec<String>,
}

#[tauri::command]
pub fn get_filter_options(app_handle: tauri::AppHandle, folder: String) -> Result<FilterOptions, String> {
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    let models = db.get_distinct_models(&folder).map_err(|e| e.to_string())?;
    let samplers = db.get_distinct_samplers(&folder).map_err(|e| e.to_string())?;
    Ok(FilterOptions { models, samplers })
}

#[tauri::command]
pub fn search_advanced_images(app_handle: tauri::AppHandle, folder: String, query: String, model: String, sampler: String, sort_method: SortMethod, recursive: bool) -> Result<Vec<ImageInfo>, String> {
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    db.search_advanced(&folder, &query, &model, &sampler, sort_method, recursive).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_images(app_handle: tauri::AppHandle, folder: String, query: String) -> Result<Vec<ImageInfo>, String> {
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    db.search(&folder, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_batch_range(app_handle: tauri::AppHandle, paths: Vec<String>, current_index: usize) -> Result<(usize, usize), String> {
    if paths.is_empty() || current_index >= paths.len() {
        return Ok((current_index, current_index));
    }

    let db_path = get_db_path(&app_handle)?;

    // Try to get cached prompts from DB for the folder of the current image
    let current_path = Path::new(&paths[current_index]);
    let folder = current_path.parent().map(|p| p.to_string_lossy().to_string());
    
    let cached_prompts = if let Some(f) = folder {
        if let Ok(db) = DB::open(&db_path) {
             db.get_folder_prompts(&f).ok()
        } else { None }
    } else { None };

    // Helper to get prompt: Try cache first, then disk
    let get_prompt = |index: usize| -> Option<String> {
        let path = &paths[index];
        if let Some(cache) = &cached_prompts {
            if let Some(cached_val) = cache.get(path) {
                return cached_val.clone();
            }
        }
        
        // Fallback to disk
        read_metadata(path).ok().and_then(|m| m.prompt)
    };

    let target_prompt = match get_prompt(current_index) {
        Some(p) => p,
        None => return Ok((current_index, current_index)),
    };

    let mut start = current_index;
    let mut end = current_index;

    // Scan backwards
    while start > 0 {
        if let Some(p) = get_prompt(start - 1) {
            if p == target_prompt {
                start -= 1;
                continue;
            }
        }
        break;
    }

    // Scan forwards
    while end < paths.len() - 1 {
        if let Some(p) = get_prompt(end + 1) {
            if p == target_prompt {
                end += 1;
                continue;
            }
        }
        break;
    }

    Ok((start, end))
}

#[cfg(test)]
mod tests {
    // Tests are currently disabled as they require a Tauri AppHandle for DB path resolution.
    // In a real scenario, we would use tauri::test::mock_builder()
}
