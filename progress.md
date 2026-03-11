# Progress - Comfy Image Browser Optimization & Features

## Goals
1. **Multi-threading Optimization**: Identify and apply multi-threading to performance bottlenecks (scanning, thumbnails, metadata).
2. **Filter Merging**: Develop a feature to merge filters via text file or string input.
3. **Bug Fix**: Resolve the issue where the tag filter save button causes the app to close.
4. **Undo Functionality (Ctrl+Z)**: Implement undo for image classification (moving to `_keep`, `_trash`).

## Status
- [x] Multi-threading Optimization
- [x] Filter Merging
- [x] Tag Filter Bug Fix
- [x] Undo (Ctrl+Z) Implementation

## Details
### 1. Multi-threading Optimization
- [x] Parallel metadata reading in `scanner.rs` background thread using `rayon`.
- [x] Batch insertion into DB to minimize lock contention.

### 2. Filter Merging
- [x] Added `MergeFilterModal` in `WildcardTools.tsx`.
- [x] Supports merging tags from clipboard or text input (comma/newline separated).

### 3. Tag Filter Bug Fix
- [x] Fixed `write_filter_file` crash by using `app_data_dir` instead of the current directory (permission issues).
- [x] Added `tauri::Manager` for path resolution.

### 4. Undo (Ctrl+Z)
- [x] Implemented `UndoAction` stack in `useAppStore.ts`.
- [x] Added `undo_move` command in `file_ops.rs` to revert renames.
- [x] Added global `Ctrl+Z` listener in `App.tsx`.

### 6. New Features & Integration
- [x] **Simple Wildcard Mode**: Added option to skip recursive compression and get raw unique filtered prompts.
- [x] **Twitter (X) Integration**: 
    - [x] Shortcut ('T') and Inspector button for quick sharing.
    - [x] Automated tag picking from positive prompt based on keywords.
    - [x] Clipboard automation (auto-copy text and image).
    - [x] Configurable templates and keyword filters.


