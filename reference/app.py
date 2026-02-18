import customtkinter as ctk
from tkinter import filedialog
import os
import core
import random
from tkinterdnd2 import DND_FILES, TkinterDnD
import collections
from concurrent.futures import ProcessPoolExecutor, as_completed
import time

# It's assumed a 'core.py' file exists with the necessary functions.

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

class TagFilterWindow(ctk.CTkToplevel):
    """A Toplevel window for interactively filtering tags with optimized performance (Pooling & Batching)."""
    def __init__(self, master, tag_counts, callback, initial_excluded_tags=None):
        super().__init__(master)
        self.callback = callback
        self.all_sorted_tags = sorted(tag_counts.items(), key=lambda item: (-item[1], item[0]))
        self.initial_excluded_tags = initial_excluded_tags if initial_excluded_tags is not None else set()

        # Fast state management for all tags
        self.tag_states = {tag: (tag in self.initial_excluded_tags) for tag, _ in self.all_sorted_tags}

        self.title("Refine & Filter Tags")
        self.geometry("450x700")
        self.grab_set()

        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # --- Widgets ---
        self.search_frame = ctk.CTkFrame(self)
        self.search_frame.grid(row=0, column=0, padx=10, pady=(10, 5), sticky="ew")
        self.search_frame.grid_columnconfigure(0, weight=1)

        self.search_entry = ctk.CTkEntry(self.search_frame, placeholder_text="Type to search tags...")
        self.search_entry.grid(row=0, column=0, columnspan=3, padx=5, pady=5, sticky="ew")
        self.search_entry.bind("<KeyRelease>", self._on_search)

        self.check_all_button = ctk.CTkButton(self.search_frame, text="Check All (Visible)", command=self.check_all_visible)
        self.check_all_button.grid(row=1, column=0, padx=5, pady=5, sticky="ew")
        
        self.uncheck_all_button = ctk.CTkButton(self.search_frame, text="Uncheck All (Visible)", command=self.uncheck_all_visible)
        self.uncheck_all_button.grid(row=1, column=1, padx=5, pady=5, sticky="ew")

        self.hide_checked_checkbox = ctk.CTkCheckBox(self.search_frame, text="Hide Checked Tags", command=self.update_display)
        self.hide_checked_checkbox.grid(row=1, column=2, padx=5, pady=5, sticky="w")

        self.scrollable_frame = ctk.CTkScrollableFrame(self, label_text="Select tags to exclude (sorted by frequency)")
        self.scrollable_frame.grid(row=1, column=0, padx=10, pady=5, sticky="nsew")
        self.scrollable_frame.grid_columnconfigure(0, weight=1)

        self.apply_button = ctk.CTkButton(self, text="Apply Filter", command=self.apply_filter)
        self.apply_button.grid(row=2, column=0, padx=10, pady=10)

        # Optimization: Object Pool and Batching
        self.checkbox_pool = []  # List of reusable CTkCheckBox widgets
        self.active_tags = []    # List of tags currently being displayed
        self._render_job = None  # To track the current batch loop

        # Initial population
        self.update_display()

    def _on_search(self, event=None):
        if hasattr(self, "_search_job"):
            self.after_cancel(self._search_job)
        self._search_job = self.after(300, self.update_display)

    def update_display(self):
        """Prepares the list of tags to show and starts the batch rendering process."""
        # Cancel any ongoing rendering
        if self._render_job:
            self.after_cancel(self._render_job)
            self._render_job = None

        search_term = self.search_entry.get().lower()
        hide_checked = self.hide_checked_checkbox.get()

        # Filter tags
        self.active_tags = []
        for tag, count in self.all_sorted_tags:
            if hide_checked and self.tag_states.get(tag, False):
                continue
            if search_term and search_term not in tag.lower():
                continue
            self.active_tags.append((tag, count))

        # Start batch rendering from index 0
        self._render_batch(0)

    def _render_batch(self, start_index):
        """Renders a batch of widgets using the pool."""
        BATCH_SIZE = 50
        end_index = min(start_index + BATCH_SIZE, len(self.active_tags))
        
        # Process current batch
        for i in range(start_index, end_index):
            tag, count = self.active_tags[i]
            checkbox_text = f"{tag} ({count})"
            
            # Get from pool or create new
            if i < len(self.checkbox_pool):
                checkbox = self.checkbox_pool[i]
                checkbox.configure(text=checkbox_text, command=lambda t=tag: self._toggle_tag(t))
                # Update state
                if self.tag_states.get(tag, False):
                    checkbox.select()
                else:
                    checkbox.deselect()
                checkbox.pack(anchor="w", padx=10, pady=2, fill="x")
            else:
                checkbox = ctk.CTkCheckBox(self.scrollable_frame, text=checkbox_text,
                                           command=lambda t=tag: self._toggle_tag(t))
                if self.tag_states.get(tag, False):
                    checkbox.select()
                self.checkbox_pool.append(checkbox)
                checkbox.pack(anchor="w", padx=10, pady=2, fill="x")

        # Schedule next batch or clean up
        if end_index < len(self.active_tags):
            self._render_job = self.after(10, lambda: self._render_batch(end_index))
        else:
            # Hide unused widgets in pool
            for i in range(end_index, len(self.checkbox_pool)):
                self.checkbox_pool[i].pack_forget()
            self._render_job = None

    def _toggle_tag(self, tag):
        self.tag_states[tag] = not self.tag_states.get(tag, False)
        if self.hide_checked_checkbox.get():
            self.update_display()

    def check_all_visible(self):
        for tag, _ in self.active_tags:
            self.tag_states[tag] = True
        
        # Reflect change in UI (only for visible ones currently rendered)
        # We can just call update_display to refresh states properly or iterate pool
        # Iterating pool is faster for immediate feedback
        for i, (tag, _) in enumerate(self.active_tags):
            if i < len(self.checkbox_pool):
                 self.checkbox_pool[i].select()
        
        if self.hide_checked_checkbox.get():
            self.update_display()

    def uncheck_all_visible(self):
        for tag, _ in self.active_tags:
            self.tag_states[tag] = False
        
        for i, (tag, _) in enumerate(self.active_tags):
            if i < len(self.checkbox_pool):
                 self.checkbox_pool[i].deselect()

    def apply_filter(self):
        final_excluded_tags = {tag for tag, is_checked in self.tag_states.items() if is_checked}
        self.callback(final_excluded_tags)
        self.destroy()

