use std::fs;
use std::path::Path;

#[tauri::command]
pub fn delete_to_trash(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let p = Path::new(&path);
        if !p.exists() { continue; }

        let parent = p.parent().ok_or("No parent directory")?;
        let is_in_trash = parent.file_name()
            .map(|n| n.to_string_lossy().to_lowercase() == "_trash")
            .unwrap_or(false);

        if is_in_trash {
            fs::remove_file(p).map_err(|e| e.to_string())?;
        } else {
            let trash_dir = parent.join("_Trash");
            if !trash_dir.exists() {
                fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
            }

            let dest = trash_dir.join(p.file_name().ok_or("Invalid filename")?);
            fs::rename(p, dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_to_keep(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        let p = Path::new(&path);
        if !p.exists() { continue; }

        let parent = p.parent().ok_or("No parent directory")?;
        let keep_dir = parent.join("_Keep");
        
        if !keep_dir.exists() {
            fs::create_dir(&keep_dir).map_err(|e| e.to_string())?;
        }

        let dest = keep_dir.join(p.file_name().ok_or("Invalid filename")?);
        fs::rename(p, dest).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn move_files_to_folder(paths: Vec<String>, folder_name: String) -> Result<(), String> {
    if paths.is_empty() { return Ok(()); }

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
            fs::rename(p, dest).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn undo_move(original_path: String, current_path: String) -> Result<(), String> {
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
    
    fs::rename(src, dst).map_err(|e| e.to_string())
}
