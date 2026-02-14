import customtkinter as ctk
import tkinter as tk
from tkinter import messagebox, simpledialog
import sys
import os
from config import (
    APP_CONFIG, save_config, DEFAULT_CONFIG, COLORS, 
    DEFAULT_FONT_SETTINGS, logger, debug_decorator
)

import tkinter as tk

def get_widget_styles(fonts):
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
            "font": fonts["button"],
            "text_color": text_color
        },
        "radio_button": {
            "font": fonts["button"],
            "text_color": text_color
        },
        "entry": {
            "corner_radius": 6,
            "border_width": 1,
            "border_color": border_color,
            "fg_color": entry_bg_color,
            "text_color": text_color,
            "font": fonts["normal"]
        },
        "label": {
            "text_color": text_color,
            "font": fonts["label"]
        },
        "secondary_label": {
             "text_color": secondary_text_color,
             "font": fonts["small"]
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

def create_menu(app_instance):
    menubar_frame = ctk.CTkFrame(app_instance, **app_instance.widget_styles["frame"])
    menubar_frame.pack(side=ctk.TOP, fill=ctk.X)

    app_instance.file_menu_button = ctk.CTkButton(menubar_frame, text="파일", command=app_instance.show_file_menu)
    app_instance.file_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)
    app_instance.file_menu = tk.Menu(app_instance, tearoff=0)
    app_instance.file_menu.add_command(label="폴더 열기", command=app_instance.change_folder)
    app_instance.file_menu.add_command(label="새로고침", command=app_instance.refresh_image_list)
    app_instance.file_menu.add_separator()
    app_instance.file_menu.add_command(label="종료", command=app_instance._on_closing)

    app_instance.go_menu_button = ctk.CTkButton(menubar_frame, text="이동", command=app_instance.show_go_menu)
    app_instance.go_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)
    app_instance.go_menu = tk.Menu(app_instance, tearoff=0)

    app_instance.settings_menu_button = ctk.CTkButton(menubar_frame, text="설정", command=app_instance.show_settings_window)
    app_instance.settings_menu_button.pack(side=ctk.LEFT, padx=5, pady=5)

def create_main_layout(app_instance):
    main_frame = ctk.CTkFrame(app_instance, fg_color="transparent")
    main_frame.pack(expand=True, fill=ctk.BOTH, padx=5, pady=5)

    app_instance.preview_frame = ctk.CTkScrollableFrame(main_frame, width=200, **app_instance.widget_styles["frame"])
    app_instance.preview_frame.pack(side=ctk.LEFT, fill=ctk.Y, padx=(0, 5))

    separator = ctk.CTkFrame(main_frame, width=2, fg_color=("gray75", "gray25"))
    separator.pack(side=ctk.LEFT, fill=ctk.Y)

    image_container = ctk.CTkFrame(main_frame, fg_color="transparent")
    image_container.pack(side=ctk.LEFT, expand=True, fill=ctk.BOTH)

    app_instance.image_display_frame = ctk.CTkFrame(image_container, **app_instance.widget_styles["frame"])
    app_instance.image_display_frame.pack(expand=True, fill=ctk.BOTH)

    app_instance.image_label = ctk.CTkLabel(app_instance.image_display_frame, text="폴더를 열어 이미지를 확인하세요.", **app_instance.widget_styles["label"])
    app_instance.image_label.pack(expand=True, fill=ctk.BOTH)

    app_instance.metadata_frame = ctk.CTkFrame(main_frame, **app_instance.widget_styles["frame"])
    app_instance.metadata_frame.pack(side=ctk.RIGHT, fill=ctk.Y, padx=(5, 0))
    app_instance.metadata_frame.configure(width=350)
    app_instance.metadata_frame.pack_propagate(False)
    
    metadata_header_frame = ctk.CTkFrame(app_instance.metadata_frame, fg_color="transparent")
    metadata_header_frame.pack(fill=ctk.X, pady=5, padx=5)

    metadata_label = ctk.CTkLabel(metadata_header_frame, text="메타데이터", **app_instance.widget_styles["label"])
    metadata_label.pack(side=ctk.LEFT, expand=True, fill=ctk.X)

    app_instance.copy_metadata_button = ctk.CTkButton(metadata_header_frame, text="메타데이터 복사", command=app_instance.copy_full_metadata, **app_instance.widget_styles["button"])
    app_instance.copy_metadata_button.pack(side=ctk.RIGHT)

    app_instance.metadata_text = ctk.CTkTextbox(app_instance.metadata_frame, state="disabled", **app_instance.widget_styles["text"])
    app_instance.metadata_text.pack(expand=True, fill=ctk.BOTH, padx=5, pady=(0, 5))

