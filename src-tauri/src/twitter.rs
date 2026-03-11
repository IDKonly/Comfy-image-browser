use serde::{Serialize, Deserialize};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;
use crate::metadata::read_metadata;
use arboard::{Clipboard, ImageData};
use std::borrow::Cow;
use std::collections::HashSet;
use std::time::{SystemTime, UNIX_EPOCH};
use hmac::{Hmac, Mac};
use sha1::Sha1;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::blocking::Client;
use std::fs::File;
use std::io::Read;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TwitterSettings {
    pub template: String,
    #[serde(alias = "phrases_to_pick")]
    pub phrases_to_pick: Vec<String>,
    #[serde(alias = "auto_copy_image")]
    pub auto_copy_image: bool,
    #[serde(alias = "api_key")]
    pub api_key: String,
    #[serde(alias = "api_secret")]
    pub api_secret: String,
    #[serde(alias = "access_token")]
    pub access_token: String,
    #[serde(alias = "access_secret")]
    pub access_secret: String,
}

type HmacSha1 = Hmac<Sha1>;

fn get_nonce() -> String {
    let mut s = String::new();
    let chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456489";
    for _ in 0..32 {
        let idx = (SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() % chars.len() as u128) as usize;
        s.push(chars.chars().nth(idx).unwrap());
    }
    s
}

fn oauth_encode(s: &str) -> String {
    // Custom set to follow OAuth 1.0a RFC 3986
    // Unreserved characters: ALPHA, DIGIT, '-', '.', '_', '~'
    const OAUTH_SET: &AsciiSet = &NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'.')
        .remove(b'_')
        .remove(b'~');
    utf8_percent_encode(s, OAUTH_SET).to_string()
}