class App(ctk.CTk, TkinterDnD.DnDWrapper):
    def __init__(self):
        super().__init__()
        self.TkdndVersion = TkinterDnD._require(self)
        self.title("Image Tag Filter")
        self.geometry("1200x900")
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(2, weight=1)
        self.unfiltered_results = {}
        self.tag_filter_window = None
        self.tags_in_filter_window = set()
        self.setup_ui()
        self.load_default_exclusions()

    def setup_ui(self):
        # --- Row 0: Input Frame ---
        self.top_frame = ctk.CTkFrame(self)
        self.top_frame.grid(row=0, column=0, padx=10, pady=10, sticky="nsew")
        self.top_frame.grid_columnconfigure((0, 1), weight=1)

        # Target Images Frame
        self.target_frame = ctk.CTkFrame(self.top_frame)
        self.target_frame.grid(row=0, column=0, padx=(0, 5), pady=0, sticky="nsew")
        self.target_frame.grid_columnconfigure(0, weight=1)
        self.target_frame.grid_rowconfigure(2, weight=1)
        ctk.CTkLabel(self.target_frame, text="Target Images", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=10, pady=(10, 5), sticky="w")
        
        target_buttons_frame = ctk.CTkFrame(self.target_frame, fg_color="transparent")
        target_buttons_frame.grid(row=1, column=0, padx=10, pady=0, sticky="ew")
        ctk.CTkButton(target_buttons_frame, text="Add Files", command=lambda: self.add_files(self.target_listbox)).pack(side="left", padx=(0,5))
        ctk.CTkButton(target_buttons_frame, text="Add Folder", command=lambda: self.add_folder(self.target_listbox, self.target_recursive_checkbox)).pack(side="left", padx=5)
        self.target_recursive_checkbox = ctk.CTkCheckBox(target_buttons_frame, text="Recursive")
        self.target_recursive_checkbox.pack(side="left", padx=5)
        self.target_recursive_checkbox.select()
        ctk.CTkButton(target_buttons_frame, text="Clear", fg_color="#D25B5B", hover_color="#B34444", command=lambda: self.clear_textbox(self.target_listbox)).pack(side="left", padx=5)

        self.target_listbox = ctk.CTkTextbox(self.target_frame, wrap="none")
        self.target_listbox.grid(row=2, column=0, padx=10, pady=10, sticky="nsew")
        self.target_listbox.drop_target_register(DND_FILES)
        self.target_listbox.dnd_bind("<<Drop>>", lambda e: self.handle_drop(e, self.target_listbox, self.target_recursive_checkbox))

        # Comparison Image Frame
        self.comparison_frame = ctk.CTkFrame(self.top_frame)
        self.comparison_frame.grid(row=0, column=1, padx=(5, 0), pady=0, sticky="nsew")
        self.comparison_frame.grid_columnconfigure(0, weight=1)
        ctk.CTkLabel(self.comparison_frame, text="Comparison Image (Optional)", font=ctk.CTkFont(weight="bold")).grid(row=0, column=0, padx=10, pady=(10,5), sticky="w")
        
        comparison_buttons_frame = ctk.CTkFrame(self.comparison_frame, fg_color="transparent")
        comparison_buttons_frame.grid(row=1, column=0, padx=10, pady=0, sticky="ew")
        ctk.CTkButton(comparison_buttons_frame, text="Select Image", command=self.select_comparison_file).pack(side="left", padx=(0,5))
        ctk.CTkButton(comparison_buttons_frame, text="Clear", fg_color="#D25B5B", hover_color="#B34444", command=lambda: self.clear_entry(self.comparison_entry)).pack(side="left", padx=5)
        
        self.comparison_entry = ctk.CTkEntry(self.comparison_frame, placeholder_text="Drop a single image or leave blank for auto-select")
        self.comparison_entry.grid(row=2, column=0, padx=10, pady=10, sticky="ew")
        self.comparison_entry.drop_target_register(DND_FILES)
        self.comparison_entry.dnd_bind("<<Drop>>", lambda e: self.handle_drop(e, self.comparison_entry, None))
        
        # --- Row 1: Filter & Exclusion Tabs ---
        self.filter_tab_view = ctk.CTkTabview(self, height=150)
        self.filter_tab_view.grid(row=1, column=0, padx=10, pady=0, sticky="ew")
        self.filter_tab_view.add("Partial Match")
        self.filter_tab_view.add("Exact Match")
        self.filter_tab_view.add("Exceptions")
        self.filter_tab_view.add("Advanced")
        self.setup_filter_tabs()

        # --- Row 2: Results and Controls ---
        self.results_frame = ctk.CTkFrame(self)
        self.results_frame.grid(row=2, column=0, padx=10, pady=10, sticky="nsew")
        self.results_frame.grid_columnconfigure(0, weight=1)
        self.results_frame.grid_rowconfigure(1, weight=1)

        controls_frame = ctk.CTkFrame(self.results_frame)
        controls_frame.grid(row=0, column=0, padx=0, pady=0, sticky="ew")
        self.run_button = ctk.CTkButton(controls_frame, text="Run Comparison", command=self.run_comparison_threaded)
        self.run_button.pack(side="left", padx=10, pady=10)
        self.refine_button = ctk.CTkButton(controls_frame, text="Refine Results...", command=self.open_tag_filter_window, state="disabled")
        self.refine_button.pack(side="left", padx=0, pady=10)
        self.export_button = ctk.CTkButton(controls_frame, text="Export Results to .txt", command=self.export_results)
        self.export_button.pack(side="left", padx=10, pady=10)
        self.merge_button = ctk.CTkButton(controls_frame, text="Merge Tags", command=self.merge_tags)
        self.merge_button.pack(side="left", padx=0, pady=10)
        self.merge_duplicates_checkbox = ctk.CTkCheckBox(controls_frame, text="Merge Duplicate Groups")
        self.merge_duplicates_checkbox.pack(side="left", padx=0, pady=10)
        self.merge_duplicates_checkbox.select()
        self.merge_similar_checkbox = ctk.CTkCheckBox(controls_frame, text="Merge Similar Groups")
        self.merge_similar_checkbox.pack(side="left", padx=10, pady=10)
        ctk.CTkLabel(controls_frame, text="Similarity (0.0-1.0):").pack(side="left", padx=(0,5), pady=10)
        self.similarity_entry = ctk.CTkEntry(controls_frame, width=60)
        self.similarity_entry.pack(side="left", padx=(0,10), pady=10)
        self.similarity_entry.insert(0, "0.9")

        self.results_textbox = ctk.CTkTextbox(self.results_frame, wrap="none")
        self.results_textbox.grid(row=1, column=0, padx=10, pady=(0, 10), sticky="nsew")
        self.results_textbox.insert("1.0", "Results will be shown here...")

        # --- Row 3: Status Bar ---
        self.status_bar = ctk.CTkFrame(self, height=30)
        self.status_bar.grid(row=3, column=0, padx=10, pady=(0, 10), sticky="ew")
        self.status_bar.grid_columnconfigure(0, weight=1)
        self.status_label = ctk.CTkLabel(self.status_bar, text="Ready")
        self.status_label.grid(row=0, column=0, padx=10, sticky="w")
        self.progress_bar = ctk.CTkProgressBar(self.status_bar)
        self.progress_bar.grid(row=0, column=1, padx=10, sticky="ew")
        self.progress_bar.set(0)

    def setup_filter_tabs(self):
        tab_configs = {
            "Partial Match": "default_partial_exclusion.txt",
            "Exact Match": "default_exact_exclusion.txt",
            "Exceptions": "default_exception_exclusion.txt"
        }
        for tab_name, filename in tab_configs.items():
            tab = self.filter_tab_view.tab(tab_name)
            tab.grid_columnconfigure(0, weight=1)
            tab.grid_rowconfigure(0, weight=1)
            textbox = ctk.CTkTextbox(tab, wrap="word")
            textbox.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")
            setattr(self, f"{tab_name.lower().replace(' ', '_')}_textbox", textbox)
            buttons_frame = ctk.CTkFrame(tab, fg_color="transparent")
            buttons_frame.grid(row=0, column=1, padx=5, pady=5, sticky="ns")
            ctk.CTkButton(buttons_frame, text="Import", width=80, command=lambda t=textbox: self.import_exclusion_list(t)).pack(pady=(0,5))
            ctk.CTkButton(buttons_frame, text="Export", width=80, command=lambda t=textbox: self.export_exclusion_list(t)).pack()
            ctk.CTkButton(buttons_frame, text="Set Default", width=80, command=lambda t=textbox, f=filename: self.export_as_default(t, f)).pack(pady=5)

        adv_tab = self.filter_tab_view.tab("Advanced")
        adv_tab.grid_columnconfigure(1, weight=1)
        ctk.CTkLabel(adv_tab, text="Max Words per Tag (0 to disable):").grid(row=0, column=0, padx=10, pady=10, sticky="w")
        self.max_words_entry = ctk.CTkEntry(adv_tab)
        self.max_words_entry.grid(row=0, column=1, padx=10, pady=10, sticky="ew")
        self.max_words_entry.insert(0, "5")
        ctk.CTkLabel(adv_tab, text="Min Tags per Group (0 to disable):").grid(row=1, column=0, padx=10, pady=10, sticky="w")
        self.min_tags_entry = ctk.CTkEntry(adv_tab)
        self.min_tags_entry.grid(row=1, column=1, padx=10, pady=10, sticky="ew")
        self.min_tags_entry.insert(0, "1")

    def load_default_exclusions(self):
        textboxes = {
            "default_partial_exclusion.txt": self.partial_match_textbox,
            "default_exact_exclusion.txt": self.exact_match_textbox,
            "default_exception_exclusion.txt": self.exceptions_textbox
        }
        for filename, textbox in textboxes.items():
            try:
                filepath = os.path.join(SCRIPT_DIR, filename)
                if os.path.exists(filepath):
                    with open(filepath, "r", encoding="utf-8") as f:
                        content = f.read()
                        textbox.delete("1.0", "end")
                        textbox.insert("1.0", content)
                else:
                    with open(filepath, "w") as f: pass
            except Exception as e:
                self.status_label.configure(text=f"Error loading {filename}: {e}")

    def open_tag_filter_window(self):
        if self.tag_filter_window is None or not self.tag_filter_window.winfo_exists():
            all_tags_flat = [tag for tag_set in self.unfiltered_results.values() for tag in tag_set]
            if not all_tags_flat:
                self.status_label.configure(text="No tags found to refine.")
                return
            partial_filters = {f.strip() for f in self.partial_match_textbox.get("1.0", "end-1c").split(',') if f.strip()}
            filtered_tags = [tag for tag in all_tags_flat if not any(p_filter in tag for p_filter in partial_filters)]
            tag_counts = collections.Counter(filtered_tags)
            if not tag_counts:
                self.status_label.configure(text="No tags remaining after applying partial exclusion filters.")
                return
            current_exact_tags = {f.strip() for f in self.exact_match_textbox.get("1.0", "end-1c").split(',') if f.strip()}
            self.tags_in_filter_window = set(tag_counts.keys())
            self.tag_filter_window = TagFilterWindow(self, tag_counts, self.update_results_from_filter, current_exact_tags)
        else:
            self.tag_filter_window.focus()

    def update_results_from_filter(self, newly_excluded_tags):
        previous_exact_tags = {tag.strip() for tag in self.exact_match_textbox.get("1.0", "end-1c").split(',') if tag.strip()}
        preserved_tags = previous_exact_tags - self.tags_in_filter_window
        final_excluded_tags = preserved_tags.union(newly_excluded_tags)
        self.exact_match_textbox.delete("1.0", "end")
        self.exact_match_textbox.insert("1.0", ", ".join(sorted(list(final_excluded_tags))))
        self.run_filter_on_results()

    def process_added_paths(self, paths, widget, recursive_checkbox=None):
        if isinstance(widget, ctk.CTkEntry):
            # For Entry (single file), just take the first valid file
            for f in paths:
                if os.path.isfile(f):
                    widget.delete(0, "end")
                    widget.insert(0, f)
                    break
        else:
            # For Textbox (multiple files)
            for f in paths:
                if os.path.isdir(f):
                    is_recursive = recursive_checkbox and recursive_checkbox.get() if recursive_checkbox else False
                    if is_recursive:
                        for root, _, files_in_dir in os.walk(f):
                            for file in files_in_dir:
                                if file.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                                    widget.insert("end", os.path.join(root, file) + "\n")
                    else:
                        for file in os.listdir(f):
                            if file.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                                widget.insert("end", os.path.join(f, file) + "\n")
                elif f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                    widget.insert("end", f + "\n")

    def handle_drop(self, event, widget, recursive_checkbox):
        files = self.tk.splitlist(event.data)
        self.process_added_paths(files, widget, recursive_checkbox)

    def import_exclusion_list(self, textbox):
        file_paths = filedialog.askopenfilenames(filetypes=[("Text files", "*.txt")])
        if not file_paths: return
        existing_tags = {tag.strip() for tag in textbox.get("1.0", "end-1c").split(',') if tag.strip()}
        new_tags = set()
        for file_path in file_paths:
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                    tags_from_file = {tag.strip() for tag in content.replace('\n', ',').split(',') if tag.strip()}
                    new_tags.update(tags_from_file)
            except Exception as e:
                self.status_label.configure(text=f"Error reading {os.path.basename(file_path)}: {e}")
                continue
        combined_tags = sorted(list(existing_tags.union(new_tags)))
        textbox.delete("1.0", "end")
        textbox.insert("1.0", ", ".join(combined_tags))

    def export_exclusion_list(self, textbox):
        file_path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")])
        if file_path:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(textbox.get("1.0", "end-1c"))

    def export_as_default(self, textbox, filename):
        file_path = os.path.join(SCRIPT_DIR, filename)
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(textbox.get("1.0", "end-1c"))
        self.status_label.configure(text=f"Saved {filename} as default.")

    def add_files(self, listbox):
        files = filedialog.askopenfilenames(title="Select image files", filetypes=[("Image files", "*.png *.jpg *.jpeg *.webp")])
        if files:
            self.process_added_paths(files, listbox)

    def select_comparison_file(self):
        file = filedialog.askopenfilename(title="Select a single image file", filetypes=[("Image files", "*.png *.jpg *.jpeg *.webp")])
        if file:
            self.comparison_entry.delete(0, "end")
            self.comparison_entry.insert(0, file)

    def add_folder(self, listbox, recursive_checkbox):
        folder = filedialog.askdirectory(title="Select a folder")
        if folder:
            self.process_added_paths([folder], listbox, recursive_checkbox)

    def clear_textbox(self, textbox):
        textbox.delete("1.0", "end")

    def clear_entry(self, entry):
        entry.delete(0, "end")

    def run_comparison_threaded(self):
        import threading
        thread = threading.Thread(target=self.run_comparison)
        thread.start()

    def run_comparison(self):
        self.run_button.configure(state="disabled")
        self.status_label.configure(text="Starting comparison...")
        self.progress_bar.set(0)
        self.progress_bar.start()
        self.refine_button.configure(state="disabled")
        self.update_idletasks()
        
        target_files = [line for line in self.target_listbox.get("1.0", "end-1c").splitlines() if line.strip()]
        comparison_file = self.comparison_entry.get().strip()

        if not target_files:
            self.results_textbox.delete("1.0", "end")
            self.results_textbox.insert("1.0", "Error: Please select target files.")
            self.status_label.configure(text="Error: No target files.")
            self.progress_bar.stop()
            self.run_button.configure(state="normal")
            return

        if not comparison_file:
            if len(target_files) < 2:
                self.results_textbox.delete("1.0", "end")
                self.results_textbox.insert("1.0", "Error: Select a comparison image or at least two target files for auto-comparison.")
                self.status_label.configure(text="Error: Insufficient files for auto-comparison.")
                self.progress_bar.stop()
                self.run_button.configure(state="normal")
                return
            comparison_file = random.choice(target_files)
            self.comparison_entry.delete(0, "end")
            self.comparison_entry.insert(0, f"{comparison_file}")
            self.status_label.configure(text=f"Auto-selected comparison: {os.path.basename(comparison_file)}")
            target_files.remove(comparison_file)
        
        start_time = time.time()
        failed_files = []
        try:
            self.status_label.configure(text="Processing comparison image...")
            self.update_idletasks()
            comparison_tags = core.extract_tags_from_file(comparison_file)

            if not comparison_tags:
                failed_files.append(f"[Comparison] {os.path.basename(comparison_file)}")

            self.unfiltered_results = {}
            total_files = len(target_files)
            self.status_label.configure(text=f"Processing {total_files} target images in parallel...")
            self.update_idletasks()

            with ProcessPoolExecutor() as executor:
                future_to_file = {executor.submit(core.extract_tags_from_file, file): file for file in target_files}
                
                for i, future in enumerate(as_completed(future_to_file)):
                    file = future_to_file[future]
                    try:
                        target_tags = future.result()
                        if not target_tags:
                            failed_files.append(os.path.basename(file))
                        else:
                            unique_tags = target_tags - comparison_tags
                            if unique_tags:
                                self.unfiltered_results[file] = unique_tags
                    except Exception as exc:
                        print(f'{file} generated an exception: {exc}')
                        failed_files.append(f"{os.path.basename(file)} (Error)")

            self.run_filter_on_results(failed_files)

        except Exception as e:
            self.status_label.configure(text=f"An error occurred: {e}")
            self.results_textbox.delete("1.0", "end")
            self.results_textbox.insert("1.0", f"An error occurred during comparison:\n\n{e}")
        finally:
            end_time = time.time()
            self.progress_bar.stop()
            self.progress_bar.set(1)
            status_msg = f"Comparison complete in {end_time - start_time:.2f} seconds."
            if failed_files:
                status_msg += f" ({len(failed_files)} files failed to read tags)"
            self.status_label.configure(text=status_msg)
            self.run_button.configure(state="normal")

    def run_filter_on_results(self, failed_files=None):
        self.status_label.configure(text="Applying filters...")
        self.update_idletasks()

        partial_filters = {f.strip() for f in self.partial_match_textbox.get("1.0", "end-1c").split(',') if f.strip()}
        exact_filters = {f.strip() for f in self.exact_match_textbox.get("1.0", "end-1c").split(',') if f.strip()}
        exception_filters = {f.strip() for f in self.exceptions_textbox.get("1.0", "end-1c").split(',') if f.strip()}
        
        filtered_results = {}
        for file, tags in self.unfiltered_results.items():
            temp_tags = tags.copy()
            tags_to_remove = set()
            for tag in temp_tags:
                if tag in exact_filters:
                    tags_to_remove.add(tag)
                elif any(p_filter in tag for p_filter in partial_filters):
                    tags_to_remove.add(tag)
            temp_tags -= tags_to_remove
            for tag in tags:
                if tag in exception_filters and tag not in temp_tags:
                    temp_tags.add(tag)
            if temp_tags:
                filtered_results[file] = temp_tags
        
        try:
            max_words_n = int(self.max_words_entry.get())
            if max_words_n > 0:
                max_words_filtered_results = {}
                for file, tags in filtered_results.items():
                    filtered_tags = {tag for tag in tags if len(tag.split()) <= max_words_n}
                    if filtered_tags:
                        max_words_filtered_results[file] = filtered_tags
                filtered_results = max_words_filtered_results
        except (ValueError, TypeError):
            self.status_label.configure(text="Warning: Invalid 'Max Words' value.")

        try:
            min_tags_n = int(self.min_tags_entry.get())
            if min_tags_n > 0:
                filtered_results = {file: tags for file, tags in filtered_results.items() if len(tags) >= min_tags_n}
        except (ValueError, TypeError):
            self.status_label.configure(text="Warning: Invalid 'Min Tags' value.")

        self.display_results(filtered_results, failed_files)
        if self.unfiltered_results:
            self.refine_button.configure(state="normal")
        self.status_label.configure(text="Comparison complete.")

    def display_results(self, results, failed_files=None):
        self.results_textbox.delete("1.0", "end")
        
        if failed_files:
            warning_text = "⚠️ WARNING: Failed to extract tags from the following files (No metadata found):\n"
            warning_text += ", ".join(failed_files[:20])
            if len(failed_files) > 20:
                warning_text += f"... and {len(failed_files) - 20} more."
            warning_text += "\n" + "-"*50 + "\n\n"
            self.results_textbox.insert("end", warning_text)

        if not results:
            self.results_textbox.insert("end", "No unique tags found after filtering.")
            return

        tag_sets = list(results.values())
        final_text = ""

        if self.merge_similar_checkbox.get():
            try:
                threshold = float(self.similarity_entry.get())
                if not 0.0 <= threshold <= 1.0:
                    raise ValueError("Threshold must be between 0.0 and 1.0")
                
                # For similarity merging, we use unique sets
                unique_frozen_sets = {frozenset(s) for s in tag_sets}
                unique_tag_sets = [set(fs) for fs in unique_frozen_sets]

                merged_lines = core.merge_tag_groups(unique_tag_sets, threshold)
                final_text = "\n".join(merged_lines)

            except (ValueError, TypeError) as e:
                self.status_label.configure(text=f"Error: Invalid similarity value. {e}")
                final_text = "Error: Invalid similarity value. Please enter a number between 0.0 and 1.0."
        
        elif self.merge_duplicates_checkbox.get():
            # This block now has access to tag_sets
            formatted_tag_lines = [", ".join(sorted(list(tags))) for tags in tag_sets]
            unique_lines = sorted(list(set(formatted_tag_lines)))
            final_text = "\n".join(unique_lines)
        
        else:
            # This block also has access to tag_sets
            formatted_tag_lines = [", ".join(sorted(list(tags))) for tags in tag_sets]
            final_text = "\n".join(sorted(formatted_tag_lines))
            
        self.results_textbox.insert("end", final_text)

    def export_results(self):
        results_text = self.results_textbox.get("1.0", "end-1c").strip()
        if not results_text or results_text.startswith("No unique tags"):
            self.status_label.configure(text="Nothing to export.")
            return
        file_path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text files", "*.txt")])
        if file_path:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(results_text)
            self.status_label.configure(text=f"Results exported to {os.path.basename(file_path)}")

    def merge_tags(self):
        # 1. Get tags from the results textbox
        results_text = self.results_textbox.get("1.0", "end-1c").strip()
        if not results_text or results_text.startswith("No unique tags"):
            self.status_label.configure(text="No results to merge.")
            return
        
        # Assumes tags are comma-separated and can be on multiple lines
        results_tags = {tag.strip() for line in results_text.split('\n') for tag in line.split(',') if tag.strip()}

        # 2. Prompt user to select a file with existing tags
        file_path = filedialog.askopenfilename(title="Select a .txt file with tags to merge", filetypes=[("Text files", "*.txt")])
        if not file_path:
            return

        # 3. Read tags from the selected file
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
                # Assumes tags can be comma-separated or on new lines
                existing_tags = {tag.strip() for tag in content.replace('\n', ',').split(',') if tag.strip()}
        except Exception as e:
            self.status_label.configure(text=f"Error reading file: {e}")
            return

        # 4. Merge and remove duplicates
        combined_tags = sorted(list(results_tags.union(existing_tags)))

        # 5. Prompt user to save the new list
        save_path = filedialog.asksaveasfilename(defaultextension=".txt", title="Save Merged Tags", filetypes=[("Text files", "*.txt")])
        if not save_path:
            return
            
        try:
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(", ".join(combined_tags))
            self.status_label.configure(text=f"Merged tags saved to {os.path.basename(save_path)}")
        except Exception as e:
            self.status_label.configure(text=f"Error saving file: {e}")

if __name__ == "__main__":
    # This is important for multiprocessing on Windows
    import multiprocessing
    multiprocessing.freeze_support()
    app = App()
    app.mainloop()