def create_status_bar(app_instance):
    app_instance.status_bar_frame = ctk.CTkFrame(app_instance, **app_instance.widget_styles["frame"])
    app_instance.status_bar_frame.pack(side=ctk.BOTTOM, fill=ctk.X)
    app_instance.status_var = ctk.StringVar(value="준비")
    app_instance.status_bar_label = ctk.CTkLabel(app_instance.status_bar_frame, textvariable=app_instance.status_var, **app_instance.widget_styles["secondary_label"])
    app_instance.status_bar_label.pack(side=ctk.LEFT, padx=10, pady=2)

def create_control_bar(app_instance):
    app_instance.control_frame_container = ctk.CTkFrame(app_instance, **app_instance.widget_styles["frame"])
    app_instance.control_frame_container.pack(side=ctk.BOTTOM, fill=ctk.X, pady=5, padx=5)
    app_instance.control_frame_container.grid_columnconfigure(list(range(12)), weight=1) # Allow columns to expand

    buttons = {
        "previous_image": ("이전", app_instance.show_previous_image), "next_image": ("다음", app_instance.show_next_image),
        "delete_image": ("삭제", app_instance.delete_current_image), "move_to_keep": ("보관", app_instance.move_to_keep_folder),
        "rotate_left": ("왼쪽 회전", app_instance.rotate_left), "rotate_right": ("오른쪽 회전", app_instance.rotate_right),
        "zoom_in": ("확대", app_instance.zoom_in), "zoom_out": ("축소", app_instance.zoom_out),
        "toggle_view_mode": ("보기 전환", app_instance.toggle_view_mode), "refresh_list": ("새로고침", app_instance.refresh_image_list),
        "move_search_results": ("검색 결과 이동", app_instance.move_search_results)
    }
    
    app_instance.action_buttons = {}
    col = 0
    for action, (text, cmd) in buttons.items():
        width = 120 if action == "move_search_results" else 80
        btn = ctk.CTkButton(app_instance.control_frame_container, text=text, command=cmd, width=width, **app_instance.widget_styles["button"])
        btn.grid(row=0, column=col, padx=2, pady=5)
        app_instance.action_buttons[action] = btn
        col += 1

    # Add 'Go to Index' widgets
    app_instance.go_to_index_var = tk.StringVar()
    app_instance.go_to_index_entry = ctk.CTkEntry(app_instance.control_frame_container, textvariable=app_instance.go_to_index_var, width=60, **app_instance.widget_styles["entry"])
    app_instance.go_to_index_entry.grid(row=0, column=col, padx=(10, 2), pady=5)
    app_instance.go_to_index_entry.bind("<Return>", app_instance.go_to_index)
    col += 1
    
    app_instance.go_to_index_button = ctk.CTkButton(app_instance.control_frame_container, text="이동", command=app_instance.go_to_index, width=40, **app_instance.widget_styles["button"])
    app_instance.go_to_index_button.grid(row=0, column=col, padx=2, pady=5)

