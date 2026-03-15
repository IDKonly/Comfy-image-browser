use std::path::PathBuf;
use tauri::Manager;

pub fn get_db_path_local(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push(".image_manager_v2.db");
    Ok(path)
}

pub fn calculate_jaccard_similarity_optimized(set1: &[u32], set2: &[u32]) -> f32 {
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

pub fn find_connected_components(num_nodes: usize, edges: &[(usize, usize)]) -> Vec<Vec<usize>> {
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

pub fn find_innermost_braces(s: &str) -> Option<(usize, usize)> {
    let mut last_open = None;
    for (i, c) in s.char_indices() {
        if c == '{' { last_open = Some(i); }
        else if c == '}' { if let Some(open) = last_open { return Some((open, i)); } }
    }
    None
}

/// Removes unbalanced '{' or '}' from the edges of a tag string.
/// For example, "best quality}" becomes "best quality".
/// "{masterpiece" becomes "masterpiece".
/// "{masterpiece}" remains "{masterpiece}".
pub fn remove_unbalanced_braces(mut s: &str) -> String {
    s = s.trim();
    if s.is_empty() { return String::new(); }

    let mut chars: Vec<char> = s.chars().collect();
    
    loop {
        let open_count = chars.iter().filter(|&&c| c == '{').count();
        let close_count = chars.iter().filter(|&&c| c == '}').count();
        
        if open_count == close_count {
            break;
        }
        
        let mut changed = false;
        
        if open_count > close_count && !chars.is_empty() && chars.first() == Some(&'{') {
            chars.remove(0);
            changed = true;
        } else if close_count > open_count && !chars.is_empty() && chars.last() == Some(&'}') {
            chars.pop();
            changed = true;
        }
        
        if !changed {
            break;
        }
    }
    
    chars.into_iter().collect::<String>().trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_unbalanced_braces() {
        assert_eq!(remove_unbalanced_braces("tag}"), "tag");
        assert_eq!(remove_unbalanced_braces("{tag"), "tag");
        assert_eq!(remove_unbalanced_braces("{{tag}"), "{tag}");
        assert_eq!(remove_unbalanced_braces("{tag}}"), "{tag}");
        assert_eq!(remove_unbalanced_braces("{tag}"), "{tag}");
        assert_eq!(remove_unbalanced_braces("tag"), "tag");
        assert_eq!(remove_unbalanced_braces("a { b } }"), "a { b }");
        assert_eq!(remove_unbalanced_braces("{{ a { b }"), "a { b }");
    }
}
