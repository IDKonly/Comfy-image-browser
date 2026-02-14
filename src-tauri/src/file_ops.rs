use std::fs;
use std::path::Path;

#[tauri::command]
pub fn delete_to_trash(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    let parent = p.parent().ok_or("No parent directory")?;
    let trash_dir = parent.join("_Trash");
    
    if !trash_dir.exists() {
        fs::create_dir(&trash_dir).map_err(|e| e.to_string())?;
    }

    let dest = trash_dir.join(p.file_name().ok_or("Invalid filename")?);
    fs::rename(p, dest).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn move_to_keep(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    let parent = p.parent().ok_or("No parent directory")?;
    let keep_dir = parent.join("_Keep");
    
    if !keep_dir.exists() {
        fs::create_dir(&keep_dir).map_err(|e| e.to_string())?;
    }

    let dest = keep_dir.join(p.file_name().ok_or("Invalid filename")?);
    fs::rename(p, dest).map_err(|e| e.to_string())?;

    Ok(())
}
