use std::path::Path;
use std::fs;

#[tauri::command]
pub async fn get_thumbnail(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    // Use system temp dir for high-speed cache
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::{Hash, Hasher};
    path.hash(&mut hasher);
    let hash = hasher.finish();
    
    let cache_dir = std::env::temp_dir().join("comfyview_v2_cache");
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    let cache_path = cache_dir.join(format!("{}.jpg", hash));

    // Return path if already cached
    if cache_path.exists() {
        return Ok(cache_path.to_string_lossy().to_string());
    }

    println!("Generating thumbnail for: {}", path);

    // Optimization: Use faster resize for initial thumbnailing
    let path_clone = path.clone();
    let cache_path_clone = cache_path.clone();
    
    tauri::async_runtime::spawn_blocking(move || {
        let img = image::open(Path::new(&path_clone)).map_err(|e| {
            println!("Failed to open image: {}", e);
            e.to_string()
        })?;
        // 400px is enough for grid/sidebar and looks better on high-DPI
        let thumbnail = img.thumbnail(400, 400); // .thumbnail is much faster than .resize
        
        thumbnail.save_with_format(&cache_path_clone, image::ImageFormat::Jpeg)
            .map_err(|e| {
                println!("Failed to save thumbnail: {}", e);
                e.to_string()
            })?;
        println!("Thumbnail saved to: {:?}", cache_path_clone);
        Ok::<(), String>(())
    }).await.map_err(|e| e.to_string())??;

    Ok(cache_path.to_string_lossy().to_string())
}
