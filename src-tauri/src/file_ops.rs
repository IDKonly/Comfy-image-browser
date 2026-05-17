use std::fs;
use std::path::{Path, PathBuf};
use crate::db::DbState;
use crate::scanner::WatcherState;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutoClassifyResult {
    pub total_moved: usize,
    pub folder_summary: std::collections::HashMap<String, usize>,
}

/// Helper to validate if paths are within the authorized root directory.
fn validate_paths(paths: &[String], watcher_state: &tauri::State<'_, WatcherState>) -> Result<PathBuf, String> {
    let ws = watcher_state.0.lock().unwrap();
    let current_root = ws.current_path.as_ref()
        .ok_or("No directory is currently open")?;
    
    // Normalize and canonicalize for robust comparison
    let root_path = PathBuf::from(current_root).canonicalize()
        .map_err(|e| format!("Invalid root path: {}", e))?;

    for path_str in paths {
        let path = PathBuf::from(path_str);
        if !path.exists() { continue; } 
        
        let canonical_path = path.canonicalize()
            .map_err(|e| format!("Invalid path {}: {}", path_str, e))?;
        
        if !canonical_path.starts_with(&root_path) {
            return Err(format!("Access denied: Path {} is outside of the open directory", path_str));
        }
    }
    
    Ok(root_path)
}

