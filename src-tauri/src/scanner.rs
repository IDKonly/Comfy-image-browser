use std::path::{Path, PathBuf};
use std::collections::HashMap;
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use std::time::UNIX_EPOCH;
use rayon::prelude::*;
use crate::db::DbState;
use crate::metadata::read_metadata;
use tauri::{Manager, Emitter};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use lazy_static::lazy_static;
use notify::{Watcher, RecursiveMode, Config};

lazy_static! {
    static ref CURRENT_SCAN_ID: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
    static ref CURRENT_FOCUS_INDEX: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));
}

#[tauri::command]
pub fn update_scan_focus(index: usize) {
    CURRENT_FOCUS_INDEX.store(index as u64, Ordering::SeqCst);
}

pub struct FolderWatcher {
    pub watcher: Option<notify::RecommendedWatcher>,
    pub current_path: Option<String>,
}

pub struct WatcherState(pub Mutex<FolderWatcher>);

/// Security helper to ensure paths are within the currently open directory.
pub fn validate_path(path_str: &str, watcher_state: &tauri::State<'_, WatcherState>) -> Result<PathBuf, String> {
    let ws = watcher_state.0.lock().unwrap();
    let current_root = ws.current_path.as_ref()
        .ok_or("No directory is currently open")?;
    
    let root_path = PathBuf::from(current_root).canonicalize()
        .map_err(|e| format!("Invalid root path: {}", e))?;

    let path = PathBuf::from(path_str);
    if !path.exists() {
        return Ok(path); // Non-existent paths (like for new files) are allowed if in root
    }
    
    let canonical_path = path.canonicalize()
        .map_err(|e| format!("Invalid path {}: {}", path_str, e))?;
    
    if !canonical_path.starts_with(&root_path) {
        return Err(format!("Access denied: Path {} is outside of the open directory", path_str));
    }
    
    Ok(canonical_path)
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

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SimilarityResult {
    pub images: Vec<ImageInfo>,
    pub matched_tags: Vec<String>,
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
    let last_event = Arc::new(Mutex::new(std::time::Instant::now()));

    let mut watcher = notify::RecommendedWatcher::new(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => {
                if event.kind.is_modify() || event.kind.is_create() || event.kind.is_remove() {
                    let mut last = last_event.lock().unwrap();
                    if last.elapsed() > std::time::Duration::from_millis(500) {
                        *last = std::time::Instant::now();
                        let app = app_handle_clone.clone();
                        let p = path_buf.to_string_lossy().to_string();
                        
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

                            let db_state = app.state::<DbState>();
                            let mut state = db_state.0.lock().unwrap();
                            if let Some(db) = state.as_mut() {
                                let indexed_stats = db.get_folder_stats(&folder_str, is_recursive).unwrap_or_default();
                                let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| img.path.clone()).collect();
                                let stale_paths: Vec<_> = indexed_stats.keys().filter(|path| !disk_paths.contains(*path)).cloned().collect();
                                if !stale_paths.is_empty() { let _ = db.delete_images(&stale_paths); }

                                let needs_indexing: Vec<_> = disk_entries.into_iter().filter(|img| {
                                    match indexed_stats.get(&img.path) {
                                        Some(&(m, s)) => m != img.mtime || s != img.size,
                                        None => true,
                                    }
                                }).collect();

                                if !needs_indexing.is_empty() {
                                    let results: Vec<_> = needs_indexing.par_iter().map(|img| {
                                        (img, read_metadata(&img.path).unwrap_or_default())
                                    }).collect();
                                    let _ = db.insert_images_batch(results);
                                    let _ = app.emit("metadata-chunk-updated", ());
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
pub async fn scan_directory(
    app_handle: tauri::AppHandle, 
    watcher_state: tauri::State<'_, WatcherState>,
    _db_state: tauri::State<'_, DbState>,
    path: String, 
    sort_method: Option<SortMethod>, 
    recursive: Option<bool>, 
    force_reindex: Option<bool>
) -> Result<ScanResult, String> {
    let input_path = PathBuf::from(&path);
    let (root, target_file) = if input_path.is_file() {
        (input_path.parent().ok_or("No parent directory")?.to_path_buf(), Some(input_path))
    } else if input_path.is_dir() {
        (input_path, None)
    } else {
        return Err("Path does not exist".to_string());
    };

    let root_str = root.to_string_lossy().to_string().replace("\\", "/");
    let is_recursive = recursive.unwrap_or(false);
    let method = sort_method.unwrap_or(SortMethod::NameAsc);

    {
        let mut ws = watcher_state.0.lock().unwrap();
        if ws.current_path.as_ref() != Some(&root_str) {
            ws.watcher = None; 
            match setup_watcher(app_handle.clone(), &root, is_recursive, method) {
                Ok(w) => {
                    ws.watcher = Some(w);
                    ws.current_path = Some(root_str.clone());
                },
                Err(e) => log::error!("Failed to start watcher: {}", e),
            }
        }
    }

    let is_forced = force_reindex.unwrap_or(false);
    let depth = if is_recursive { 99 } else { 1 };
    let extensions = ["png", "jpg", "jpeg", "webp"];
    
    let disk_entries: Vec<ImageInfo> = WalkDir::new(&root)
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

    let scan_id = CURRENT_SCAN_ID.fetch_add(1, Ordering::SeqCst) + 1;
    let app_handle_clone = app_handle.clone();
    let root_str_clone = root_str.clone();
    let images_for_bg = images.clone();

    std::thread::spawn(move || {
        let app_handle = app_handle_clone;
        let db_state = app_handle.state::<DbState>();
        if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { return; }

        let indexed_stats = {
            let state = db_state.0.lock().unwrap();
            let db = state.as_ref().unwrap();
            db.get_folder_stats(&root_str_clone, is_recursive).unwrap_or_default()
        };

        let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| img.path.clone()).collect();
        let stale_paths: Vec<_> = indexed_stats.keys().filter(|p| !disk_paths.contains(*p)).cloned().collect();
        if !stale_paths.is_empty() {
            let state = db_state.0.lock().unwrap();
            let _ = state.as_ref().unwrap().delete_images(&stale_paths);
        }

        let mut remaining_needs: Vec<_> = disk_entries.into_iter().filter(|img| {
            if is_forced { return true; }
            match indexed_stats.get(&img.path) {
                Some(&(m, s)) => m != img.mtime || s != img.size,
                None => true,
            }
        }).collect();

        if remaining_needs.is_empty() { return; }

        let path_to_index: HashMap<String, usize> = images_for_bg.iter().enumerate().map(|(i, img)| (img.path.clone(), i)).collect();
        CURRENT_FOCUS_INDEX.store(initial_index as u64, Ordering::SeqCst);

        let total = remaining_needs.len();
        let _ = app_handle.emit("index-progress", IndexProgress { total, current: 0, is_indexing: true });

        let mut processed_count = 0;
        let mut last_sort_focus: isize = -1000;

        while !remaining_needs.is_empty() {
            if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id {
                let _ = app_handle.emit("index-progress", IndexProgress { total, current: processed_count, is_indexing: false });
                return;
            }

            let current_focus = CURRENT_FOCUS_INDEX.load(Ordering::SeqCst) as isize;
            if current_focus != last_sort_focus {
                remaining_needs.sort_unstable_by_key(|img| {
                    let pos = path_to_index.get(&img.path).copied().unwrap_or(0);
                    std::cmp::Reverse((pos as isize - current_focus).abs())
                });
                last_sort_focus = current_focus;
            }

            let chunk_size = 5;
            let mut batch = Vec::with_capacity(chunk_size);
            for _ in 0..chunk_size {
                if let Some(img) = remaining_needs.pop() { batch.push(img); } else { break; }
            }
            if batch.is_empty() { break; }

            let results: Vec<_> = batch.iter().map(|img| (img, read_metadata(&img.path).unwrap_or_default())).collect();

            {
                let mut state = db_state.0.lock().unwrap();
                if let Some(db_mut) = state.as_mut() {
                    let _ = db_mut.insert_images_batch(results);
                }
            }

            processed_count += batch.len();
            let _ = app_handle.emit("index-progress", IndexProgress { total, current: processed_count, is_indexing: true });
            let _ = app_handle.emit("metadata-chunk-updated", ());
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        let _ = app_handle.emit("index-progress", IndexProgress { total, current: total, is_indexing: false });
    });

    Ok(ScanResult { images, initial_index, folder: root_str })
}

#[tauri::command]
pub async fn scan_paths(_app_handle: tauri::AppHandle, db_state: tauri::State<'_, DbState>, paths: Vec<String>, recursive: bool) -> Result<Vec<ImageInfo>, String> {
    let extensions = ["png", "jpg", "jpeg", "webp"];
    let discovered_paths: Vec<String> = paths.par_iter().flat_map(|path| {
        let input_path = Path::new(path);
        if !input_path.exists() { return Vec::new(); }
        if input_path.is_file() {
            if let Some(ext) = input_path.extension().and_then(|s| s.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) { return vec![input_path.to_string_lossy().to_string()]; }
            }
            return Vec::new();
        }
        let depth = if recursive { 99 } else { 1 };
        WalkDir::new(input_path).max_depth(depth).into_iter().filter_map(|e| e.ok()).filter(|e| e.file_type().is_file()).filter_map(|entry| {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) { return Some(entry.path().to_string_lossy().to_string()); }
            }
            None
        }).collect::<Vec<_>>()
    }).collect();

    if discovered_paths.is_empty() { return Ok(Vec::new()); }

    let mut all_images = Vec::with_capacity(discovered_paths.len());
    let mut paths_to_stat = Vec::new();

    {
        let state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_ref() {
            let indexed_data = db.get_images_by_paths(&discovered_paths).unwrap_or_default();
            let indexed_map: HashMap<String, crate::db::ImageInfoWithTags> = indexed_data.into_iter().map(|img| (img.path.clone(), img)).collect();
            for path in discovered_paths {
                if let Some(indexed) = indexed_map.get(&path) {
                    all_images.push(ImageInfo { path: indexed.path.clone(), name: indexed.name.clone(), mtime: indexed.mtime, size: indexed.size });
                } else { paths_to_stat.push(path); }
            }
        } else { paths_to_stat = discovered_paths; }
    }

    if !paths_to_stat.is_empty() {
        let new_images: Vec<ImageInfo> = paths_to_stat.par_iter().filter_map(|path| {
            let p = Path::new(path);
            let meta = p.metadata().ok()?;
            let mtime = meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_secs();
            Some(ImageInfo { path: path.clone(), name: p.file_name()?.to_string_lossy().to_string(), mtime, size: meta.len() })
        }).collect();
        all_images.extend(new_images);
    }

    {
        let mut state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_mut() {
            let path_strings: Vec<String> = all_images.iter().map(|img| img.path.clone()).collect();
            let indexed_stats = db.get_indexed_stats_batch(&path_strings).unwrap_or_default();
            let needs_parsing: Vec<_> = all_images.iter().filter(|img| {
                match indexed_stats.get(&img.path) { Some(&(m, s)) => m != img.mtime || s != img.size, None => true }
            }).cloned().collect();

            if !needs_parsing.is_empty() {
                let results: Vec<_> = needs_parsing.par_iter().map(|img| (img, read_metadata(&img.path).unwrap_or_default())).collect();
                let _ = db.insert_images_batch(results);
            }
        }
    }
    Ok(all_images)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FilterOptions { models: Vec<String>, samplers: Vec<String> }

#[tauri::command]
pub fn get_filter_options(db_state: tauri::State<'_, DbState>, folder: String) -> Result<FilterOptions, String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    let models = db.get_distinct_models(&folder).map_err(|e| e.to_string())?;
    let samplers = db.get_distinct_samplers(&folder).map_err(|e| e.to_string())?;
    Ok(FilterOptions { models, samplers })
}

#[tauri::command]
pub fn search_advanced_images(
    db_state: tauri::State<'_, DbState>, 
    folder: String, 
    query: String, 
    model: String, 
    sampler: String, 
    sort_method: SortMethod, 
    recursive: bool,
    auth_folders: Option<Vec<String>>
) -> Result<Vec<ImageInfo>, String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    
    if let Some(folders) = auth_folders {
        if !folders.is_empty() {
            return db.search_advanced_multi(&folders, &query, &model, &sampler, sort_method).map_err(|e| e.to_string());
        }
    }
    
    db.search_advanced(&folder, &query, &model, &sampler, sort_method, recursive).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn search_similar_images(
    db_state: tauri::State<'_, DbState>,
    auth_folders: Vec<String>,
    current_image_path: String,
    num_tags: usize,
    filter: crate::wildcard::types::WildcardFilter,
    active_folder: Option<String>,
) -> Result<SimilarityResult, String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;

    log::info!(
        "[Similarity Search] START: active_folder={:?}, current_image='{}', num_tags={}, auth_folders={:?}",
        active_folder, current_image_path, num_tags, auth_folders
    );

    if auth_folders.is_empty() {
        log::warn!("[Similarity Search] END: auth_folders is empty!");
        return Ok(SimilarityResult { images: Vec::new(), matched_tags: Vec::new() });
    }

    // 1. Get current image metadata/prompt
    let current_meta = db.get_metadata(&current_image_path)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Current image metadata not found in database".to_string())?;

    let prompt = current_meta.prompt.ok_or_else(|| "Current image has no prompt/tags".to_string())?;
    if prompt.trim().is_empty() {
        log::warn!("[Similarity Search] END: Current image prompt/tags is empty!");
        return Err("Current image has empty prompt/tags".to_string());
    }

    // 2. Parse current image tags
    let current_tags: std::collections::HashSet<String> = prompt.split(',')
        .map(|s| crate::wildcard::utils::remove_unbalanced_braces(s))
        .filter(|s| !s.trim().is_empty())
        .collect();
    log::info!("[Similarity Search] Parsed tags ({} total): {:?}", current_tags.len(), current_tags);

    // 3. Filter current tags using WildcardFilter
    let filtered_tags = crate::wildcard::filter::apply_filters(current_tags, &filter);
    log::info!("[Similarity Search] Filtered tags (after wildcard filters, {} remaining): {:?}", filtered_tags.len(), filtered_tags);
    if filtered_tags.is_empty() {
        log::warn!("[Similarity Search] END: No tags remaining after applying wildcard filters!");
        return Ok(SimilarityResult { images: Vec::new(), matched_tags: Vec::new() });
    }

    // 4. Read pre-computed tag frequencies from the tag_counts table (O(1) index lookup).
    let global_counts: HashMap<String, u32> = db.get_tag_counts()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    // 5. Select the rarest tags
    let mut tag_freqs: Vec<(String, u32)> = filtered_tags.into_iter()
        .map(|tag| {
            let key = tag.trim().to_lowercase();
            let count = global_counts.get(&key).copied().unwrap_or(1);
            (tag, count)
        })
        .collect();

    // Sort by frequency ascending (rarest first)
    tag_freqs.sort_by_key(|&(_, count)| count);
    log::info!("[Similarity Search] Filtered tag frequencies (global db counts): {:?}", tag_freqs);

    // Take the top `num_tags` rarest tags
    let selected_tags: Vec<String> = tag_freqs.into_iter()
        .take(num_tags)
        .map(|(tag, _)| tag)
        .collect();
    log::info!("[Similarity Search] Selected rarest tags: {:?}", selected_tags);

    if selected_tags.is_empty() {
        log::warn!("[Similarity Search] END: selected_tags is empty!");
        return Ok(SimilarityResult { images: Vec::new(), matched_tags: Vec::new() });
    }

    // 6. Search for images under auth_folders containing all selected tags
    let mut sql = "SELECT path, name, mtime, size, prompt FROM images WHERE (".to_string();
    let mut params: Vec<String> = Vec::new();

    // Folder condition
    for (i, folder) in auth_folders.iter().enumerate() {
        if i > 0 {
            sql.push_str(" OR ");
        }
        let normalized = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let param_idx = params.len() + 1;
        sql.push_str(&format!("(path LIKE ?{} || '/%' COLLATE NOCASE OR path = ?{} COLLATE NOCASE)", param_idx, param_idx));
        params.push(normalized);
    }
    sql.push_str(")");

    // Tag condition using LIKE for initial SQLite filtering
    for tag in &selected_tags {
        let param_idx = params.len() + 1;
        sql.push_str(&format!(" AND (prompt LIKE ?{} COLLATE NOCASE)", param_idx));
        params.push(format!("%{}%", tag));
    }

    sql.push_str(" ORDER BY mtime DESC");

    let mut stmt = db.conn.prepare(&sql).map_err(|e: rusqlite::Error| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row: &rusqlite::Row| {
         Ok((
             row.get::<_, String>(0)?,
             row.get::<_, String>(1)?,
             row.get::<_, i64>(2)? as u64,
             row.get::<_, i64>(3)? as u64,
             row.get::<_, Option<String>>(4)?,
         ))
    }).map_err(|e: rusqlite::Error| e.to_string())?;

    let candidates: Vec<_> = rows.into_iter().filter_map(|r| r.ok()).collect();
    let candidates_count = candidates.len();
    log::info!("[Similarity Search] SQLite candidates found: {}", candidates_count);

    // 7. Verify candidates in Rust (exact match for all selected tags)
    let mut matched_images = Vec::new();
    let mut stale_paths = Vec::new();
    let lower_selected: Vec<String> = selected_tags.iter().map(|t: &String| t.trim().to_lowercase()).collect();

    for (path, name, mtime, size, prompt_opt) in candidates {
        // Check if it exists on disk!
        if !std::path::Path::new(&path).exists() {
            stale_paths.push(path);
            continue;
        }
        
        if let Some(p) = prompt_opt {
            // Parse this candidate's tags
            let candidate_tags: std::collections::HashSet<String> = p.split(',')
                .map(|s: &str| crate::wildcard::utils::remove_unbalanced_braces(s).trim().to_lowercase())
                .filter(|s: &String| !s.is_empty())
                .collect();

            // Check if candidate contains all selected rarest tags
            let contains_all = lower_selected.iter().all(|t| candidate_tags.contains(t));
            if contains_all {
                matched_images.push(ImageInfo { path, name, mtime, size });
            }
        }
    }

    if !stale_paths.is_empty() {
        log::info!("[Similarity Search] Cleaning up {} stale/deleted paths from database.", stale_paths.len());
        let _ = db.delete_images(&stale_paths);
    }

    log::info!(
        "[Similarity Search] END: matched {} similar images from {} candidates.",
        matched_images.len(), candidates_count
    );

    Ok(SimilarityResult {
        images: matched_images,
        matched_tags: selected_tags,
    })
}

#[tauri::command]
pub fn get_tag_suggestions(db_state: tauri::State<'_, DbState>, folder: String, current_input: String, recursive: bool) -> Result<Vec<(String, usize)>, String> {
    if current_input.trim().is_empty() { return Ok(Vec::new()); }
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    let prompts = db.get_all_prompts(&folder, recursive).unwrap_or_default();
    let mut tag_counts: HashMap<String, usize> = HashMap::new();
    let current_lower = current_input.trim().to_lowercase();
    for prompt in prompts {
        for tag in prompt.split(',') {
            let tag_trimmed = tag.trim();
            let tag_lower = tag_trimmed.to_lowercase();
            if tag_lower.starts_with(&current_lower) && tag_lower != current_lower { *tag_counts.entry(tag_trimmed.to_string()).or_insert(0) += 1; }
        }
    }
    let mut sorted_tags: Vec<_> = tag_counts.into_iter().collect();
    sorted_tags.sort_by(|a, b| b.1.cmp(&a.1));
    Ok(sorted_tags.into_iter().take(5).collect())
}

#[tauri::command]
pub fn search_images(db_state: tauri::State<'_, DbState>, folder: String, query: String) -> Result<Vec<ImageInfo>, String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    db.search(&folder, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_batch_range(db_state: tauri::State<'_, DbState>, paths: Vec<String>, current_index: usize) -> Result<(usize, usize), String> {
    if paths.is_empty() || current_index >= paths.len() { return Ok((current_index, current_index)); }
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    let current_path = Path::new(&paths[current_index]);
    let folder = current_path.parent().map(|p| p.to_string_lossy().to_string());
    let cached_prompts = if let Some(f) = folder { db.get_folder_prompts(&f).ok() } else { None };
    let get_prompt = |index: usize| -> Option<String> {
        let path = &paths[index];
        if let Some(cache) = &cached_prompts { if let Some(cached_val) = cache.get(path) { return cached_val.clone(); } }
        read_metadata(path).ok().and_then(|m| m.prompt)
    };
    let target_prompt = match get_prompt(current_index) { Some(p) => p, None => return Ok((current_index, current_index)) };
    let mut start = current_index;
    let mut end = current_index;
    while start > 0 { if let Some(p) = get_prompt(start - 1) { if p == target_prompt { start -= 1; continue; } } break; }
    while end < paths.len() - 1 { if let Some(p) = get_prompt(end + 1) { if p == target_prompt { end += 1; continue; } } break; }
    Ok((start, end))
}
