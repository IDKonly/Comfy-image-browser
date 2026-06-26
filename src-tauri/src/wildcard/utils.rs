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

/// Wrap every `<...>` group in commas so a later comma-split separates LoRA/embedding tokens
/// (`<lora:name:1.0>`, `<embedding:...>`, …) from adjacent tags even when the source prompt
/// omits a comma between them. Unbalanced `<`/`>` are tolerated.
fn isolate_angle_tokens(s: &str) -> String {
    if !s.contains('<') {
        return s.to_string();
    }
    let mut out = String::with_capacity(s.len() + 8);
    let mut inside = false;
    for c in s.chars() {
        match c {
            '<' if !inside => { out.push(','); out.push('<'); inside = true; }
            '>' if inside => { out.push('>'); out.push(','); inside = false; }
            _ => out.push(c),
        }
    }
    out
}

/// Split a prompt string into individual tags.
///
/// LoRA / embedding tokens like `<lora:name:1.0>` are isolated as their own tags even when no
/// comma separates them from a neighbouring tag. Without this, a prompt ending in
/// `...white sports bra<lora:foo:1.0>` splits into one tag gluing the real tag to the LoRA, so
/// a `contains`-based exclusion filter matching "lora" would drop the real tag along with it.
/// Each resulting tag is brace-balanced via [`remove_unbalanced_braces`], trimmed, and empty
/// tags are dropped.
pub fn split_prompt_tags<S: AsRef<str>>(prompt: S) -> Vec<String> {
    isolate_angle_tokens(prompt.as_ref())
        .split(',')
        .map(remove_unbalanced_braces)
        .filter(|s| !s.trim().is_empty())
        .collect()
}

#[cfg(test)]
mod split_tests {
    use super::split_prompt_tags;

    #[test]
    fn isolates_lora_without_comma() {
        let prompt = "1girl, white sports bra<lora:cutesexy(taken2212)-@yjcg:1.0> <lora:kisaki_(swimsuit)-@a6uj:1.0>";
        let tags = split_prompt_tags(prompt);
        assert_eq!(tags[0], "1girl");
        assert_eq!(tags[1], "white sports bra");
        assert_eq!(tags[2], "<lora:cutesexy(taken2212)-@yjcg:1.0>");
        assert_eq!(tags[3], "<lora:kisaki_(swimsuit)-@a6uj:1.0>");
    }

    #[test]
    fn plain_prompt_unchanged() {
        let tags = split_prompt_tags("1girl, solo, smile");
        assert_eq!(tags, vec!["1girl", "solo", "smile"]);
    }
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
