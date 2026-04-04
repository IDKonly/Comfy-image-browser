use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use std::time::UNIX_EPOCH;
use rayon::prelude::*;
use crate::db::DB;
use crate::metadata::read_metadata;
use tauri::{Manager, Emitter};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use lazy_static::lazy_static;
use notify::{Watcher, RecursiveMode, Config};

lazy_static! {
    static ref CURRENT_SCAN_ID: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
}

pub struct FolderWatcher {
    pub watcher: Option<notify::RecommendedWatcher>,
    pub current_path: Option<String>,
}

pub struct WatcherState(pub Mutex<FolderWatcher>);

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

fn setup_watcher(app_handle: tauri::AppHandle, path: &Path, is_recursive: bool, sort_method: SortMethod) -> notify::Result<notify::RecommendedWatcher> {
    let app_handle_clone = app_handle.clone();
    let path_buf = path.to_path_buf();
    
    // Use a simple debouncer logic: only trigger if last event was more than 500ms ago
    let last_event = Arc::new(Mutex::new(std::time::Instant::now()));

    let mut watcher = notify::RecommendedWatcher::new(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => {
                // Filter events: Create, Remove, Modify (data), Rename
                if event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove() {
                    let mut last = last_event.lock().unwrap();
                    if last.elapsed() > std::time::Duration::from_millis(500) {
                        *last = std::time::Instant::now();
                        
                        let app = app_handle_clone.clone();
                        let p = path_buf.to_string_lossy().to_string();
                        // Trigger a re-scan.
                        let _ = std::thread::spawn(move || {
                             let extensions = ["png", "jpg", "jpeg", "webp"];
                             let depth = if is_recursive { 99 } else { 1 };
                             let disk_entries: Vec<ImageInfo> = WalkDir::new(&p)
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
                                                path: entry.path().to_string_lossy().to_string().replace("\\", "/"),
                                                name: entry.file_name().to_string_lossy().to_string(),
                                                mtime,
                                                size: metadata.len(),
                                            });
                                        }
                                    }
                                    None
                                })
                                .collect();

                            let mut images = disk_entries.clone();
                            sort_images(&mut images, sort_method);
                            
                            let folder_str = p.replace("\\", "/");
                            let _ = app.emit("folder-updated", ScanResult {
                                images: images.clone(),
                                initial_index: 0,
                                folder: folder_str.clone(),
                            });

                            // Also trigger indexing for new/changed files in background
                            if let Ok(db_path) = get_db_path(&app) {
                                if let Ok(mut db) = DB::open(&db_path) {
                                    let indexed_stats = db.get_folder_stats(&folder_str, is_recursive).unwrap_or_default();
                                    
                                    // Cleanup stale
                                    let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| img.path.clone()).collect();
                                    let stale_paths: Vec<_> = indexed_stats.keys().filter(|path| !disk_paths.contains(*path)).cloned().collect();
                                    if !stale_paths.is_empty() {
                                        let _ = db.delete_images(&stale_paths);
                                    }

                                    let needs_indexing: Vec<_> = disk_entries.into_iter().filter(|img| {
                                        match indexed_stats.get(&img.path) {
                                            Some(&(m, s)) => m != img.mtime || s != img.size,
                                            None => true,
                                        }
                                    }).collect();

                                    if !needs_indexing.is_empty() {
                                        // Parallel Indexing
                                        let results: Vec<_> = needs_indexing.par_iter().map(|img| {
                                            (img, read_metadata(&img.path).unwrap_or_default())
                                        }).collect();
                                        let _ = db.insert_images_batch(results);
                                        let _ = app.emit("metadata-chunk-updated", ());
                                    }
                                }
                            }
                        });
                    }
                }
            },
            Err(e) => log::error!("Watcher error: {:?}", e),
        }
    }, Config::default())?;

    let mode = if is_recursive { RecursiveMode::Recursive } else { RecursiveMode::NonRecursive };
    watcher.watch(path, mode)?;
    Ok(watcher)
}

