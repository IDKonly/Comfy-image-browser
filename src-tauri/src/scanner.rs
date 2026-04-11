use std::path::{Path, PathBuf};
use std::collections::HashMap;
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
pub async fn scan_directory(
    app_handle: tauri::AppHandle, 
    watcher_state: tauri::State<'_, WatcherState>,
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

    // Update Watcher
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

    // 1. FAST Disk Scan (Now in async task)
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
        let db_path = match get_db_path(&app_handle) {
            Ok(p) => p,
            Err(e) => { log::error!("Background scan failed to get DB path: {}", e); return; }
        };
        let mut db = match DB::open(&db_path) {
            Ok(d) => d,
            Err(e) => { log::error!("Background scan failed to open DB: {}", e); return; }
        };

        if CURRENT_SCAN_ID.load(Ordering::SeqCst) != scan_id { return; }

        let indexed_stats = match db.get_folder_stats(&root_str_clone, is_recursive) {
            Ok(s) => s,
            Err(_) => std::collections::HashMap::new()
        };

        let disk_paths: std::collections::HashSet<_> = disk_entries.iter().map(|img| img.path.clone()).collect();
        let stale_paths: Vec<_> = indexed_stats.keys().filter(|p| !disk_paths.contains(*p)).cloned().collect();
        if !stale_paths.is_empty() {
            let _ = db.delete_images(&stale_paths);
        }

        let mut remaining_needs: Vec<_> = disk_entries.into_iter().filter(|img| {
            if is_forced { return true; }
            match indexed_stats.get(&img.path) {
                Some(&(m, s)) => m != img.mtime || s != img.size,
                None => true,
            }
        }).collect();

        if remaining_needs.is_empty() { return; }

        let path_to_index: std::collections::HashMap<String, usize> = images_for_bg.iter().enumerate().map(|(i, img)| (img.path.clone(), i)).collect();
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

            // [성능 핵심] 사용자의 포커스가 변경될 때만 재정렬 수행
            let current_focus = CURRENT_FOCUS_INDEX.load(Ordering::SeqCst) as isize;
            if current_focus != last_sort_focus {
                // 거리를 기준으로 내림차순(Reverse) 정렬.
                // 가장 가까운 이미지가 배열의 '가장 끝'으로 이동하여 pop() 연산 시 O(1)의 비용으로 즉시 추출됨.
                remaining_needs.sort_unstable_by_key(|img| {
                    let pos = path_to_index.get(&img.path).copied().unwrap_or(0);
                    std::cmp::Reverse((pos as isize - current_focus).abs())
                });
                last_sort_focus = current_focus;
            }

            // CPU 및 I/O 점유율을 최소화하기 위해 극소 단위(5개)의 청크만 처리
            let chunk_size = 5;
            let mut batch = Vec::with_capacity(chunk_size);
            for _ in 0..chunk_size {
                if let Some(img) = remaining_needs.pop() {
                    batch.push(img);
                } else {
                    break;
                }
            }

            if batch.is_empty() {
                break;
            }

            // [성능 핵심] Rayon 병렬 처리(par_iter) 제거.
            // 백그라운드 인덱싱이 메인 코어와 디스크 대역폭을 독점하는 현상(Starvation)을 방지.
            let results: Vec<_> = batch.iter().map(|img| {
                (img, read_metadata(&img.path).unwrap_or_default())
            }).collect();

            if let Err(e) = db.insert_images_batch(results) {
                log::error!("Batch insert failed: {}", e);
            }

            processed_count += batch.len();
            let _ = app_handle.emit("index-progress", IndexProgress { total, current: processed_count, is_indexing: true });
            let _ = app_handle.emit("metadata-chunk-updated", ());
            
            // 포그라운드 사용자 작업(이미지 로딩, 단일 메타데이터 조회)이 DB와 I/O에 접근할 수 있도록 
            // 청크 처리 사이에 의도적인 50ms 휴식(Yield) 부여
            std::thread::sleep(std::time::Duration::from_millis(50));
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
pub async fn scan_paths(app_handle: tauri::AppHandle, paths: Vec<String>, recursive: bool) -> Result<Vec<ImageInfo>, String> {
    let extensions = ["png", "jpg", "jpeg", "webp"];

    // 1. Collect all potential image paths first (Minimal I/O)
    let discovered_paths: Vec<String> = paths.par_iter().flat_map(|path| {
        let input_path = Path::new(path);
        if !input_path.exists() { return Vec::new(); }

        if input_path.is_file() {
            if let Some(ext) = input_path.extension().and_then(|s| s.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) {
                    return vec![input_path.to_string_lossy().to_string()];
                }
            }
            return Vec::new();
        }

        // Directory scanning - only collect paths
        let depth = if recursive { 99 } else { 1 };
        WalkDir::new(input_path)
            .max_depth(depth)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .filter_map(|entry| {
                if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                    if extensions.contains(&ext.to_lowercase().as_str()) {
                        return Some(entry.path().to_string_lossy().to_string());
                    }
                }
                None
            })
            .collect::<Vec<_>>()
    }).collect();

    if discovered_paths.is_empty() { return Ok(Vec::new()); }

    // 2. Batch query DB for existing info
    let db_path = get_db_path(&app_handle)?;
    let mut all_images = Vec::with_capacity(discovered_paths.len());
    let mut paths_to_stat = Vec::new();

    if let Ok(db) = DB::open(&db_path) {
        let indexed_data = db.get_images_by_paths(&discovered_paths).unwrap_or_default();
        let indexed_map: HashMap<String, crate::db::ImageInfoWithTags> = indexed_data.into_iter().map(|img| (img.path.clone(), img)).collect();

        for path in discovered_paths {
            if let Some(indexed) = indexed_map.get(&path) {
                // [성능 핵심] DB에 이미 있는 이미지는 디스크 stat() 없이 즉시 정보 활용
                all_images.push(ImageInfo {
                    path: indexed.path.clone(),
                    name: indexed.name.clone(),
                    mtime: indexed.mtime,
                    size: indexed.size,
                });
            } else {
                paths_to_stat.push(path);
            }
        }
    } else {
        paths_to_stat = discovered_paths;
    }

    // Optimization: Only parallel stat() for UNKNOWN files
    if !paths_to_stat.is_empty() {
        let new_images: Vec<ImageInfo> = paths_to_stat.par_iter().filter_map(|path| {
            let p = Path::new(path);
            if let Ok(meta) = p.metadata() {
                if let Ok(mtime_res) = meta.modified() {
                    let mtime = mtime_res.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
                    return Some(ImageInfo {
                        path: path.clone(),
                        name: p.file_name()?.to_string_lossy().to_string(),
                        mtime,
                        size: meta.len(),
                    });
                }
            }
            None
        }).collect();
        all_images.extend(new_images);
    }

    // 3. Update DB for new/changed files (if any were new or changed)
    if let Ok(mut db) = DB::open(&db_path) {
        let path_strings: Vec<String> = all_images.iter().map(|img| img.path.clone()).collect();
        let indexed_stats = db.get_indexed_stats_batch(&path_strings).unwrap_or_default();

        let needs_parsing: Vec<_> = all_images.iter().filter(|img| {
            match indexed_stats.get(&img.path) {
                Some(&(m, s)) => m != img.mtime || s != img.size,
                None => true,
            }
        }).cloned().collect();

        if !needs_parsing.is_empty() {
            let results: Vec<_> = needs_parsing.par_iter().map(|img| {
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
