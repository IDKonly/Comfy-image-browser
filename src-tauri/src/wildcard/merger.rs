use std::collections::{HashSet, HashMap};
use rayon::prelude::*;
use super::utils::{calculate_jaccard_similarity_optimized, find_connected_components};

/// Merges a list of tag sets into a single wildcard string using a recursive factorization approach.
pub fn recursive_merge(tag_sets: &[HashSet<String>], threshold: f32, current_depth: u32, max_depth: u32) -> String {
    if tag_sets.is_empty() { return String::new(); }
    
    // Convert to ID-based representation once at the top level for performance
    let mut all_tags: Vec<String> = tag_sets.iter()
        .flat_map(|s| s.iter().cloned())
        .collect();
    all_tags.sort();
    all_tags.dedup();
    
    let tag_to_id: HashMap<String, u32> = all_tags.iter().cloned().enumerate()
        .map(|(i, t)| (t, i as u32)).collect();
    let id_to_tag: HashMap<u32, String> = all_tags.into_iter().enumerate()
        .map(|(i, t)| (i as u32, t)).collect();
        
    let id_sets: Vec<HashSet<u32>> = tag_sets.iter().map(|s| {
        s.iter().map(|t| *tag_to_id.get(t).unwrap()).collect()
    }).collect();
    
    recursive_merge_id(&id_sets, threshold, current_depth, max_depth, &id_to_tag)
}

