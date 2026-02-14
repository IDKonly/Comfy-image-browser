import customtkinter as ctk
from tkinterdnd2 import TkinterDnD, DND_ALL
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

from config import (
    APP_CONFIG, save_config, logger, debug_decorator,
    SUPPORTED_EXTENSIONS, APP_VERSION, DEFAULT_SCALE_FACTOR,
    MIN_SCALE_FACTOR, MAX_SCALE_FACTOR, ROTATION_STEP, DEFAULT_CONFIG
)
from image_utils import LRUCache, load_image_with_cache, get_image_metadata, parse_detailed_metadata
from ui import SettingsWindow, get_widget_styles, create_menu, create_main_layout, create_status_bar, create_control_bar, create_search_bar

class App(ctk.CTk, TkinterDnD.DnDWrapper):
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
        #self._bind_events()
        #self._setup_drag_drop()
        #self._start_auto_save()
        #self.after(200, self._load_initial_state)

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
        self.label = ctk.CTkLabel(self, text="Drop a file here")
        self.label.pack(expand=True)

        self.drop_target_register(DND_ALL)
        self.dnd_bind('<<Drop>>', self.handle_drop)

    def handle_drop(self, event):
        self.label.configure(text=f"Dropped: {event.data}")

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

if __name__ == '__main__':
    app = App()
    app.mainloop()