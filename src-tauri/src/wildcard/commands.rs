use std::collections::{HashSet, HashMap};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{Window, Emitter, Manager};
use rayon::prelude::*;

use crate::db::DbState;
use crate::metadata::read_metadata;
use crate::scanner::{validate_path, WatcherState};
use super::types::WildcardFilter;
use super::filter::{apply_filters, apply_filters_ordered};
use super::merger::merge_tag_groups;
use std::path::Path;
use std::time::UNIX_EPOCH;
use crate::metadata::ImageMetadata;
use crate::scanner::ImageInfo;
use super::utils::split_prompt_tags;
use super::expansion::expand_single_line;
use super::classifier::{classify_prompts, classify_registers, ClassifierSubset, WordGroup, ClassificationResult, RegisterDef};

// The corpus-scale classify commands are `(async)` so they run off the main
// thread: the UI stays responsive, and the frontend can genuinely overlap the
// independent subset/register/NSFW passes with Promise.all.
#[tauri::command(async)]
pub fn classify_prompts_command(
    lines: Vec<String>,
    subsets: Vec<ClassifierSubset>,
    word_groups: Vec<WordGroup>,
) -> Result<Vec<ClassificationResult>, String> {
    Ok(classify_prompts(lines, subsets, word_groups))
}

/// Assign each cleaned line to one scene register (priority waterfall). Returns
/// one register id per line; 0 when no registers are defined. Used by the
/// pipeline to partition output into per-register files and by the
/// TagClassifier preview to badge each line.
#[tauri::command(async)]
pub fn classify_registers_command(lines: Vec<String>, registers: Vec<RegisterDef>) -> Vec<u64> {
    classify_registers(lines, registers)
}

/// Judge each line NSFW/SFW with the shared `NsfwMatcher`, so the pipeline's
/// lane split uses the exact same semantics as the mobile SFW feed and the
/// `classify_nsfw` file-move action: whole-word + plural matching over the
/// positive-prompt text only. Returns one bool per input line (true = NSFW).
/// An empty `tags` list yields all-false (nothing is NSFW without keywords).
#[tauri::command(async)]
pub fn classify_nsfw_lines(lines: Vec<String>, tags: Vec<String>) -> Vec<bool> {
    let matcher = crate::nsfw::NsfwMatcher::new(&tags);
    if matcher.is_empty() {
        return vec![false; lines.len()];
    }
    lines
        .par_iter()
        .map(|l| matcher.is_nsfw(Some(l), None))
        .collect()
}

fn sync_newly_parsed_metadata(db_state: &tauri::State<'_, DbState>, paths_and_meta: &[(String, Option<ImageMetadata>)]) {
    let to_sync: Vec<(String, ImageMetadata)> = paths_and_meta.iter()
        .filter_map(|(path, meta_opt)| {
            meta_opt.as_ref().map(|m| (path.clone(), m.clone()))
        })
        .collect();

    if !to_sync.is_empty() {
        let mut state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_mut() {
            let batch_data: Vec<(ImageInfo, ImageMetadata)> = to_sync.into_iter().map(|(path, meta)| {
                let p = Path::new(&path);
                let mtime = p.metadata().ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs()).unwrap_or(0);
                let size = p.metadata().map(|m| m.len()).unwrap_or(0);
                
                (ImageInfo {
                    path: path.clone(),
                    name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                    mtime,
                    size,
                }, meta)
            }).collect();
            
            let refs: Vec<(&ImageInfo, ImageMetadata)> = batch_data.iter().map(|(info, meta)| (info, meta.clone())).collect();
            let _ = db.insert_images_batch(refs);
        }
    }
}

