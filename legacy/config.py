
import logging
import os
import json
import sys
from logging.handlers import RotatingFileHandler
import re

# --- Constants ---
APP_VERSION = "1.1.0"

# --- UI Constants ---
COLORS = {
    "primary": {"fg": "#0078D4", "hover": "#106EBE"},
    "success": {"fg": "#107C10", "hover": "#0B590B"},
    "danger": {"fg": "#D83B01", "hover": "#A62E01"},
    "warning": {"fg": "#F2C811", "hover": "#C4A00D"},
    "neutral": {"fg": "#6C757D", "hover": "#495057"},
    "background": {
        "light": "#F8F9FA",
        "medium": "#E9ECEF",
        "dark": "#DEE2E6",
        "dark_ui": "#2B2B2B"
    },
    "text": {
        "primary": "#212529",
        "secondary": "#495057",
        "disabled": "#6C757D",
        "light_ui": "#EAEAEA"
    },
    "border": "#CED4DA",
    "border_dark": "#4A4A4A"
}

DEFAULT_FONT_SETTINGS = {
    "family": "Arial",
    "heading_size": 14,
    "normal_size": 12,
    "small_size": 10
}

# --- App Behavior Constants ---
SUPPORTED_EXTENSIONS = ('*.jpg', '*.jpeg', '*.png', '*.gif', '*.bmp', '*.webp', '*.tiff', '*.tif')
MIN_SCALE_FACTOR = 0.1
MAX_SCALE_FACTOR = 5.0
ROTATION_STEP = 90
RESIZE_DEBOUNCE_MS = 250
MAX_PNG_INFO_VALUE_LENGTH = 200
DEFAULT_SCALE_FACTOR = 1.0 # Fit to window by default

# --- Configuration Files ---
CONFIG_FILE = "image_manager_config.json"
LOG_FILE = "image_manager.log"

# --- Default Configuration ---
DEFAULT_CONFIG = {
    "max_preview_images": 10,
    "preview_thumbnail_width": 100,
    "max_image_cache_size": 10,
    "max_preview_cache_size": 50,
    "auto_save_interval": 30,
    "window_size": {"width": 1200, "height": 800},
    "appearance_mode": "System",
    "confirm_delete": True,
    "show_parameters": True,
    "delete_to_trash": True,
    "shortcuts": {
        "open_folder": "Control-o",
        "refresh_list": "F5",
        "previous_image": "Left",
        "next_image": "Right",
        "delete_image": "Delete",
        "move_to_keep": "k",
        "rotate_left": "l",
        "rotate_right": "r",
        "zoom_in": "plus",
        "zoom_out": "minus",
        "toggle_view_mode": "v",
        "go_to_index": "Control-g"
    },
    "state": {
        "last_folder": None,
        "current_index": 0
    }
}

# Global config variable
APP_CONFIG = {}

# --- Logging Setup ---
class CustomFormatter(logging.Formatter):
    """Masks user-specific parts of file paths in log records."""
    def format(self, record):
        if hasattr(record, 'pathname'):
            record.pathname = os.path.basename(record.pathname)
        if isinstance(record.msg, str):
            # Anonymize paths in the log message
                    record.msg = re.sub(r"D:\\Users\\[^\\]+", r"D:\\Users\\<user>", record.msg)
        return super().format(record)

def setup_logging():
    """Configures the application's logger."""
    logger = logging.getLogger('ImageManager')
    logger.setLevel(logging.DEBUG)

    # Prevent duplicate handlers
    if logger.hasHandlers():
        logger.handlers.clear()

    # File handler with rotation
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8')
    file_handler.setFormatter(CustomFormatter('%(asctime)s - %(levelname)s - [%(name)s] %(message)s'))
    logger.addHandler(file_handler)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(CustomFormatter('%(asctime)s - %(levelname)s: %(message)s'))
    logger.addHandler(console_handler)
    
    return logger

class PerformanceTimer:
    """Context manager to measure and log execution time of code blocks."""
    def __init__(self, name, threshold=0.1):
        self.name = name
        self.threshold = threshold
        self.start_time = None

    def __enter__(self):
        import time
        self.start_time = time.time()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        import time
        elapsed = time.time() - self.start_time
        if elapsed > self.threshold:
            logger.info(f"[PERF] {self.name} took {elapsed:.4f}s")

class DeduplicateFilter(logging.Filter):
    """Filters out consecutive duplicate log messages to reduce noise."""
    def __init__(self):
        super().__init__()
        self.last_msg = None
        self.count = 0

    def filter(self, record):
        msg = record.getMessage()
        if msg == self.last_msg:
            self.count += 1
            return False
        else:
            if self.count > 0:
                # Log a summary of the suppressed messages (would require a separate log call or custom handling, 
                # but for now we just suppress. ideally we'd log '... repeated X times' but standard logging flow makes that tricky without a custom handler.
                # simpler approach: just suppress exact repeats)
                pass
            self.last_msg = msg
            self.count = 0
            return True

def setup_logging():
    """Configures the application's logger."""
    logger = logging.getLogger('ImageManager')
    logger.setLevel(logging.INFO)

    # Prevent duplicate handlers
    if logger.hasHandlers():
        logger.handlers.clear()

    # File handler with rotation
    file_handler = RotatingFileHandler(LOG_FILE, maxBytes=5*1024*1024, backupCount=2, encoding='utf-8')
    file_handler.setFormatter(CustomFormatter('%(asctime)s - %(levelname)s - [%(name)s] %(message)s'))
    logger.addHandler(file_handler)

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(CustomFormatter('%(asctime)s - %(levelname)s: %(message)s'))
    console_handler.addFilter(DeduplicateFilter()) # Add deduplication
    logger.addHandler(console_handler)
    
    return logger

logger = setup_logging()

def debug_decorator(func):
    """Decorator for logging function calls for debugging."""
    def wrapper(*args, **kwargs):
        class_name = ""
        if args and hasattr(args[0], '__class__'):
            class_name = f"{args[0].__class__.__name__}."
        
        logger.debug(f"Entering {class_name}{func.__name__}")
        try:
            result = func(*args, **kwargs)
            logger.debug(f"Exiting {class_name}{func.__name__} - Success")
            return result
        except Exception as e:
            logger.error(f"Error in {class_name}{func.__name__}: {e}", exc_info=True)
            raise
    return wrapper

# --- Configuration Management ---
@debug_decorator
def load_config():
    """Loads configuration from JSON file, merging with defaults."""
    global APP_CONFIG
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                loaded_config = json.load(f)
            
            # Start with default, then update with loaded config
            APP_CONFIG = DEFAULT_CONFIG.copy()
            for key, value in loaded_config.items():
                if isinstance(value, dict) and key in APP_CONFIG:
                    APP_CONFIG[key].update(value)
                else:
                    APP_CONFIG[key] = value
            logger.info(f"Configuration loaded from {CONFIG_FILE}")
        except (json.JSONDecodeError, TypeError) as e:
            logger.error(f"Failed to load config file '{CONFIG_FILE}': {e}. Using defaults.")
            APP_CONFIG = DEFAULT_CONFIG.copy()
            save_config() # Save a clean default config
    else:
        logger.info(f"Config file not found. Creating with default values: {CONFIG_FILE}")
        APP_CONFIG = DEFAULT_CONFIG.copy()
        save_config()

@debug_decorator
def save_config():
    """Saves the current configuration to the JSON file."""
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(APP_CONFIG, f, ensure_ascii=False, indent=4)
    except IOError as e:
        logger.error(f"Failed to save config to '{CONFIG_FILE}': {e}")

# Load config on module import
load_config()