def create_search_bar(app_instance):
    app_instance.search_bar_frame = ctk.CTkFrame(app_instance, **app_instance.widget_styles["frame"])
    app_instance.search_bar_frame.pack(side=ctk.BOTTOM, fill=ctk.X, pady=(0, 5), padx=5)
    
    search_label = ctk.CTkLabel(app_instance.search_bar_frame, text="PNG 태그 검색:", **app_instance.widget_styles["label"])
    search_label.pack(side=ctk.LEFT, padx=(10, 5))
    
    app_instance.search_entry_var = ctk.StringVar()
    app_instance.search_entry = ctk.CTkEntry(app_instance.search_bar_frame, textvariable=app_instance.search_entry_var, **app_instance.widget_styles["entry"])
    app_instance.search_entry.pack(side=ctk.LEFT, expand=True, fill=ctk.X, padx=5)
    app_instance.search_entry.bind("<Return>", app_instance._perform_search)
    app_instance.search_entry.bind("<Escape>", app_instance._clear_search)
    app_instance.search_entry.bind("<FocusIn>", app_instance.on_search_focus_in)
    app_instance.search_entry.bind("<FocusOut>", app_instance.on_search_focus_out)

    search_button = ctk.CTkButton(app_instance.search_bar_frame, text="검색", command=app_instance._perform_search, **app_instance.widget_styles["button"])
    search_button.pack(side=ctk.LEFT, padx=5)
    clear_button = ctk.CTkButton(app_instance.search_bar_frame, text="지우기", command=app_instance._clear_search, **app_instance.widget_styles["button"])
    clear_button.pack(side=ctk.LEFT, padx=(0, 5))

