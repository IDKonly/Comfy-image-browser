use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use serde::{Serialize, Deserialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ImageMetadata {
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
    pub steps: Option<u32>,
    pub sampler: Option<String>,
    pub cfg: Option<f32>,
    pub seed: Option<u64>,
    pub model: Option<String>,
    pub raw: String,
}

pub fn read_metadata(path: &str) -> Result<ImageMetadata, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut reader = BufReader::new(file);

    // Read first 8 bytes to check for PNG signature
    let mut signature = [0u8; 8];
    reader.read_exact(&mut signature).map_err(|e| e.to_string())?;

    if signature != [137, 80, 78, 71, 13, 10, 26, 10] {
        return Err("Not a PNG file".to_string());
    }

    let mut metadata_raw = String::new();

    // Loop through chunks
    loop {
        let mut length_buf = [0u8; 4];
        if reader.read_exact(&mut length_buf).is_err() { break; }
        let length = u32::from_be_bytes(length_buf);

        let mut type_buf = [0u8; 4];
        if reader.read_exact(&mut type_buf).is_err() { break; }
        let chunk_type = std::str::from_utf8(&type_buf).map_err(|e| e.to_string())?;

        if chunk_type == "tEXt" || chunk_type == "iTXt" {
            let mut data = vec![0u8; length as usize];
            reader.read_exact(&mut data).map_err(|e| e.to_string())?;
            
            let text = String::from_utf8_lossy(&data);
            if text.starts_with("parameters\0") {
                metadata_raw = text.trim_start_matches("parameters\0").to_string();
                break;
            } else if chunk_type == "iTXt" && text.contains("parameters") {
                 // Simplified iTXt handling
                 if let Some(pos) = text.find("parameters") {
                     // iTXt has more header info, this is a bit naive but works for many
                     metadata_raw = text[pos+10..].to_string(); 
                 }
            }
        } else if chunk_type == "IEND" {
            break;
        } else {
            if reader.seek(SeekFrom::Current(length as i64)).is_err() { break; }
        }

        // Skip CRC (4 bytes)
        if reader.seek(SeekFrom::Current(4)).is_err() { break; }
    }

    if metadata_raw.is_empty() {
        return Ok(ImageMetadata::default());
    }

    Ok(parse_a1111_metadata(&metadata_raw))
}

fn parse_a1111_metadata(raw: &str) -> ImageMetadata {
    let mut meta = ImageMetadata {
        raw: raw.to_string(),
        ..Default::default()
    };

    let lines: Vec<&str> = raw.split('\n').collect();
    if lines.is_empty() { return meta; }

    // Line 0 is usually the prompt
    meta.prompt = Some(lines[0].trim().to_string());

    // Check for Negative Prompt
    for line in lines.iter() {
        let l = line.trim();
        if l.starts_with("Negative prompt: ") {
            meta.negative_prompt = Some(l.replace("Negative prompt: ", "").trim().to_string());
        } else if l.contains("Steps: ") {
            // This line usually contains all other params
            let params = parse_params_line(l);
            meta.steps = params.get("Steps").and_then(|s| s.parse().ok());
            meta.sampler = params.get("Sampler").cloned();
            meta.cfg = params.get("CFG scale").and_then(|s| s.parse().ok());
            meta.seed = params.get("Seed").and_then(|s| s.parse().ok());
            meta.model = params.get("Model").cloned();
        }
    }

    meta
}

fn parse_params_line(line: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let parts: Vec<&str> = line.split(',').collect();
    for part in parts {
        let kv: Vec<&str> = part.split(':').collect();
        if kv.len() == 2 {
            map.insert(kv[0].trim().to_string(), kv[1].trim().to_string());
        }
    }
    map
}

#[tauri::command]
pub fn get_metadata(path: String) -> Result<ImageMetadata, String> {
    read_metadata(&path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_a1111() {
        let raw = "A beautiful sunset over the mountains\nNegative prompt: clouds, blurry\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 12345, Model: sd_v1.5";
        let meta = parse_a1111_metadata(raw);
        assert_eq!(meta.prompt.unwrap(), "A beautiful sunset over the mountains");
        assert_eq!(meta.negative_prompt.unwrap(), "clouds, blurry");
        assert_eq!(meta.steps.unwrap(), 20);
        assert_eq!(meta.sampler.unwrap(), "Euler a");
        assert_eq!(meta.cfg.unwrap(), 7.0);
        assert_eq!(meta.seed.unwrap(), 12345);
        assert_eq!(meta.model.unwrap(), "sd_v1.5");
    }
}
