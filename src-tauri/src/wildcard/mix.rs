use std::iter::Peekable;
use std::str::Chars;

#[derive(Debug, Clone, PartialEq)]
enum WildcardNode {
    Text(String),
    Sequence(Vec<WildcardNode>),
    Choice(Vec<WildcardNode>),
}

fn parse_sequence(chars: &mut Peekable<Chars>, stop_char: Option<char>) -> WildcardNode {
    let mut nodes = Vec::new();
    let mut current_text = String::new();

    while let Some(&c) = chars.peek() {
        if let Some(stop) = stop_char {
            if c == stop { break; }
        }
        
        if c == '{' {
            if !current_text.is_empty() {
                nodes.push(WildcardNode::Text(current_text.clone()));
                current_text.clear();
            }
            chars.next(); // consume '{'
            nodes.push(parse_choice(chars));
        } else if c == '}' && stop_char.is_some() {
            break;
        } else {
            current_text.push(c);
            chars.next();
        }
    }

    if !current_text.is_empty() {
        nodes.push(WildcardNode::Text(current_text));
    }

    match nodes.len() {
        0 => WildcardNode::Text(String::new()),
        1 => nodes.remove(0),
        _ => WildcardNode::Sequence(nodes),
    }
}

fn parse_choice(chars: &mut Peekable<Chars>) -> WildcardNode {
    let mut options = Vec::new();
    loop {
        options.push(parse_sequence(chars, Some('|')));
        match chars.next() {
            Some('|') => continue,
            Some('}') => break,
            _ => break,
        }
    }
    WildcardNode::Choice(options)
}

fn serialize_node(node: &WildcardNode) -> String {
    match node {
        WildcardNode::Text(t) => t.clone(),
        WildcardNode::Sequence(nodes) => {
            let s = nodes.iter().map(serialize_node).collect::<Vec<_>>().join("");
            clean_commas(&s)
        }
        WildcardNode::Choice(options) => {
            let opts: Vec<_> = options.iter()
                .map(serialize_node)
                .map(|s| s.trim().to_string())
                .collect();
            
            // Deduplicate based on stripped content, but preserve the string
            let mut unique_opts = Vec::new();
            let mut seen = std::collections::HashSet::new();
            for o in opts {
                let cleaned = o.trim_start_matches(',').trim().to_string();
                if !seen.contains(&cleaned) {
                    seen.insert(cleaned);
                    unique_opts.push(o);
                }
            }
            
            unique_opts.sort();
            
            let has_empty = unique_opts.iter().any(|o| o.is_empty() || o == ",");
            let mut final_parts = Vec::new();
            if has_empty {
                final_parts.push(" ".to_string());
            }
            
            for o in unique_opts {
                let cleaned = o.trim_start_matches(',').trim();
                if !cleaned.is_empty() {
                    final_parts.push(o);
                }
            }
            
            if final_parts.is_empty() { return String::new(); }
            
            if final_parts.len() == 1 {
                if final_parts[0].trim().is_empty() { String::new() } else { format!("{{{}}}", final_parts[0]) }
            } else {
                format!("{{{}}}", final_parts.join("|"))
            }
        }
    }
}

fn clean_commas(s: &str) -> String {
    let mut result = s.replace(", ,", ",");
    // Remove leading/trailing commas and extra spaces around commas
    let parts: Vec<_> = result.split(',')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
        
    result = parts.join(", ");
    result
}

fn extract_flat_options(node: &WildcardNode, out: &mut Vec<String>) {
    match node {
        WildcardNode::Text(t) => {
            let cleaned = t.trim().trim_start_matches(',').trim();
            if !cleaned.is_empty() {
                out.push(cleaned.to_string());
            }
        },
        WildcardNode::Sequence(nodes) => {
            let mut buf = String::new();
            for n in nodes {
                buf.push_str(&serialize_node(n));
            }
            let cleaned = buf.trim().trim_start_matches(',').trim();
            if !cleaned.is_empty() {
                out.push(cleaned.to_string());
            }
        },
        WildcardNode::Choice(options) => {
            for opt in options {
                extract_flat_options(opt, out);
            }
        }
    }
}

