use std::path::Path;
use std::fs;
use std::hash::{Hash, Hasher};
use std::time::SystemTime;
use image::ImageFormat;

#[tauri::command]
pub async fn get_thumbnail(path: String, size: Option<u32>) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() { return Err("File not found".to_string()); }

    let meta = fs::metadata(p).map_err(|e| e.to_string())?;
    let f_size = meta.len();
    let mtime = meta.modified().unwrap_or(SystemTime::UNIX_EPOCH);
    let target_size = size.unwrap_or(512); // Default to 512 for batch mode

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    f_size.hash(&mut hasher);
    mtime.hash(&mut hasher);
    target_size.hash(&mut hasher);
    let hash = hasher.finish();
    
    let cache_dir = std::env::temp_dir().join("comfyview_v4_cache");
    if !cache_dir.exists() { fs::create_dir_all(&cache_dir).ok(); }
    
    let cache_path = cache_dir.join(format!("{}.jpg", hash));
    if cache_path.exists() { return Ok(cache_path.to_string_lossy().to_string()); }

    let path_clone = path.clone();
    let cache_path_clone = cache_path.clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(Path::new(&path_clone)).map_err(|e| e.to_string())?;
        // Use Fast resizing: 512 for grid, 1024/2048 for preview
        let thumbnail = img.thumbnail(target_size, target_size); 
        thumbnail.save_with_format(&cache_path_clone, ImageFormat::Jpeg).map_err(|e| e.to_string())?;
        Ok::<(), String>(())
    }).await.map_err(|e| e.to_string())??;

    Ok(cache_path.to_string_lossy().to_string())
}