fn generate_oauth_header(
    method: &str,
    url: &str,
    params: &[(String, String)],
    api_key: &str,
    api_secret: &str,
    token: &str,
    token_secret: &str,
) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        .to_string();
    let nonce = get_nonce();

    let mut oauth_params = vec![
        ("oauth_consumer_key".to_string(), api_key.to_string()),
        ("oauth_nonce".to_string(), nonce.clone()),
        ("oauth_signature_method".to_string(), "HMAC-SHA1".to_string()),
        ("oauth_timestamp".to_string(), timestamp.clone()),
        ("oauth_token".to_string(), token.to_string()),
        ("oauth_version".to_string(), "1.0".to_string()),
    ];

    for (k, v) in params {
        oauth_params.push((k.clone(), v.clone()));
    }
    oauth_params.sort();

    let parameter_string = oauth_params
        .iter()
        .map(|(k, v)| format!("{}={}", oauth_encode(k), oauth_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let base_string = format!(
        "{}&{}&{}",
        method.to_uppercase(),
        oauth_encode(url),
        oauth_encode(&parameter_string)
    );

    let signing_key = format!("{}&{}", oauth_encode(api_secret), oauth_encode(token_secret));
    let mut mac = HmacSha1::new_from_slice(signing_key.as_bytes()).unwrap();
    mac.update(base_string.as_bytes());
    let signature = base64::Engine::encode(&base64::prelude::BASE64_STANDARD, mac.finalize().into_bytes());

    let header = format!(
        "OAuth oauth_consumer_key=\"{}\", oauth_nonce=\"{}\", oauth_signature=\"{}\", oauth_signature_method=\"HMAC-SHA1\", oauth_timestamp=\"{}\", oauth_token=\"{}\", oauth_version=\"1.0\"",
        oauth_encode(api_key),
        oauth_encode(&nonce),
        oauth_encode(&signature),
        oauth_encode(&timestamp),
        oauth_encode(token)
    );

    header
}

fn format_character_hashtags(prompt: &str) -> String {
    let mut hashtags = Vec::new();
    let mut seen = HashSet::new();
    
    // Load and parse characters.txt
    let mut name_list = Vec::new();
    if let Ok(content) = std::fs::read_to_string("characters.txt") {
        // 1. Remove backslashes: e.g. "seia \(blue archive\)" -> "seia (blue archive)"
        let cleaned = content.replace("\\", "");
        
        // 2. Split by comma and process each entry
        for entry in cleaned.split(',') {
            // 3. Remove content in parentheses: everything from the first '(' to the end of that part
            let name_part = entry.split('(').next().unwrap_or("").trim();
            if !name_part.is_empty() {
                name_list.push(name_part.to_string());
            }
        }
    }
    
    // Unique names to avoid redundant searches
    name_list.sort();
    name_list.dedup();

    let lower_prompt = prompt.to_lowercase();
    for name in name_list {
        if lower_prompt.contains(&name.to_lowercase()) {
            // 1. Full name with underscores: #Kanzaki_Kaori
            let full_tag = format!("#{}", name.replace(" ", "_"));
            if seen.insert(full_tag.clone()) {
                hashtags.push(full_tag);
            }
            
            // 2. Individual words: #Kanzaki #Kaori (only if multi-word)
            let words: Vec<&str> = name.split_whitespace().collect();
            if words.len() > 1 {
                for word in words {
                    if word.len() > 1 {
                        let word_tag = format!("#{}", word);
                        if seen.insert(word_tag.clone()) {
                            hashtags.push(word_tag);
                        }
                    }
                }
            }
        }
    }
    
    hashtags.join(" ")
}

#[tauri::command]
pub fn twitter_upload(app_handle: AppHandle, path: String, settings: TwitterSettings) -> Result<(), String> {
    let metadata = read_metadata(&path).map_err(|e| e.to_string())?;
    
    let mut phrases_found = Vec::new();
    let mut seen_tags = HashSet::new();
    let prompt_text = metadata.prompt.clone().unwrap_or_default();

    if let Some(prompt) = metadata.prompt {
        let tags: Vec<String> = prompt.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        
        for p in &settings.phrases_to_pick {
            for tag in &tags {
                if !seen_tags.contains(tag) && tag.to_lowercase().contains(&p.to_lowercase()) {
                    phrases_found.push(tag.clone());
                    seen_tags.insert(tag.clone());
                    break;
                }
            }
        }
    }
    
        let phrases_str = phrases_found.join(", ");
        let character_hashtags = format_character_hashtags(&prompt_text);
        
        // 1. Initial replacement
        let mut final_text = settings.template.replace("{phrases}", &phrases_str);
        final_text = final_text.replace("{hashtags}", &character_hashtags);
    
        // 2. Surgical Cleanup: Remove redundant newlines if placeholders were empty
        // This handles cases where "{phrases}\n\n{hashtags}" becomes "\n\n#Character"
        let mut cleaned_text = final_text.trim().to_string();
        while cleaned_text.contains("\n\n\n") {
            cleaned_text = cleaned_text.replace("\n\n\n", "\n\n");
        }
        
        // If API keys are missing, fallback to clipboard + browser
        if settings.api_key.is_empty() || settings.access_token.is_empty() {
            let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
            
            // 1. Copy image to clipboard first
            if settings.auto_copy_image {
                let img = image::open(&path).map_err(|e| e.to_string())?;
                let rgba = img.to_rgba8();
                let (width, height) = rgba.dimensions();
                let image_data = ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: Cow::from(rgba.as_raw()),
                };
                clipboard.set_image(image_data).map_err(|e| e.to_string())?;
            }
    
            // 2. Open browser with pre-filled text (X Intent URL)
            let encoded_text = oauth_encode(&cleaned_text);
            let intent_url = format!("https://x.com/intent/post?text={}", encoded_text);
            
            app_handle.opener().open_url(intent_url, None::<String>).map_err(|e| e.to_string())?;
            return Ok(());
        }
    
        // Standard API Upload Logic
        let client = Client::new();
        let media_upload_url = "https://upload.twitter.com/1.1/media/upload.json";
        
        // 1. INIT
        let file_size = std::fs::metadata(&path).map_err(|e| e.to_string())?.len();
        let params = vec![
            ("command".to_string(), "INIT".to_string()),
            ("total_bytes".to_string(), file_size.to_string()),
            ("media_type".to_string(), "image/png".to_string()), // Simplified for now
        ];
        let auth_header = generate_oauth_header("POST", media_upload_url, &params, &settings.api_key, &settings.api_secret, &settings.access_token, &settings.access_secret);
        let resp = client.post(media_upload_url)
            .header("Authorization", auth_header)
            .form(&params)
            .send().map_err(|e: reqwest::Error| e.to_string())?;
        
        let init_res: serde_json::Value = resp.json().map_err(|e: reqwest::Error| e.to_string())?;
        let media_id_string = init_res["media_id_string"].as_str().ok_or("Failed to get media_id from INIT")?.to_string();
    
        // 2. APPEND
        let mut file = File::open(&path).map_err(|e| e.to_string())?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
        
        let params_append = vec![
            ("command".to_string(), "APPEND".to_string()),
            ("media_id".to_string(), media_id_string.clone()),
            ("segment_index".to_string(), "0".to_string()),
        ];
        let auth_header_append = generate_oauth_header("POST", media_upload_url, &params_append, &settings.api_key, &settings.api_secret, &settings.access_token, &settings.access_secret);
        
        let part = reqwest::blocking::multipart::Part::bytes(buffer).file_name("blob");
        let form = reqwest::blocking::multipart::Form::new()
            .text("command", "APPEND")
            .text("media_id", media_id_string.clone())
            .text("segment_index", "0")
            .part("media", part);
    
        client.post(media_upload_url)
            .header("Authorization", auth_header_append)
            .multipart(form)
            .send().map_err(|e: reqwest::Error| e.to_string())?;
    
        // 3. FINALIZE
        let params_fin = vec![
            ("command".to_string(), "FINALIZE".to_string()),
            ("media_id".to_string(), media_id_string.clone()),
        ];
        let auth_header_fin = generate_oauth_header("POST", media_upload_url, &params_fin, &settings.api_key, &settings.api_secret, &settings.access_token, &settings.access_secret);
        client.post(media_upload_url)
            .header("Authorization", auth_header_fin)
            .form(&params_fin)
            .send().map_err(|e: reqwest::Error| e.to_string())?;
    
        // 4. STATUS check (usually for videos/gifs, but good practice)
        
        // 5. Post Tweet (V2)
        let tweet_url = "https://api.twitter.com/2/tweets";
        let json_body = serde_json::json!({
            "text": cleaned_text,
            "media": {
                "media_ids": [media_id_string]
            }
        });
    
    let auth_header_tweet = generate_oauth_header("POST", tweet_url, &[], &settings.api_key, &settings.api_secret, &settings.access_token, &settings.access_secret);
    let resp_tweet = client.post(tweet_url)
        .header("Authorization", auth_header_tweet)
        .json(&json_body)
        .send().map_err(|e: reqwest::Error| e.to_string())?;

    if !resp_tweet.status().is_success() {
        let err_text = resp_tweet.text().unwrap_or_default();
        return Err(format!("Tweet failed: {}", err_text));
    }

    Ok(())
}