pub fn mix_mode_transform(wildcard: &str, mix_depth: u32, tandem_min_branches: u32, tandem_ratio: f32) -> String {
    if wildcard.is_empty() { return String::new(); }
    
    let mut chars = wildcard.chars().peekable();
    let ast = parse_sequence(&mut chars, None);
    
    let mut extracted_features = Vec::new();
    let mut total_branches = 0;
    let (transformed_ast, _) = transform_recursive(ast, 0, mix_depth, &mut extracted_features, &mut total_branches);

    let mut result = serialize_node(&transformed_ast);
    result = clean_commas(&result); // clean before appending blocks
    
    if !extracted_features.is_empty() {
        let mut feature_counts = std::collections::HashMap::new();
        
        for f in extracted_features {
            let mut opts = Vec::new();
            extract_flat_options(&f, &mut opts);
            // Deduplicate options within the same branch to avoid double-counting
            opts.sort();
            opts.dedup();
            for p in opts {
                if !p.is_empty() {
                    *feature_counts.entry(p).or_insert(0) += 1;
                }
            }
        }
        
        if !feature_counts.is_empty() {
            let mut tandem_features = Vec::new();
            let mut regular_features = Vec::new();

            // Apply tandem logic only if we meet the minimum branch requirement.
            if total_branches >= tandem_min_branches {
                let denominator = if total_branches > 0 { total_branches as f32 } else { 1.0 };
                
                for (feat, count) in feature_counts {
                    let ratio = count as f32 / denominator;
                    if ratio >= tandem_ratio {
                        tandem_features.push(feat);
                    } else {
                        regular_features.push(feat);
                    }
                }
            } else {
                // If we don't have enough branches, everything is a regular feature.
                for (feat, _) in feature_counts {
                    regular_features.push(feat);
                }
            }
            
            tandem_features.sort();
            regular_features.sort();
            
            // Build tandem block: "Base{ |A}{ |, B}"
            let mut tandem_block = String::new();
            for t in tandem_features {
                if result.is_empty() && tandem_block.is_empty() {
                    tandem_block.push_str(&format!("{{ |{}}}", t));
                } else {
                    tandem_block.push_str(&format!("{{ |, {}}}", t));
                }
            }
            
            let regular_block = if !regular_features.is_empty() {
                let mut final_parts = Vec::new();
                final_parts.push(" ".to_string()); // Has empty option since it's optional
                for f in regular_features {
                    if result.is_empty() && tandem_block.is_empty() && final_parts.len() == 1 {
                        final_parts.push(f); // No comma for first item if everything is empty
                    } else {
                        final_parts.push(format!(", {}", f));
                    }
                }
                format!("{{{}}}", final_parts.join("|"))
            } else {
                String::new()
            };
            
            if !tandem_block.is_empty() {
                result = format!("{}{}", result, tandem_block);
            }
            
            if !regular_block.is_empty() {
                result = format!("{}{}", result, regular_block);
            }
        }
    }
    
    // We already cleaned commas, just trim any leftovers
    result.trim_start_matches(',').trim().to_string()
}

fn transform_recursive(node: WildcardNode, current_depth: u32, mix_depth: u32, extracted: &mut Vec<WildcardNode>, total_branches: &mut u32) -> (WildcardNode, bool) {
    match node {
        WildcardNode::Text(_) => (node, false),
        WildcardNode::Sequence(nodes) => {
            let mut new_nodes = Vec::new();
            for n in nodes {
                let (new_n, _) = transform_recursive(n, current_depth, mix_depth, extracted, total_branches);
                new_nodes.push(new_n);
            }
            (WildcardNode::Sequence(new_nodes), false)
        }
        WildcardNode::Choice(options) => {
            if current_depth >= mix_depth {
                *total_branches += options.len() as u32;
                let mut new_options = Vec::new();
                for opt in options {
                    let (new_opt, _) = extract_and_flatten(opt, extracted);
                    new_options.push(new_opt);
                }
                (WildcardNode::Choice(new_options), true)
            } else {
                let mut new_options = Vec::new();
                for opt in options {
                    let (new_opt, _) = transform_recursive(opt, current_depth + 1, mix_depth, extracted, total_branches);
                    new_options.push(new_opt);
                }
                (WildcardNode::Choice(new_options), false)
            }
        }
    }
}

fn extract_and_flatten(node: WildcardNode, extracted: &mut Vec<WildcardNode>) -> (WildcardNode, bool) {
    match node {
        WildcardNode::Choice(_) => {
            extracted.push(node);
            (WildcardNode::Text(String::new()), true)
        }
        WildcardNode::Sequence(nodes) => {
            let mut new_nodes = Vec::new();
            let mut any_extracted = false;
            for n in nodes {
                let (new_n, ext) = extract_and_flatten(n, extracted);
                new_nodes.push(new_n);
                if ext { any_extracted = true; }
            }
            (WildcardNode::Sequence(new_nodes), any_extracted)
        }
        _ => (node, false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mix_mode_transform() {
        assert_eq!(mix_mode_transform("a, b, c", 1, 0, 0.51), "a, b, c");

        assert_eq!(mix_mode_transform("a, {b|c}, d", 0, 0, 0.51), "a, {b|c}, d");
        assert_eq!(mix_mode_transform("a, {b|c}, d", 1, 0, 0.51), "a, {b|c}, d");
        
        // Nested:
        let res_nested = mix_mode_transform("a, {{b|c}|d}, e", 0, 0, 0.51);
        println!("Nested test: {}", res_nested);
        assert_eq!(res_nested, "a, { |d}, e{ |, b|, c}");

        let res_tandem = mix_mode_transform("{{a|b}|{a|c}}", 0, 0, 0.51);
        println!("Tandem test: {}", res_tandem);
        assert_eq!(res_tandem, "{ |a}{ |, b|, c}");
    }
}

