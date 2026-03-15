use super::utils::find_innermost_braces;

pub fn expand_single_line(text: &str) -> Vec<String> {
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
