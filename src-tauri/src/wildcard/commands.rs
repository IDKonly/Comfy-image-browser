use std::collections::{HashSet, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{Window, Emitter, Manager};
use rayon::prelude::*;

use crate::db::DB;
use crate::metadata::read_metadata;
use super::types::WildcardFilter;
use super::filter::apply_filters;
use super::merger::merge_tag_groups;
use super::utils::{get_db_path_local, remove_unbalanced_braces};
use super::expansion::expand_single_line;

#[tauri::command]
pub fn get_tag_counts(app_handle: tauri::AppHandle, paths: Vec<String>) -> Result<HashMap<String, u32>, String> {
    let mut db_prompts = HashMap::new();
    if let Ok(db_path) = get_db_path_local(&app_handle) {
        if let Ok(db) = DB::open(&db_path) {
            if let Ok(images) = db.get_images_by_paths(&paths) {
                for img in images {
                    if let Some(p) = img.prompt {
                        db_prompts.insert(img.path, p);
                    }
                }
            }
        }
    }

    let counts: HashMap<String, u32> = paths.par_iter()
        .map(|path| {
            if let Some(prompt) = db_prompts.get(path) {
                return prompt.split(',')
                    .map(|s| remove_unbalanced_braces(s))
                    .filter(|s| !s.is_empty())
                    .collect::<Vec<_>>();
            }
            
            // Fallback for non-indexed images
            if let Ok(meta) = read_metadata(path) {
                if let Some(prompt) = meta.prompt {
                    return prompt.split(',')
                        .map(|s| remove_unbalanced_braces(s))
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>();
                }
            }
            Vec::new()
        })
        .flatten()
        .fold(HashMap::new, |mut acc, tag| {
            *acc.entry(tag).or_insert(0) += 1;
            acc
        })
        .reduce(HashMap::new, |mut acc1, acc2| {
            for (tag, count) in acc2 {
                *acc1.entry(tag).or_insert(0) += count;
            }
            acc1
        });
        
    Ok(counts)
}

#[tauri::command]
pub fn generate_wildcards(app_handle: tauri::AppHandle, window: Window, paths: Vec<String>, threshold: f32, filter: WildcardFilter) -> Result<Vec<String>, String> {
    let total = paths.len();
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 3 } else { filter.max_depth };
    
    let mut db_prompts = HashMap::new();
    if let Ok(db_path) = get_db_path_local(&app_handle) {
        if let Ok(db) = DB::open(&db_path) {
            if let Ok(images) = db.get_images_by_paths(&paths) {
                for img in images {
                    if let Some(p) = img.prompt {
                        db_prompts.insert(img.path, p);
                    }
                }
            }
        }
    }

    let tag_sets: Vec<HashSet<String>> = paths.par_iter()
        .map(|path| {
            let prompt_opt = if let Some(p) = db_prompts.get(path) {
                Some(p.clone())
            } else {
                read_metadata(path).ok().and_then(|m| m.prompt)
            };

            let res = if let Some(prompt) = prompt_opt {
                let tags: HashSet<String> = prompt.split(',')
                    .map(|s| remove_unbalanced_braces(s))
                    .filter(|s| !s.is_empty())
                    .collect();
                
                let filtered = apply_filters(tags, &filter);
                if filter.min_tags > 0 && filtered.len() < filter.min_tags as usize {
                    HashSet::new()
                } else {
                    filtered
                }
            } else {
                HashSet::new()
            };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c == total {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            
            res
        })
        .filter(|s| !s.is_empty())
        .collect();

    if filter.simple_mode {
        let mut unique_prompts: HashSet<String> = tag_sets.into_iter()
            .map(|s| {
                let mut sorted: Vec<_> = s.into_iter().collect();
                sorted.sort();
                sorted.join(", ")
            })
            .collect();
        let mut results: Vec<_> = unique_prompts.drain().collect();
        results.sort();
        return Ok(results);
    }

    let mut results = merge_tag_groups(tag_sets, threshold, max_depth);
    
    if filter.mix_mode {
        results = results.into_iter().map(|s| super::mix::mix_mode_transform(&s, filter.mix_depth)).collect();
    }
    
    Ok(results)
}

#[tauri::command]
pub fn compare_tags(app_handle: tauri::AppHandle, window: Window, target_paths: Vec<String>, comparison_paths: Vec<String>, threshold: f32, filter: WildcardFilter) -> Result<Vec<String>, String> {
    let total = target_paths.len() + comparison_paths.len();
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 3 } else { filter.max_depth };

    let mut db_prompts = HashMap::new();
    if let Ok(db_path) = get_db_path_local(&app_handle) {
        if let Ok(db) = DB::open(&db_path) {
            let all_paths: Vec<_> = target_paths.iter().chain(comparison_paths.iter()).cloned().collect();
            if let Ok(images) = db.get_images_by_paths(&all_paths) {
                for img in images {
                    if let Some(p) = img.prompt {
                        db_prompts.insert(img.path, p);
                    }
                }
            }
        }
    }

    let target_tags_sets: Vec<HashSet<String>> = target_paths.par_iter()
        .map(|path| {
            let prompt_opt = if let Some(p) = db_prompts.get(path) {
                Some(p.clone())
            } else {
                read_metadata(path).ok().and_then(|m| m.prompt)
            };

            let tags = if let Some(prompt) = prompt_opt {
                prompt.split(',').map(|s| remove_unbalanced_braces(s)).filter(|s| !s.is_empty()).collect::<HashSet<_>>()
            } else { HashSet::new() };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            tags
        })
        .collect();

    let comparison_tags: HashSet<String> = comparison_paths.par_iter()
        .flat_map(|path| {
            let prompt_opt = if let Some(p) = db_prompts.get(path) {
                Some(p.clone())
            } else {
                read_metadata(path).ok().and_then(|m| m.prompt)
            };

            let res = if let Some(prompt) = prompt_opt {
                prompt.split(',').map(|s| remove_unbalanced_braces(s)).filter(|s| !s.is_empty()).collect::<Vec<_>>()
            } else { Vec::new() };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c == total {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            res
        })
        .collect();

    let filtered_sets: Vec<HashSet<String>> = target_tags_sets.into_iter()
        .map(|s| {
            let diff: HashSet<_> = s.difference(&comparison_tags).cloned().collect();
            apply_filters(diff, &filter)
        })
        .filter(|s| !s.is_empty())
        .collect();
    
    if filter.simple_mode {
        let mut unique_prompts: HashSet<String> = filtered_sets.into_iter()
            .map(|s| {
                let mut sorted: Vec<_> = s.into_iter().collect();
                sorted.sort();
                sorted.join(", ")
            })
            .collect();
        let mut results: Vec<_> = unique_prompts.drain().collect();
        results.sort();
        return Ok(results);
    }
    
    let mut results = merge_tag_groups(filtered_sets, threshold, max_depth);

    if filter.mix_mode {
        results = results.into_iter().map(|s| super::mix::mix_mode_transform(&s, filter.mix_depth)).collect();
    }
    
    Ok(results)
}

#[tauri::command]
pub fn expand_wildcards(wildcards: Vec<String>) -> Result<Vec<String>, String> {
    let mut all_expanded = HashSet::new();
    for wildcard in wildcards {
        let expanded = expand_single_line(&wildcard);
        for ex in expanded { all_expanded.insert(ex); }
    }
    let mut result: Vec<_> = all_expanded.into_iter().collect();
    result.sort();
    Ok(result)
}

#[tauri::command]
pub fn save_to_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_filter_file(app_handle: tauri::AppHandle, name: String) -> Result<String, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push(&name);
    
    if !path.exists() {
        // Fallback to current dir for legacy/dev support
        let mut curr_path = std::env::current_dir().map_err(|e| e.to_string())?;
        curr_path.push(&name);
        if curr_path.exists() {
            return std::fs::read_to_string(curr_path).map_err(|e| e.to_string());
        }
        
        // Fallback to reference folder
        let mut ref_path = std::env::current_dir().map_err(|e| e.to_string())?;
        ref_path.push("reference");
        ref_path.push(&name);
        if ref_path.exists() {
            return std::fs::read_to_string(ref_path).map_err(|e| e.to_string());
        }
        
        return Ok(String::new());
    }
    
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_filter_file(app_handle: tauri::AppHandle, name: String, content: String) -> Result<(), String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    if !path.exists() {
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    path.push(&name);
    std::fs::write(path, content).map_err(|e| e.to_string())
}