#[tauri::command]
pub fn get_tag_counts(
    db_state: tauri::State<'_, DbState>, 
    paths: Vec<String>
) -> Result<HashMap<String, u32>, String> {
    let mut db_prompts: HashMap<String, Option<String>> = HashMap::new();
    {
        let state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_ref() {
            if let Ok(images) = db.get_images_by_paths(&paths) {
                for img in images {
                    db_prompts.insert(img.path, img.prompt);
                }
            }
        }
    }

    let results: Vec<(String, Option<String>, Option<ImageMetadata>)> = paths.par_iter()
        .map(|path| {
            if let Some(db_opt) = db_prompts.get(path) {
                (path.clone(), db_opt.clone(), None)
            } else {
                let meta = read_metadata(path).ok();
                let p = meta.as_ref().and_then(|m| m.prompt.clone());
                (path.clone(), p, meta)
            }
        })
        .collect();

    // Sync newly parsed ones to DB
    let newly_parsed: Vec<(String, Option<ImageMetadata>)> = results.iter()
        .filter(|(path, _, _)| !db_prompts.contains_key(path))
        .map(|(path, _, meta)| (path.clone(), meta.clone()))
        .collect();
    sync_newly_parsed_metadata(&db_state, &newly_parsed);

    let counts: HashMap<String, u32> = results.par_iter()
        .map(|(_, prompt_opt, _)| {
            if let Some(prompt) = prompt_opt {
                split_prompt_tags(prompt)
            } else {
                Vec::new()
            }
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
pub fn generate_wildcards(
    db_state: tauri::State<'_, DbState>, 
    window: Window, 
    paths: Vec<String>, 
    prompts: Vec<String>, 
    threshold: f32, 
    filter: WildcardFilter
) -> Result<Vec<String>, String> {
    let total = paths.len() + prompts.len();
    if total == 0 { return Ok(Vec::new()); }
    
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 3 } else { filter.max_depth };
    
    // 1. Fetch prompts from DB/Metadata
    let mut db_prompts = HashMap::new();
    if !paths.is_empty() {
        let state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_ref() {
            if let Ok(images) = db.get_images_by_paths(&paths) {
                for img in images {
                    if let Some(p) = img.prompt {
                        db_prompts.insert(img.path, p);
                    }
                }
            }
        }
    }

    // PRESERVE ORDER PATH: maintain input order, skip HashSet/merging
    if filter.preserve_order {
        let mut ordered: Vec<String> = Vec::with_capacity(total);

        for path in &paths {
            let prompt_opt = db_prompts.get(path).cloned().or_else(|| {
                read_metadata(path).ok().and_then(|m| m.prompt)
            });
            if let Some(prompt) = prompt_opt {
                let mut seen = HashSet::new();
                let tags: Vec<String> = split_prompt_tags(&prompt)
                    .into_iter()
                    .filter(|s| seen.insert(s.clone()))
                    .collect();
                let filtered = apply_filters_ordered(tags, &filter);
                if (filter.min_tags == 0 || filtered.len() >= filter.min_tags as usize) && !filtered.is_empty() {
                    ordered.push(filtered.join(", "));
                }
            }
        }

        for prompt in &prompts {
            let mut seen = HashSet::new();
            let tags: Vec<String> = split_prompt_tags(prompt)
                .into_iter()
                .filter(|s| seen.insert(s.clone()))
                .collect();
            let filtered = apply_filters_ordered(tags, &filter);
            if (filter.min_tags == 0 || filtered.len() >= filter.min_tags as usize) && !filtered.is_empty() {
                ordered.push(filtered.join(", "));
            }
        }

        let _ = window.emit("workshop-progress", 100.0f32);
        return Ok(ordered);
    }

    // 2. Process Image Paths (with Sync logic)
    let results: Vec<(String, Option<String>, Option<ImageMetadata>)> = paths.par_iter()
        .map(|path| {
            if let Some(p) = db_prompts.get(path) {
                (path.clone(), Some(p.clone()), None)
            } else {
                let meta = read_metadata(path).ok();
                let p = meta.as_ref().and_then(|m| m.prompt.clone());
                (path.clone(), p, meta)
            }
        })
        .collect();

    // Sync newly parsed ones to DB
    let newly_parsed: Vec<(String, Option<ImageMetadata>)> = results.iter()
        .filter(|(path, _, _)| !db_prompts.contains_key(path))
        .map(|(path, _, meta)| (path.clone(), meta.clone()))
        .collect();
    sync_newly_parsed_metadata(&db_state, &newly_parsed);

    let mut tag_sets: Vec<HashSet<String>> = results.into_iter()
        .map(|(_, prompt_opt, _)| {
            let res = if let Some(prompt) = prompt_opt {
                let tags: HashSet<String> = split_prompt_tags(&prompt).into_iter().collect();

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

    // 3. Process Direct Text Prompts
    let text_tag_sets: Vec<HashSet<String>> = prompts.par_iter()
        .map(|prompt| {
            let tags: HashSet<String> = split_prompt_tags(prompt).into_iter().collect();

            let filtered = apply_filters(tags, &filter);
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c == total {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }

            if filter.min_tags > 0 && filtered.len() < filter.min_tags as usize {
                HashSet::new()
            } else {
                filtered
            }
        })
        .filter(|s| !s.is_empty())
        .collect();

    tag_sets.extend(text_tag_sets);

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
        results = results.into_iter().map(|s| super::mix::mix_mode_transform(&s, filter.mix_depth, filter.mix_tandem_min_branches, filter.mix_tandem_ratio)).collect();
    }
    
    Ok(results)
}

#[tauri::command]
pub fn compare_tags(
    db_state: tauri::State<'_, DbState>, 
    window: Window, 
    target_paths: Vec<String>, 
    target_prompts: Vec<String>, 
    comparison_paths: Vec<String>, 
    comparison_prompts: Vec<String>, 
    threshold: f32, 
    filter: WildcardFilter
) -> Result<Vec<String>, String> {
    let total = target_paths.len() + target_prompts.len() + comparison_paths.len() + comparison_prompts.len();
    if target_paths.is_empty() && target_prompts.is_empty() { return Ok(Vec::new()); }
    
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 3 } else { filter.max_depth };

    // 1. Fetch prompts for all paths
    let mut db_prompts = HashMap::new();
    if !target_paths.is_empty() || !comparison_paths.is_empty() {
        let state = db_state.0.lock().unwrap();
        if let Some(db) = state.as_ref() {
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

    // 2. Build Target Tag Sets (Images + Text)
    let target_results: Vec<(String, Option<String>, Option<ImageMetadata>)> = target_paths.par_iter()
        .map(|path| {
            if let Some(p) = db_prompts.get(path) {
                (path.clone(), Some(p.clone()), None)
            } else {
                let meta = read_metadata(path).ok();
                let p = meta.as_ref().and_then(|m| m.prompt.clone());
                (path.clone(), p, meta)
            }
        })
        .collect();

    // Build Comparison/Subtractive Results
    let comparison_results: Vec<(String, Option<String>, Option<ImageMetadata>)> = comparison_paths.par_iter()
        .map(|path| {
            if let Some(p) = db_prompts.get(path) {
                (path.clone(), Some(p.clone()), None)
            } else {
                let meta = read_metadata(path).ok();
                let p = meta.as_ref().and_then(|m| m.prompt.clone());
                (path.clone(), p, meta)
            }
        })
        .collect();

    // Sync newly parsed ones to DB (Target + Comparison)
    let mut newly_parsed: Vec<(String, Option<ImageMetadata>)> = target_results.iter()
        .filter(|(path, _, _)| !db_prompts.contains_key(path))
        .map(|(path, _, meta)| (path.clone(), meta.clone()))
        .collect();
    
    let comparison_newly_parsed: Vec<(String, Option<ImageMetadata>)> = comparison_results.iter()
        .filter(|(path, _, _)| !db_prompts.contains_key(path))
        .map(|(path, _, meta)| (path.clone(), meta.clone()))
        .collect();
    
    newly_parsed.extend(comparison_newly_parsed);
    sync_newly_parsed_metadata(&db_state, &newly_parsed);

    let mut target_tags_sets: Vec<HashSet<String>> = target_results.into_iter()
        .map(|(_, prompt_opt, _)| {
            let tags = if let Some(prompt) = prompt_opt {
                split_prompt_tags(&prompt).into_iter().collect::<HashSet<_>>()
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

    let text_target_sets: Vec<HashSet<String>> = target_prompts.par_iter()
        .map(|prompt| {
            let tags = split_prompt_tags(prompt).into_iter().collect::<HashSet<_>>();
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
    
    target_tags_sets.extend(text_target_sets);

    // 3. Build Comparison/Subtractive Tags (Images + Text)
    let mut comparison_tags: HashSet<String> = comparison_results.into_iter()
        .flat_map(|(_, prompt_opt, _)| {
            let res = if let Some(prompt) = prompt_opt {
                split_prompt_tags(&prompt).into_iter().collect::<Vec<_>>()
            } else { Vec::new() };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            res
        })
        .collect();

    let text_comparison_tags: HashSet<String> = comparison_prompts.par_iter()
        .flat_map(|prompt| {
            let res = split_prompt_tags(prompt).into_iter().collect::<Vec<_>>();
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

    comparison_tags.extend(text_comparison_tags);

    // 4. Filter and Merge
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
        results = results.into_iter().map(|s| super::mix::mix_mode_transform(&s, filter.mix_depth, filter.mix_tandem_min_branches, filter.mix_tandem_ratio)).collect();
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
pub fn save_to_file(
    watcher_state: tauri::State<'_, WatcherState>,
    path: String,
    content: String
) -> Result<(), String> {
    validate_path(&path, &watcher_state)?;
    std::fs::write(path, content).map_err(|e| e.to_string())
}

/// Pipeline output save — no watcher-path restriction because the output folder
/// was explicitly selected by the user via a folder picker dialog.
#[tauri::command]
pub fn pipeline_save_file(path: String, content: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(p, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_filter_file(app_handle: tauri::AppHandle, name: String) -> Result<String, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push(&name);
    
    if !path.exists() {
        let mut curr_path = std::env::current_dir().map_err(|e| e.to_string())?;
        curr_path.push(&name);
        if curr_path.exists() {
            return std::fs::read_to_string(curr_path).map_err(|e| e.to_string());
        }
        
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classify_nsfw_lines_flags_per_line() {
        let lines = vec![
            "1girl, solo, blue dress, outdoors".to_string(),
            "1girl, sex, indoors".to_string(),
            "exposed nipples, blush".to_string(),
        ];
        let tags = vec!["sex".to_string(), "nipple".to_string()];
        let flags = classify_nsfw_lines(lines, tags);
        assert_eq!(flags, vec![false, true, true]);
    }

    #[test]
    fn classify_nsfw_lines_empty_tags_all_false() {
        let lines = vec!["sex".to_string(), "nude".to_string()];
        let flags = classify_nsfw_lines(lines, vec![]);
        assert_eq!(flags, vec![false, false]);
    }
}
