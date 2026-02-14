import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox
from PIL import Image
from customtkinter import CTkImage
import re
import os

from config import COLORS, logger

class UIManager:
    def __init__(self, controller, root, callbacks):
        self.controller = controller
        self.app = root
        self.callbacks = callbacks 
        self.styles = self._get_widget_styles()
        self.sidebar_widgets = {} # Map path -> widget in sidebar
        self.main_grid_widgets = {} # Map path -> widget in main batch grid
        
        self._setup_ui()

    def _setup_fonts(self):
        return {
            "heading": ctk.CTkFont(family="Arial", size=14, weight="bold"),
            "normal": ctk.CTkFont(family="Arial", size=12),
            "small": ctk.CTkFont(family="Arial", size=10),
            "button": ctk.CTkFont(family="Arial", size=12),
            "label": ctk.CTkFont(family="Arial", size=12)
        }

    def _get_widget_styles(self):
        current_mode = ctk.get_appearance_mode()
        is_dark = current_mode == "Dark"
        bg_color = COLORS["background"]["dark_ui"] if is_dark else COLORS["background"]["light"]
        entry_bg_color = "#363636" if is_dark else "white"
        text_color = COLORS["text"]["light_ui"] if is_dark else COLORS["text"]["primary"]
        secondary_text_color = COLORS["text"]["light_ui"] if is_dark else COLORS["text"]["secondary"]
        border_color = COLORS["border_dark"] if is_dark else COLORS["border"]

        return {
            "frame": {
                "corner_radius": 8,
                "border_width": 1,
                "border_color": border_color,
                "fg_color": bg_color
            },
            "button": {
                "corner_radius": 6,
                "border_width": 0,
                "height": 32,
                "font": self._setup_fonts()["button"],
                "text_color": text_color
            },
            "radio_button": {
                "font": self._setup_fonts()["button"],
                "text_color": text_color
            },
            "entry": {
                "corner_radius": 6,
                "border_width": 1,
                "border_color": border_color,
                "fg_color": entry_bg_color,
                "text_color": text_color,
                "font": self._setup_fonts()["normal"]
            },
            "label": {
                "text_color": text_color,
                "font": self._setup_fonts()["label"]
            },
            "secondary_label": {
                 "text_color": secondary_text_color,
                 "font": self._setup_fonts()["small"]
            },
            "text": {
                "corner_radius": 6,
                "border_width": 1,
                "border_color": border_color,
                "fg_color": "white",
                "text_color": COLORS["text"]["primary"],
                "font": ctk.CTkFont(family="Arial", size=12),
                "wrap": "word"
            }
        }

    def _setup_ui(self):
        self._create_menu()
        self._create_main_layout()
        self._create_status_bar()
        self._create_search_bar()
        self._create_control_bar()
        self._configure_metadata_tags()

    def _create_menu(self):
        menubar_frame = ctk.CTkFrame(self.app, **self.styles["frame"])
        menubar_frame.pack(side=ctk.TOP, fill=ctk.X)
        self.file_menu_button = ctk.CTkButton(menubar_frame, text="파일", command=self.show_file_menu)
        self.file_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)
        self.file_menu = tk.Menu(self.app, tearoff=0)
        self.file_menu.add_command(label="폴더 열기", command=self.callbacks['open_folder'])
        self.file_menu.add_command(label="새로고침", command=self.callbacks['refresh'])
        self.file_menu.add_separator()
        self.file_menu.add_command(label="종료", command=self.callbacks['on_closing'])
        self.go_menu_button = ctk.CTkButton(menubar_frame, text="이동", command=self.show_go_menu)
        self.go_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)
        self.go_menu = tk.Menu(self.app, tearoff=0)
        self.settings_menu_button = ctk.CTkButton(menubar_frame, text="설정", command=self.callbacks['open_settings'])
        self.settings_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)

    def show_file_menu(self):
        self.file_menu.tk_popup(self.file_menu_button.winfo_rootx(), self.file_menu_button.winfo_rooty() + self.file_menu_button.winfo_height())

    def show_go_menu(self):
        self.go_menu.tk_popup(self.go_menu_button.winfo_rootx(), self.go_menu_button.winfo_rooty() + self.go_menu_button.winfo_height())

    def _create_main_layout(self):
        main_frame = ctk.CTkFrame(self.app, fg_color="transparent")
        main_frame.pack(expand=True, fill=ctk.BOTH, padx=5, pady=5)
        self.preview_frame = ctk.CTkScrollableFrame(main_frame, width=200, **self.styles["frame"])
        self.preview_frame.pack(side=ctk.LEFT, fill=ctk.Y, padx=(0, 5))
        separator = ctk.CTkFrame(main_frame, width=2, fg_color=("gray75", "gray25"))
        separator.pack(side=ctk.LEFT, fill=ctk.Y)
        image_container = ctk.CTkFrame(main_frame, fg_color="transparent")
        image_container.pack(side=ctk.LEFT, expand=True, fill=ctk.BOTH)
        self.image_display_frame = ctk.CTkFrame(image_container, **self.styles["frame"])
        self.image_display_frame.pack(expand=True, fill=ctk.BOTH)
        self.image_label = ctk.CTkLabel(self.image_display_frame, text="폴더를 열어 이미지를 확인하세요.", **self.styles["label"])
        self.image_label.pack(expand=True, fill=ctk.BOTH)
        self.metadata_frame = ctk.CTkFrame(main_frame, **self.styles["frame"])
        self.metadata_frame.pack(side=ctk.RIGHT, fill=ctk.Y, padx=(5, 0))
        self.metadata_frame.configure(width=300)
        self.metadata_frame.pack_propagate(False)
        metadata_header_frame = ctk.CTkFrame(self.metadata_frame, fg_color="transparent")
        metadata_header_frame.pack(fill=ctk.X, pady=5, padx=5)
        metadata_label = ctk.CTkLabel(metadata_header_frame, text="메타데이터", **self.styles["label"])
        metadata_label.pack(side=ctk.LEFT, expand=True, fill=ctk.X)
        self.copy_metadata_button = ctk.CTkButton(metadata_header_frame, text="메타데이터 복사", command=self.callbacks['copy_metadata'], **self.styles["button"])
        self.copy_metadata_button.pack(side=ctk.RIGHT)
        self.metadata_text = ctk.CTkTextbox(self.metadata_frame, state="disabled", **self.styles["text"])
        self.metadata_text.pack(expand=True, fill=ctk.BOTH, padx=5, pady=(0, 5))

    def _create_status_bar(self):
        self.status_bar_frame = ctk.CTkFrame(self.app, **self.styles["frame"])
        self.status_bar_frame.pack(side=ctk.BOTTOM, fill=ctk.X)
        self.status_var = ctk.StringVar(value="준비")
        self.status_bar_label = ctk.CTkLabel(self.status_bar_frame, textvariable=self.status_var, **self.styles["secondary_label"])
        self.status_bar_label.pack(side=ctk.LEFT, padx=10, pady=2)

    def _create_search_bar(self):
        self.search_bar_frame = ctk.CTkFrame(self.app, **self.styles["frame"])
        self.search_bar_frame.pack(side=ctk.BOTTOM, fill=ctk.X, pady=(0, 5), padx=5)
        search_label = ctk.CTkLabel(self.search_bar_frame, text="PNG 태그 검색:", **self.styles["label"])
        search_label.pack(side=ctk.LEFT, padx=(10, 5))
        self.search_entry_var = ctk.StringVar()
        self.search_entry = ctk.CTkEntry(self.search_bar_frame, textvariable=self.search_entry_var, **self.styles["entry"])
        self.search_entry.pack(side=ctk.LEFT, expand=True, fill=ctk.X, padx=5)
        self.search_entry.bind("<Return>", self.callbacks['perform_search'])
        self.search_entry.bind("<Escape>", self.callbacks['clear_search'])
        self.search_entry.bind("<FocusIn>", self.callbacks['on_search_focus_in'])
        self.search_entry.bind("<FocusOut>", self.callbacks['on_search_focus_out'])
        search_button = ctk.CTkButton(self.search_bar_frame, text="검색", command=self.callbacks['perform_search'], **self.styles["button"])
        search_button.pack(side=ctk.LEFT, padx=5)
        clear_button = ctk.CTkButton(self.search_bar_frame, text="지우기", command=self.callbacks['clear_search'], **self.styles["button"])
        clear_button.pack(side=ctk.LEFT, padx=(0, 5))

    def _create_control_bar(self):
        self.control_frame_container = ctk.CTkFrame(self.app, **self.styles["frame"])
        self.control_frame_container.pack(side=ctk.BOTTOM, fill=ctk.X, pady=5, padx=5)
        self.control_frame_container.grid_columnconfigure(list(range(14)), weight=1) # Increased columns
        
        buttons = [
            ("previous_image", "이전"), 
            ("next_image", "다음"), 
            ("delete_image", "삭제"), 
            ("move_to_keep", "보관"), 
            ("rotate_left", "왼쪽 회전"), 
            ("rotate_right", "오른쪽 회전"), 
            ("zoom_in", "확대"), 
            ("zoom_out", "축소"), 
            ("toggle_view_mode", "보기 전환"),
            ("toggle_batch_mode", "배치 모드"), # New Button
            ("refresh", "새로고침"), 
            ("move_search_results", "검색 결과 이동")
        ]
        
        self.action_buttons = {}
        for col, (action, text) in enumerate(buttons):
            width = 120 if action == "move_search_results" else 80
            btn = ctk.CTkButton(self.control_frame_container, text=text, command=self.callbacks.get(action, lambda: None), width=width, **self.styles["button"])
            btn.grid(row=0, column=col, padx=2, pady=5)
            self.action_buttons[action] = btn
            
            # Highlight batch mode button if active
            if action == "toggle_batch_mode":
                self.batch_mode_btn = btn

        self.go_to_index_var = tk.StringVar()
        self.go_to_index_entry = ctk.CTkEntry(self.control_frame_container, textvariable=self.go_to_index_var, width=60, **self.styles["entry"])
        self.go_to_index_entry.grid(row=0, column=len(buttons), padx=(10, 2), pady=5)
        self.go_to_index_entry.bind("<Return>", self.callbacks['go_to_index'])
        self.go_to_index_button = ctk.CTkButton(self.control_frame_container, text="이동", command=self.callbacks['go_to_index'], width=40, **self.styles["button"])
        self.go_to_index_button.grid(row=0, column=len(buttons)+1, padx=2, pady=5)

    def _configure_metadata_tags(self):
        self.metadata_text.tag_config("header", foreground="#1A1A1A")
        self.metadata_text.tag_config("key", foreground="#007ACC")
        self.metadata_text.tag_config("value", foreground="#2D2D2D")
        self.metadata_text.tag_config("prompt", foreground="#107C10")
        self.metadata_text.tag_config("lora", foreground="#D83B01", underline=True)
        self.metadata_text.tag_config("error", foreground="#DC3545")

    def update_batch_view(self, file_paths, image_loader, selected_path=None):
        """Displays a grid of thumbnails for the batch mode."""
        
        # 1. Clear main image area content
        for widget in self.image_display_frame.winfo_children():
            widget.destroy()
        
        self.main_grid_widgets = {}
            
        # 2. Create Scrollable Frame for Grid
        grid_frame = ctk.CTkScrollableFrame(self.image_display_frame, fg_color="transparent")
        grid_frame.pack(expand=True, fill="both", padx=5, pady=5)
        
        # 3. Grid Layout Logic (Best Fit)
        width = self.image_display_frame.winfo_width()
        height = self.image_display_frame.winfo_height()
        
        if width < 100: width = 800
        if height < 100: height = 600
        
        num_items = len(file_paths)
        if num_items == 0: return

        best_cols = 1
        best_size = 0
        
        # Try all possible column counts to maximize item size
        for c in range(1, num_items + 1):
            r = (num_items + c - 1) // c # ceil division
            
            # Available space per item (approx, subtracting padding)
            item_w = (width - 40 - (c * 10)) / c
            item_h = (height - 20 - (r * 10)) / r
            
            # Size is constrained by the smaller dimension (square thumbnails usually)
            size = min(item_w, item_h)
            
            if size > best_size:
                best_size = size
                best_cols = c
                best_dims = (item_w, item_h)
            elif abs(size - best_size) < 1.0: # Float comparison tolerance
                # Tie-breaker: Prefer square grid (cols ~ rows)
                current_r = (num_items + best_cols - 1) // best_cols
                current_diff = abs(best_cols - current_r)
                new_diff = abs(c - r)
                if new_diff < current_diff:
                    best_cols = c
                    best_dims = (item_w, item_h)

        cols = best_cols
        # Use rectangular dimensions for thumb_size limit
        max_w = min(int(best_dims[0]), 800)
        max_h = min(int(best_dims[1]), 800)
        thumb_size = (max_w, max_h)
        
        # Configure Grid Columns
        for i in range(cols):
            grid_frame.grid_columnconfigure(i, weight=1)
        # Configure Grid Rows
        rows = (num_items + cols - 1) // cols
        for i in range(rows):
            grid_frame.grid_rowconfigure(i, weight=1)

        # CANCEL previous lazy load if exists
        if hasattr(self, '_batch_load_job') and self._batch_load_job:
            self.image_display_frame.after_cancel(self._batch_load_job)
            
        self._lazy_load_batch_items(file_paths, image_loader, grid_frame, cols, thumb_size, 0, selected_path)

    def _lazy_load_batch_items(self, file_paths, image_loader, grid_frame, cols, thumb_size, current_idx, selected_path=None):
        if not grid_frame.winfo_exists(): return
        
        BATCH_SIZE = 20
        end_idx = min(current_idx + BATCH_SIZE, len(file_paths))
        thumb_size_px = thumb_size[0]
        
        # Request higher resolution for sharpness (HiDPI)
        load_size = (thumb_size[0] * 2, thumb_size[1] * 2)
        
        for idx in range(current_idx, end_idx):
            path = file_paths[idx]
            row = idx // cols
            col = idx % cols
            
            # Container for image + label
            item_frame = ctk.CTkFrame(grid_frame, fg_color="transparent")
            item_frame.grid(row=row, column=col, padx=2, pady=2, sticky="nsew")
            
            # Initial Highlight
            if selected_path and path == selected_path:
                item_frame.configure(border_width=3, border_color="#0078D4")
            
            # Load Thumbnail
            # 1. Try to get Full Image first (Priority 0 loaded previously)
            cached_img = image_loader.cache.get((path, False))
            
            # 2. If not, try to get Thumbnail
            if not cached_img:
                temp_thumb = image_loader.cache.get((path, True))
                # CRITICAL: Only use cached thumbnail if it's large enough for the grid!
                # If cached thumb is 100px (sidebar) but we need 400px (grid), ignore it.
                if temp_thumb and temp_thumb.width >= thumb_size[0] * 0.8:
                    cached_img = temp_thumb
            
            display_img = None
            if cached_img:
                # Calculate scale to fit within thumb_size (box) while maintaining aspect ratio
                # thumb_size is now (max_w, max_h) of the cell
                w_ratio = thumb_size[0] / cached_img.width
                h_ratio = thumb_size[1] / cached_img.height
                scale = min(w_ratio, h_ratio)
                new_w = int(cached_img.width * scale)
                new_h = int(cached_img.height * scale)
                final_size = (new_w, new_h)
                
                display_img = CTkImage(light_image=cached_img, dark_image=cached_img, size=final_size)
            else:
                # Request larger image for better quality
                image_loader.request_image(path, priority=0, target_size=load_size, is_thumbnail=True)
                display_img = None 
            
            lbl_img = ctk.CTkLabel(item_frame, image=display_img, text="Loading..." if not display_img else "")
            lbl_img.pack(expand=True, fill="both")
            
            # Bind Click Event (using 'on_batch_click' callback)
            # Use default arg p=path to capture closure
            lbl_img.bind("<Button-1>", lambda e, p=path: self.callbacks.get('on_batch_click', lambda x: None)(p))
            
            # Store reference
            self.main_grid_widgets[path] = lbl_img
             
        if end_idx < len(file_paths):
            self._batch_load_job = self.image_display_frame.after(10, lambda: self._lazy_load_batch_items(file_paths, image_loader, grid_frame, cols, thumb_size, end_idx, selected_path))
        else:
            self._batch_load_job = None

    def highlight_batch_item(self, target_path):
        """Highlights the selected item in batch view and removes highlight from others."""
        for path, lbl in self.main_grid_widgets.items():
            try:
                frame = lbl.master
                if path == target_path:
                    frame.configure(border_width=3, border_color="#0078D4")
                else:
                    frame.configure(border_width=0, border_color="transparent")
            except Exception as e:
                logger.debug(f"Failed to update highlight for {path}: {e}")

    def update_image(self, ctk_image):
        # Restore Single Image View if needed (clearing batch grid)
        is_batch_view = False
        for child in self.image_display_frame.winfo_children():
             if isinstance(child, ctk.CTkScrollableFrame):
                 is_batch_view = True
                 break
        
        if is_batch_view:
             for widget in self.image_display_frame.winfo_children():
                widget.destroy()
             self.main_grid_widgets = {}
             self.image_label = ctk.CTkLabel(self.image_display_frame, text="", **self.styles["label"])
             self.image_label.pack(expand=True, fill=ctk.BOTH)

        try:
            if ctk_image:
                self.image_label.configure(image=ctk_image, text="")
            else:
                self.image_label.configure(image=None, text="이미지를 불러올 수 없습니다.")
        except tk.TclError:
             logger.debug("TclError updating main image. Recreating label.")
             for widget in self.image_display_frame.winfo_children():
                widget.destroy()
             self.image_label = ctk.CTkLabel(self.image_display_frame, text="", **self.styles["label"])
             self.image_label.pack(expand=True, fill=ctk.BOTH)
             if ctk_image:
                self.image_label.configure(image=ctk_image, text="")
             else:
                self.image_label.configure(image=None, text="이미지를 불러올 수 없습니다.")

    def update_metadata(self, metadata):
        self.metadata_text.configure(state="normal")
        self.metadata_text.delete("1.0", ctk.END)
        if not metadata:
             self.metadata_text.insert(ctk.END, "메타데이터가 없습니다.")
             self.metadata_text.configure(state="disabled")
             return
        if 'Prompt' in metadata:
            self.metadata_text.insert(ctk.END, "Prompt:\n", "header")
            self._insert_prompt_with_tags(metadata['Prompt'])
        if 'Negative prompt' in metadata:
            self.metadata_text.insert(ctk.END, "Negative Prompt:\n", "header")
            self.metadata_text.insert(ctk.END, metadata['Negative prompt'] + "\n\n", "prompt")
        if 'LoRAs' in metadata and metadata['LoRAs']:
             self.metadata_text.insert(ctk.END, "LoRAs:\n", "header")
             self.metadata_text.insert(ctk.END, metadata['LoRAs'] + "\n\n", "lora")
        self.metadata_text.insert(ctk.END, "Parameters:\n", "header")
        for k, v in metadata.items():
            if k not in ['Prompt', 'Negative prompt', 'LoRAs', 'raw_parameters']:
                 self.metadata_text.insert(ctk.END, f"{k}: ", "key")
                 self.metadata_text.insert(ctk.END, f"{v}\n", "value")
        self.metadata_text.configure(state="disabled")

    def _insert_prompt_with_tags(self, text):
        last_idx = 0
        for match in re.finditer(r'(<lora:[^>]+>)', text):
            start, end = match.span()
            self.metadata_text.insert(ctk.END, text[last_idx:start], "prompt")
            self.metadata_text.insert(ctk.END, match.group(1), "lora")
            last_idx = end
        self.metadata_text.insert(ctk.END, text[last_idx:] + "\n\n", "prompt")

    def update_previews(self, image_files, current_index, loader, start_idx, end_idx):
        # Optimized: Reuse widgets instead of destroy/create
        existing_widgets = self.preview_frame.winfo_children()
        required_count = end_idx - start_idx
        
        self.sidebar_widgets = {}

        for i in range(required_count):
            abs_index = start_idx + i
            if abs_index >= len(image_files): break
            
            path = image_files[abs_index]
            
            # Get or create widget container (Frame)
            if i < len(existing_widgets):
                frame = existing_widgets[i]
                # Find the label inside the frame (assuming it's the only/first child)
                # If structure changed, might need to be more robust, but current structure is Frame -> Label
                children = frame.winfo_children()
                if children and isinstance(children[0], ctk.CTkLabel):
                    lbl = children[0]
                else:
                    # Fallback reconstruction if structure is weird (shouldn't happen)
                    for child in frame.winfo_children(): child.destroy()
                    lbl = ctk.CTkLabel(frame, text="")
                    lbl.pack()
            else:
                frame = ctk.CTkFrame(self.preview_frame)
                frame.pack(pady=5, padx=5)
                lbl = ctk.CTkLabel(frame, text="")
                lbl.pack()
            
            # Update Style (Border)
            is_selected = (abs_index == current_index)
            border_width = 2 if is_selected else 0
            border_color = "#0078D4" if is_selected else "transparent" # Use transparent instead of None to avoid error
            
            try:
                frame.configure(border_width=border_width, border_color=border_color)
            except:
                 pass # potential tk error if color invalid
            
            # Update Content (Image)
            cached_img = loader.cache.get((path, True)) 
            display_img = None
            if cached_img:
                display_img = CTkImage(light_image=cached_img, dark_image=cached_img, size=cached_img.size)
            else:
                loader.request_image(path, priority=2, target_size=(100, 100), is_thumbnail=True)
                display_img = None 

            if display_img:
                try:
                    lbl.configure(image=display_img, text="")
                except tk.TclError:
                    logger.debug(f"TclError in update_previews for {path}. Recreating label.")
                    for child in frame.winfo_children(): child.destroy()
                    lbl = ctk.CTkLabel(frame, text="")
                    lbl.pack()
                    lbl.configure(image=display_img, text="")
            else:
                try:
                    lbl.configure(image=None, text="Loading...")
                except tk.TclError:
                    logger.debug(f"TclError in update_previews (loading) for {path}. Recreating label.")
                    for child in frame.winfo_children(): child.destroy()
                    lbl = ctk.CTkLabel(frame, text="")
                    lbl.pack()
                    lbl.configure(image=None, text="Loading...")
                
            # Re-bind click event with correct index
            # Important: Use default arg `idx=abs_index` to capture current value
            lbl.bind("<Button-1>", lambda e, idx=abs_index: self.callbacks['on_preview_click'](idx))
            
            self.sidebar_widgets[path] = lbl

        # Remove excess widgets
        for i in range(required_count, len(existing_widgets)):
            existing_widgets[i].destroy()

    def update_single_thumbnail(self, path, ctk_image):
        # Update sidebar
        if path in self.sidebar_widgets:
            lbl = self.sidebar_widgets[path]
            try:
                if ctk_image:
                    lbl.configure(image=ctk_image, text="")
                else:
                    lbl.configure(text="Error")
            except Exception as e:
                logger.debug(f"Error updating sidebar thumbnail for {os.path.basename(path)}: {e}. Recreating.")
                try:
                    frame = lbl.master
                    for child in frame.winfo_children(): child.destroy()
                    lbl = ctk.CTkLabel(frame, text="")
                    lbl.pack()
                    if ctk_image:
                        lbl.configure(image=ctk_image, text="")
                    else:
                        lbl.configure(text="Error")
                    
                    # Restore binding
                    try:
                        if path in self.controller.image_files:
                            idx = self.controller.image_files.index(path)
                            lbl.bind("<Button-1>", lambda e, idx=idx: self.callbacks['on_preview_click'](idx))
                    except Exception as bind_err:
                        logger.error(f"Failed to rebind click for {path}: {bind_err}")
                        
                    self.sidebar_widgets[path] = lbl
                except Exception as recreate_err:
                    logger.error(f"Failed to recreate sidebar label for {path}: {recreate_err}")
        
        # Update main grid (batch mode)
        if path in self.main_grid_widgets:
            lbl = self.main_grid_widgets[path]
            try:
                if ctk_image:
                    lbl.configure(image=ctk_image, text="")
                else:
                    lbl.configure(text="Error")
            except Exception as e:
                logger.debug(f"Error updating grid thumbnail for {os.path.basename(path)}: {e}. Recreating.")
                try:
                    item_frame = lbl.master
                    for child in item_frame.winfo_children(): child.destroy()
                    
                    new_lbl = ctk.CTkLabel(item_frame, image=ctk_image if ctk_image else None, text="" if ctk_image else "Error")
                    new_lbl.pack(expand=True, fill="both")
                    
                    self.main_grid_widgets[path] = new_lbl
                except Exception as recreate_err:
                     logger.error(f"Failed to recreate grid label for {path}: {recreate_err}")

