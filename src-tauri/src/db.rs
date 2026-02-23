use rusqlite::{params, Connection, Result};
use std::path::Path;
use crate::metadata::ImageMetadata;
use crate::scanner::{ImageInfo, SortMethod};
use tauri::Manager;
use log;
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ImageInfoWithTags {
    pub path: String,
    pub name: String,
    pub prompt: Option<String>,
    pub negative_prompt: Option<String>,
}

#[tauri::command]
pub fn get_db_status(app_handle: tauri::AppHandle, folder: String) -> Result<serde_json::Value, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push(".image_manager_v2.db");
    
    let db = DB::open(&path).map_err(|e| e.to_string())?;
    let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();

    let total_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM images", [], |r| r.get(0)).unwrap_or(0);
    let folder_count: i64 = db.conn.query_row("SELECT COUNT(*) FROM images WHERE (folder = ?1 OR folder LIKE ?1 || '/%')", [normalized_folder.clone()], |r| r.get(0)).unwrap_or(0);
    
    // Get sample of 3 paths in folder
    let mut stmt = db.conn.prepare("SELECT path FROM images WHERE (folder = ?1 OR folder LIKE ?1 || '/%') LIMIT 3").map_err(|e| e.to_string())?;
    let samples_iter = stmt.query_map([normalized_folder], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
    
    let mut samples = Vec::new();
    for s in samples_iter {
        if let Ok(path) = s { samples.push(path); }
    }

    Ok(serde_json::json!({
        "total_images": total_count,
        "folder_images": folder_count,
        "samples": samples,
        "db_path": path.to_string_lossy().to_string()
    }))
}

pub struct DB {
    conn: Connection,
}

impl DB {
    pub fn open(db_path: &Path) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        
        conn.pragma_update(None, "journal_mode", "WAL")?;
        