#[tauri::command]
pub fn scan_directory(
    app_handle: tauri::AppHandle, 
    watcher_state: tauri::State<'_, WatcherState>,
    path: String, 
    sort_method: Option<SortMethod>, 
    recursive: Option<bool>, 
    force_reindex: Option<bool>
) -> Result<ScanResult, String> {
    let input_path = Path::new(&path);
    let (root, target_file) = if input_path.is_file() {
        (input_path.parent().ok_or("No parent directory")?, Some(input_path))
    } else if input_path.is_dir() {
        (input_path, None)
    } else {
        return Err("Path does not exist".to_string());
    };

    let root_str = root.to_string_lossy().to_string().replace("\\", "/");
    let is_recursive = recursive.unwrap_or(false);
    let method = sort_method.unwrap_or(SortMethod::NameAsc);

    // Update Watcher
    {
        let mut ws = watcher_state.0.lock().unwrap();
        if ws.current_path.as_ref() != Some(&root_str) {
            // Stop old watcher (happens automatically when dropped, but let's be explicit)
            ws.watcher = None; 
            match setup_watcher(app_handle.clone(), root, is_recursive, method) {
                Ok(w) => {
                    ws.watcher = Some(w);
                    ws.current_path = Some(root_str.clone());
                    log::info!("Started watching: {}", root_str);
                },
                Err(e) => log::error!("Failed to start watcher: {}", e),
            }
        }
    }

    let is_forced = force_reindex.unwrap_or(false);

    // 1. Synchronous Disk Scan (FAST)
    let depth = if is_recursive { 99 } else { 1 };
    let extensions = ["png", "jpg", "jpeg", "webp"];
    
    let disk_entries: Vec<ImageInfo> = WalkDir::new(root)
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
                        path: entry.path().to_string_lossy().to_string().replace("\\", "/"),
                        name: entry.file_name().to_string_lossy().to_string(),
                        mtime,
                        size: metadata.len(),
                    });
                }
            }
            None
        })
        .collect();

    let mut images = disk_entries.clone();
    sort_images(&mut images, method);

    let target_str = target_file.map(|t| t.to_string_lossy().to_string().replace("\\", "/"));
    let mut initial_index = 0;
    if let Some(ref target) = target_str {
        if let Some(pos) = images.iter().position(|img| &img.path == target) {
            initial_index = pos;
        }
    }

    // 2. Cancellation
    let scan_id = CURRENT_SCAN_ID.fetch_add(1, Ordering::SeqCst) + 1;

    // 3. Background Indexing
    let app_handle_clone = app_handle.clone();
    let root_str_clone = root_str.clone();
    let images_for_bg = images.clone(); // Clone for the background thread

    std::thread::spawn(move || {
        let app_handle = app_handle_clone;
        let db_path = match get_db_path(&app_handle) {
            Ok(p) => p,
            Err(e) => { log::error!("Background scan failed to get DB path: {}", e); return; }
        };
        let mut db = match DB::open(&db_path) {
            Ok(d) => d,
            Err(e) => { log::error!("Background scan failed to open DB: {}", e); return; }
        };

        if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { return; }

        // A. Identify what needs indexing
        let indexed_stats = match db.get_folder_stats(&root_str_clone, is_recursive) {
            Ok(s) => s,
            Err(_) => std::collections::HashMap::new()
        };

        // Cleanup stale DB entries
        let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| img.path.clone()).collect();
        let stale_paths: Vec<_> = indexed_stats.keys().filter(|p| !disk_paths.contains(*p)).cloned().collect();
        if !stale_paths.is_empty() {
            let _ = db.delete_images(&stale_paths);
        }

        let mut needs_indexing: Vec<_> = disk_entries.into_iter().filter(|img| {
            if is_forced { return true; }
            match indexed_stats.get(&img.path) {
                Some(&(m, s)) => m != img.mtime || s != img.size,
                None => true,
            }
        }).collect();

        if needs_indexing.is_empty() { return; }

        // B. Prioritize Indexing Outwards from Current Index
        let path_to_index: std::collections::HashMap<_, _> = images_for_bg.iter().enumerate().map(|(i, img)| (img.path.clone(), i)).collect();
        needs_indexing.sort_by_cached_key(|img| {
            let pos = path_to_index.get(&img.path).copied().unwrap_or(0);
            (pos as isize - initial_index as isize).abs()
        });

        // C. Parallel Metadata Extraction
        let total = needs_indexing.len();
        let _ = app_handle.emit("index-progress", IndexProgress { total, current: 0, is_indexing: true });

        let chunk_size = 50;
        let mut processed_count = 0;

        for chunk in needs_indexing.chunks(chunk_size) {
            if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id {
                let _ = app_handle.emit("index-progress", IndexProgress { total, current: processed_count, is_indexing: false });
                return;
            }

            let results: Vec<_> = chunk.par_iter().map(|img| {
                (img, read_metadata(&img.path).unwrap_or_default())
            }).collect();

            if let Err(e) = db.insert_images_batch(results) {
                log::error!("Batch insert failed: {}", e);
            }

            processed_count += chunk.len();
            let _ = app_handle.emit("index-progress", IndexProgress { total, current: processed_count, is_indexing: true });
            let _ = app_handle.emit("metadata-chunk-updated", ());
        }

        let _ = app_handle.emit("index-progress", IndexProgress { total, current: total, is_indexing: false });
    });

    Ok(ScanResult {
        images,
        initial_index,
        folder: root_str,
    })
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

    // Synchronous Foreground Indexing
    let db_path = get_db_path(&app_handle)?;
    if let Ok(mut db) = DB::open(&db_path) {
        let path_strings: Vec<String> = all_images.iter().map(|img| img.path.clone()).collect();
        let indexed_stats = db.get_indexed_stats_batch(&path_strings).unwrap_or_default();

        let needs_update: Vec<_> = all_images.iter().filter(|img| {
            match indexed_stats.get(&img.path) {
                Some(&(m, s)) => m != img.mtime || s != img.size,
                None => true,
            }
        }).cloned().collect();

        if !needs_update.is_empty() {
            let results: Vec<_> = needs_update.par_iter().map(|img| {
                (img, read_metadata(&img.path).unwrap_or_default())
            }).collect();

            if let Err(e) = db.insert_images_batch(results) {
                log::error!("Batch insert failed during scan_paths: {}", e);
            }
        }
    }

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
pub fn get_tag_suggestions(app_handle: tauri::AppHandle, folder: String, current_input: String, recursive: bool) -> Result<Vec<String>, String> {
    if current_input.trim().is_empty() {
        return Ok(Vec::new());
    }
    
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    let prompts = db.get_all_prompts(&folder, recursive).unwrap_or_default();
    
    let mut tag_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    let current_lower = current_input.trim().to_lowercase();
    
    for prompt in prompts {
        for tag in prompt.split(',') {
            let tag_trimmed = tag.trim();
            let tag_lower = tag_trimmed.to_lowercase();
            if tag_lower.starts_with(&current_lower) && tag_lower != current_lower {
                *tag_counts.entry(tag_trimmed.to_string()).or_insert(0) += 1;
            }
        }
    }
    
    let mut sorted_tags: Vec<_> = tag_counts.into_iter().collect();
    sorted_tags.sort_by(|a, b| b.1.cmp(&a.1));
    
    let top_tags = sorted_tags.into_iter().take(5).map(|(tag, _)| tag).collect();
    Ok(top_tags)
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
