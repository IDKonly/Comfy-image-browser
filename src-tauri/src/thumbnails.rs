use std::path::Path;
use image::imageops::FilterType;
use std::fs;
use base64::{Engine as _, engine::general_purpose};

#[tauri::command]
pub async fn get_thumbnail(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("File not found".to_string());
    }

    // 간단한 캐싱 로직: 시스템 임시 폴더 사용
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    use std::hash::{Hash, Hasher};
    path.hash(&mut hasher);
    let hash = hasher.finish();
    
    let cache_dir = std::env::temp_dir().join("comfyview_cache");
    if !cache_dir.exists() {
        fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    }
    
    let cache_path = cache_dir.join(format!("{}.jpg", hash));

    // 캐시가 있으면 반환
    if cache_path.exists() {
        let bytes = fs::read(&cache_path).map_err(|e| e.to_string())?;
        return Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(bytes)));
    }

    // 캐시 없으면 생성 (200px 너비)
    let img = image::open(p).map_err(|e| e.to_string())?;
    let thumbnail = img.resize(300, 300, FilterType::Lanczos3);
    
    let mut buffer = std::io::Cursor::new(Vec::new());
    thumbnail.write_to(&mut buffer, image::ImageFormat::Jpeg).map_err(|e| e.to_string())?;
    let bytes = buffer.into_inner();
    
    // 파일로 저장
    let _ = fs::write(&cache_path, &bytes);

    Ok(format!("data:image/jpeg;base64,{}", general_purpose::STANDARD.encode(bytes)))
}
