# Bug Fix Report: Search Results (Xbox & Duplicates)

## Issue 1: Broken Image Icons (Xbox)
- **Cause**: Moving or deleting images (via Keep/Trash/Auto-Classify) didn't update the SQLite database. The search function returned old paths that no longer existed on disk.
- **Fix**: 
  - Updated all file operation commands in `file_ops.rs` to sync changes with the database (update path on move, delete on removal).
  - Added a background cleanup step in `scanner::scan_directory` to remove stale DB entries for any scanned folder.

## Issue 2: Duplicate Images in Recursive Mode
- **Cause 1**: The recursive SQL query used `folder LIKE 'folder%'`, which matched unintended folders with similar prefixes (e.g., `images_backup` matching when searching `images`).
- **Cause 2**: Moving files created new DB entries when re-scanned, but the old entries remained (since the path changed), leading to two entries for the same image.
- **Fix**:
  - Corrected SQL query to `(folder = ?1 OR folder LIKE ?1 || '/%')` to ensure only actual subfolders are matched.
  - Scanner cleanup now removes old entries for files that were moved away, preventing duplicates.

## Additional Improvements
- Consistent folder path normalization (trimming trailing slashes and using forward slashes) across all database methods.
- Fixed a race condition in the UI where reloading used stale state instead of new scan results.
