use std::collections::HashSet;
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
            let mut opts: Vec<_> = options.iter()
                .map(serialize_node)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            
            if opts.is_empty() { return String::new(); }
            opts.sort();
            opts.dedup();
            
            if opts.len() == 1 {
                format!("{{{}}}", opts[0])
            } else {
                format!("{{{}}}", opts.join("|"))
            }
        }
    }
}

fn clean_commas(s: &str) -> String {
    let mut result = s.replace(", ,", ",");
    // Remove leading/trailing commas and extra spaces around commas
    result = result.split(',')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
    result
}

fn extract_flat_options(node: &WildcardNode, out: &mut Vec<String>) {
    match node {
        WildcardNode::Text(t) => {
            if !t.trim().is_empty() {
                out.push(t.trim().to_string());
            }
        },
        WildcardNode::Sequence(nodes) => {
            let mut buf = String::new();
            for n in nodes {
                buf.push_str(&serialize_node(n));
            }
            if !buf.trim().is_empty() {
                out.push(buf.trim().to_string());
            }
        },
        WildcardNode::Choice(options) => {
            for opt in options {
                extract_flat_options(opt, out);
            }
        }
    }
}

pub fn mix_mode_transform(wildcard: &str, mix_depth: u32) -> String {
    if wildcard.is_empty() { return String::new(); }
    
    let mut chars = wildcard.chars().peekable();
    let ast = parse_sequence(&mut chars, None);
    
    let mut extracted_features = Vec::new();
    let (transformed_ast, _) = transform_recursive(ast, 0, mix_depth, &mut extracted_features);

    let mut result = serialize_node(&transformed_ast);
    
    if !extracted_features.is_empty() {
        let mut unique_features = HashSet::new();
        for f in extracted_features {
            let mut opts = Vec::new();
            extract_flat_options(&f, &mut opts);
            for p in opts {
                if !p.is_empty() {
                    unique_features.insert(p);
                }
            }
        }
        
        if !unique_features.is_empty() {
            let mut sorted_features: Vec<_> = unique_features.into_iter().collect();
            sorted_features.sort();
            
            let mix_block = format!("{{{}}}", sorted_features.join("|"));
            if result.is_empty() {
                result = mix_block;
            } else {
                result = format!("{}, {}", result, mix_block);
            }
        }
    }
    
    clean_commas(&result)
}

fn transform_recursive(node: WildcardNode, current_depth: u32, mix_depth: u32, extracted: &mut Vec<WildcardNode>) -> (WildcardNode, bool) {
    match node {
        WildcardNode::Text(_) => (node, false),
        WildcardNode::Sequence(nodes) => {
            let mut new_nodes = Vec::new();
            for n in nodes {
                let (new_n, _) = transform_recursive(n, current_depth, mix_depth, extracted);
                new_nodes.push(new_n);
            }
            (WildcardNode::Sequence(new_nodes), false)
        }
        WildcardNode::Choice(options) => {
            if current_depth >= mix_depth {
                let mut new_options = Vec::new();
                for opt in options {
                    let (new_opt, _) = extract_and_flatten(opt, extracted);
                    new_options.push(new_opt);
                }
                (WildcardNode::Choice(new_options), true)
            } else {
                let mut new_options = Vec::new();
                for opt in options {
                    let (new_opt, _) = transform_recursive(opt, current_depth + 1, mix_depth, extracted);
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
        assert_eq!(mix_mode_transform("a b c", 1), "a b c");

        // The current logic doesn't flatten a depth=0 top-level Choice if it's not nested?
        // Wait, current_depth >= mix_depth. If mix_depth is 0, current_depth (0) >= 0.
        // It calls extract_and_flatten on EACH OPTION.
        // If the option is just a Sequence, extract_and_flatten extracts nothing!
        // It returns the Sequence itself, and creates a Choice out of the Sequences.
        // So a {b|c} d with depth 0:
        // 'a ' -> Sequence
        // '{b|c}' -> Choice. mix_depth=0, current_depth=0.
        // It calls extract_and_flatten on 'b' and 'c'.
        // 'b' and 'c' are Text. extract_and_flatten('b') -> ('b', false).
        // It reconstructs Choice(['b', 'c']).
        // So {b|c} is preserved.
        
        assert_eq!(mix_mode_transform("a {b|c} d", 0), "a {b|c} d");
        assert_eq!(mix_mode_transform("a {b|c} d", 1), "a {b|c} d");
        
        // Nested:
        // {{b|c}|d} e depth 0
        // Top-level Choice: {{b|c}|d}. current_depth=0 >= mix_depth(0).
        // Option 1: {b|c} -> Choice. extract_and_flatten extracts {b|c}, returns Text("").
        // Option 2: d -> Text. Returns d.
        // So Top-level Choice becomes { "" | d } which is {d}
        // Extracted: {b|c} -> appended as {b|c}
        // Result: "a {d} e, {b|c}"
        assert_eq!(mix_mode_transform("a {{b|c}|d} e", 0), "a {d} e, {b|c}");

        // {b|{c|d}} e depth 0
        assert_eq!(mix_mode_transform("a {b|{c|d}} e", 0), "a {b} e, {c|d}");

        // {b|{c|d}} e depth 1
        // current_depth=0 < 1. It recurses into Options.
        // Option 1: b -> Text.
        // Option 2: {c|d} -> Choice. current_depth=1 >= 1.
        // Recurses into c, d -> Text -> no extraction. Returns {c|d}.
        // So Result: "a {b|{c|d}} e"
        assert_eq!(mix_mode_transform("a {b|{c|d}} e", 1), "a {b|{c|d}} e");
    }
}

