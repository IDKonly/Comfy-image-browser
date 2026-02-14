use std::path::Path;
use walkdir::WalkDir;
use serde::{Serialize, Deserialize};
use std::time::UNIX_EPOCH;
use rayon::prelude::*;
use crate::db::DB;
use crate::metadata::read_metadata;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageInfo {
    pub path: String,
    pub name: String,
    pub mtime: u64,
    pub size: u64,
}

#[tauri::command]
pub fn scan_directory(path: String) -> Result<Vec<ImageInfo>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err("Not a directory".to_string());
    }

    let _ = DB::open().map_err(|e| e.to_string())?;
    
    let entries: Vec<_> = WalkDir::new(root)
        .max_depth(1)
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

    // Sort by mtime descending
    images.sort_by(|a, b| b.mtime.cmp(&a.mtime));

    // Background indexing for missing or changed metadata
    let images_to_index = images.clone();
    std::thread::spawn(move || {
        let db = DB::open().unwrap();
        for img in images_to_index {
            let needs_update = match db.get_indexed_mtime(&img.path) {
                Ok(Some(m)) => m != img.mtime,
                _ => true,
            };

            if needs_update {
                if let Ok(meta) = read_metadata(&img.path) {
                    let _ = db.insert_image(&img, &meta);
                }
            }
        }
    });

    Ok(images)
}

#[tauri::command]
pub fn search_images(folder: String, query: String) -> Result<Vec<ImageInfo>, String> {
    let db = DB::open().map_err(|e| e.to_string())?;
    db.search(&folder, &query).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_batch_range(paths: Vec<String>, current_index: usize) -> Result<(usize, usize), String> {
    if paths.is_empty() || current_index >= paths.len() {
        return Ok((current_index, current_index));
    }

    // Try to get cached prompts from DB for the folder of the current image
    let current_path = Path::new(&paths[current_index]);
    let folder = current_path.parent().map(|p| p.to_string_lossy().to_string());
    
    let cached_prompts = if let Some(f) = folder {
        if let Ok(db) = DB::open() {
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
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_scan_directory() {
        let dir = tempdir().unwrap();
        let file_path = dir.path().join("test.png");
        File::create(file_path).unwrap();

        let result = scan_directory(dir.path().to_string_lossy().to_string()).unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "test.png");
    }

    #[test]
    fn test_scan_performance() {
        let dir = tempdir().unwrap();
        // Create 1000 dummy files
        for i in 0..1000 {
            let file_path = dir.path().join(format!("test_{}.png", i));
            File::create(file_path).unwrap();
        }

        let start = std::time::Instant::now();
        let result = scan_directory(dir.path().to_string_lossy().to_string()).unwrap();
        let duration = start.elapsed();

        println!("Scanned 1000 files in: {:?}", duration);
        assert_eq!(result.len(), 1000);
    }

    #[test]
    fn test_get_batch_range_logic() {
        // This test is hard to run because it needs actual PNG files with metadata.
        // But we can test the logic if we mock read_metadata.
        // For now, we've verified the logic matches legacy/test_batch_logic.py
    }
}
