use std::collections::{HashSet, HashMap};
use serde::{Serialize, Deserialize};
use crate::metadata::read_metadata;
use rayon::prelude::*;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use tauri::{Window, Emitter, Manager};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct WildcardFilter {
    pub partial_match: Vec<String>,
    pub exact_match: Vec<String>,
    pub exceptions: Vec<String>,
    pub max_words: u32,
    pub min_tags: u32,
    pub max_depth: u32,
}

fn apply_filters(tags: HashSet<String>, filter: &WildcardFilter) -> HashSet<String> {
    let mut filtered_tags = HashSet::new();
    
    // Optimization: Use HashSet for O(1) lookups during filtering
    let exact_set: HashSet<_> = filter.exact_match.iter().collect();
    let exception_set: HashSet<_> = filter.exceptions.iter().collect();
    
    for tag in tags {
        let mut should_exclude = false;
        
        if exact_set.contains(&tag) {
            should_exclude = true;
        }
        
        if !should_exclude {
            for p in &filter.partial_match {
                if !p.is_empty() && tag.contains(p) {
                    should_exclude = true;
                    break;
                }
            }
        }
        
        if !should_exclude && filter.max_words > 0 {
            if tag.split_whitespace().count() > filter.max_words as usize {
                should_exclude = true;
            }
        }
        
        if should_exclude && exception_set.contains(&tag) {
            should_exclude = false;
        }
        
        if !should_exclude {
            filtered_tags.insert(tag);
        }
    }
    
    filtered_tags
}

