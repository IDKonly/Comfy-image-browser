
import os
import time
import threading
import customtkinter as ctk
from tkinterdnd2 import TkinterDnD
from app_controller import AppController
from config import APP_CONFIG

def run_test_scenario():
    print("[Test] Starting test scenario...")
    
    # 1. Initialize App
    ctk.set_appearance_mode("Dark")
    
    class TestApp(ctk.CTk, TkinterDnD.DnDWrapper):
        def __init__(self):
            super().__init__()
            try:
                self.TkdndVersion = TkinterDnD._require(self)
            except Exception as e:
                print(f"[Test] TkinterDnD fail: {e}")
            
            self.controller = AppController(self)
            self.protocol("WM_DELETE_WINDOW", self.controller.on_closing)

    app = TestApp()
    controller = app.controller
    
    # 2. Define Scenario
    def scenario():
        try:
            # Wait for initial load
            time.sleep(2)
            controller.visual_debugger.capture("01_initial_load")
            
            # Action: Change folder to 'test' directory if it exists
            test_dir = os.path.abspath("test")
            if os.path.exists(test_dir):
                print(f"[Test] Changing folder to: {test_dir}")
                app.after(0, lambda: controller.change_folder(test_dir))
                
                # Wait for folder to load
                time.sleep(3)
                controller.visual_debugger.capture("02_after_folder_load")
                
                # Action: Show next image
                print("[Test] Showing next image")
                app.after(0, controller.show_next)
                time.sleep(1)
                controller.visual_debugger.capture("03_after_next")
                
                # Action: Toggle batch mode
                print("[Test] Toggling batch mode")
                app.after(0, controller.toggle_batch_mode)
                time.sleep(2)
                controller.visual_debugger.capture("04_batch_mode_initial")

                # Action: Show next batch
                print("[Test] Showing next batch")
                app.after(0, controller.show_next)
                time.sleep(2)
                controller.visual_debugger.capture("05_batch_mode_next")

                # Action: Resize window (simulate narrowing)
                print("[Test] Resizing window (narrow)")
                app.after(0, lambda: app.geometry("800x800"))
                time.sleep(2)
                controller.visual_debugger.capture("06_batch_mode_narrow")

                # Action: Resize window (simulate widening)
                print("[Test] Resizing window (wide)")
                app.after(0, lambda: app.geometry("1600x800"))
                time.sleep(2)
                controller.visual_debugger.capture("07_batch_mode_wide")
                
                # Action: Show previous batch
                print("[Test] Showing previous batch")
                app.after(0, controller.show_previous)
                time.sleep(2)
                controller.visual_debugger.capture("08_batch_mode_prev")
            else:
                print("[Test] 'test' directory not found, skipping folder actions.")
                
            print("[Test] Scenario completed. Closing app in 2 seconds...")
            time.sleep(2)
            app.after(0, app.destroy)
            
        except Exception as e:
            print(f"[Test] Error in scenario: {e}")
            app.after(0, app.destroy)

    # Run scenario in a separate thread
    threading.Thread(target=scenario, daemon=True).start()
    
    # 3. Start App
    print("[Test] Entering mainloop...")
    app.mainloop()

if __name__ == "__main__":
    run_test_scenario()
