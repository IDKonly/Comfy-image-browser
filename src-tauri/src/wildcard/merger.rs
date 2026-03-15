use std::collections::{HashSet, HashMap};
use rayon::prelude::*;
use super::utils::{calculate_jaccard_similarity_optimized, find_connected_components};

pub fn recursive_merge(tag_sets: &[HashSet<String>], threshold: f32, current_depth: u32, max_depth: u32) -> String {
    if tag_sets.is_empty() { return String::new(); }
    if tag_sets.len() == 1 {
        let mut sorted: Vec<_> = tag_sets[0].iter().cloned().collect();
        sorted.sort();
        return sorted.join(", ");
    }

    // 1. Extract Universal Common Base (Tags present in ALL sets)
    let mut universal_base = tag_sets[0].clone();
    for s in &tag_sets[1..] {
        universal_base.retain(|tag| s.contains(tag));
    }

    let mut sorted_base: Vec<_> = universal_base.iter().cloned().collect();
    sorted_base.sort();
    let base_str = sorted_base.join(", ");

    // Calculate remainders after removing universal base
    let mut pool: Vec<HashSet<String>> = tag_sets.iter()
        .map(|s| s.difference(&universal_base).cloned().collect())
        .collect();

    // If everything was identical, just return the base
    if pool.iter().all(|s| s.is_empty()) {
        return base_str;
    }

    // 2. If max depth reached, perform a flat join
    if current_depth >= max_depth {
        let mut parts: Vec<String> = pool.iter().map(|s| {
            let mut sorted: Vec<_> = s.iter().cloned().collect();
            sorted.sort();
            sorted.join(", ")
        }).collect();
        parts.sort();
        parts.dedup();
        let diff_str = parts.join("|");
        return if base_str.is_empty() {
            format!("{{{}}}", diff_str)
        } else {
            format!("{}, {{{}}}", base_str, diff_str)
        };
    }

    // 3. Multi-way Factorization: Group sets by multiple common factors at once
    let mut factor_groups = Vec::new();
    
    while !pool.is_empty() {
        // Find best remaining tag
        let mut counts = HashMap::new();
        for s in &pool {
            for tag in s {
                *counts.entry(tag.clone()).or_insert(0) += 1;
            }
        }

        let best_tag = counts.into_iter()
            .filter(|(_, count)| *count >= 2)
            .max_by_key(|(tag, count)| (*count - 1) * (tag.len() + 2));

        if let Some((tag, _)) = best_tag {
            let mut with_tag = Vec::new();
            let mut next_pool = Vec::new();
            for s in pool {
                if s.contains(&tag) {
                    let mut new_s = s.clone();
                    new_s.remove(&tag);
                    with_tag.push(new_s);
                } else {
                    next_pool.push(s);
                }
            }
            
            // --- NEW: Pull up common tags within the 'with_tag' group to avoid unnecessary nesting ---
            let mut common_in_group = with_tag[0].clone();
            for s in &with_tag[1..] {
                common_in_group.retain(|t| s.contains(t));
            }
            
            let mut tags_to_pull = vec![tag];
            for t in common_in_group {
                tags_to_pull.push(t);
            }
            tags_to_pull.sort();
            let combined_factor = tags_to_pull.join(", ");
            
            let final_group_sets: Vec<HashSet<String>> = with_tag.iter()
                .map(|s| {
                    let mut new_s = s.clone();
                    for t in &tags_to_pull {
                        new_s.remove(t);
                    }
                    new_s
                })
                .collect();
                
            factor_groups.push((combined_factor, final_group_sets));
            pool = next_pool;
        } else {
            // No more common factors for remaining sets
            break;
        }
    }

    // Process all groups and individual remainders
    let mut alternatives = Vec::new();
    
    for (tag, group_sets) in factor_groups {
        // --- NEW: Small group expansion to preserve probability distribution ---
        if group_sets.len() < 3 {
            for s in group_sets {
                let mut sorted: Vec<_> = s.iter().cloned().collect();
                sorted.sort();
                let inner_str = sorted.join(", ");
                if inner_str.is_empty() {
                    alternatives.push(tag.clone());
                } else {
                    alternatives.push(format!("{}, {}", tag, inner_str));
                }
            }
            continue;
        }

        let inner = recursive_merge(&group_sets, threshold, current_depth + 1, max_depth);
        if inner.is_empty() {
            alternatives.push(tag);
        } else {
            if (inner.contains('|') || inner.contains(',')) && !inner.starts_with('{') {
                alternatives.push(format!("{}, {{{}}}", tag, inner));
            } else {
                alternatives.push(format!("{}, {}", tag, inner));
            }
        }
    }

    // Add remaining sets that couldn't be factorized
    for s in pool {
        let mut sorted: Vec<_> = s.iter().cloned().collect();
        sorted.sort();
        alternatives.push(sorted.join(", "));
    }

    alternatives.sort();
    alternatives.dedup();
    
    let diff_str = alternatives.join("|");
    
    if base_str.is_empty() {
        if alternatives.len() == 1 {
            alternatives[0].clone()
        } else {
            format!("{{{}}}", diff_str)
        }
    } else {
        if alternatives.is_empty() {
            base_str
        } else {
            format!("{}, {{{}}}", base_str, diff_str)
        }
    }
}

pub fn merge_tag_groups(tag_groups: Vec<HashSet<String>>, threshold: f32, max_depth: u32) -> Vec<String> {
    if tag_groups.is_empty() { return Vec::new(); }
    
    // 1. Group identical sets and count frequencies
    let mut set_counts: HashMap<Vec<String>, u32> = HashMap::new();
    for s in tag_groups {
        let mut v: Vec<_> = s.into_iter().collect();
        v.sort();
        *set_counts.entry(v).or_insert(0) += 1;
    }

    let total_instances: u32 = set_counts.values().sum();
    let avg_freq = total_instances as f32 / set_counts.len() as f32;

    // 2. Partition into "High Frequency" (Major) and "Long Tail" (Minor)
    let mut major_sets = Vec::new();
    let mut minor_sets = Vec::new();

    for (tags, count) in set_counts {
        let set: HashSet<String> = tags.into_iter().collect();
        // If a set appears more than average or is very common, it's "Major"
        if count as f32 > avg_freq * 1.5 || count > 5 {
            for _ in 0..count { major_sets.push(set.clone()); }
        } else {
            for _ in 0..count { minor_sets.push(set.clone()); }
        }
    }

    // 3. Process each partition independently
    let mut final_results = Vec::new();
    
    let major_merged = if !major_sets.is_empty() {
        process_merge_logic(major_sets, threshold, max_depth)
    } else { Vec::new() };

    let minor_merged = if !minor_sets.is_empty() {
        process_merge_logic(minor_sets, threshold, max_depth)
    } else { Vec::new() };

    // Combine results (Major first, then Minor as variety)
    final_results.extend(major_merged);
    final_results.extend(minor_merged);
    
    final_results
}

pub fn process_merge_logic(tag_groups: Vec<HashSet<String>>, threshold: f32, max_depth: u32) -> Vec<String> {
    let num_sets = tag_groups.len();
    if num_sets == 0 { return Vec::new(); }
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
    
    let id_sets: Vec<Vec<u32>> = tag_groups.par_iter().map(|s| {
        let mut ids: Vec<_> = s.iter().map(|t| *tag_to_id.get(t).unwrap()).collect();
        ids.sort();
        ids
    }).collect();

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