/// Core recursive merge logic using tag IDs (u32) to avoid expensive string operations and cloning.
fn recursive_merge_id(tag_sets: &[HashSet<u32>], threshold: f32, current_depth: u32, max_depth: u32, id_to_tag: &HashMap<u32, String>) -> String {
    if tag_sets.is_empty() { return String::new(); }
    if tag_sets.len() == 1 {
        let mut sorted: Vec<_> = tag_sets[0].iter().cloned().collect();
        sorted.sort();
        return sorted.iter().map(|id| id_to_tag.get(id).unwrap().as_str()).collect::<Vec<_>>().join(", ");
    }

    // 1. Extract Universal Common Base (Tags present in ALL sets)
    let mut universal_base = tag_sets[0].clone();
    for s in &tag_sets[1..] {
        universal_base.retain(|tag| s.contains(tag));
    }

    let mut sorted_base: Vec<_> = universal_base.iter().cloned().collect();
    sorted_base.sort();
    let base_str = sorted_base.iter().map(|id| id_to_tag.get(id).unwrap().as_str()).collect::<Vec<_>>().join(", ");

    // Calculate remainders after removing universal base
    let mut pool: Vec<HashSet<u32>> = tag_sets.iter()
        .map(|s| s.difference(&universal_base).cloned().collect())
        .collect();

    if pool.iter().all(|s| s.is_empty()) {
        return base_str;
    }

    // 2. Stop recursion if max depth reached
    if current_depth >= max_depth {
        let mut parts: Vec<String> = pool.iter().map(|s| {
            let mut sorted: Vec<_> = s.iter().cloned().collect();
            sorted.sort();
            sorted.iter().map(|id| id_to_tag.get(id).unwrap().as_str()).collect::<Vec<_>>().join(", ")
        }).collect();
        parts.sort();
        parts.dedup();
        
        let has_empty = parts.iter().any(|a| a.is_empty());
        let mut final_parts = Vec::new();
        
        if has_empty {
            final_parts.push(" ".to_string()); // Use a space to avoid "{|..." and ensure correct expansion
        }
        
        for p in parts {
            if !p.is_empty() {
                if base_str.is_empty() {
                    final_parts.push(p);
                } else {
                    final_parts.push(format!(", {}", p));
                }
            }
        }
        
        let diff_str = final_parts.join("|");
        
        return if base_str.is_empty() {
            if final_parts.len() == 1 {
                final_parts[0].clone()
            } else {
                format!("{{{}}}", diff_str)
            }
        } else {
            if final_parts.is_empty() {
                base_str
            } else {
                format!("{}{{{}}}", base_str, diff_str)
            }
        };
    }

    // 3. Multi-way Factorization
    let mut factor_groups = Vec::new();
    
    // Optimized candidate selection: find frequencies once
    let mut tag_freqs = HashMap::new();
    for s in &pool {
        for &tag_id in s {
            *tag_freqs.entry(tag_id).or_insert(0) += 1;
        }
    }
    
    // Rank candidates by "potential compression gain"
    let mut candidates: Vec<_> = tag_freqs.into_iter()
        .filter(|(_, count)| *count >= 2)
        .map(|(id, count)| {
            let val = (count - 1) * (id_to_tag.get(&id).unwrap().len() + 2);
            (id, val)
        })
        .collect();
    candidates.sort_by_key(|&(_, val)| std::cmp::Reverse(val));

    let mut used_in_pool = vec![false; pool.len()];
    let mut processed_sets_count = 0;

    for (tag_id, _) in candidates {
        if processed_sets_count >= pool.len() { break; }
        
        let mut group_indices = Vec::new();
        for (idx, used) in used_in_pool.iter().enumerate() {
            if !*used && pool[idx].contains(&tag_id) {
                group_indices.push(idx);
            }
        }

        if group_indices.len() < 2 { continue; }

        let mut group_sets = Vec::new();
        for &idx in &group_indices {
            // 태그를 수동으로 제거하지 않고 그대로 그룹에 넣습니다. 
            // 다음 재귀 단계에서 universal_base로 자동 추출되어 쉼표가 완벽하게 포맷팅됩니다.
            group_sets.push(pool[idx].clone());
            used_in_pool[idx] = true;
            processed_sets_count += 1;
        }

        factor_groups.push(group_sets);
    }

    // Collect alternatives (factorized groups + remaining individual sets)
    let mut alternatives = Vec::new();
    
    for group_sets in factor_groups {
        let inner = recursive_merge_id(&group_sets, threshold, current_depth + 1, max_depth, id_to_tag);
        if !inner.is_empty() {
            alternatives.push(inner);
        }
    }

    // Add sets that couldn't be factorized
    for (idx, is_used) in used_in_pool.iter().enumerate() {
        if !*is_used {
            let mut sorted: Vec<_> = pool[idx].iter().cloned().collect();
            sorted.sort();
            alternatives.push(sorted.iter().map(|id| id_to_tag.get(id).unwrap().as_str()).collect::<Vec<_>>().join(", "));
        }
    }

    alternatives.sort();
    alternatives.dedup();
    
    // Final formatting with leading commas inside brackets for ComfyUI compatibility: A{, B|, C}
    let has_empty = alternatives.iter().any(|a| a.is_empty());
    let mut final_parts = Vec::new();
    
    if has_empty {
        final_parts.push(" ".to_string()); // Use a space to avoid "{|..." and ensure correct expansion
    }
    
    for a in alternatives {
        if !a.is_empty() {
            if base_str.is_empty() {
                // If no base, don't add leading comma to the FIRST element of expansion
                final_parts.push(a);
            } else {
                // If base exists, we MUST add a comma to separate it from the base
                final_parts.push(format!(", {}", a));
            }
        }
    }
    
    let diff_str = final_parts.join("|");
    
    if base_str.is_empty() {
        if final_parts.len() == 1 {
            final_parts[0].clone()
        } else {
            format!("{{{}}}", diff_str)
        }
    } else {
        if final_parts.is_empty() {
            base_str
        } else {
            // This produces "A{, B|, C}" when has_empty is true
            format!("{}{{{}}}", base_str, diff_str)
        }
    }
}

/// Main entry point for merging large numbers of tag groups. 
/// Partitions data into frequent and rare sets to balance compression and diversity.
pub fn merge_tag_groups(tag_groups: Vec<HashSet<String>>, threshold: f32, max_depth: u32) -> Vec<String> {
    if tag_groups.is_empty() { return Vec::new(); }
    
    let mut set_counts: HashMap<Vec<String>, u32> = HashMap::new();
    for s in tag_groups {
        let mut v: Vec<_> = s.into_iter().collect();
        v.sort();
        *set_counts.entry(v).or_insert(0) += 1;
    }

    let total_instances: u32 = set_counts.values().sum();
    let avg_freq = total_instances as f32 / set_counts.len() as f32;

    let mut major_sets = Vec::new();
    let mut minor_sets = Vec::new();

    for (tags, count) in set_counts {
        let set: HashSet<String> = tags.into_iter().collect();
        if count as f32 > avg_freq * 1.5 || count > 5 {
            for _ in 0..count { major_sets.push(set.clone()); }
        } else {
            for _ in 0..count { minor_sets.push(set.clone()); }
        }
    }

    let mut all_unique_tags = HashSet::new();
    for s in major_sets.iter().chain(minor_sets.iter()) {
        for t in s { all_unique_tags.insert(t.clone()); }
    }
    let mut tag_vec: Vec<_> = all_unique_tags.into_iter().collect();
    tag_vec.sort();
    
    let tag_to_id: HashMap<String, u32> = tag_vec.iter().cloned().enumerate().map(|(i, t)| (t, i as u32)).collect();
    let id_to_tag: HashMap<u32, String> = tag_vec.into_iter().enumerate().map(|(i, t)| (i as u32, t)).collect();

    let mut final_results = Vec::new();
    if !major_sets.is_empty() {
        final_results.extend(process_merge_logic_id(major_sets, threshold, max_depth, &tag_to_id, &id_to_tag));
    }
    if !minor_sets.is_empty() {
        final_results.extend(process_merge_logic_id(minor_sets, threshold, max_depth, &tag_to_id, &id_to_tag));
    }

    final_results
}

