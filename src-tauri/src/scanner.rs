use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use std::time::UNIX_EPOCH;
use rayon::prelude::*;
use crate::db::DB;
use crate::metadata::read_metadata;
use tauri::{Manager, Emitter};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use lazy_static::lazy_static;

lazy_static! {
    static ref CURRENT_SCAN_ID: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
}

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
pub struct IndexProgress {
    pub total: usize,
    pub current: usize,
    pub is_indexing: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScanResult {
    pub images: Vec<ImageInfo>,
    pub initial_index: usize,
    pub folder: String,
}

fn get_db_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(".image_manager_v2.db");
    Ok(path)
}

fn sort_images(images: &mut Vec<ImageInfo>, method: SortMethod) {
    match method {
        SortMethod::Newest => images.sort_by(|a, b| b.mtime.cmp(&a.mtime)),
        SortMethod::Oldest => images.sort_by(|a, b| a.mtime.cmp(&b.mtime)),
        SortMethod::NameAsc => images.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase())),
        SortMethod::NameDesc => images.sort_by(|a, b| b.name.to_lowercase().cmp(&a.name.to_lowercase())),
    }
}

#[tauri::command]
pub fn scan_directory(app_handle: tauri::AppHandle, path: String, sort_method: Option<SortMethod>, recursive: Option<bool>, force_reindex: Option<bool>) -> Result<ScanResult, String> {
    let input_path = Path::new(&path);
    let (root, target_file) = if input_path.is_file() {
        (input_path.parent().ok_or("No parent directory")?, Some(input_path))
    } else if input_path.is_dir() {
        (input_path, None)
    } else {
        return Err("Path does not exist".to_string());
    };

    let root_str = root.to_string_lossy().to_string().replace("\\", "/");
    let db_path = get_db_path(&app_handle)?;
    let is_recursive = recursive.unwrap_or(false);
    let is_forced = force_reindex.unwrap_or(false);
    let method = sort_method.unwrap_or(SortMethod::NameAsc);

    // 1. DB-First (unless forced)
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    let mut images = if is_forced {
        Vec::new()
    } else {
        db.get_images_in_folder_fast(&root_str, is_recursive).unwrap_or_default()
    };
    
    // Sort results
    sort_images(&mut images, method);

    let mut initial_index = 0;
    if let Some(target) = target_file {
        let target_str = target.to_string_lossy().to_string();
        if let Some(pos) = images.iter().position(|img| img.path == target_str) {
            initial_index = pos;
        }
    }

    // 2. Cancellation
    let scan_id = CURRENT_SCAN_ID.fetch_add(1, Ordering::SeqCst) + 1;

    // 3. Background Sync & Indexing
    let app_handle_clone = app_handle.clone();
    let root_path_buf = root.to_path_buf();
    let root_str_clone = root_str.clone();

    std::thread::spawn(move || {
        let app_handle = app_handle_clone;
        let db_path = get_db_path(&app_handle).unwrap();
        let mut db = DB::open(&db_path).unwrap();

        if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { return; }

        // A. Fast disk scan
        let depth = if is_recursive { 99 } else { 1 };
        let extensions = ["png", "jpg", "jpeg", "webp"];
        
        let disk_entries: Vec<ImageInfo> = WalkDir::new(&root_path_buf)
            .max_depth(depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|entry| {
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
            })
            .collect();

        if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { return; }

        // B. Identify Changes
        let mut current_images = disk_entries.clone();
        sort_images(&mut current_images, method);

        let _ = app_handle.emit("folder-updated", ScanResult { 
            images: current_images.clone(), 
            initial_index, 
            folder: root_str_clone.clone() 
        });

        // C. Cleanup stale DB entries
        if let Ok(indexed_paths) = db.get_all_paths_in_folder(&root_str_clone, is_recursive) {
            let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| &img.path).collect();
            let stale_paths: Vec<_> = indexed_paths.into_iter().filter(|p| !disk_paths.contains(p)).collect();
            if !stale_paths.is_empty() {
                let _ = db.delete_images(&stale_paths);
            }
        }

        // D. Filter images that need indexing
        let needs_indexing: Vec<_> = disk_entries.into_iter().filter(|img| {
            if is_forced { return true; } // Force Reindex ignores DB stats
            match db.get_indexed_stats(&img.path) {
                Ok(Some((m, s))) => m != img.mtime || s != img.size,
                _ => true,
            }
        }).collect();

        if needs_indexing.is_empty() { return; }

        // E. Parallel Metadata Extraction
        let total = needs_indexing.len();
        let _ = app_handle.emit("index-progress", IndexProgress { total, current: 0, is_indexing: true });

        for (chunk_idx, chunk) in needs_indexing.chunks(100).enumerate() {
            if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { 
                let _ = app_handle.emit("index-progress", IndexProgress { total, current: 0, is_indexing: false });
                return; 
            }

            let results: Vec<_> = chunk.par_iter().map(|img| {
                (img, read_metadata(&img.path).unwrap_or_default())
            }).collect();

            if let Err(e) = db.insert_images_batch(results) {
                log::error!("Batch insert failed: {}", e);
            }

            let current_count = (chunk_idx + 1) * 100;
            let _ = app_handle.emit("index-progress", IndexProgress { 
                total, 
                current: if current_count > total { total } else { current_count }, 
                is_indexing: true 
            });
        }

        let _ = app_handle.emit("index-progress", IndexProgress { total, current: total, is_indexing: false });
    });

    Ok(ScanResult { images, initial_index, folder: root_str })
}

#[tauri::command]
pub fn scan_paths(app_handle: tauri::AppHandle, paths: Vec<String>, recursive: bool) -> Result<Vec<ImageInfo>, String> {
    let extensions = ["png", "jpg", "jpeg", "webp"];
    
    let all_images: Vec<ImageInfo> = paths.par_iter().flat_map(|path| {
        let input_path = Path::new(path);
        if !input_path.exists() { return Vec::new(); }

        if input_path.is_file() {
            if let Some(ext) = input_path.extension().and_then(|s| s.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) {
                    if let Ok(metadata) = input_path.metadata() {
                        if let Ok(mtime_res) = metadata.modified() {
                            let mtime = mtime_res.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                            return vec![ImageInfo {
                                path: input_path.to_string_lossy().to_string(),
                                name: input_path.file_name().unwrap().to_string_lossy().to_string(),
                                mtime,
                                size: metadata.len(),
                            }];
                        }
                    }
                }
            }
            return Vec::new();
        }

        // Directory scanning
        let depth = if recursive { 99 } else { 1 };
        WalkDir::new(input_path)
            .max_depth(depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|entry| {
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
            })
            .collect::<Vec<_>>()
    }).collect();

    // Background indexing
    let images_to_index = all_images.clone();
    let db_path = get_db_path(&app_handle)?;
    
    std::thread::spawn(move || {
        if let Ok(db) = DB::open(&db_path) {
            let needs_update: Vec<_> = images_to_index.into_iter().filter(|img| {
                match db.get_indexed_mtime(&img.path) {
                    Ok(Some(m)) => m != img.mtime,
                    _ => true,
                }
            }).collect();

            if !needs_update.is_empty() {
                let results: Vec<_> = needs_update.par_iter().map(|img| {
                    (img, read_metadata(&img.path))
                }).collect();

                for (img, meta_res) in results {
                    if let Ok(meta) = meta_res {
                        let _ = db.insert_image(img, &meta);
                    }
                }
            }
        }
    });

    Ok(all_images)
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
