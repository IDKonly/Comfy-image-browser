use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};
use image::ImageFormat;
use img_parts::{Bytes, ImageEXIF};
use img_parts::png::{Png, PngChunk};
use img_parts::webp::WebP;
use exif::{Reader as ExifReader, Tag, Value, In};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct ConvertResult {
    pub converted: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

// ─── EXIF construction ────────────────────────────────────────────────────────

fn write_ifd_entry(out: &mut Vec<u8>, tag: u16, typ: u16, count: u32, val: u32) {
    out.extend_from_slice(&tag.to_le_bytes());
    out.extend_from_slice(&typ.to_le_bytes());
    out.extend_from_slice(&count.to_le_bytes());
    out.extend_from_slice(&val.to_le_bytes());
}

/// Write an ASCII-type IFD entry. Values ≤ 4 bytes are stored inline (TIFF rule);
/// larger values are stored at `off` in the data area.
fn write_ascii_entry(out: &mut Vec<u8>, tag: u16, data: &[u8], off: u32) {
    out.extend_from_slice(&tag.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes()); // ASCII type
    out.extend_from_slice(&(data.len() as u32).to_le_bytes());
    if data.len() <= 4 {
        let mut v = [0u8; 4];
        v[..data.len()].copy_from_slice(data);
        out.extend_from_slice(&v);
    } else {
        out.extend_from_slice(&off.to_le_bytes());
    }
}

/// Build a minimal TIFF/EXIF byte blob that matches piexif output format.
///
/// TIFF rule: if value size (count × bytes_per_type) ≤ 4, the value is stored
/// inline in the value/offset field (left-justified, null-padded). Otherwise
/// the field holds an absolute file offset to the data. This function handles
/// both cases so that empty or short workflow/prompt strings are stored correctly.
///
/// IFD0 tags (ascending order): ImageDescription(0x010E) Make(0x010F)
///   Software(0x0131) ExifIFDPointer(0x8769)
/// ExifIFD tag: UserComment(0x9286) = "ASCII\0\0\0" + parameters
pub fn build_exif_bytes(workflow: &str, prompt: &str, parameters: &str) -> Vec<u8> {
    let wf: Vec<u8> = { let mut v = workflow.as_bytes().to_vec(); v.push(0); v };
    let pr: Vec<u8> = { let mut v = prompt.as_bytes().to_vec(); v.push(0); v };
    let sw: &[u8] = b"ComfyUI\0"; // 8 bytes — always in data area
    let uc: Vec<u8> = { let mut v = b"ASCII\0\0\0".to_vec(); v.extend_from_slice(parameters.as_bytes()); v };

    // ASCII values ≤ 4 bytes go inline; larger go in the data area
    let wf_inline = wf.len() <= 4;
    let pr_inline = pr.len() <= 4;

    // IFD0 block: header(8) + count(2) + 4×entry(12) + next_ifd(4) = 62 bytes total
    let ifd0_end: u32 = 8 + 2 + 4 * 12 + 4; // = 62

    // Compute offsets for data-area items only
    let mut dptr = ifd0_end;
    let wf_off = if wf_inline { 0 } else { let o = dptr; dptr += wf.len() as u32; o };
    let pr_off = if pr_inline { 0 } else { let o = dptr; dptr += pr.len() as u32; o };
    let sw_off = { let o = dptr; dptr += sw.len() as u32; o };
    let ex_off = dptr; // ExifIFD starts here
    dptr += 2 + 12 + 4; // ExifIFD: count(2) + 1×entry(12) + next_ifd(4)
    let uc_off = dptr;

    let mut out: Vec<u8> = Vec::new();
    // TIFF header (little-endian "II")
    out.extend_from_slice(b"II");
    out.extend_from_slice(&42u16.to_le_bytes());
    out.extend_from_slice(&8u32.to_le_bytes()); // IFD0 at offset 8

    out.extend_from_slice(&4u16.to_le_bytes()); // IFD0 entry count

    write_ascii_entry(&mut out, 0x010E, &wf, wf_off); // ImageDescription
    write_ascii_entry(&mut out, 0x010F, &pr, pr_off); // Make
    write_ascii_entry(&mut out, 0x0131, sw,  sw_off); // Software (always offset)
    write_ifd_entry(&mut out, 0x8769, 4, 1, ex_off); // ExifIFDPointer
    out.extend_from_slice(&0u32.to_le_bytes()); // next IFD = 0

    // Data area for IFD0
    if !wf_inline { out.extend_from_slice(&wf); }
    if !pr_inline { out.extend_from_slice(&pr); }
    out.extend_from_slice(sw);

    // ExifIFD: 1 entry
    out.extend_from_slice(&1u16.to_le_bytes());
    write_ifd_entry(&mut out, 0x9286, 7, uc.len() as u32, uc_off); // UserComment
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend_from_slice(&uc);

    out
}

// ─── Metadata extraction ──────────────────────────────────────────────────────

/// Extract (workflow, prompt, parameters) from PNG tEXt chunks.
pub fn extract_png_meta(buf: &[u8]) -> (String, String, String) {
    let Ok(png) = Png::from_bytes(buf.to_vec().into()) else {
        return Default::default();
    };
    let (mut workflow, mut prompt, mut parameters) = Default::default();
    for chunk in png.chunks() {
        let kind_arr = chunk.kind();
        let kind = std::str::from_utf8(&kind_arr).unwrap_or("");
        if kind != "tEXt" { continue; }
        let data = chunk.contents();
        let sep = data.iter().position(|&b| b == 0).unwrap_or(data.len());
        let key = std::str::from_utf8(&data[..sep]).unwrap_or("");
        let val = if sep + 1 < data.len() {
            String::from_utf8_lossy(&data[sep + 1..]).trim_end_matches('\0').to_string()
        } else { String::new() };
        match key {
            "workflow"   => workflow   = val,
            "prompt"     => prompt     = val,
            "parameters" => parameters = val,
            _ => {}
        }
    }
    (workflow, prompt, parameters)
}

/// Extract (workflow, prompt, parameters) from raw EXIF bytes built by build_exif_bytes.
pub fn extract_exif_meta(data: &[u8]) -> (String, String, String) {
    let slice = if data.starts_with(b"Exif\0\0") { &data[6..] } else { data };
    let Ok(reader) = ExifReader::new().read_raw(slice.to_vec()) else {
        return Default::default();
    };

    let ascii = |tag: Tag| -> String {
        reader.get_field(tag, In::PRIMARY).map(|f| match &f.value {
            Value::Ascii(v) => {
                let raw: Vec<u8> = v.iter().flat_map(|s| s.iter().copied()).collect();
                String::from_utf8_lossy(&raw).trim_end_matches('\0').to_string()
            },
            Value::Byte(b) => String::from_utf8_lossy(b).trim_end_matches('\0').to_string(),
            _ => String::new(),
        }).unwrap_or_default()
    };

    let workflow   = ascii(Tag::ImageDescription);
    let prompt     = ascii(Tag::Make);
    let parameters = reader.get_field(Tag::UserComment, In::PRIMARY)
        .and_then(|f| match &f.value {
            Value::Undefined(b, _) => {
                let content = if b.len() >= 8 && b[..8].starts_with(b"ASCII\0\0\0") {
                    &b[8..]
                } else { b.as_slice() };
                Some(String::from_utf8_lossy(content).trim_end_matches('\0').to_string())
            },
            _ => None,
        }).unwrap_or_default();

    (workflow, prompt, parameters)
}

// ─── PNG chunk builder ────────────────────────────────────────────────────────

fn png_text_chunk(key: &str, value: &str) -> PngChunk {
    let mut data = Vec::with_capacity(key.len() + 1 + value.len());
    data.extend_from_slice(key.as_bytes());
    data.push(0);
    data.extend_from_slice(value.as_bytes());
    PngChunk::new([b't', b'E', b'X', b't'], Bytes::from(data))
}

// ─── Core conversion logic ────────────────────────────────────────────────────

pub fn do_convert_to_webp(src: &Path, dst: &Path, _quality: u8, _lossless: bool) -> Result<(), String> {
    let buf = fs::read(src).map_err(|e| e.to_string())?;
    let (workflow, prompt, parameters) = extract_png_meta(&buf);

    let img = image::load_from_memory(&buf).map_err(|e| e.to_string())?;
    let mut webp_buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut webp_buf), ImageFormat::WebP)
        .map_err(|e| e.to_string())?;

    let mut webp = WebP::from_bytes(webp_buf.into()).map_err(|e| e.to_string())?;
    webp.set_exif(Some(Bytes::from(build_exif_bytes(&workflow, &prompt, &parameters))));

    let tmp = dst.with_extension("webp_tmp");
    fs::write(&tmp, webp.encoder().bytes().as_ref()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dst).map_err(|e| e.to_string())
}

