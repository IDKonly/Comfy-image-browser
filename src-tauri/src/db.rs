use rusqlite::{params, Connection, Result};
use std::path::Path;
use crate::metadata::ImageMetadata;
use crate::scanner::ImageInfo;

pub struct DB {
    conn: Connection,
}

impl DB {
    pub fn open() -> Result<Self> {
        let conn = Connection::open(".image_manager_v2.db")?;
        
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
            .map(|p| p.to_string_lossy().to_string())
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

    pub fn search(&self, folder: &str, query: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT path FROM images 
             WHERE folder = ?1 AND (prompt LIKE ?2 OR negative_prompt LIKE ?2 OR name LIKE ?2)
             ORDER BY mtime DESC"
        )?;
        
        let pattern = format!("%{}%", query);
        let rows = stmt.query_map(params![folder, pattern], |row| {
            row.get(0)
        })?;

        let mut results = Vec::new();
        for path in rows {
            results.push(path?);
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
}
