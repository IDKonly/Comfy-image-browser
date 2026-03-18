use std::fs::File;
use std::io::{Read, Cursor};
use std::path::Path;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use img_parts::ImageEXIF;
use img_parts::png::Png;
use img_parts::jpeg::Jpeg;
use img_parts::webp::WebP;
use exif::{Reader as ExifReader, Tag, Value};
use flate2::read::ZlibDecoder;

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

pub fn read_metadata<P: AsRef<Path>>(path: P) -> Result<ImageMetadata, String> {
    let path = path.as_ref();
    let mut file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("Failed to read file: {}", e))?;

    let mut raw_data = String::new();
    if buf.starts_with(&[137, 80, 78, 71, 13, 10, 26, 10]) {
        if let Ok(data) = extract_png(&buf) { raw_data = data; }
    } else if buf.starts_with(&[0xff, 0xd8]) {
        if let Ok(data) = extract_jpeg(&buf) { raw_data = data; }
    } else if buf.starts_with(b"RIFF") && buf.len() > 12 && &buf[8..12] == b"WEBP" {
        if let Ok(data) = extract_webp(&buf) { raw_data = data; }
    }
    if raw_data.is_empty() { raw_data = brute_force_search(&buf); }
    if raw_data.is_empty() { return Ok(ImageMetadata::default()); }

    Ok(parse_universal(&raw_data))
}

fn extract_png(buf: &[u8]) -> Result<String, String> {
    let png = Png::from_bytes(buf.to_vec().into()).map_err(|e| e.to_string())?;
    let mut best_text = String::new();
    for chunk in png.chunks() {
        let chunk_kind = chunk.kind();
        let kind = std::str::from_utf8(&chunk_kind).unwrap_or("");
        if ["tEXt", "iTXt", "zTXt"].contains(&kind) {
            let data = chunk.contents();
            let parts: Vec<&[u8]> = data.split(|&b| b == 0).collect();
            if !parts.is_empty() {
                let key = String::from_utf8_lossy(parts[0]).to_string();
                if let Some(text) = parse_png_chunk(kind, data) {
                    if key == "prompt" { return Ok(text); }
                    if key == "parameters" { return Ok(text); }
                    if key == "workflow" && best_text.is_empty() { best_text = text; }
                }
            }
        }
    }
    Ok(best_text)
}

fn extract_jpeg(buf: &[u8]) -> Result<String, String> {
    let jpeg = Jpeg::from_bytes(buf.to_vec().into()).map_err(|e| e.to_string())?;
    Ok(jpeg.exif().map(|exif| extract_from_exif(exif.to_vec())).unwrap_or_default())
}

fn extract_webp(buf: &[u8]) -> Result<String, String> {
    let webp = WebP::from_bytes(buf.to_vec().into()).map_err(|e| e.to_string())?;
    Ok(webp.exif().map(|exif| extract_from_exif(exif.to_vec())).unwrap_or_default())
}

fn parse_png_chunk(kind: &str, data: &[u8]) -> Option<String> {
    match kind {
        "tEXt" => {
            let parts: Vec<&[u8]> = data.split(|&b| b == 0).collect();
            if parts.len() >= 2 { return Some(String::from_utf8_lossy(parts[1]).to_string()); }
        },
        "zTXt" => {
            let parts: Vec<&[u8]> = data.split(|&b| b == 0).collect();
            if parts.len() >= 3 {
                let mut decoder = ZlibDecoder::new(&data[parts[0].len() + 2..]);
                let mut s = String::new();
                if decoder.read_to_string(&mut s).is_ok() { return Some(s); }
            }
        },
        "iTXt" => {
            let parts: Vec<&[u8]> = data.split(|&b| b == 0).collect();
            if parts.len() >= 5 {
                let compression_flag = data[parts[0].len() + 1];
                let text_start = parts[0].len() + parts[1].len() + parts[2].len() + parts[3].len() + parts[4].len() + 5;
                if compression_flag == 1 {
                    let mut decoder = ZlibDecoder::new(&data[text_start..]);
                    let mut s = String::new();
                    if decoder.read_to_string(&mut s).is_ok() { return Some(s); }
                } else {
                    return Some(String::from_utf8_lossy(&data[text_start..]).to_string());
                }
            }
        },
        _ => {}
    }
    None
}