pub fn do_convert_to_png(src: &Path, dst: &Path) -> Result<(), String> {
    let buf = fs::read(src).map_err(|e| e.to_string())?;
    let webp = WebP::from_bytes(buf.clone().into()).map_err(|e| e.to_string())?;
    let (workflow, prompt, parameters) = webp.exif()
        .map(|e| extract_exif_meta(e.as_ref()))
        .unwrap_or_default();

    let img = image::load_from_memory(&buf).map_err(|e| e.to_string())?;
    let mut png_buf = Vec::new();
    img.write_to(&mut std::io::Cursor::new(&mut png_buf), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    // Inject tEXt chunks in ComfyUI-expected order: parameters → prompt → workflow
    let mut png = Png::from_bytes(png_buf.into()).map_err(|e| e.to_string())?;
    let mut idx = 1usize; // insert after IHDR (index 0)
    if !parameters.is_empty() { png.chunks_mut().insert(idx, png_text_chunk("parameters", &parameters)); idx += 1; }
    if !prompt.is_empty()     { png.chunks_mut().insert(idx, png_text_chunk("prompt",     &prompt));     idx += 1; }
    if !workflow.is_empty()   { png.chunks_mut().insert(idx, png_text_chunk("workflow",   &workflow));   let _ = idx + 1; }

    let tmp = dst.with_extension("png_tmp");
    fs::write(&tmp, png.encoder().bytes().as_ref()).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dst).map_err(|e| e.to_string())
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn convert_to_webp(
    paths: Vec<String>,
    quality: u8,
    lossless: bool,
    delete_original: bool,
) -> Result<ConvertResult, String> {
    let mut res = ConvertResult::default();
    for p in &paths {
        let src = Path::new(p);
        if !src.exists() { res.errors.push(format!("Not found: {p}")); continue; }
        let dst = src.with_extension("webp");
        if dst.exists() { res.skipped.push(dst.to_string_lossy().to_string()); continue; }
        match do_convert_to_webp(src, &dst, quality, lossless) {
            Ok(()) => {
                if delete_original { let _ = fs::remove_file(src); }
                res.converted.push(dst.to_string_lossy().to_string());
            },
            Err(e) => {
                let _ = fs::remove_file(&dst);
                res.errors.push(format!("{p}: {e}"));
            }
        }
    }
    Ok(res)
}

#[tauri::command]
pub fn convert_to_png(
    paths: Vec<String>,
    delete_original: bool,
) -> Result<ConvertResult, String> {
    let mut res = ConvertResult::default();
    for p in &paths {
        let src = Path::new(p);
        if !src.exists() { res.errors.push(format!("Not found: {p}")); continue; }
        let dst = src.with_extension("png");
        if dst.exists() { res.skipped.push(dst.to_string_lossy().to_string()); continue; }
        match do_convert_to_png(src, &dst) {
            Ok(()) => {
                if delete_original { let _ = fs::remove_file(src); }
                res.converted.push(dst.to_string_lossy().to_string());
            },
            Err(e) => {
                let _ = fs::remove_file(&dst);
                res.errors.push(format!("{p}: {e}"));
            }
        }
    }
    Ok(res)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_file(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent().unwrap()
            .join("test")
            .join(name)
    }

    #[test]
    fn test_exif_build_and_parse_roundtrip() {
        let wf = r#"{"1":{"class_type":"CLIPTextEncode","inputs":{"text":"a beautiful landscape, mountains"}}}"#;
        let pr = r#"{"1":{"inputs":{"text":"a beautiful landscape, mountains"}}}"#;
        let pa = "a beautiful landscape, mountains\nNegative prompt: blurry, low quality\nSteps: 20, Sampler: euler_a, CFG scale: 7, Seed: 12345";

        let exif = build_exif_bytes(wf, pr, pa);
        let (wf2, pr2, pa2) = extract_exif_meta(&exif);
        assert_eq!(wf, wf2, "workflow roundtrip via EXIF");
        assert_eq!(pr, pr2, "prompt roundtrip via EXIF");
        assert_eq!(pa, pa2, "parameters roundtrip via EXIF");
    }

    #[test]
    fn test_exif_empty_fields() {
        let exif = build_exif_bytes("", "", "");
        let (wf, pr, pa) = extract_exif_meta(&exif);
        assert_eq!("", wf);
        assert_eq!("", pr);
        assert_eq!("", pa);
    }

    fn roundtrip(png_name: &str) {
        let png_path = test_file(png_name);
        if !png_path.exists() {
            eprintln!("SKIP (not found): {:?}", png_path);
            return;
        }
        let stem = png_path.file_stem().unwrap().to_string_lossy().to_string();
        let dir  = png_path.parent().unwrap();
        let webp_path     = dir.join(format!("{stem}_cvtest.webp"));
        let png_restored  = dir.join(format!("{stem}_cvtest.png"));

        let orig_buf = fs::read(&png_path).unwrap();
        let (orig_wf, orig_pr, orig_pa) = extract_png_meta(&orig_buf);
        println!("[{png_name}] wf={} pr={} pa={} bytes",
            orig_wf.len(), orig_pr.len(), orig_pa.len());
        // At least one metadata field must be present for a real ComfyUI image
        assert!(
            orig_wf.len() + orig_pr.len() + orig_pa.len() > 0,
            "{png_name}: no ComfyUI metadata found in source PNG"
        );

        // PNG → WebP
        do_convert_to_webp(&png_path, &webp_path, 85, false)
            .unwrap_or_else(|e| panic!("PNG→WebP failed for {png_name}: {e}"));
        assert!(webp_path.exists());

        // Check EXIF preserved in WebP
        let webp_buf = fs::read(&webp_path).unwrap();
        let webp = WebP::from_bytes(webp_buf.into()).unwrap();
        let exif = webp.exif().expect("no EXIF in converted WebP");
        let (wf2, pr2, pa2) = extract_exif_meta(exif.as_ref());
        assert_eq!(orig_wf, wf2, "workflow in WebP EXIF [{png_name}]");
        assert_eq!(orig_pr, pr2, "prompt in WebP EXIF [{png_name}]");
        assert_eq!(orig_pa, pa2, "parameters in WebP EXIF [{png_name}]");

        // WebP → PNG
        do_convert_to_png(&webp_path, &png_restored)
            .unwrap_or_else(|e| panic!("WebP→PNG failed for {png_name}: {e}"));
        assert!(png_restored.exists());

        // Check metadata restored in PNG tEXt chunks
        let restored_buf = fs::read(&png_restored).unwrap();
        let (wf3, pr3, pa3) = extract_png_meta(&restored_buf);
        assert_eq!(orig_wf, wf3, "workflow in restored PNG [{png_name}]");
        assert_eq!(orig_pr, pr3, "prompt in restored PNG [{png_name}]");
        assert_eq!(orig_pa, pa3, "parameters in restored PNG [{png_name}]");

        let _ = fs::remove_file(&webp_path);
        let _ = fs::remove_file(&png_restored);
        println!("[{png_name}] PASS");
    }

    #[test]
    fn test_roundtrip_timestamp_png() {
        roundtrip("2026-02-06_165524_00003.png");
    }

    #[test]
    fn test_roundtrip_hash_png() {
        roundtrip("30628fdff2b4b4767f6b27927de6c9f0a52789468fd1fc5bcd07ab0fd7c09b28.png");
    }

    #[test]
    fn test_roundtrip_zit_png() {
        roundtrip("zit__00095_.png");
    }
}
