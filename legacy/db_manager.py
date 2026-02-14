
import sqlite3
import os
import time
import threading
from config import logger
from image_utils import get_image_info_fast, parse_metadata_fast

DB_FILE = ".image_manager.db"

class DBManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()

    def _init_db(self):
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS images (
                    path TEXT PRIMARY KEY,
                    folder TEXT,
                    mtime REAL,
                    width INTEGER,
                    height INTEGER,
                    prompt TEXT,
                    negative_prompt TEXT,
                    loras TEXT,
                    model TEXT,
                    steps INTEGER,
                    cfg REAL,
                    raw_parameters TEXT
                )
            ''')
            
            # Indexes for faster search
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_folder ON images (folder)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mtime ON images (mtime)')
            self.conn.commit()

    def close(self):
        self.conn.close()

    def batch_upsert_images(self, file_paths):
        """
        Optimized batch update/insert.
        1. Parallel metadata extraction.
        2. Single DB transaction.
        """
        if not file_paths:
            return

        import concurrent.futures
        
        # Helper for parallel execution
        def process_file(file_path):
            try:
                if not os.path.exists(file_path):
                    return None
                
                mtime = os.path.getmtime(file_path)
                folder = os.path.dirname(file_path)
                width, height, info = get_image_info_fast(file_path)
                parsed = parse_metadata_fast(info)
                
                prompt = parsed.get('Prompt', '')
                negative = parsed.get('Negative prompt', '')
                loras = parsed.get('LoRAs', '')
                model = parsed.get('Model', '')
                
                try: steps = int(parsed.get('Steps', 0))
                except: steps = 0
                
                try: cfg = float(parsed.get('CFG scale', 0.0))
                except: cfg = 0.0
                    
                raw_params = info.get('parameters', '')
                
                return (file_path, folder, mtime, width, height, prompt, negative, loras, model, steps, cfg, raw_params)
            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                return None

        # 1. Parallel Metadata Extraction
        data_to_insert = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            results = executor.map(process_file, file_paths)
            for res in results:
                if res:
                    data_to_insert.append(res)
        
        # 2. Bulk DB Insert (Single Transaction)
        if data_to_insert:
            with self.lock:
                try:
                    cursor = self.conn.cursor()
                    cursor.execute("BEGIN TRANSACTION")
                    cursor.executemany('''
                        INSERT OR REPLACE INTO images 
                        (path, folder, mtime, width, height, prompt, negative_prompt, loras, model, steps, cfg, raw_parameters)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', data_to_insert)
                    self.conn.commit()
                except Exception as e:
                    self.conn.rollback()
                    logger.error(f"Batch insert failed: {e}")

    def upsert_image(self, file_path):
        """Updates or inserts image metadata into DB."""
        if not os.path.exists(file_path):
            return

        mtime = os.path.getmtime(file_path)
        folder = os.path.dirname(file_path)
        
        # Check if update is needed
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("SELECT mtime FROM images WHERE path = ?", (file_path,))
            row = cursor.fetchone()
            if row and row['mtime'] == mtime:
                return # Already up to date

        # Read metadata (Time consuming, do outside lock if possible, but SQLite write needs serialization)
        # But here we just prepare data.
        width, height, info = get_image_info_fast(file_path)
        parsed = parse_metadata_fast(info)
        
        prompt = parsed.get('Prompt', '')
        negative = parsed.get('Negative prompt', '')
        loras = parsed.get('LoRAs', '')
        model = parsed.get('Model', '')
        steps = parsed.get('Steps', 0)
        try:
            steps = int(steps)
        except:
            steps = 0
            
        cfg = parsed.get('CFG scale', 0.0)
        try:
            cfg = float(cfg)
        except:
            cfg = 0.0
            
        raw_params = info.get('parameters', '')

        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute('''
                INSERT OR REPLACE INTO images 
                (path, folder, mtime, width, height, prompt, negative_prompt, loras, model, steps, cfg, raw_parameters)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (file_path, folder, mtime, width, height, prompt, negative, loras, model, steps, cfg, raw_params))
            self.conn.commit()

    def delete_images(self, paths):
        with self.lock:
            cursor = self.conn.cursor()
            cursor.executemany("DELETE FROM images WHERE path = ?", [(p,) for p in paths])
            self.conn.commit()

    def get_images_in_folder(self, folder_path, sort_by='filename'):
        with self.lock:
            cursor = self.conn.cursor()
            query = "SELECT path FROM images WHERE folder = ?"
            
            if sort_by == 'filename':
                query += " ORDER BY path ASC" # simple path sort
            elif sort_by == 'mtime':
                query += " ORDER BY mtime DESC"
                
            cursor.execute(query, (folder_path,))
            rows = cursor.fetchall()
            return [row['path'] for row in rows]

    def get_metadata(self, file_path):
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("SELECT * FROM images WHERE path = ?", (file_path,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None

    def search(self, folder_path, terms):
        """
        Search for images in the folder matching ALL terms.
        terms: list of lowercase strings.
        """
        if not terms:
            return self.get_images_in_folder(folder_path)

        with self.lock:
            query = "SELECT path FROM images WHERE folder = ?"
            params = [folder_path]
            
            for term in terms:
                # Naive search: term must appear in prompt OR negative_prompt OR loras
                # To enforce "ALL terms", we add AND condition for each term
                sub_query = " AND (prompt LIKE ? OR negative_prompt LIKE ? OR loras LIKE ?)"
                query += sub_query
                pattern = f"%{term}%"
                params.extend([pattern, pattern, pattern])
            
            query += " ORDER BY path ASC"
            
            cursor = self.conn.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [row['path'] for row in rows]
            
    def get_prompts_for_paths(self, paths):
        """Retrieves a dictionary of {path: prompt} for the given list of paths."""
        if not paths:
            return {}
        with self.lock:
            cursor = self.conn.cursor()
            placeholders = ','.join(['?'] * len(paths))
            cursor.execute(f"SELECT path, prompt FROM images WHERE path IN ({placeholders})", paths)
            return {row['path']: row['prompt'] for row in cursor.fetchall()}

    def sync_folder(self, folder_path, current_files):
        """
        Syncs DB with actual files in folder.
        current_files: list of absolute paths of existing images.
        """
        current_files_set = set(current_files)
        
        with self.lock:
            cursor = self.conn.cursor()
            cursor.execute("SELECT path, mtime FROM images WHERE folder = ?", (folder_path,))
            db_files = {row['path']: row['mtime'] for row in cursor.fetchall()}
        
        # Determine actions
        to_insert = []
        to_update = []
        
        for path in current_files:
            if path not in db_files:
                to_insert.append(path)
            elif abs(os.path.getmtime(path) - db_files[path]) > 0.001: # Float comparison
                to_update.append(path)
        
        to_delete = [path for path in db_files if path not in current_files_set]
        
        # Execute updates (Insert/Update can be slow, so we can do it in batches or parallel outside lock if needed)
        # For simplicity, we process one by one but `upsert_image` handles the lock.
        
        # Batch delete
        if to_delete:
            self.delete_images(to_delete)
            
        return to_insert + to_update # Return list of files that need processing