fn extract_from_exif(data: Vec<u8>) -> String {
    if data.is_empty() { return String::new(); }
    let exif_slice = if data.starts_with(b"Exif\0\0") { &data[6..] } else { &data };
    let cursor = Cursor::new(exif_slice);
    if let Ok(reader) = ExifReader::new().read_raw(cursor.into_inner().to_vec()) {
        if let Some(field) = reader.get_field(Tag::UserComment, exif::In::PRIMARY) {
            match &field.value {
                Value::Undefined(bytes, _) => {
                    if bytes.len() >= 8 {
                        let header = &bytes[0..8];
                        let content = &bytes[8..];
                        if header.starts_with(b"UNICODE\0") { return decode_utf16_le(content); }
                        else if header.starts_with(b"ASCII\0\0\0") { return String::from_utf8_lossy(content).trim().to_string(); }
                        return String::from_utf8_lossy(content).trim().to_string();
                    }
                    return String::from_utf8_lossy(bytes).trim().to_string();
                },
                Value::Ascii(strings) => {
                    let combined: Vec<String> = strings.iter().map(|s| String::from_utf8_lossy(s).to_string()).collect();
                    return combined.join(" ");
                },
                _ => {}
            }
        }
    }
    String::new()
}

fn brute_force_search(buf: &[u8]) -> String {
    let keywords: &[&[u8]] = &[b"UNICODE", b"ASCII", b"parameters", b"prompt"];
    for &kw in keywords {
        if let Some(pos) = find_subsequence(buf, kw) {
            let start = pos + kw.len();
            let mut data_start = start;
            while data_start < buf.len() && (buf[data_start] == 0 || buf[data_start] == b' ' || buf[data_start] == b'(' || buf[data_start] == b':') {
                data_start += 1;
            }
            if data_start >= buf.len() { continue; }
            let data_len = 4096.min(buf.len() - data_start);
            let data = &buf[data_start..data_start + data_len];
            if is_likely_utf16(data) { return decode_utf16_le(data); }
            else {
                let text = String::from_utf8_lossy(data);
                if let Some(end) = text.find('\0') { return text[..end].trim().to_string(); }
                return text.trim().to_string();
            }
        }
    }
    String::new()
}

fn find_subsequence(haystack: &[u8], needle: &[u8]) -> Option<usize> { haystack.windows(needle.len()).position(|window| window == needle) }
fn is_likely_utf16(data: &[u8]) -> bool {
    if data.len() < 10 { return false; }
    let mut nulls = 0;
    for i in (1..data.len().min(100)).step_by(2) { if data[i] == 0 { nulls += 1; } }
    nulls > (data.len().min(100) / 4)
}
fn decode_utf16_le(bytes: &[u8]) -> String {
    let u16_data: Vec<u16> = bytes.chunks_exact(2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]])).collect();
    let s = String::from_utf16_lossy(&u16_data);
    s.chars().filter(|&c| !c.is_control() && c != '\0').collect::<String>().trim().to_string()
}

fn parse_universal(raw: &str) -> ImageMetadata {
    let raw = raw.trim();
    let clean_raw = if raw.to_lowercase().starts_with("parameters:") { raw[11..].trim() } else { raw };
    if clean_raw.starts_with('{') { parse_comfyui_extended(clean_raw) }
    else { parse_a1111_improved(clean_raw) }
}

