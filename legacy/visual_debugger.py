
import os
import time
from PIL import ImageGrab
import customtkinter as ctk

class VisualDebugger:
    def __init__(self, root, screenshot_dir="debug_screenshots"):
        self.root = root
        self.screenshot_dir = screenshot_dir
        if not os.path.exists(self.screenshot_dir):
            os.makedirs(self.screenshot_dir)
        print(f"[VisualDebugger] Initialized. Screenshots will be saved to: {os.path.abspath(self.screenshot_dir)}")

    def capture(self, name=None):
        """Captures the current state of the application window."""
        self.root.update_idletasks()
        self.root.update()
        
        # Get window coordinates
        x = self.root.winfo_rootx()
        y = self.root.winfo_rooty()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        
        # Adjust for high DPI if necessary (though ImageGrab usually handles it on Windows if app is DPI aware)
        # On some systems, winfo_rootx might not include the title bar or borders correctly.
        # But for debugging, it's usually good enough.
        
        bbox = (x, y, x + w, y + h)
        
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        filename = f"screenshot_{timestamp}_{name}.png" if name else f"screenshot_{timestamp}.png"
        filepath = os.path.join(self.screenshot_dir, filename)
        
        try:
            # Add a small delay to ensure UI is rendered
            time.sleep(0.2)
            img = ImageGrab.grab(bbox=bbox, all_screens=True)
            img.save(filepath)
            print(f"[VisualDebugger] Screenshot saved: {filepath}")
            return filepath
        except Exception as e:
            print(f"[VisualDebugger] Failed to capture screenshot: {e}")
            return None

def setup_visual_debugger(controller):
    """Utility function to attach VisualDebugger to the controller."""
    controller.visual_debugger = VisualDebugger(controller.root)
    
    # Add a keyboard shortcut for manual debugging
    controller.root.bind("<Control-Alt-S>", lambda e: controller.visual_debugger.capture("manual"))
    print("[VisualDebugger] Shortcut <Control-Alt-S> bound for manual screenshots.")
