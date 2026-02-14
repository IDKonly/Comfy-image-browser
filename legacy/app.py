import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
import os
import glob
from concurrent.futures import ThreadPoolExecutor
import multiprocessing
import shutil
import concurrent.futures
from PIL import Image
from customtkinter import CTkImage
import re
from tkinterdnd2 import TkinterDnD, DND_ALL

from config import (
    APP_CONFIG, save_config, logger, debug_decorator,
    SUPPORTED_EXTENSIONS, APP_VERSION, DEFAULT_SCALE_FACTOR,
    MIN_SCALE_FACTOR, MAX_SCALE_FACTOR, ROTATION_STEP, DEFAULT_CONFIG
)
from image_utils import LRUCache, load_image_with_cache, get_image_metadata, parse_detailed_metadata
from ui import SettingsWindow, get_widget_styles, create_menu, create_main_layout, create_status_bar, create_control_bar, create_search_bar

class ImageManagerApp(ctk.CTk, TkinterDnD.DnDWrapper):
    @debug_decorator
    def __init__(self):
        super().__init__()
        self.TkdndVersion = TkinterDnD._require(self)
        self.title(f"이미지 관리자 v{APP_VERSION}")
        self.minsize(800, 600)
        
        ctk.set_appearance_mode(APP_CONFIG.get("appearance_mode", "System"))
        self.geometry(f"{APP_CONFIG['window_size']['width']}x{APP_CONFIG['window_size']['height']}")

        self._setup_variables()
        self._setup_caches()
        self._setup_ui_components()
        self._bind_events()
        self._setup_drag_drop()
        self._start_auto_save()
        self.after(200, self._load_initial_state)

    def _setup_drag_drop(self):
        self.drop_target_register(DND_ALL)
        self.dnd_bind('<<Drop>>', self._handle_drop)

    def _handle_drop(self, event):
        path = event.data
        if path.startswith('{') and path.endswith('}'):
            path = path[1:-1]
        
        if os.path.isdir(path):
            self.change_folder(path)
        elif os.path.isfile(path):
            folder = os.path.dirname(path)
            filename = os.path.basename(path)
            
            if self.folder_path != folder:
                self.change_folder(folder)
                self.update_idletasks()

            try:
                if filename in [os.path.basename(f) for f in self.image_files]:
                    self.current_index = [os.path.basename(f) for f in self.image_files].index(filename)
                    self.display_image()
                else:
                    logger.warning(f"Dropped file {filename} is not a supported image type or not found in the current folder.")
            except ValueError:
                logger.error(f"Could not find dropped file {filename} in the list.")

    def _setup_variables(self):
        self.folder_path = None
        self.all_image_files = []
        self.image_files = []
        self.current_index = 0
        self.scale_factor = DEFAULT_SCALE_FACTOR
        self.rotation_angle = 0
        self.view_mode = "fit"
        self.executor = ThreadPoolExecutor(max_workers=multiprocessing.cpu_count())
        self.search_focused = False
        self.original_pil_image = None
        self.processed_pil_image = None
        self.display_photo_image = None
        self._resize_job_id = None
        self._layout_job_id = None
        self._scroll_job_id = None
        self.settings_window_instance = None
        self.restart_requested = False
        self.png_tag_index = {}

    def _setup_caches(self):
        self.image_cache = LRUCache(APP_CONFIG["max_image_cache_size"])
        self.preview_cache = LRUCache(APP_CONFIG["max_preview_cache_size"])
        self.png_tag_index = {}

    def _setup_ui_components(self):
        self.fonts = {
            "heading": ctk.CTkFont(family="Arial", size=14, weight="bold"),
            "normal": ctk.CTkFont(family="Arial", size=12),
            "small": ctk.CTkFont(family="Arial", size=10),
            "button": ctk.CTkFont(family="Arial", size=12),
            "label": ctk.CTkFont(family="Arial", size=12)
        }
        self.widget_styles = get_widget_styles(self.fonts)

        create_menu(self)
        create_main_layout(self)
        create_status_bar(self)
        create_search_bar(self)
        create_control_bar(self)

        # Define styles for the metadata textbox
        self.metadata_text.tag_config("header", foreground="#1A1A1A")
        self.metadata_text.tag_config("key", foreground="#007ACC")
        self.metadata_text.tag_config("value", foreground="#2D2D2D")
        self.metadata_text.tag_config("prompt", foreground="#107C10")
        self.metadata_text.tag_config("lora", foreground="#D83B01", underline=True)
        self.metadata_text.tag_config("error", foreground="#DC3545")

    def _bind_events(self):
        self.protocol("WM_DELETE_WINDOW", self._on_closing)
        self.bind("<Configure>", self._on_window_resize)
        self.image_label.bind("<Configure>", self._schedule_image_label_resize)
        self._apply_and_bind_shortcuts()

    @debug_decorator
    def _load_initial_state(self):
        state = APP_CONFIG.get("state", {})
        last_folder = state.get("last_folder")
        if last_folder and os.path.isdir(last_folder):
            self.current_index = state.get("current_index", 0)
            self.change_folder(last_folder)

    @debug_decorator
    def _save_current_state(self):
        if self.folder_path:
            APP_CONFIG["state"] = {
                "last_folder": self.folder_path,
                "current_index": self.current_index
            }
            save_config()

    def _start_auto_save(self):
        interval = APP_CONFIG.get("auto_save_interval", 0)
        if interval > 0:
            self.after(interval * 1000, self._auto_save_tick)

    def _auto_save_tick(self):
        self._save_current_state()
        self._start_auto_save()

    def _on_closing(self):
        self._save_current_state()
        self.executor.shutdown(wait=False)
        self.destroy()

    def _on_window_resize(self, event):
        if event.widget == self:
            APP_CONFIG["window_size"] = {"width": self.winfo_width(), "height": self.winfo_height()}
            if self._layout_job_id:
                self.after_cancel(self._layout_job_id)
            self._layout_job_id = self.after(150, self._update_control_bar_layout)

    def _update_control_bar_layout(self):
        """Rearranges control bar buttons based on window width."""
        threshold = 1100
        current_width = self.control_frame_container.winfo_width()

        # Define the order of widgets for consistent layout changes
        widget_keys = [
            "previous_image", "next_image", "delete_image", "move_to_keep",
            "rotate_left", "rotate_right", "zoom_in", "zoom_out",
            "toggle_view_mode", "refresh_list", "move_search_results",
            "go_to_index_entry", "go_to_index_button"
        ]

        widgets_to_rearrange = []
        for key in widget_keys:
            if key in self.action_buttons:
                widgets_to_rearrange.append(self.action_buttons[key])
            elif hasattr(self, key):
                widgets_to_rearrange.append(getattr(self, key))

        # Determine layout based on width
        if current_width < threshold:
            # Narrow layout: 3 columns
            for i, widget in enumerate(widgets_to_rearrange):
                widget.grid_configure(row=i // 3, column=i % 3, padx=2, pady=2)
        else:
            # Wide layout: single row
            for i, widget in enumerate(widgets_to_rearrange):
                widget.grid_configure(row=0, column=i, padx=2, pady=2)

    def _schedule_image_label_resize(self, event):
        if self._resize_job_id:
            self.after_cancel(self._resize_job_id)
        self._resize_job_id = self.after(250, self.display_image)

    def apply_new_config(self):
        self.image_cache.change_maxsize(APP_CONFIG["max_image_cache_size"])
        self.preview_cache.change_maxsize(APP_CONFIG["max_preview_cache_size"])
        self._apply_and_bind_shortcuts()
        self.update_app_theme(APP_CONFIG.get("appearance_mode"))

    def update_app_theme(self, theme_mode):
        ctk.set_appearance_mode(theme_mode)
        messagebox.showinfo("테마 변경", "테마는 프로그램을 다시 시작해야 완전히 적용됩니다.")

    def restart_app(self):
        self.restart_requested = True
        self._on_closing()

    def _apply_and_bind_shortcuts(self):
        for key in self.bind_all():
             if any(s in key for s in DEFAULT_CONFIG["shortcuts"].values()):
                  self.unbind_all(key)
        
        for action, key in APP_CONFIG["shortcuts"].items():
            self.bind(f"<{key}>".format(key=key), lambda e, a=action: self._handle_shortcut(a))

    def _handle_shortcut(self, action):
        if self.search_focused: return
        
        if hasattr(self, action):
            getattr(self, action)()
        elif action in self.action_buttons:
            self.action_buttons[action].invoke()

    def on_search_focus_in(self, event):
        self.search_focused = True

    def on_search_focus_out(self, event):
        self.search_focused = False

    @debug_decorator
    def change_folder(self, folder_path=None):
        if not folder_path:
            folder_path = filedialog.askdirectory()
        if folder_path:
            self.folder_path = folder_path
            self.refresh_image_list()

    @debug_decorator
    def refresh_image_list(self):
        if not self.folder_path: return
        self.all_image_files = []
        for ext in SUPPORTED_EXTENSIONS:
            self.all_image_files.extend(glob.glob(os.path.join(self.folder_path, ext)))
        self.image_files = sorted(self.all_image_files)
        if self.image_files:
            if self.current_index >= len(self.image_files) or self.current_index < 0:
                self.current_index = 0
            self.after(100, self.display_image)
            self._update_previews()
            self._index_images_in_parallel()
        else:
            self.image_label.configure(text="이 폴더에는 이미지가 없습니다.")

    @debug_decorator
    def display_image(self):
        if not self.image_files: return
        image_path = self.image_files[self.current_index]
        
        self.original_pil_image = load_image_with_cache(image_path, self.image_cache)
        
        if not self.original_pil_image:
            self.image_label.configure(text=f"Error loading image:\n{os.path.basename(image_path)}")
            return

        available_height = self.winfo_height() - self.status_bar_frame.winfo_height() - self.control_frame_container.winfo_height() - self.search_bar_frame.winfo_height() - 50
        if self.original_pil_image.height > available_height:
            ratio = available_height / self.original_pil_image.height
            new_width = int(self.original_pil_image.width * ratio)
            self.original_pil_image = self.original_pil_image.resize((new_width, available_height), Image.Resampling.LANCZOS)

        self.processed_pil_image = self.original_pil_image.copy()
        if self.rotation_angle != 0:
            self.processed_pil_image = self.processed_pil_image.rotate(self.rotation_angle, expand=True)

        label_w, label_h = self.image_label.winfo_width(), self.image_label.winfo_height()
        img_w, img_h = self.processed_pil_image.size
        
        if self.view_mode == "fit" and label_w > 1 and label_h > 1:
            ratio = min(label_w / img_w, label_h / img_h)
            new_w, new_h = int(img_w * ratio), int(img_h * ratio)
            resized_img = self.processed_pil_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
            self.display_photo_image = CTkImage(light_image=resized_img, dark_image=resized_img, size=(new_w, new_h))
        else:
            self.display_photo_image = CTkImage(light_image=self.processed_pil_image, dark_image=self.processed_pil_image, size=self.processed_pil_image.size)

        self.image_label.configure(image=self.display_photo_image, text="")
        self._display_metadata(image_path)
        self.update_status()
        self._update_previews()
        self.update_idletasks()

    def _display_metadata(self, image_path):
        metadata = get_image_metadata(image_path)
        self.current_metadata = metadata
        self.metadata_text.configure(state="normal")
        self.metadata_text.delete("1.0", ctk.END)

        if not metadata:
            self.metadata_text.insert(ctk.END, "No metadata found.")
            self.metadata_text.configure(state="disabled")
            return

        self._show_detailed_metadata(metadata)
        self.metadata_text.configure(state="disabled")

    def _show_detailed_metadata(self, metadata):
        # Use the improved parser
        parsed_data = parse_detailed_metadata(metadata)

        if not parsed_data:
            self.metadata_text.insert(ctk.END, "No detailed metadata found.\n", "error")
            if metadata:
                self.metadata_text.insert(ctk.END, "Full raw metadata can be copied using the 'Copy Metadata' button.")
            return

        # Insert Prompt
        if 'Prompt' in parsed_data:
            self.metadata_text.insert(ctk.END, "Prompt:\n", "header")
            prompt_text = parsed_data['Prompt']
            
            # Find and tag LoRAs within the prompt
            last_idx = 0
            for match in re.finditer(r'(<lora:[^>]+>)', prompt_text):
                start, end = match.span()
                # Insert text before LoRA
                self.metadata_text.insert(ctk.END, prompt_text[last_idx:start], "prompt")
                # Insert LoRA with specific tag
                self.metadata_text.insert(ctk.END, match.group(1), "lora")
                last_idx = end
            # Insert remaining prompt text
            self.metadata_text.insert(ctk.END, prompt_text[last_idx:] + "\n\n", "prompt")

        # Insert Negative Prompt
        if 'Negative prompt' in parsed_data:
            self.metadata_text.insert(ctk.END, "Negative Prompt:\n", "header")
            self.metadata_text.insert(ctk.END, parsed_data['Negative prompt'] + "\n\n", "prompt")

        # Insert other parameters
        self.metadata_text.insert(ctk.END, "Parameters:\n", "header")
        for key, value in parsed_data.items():
            if key not in ['Prompt', 'Negative prompt', 'LoRAs']:
                self.metadata_text.insert(ctk.END, f"{key}: ", "key")
                self.metadata_text.insert(ctk.END, f"{value}\n", "value")

        # Insert LoRAs list if available
        if 'LoRAs' in parsed_data and parsed_data['LoRAs']:
            self.metadata_text.insert(ctk.END, "\nLoRAs Found:\n", "header")
            for lora in parsed_data['LoRAs']:
                self.metadata_text.insert(ctk.END, f"- {lora}\n", "lora")

    

    def copy_full_metadata(self):
        if not self.current_metadata:
            self.status_var.set("복사할 메타데이터가 없습니다.")
            self.after(2000, self.update_status) # Revert status bar after 2s
            return

        try:
            metadata_string = "\n".join([f"{k}: {v}" for k, v in self.current_metadata.items()])
            self.clipboard_clear()
            self.clipboard_append(metadata_string)
            self.status_var.set("메타데이터가 클립보드에 복사되었습니다.")
        except Exception as e:
            logger.error(f"클립보드 복사 실패: {e}")
            self.status_var.set("클립보드 복사에 실패했습니다.")
        finally:
            self.after(2000, self.update_status) # Revert status bar after 2s

    

    def update_status(self):
        status = f"{self.current_index + 1} / {len(self.image_files)} | {os.path.basename(self.image_files[self.current_index])}"
        self.status_var.set(status)

    def show_next_image(self):
        if self.image_files:
            self.current_index = (self.current_index + 1) % len(self.image_files)
            self.display_image()

    def show_previous_image(self):
        if self.image_files:
            self.current_index = (self.current_index - 1 + len(self.image_files)) % len(self.image_files)
            self.display_image()

    def delete_current_image(self):
        if not self.image_files: return
        image_path = self.image_files[self.current_index]
        if APP_CONFIG["confirm_delete"] and not messagebox.askyesno("삭제", f"{os.path.basename(image_path)} 파일을 정말 삭제하시겠습니까?"):
            return
        try:
            if APP_CONFIG.get("delete_to_trash", True):
                trash_dir = os.path.join(self.folder_path, "_Trash")
                os.makedirs(trash_dir, exist_ok=True)
                shutil.move(image_path, os.path.join(trash_dir, os.path.basename(image_path)))
                logger.info(f"Moved {image_path} to _Trash folder")
            else:
                os.remove(image_path)
                logger.info(f"Deleted {image_path}")
            self.image_files.pop(self.current_index)
            if self.current_index >= len(self.image_files):
                self.current_index = 0
            if self.image_files:
                self.display_image()
            else:
                self.image_label.configure(text="남아있는 이미지가 없습니다.")
        except Exception as e:
            messagebox.showerror("오류", f"파일을 휴지통으로 이동하는데 실패했습니다: {e}")

    def move_to_keep_folder(self):
        if not self.image_files: return
        image_path = self.image_files[self.current_index]
        keep_dir = os.path.join(self.folder_path, "_Keep")
        os.makedirs(keep_dir, exist_ok=True)
        try:
            shutil.move(image_path, os.path.join(keep_dir, os.path.basename(image_path)))
            logger.info(f"Moved {image_path} to _Keep folder")
            self.image_files.pop(self.current_index)
            if self.current_index >= len(self.image_files):
                self.current_index = 0
            if self.image_files:
                self.display_image()
            else:
                self.image_label.configure(text="남아있는 이미지가 없습니다.")
        except Exception as e:
            messagebox.showerror("오류", f"파일을 이동하는데 실패했습니다: {e}")

    def rotate_left(self): self.rotate_image(-ROTATION_STEP)
    def rotate_right(self): self.rotate_image(ROTATION_STEP)
    def rotate_image(self, angle):
        self.rotation_angle = (self.rotation_angle + angle) % 360
        self.display_image()

    def zoom_in(self): self.zoom(1.1)
    def zoom_out(self): self.zoom(0.9)
    def zoom(self, factor):
        self.scale_factor *= factor
        self.scale_factor = max(MIN_SCALE_FACTOR, min(self.scale_factor, MAX_SCALE_FACTOR))
        self.view_mode = "original" # Zooming switches to original view
        self.display_image()

    def toggle_view_mode(self):
        self.view_mode = "original" if self.view_mode == "fit" else "fit"
        self.display_image()

    def go_to_index(self, event=None):
        if not self.image_files: return
        try:
            idx_str = self.go_to_index_var.get()
            if not idx_str:
                return
            
            idx = int(idx_str)
            if 1 <= idx <= len(self.image_files):
                self.current_index = idx - 1
                self.display_image()
            else:
                messagebox.showwarning("유효하지 않은 인덱스", f"1에서 {len(self.image_files)} 사이의 숫자를 입력해주세요.")
        except ValueError:
            messagebox.showerror("입력 오류", "숫자만 입력해주세요.")
        finally:
            self.go_to_index_var.set("")

    def _perform_search(self, event=None):
        search_terms = [term.strip() for term in self.search_entry_var.get().lower().split(',') if term.strip()]
        if not search_terms:
            self.image_files = sorted(self.all_image_files)
            if self.image_files: self.display_image()
            return

        self.image_files = [
            f for f in self.all_image_files
            if self._check_image_tags(f, search_terms)
        ]
        self.current_index = 0
        if self.image_files:
            self.display_image()
        else:
            self.image_label.configure(text="검색 결과가 없습니다.")

    def _check_image_tags(self, image_path, terms):
        if image_path not in self.png_tag_index:
            return False
        
        parsed_metadata = self.png_tag_index[image_path]
        if not parsed_metadata:
            return False

        # Combine only the relevant fields for searching
        prompt_text = parsed_metadata.get('Prompt', '').lower()
        neg_prompt_text = parsed_metadata.get('Negative prompt', '').lower()
        search_text = prompt_text + " " + neg_prompt_text

        return all(term in search_text for term in terms)

    def _clear_search(self, event=None):
        self.search_entry_var.set("")
        self.image_files = sorted(self.all_image_files)
        if self.image_files:
            self.current_index = 0
            self.display_image()

    def show_file_menu(self):
        self.file_menu.tk_popup(self.file_menu_button.winfo_rootx(), self.file_menu_button.winfo_rooty() + self.file_menu_button.winfo_height())

    def show_go_menu(self):
        self.go_menu.tk_popup(self.go_menu_button.winfo_rootx(), self.go_menu_button.winfo_rooty() + self.go_menu_button.winfo_height())

    def show_settings_window(self):
        logger.info("--- Settings window is being opened ---")
        if self.settings_window_instance is None or not self.settings_window_instance.winfo_exists():
            self.settings_window_instance = SettingsWindow(self, self)
            self.settings_window_instance.grab_set()
        else:
            self.settings_window_instance.lift()

    def _index_images_in_parallel(self):
        if not self.image_files:
            return
        with ThreadPoolExecutor(max_workers=multiprocessing.cpu_count()) as executor:
            future_to_path = {executor.submit(get_image_metadata, path): path for path in self.image_files}
            for future in concurrent.futures.as_completed(future_to_path):
                path = future_to_path[future]
                try:
                    raw_metadata = future.result()
                    if raw_metadata:
                        parsed_metadata = parse_detailed_metadata(raw_metadata)
                        if parsed_metadata:
                            self.png_tag_index[path] = parsed_metadata
                except Exception as exc:
                    logger.error(f'{path} generated an exception: {exc}')

    def move_search_results(self):
        if not self.image_files or self.image_files == self.all_image_files:
            messagebox.showinfo("정보", "검색 결과가 없거나 모든 파일이 선택되어 있어 이동할 수 없습니다.")
            return

        destination_folder = filedialog.askdirectory(title="검색 결과를 이동할 폴더를 선택하세요")
        if not destination_folder:
            return

        moved_count = 0
        for image_path in self.image_files:
            try:
                shutil.move(image_path, os.path.join(destination_folder, os.path.basename(image_path)))
                moved_count += 1
            except Exception as e:
                logger.error(f"Failed to move {image_path}: {e}")
        
        messagebox.showinfo("이동 완료", f"{moved_count}개의 파일을 {destination_folder}로 이동했습니다.")
        self.refresh_image_list()

    def _update_previews(self):
        for widget in self.preview_frame.winfo_children():
            widget.destroy()

        if not self.image_files:
            return

        max_previews = APP_CONFIG.get("max_preview_images", 10)
        start_index = max(0, self.current_index - max_previews // 2)
        end_index = min(len(self.image_files), start_index + max_previews)
        
        if end_index - start_index < max_previews:
            start_index = max(0, end_index - max_previews)

        current_preview_widget = None

        for i in range(start_index, end_index):
            image_path = self.image_files[i]
            
            preview_image = load_image_with_cache(image_path, self.preview_cache, is_preview=True, target_size=(APP_CONFIG.get("preview_thumbnail_width", 100), APP_CONFIG.get("preview_thumbnail_width", 100)))
            if preview_image:
                img_w, img_h = preview_image.size
                ratio = min(APP_CONFIG.get("preview_thumbnail_width", 100) / img_w, APP_CONFIG.get("preview_thumbnail_width", 100) / img_h)
                new_w, new_h = int(img_w * ratio), int(img_h * ratio)
                resized_img = preview_image.resize((new_w, new_h), Image.Resampling.LANCZOS)
                ctk_image = CTkImage(light_image=resized_img, dark_image=resized_img, size=(new_w, new_h))
                
                border_color = "#0078D4" if i == self.current_index else self.preview_frame.cget("fg_color")
                preview_label_frame = ctk.CTkFrame(self.preview_frame, border_width=2, border_color=border_color)
                preview_label_frame.pack(pady=5, padx=5)

                preview_label = ctk.CTkLabel(preview_label_frame, image=ctk_image, text="")
                preview_label.pack()
                preview_label.bind("<Button-1>", lambda e, index=i: self._on_preview_click(index))
                
                if i == self.current_index:
                    current_preview_widget = preview_label_frame

        if current_preview_widget:
            if self._scroll_job_id:
                self.after_cancel(self._scroll_job_id)
            self._scroll_job_id = self.after(100, lambda w=current_preview_widget: self._scroll_to_widget(w))

    def _scroll_to_widget(self, widget):
        if not widget.winfo_exists():
            return
        
        self.update_idletasks() # Ensure widget geometry is updated
        
        canvas = self.preview_frame._parent_canvas
        # Calculate the position of the widget relative to the canvas's top
        widget_y = widget.winfo_y()
        
        # Get the scrollable region's height
        scroll_region_str = canvas.cget("scrollregion")
        if not scroll_region_str:
            return
            
        try:
            scroll_region = [float(x) for x in scroll_region_str.split()]
            total_height = scroll_region[3]
            if total_height == 0:
                return
            
            # Calculate the fraction to move the scrollbar
            scroll_fraction = widget_y / total_height
            
            # Center the widget if possible
            visible_height = canvas.winfo_height()
            centered_y = widget_y - (visible_height / 2) + (widget.winfo_height() / 2)
            scroll_fraction = max(0, min(1, centered_y / total_height))

            canvas.yview_moveto(scroll_fraction)
        except (ValueError, IndexError):
            # Fallback in case scrollregion is not as expected
            pass

    def _on_preview_click(self, index):
        self.current_index = index
        self.display_image()
