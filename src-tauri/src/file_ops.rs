use std::fs;
use std::path::{Path, PathBuf};
use crate::db::DB;
use tauri::Manager;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AutoClassifyResult {
    pub total_moved: usize,
    pub folder_summary: std::collections::HashMap<String, usize>,
}

#[tauri::command]
pub fn delete_to_trash(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;

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
pub fn move_to_keep(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;

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
pub fn move_files_to_folder(app_handle: tauri::AppHandle, paths: Vec<String>, folder_name: String) -> Result<(), String> {
    if paths.is_empty() { return Ok(()); }

    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;

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
pub fn undo_move(app_handle: tauri::AppHandle, original_path: String, current_path: String) -> Result<(), String> {
    let src = Path::new(&current_path);
    let dst = Path::new(&original_path);
    
    if !src.exists() {
        return Err("Source file for undo does not exist".to_string());
    }
    
    if let Some(parent) = dst.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    
    fs::rename(src, dst).map_err(|e| e.to_string())?;

    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    let _ = db.update_image_path(&current_path, &original_path);
    
    Ok(())
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
pub fn auto_classify(app_handle: tauri::AppHandle, root: String, recursive: bool) -> Result<AutoClassifyResult, String> {
    let root_path = Path::new(&root);
    if !root_path.exists() { return Err("Root path does not exist".to_string()); }

    // 1. List direct subfolders
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

    // 2. Open DB and get priority based on existing image count
    let db_path = get_db_path(&app_handle)?;
    let db = DB::open(&db_path).map_err(|e| e.to_string())?;
    let counts = db.get_subfolder_counts(subfolders.clone()).map_err(|e| e.to_string())?;

    // Sort subfolders by image count (descending)
    subfolders.sort_by(|a, b| {
        let count_a = counts.get(a).unwrap_or(&0);
        let count_b = counts.get(b).unwrap_or(&0);
        count_b.cmp(count_a)
    });

    // 3. Get images from the entire root (respecting recursive flag)
    let images = db.get_all_images_with_tags(&root, recursive).map_err(|e| e.to_string())?;
    
    let mut move_map: std::collections::HashMap<String, Vec<String>> = std::collections::HashMap::new();
    let mut total_moved = 0;

    for img in images {
        // Skip if already in one of our target subfolders
        let img_path = Path::new(&img.path);
        let img_parent = img_path.parent().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        if subfolders.contains(&img_parent) { continue; }

        // Find best matching folder name in name or tags
        for folder_path_str in &subfolders {
            let folder_path = Path::new(folder_path_str);
            let folder_name = folder_path.file_name().unwrap().to_string_lossy().to_string().to_lowercase();
            
            let name_match = img.name.to_lowercase().contains(&folder_name);
            let prompt_match = img.prompt.as_ref().map(|p| p.to_lowercase().contains(&folder_name)).unwrap_or(false);
            let neg_match = img.negative_prompt.as_ref().map(|p| p.to_lowercase().contains(&folder_name)).unwrap_or(false);

            if name_match || prompt_match || neg_match {
                move_map.entry(folder_path_str.clone()).or_default().push(img.path);
                total_moved += 1;
                break; // Stop at first match (highest priority folder)
            }
        }
    }

    // 4. Execute file moves
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
