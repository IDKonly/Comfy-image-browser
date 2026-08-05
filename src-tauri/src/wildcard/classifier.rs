use serde::{Deserialize, Serialize};
use rayon::prelude::*;
use regex::Regex;

use crate::nsfw::NsfwMatcher;

/// A whole-line scene register (see the TS `Register` type). Judged over the full
/// cleaned prompt with the shared whole-word + plural matcher.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDef {
    pub id: u64,
    pub name: String,
    pub keywords: Vec<String>,
    pub exclude_keywords: Vec<String>,
    #[serde(default)]
    pub is_fallback: bool,
}

struct PreparedRegister {
    id: u64,
    include: NsfwMatcher,
    exclude: NsfwMatcher,
    is_fallback: bool,
}

/// Assign each line to exactly one register id via a priority waterfall in the
/// given order: the first register whose include keywords match and whose exclude
/// keywords don't wins. When nothing matches, the first `is_fallback` register
/// (or the last register) claims the line. Returns 0 if `registers` is empty.
pub fn classify_registers(lines: Vec<String>, registers: Vec<RegisterDef>) -> Vec<u64> {
    if registers.is_empty() {
        return vec![0; lines.len()];
    }

    let prepared: Vec<PreparedRegister> = registers
        .iter()
        .map(|r| PreparedRegister {
            id: r.id,
            include: NsfwMatcher::new(&r.keywords),
            exclude: NsfwMatcher::new(&r.exclude_keywords),
            is_fallback: r.is_fallback,
        })
        .collect();

    // `prepared` is non-empty here, so `last().unwrap()` is infallible.
    let fallback_id = prepared
        .iter()
        .find(|p| p.is_fallback)
        .unwrap_or_else(|| prepared.last().unwrap())
        .id;

    lines
        .par_iter()
        .map(|line| {
            // Lowercase once per line; each register probe reuses the shared
            // whole-word/plural matcher over the same lowered text.
            let lower = line.to_lowercase();
            for p in &prepared {
                if p.is_fallback {
                    continue;
                }
                let included = p.include.matches_lowercase(&lower);
                let excluded = !p.exclude.is_empty() && p.exclude.matches_lowercase(&lower);
                if included && !excluded {
                    return p.id;
                }
            }
            fallback_id
        })
        .collect()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ClassifierSubset {
    pub id: u64,
    pub name: String,
    pub keywords: Vec<String>,
    pub exclude_keywords: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WordGroup {
    pub id: u64,
    pub name: String,
    pub words: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassificationResult {
    pub line_index: usize,
    pub data: Vec<SubsetMatch>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubsetMatch {
    pub id: u64,
    pub name: String,
    pub matches: Vec<String>,
}

struct PreparedSubset {
    id: u64,
    name: String,
    keywords: Vec<String>,
    exclude_keywords: Vec<String>,
}

struct PreparedWordGroup {
    patterns: Vec<(Regex, String)>, // (Regex, Replacement)
}

struct ProcessedTag {
    original: String,
    lower: String,
    merged: String,
}

pub fn classify_prompts(
    lines: Vec<String>,
    subsets: Vec<ClassifierSubset>,
    word_groups: Vec<WordGroup>,
) -> Vec<ClassificationResult> {
    // 1. Prepare word groups (sort and pre-compile regex)
    let prepared_groups: Vec<PreparedWordGroup> = word_groups.into_iter().map(|wg| {
        let mut sorted_words = wg.words.clone();
        sorted_words.sort_by(|a, b| b.len().cmp(&a.len()));
        
        let patterns = sorted_words.into_iter()
            .filter_map(|word| {
                if word.is_empty() { return None; }
                let pattern = format!(r"(^|\s){}(\s|$)", regex::escape(&word));
                Regex::new(&pattern).ok().map(|re| (re, format!("${{1}}{{{}}}{{2}}", wg.name)))
            }).collect();
            
        PreparedWordGroup {
            patterns,
        }
    }).collect();

    // 2. Prepare subsets (pre-lowercase keywords)
    let prepared_subsets: Vec<PreparedSubset> = subsets.into_iter().map(|s| {
        PreparedSubset {
            id: s.id,
            name: s.name,
            keywords: s.keywords.into_iter().map(|k| k.to_lowercase()).collect(),
            exclude_keywords: s.exclude_keywords.into_iter().map(|k| k.to_lowercase()).collect(),
        }
    }).collect();

    // 3. Process lines in parallel
    lines.into_par_iter().enumerate().map(|(idx, line)| {
        // Pre-process all tags in the line once
        let tags: Vec<ProcessedTag> = line.split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| {
                let original = s.to_string();
                let lower = original.to_lowercase();
                let merged = get_merged_tag_optimized(&lower, &prepared_groups);
                ProcessedTag { original, lower, merged }
            }).collect();

        let mut remaining_tags = tags;
        let mut data: Vec<SubsetMatch> = prepared_subsets.iter().map(|sub| {
            let mut matched = Vec::new();
            let mut next_remaining = Vec::new();

            for tag in remaining_tags.drain(..) {
                let is_exact_inc = sub.keywords.iter().any(|k| tag.lower == *k || tag.merged == *k);
                let is_inc = is_exact_inc || sub.keywords.iter().any(|k| tag.lower.contains(k) || tag.merged.contains(k));
                
                let is_exc = !is_exact_inc && sub.exclude_keywords.iter().any(|k| tag.lower.contains(k) || tag.merged.contains(k));

                if is_inc && !is_exc {
                    matched.push(tag.original);
                } else {
                    next_remaining.push(tag);
                }
            }
            remaining_tags = next_remaining;
            SubsetMatch {
                id: sub.id,
                name: sub.name.clone(),
                matches: matched,
            }
        }).collect();

        // Add unclassified remainder
        data.push(SubsetMatch {
            id: 0,
            name: "Unclassified".to_string(),
            matches: remaining_tags.into_iter().map(|t| t.original).collect(),
        });

        ClassificationResult {
            line_index: idx + 1,
            data,
        }
    }).collect()
}

fn get_merged_tag_optimized(lower_tag: &str, groups: &[PreparedWordGroup]) -> String {
    let mut merged = lower_tag.to_string();
    for wg in groups {
        for (re, replacement) in &wg.patterns {
            merged = re.replace_all(&merged, replacement as &str).to_string();
        }
    }
    merged
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    #[test]
    fn test_classification_logic_accuracy() {
        let lines = vec![
            "1girl, solo, long hair, blue dress, outdoors".to_string(),
            "2girls, multiple girls, short hair, red dress".to_string(),
        ];

        let subsets = vec![
            ClassifierSubset {
                id: 1,
                name: "Solo Girls".to_string(),
                keywords: vec!["1girl".to_string(), "solo".to_string()],
                exclude_keywords: vec!["multiple".to_string()],
            },
            ClassifierSubset {
                id: 2,
                name: "Hair Styles".to_string(),
                keywords: vec!["hair".to_string()],
                exclude_keywords: vec![],
            }
        ];

        let word_groups = vec![];

        let results = classify_prompts(lines, subsets, word_groups);

        // Line 1: 1girl, solo should be caught by "Solo Girls", long hair by "Hair Styles"
        assert_eq!(results[0].data[0].matches.len(), 2); // 1girl, solo
        assert_eq!(results[0].data[1].matches.len(), 1); // long hair
        
        // Line 2: "multiple girls" should prevent "Solo Girls" (exclude_keywords)
        assert_eq!(results[1].data[0].matches.len(), 0); 
    }

    fn reg(id: u64, name: &str, kw: &[&str], excl: &[&str], fallback: bool) -> RegisterDef {
        RegisterDef {
            id,
            name: name.to_string(),
            keywords: kw.iter().map(|s| s.to_string()).collect(),
            exclude_keywords: excl.iter().map(|s| s.to_string()).collect(),
            is_fallback: fallback,
        }
    }

    #[test]
    fn registers_waterfall_priority_and_fallback() {
        let registers = vec![
            reg(1, "explicit", &["sex", "cum"], &[], false),
            reg(2, "exposure", &["nude", "nipple"], &[], false),
            reg(3, "daily", &[], &[], true),
        ];
        let lines = vec![
            "after sex, cum in pussy, nipples".to_string(), // both explicit & exposure -> explicit wins (order)
            "completely nude, nipples, blush".to_string(),  // exposure only
            "1girl, blue dress, outdoors".to_string(),      // neither -> daily fallback
        ];
        let ids = classify_registers(lines, registers);
        assert_eq!(ids, vec![1, 2, 3]);
    }

    #[test]
    fn registers_exclude_vetoes_match() {
        let registers = vec![
            reg(1, "exposure", &["nude"], &["completely nude"], false),
            reg(2, "daily", &[], &[], true),
        ];
        // "completely nude" contains "nude" but is vetoed -> falls through to daily.
        let ids = classify_registers(vec!["completely nude, blush".to_string()], registers);
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn registers_empty_returns_zeros() {
        let ids = classify_registers(vec!["anything".to_string()], vec![]);
        assert_eq!(ids, vec![0]);
    }

    #[test]
    fn registers_no_fallback_uses_last() {
        let registers = vec![
            reg(1, "explicit", &["sex"], &[], false),
            reg(2, "exposure", &["nude"], &[], false),
        ];
        // No match, no fallback -> last register (id 2) claims it.
        let ids = classify_registers(vec!["1girl, dress".to_string()], registers);
        assert_eq!(ids, vec![2]);
    }

    #[test]
    fn test_performance_real_data() {
        use std::fs::read_to_string;
        use rand::seq::SliceRandom;
        use rand::thread_rng;

        let content = read_to_string("../test/tag classifier source.txt").expect("Could not read test file");
        let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
        
        let mut rng = thread_rng();
        let lines: Vec<String> = all_lines.choose_multiple(&mut rng, 200).cloned().collect();

        let subsets = vec![
            ClassifierSubset { id: 1, name: "Body".to_string(), keywords: vec!["ass".to_string(), "pussy".to_string(), "feet".to_string()], exclude_keywords: vec![] },
            ClassifierSubset { id: 2, name: "Clothes".to_string(), keywords: vec!["shirt".to_string(), "skirt".to_string(), "dress".to_string()], exclude_keywords: vec![] },
            ClassifierSubset { id: 3, name: "Sex".to_string(), keywords: vec!["sex".to_string(), "vaginal".to_string()], exclude_keywords: vec![] },
        ];

        let word_groups = vec![
            WordGroup { id: 1, name: "Uniform".to_string(), words: vec!["school uniform".to_string(), "serafuku".to_string()] },
            WordGroup { id: 2, name: "Footwear".to_string(), words: vec!["shoes".to_string(), "loafers".to_string(), "socks".to_string()] },
        ];

        let start = Instant::now();
        let results = classify_prompts(lines.clone(), subsets, word_groups);
        let duration = start.elapsed();

        println!("Processed 200 real lines in: {:?}", duration);
        assert_eq!(results.len(), 200);
        // Requirement: 200 lines should be very fast now (e.g., under 100ms)
        assert!(duration.as_millis() < 500);
    }
}