        conn.execute(
            "CREATE TABLE IF NOT EXISTS images (
                path TEXT PRIMARY KEY,
                name TEXT,
                folder TEXT,
                mtime INTEGER,
                size INTEGER,
                prompt TEXT,
                negative_prompt TEXT,
                steps INTEGER,
                sampler TEXT,
                cfg REAL,
                seed INTEGER,
                model TEXT,
                raw TEXT
            )",
            [],
        )?;

        conn.execute("CREATE INDEX IF NOT EXISTS idx_folder ON images (folder)", [])?;
        conn.execute("CREATE INDEX IF NOT EXISTS idx_mtime ON images (mtime)", [])?;

        Ok(DB { conn })
    }

    pub fn insert_image(&self, info: &ImageInfo, meta: &ImageMetadata) -> Result<()> {
        let folder = Path::new(&info.path).parent()
            .map(|p| p.to_string_lossy().to_string().replace("\\", "/"))
            .unwrap_or_default();

        self.conn.execute(
            "INSERT OR REPLACE INTO images 
            (path, name, folder, mtime, size, prompt, negative_prompt, steps, sampler, cfg, seed, model, raw) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                info.path,
                info.name,
                folder,
                info.mtime as i64,
                info.size as i64,
                meta.prompt,
                meta.negative_prompt,
                meta.steps,
                meta.sampler,
                meta.cfg,
                meta.seed.map(|s| s as i64),
                meta.model,
                meta.raw,
            ],
        )?;
        Ok(())
    }

    pub fn delete_image(&self, path: &str) -> Result<()> {
        self.conn.execute("DELETE FROM images WHERE path = ?1", params![path])?;
        Ok(())
    }

    pub fn delete_images(&self, paths: &[String]) -> Result<()> {
        if paths.is_empty() { return Ok(()); }
        let mut stmt = self.conn.prepare("DELETE FROM images WHERE path = ?1")?;
        for path in paths {
            let _ = stmt.execute(params![path]);
        }
        Ok(())
    }

    pub fn update_image_path(&self, old_path: &str, new_path: &str) -> Result<()> {
        let new_folder = Path::new(new_path).parent()
            .map(|p| p.to_string_lossy().to_string().replace("\\", "/"))
            .unwrap_or_default();
        let new_name = Path::new(new_path).file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        self.conn.execute(
            "UPDATE images SET path = ?1, name = ?2, folder = ?3 WHERE path = ?4",
            params![new_path, new_name, new_folder, old_path],
        )?;
        Ok(())
    }

    pub fn get_all_paths_in_folder(&self, folder: &str, recursive: bool) -> Result<Vec<String>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let sql = if recursive {
            "SELECT path FROM images WHERE (folder = ?1 OR folder LIKE ?1 || '/%')"
        } else {
            "SELECT path FROM images WHERE folder = ?1"
        };

        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![normalized_folder], |row| row.get(0))?;

        let mut results = Vec::new();
        for r in rows { results.push(r?); }
        Ok(results)
    }

    pub fn get_all_images_with_tags(&self, root_folder: &str, recursive: bool) -> Result<Vec<ImageInfoWithTags>> {
        let normalized_folder = root_folder.replace("\\", "/").trim_end_matches('/').to_string();
        let sql = if recursive {
            "SELECT path, name, prompt, negative_prompt FROM images WHERE (folder = ?1 OR folder LIKE ?1 || '/%')"
        } else {
            "SELECT path, name, prompt, negative_prompt FROM images WHERE folder = ?1"
        };

        let mut stmt = self.conn.prepare(sql)?;
        let rows = stmt.query_map(params![normalized_folder], |row| {
            Ok(ImageInfoWithTags {
                path: row.get(0)?,
                name: row.get(1)?,
                prompt: row.get(2)?,
                negative_prompt: row.get(3)?,
            })
        })?;

        let mut results = Vec::new();
        for img in rows { results.push(img?); }
        Ok(results)
    }

    pub fn get_subfolder_counts(&self, subfolders: Vec<String>) -> Result<std::collections::HashMap<String, i64>> {
        let mut counts = std::collections::HashMap::new();
        if subfolders.is_empty() { return Ok(counts); }

        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM images WHERE folder = ?1")?;
        for folder in subfolders {
            let normalized = folder.replace("\\", "/");
            let count: i64 = stmt.query_row(params![normalized], |r| r.get(0)).unwrap_or(0);
            counts.insert(folder, count);
        }
        Ok(counts)
    }

    pub fn search(&self, folder: &str, query: &str) -> Result<Vec<ImageInfo>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let mut stmt = self.conn.prepare(
            "SELECT path, name, mtime, size FROM images 
             WHERE folder = ?1 AND (prompt LIKE ?2 OR negative_prompt LIKE ?2 OR name LIKE ?2)
             ORDER BY mtime DESC"
        )?;
        
        let pattern = format!("%{}%", query);
        let rows = stmt.query_map(params![normalized_folder, pattern], |row| {
            Ok(ImageInfo {
                path: row.get(0)?,
                name: row.get(1)?,
                mtime: row.get::<_, i64>(2)? as u64,
                size: row.get::<_, i64>(3)? as u64,
            })
        })?;

        let mut results = Vec::new();
        for img in rows {
            results.push(img?);
        }
        Ok(results)
    }

    pub fn get_indexed_mtime(&self, path: &str) -> Result<Option<u64>> {
        let mut stmt = self.conn.prepare("SELECT mtime FROM images WHERE path = ?1")?;
        let mut rows = stmt.query(params![path])?;
        if let Some(row) = rows.next()? {
            let mtime: i64 = row.get(0)?;
            Ok(Some(mtime as u64))
        } else {
            Ok(None)
        }
    }

    pub fn get_folder_prompts(&self, folder: &str) -> Result<std::collections::HashMap<String, Option<String>>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let mut stmt = self.conn.prepare("SELECT path, prompt FROM images WHERE folder = ?1")?;
        let rows = stmt.query_map(params![normalized_folder], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?;

        let mut prompts = std::collections::HashMap::new();
        for row in rows {
            let (path, prompt) = row?;
            prompts.insert(path, prompt);
        }
        Ok(prompts)
    }

    pub fn get_distinct_models(&self, folder: &str) -> Result<Vec<String>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let mut stmt = self.conn.prepare("SELECT DISTINCT model FROM images WHERE folder = ?1 AND model IS NOT NULL AND model != '' ORDER BY model")?;
        let rows = stmt.query_map(params![normalized_folder], |row| row.get(0))?;
        let mut results = Vec::new();
        for r in rows { results.push(r?); }
        Ok(results)
    }

    pub fn get_distinct_samplers(&self, folder: &str) -> Result<Vec<String>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        let mut stmt = self.conn.prepare("SELECT DISTINCT sampler FROM images WHERE folder = ?1 AND sampler IS NOT NULL AND sampler != '' ORDER BY sampler")?;
        let rows = stmt.query_map(params![normalized_folder], |row| row.get(0))?;
        let mut results = Vec::new();
        for r in rows { results.push(r?); }
        Ok(results)
    }

    pub fn search_advanced(&self, folder: &str, query: &str, model: &str, sampler: &str, sort_method: SortMethod, recursive: bool) -> Result<Vec<ImageInfo>> {
        let normalized_folder = folder.replace("\\", "/").trim_end_matches('/').to_string();
        log::debug!("SEARCH: Folder: {}, Query: '{}', Model: '{}', Sampler: '{}', Recursive: {}", normalized_folder, query, model, sampler, recursive);
        
        let folder_condition = if recursive {
            "(folder = ?1 OR folder LIKE ?1 || '/%')"
        } else {
            "folder = ?1"
        };

        let mut sql = format!("SELECT path, name, mtime, size FROM images WHERE {} ", folder_condition);
        let mut params: Vec<String> = vec![normalized_folder];

        if !query.trim().is_empty() {
            let tags: Vec<&str> = query.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
            for tag in tags {
                let param_idx = params.len() + 1;
                // Use COLLATE NOCASE for case-insensitive search
                sql.push_str(&format!(" AND (prompt LIKE ?{} COLLATE NOCASE OR negative_prompt LIKE ?{} COLLATE NOCASE OR name LIKE ?{} COLLATE NOCASE)", param_idx, param_idx, param_idx));
                params.push(format!("%{}%", tag));
            }
        }

        if !model.is_empty() {
            let param_idx = params.len() + 1;
            sql.push_str(&format!(" AND model = ?{} COLLATE NOCASE", param_idx));
            params.push(model.to_string());
        }

        if !sampler.is_empty() {
            let param_idx = params.len() + 1;
            sql.push_str(&format!(" AND sampler = ?{} COLLATE NOCASE", param_idx));
            params.push(sampler.to_string());
        }

        let order_by = match sort_method {
            SortMethod::Newest => "ORDER BY mtime DESC",
            SortMethod::Oldest => "ORDER BY mtime ASC",
            SortMethod::NameAsc => "ORDER BY name COLLATE NOCASE ASC",
            SortMethod::NameDesc => "ORDER BY name COLLATE NOCASE DESC",
        };
        sql.push_str(&format!(" {}", order_by));
        
        log::debug!("SQL: {}", sql);
        log::debug!("PARAMS: {:?}", params);

        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), |row| {
             Ok(ImageInfo {
                path: row.get(0)?,
                name: row.get(1)?,
                mtime: row.get::<_, i64>(2)? as u64,
                size: row.get::<_, i64>(3)? as u64,
            })
        })?;

        let mut results = Vec::new();
        for img in rows { results.push(img?); }
        log::debug!("SEARCH RESULT COUNT: {}", results.len());
        Ok(results)
    }
}
