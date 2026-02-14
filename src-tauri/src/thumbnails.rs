use std::path::Path;
use std::fs;
use std::hash::{Hash, Hasher};
use std::time::SystemTime;
use image::ImageFormat;

#[tauri::command]
pub async fn get_thumbnail(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    // Get file metadata for cache invalidation
    let metadata = fs::metadata(p).map_err(|e| e.to_string())?;
    let size = metadata.len();
    let mtime = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);

    // Create a unique hash based on path, size, and modification time
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.hash(&mut hasher);
    size.hash(&mut hasher);
    mtime.hash(&mut hasher);
    let hash = hasher.finish();
    
    let cache_dir = std::env::temp_dir().join("comfyview_v2_cache");
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    let cache_path = cache_dir.join(format!("{}.jpg", hash));

    // Return path if already cached and exists
    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    // Optimization: Use faster resize for initial thumbnailing
    let path_clone = path.clone();
    let cache_path_clone = cache_path.clone();
    
    // Process image in a blocking thread to avoid blocking the async runtime
    tauri::async_runtime::spawn_blocking(move || {
        // Open image
        let img = image::open(Path::new(&path_clone)).map_err(|e| {
            format!("Failed to open image {}: {}", path_clone, e)
        })?;
        
        // Resize: 400px is enough for grid/sidebar and looks better on high-DPI
        // thumbnails() is faster than resize() as it's optimized for downscaling
        let thumbnail = img.thumbnail(400, 400); 
        
        // Save as JPEG with default quality (usually 75)
        thumbnail.save_with_format(&cache_path_clone, ImageFormat::Jpeg)
            .map_err(|e| {
                format!("Failed to save thumbnail to {:?}: {}", cache_path_clone, e)
            })?;
            
        Ok::<(), String>(())
    }).await
        .map_err(|e| format!("Task join error: {}", e))??; // Unwrap outer Result (JoinError) then inner Result

    Ok(cache_path.to_string_lossy().to_string())
}
