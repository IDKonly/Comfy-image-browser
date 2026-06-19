// Secure storage for sensitive credentials (Twitter/X API keys) via the OS keychain
// (Windows Credential Manager on Windows). Secrets never touch localStorage / app data
// files; they live only in the OS credential vault and are loaded on demand.

use serde::{Deserialize, Serialize};

const KEYRING_SERVICE: &str = "com.comfyview.app";
const TWITTER_ENTRY: &str = "twitter_secrets";

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct TwitterSecrets {
    pub api_key: String,
    pub api_secret: String,
    pub access_token: String,
    pub access_secret: String,
}

impl TwitterSecrets {
    /// True when at least the consumer key and access token are present, i.e. a direct
    /// API upload can be attempted (matches the backend's upload decision).
    pub fn is_complete(&self) -> bool {
        !self.api_key.is_empty() && !self.access_token.is_empty()
    }
}

fn entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, TWITTER_ENTRY).map_err(|e| e.to_string())
}

/// Internal loader used by other backend modules (e.g. twitter_upload). Returns an empty
/// struct when nothing is stored so callers can treat "no keys" as the clipboard path.
pub fn load_twitter_secrets_internal() -> TwitterSecrets {
    let entry = match entry() {
        Ok(e) => e,
        Err(_) => return TwitterSecrets::default(),
    };
    match entry.get_password() {
        Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
        Err(keyring::Error::NoEntry) => TwitterSecrets::default(),
        Err(e) => {
            log::warn!("[secrets] failed to read Twitter secrets from keychain: {}", e);
            TwitterSecrets::default()
        }
    }
}

#[tauri::command]
pub fn save_twitter_secrets(secrets: TwitterSecrets) -> Result<(), String> {
    let entry = entry()?;
    // If every field is blank, treat this as a request to clear the stored credentials.
    if secrets.api_key.is_empty()
        && secrets.api_secret.is_empty()
        && secrets.access_token.is_empty()
        && secrets.access_secret.is_empty()
    {
        return match entry.delete_password() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        };
    }
    let json = serde_json::to_string(&secrets).map_err(|e| e.to_string())?;
    entry.set_password(&json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_twitter_secrets() -> Result<TwitterSecrets, String> {
    Ok(load_twitter_secrets_internal())
}

#[tauri::command]
pub fn has_twitter_secrets() -> Result<bool, String> {
    Ok(load_twitter_secrets_internal().is_complete())
}

#[tauri::command]
pub fn delete_twitter_secrets() -> Result<(), String> {
    let entry = entry()?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
