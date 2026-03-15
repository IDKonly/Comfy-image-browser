use std::collections::HashSet;
use super::types::WildcardFilter;

pub fn apply_simple_filter(tags: HashSet<String>, exclusions: &[String]) -> HashSet<String> {
    let mut filtered = HashSet::new();
    let ex_set: HashSet<_> = exclusions.iter().map(|s| s.to_lowercase()).collect();
    for tag in tags {
        let tag_low = tag.to_lowercase();
        let mut should_exclude = false;
        if ex_set.contains(&tag_low) {
            should_exclude = true;
        } else {
            for ex in exclusions {
                if !ex.is_empty() && tag_low.contains(&ex.to_lowercase()) {
                    should_exclude = true;
                    break;
                }
            }
        }
        if !should_exclude {
            filtered.insert(tag);
        }
    }
    filtered
}

pub fn apply_filters(tags: HashSet<String>, filter: &WildcardFilter) -> HashSet<String> {
    if filter.simple_mode {
        return apply_simple_filter(tags, &filter.simple_exclusions);
    }
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