class SettingsWindow(ctk.CTkToplevel):
    def __init__(self, master, app_controller):
        super().__init__(master)
        self.title("설정")
        self.app_controller = app_controller 
        self.geometry("600x700")
        self.grab_set()
        
        self.styles = app_controller.ui.styles 

        self.configure(fg_color=self.styles["frame"]['fg_color'])
        self.tabview = ctk.CTkTabview(self, **self.styles['frame'])
        self.tabview.pack(expand=True, fill="both", padx=10, pady=10)
        self.preview_cache_tab = self.tabview.add("미리보기/캐시")
        self.shortcuts_tab = self.tabview.add("단축키")
        self.theme_tab = self.tabview.add("테마")
        self.delete_tab = self.tabview.add("삭제")
        self._create_preview_cache_settings(self.preview_cache_tab)
        self._create_shortcut_settings(self.shortcuts_tab)
        self._create_theme_settings(self.theme_tab)
        self._create_delete_settings(self.delete_tab)
        self._create_buttons()
        self.load_settings_to_ui()

    def _create_preview_cache_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)
        ctk.CTkLabel(settings_frame, text="미리보기 및 캐시 설정", **self.styles["label"]).pack(pady=(15, 20))
        self.preview_count_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="최대 미리보기 이미지 수:", **self.styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.preview_count_var, **self.styles["entry"]).pack()
        self.image_cache_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="메인 이미지 캐시 크기:", **self.styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.image_cache_var, **self.styles["entry"]).pack()

    def _create_shortcut_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)
        self.shortcut_vars = {}
        ctk.CTkLabel(settings_frame, text="단축키 설정은 config.json을 직접 수정하세요.", **self.styles["label"]).pack(pady=20)

    def _create_theme_settings(self, tab):
        from config import APP_CONFIG
        settings_frame = ctk.CTkFrame(tab, **self.styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)
        self.theme_var = tk.StringVar(value=APP_CONFIG.get("appearance_mode", "System"))
        themes = ["Light", "Dark", "System"]
        for theme in themes:
            ctk.CTkRadioButton(settings_frame, text=theme, variable=self.theme_var, value=theme, **self.styles["radio_button"]).pack(anchor="w")

    def _create_delete_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)
        self.delete_to_trash_var = tk.BooleanVar()
        ctk.CTkCheckBox(settings_frame, text="삭제 시 휴지통으로 이동", variable=self.delete_to_trash_var, **self.styles["button"])
        self.delete_to_trash_var.pack()

    def _create_buttons(self):
        button_frame = ctk.CTkFrame(self, fg_color="transparent")
        button_frame.pack(fill=ctk.X, padx=10, pady=10)
        self.save_button = ctk.CTkButton(button_frame, text="저장", command=self.save_settings, **self.styles["button"])
        self.save_button.pack(side=ctk.RIGHT, padx=5)

    def save_settings(self):
        from config import APP_CONFIG, save_config
        try:
            APP_CONFIG["max_preview_images"] = self.preview_count_var.get()
            APP_CONFIG["max_image_cache_size"] = self.image_cache_var.get()
            APP_CONFIG["delete_to_trash"] = self.delete_to_trash_var.get()
            APP_CONFIG["appearance_mode"] = self.theme_var.get()
            save_config()
            ctk.set_appearance_mode(APP_CONFIG["appearance_mode"])
            self.destroy()
        except Exception as e:
            messagebox.showerror("오류", f"설정 저장 실패: {e}")

    def load_settings_to_ui(self):
        from config import APP_CONFIG
        self.preview_count_var.set(APP_CONFIG.get("max_preview_images", 10))
        self.image_cache_var.set(APP_CONFIG.get("max_image_cache_size", 10))
        self.delete_to_trash_var.set(APP_CONFIG.get("delete_to_trash", True))
