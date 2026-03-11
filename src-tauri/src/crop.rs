use serde::{Deserialize, Serialize};
use image::{GenericImageView, ImageBuffer, Rgba};
use std::path::Path;
use std::fs;

#[derive(Debug, Deserialize, Serialize)]
pub struct CropRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[tauri::command]
pub async fn process_batch_crop(
    image_path: String,
    rects: Vec<CropRect>,
    fill_color: Option<[u8; 3]>, // [r, g, b]
) -> Result<Vec<String>, String> {
    let path = Path::new(&image_path);
    if !path.exists() {
        return Err("Image file not found".to_string());
    }

    let img = image::open(path).map_err(|e| format!("Failed to open image: {}", e))?;
    let (img_w, img_h) = img.dimensions();

    let parent_dir = path.parent().ok_or("Failed to get parent directory")?;
    let stem = path.file_stem().ok_or("Failed to get file stem")?.to_string_lossy();
    let crop_dir = parent_dir.join("cropped");

    if !crop_dir.exists() {
        fs::create_dir_all(&crop_dir).map_err(|e| format!("Failed to create crops directory: {}", e))?;
    }

    let mut saved_paths = Vec::new();
    let fill = fill_color.unwrap_or([255, 255, 255]);

    for (i, rect) in rects.iter().enumerate() {
        let mut cropped = ImageBuffer::new(rect.width as u32, rect.height as u32);

        for dy in 0..rect.height {
            for dx in 0..rect.width {
                let px = rect.x + dx;
                let py = rect.y + dy;

                let color = if px >= 0 && px < img_w as i32 && py >= 0 && py < img_h as i32 {
                    img.get_pixel(px as u32, py as u32)
                } else {
                    Rgba([fill[0], fill[1], fill[2], 255])
                };
                cropped.put_pixel(dx as u32, dy as u32, color);
            }
        }

        let base_name = format!("{}_crop_{}", stem, i + 1);
        let mut final_path = crop_dir.join(format!("{}.png", base_name));
        let mut counter = 1;

        while final_path.exists() {
            final_path = crop_dir.join(format!("{} ({}).png", base_name, counter));
            counter += 1;
        }

        let output_str = final_path.to_string_lossy().to_string();
        cropped.save(&final_path).map_err(|e| format!("Failed to save crop: {}", e))?;
        saved_paths.push(output_str);
    }

    Ok(saved_paths)
}
