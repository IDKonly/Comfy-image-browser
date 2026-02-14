
import os
import shutil
import threading
import customtkinter as ctk
from tkinter import filedialog, messagebox, Tk
from tkinterdnd2 import DND_ALL

from config import APP_CONFIG, save_config, logger, SUPPORTED_EXTENSIONS, PerformanceTimer
from db_manager import DBManager
from image_loader import ImageLoader
from ui_view import UIManager
from image_utils import LRUCache
from visual_debugger import setup_visual_debugger

class AppController:
    def __init__(self, root):
        self.root = root
        self.root.title("Image Manager Optimized")
        self.root.geometry("1200x800")
        
        # Visual Debugger Setup
        setup_visual_debugger(self)
        
        # Managers
        self.db = DBManager()
        self.loader = ImageLoader()
        
        # State
        self.folder_path = None
        self.image_files = [] # List of paths
        self.current_index = 0

        self.view_mode = "fit"
        self.rotation_angle = 0
        self.is_loading_folder = False
        self.settings_window = None
        self.search_focused = False
        self.is_batch_mode = False
        self.prompt_cache = {} # Cache for fast batch operations
        self.last_batch_files = None # Cache to prevent re-rendering batch view
        self.last_preview_range = None # Cache to prevent re-rendering previews
        self.selected_batch_path = None # Currently selected item in batch mode
        
        # UI Callbacks
        callbacks = {
            'open_folder': self.open_folder_dialog,
            'refresh': self.refresh_folder,
            'on_closing': self.on_closing,
            'open_settings': self.open_settings,
            'copy_metadata': self.copy_metadata,
            'previous_image': self.show_previous,
            'next_image': self.show_next,
            'delete_image': self.delete_current,
            'move_to_keep': self.move_to_keep,
            'rotate_left': lambda: self.rotate(90),
            'rotate_right': lambda: self.rotate(-90),
            'zoom_in': lambda: self.zoom(1.1),
            'zoom_out': lambda: self.zoom(0.9),
            'toggle_view_mode': self.toggle_view_mode,
            'toggle_batch_mode': self.toggle_batch_mode,
            'move_search_results': self.move_search_results,
            'perform_search': self.perform_search,
            'clear_search': self.clear_search,
            'on_search_focus_in': self.on_search_focus_in,
            'on_search_focus_out': self.on_search_focus_out,
            'go_to_index': self.go_to_index,
            'on_preview_click': self.on_preview_click,
            'on_batch_click': self.on_batch_item_click
        }
        
        self.ui = UIManager(self, self.root, callbacks)
        self.styles = self.ui.styles

        # Setup Shortcuts
        self._bind_shortcuts()
        
        # Setup Drag & Drop
        self.root.drop_target_register(DND_ALL)
        self.root.dnd_bind('<<Drop>>', self.on_drop)
        
        # Bind Resize Event
        self.ui.image_display_frame.bind("<Configure>", self.on_resize)
        self.root.bind("<Map>", lambda e: self.root.after(500, self.load_current_image))
        self._resize_timer = None

        # Start Loop
        self.root.after(100, self._update_loop)
        
        # Load Initial State
        self.load_initial_state()

    def on_search_focus_in(self, event):
        self.search_focused = True

    def on_search_focus_out(self, event):
        self.search_focused = False

    def _bind_shortcuts(self):
        shortcuts = APP_CONFIG.get("shortcuts", {})
        action_map = {
            "open_folder": self.open_folder_dialog,
            "refresh_list": self.refresh_folder,
            "previous_image": self.show_previous,
            "next_image": self.show_next,
            "delete_image": self.delete_current,
            "move_to_keep": self.move_to_keep,
            "rotate_left": lambda: self.rotate(90),
            "rotate_right": lambda: self.rotate(-90),
            "zoom_in": lambda: self.zoom(1.1),
            "zoom_out": lambda: self.zoom(0.9),
            "toggle_view_mode": self.toggle_view_mode,
            "go_to_index": lambda: self.ui.go_to_index_entry.focus_set()
        }

        for action, key in shortcuts.items():
            if action in action_map:
                formatted_key = key if key.startswith("<") else f"<{key}>"
                
                # Wrap with focus check
                def callback(event=None, func=action_map[action]):
                    if self.search_focused:
                        return
                    func()

                try:
                    self.root.bind(formatted_key, callback)
                except Exception as e:
                    logger.error(f"Failed to bind shortcut {key}: {e}")

    def on_resize(self, event):
        # Ignore events from children (only process the main frame's resize)
        # Using event.widget.master might be needed or just checking dimensions
        
        # Check if size significantly changed to prevent loops
        current_size = (event.width, event.height)
        if hasattr(self, '_last_size') and self._last_size:
            if abs(self._last_size[0] - current_size[0]) < 10 and abs(self._last_size[1] - current_size[1]) < 10:
                return

        if self._resize_timer:
            self.root.after_cancel(self._resize_timer)
            
        self._last_size = current_size
        self._resize_timer = self.root.after(300, lambda: self.load_current_image(force_batch_refresh=True))

    def load_initial_state(self):
        state = APP_CONFIG.get("state", {})
        last_folder = state.get("last_folder")
        saved_index = state.get("current_index", 0)
        self.view_mode = state.get("view_mode", "fit")
        self.is_batch_mode = state.get("is_batch_mode", False)
        
        # Update Batch Button Style if active
        if self.is_batch_mode:
            btn = self.ui.batch_mode_btn
            btn.configure(fg_color="#0078D4")
        
        if last_folder and os.path.exists(last_folder):
            self.change_folder(last_folder, target_index=saved_index)
            
    def _update_loop(self):
        try:
            processed_count = 0
            MAX_PROCESS_PER_TICK = 5  # Limit to prevent UI freeze
            
            while processed_count < MAX_PROCESS_PER_TICK:
                result = self.loader.get_result()
                if not result:
                    break
                path, pil_image, is_thumbnail = result
                processed_count += 1
                
                if is_thumbnail:
                    if pil_image:
                        ctk_img = ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=pil_image.size)
                        try:
                            self.ui.update_single_thumbnail(path, ctk_img)
                        except Exception as e:
                            logger.debug(f"Failed to update thumbnail for {path}: {e}")
                else:
                    # Update Main Image
                    if self.image_files and path == self.image_files[self.current_index] and not self.is_batch_mode:
                        if pil_image:
                            ctk_img = ctk.CTkImage(light_image=pil_image, dark_image=pil_image, size=pil_image.size)
                            try:
                                self.ui.update_image(ctk_img)
                            except Exception as e:
                                logger.debug(f"Failed to update main image: {e}")
                            meta = self.db.get_metadata(path)
                            self.ui.update_metadata(meta)
                        else:
                            self.ui.update_image(None)

        except Exception as e:
            logger.error(f"Error in update loop: {e}")
            
        self.root.after(30, self._update_loop)

    def open_folder_dialog(self):
        folder = filedialog.askdirectory()
        if folder:
            self.change_folder(folder)

    def change_folder(self, folder_path, target_image_path=None, target_index=None):
        self.folder_path = os.path.normpath(folder_path)
        self.rotation_angle = 0
        self.ui.status_var.set("폴더 스캔 중...")
        self.loader.clear_queue()
        self.last_batch_files = None # Reset batch cache
        self.last_preview_range = None # Reset preview cache
        
        # Store pending target image (normalized)
        if target_image_path:
            self._pending_target_image = os.path.normpath(target_image_path)
        else:
            self._pending_target_image = None
            
        self._pending_target_index = target_index
        
        threading.Thread(target=self._sync_folder_thread, args=(self.folder_path,), daemon=True).start()

    def _sync_folder_thread(self, folder_path):
        self.is_loading_folder = True
        try:
            current_files = []
            for ext in SUPPORTED_EXTENSIONS:
                import glob
                # glob paths usually match OS separator, but normpath ensures consistency
                found = glob.glob(os.path.join(folder_path, ext))
                current_files.extend([os.path.normpath(p) for p in found])
            
            to_process = self.db.sync_folder(folder_path, current_files)
            
            # Use Batch Processing
            if to_process:
                self.ui.status_var.set(f"색인 중... ({len(to_process)}개)")
                # Split into chunks of 50 to keep UI responsive-ish if list is huge
                chunk_size = 50
                for i in range(0, len(to_process), chunk_size):
                    chunk = to_process[i:i + chunk_size]
                    self.db.batch_upsert_images(chunk)
                    self.ui.status_var.set(f"색인 진행 중... ({min(i + chunk_size, len(to_process))}/{len(to_process)})")

            self.image_files = sorted(current_files)
            self.root.after(0, self._on_folder_loaded)
            
        except Exception as e:
            logger.error(f"Sync failed: {e}")
            self.is_loading_folder = False

    def _on_folder_loaded(self):
        self.is_loading_folder = False
        
        # Handle pending target image
        if hasattr(self, '_pending_target_image') and self._pending_target_image:
            target = self._pending_target_image
            try:
                # Try exact match first
                index = self.image_files.index(target)
                self.current_index = index
            except ValueError:
                # Try filename match as fallback (case-insensitive for safety)
                target_name = os.path.basename(target).lower()
                for i, p in enumerate(self.image_files):
                    if os.path.basename(p).lower() == target_name:
                        self.current_index = i
                        break
                else:
                    self.current_index = 0
            self._pending_target_image = None
        elif hasattr(self, '_pending_target_index') and self._pending_target_index is not None:
             if 0 <= self._pending_target_index < len(self.image_files):
                 self.current_index = self._pending_target_index
             else:
                 self.current_index = 0
             self._pending_target_index = None
        else:
            self.current_index = 0
            
        self.ui.status_var.set(f"{len(self.image_files)} 이미지 로드됨")
        
        if self.image_files:
            self.load_current_image()
            self.refresh_previews()
        else:
            self.ui.update_image(None)

    def refresh_folder(self):
        if self.folder_path:
            self.change_folder(self.folder_path)

    def toggle_batch_mode(self):
        self.is_batch_mode = not self.is_batch_mode
        self.last_batch_files = None # Force refresh of batch logic/view when toggling
        
        # Update Button Style
        btn = self.ui.batch_mode_btn
        if self.is_batch_mode:
            btn.configure(fg_color="#0078D4") # Active Color
            self.ui.status_var.set("배치 모드 활성화")
        else:
            # Restore original color (safe default)
            btn.configure(fg_color=self.ui.styles['button']['fg_color'] if 'fg_color' in self.ui.styles['button'] else "transparent")
            self.ui.status_var.set("배치 모드 비활성화")
            
        self.load_current_image()

    def get_current_batch_range(self):
        """Finds start and end index of contiguous images with same prompt by searching neighbors lazily."""
        with PerformanceTimer("get_current_batch_range"):
            if not self.image_files:
                return self.current_index, self.current_index
                
            current_path = self.image_files[self.current_index]
            current_meta = self.db.get_metadata(current_path)
            target_prompt = current_meta.get('prompt') if current_meta else None
            
            # If no prompt, treat as single item batch
            if not target_prompt:
                 return self.current_index, self.current_index

            start = self.current_index
            end = self.current_index

            # Scan backwards in chunks for efficiency
            chunk_size = 20
            with PerformanceTimer("batch_scan_backward"):
                while start > 0:
                    chunk_start = max(0, start - chunk_size)
                    chunk_paths = self.image_files[chunk_start : start]
                    prompts = self.db.get_prompts_for_paths(chunk_paths)
                    
                    stopped = False
                    # Check backwards from the end of the chunk
                    for i in range(len(chunk_paths) - 1, -1, -1):
                        path = chunk_paths[i]
                        if prompts.get(path) == target_prompt:
                            start -= 1
                        else:
                            stopped = True
                            break
                    if stopped: break

            # Scan forwards in chunks
            with PerformanceTimer("batch_scan_forward"):
                while end < len(self.image_files) - 1:
                    chunk_end = min(len(self.image_files), end + 1 + chunk_size)
                    chunk_paths = self.image_files[end + 1 : chunk_end]
                    prompts = self.db.get_prompts_for_paths(chunk_paths)
                    
                    stopped = False
                    for path in chunk_paths:
                        if prompts.get(path) == target_prompt:
                            end += 1
                        else:
                            stopped = True
                            break
                    if stopped: break
                    
            return start, end

    def load_current_image(self, force_batch_refresh=False):
        with PerformanceTimer("load_current_image"):
            if not self.image_files: return
            
            # --- Batch Mode Logic ---
            if self.is_batch_mode:
                start, end = self.get_current_batch_range()
                batch_files = self.image_files[start : end + 1]
                
                # Determine Selection
                if self.selected_batch_path not in batch_files:
                    self.selected_batch_path = batch_files[0] if batch_files else None

                # Only update UI if batch content changed OR forced (e.g. resize)
                if self.last_batch_files != batch_files or force_batch_refresh:
                    with PerformanceTimer("update_batch_view"):
                        self.ui.update_batch_view(batch_files, self.loader, self.selected_batch_path)
                    self.last_batch_files = batch_files
                
                self.ui.status_var.set(f"배치 모드: {len(batch_files)}개 이미지 (인덱스 {start+1}-{end+1})")
                
                # Update metadata for the selected image
                if self.selected_batch_path:
                    meta = self.db.get_metadata(self.selected_batch_path)
                    self.ui.update_metadata(meta)
                
                # Update previews normally to show context
                self.refresh_previews()
                return
            # ------------------------
            
            path = self.image_files[self.current_index]
            
            display_w = self.ui.image_display_frame.winfo_width()
            display_h = self.ui.image_display_frame.winfo_height()
            
            # Default size if not yet rendered
            if display_w < 10: display_w = 800
            if display_h < 10: display_h = 600
            
            target_size = (display_w, display_h) if self.view_mode == "fit" else None
            
            # Request Main Image (Priority 0, is_thumbnail=False)
            self.loader.request_image(path, priority=0, target_size=target_size, rotation=self.rotation_angle, is_thumbnail=False)
            
            # Request Preload
            next_idx = (self.current_index + 1) % len(self.image_files)
            prev_idx = (self.current_index - 1 + len(self.image_files)) % len(self.image_files)
            
            self.loader.request_image(self.image_files[next_idx], priority=1, target_size=target_size, is_thumbnail=False)
            self.loader.request_image(self.image_files[prev_idx], priority=1, target_size=target_size, is_thumbnail=False)
            
            self.ui.status_var.set(f"{self.current_index + 1} / {len(self.image_files)} | {os.path.basename(path)}")
            with PerformanceTimer("refresh_previews"):
                self.refresh_previews() 

    def refresh_previews(self):
        start = max(0, self.current_index - 5)
        end = min(len(self.image_files), start + 10)
        
        current_state = (start, end, self.current_index)
        if self.last_preview_range == current_state:
             return
             
        self.last_preview_range = current_state
        self.ui.update_previews(self.image_files, self.current_index, self.loader, start, end)

    def show_next(self):
        with PerformanceTimer("show_next"):
            if not self.image_files: return
            
            if self.is_batch_mode:
                # Jump to the start of the next batch
                with PerformanceTimer("calc_next_batch_index"):
                    _, current_end = self.get_current_batch_range()
                    next_index = current_end + 1
                    if next_index >= len(self.image_files):
                        next_index = 0 # Loop back
                self.current_index = next_index
            else:
                self.current_index = (self.current_index + 1) % len(self.image_files)
                
            self.rotation_angle = 0 
            self.load_current_image()

    def show_previous(self):
        if not self.image_files: return
        
        if self.is_batch_mode:
             # Jump to the start of the previous batch
             current_start, _ = self.get_current_batch_range()
             if current_start == 0:
                 self.current_index = len(self.image_files) - 1 # Loop to end
             else:
                 self.current_index = current_start - 1
                 # Adjust to start of THAT batch
                 start, _ = self.get_current_batch_range()
                 self.current_index = start
        else:
            self.current_index = (self.current_index - 1 + len(self.image_files)) % len(self.image_files)
            
        self.rotation_angle = 0 
        self.load_current_image()
        
    def perform_search(self, event=None):
        query = self.ui.search_entry_var.get().lower().strip()
        if not query:
            self.clear_search()
            return
            
        terms = [t.strip() for t in query.split(',')]
        results = self.db.search(self.folder_path, terms)
        
        if results:
            self.image_files = results
            self.current_index = 0
            self.load_current_image()
            self.ui.status_var.set(f"검색 결과: {len(results)}개")
        else:
            messagebox.showinfo("검색 결과", "검색 결과가 없습니다.")

    def clear_search(self, event=None):
        self.ui.search_entry_var.set("")
        if self.folder_path:
             self.image_files = self.db.get_images_in_folder(self.folder_path)
             self.current_index = 0
             self.load_current_image()

    def delete_current(self):
        if not self.image_files: return
        
        targets = []
        if self.is_batch_mode:
            start, end = self.get_current_batch_range()
            targets = self.image_files[start : end + 1]
            msg = f"배치 모드: {len(targets)}개의 이미지를 정말 삭제하시겠습니까?"
        else:
            targets = [self.image_files[self.current_index]]
            msg = "정말 삭제하시겠습니까?"

        if messagebox.askyesno("삭제", msg):
            try:
                trash_dir = os.path.join(self.folder_path, "_Trash")
                os.makedirs(trash_dir, exist_ok=True)
                
                for path in targets:
                    shutil.move(path, os.path.join(trash_dir, os.path.basename(path)))
                    self.db.delete_images([path])
                
                # Update list
                if self.is_batch_mode:
                    start, end = self.get_current_batch_range()
                    del self.image_files[start : end + 1]
                    if start >= len(self.image_files):
                        self.current_index = 0
                    else:
                        self.current_index = start
                else:
                     self.image_files.pop(self.current_index)
                     if self.current_index >= len(self.image_files):
                        self.current_index = 0
                
                self.load_current_image()
            except Exception as e:
                logger.error(f"Delete failed: {e}")

    def move_to_keep(self):
         if not self.image_files: return
         
         targets = []
         if self.is_batch_mode:
            start, end = self.get_current_batch_range()
            targets = self.image_files[start : end + 1]
         else:
            targets = [self.image_files[self.current_index]]

         try:
            keep_dir = os.path.join(self.folder_path, "_Keep")
            os.makedirs(keep_dir, exist_ok=True)
            
            for path in targets:
                shutil.move(path, os.path.join(keep_dir, os.path.basename(path)))
                self.db.delete_images([path])
            
            # Remove from list
            if self.is_batch_mode:
                start, end = self.get_current_batch_range()
                del self.image_files[start : end + 1]
                if start >= len(self.image_files):
                    self.current_index = 0
                else:
                    self.current_index = start
            else:
                self.image_files.pop(self.current_index)
                if self.current_index >= len(self.image_files):
                    self.current_index = 0
                    
            self.load_current_image()
         except Exception as e:
            logger.error(f"Keep failed: {e}")

    def rotate(self, angle):
        self.rotation_angle = (self.rotation_angle + angle) % 360
        self.load_current_image()

    def zoom(self, factor): 
        if factor > 1.0:
            self.view_mode = "original"
        else:
            self.view_mode = "fit"
        self.load_current_image()

    def toggle_view_mode(self):
        self.view_mode = "original" if self.view_mode == "fit" else "fit"
        self.load_current_image()
        
    def move_search_results(self):
        if not self.image_files or not self.folder_path: return
        
        # Check if we are in search mode (image_files != all files in folder)
        all_files = self.db.get_images_in_folder(self.folder_path)
        if len(self.image_files) == len(all_files):
             messagebox.showinfo("이동", "검색 결과가 아니거나 모든 파일이 선택되어 있습니다.")
             return

        # Get search query for folder name
        query = self.ui.search_entry_var.get().strip()
        if not query:
            messagebox.showinfo("이동", "검색어가 없습니다.")
            return

        # Sanitize folder name
        safe_name = "".join([c for c in query if c.isalpha() or c.isdigit() or c in (' ', '-', '_', ',')]).strip()
        if not safe_name:
            safe_name = "Search_Results"
            
        dest_folder = os.path.join(self.folder_path, safe_name)
        
        try:
            os.makedirs(dest_folder, exist_ok=True)
        except Exception as e:
            messagebox.showerror("오류", f"폴더 생성 실패: {e}")
            return
        
        count = 0
        for path in self.image_files[:]: 
            try:
                shutil.move(path, os.path.join(dest_folder, os.path.basename(path)))
                self.image_files.remove(path)
                self.db.delete_images([path])
                count += 1
            except Exception as e:
                logger.error(f"Move failed for {path}: {e}")
        
        messagebox.showinfo("이동 완료", f"{count}개의 파일을 '{safe_name}' 폴더로 이동했습니다.")
        self.current_index = 0
        self.load_current_image()
    def open_settings(self):
        from ui_view import SettingsWindow
        if self.settings_window is None or not self.settings_window.winfo_exists():
            self.settings_window = SettingsWindow(self.root, self)
        else:
            self.settings_window.lift()

    def copy_metadata(self):
        if not self.image_files: return
        path = self.image_files[self.current_index]
        meta = self.db.get_metadata(path)
        if meta and 'raw_parameters' in meta:
            self.root.clipboard_clear()
            self.root.clipboard_append(meta['raw_parameters'])
            self.ui.status_var.set("메타데이터 복사됨")
        else:
            self.ui.status_var.set("복사할 메타데이터 없음")

    def on_closing(self):
        self.loader.stop()
        self.db.close()
        
        if self.folder_path:
            APP_CONFIG["state"] = {
                "last_folder": self.folder_path,
                "current_index": self.current_index,
                "view_mode": self.view_mode,
                "is_batch_mode": self.is_batch_mode
            }
        save_config()
        self.root.destroy()
        
    def go_to_index(self, event=None):
        try:
            idx = int(self.ui.go_to_index_var.get())
            if 1 <= idx <= len(self.image_files):
                self.current_index = idx - 1
                self.load_current_image()
        except: pass
        
    def on_preview_click(self, index):
        self.current_index = index
        self.load_current_image()

    def on_batch_item_click(self, path):
        self.selected_batch_path = path
        
        # Update Metadata
        meta = self.db.get_metadata(path)
        self.ui.update_metadata(meta)
        
        # Update Highlight in Batch View
        self.ui.highlight_batch_item(path)
        
        # Update Status
        self.ui.status_var.set(f"배치 선택: {os.path.basename(path)}")

    def on_drop(self, event):
        path = event.data
        if path.startswith('{') and path.endswith('}'):
            path = path[1:-1]
        
        path = os.path.normpath(path)
        
        if os.path.isdir(path):
            self.change_folder(path)
        elif os.path.isfile(path):
            ext = os.path.splitext(path)[1].lower()
            
            valid_ext = False
            for supported in SUPPORTED_EXTENSIONS:
                if supported.replace('*', '').lower() == ext:
                    valid_ext = True
                    break
            
            if valid_ext:
                 folder = os.path.dirname(path)
                 # Check if we are already in this folder
                 if self.folder_path and os.path.normpath(self.folder_path) == folder:
                     try:
                         # Try to find exact match
                         index = self.image_files.index(path)
                         self.current_index = index
                         self.load_current_image()
                         self.refresh_previews()
                     except ValueError:
                         # File might be new or path mismatch, reload folder
                         self.change_folder(folder, target_image_path=path)
                 else:
                     self.change_folder(folder, target_image_path=path)