class SettingsWindow(ctk.CTkToplevel):
    def __init__(self, master, app_controller):
        super().__init__(master)
        self.title("설정")
        self.app_controller = app_controller
        self.geometry("600x700")
        self.grab_set()

        self.fonts = self.app_controller.fonts
        self.widget_styles = get_widget_styles(self.fonts)

        self.configure(fg_color=self.widget_styles["frame"]['fg_color'])

        self.tabview = ctk.CTkTabview(self, **self.widget_styles['frame'])
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
        settings_frame = ctk.CTkFrame(tab, **self.widget_styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)

        title_label = ctk.CTkLabel(settings_frame, text="미리보기 및 캐시 설정", **self.widget_styles["label"])
        title_label.pack(pady=(15, 20))

        self.preview_count_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="최대 미리보기 이미지 수:", **self.widget_styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.preview_count_var, **self.widget_styles["entry"]).pack()

        self.preview_width_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="미리보기 썸네일 너비 (px):", **self.widget_styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.preview_width_var, **self.widget_styles["entry"]).pack()

        self.image_cache_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="메인 이미지 캐시 크기:", **self.widget_styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.image_cache_var, **self.widget_styles["entry"]).pack()

        self.preview_cache_var = tk.IntVar()
        ctk.CTkLabel(settings_frame, text="미리보기 캐시 크기:", **self.widget_styles["label"]).pack()
        ctk.CTkEntry(settings_frame, textvariable=self.preview_cache_var, **self.widget_styles["entry"]).pack()

        self.confirm_delete_var = tk.BooleanVar()
        ctk.CTkCheckBox(settings_frame, text="삭제 전 확인", variable=self.confirm_delete_var, **self.widget_styles["button"]).pack()

    def _create_shortcut_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.widget_styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)

        title_label = ctk.CTkLabel(settings_frame, text="단축키 설정", **self.widget_styles["label"])
        title_label.pack(pady=(15, 20))

        self.shortcut_vars = {}
        for action, shortcut in APP_CONFIG["shortcuts"].items():
            frame = ctk.CTkFrame(settings_frame, fg_color="transparent")
            frame.pack(fill="x", pady=2)
            ctk.CTkLabel(frame, text=action.replace("_", " ").title(), **self.widget_styles["label"]).pack(side="left")
            var = tk.StringVar(value=shortcut)
            entry = ctk.CTkEntry(frame, textvariable=var, **self.widget_styles["entry"])
            entry.pack(side="right")
            self.shortcut_vars[action] = var

    def _create_theme_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.widget_styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)

        title_label = ctk.CTkLabel(settings_frame, text="테마 설정", **self.widget_styles["label"])
        title_label.pack(pady=(15, 20))

        self.theme_var = tk.StringVar(value=APP_CONFIG.get("appearance_mode", "System"))
        themes = ["Light", "Dark", "System"]
        for theme in themes:
            ctk.CTkRadioButton(settings_frame, text=theme, variable=self.theme_var, value=theme, **self.widget_styles["radio_button"]).pack(anchor="w")

    def _create_delete_settings(self, tab):
        settings_frame = ctk.CTkFrame(tab, **self.widget_styles["frame"])
        settings_frame.pack(expand=True, fill="both", padx=10, pady=10)

        title_label = ctk.CTkLabel(settings_frame, text="삭제 설정", **self.widget_styles["label"])
        title_label.pack(pady=(15, 20))

        self.delete_to_trash_var = tk.BooleanVar()
        ctk.CTkCheckBox(settings_frame, text="삭제 시 휴지통으로 이동", variable=self.delete_to_trash_var, **self.widget_styles["button"]).pack()

    def _create_buttons(self):
        button_frame = ctk.CTkFrame(self, fg_color="transparent")
        button_frame.pack(fill=ctk.X, padx=10, pady=10)

        self.save_button = ctk.CTkButton(button_frame, text="저장하고 닫기", command=self.save_and_close, **self.widget_styles["button"])
        self.save_button.pack(side=ctk.RIGHT, padx=5)

        self.restart_button = ctk.CTkButton(button_frame, text="저장하고 다시 시작", command=self.save_and_restart, **self.widget_styles["button"])
        self.restart_button.pack(side=ctk.RIGHT, padx=5)

        self.defaults_button = ctk.CTkButton(button_frame, text="기본값으로 복원", command=self.restore_defaults, **self.widget_styles["button"])
        self.defaults_button.pack(side=ctk.LEFT, padx=5)

    @debug_decorator
    def save_and_close(self):
        self.save_settings()
        self.app_controller.apply_new_config()
        self.destroy()

    @debug_decorator
    def save_and_restart(self):
        self.save_settings()
        self.app_controller.restart_app()

    def save_settings(self):
        try:
            APP_CONFIG["max_preview_images"] = self.preview_count_var.get()
        except tk.TclError:
            APP_CONFIG["max_preview_images"] = DEFAULT_CONFIG["max_preview_images"]
        try:
            APP_CONFIG["preview_thumbnail_width"] = self.preview_width_var.get()
        except tk.TclError:
            APP_CONFIG["preview_thumbnail_width"] = DEFAULT_CONFIG["preview_thumbnail_width"]
        try:
            APP_CONFIG["max_image_cache_size"] = self.image_cache_var.get()
        except tk.TclError:
            APP_CONFIG["max_image_cache_size"] = DEFAULT_CONFIG["max_image_cache_size"]
        try:
            APP_CONFIG["max_preview_cache_size"] = self.preview_cache_var.get()
        except tk.TclError:
            APP_CONFIG["max_preview_cache_size"] = DEFAULT_CONFIG["max_preview_cache_size"]

        APP_CONFIG["confirm_delete"] = self.confirm_delete_var.get()
        APP_CONFIG["delete_to_trash"] = self.delete_to_trash_var.get()
        APP_CONFIG["appearance_mode"] = self.theme_var.get()
        for action, var in self.shortcut_vars.items():
            APP_CONFIG["shortcuts"][action] = var.get()
        save_config()

    @debug_decorator
    def restore_defaults(self):
        if messagebox.askyesno("기본값으로 복원", "정말로 모든 설정을 기본값으로 복원하시겠습니까?"):
            global APP_CONFIG
            APP_CONFIG = DEFAULT_CONFIG.copy()
            self.load_settings_to_ui()

    def load_settings_to_ui(self):
        self.preview_count_var.set(APP_CONFIG["max_preview_images"])
        self.preview_width_var.set(APP_CONFIG["preview_thumbnail_width"])
        self.image_cache_var.set(APP_CONFIG["max_image_cache_size"])
        self.preview_cache_var.set(APP_CONFIG["max_preview_cache_size"])
        self.confirm_delete_var.set(APP_CONFIG["confirm_delete"])
        self.delete_to_trash_var.set(APP_CONFIG.get("delete_to_trash", True))
        self.theme_var.set(APP_CONFIG.get("appearance_mode", "System"))
        for action, var in self.shortcut_vars.items():
            var.set(APP_CONFIG["shortcuts"].get(action, ""))