fn parse_comfyui_extended(raw: &str) -> ImageMetadata {
    let mut meta = ImageMetadata { raw: raw.to_string(), ..Default::default() };
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) {
        let mut prompts = Vec::new();
        let mut negatives = Vec::new();

        if let Some(nodes) = v.as_object() {
            for (_, node) in nodes {
                let class_type = node.get("class_type").and_then(|c| c.as_str()).unwrap_or("");
                let inputs = node.get("inputs").and_then(|i| i.as_object());

                if class_type == "CLIPTextEncode" || class_type == "CLIPTextEncodeSDXL" || class_type == "CLIPTextEncodeSD3" {
                    if let Some(inputs) = inputs {
                        let text = inputs.get("text")
                            .or_else(|| inputs.get("text_g"))
                            .or_else(|| inputs.get("text_l"))
                            .and_then(|t| t.as_str())
                            .unwrap_or("");
                        
                        if !text.is_empty() {
                            let title = node.get("_meta").and_then(|m| m.get("title")).and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
                            if title.contains("negative") { negatives.push(text.to_string()); }
                            else { prompts.push(text.to_string()); }
                        }
                    }
                } else if class_type == "CheckpointLoaderSimple" || class_type == "CheckpointLoader" {
                    if let Some(i) = inputs {
                        if let Some(model_name) = i.get("ckpt_name").and_then(|t| t.as_str()) {
                            meta.model = Some(model_name.to_string());
                        }
                    }
                } else if class_type == "UNETLoader" || class_type == "DiffusionLoader" || class_type == "ModelLoader" {
                    if let Some(i) = inputs {
                        if let Some(model_name) = i.get("unet_name")
                            .or_else(|| i.get("model_name"))
                            .or_else(|| i.get("ckpt_name"))
                            .and_then(|t| t.as_str()) {
                            meta.model = Some(model_name.to_string());
                        }
                    }
                }

                if let Some(inputs) = inputs {
                    if meta.steps.is_none() { meta.steps = inputs.get("steps").and_then(|s| s.as_u64()).map(|s| s as u32); }
                    if meta.seed.is_none() { meta.seed = inputs.get("seed").or_else(|| inputs.get("noise_seed")).and_then(|s| s.as_u64()); }
                    if meta.cfg.is_none() { meta.cfg = inputs.get("cfg").and_then(|s| s.as_f64()).map(|s| s as f32); }
                    if meta.sampler.is_none() { meta.sampler = inputs.get("sampler_name").and_then(|s| s.as_str()).map(|s| s.to_string()); }
                }
            }
        }
        if !prompts.is_empty() { meta.prompt = Some(prompts.join(", ")); }
        if !negatives.is_empty() { meta.negative_prompt = Some(negatives.join(", ")); }
    }
    meta
}

fn parse_a1111_improved(raw: &str) -> ImageMetadata {
    let mut meta = ImageMetadata { raw: raw.to_string(), ..Default::default() };
    let neg_pos = raw.find("Negative prompt: ");
    let steps_pos = raw.find("Steps: ");
    match (neg_pos, steps_pos) {
        (Some(n), Some(s)) if s > n => {
            meta.prompt = Some(raw[..n].trim().to_string());
            meta.negative_prompt = Some(raw[n + 17..s].trim().to_string());
            parse_params_into(&raw[s..], &mut meta);
        },
        (Some(n), None) => {
            meta.prompt = Some(raw[..n].trim().to_string());
            meta.negative_prompt = Some(raw[n + 17..].trim().to_string());
        },
        (None, Some(s)) => {
            meta.prompt = Some(raw[..s].trim().to_string());
            parse_params_into(&raw[s..], &mut meta);
        },
        _ => { let lines: Vec<&str> = raw.split('\n').collect(); meta.prompt = Some(lines[0].trim().to_string()); }
    }
    meta
}

fn parse_params_into(params_line: &str, meta: &mut ImageMetadata) {
    let mut map = HashMap::new();
    for part in params_line.split(',') {
        let kv: Vec<&str> = part.split(':').collect();
        if kv.len() == 2 { map.insert(kv[0].trim().to_string(), kv[1].trim().to_string()); }
    }
    if let Some(v) = map.get("Steps").or_else(|| map.get("steps")) { meta.steps = v.parse().ok(); }
    if let Some(v) = map.get("Sampler") { meta.sampler = Some(v.clone()); }
    if let Some(v) = map.get("CFG scale") { meta.cfg = v.parse().ok(); }
    if let Some(v) = map.get("Seed") { meta.seed = v.parse().ok(); }
    if let Some(v) = map.get("Model") { meta.model = Some(v.clone()); }
}

#[tauri::command]
pub fn get_metadata(path: String) -> Result<ImageMetadata, String> { read_metadata(path) }