#[tauri::command]
pub fn get_tag_counts(paths: Vec<String>) -> Result<HashMap<String, u32>, String> {
    let counts: HashMap<String, u32> = paths.par_iter()
        .map(|path| {
            if let Ok(meta) = read_metadata(path) {
                if let Some(prompt) = meta.prompt {
                    return prompt.split(',')
                        .map(|s| s.trim().to_string())
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
pub fn generate_wildcards(window: Window, paths: Vec<String>, threshold: f32, filter: WildcardFilter) -> Result<Vec<String>, String> {
    let total = paths.len();
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 5 } else { filter.max_depth };
    
    let tag_sets: Vec<HashSet<String>> = paths.par_iter()
        .map(|path| {
            let res = if let Ok(meta) = read_metadata(path) {
                if let Some(prompt) = meta.prompt {
                    let tags: HashSet<String> = prompt.split(',')
                        .map(|s| s.trim().to_string())
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
                }
            } else {
                HashSet::new()
            };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            
            // Throttle: Emit only when percentage increases or every 100 items for huge sets
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c % 100 == 0 || c == total {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            
            res
        })
        .filter(|s| !s.is_empty())
        .collect();

    Ok(merge_tag_groups(tag_sets, threshold, max_depth))
}

#[tauri::command]
pub fn compare_tags(window: Window, target_paths: Vec<String>, comparison_paths: Vec<String>, threshold: f32, filter: WildcardFilter) -> Result<Vec<String>, String> {
    let total = target_paths.len() + comparison_paths.len();
    let current = Arc::new(AtomicUsize::new(0));
    let last_emitted_percent = Arc::new(AtomicUsize::new(0));
    let max_depth = if filter.max_depth == 0 { 5 } else { filter.max_depth };

    let target_tags_sets: Vec<HashSet<String>> = target_paths.par_iter()
        .map(|path| {
            let tags = if let Ok(meta) = read_metadata(path) {
                if let Some(prompt) = meta.prompt {
                    prompt.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect::<HashSet<_>>()
                } else { HashSet::new() }
            } else { HashSet::new() };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c % 100 == 0 {
                last_emitted_percent.store(percent, Ordering::SeqCst);
                let _ = window.emit("workshop-progress", percent as f32);
            }
            tags
        })
        .collect();

    let comparison_tags: HashSet<String> = comparison_paths.par_iter()
        .flat_map(|path| {
            let res = if let Ok(meta) = read_metadata(path) {
                if let Some(prompt) = meta.prompt {
                    prompt.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect::<Vec<_>>()
                } else { Vec::new() }
            } else { Vec::new() };
            
            let c = current.fetch_add(1, Ordering::SeqCst) + 1;
            let percent = (c * 100 / total) as usize;
            let last = last_emitted_percent.load(Ordering::SeqCst);
            if percent > last || c % 100 == 0 || c == total {
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
    
    Ok(merge_tag_groups(filtered_sets, threshold, max_depth))
}

fn calculate_jaccard_similarity_optimized(set1: &[u32], set2: &[u32]) -> f32 {
    if set1.is_empty() && set2.is_empty() { return 1.0; }
    if set1.is_empty() || set2.is_empty() { return 0.0; }
    
    let mut intersect = 0;
    let mut i = 0;
    let mut j = 0;
    
    while i < set1.len() && j < set2.len() {
        if set1[i] == set2[j] {
            intersect += 1;
            i += 1;
            j += 1;
        } else if set1[i] < set2[j] {
            i += 1;
        } else {
            j += 1;
        }
    }
    
    let union = set1.len() + set2.len() - intersect;
    intersect as f32 / union as f32
}

fn find_connected_components(num_nodes: usize, edges: &[(usize, usize)]) -> Vec<Vec<usize>> {
    let mut adj = vec![Vec::new(); num_nodes];
    for &(u, v) in edges {
        adj[u].push(v);
        adj[v].push(u);
    }

    let mut visited = vec![false; num_nodes];
    let mut components = Vec::new();

    for i in 0..num_nodes {
        if !visited[i] {
            let mut component = Vec::new();
            let mut stack = vec![i];
            visited[i] = true;

            while let Some(u) = stack.pop() {
                component.push(u);
                for &v in &adj[u] {
                    if !visited[v] {
                        visited[v] = true;
                        stack.push(v);
                    }
                }
            }
            components.push(component);
        }
    }
    components
}

fn recursive_merge(tag_sets: &[HashSet<String>], threshold: f32, current_depth: u32, max_depth: u32) -> String {
    if tag_sets.is_empty() { return String::new(); }
    if tag_sets.len() == 1 {
        let mut sorted: Vec<_> = tag_sets[0].iter().cloned().collect();
        sorted.sort();
        return sorted.join(", ");
    }

    if current_depth >= max_depth {
        let mut parts: Vec<_> = tag_sets.iter().map(|s| {
            let mut sorted: Vec<_> = s.iter().cloned().collect();
            sorted.sort();
            sorted.join(", ")
        }).collect();
        parts.sort();
        return parts.join("|");
    }

    // Optimization: Parallel intersection for common base
    let common_base: HashSet<String> = if tag_sets.len() > 1 {
        tag_sets[1..].par_iter()
            .fold(|| tag_sets[0].clone(), |mut acc, s| {
                acc.retain(|tag| s.contains(tag));
                acc
            })
            .reduce(|| tag_sets[0].clone(), |mut a, b| {
                a.retain(|tag| b.contains(tag));
                a
            })
    } else {
        tag_sets[0].clone()
    };

    if common_base.is_empty() && tag_sets.len() > 1 {
        let mut parts: Vec<_> = tag_sets.iter().map(|s| {
            let mut sorted: Vec<_> = s.iter().cloned().collect();
            sorted.sort();
            sorted.join(", ")
        }).collect();
        parts.sort();
        return parts.join("|");
    }

    let mut sorted_base: Vec<_> = common_base.iter().cloned().collect();
    sorted_base.sort();
    let base_str = sorted_base.join(", ");

    // Optimization: Parallel difference calculation
    let difference_sets: Vec<HashSet<String>> = tag_sets.par_iter()
        .map(|s| s.difference(&common_base).cloned().collect())
        .collect();

    if difference_sets.iter().all(|s| s.is_empty()) { return base_str; }

    let non_empty_diffs: Vec<HashSet<String>> = difference_sets.into_iter().filter(|s| !s.is_empty()).collect();
    let merged_diffs = merge_tag_groups(non_empty_diffs, threshold, max_depth - current_depth);

    let mut diff_parts = merged_diffs;
    if tag_sets.iter().any(|s| (s.len() - common_base.len()) == 0) {
        diff_parts.push(String::new());
    }

    diff_parts.sort_by(|a, b| {
        if a.is_empty() { std::cmp::Ordering::Less }
        else if b.is_empty() { std::cmp::Ordering::Greater }
        else { a.cmp(b) }
    });

    let processed_diffs: Vec<String> = if !base_str.is_empty() {
        diff_parts.into_iter().map(|d| if d.is_empty() { String::new() } else { format!(", {}", d) }).collect()
    } else {
        diff_parts
    };

    let diff_str = processed_diffs.join("|");
    if base_str.is_empty() { format!("{{{}}}", diff_str) }
    else { format!("{}{{{}}}", base_str, diff_str) }
}

pub fn merge_tag_groups(tag_groups: Vec<HashSet<String>>, threshold: f32, max_depth: u32) -> Vec<String> {
    if tag_groups.is_empty() { return Vec::new(); }
    let num_sets = tag_groups.len();
    if num_sets == 1 {
        let mut sorted: Vec<_> = tag_groups[0].iter().cloned().collect();
        sorted.sort();
        return vec![sorted.join(", ")];
    }

    // Optimization: Parallel tag collection and sorting
    let mut all_tags: Vec<_> = tag_groups.par_iter()
        .flat_map(|s| s.par_iter().cloned())
        .collect();
    all_tags.par_sort();
    all_tags.dedup();
    
    let tag_to_id: HashMap<String, u32> = all_tags.into_iter().enumerate().map(|(i, t)| (t, i as u32)).collect();
    
    // Optimization: Parallel ID set construction
    let id_sets: Vec<Vec<u32>> = tag_groups.par_iter().map(|s| {
        let mut ids: Vec<_> = s.iter().map(|t| *tag_to_id.get(t).unwrap()).collect();
        ids.sort();
        ids
    }).collect();

    // Parallel similarity graph construction
    let edges: Vec<(usize, usize)> = (0..num_sets).into_par_iter()
        .flat_map(|i| {
            let mut local_edges = Vec::new();
            for j in i + 1..num_sets {
                if calculate_jaccard_similarity_optimized(&id_sets[i], &id_sets[j]) >= threshold {
                    local_edges.push((i, j));
                }
            }
            local_edges
        })
        .collect();

    let components = find_connected_components(num_sets, &edges);
    
    // Process components into (HashSet, String) pairs for similarity sorting
    let mut component_results: Vec<(HashSet<String>, String)> = components.into_par_iter().map(|component| {
        let component_sets: Vec<_> = component.iter().map(|&i| tag_groups[i].clone()).collect();
        let mut all_component_tags = HashSet::new();
        for s in &component_sets {
            for tag in s {
                all_component_tags.insert(tag.clone());
            }
        }
        (all_component_tags, recursive_merge(&component_sets, threshold, 0, max_depth))
    }).collect();

    if component_results.is_empty() { return Vec::new(); }

    // Similarity-based sort (Greedy Nearest Neighbor)
    // Start with the largest cluster for better stability
    component_results.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    
    let mut final_results = Vec::new();
    let mut current = component_results.remove(0);
    final_results.push(current.1);

    while !component_results.is_empty() {
        let mut best_idx = 0;
        let mut best_sim = -1.0;

        for (i, (tags, _)) in component_results.iter().enumerate() {
            let intersect = current.0.intersection(tags).count();
            let union = current.0.union(tags).count();
            let sim = intersect as f32 / union as f32;
            if sim > best_sim {
                best_sim = sim;
                best_idx = i;
            }
        }
        
        current = component_results.remove(best_idx);
        final_results.push(current.1);
    }

    final_results
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

fn expand_single_line(text: &str) -> Vec<String> {
    let mut variations = vec![text.to_string()];
    loop {
        let mut new_variations = Vec::new();
        let mut has_expansion = false;
        for var in variations {
            if let Some((start, end)) = find_innermost_braces(&var) {
                has_expansion = true;
                let prefix = &var[..start];
                let suffix = &var[end + 1..];
                let content = &var[start + 1..end];
                let options: Vec<&str> = content.split('|').collect();
                for opt in options {
                    new_variations.push(format!("{}{}{}", prefix, opt, suffix));
                }
            } else { new_variations.push(var); }
        }
        if !has_expansion { variations = new_variations; break; }
        variations = new_variations;
    }
    variations.into_iter().map(|v| {
        let parts: Vec<_> = v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect();
        parts.join(", ")
    }).collect()
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

fn find_innermost_braces(s: &str) -> Option<(usize, usize)> {
    let mut last_open = None;
    for (i, c) in s.char_indices() {
        if c == '{' { last_open = Some(i); }
        else if c == '}' { if let Some(open) = last_open { return Some((open, i)); } }
    }
    None
}