pub fn delete_to_trash_impl(
    db_state: &DbState, 
    paths: Vec<String>
) -> Result<(), String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;

    for path in paths {
        let p = Path::new(&path);
        if !p.exists() { 
            let _ = db.delete_image(&path);
            continue; 
        }

        let parent = p.parent().ok_or("No parent directory")?;
        let is_in_trash = parent.file_name()
            .map(|n| n.to_string_lossy().to_lowercase() == "_trash")
            .unwrap_or(false);

        if is_in_trash {
            fs::remove_file(p).map_err(|e| e.to_string())?;
            let _ = db.delete_image(&path);
        } else {
            let trash_dir = parent.join("_Trash");
            if !trash_dir.exists() {
                fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
            }

            let dest = trash_dir.join(p.file_name().ok_or("Invalid filename")?);
            let dest_str = dest.to_string_lossy().to_string();
            fs::rename(p, dest).map_err(|e| e.to_string())?;
            let _ = db.update_image_path(&path, &dest_str);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn delete_to_trash(
    db_state: tauri::State<'_, DbState>, 
    watcher_state: tauri::State<'_, WatcherState>,
    paths: Vec<String>
) -> Result<(), String> {
    validate_paths(&paths, &watcher_state)?;
    delete_to_trash_impl(&db_state, paths)
}

pub fn move_to_keep_impl(
    db_state: &DbState, 
    paths: Vec<String>
) -> Result<(), String> {
    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;

    for path in paths {
        let p = Path::new(&path);
        if !p.exists() { continue; }

        let parent = p.parent().ok_or("No parent directory")?;
        let keep_dir = parent.join("_Keep");
        
        if !keep_dir.exists() {
            fs::create_dir(&keep_dir).map_err(|e| e.to_string())?;
        }

        let dest = keep_dir.join(p.file_name().ok_or("Invalid filename")?);
        let dest_str = dest.to_string_lossy().to_string();
        fs::rename(p, dest).map_err(|e| e.to_string())?;
        let _ = db.update_image_path(&path, &dest_str);
    }
    Ok(())
}

#[tauri::command]
pub fn move_to_keep(
    db_state: tauri::State<'_, DbState>, 
    watcher_state: tauri::State<'_, WatcherState>,
    paths: Vec<String>
) -> Result<(), String> {
    validate_paths(&paths, &watcher_state)?;
    move_to_keep_impl(&db_state, paths)
}

#[tauri::command]
pub fn move_files_to_folder(
    db_state: tauri::State<'_, DbState>, 
    watcher_state: tauri::State<'_, WatcherState>,
    paths: Vec<String>, 
    folder_name: String
) -> Result<(), String> {
    if paths.is_empty() { return Ok(()); }
    validate_paths(&paths, &watcher_state)?;

    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;

    let first_path = Path::new(&paths[0]);
    let parent = first_path.parent().ok_or("No parent directory")?;
    let dest_dir = parent.join(&folder_name);

    if !dest_dir.exists() {
        fs::create_dir(&dest_dir).map_err(|e| e.to_string())?;
    }

    for path_str in paths {
        let p = Path::new(&path_str);
        if p.exists() {
            let dest = dest_dir.join(p.file_name().ok_or("Invalid filename")?);
            let dest_str = dest.to_string_lossy().to_string();
            fs::rename(p, dest).map_err(|e| e.to_string())?;
            let _ = db.update_image_path(&path_str, &dest_str);
        }
    }

    Ok(())
}

#[tauri::command]
pub fn undo_move(
    db_state: tauri::State<'_, DbState>, 
    watcher_state: tauri::State<'_, WatcherState>,
    original_path: String, 
    current_path: String
) -> Result<(), String> {
    validate_paths(&vec![original_path.clone(), current_path.clone()], &watcher_state)?;
    
    let src = Path::new(&current_path);
    let dst = Path::new(&original_path);
    
    if !src.exists() { return Err("Source file for undo does not exist".to_string()); }
    
    if let Some(parent) = dst.parent() {
        if !parent.exists() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    }
    
    fs::rename(src, dst).map_err(|e| e.to_string())?;

    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    let _ = db.update_image_path(&current_path, &original_path);
    
    Ok(())
}

#[tauri::command]
pub fn auto_classify(
    db_state: tauri::State<'_, DbState>,
    watcher_state: tauri::State<'_, WatcherState>,
    root: String, 
    recursive: bool
) -> Result<AutoClassifyResult, String> {
    validate_paths(&vec![root.clone()], &watcher_state)?;
    
    let root_path = Path::new(&root);
    if !root_path.exists() { return Err("Root path does not exist".to_string()); }

    let entries = fs::read_dir(root_path).map_err(|e| e.to_string())?;
    let mut subfolders = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.path().is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('_') || name.starts_with('.') { continue; } 
            subfolders.push(entry.path().to_string_lossy().to_string());
        }
    }

    if subfolders.is_empty() {
        return Ok(AutoClassifyResult { total_moved: 0, folder_summary: std::collections::HashMap::new() });
    }

    let state = db_state.0.lock().unwrap();
    let db = state.as_ref().ok_or("Database not initialized")?;
    let counts = db.get_subfolder_counts(subfolders.clone()).map_err(|e| e.to_string())?;

    subfolders.sort_by(|a, b| {
        let count_a = counts.get(a).unwrap_or(&0);
        let count_b = counts.get(b).unwrap_or(&0);
        count_b.cmp(count_a)
    });

    let images = db.get_all_images_with_tags(&root, recursive).map_err(|e| e.to_string())?;
    
    let mut move_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut total_moved = 0;

    for img in images {
        let img_path = Path::new(&img.path);
        let img_parent = img_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        if subfolders.contains(&img_parent) { continue; }

        for folder_path_str in &subfolders {
            let folder_path = Path::new(folder_path_str);
            let folder_name = folder_path.file_name().unwrap().to_string_lossy().to_string().to_lowercase();
            
            let name_match = img.name.to_lowercase().contains(&folder_name);
            let prompt_match = img.prompt.as_ref().map(|p| p.to_lowercase().contains(&folder_name)).unwrap_or(false);
            let neg_match = img.negative_prompt.as_ref().map(|p| p.to_lowercase().contains(&folder_name)).unwrap_or(false);

            if name_match || prompt_match || neg_match {
                move_map.entry(folder_path_str.clone()).or_default().push(img.path);
                total_moved += 1;
                break;
            }
        }
    }

    let mut folder_summary = std::collections::HashMap::new();
    for (dest_folder, paths) in move_map {
        let dest_path = Path::new(&dest_folder);
        let mut actual_moved = 0;
        for path_str in paths {
            let src = Path::new(&path_str);
            if src.exists() {
                let dest = dest_path.join(src.file_name().unwrap());
                let dest_str = dest.to_string_lossy().to_string();
                if fs::rename(src, dest).is_ok() {
                    let _ = db.update_image_path(&path_str, &dest_str);
                    actual_moved += 1;
                }
            }
        }
        let folder_name = dest_path.file_name().unwrap().to_string_lossy().to_string();
        folder_summary.insert(folder_name, actual_moved);
    }

    Ok(AutoClassifyResult { total_moved, folder_summary })
}
