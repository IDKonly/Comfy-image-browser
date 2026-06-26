use std::borrow::Cow;
use arboard::{Clipboard, ImageData};

/// Copy an image file's pixels onto the OS clipboard so it can be pasted into other apps.
/// Decodes to RGBA via the `image` crate and hands the raw bytes to arboard — the same
/// approach the X/Twitter share fallback uses to put an image on the clipboard.
#[tauri::command]
pub fn copy_image_to_clipboard(path: String) -> Result<(), String> {
    let img = image::open(&path).map_err(|e| format!("Failed to open image: {}", e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let image_data = ImageData {
        width: width as usize,
        height: height as usize,
        bytes: Cow::from(rgba.as_raw()),
    };
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_image(image_data).map_err(|e| e.to_string())?;
    Ok(())
}