/// Internal logic for merging partitioned ID-based tag sets using connected components and greedy similarity search.
fn process_merge_logic_id(
    tag_groups: Vec<HashSet<String>>, 
    threshold: f32, 
    max_depth: u32,
    tag_to_id: &HashMap<String, u32>,
    id_to_tag: &HashMap<u32, String>
) -> Vec<String> {
    let num_sets = tag_groups.len();
    if num_sets == 0 { return Vec::new(); }
    
    let id_sets: Vec<Vec<u32>> = tag_groups.par_iter().map(|s| {
        let mut ids: Vec<_> = s.iter().map(|t| *tag_to_id.get(t).unwrap()).collect();
        ids.sort();
        ids
    }).collect();

    let id_sets_hash: Vec<HashSet<u32>> = id_sets.iter().map(|v| v.iter().cloned().collect()).collect();

    // Inverted index for O(N) candidate filtering instead of O(N^2) comparison
    let mut inverted_index: HashMap<u32, Vec<usize>> = HashMap::new();
    for (i, set) in id_sets.iter().enumerate() {
        for &tag_id in set {
            inverted_index.entry(tag_id).or_default().push(i);
        }
    }

    let edges: Vec<(usize, usize)> = (0..num_sets).into_par_iter()
        .flat_map(|i| {
            let mut candidates = HashSet::new();
            for &tag_id in &id_sets[i] {
                if let Some(matches) = inverted_index.get(&tag_id) {
                    for &j in matches {
                        if j > i { candidates.insert(j); }
                    }
                }
            }

            let mut local_edges = Vec::new();
            for j in candidates {
                if calculate_jaccard_similarity_optimized(&id_sets[i], &id_sets[j]) >= threshold {
                    local_edges.push((i, j));
                }
            }
            local_edges
        })
        .collect();

    let components = find_connected_components(num_sets, &edges);
    
    let mut component_results: Vec<(HashSet<u32>, String)> = components.into_par_iter().map(|component| {
        let component_sets: Vec<_> = component.iter().map(|&i| id_sets_hash[i].clone()).collect();
        let mut all_component_tags = HashSet::new();
        for s in &component_sets {
            for &tag in s { all_component_tags.insert(tag); }
        }
        (all_component_tags, recursive_merge_id(&component_sets, threshold, 0, max_depth, id_to_tag))
    }).collect();

    if component_results.is_empty() { return Vec::new(); }

    // Greedy ordering with look-ahead window to balance quality and speed
    component_results.sort_by(|a, b| b.0.len().cmp(&a.0.len()));
    
    let mut final_results = Vec::new();
    let mut current = component_results.remove(0);
    final_results.push(current.1);

    while !component_results.is_empty() {
        let mut best_idx = 0;
        let mut best_sim = -1.0;
        let window_size = 100.min(component_results.len());
        
        for i in 0..window_size {
            let tags = &component_results[i].0;
            let intersect = current.0.iter().filter(|t| tags.contains(t)).count();
            if intersect == 0 {
                if best_sim < 0.0 { best_sim = 0.0; best_idx = i; }
                continue;
            }
            let union = current.0.len() + tags.len() - intersect;
            let sim = intersect as f32 / union as f32;
            
            if sim > best_sim {
                best_sim = sim;
                best_idx = i;
            }
            if sim > 0.95 { break; }
        }
        
        current = component_results.remove(best_idx);
        final_results.push(current.1);
    }
    
    final_results
}
