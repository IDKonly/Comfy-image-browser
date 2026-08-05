use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};

/// One subset's matched tags for a single source line.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FragmentGroup {
    pub subset_id: u64,
    pub tags: Vec<String>,
}

/// All fragments extracted from one cleaned line, tagged with its scene register.
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FragmentSetIn {
    pub register: String,
    pub fragments: Vec<FragmentGroup>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateOptions {
    /// Number of prompts to generate (hard upper bound — no combinatorial blowup).
    pub count: u32,
    /// Tags forced into every generated prompt (the user's desired base).
    pub must_include: Vec<String>,
    /// Minimum compatibility (PMI) for a fragment to be eligible given the context.
    pub min_score: f32,
    /// Restrict to fragments from this register ("" = all registers).
    pub register: String,
    /// Deterministic sampling seed.
    pub seed: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedPrompt {
    pub text: String,
    pub score: f32,
}

/// Pairs co-occurring fewer than this many times in the corpus contribute no
/// signal (their PMI is treated as 0), to suppress noise from rare tags.
const MIN_COOC: u32 = 3;

/// Deterministic SplitMix64 PRNG — avoids a production `rand` dependency and
/// keeps sampling reproducible for a given seed.
struct Rng(u64);
impl Rng {
    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
    /// Uniform in [0, 1).
    fn next_f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 / (1u64 << 53) as f64
    }
}

fn norm_tag(t: &str) -> String {
    t.trim().to_lowercase()
}

fn split_norm(line: &str) -> Vec<String> {
    line.split(',')
        .map(norm_tag)
        .filter(|s| !s.is_empty())
        .collect()
}

/// Global tag co-occurrence index over the whole corpus, used to score how well
/// a candidate fragment fits the prompt's accumulated context.
struct CoocIndex {
    ids: HashMap<String, u32>,
    df: Vec<u32>,
    pair: HashMap<(u32, u32), u32>,
    n: f64,
}

impl CoocIndex {
    fn build(corpus_lines: &[String]) -> Self {
        let mut ids: HashMap<String, u32> = HashMap::new();
        let mut df: Vec<u32> = Vec::new();
        let mut pair: HashMap<(u32, u32), u32> = HashMap::new();

        for line in corpus_lines {
            let mut line_ids: Vec<u32> = Vec::new();
            let mut seen: HashSet<u32> = HashSet::new();
            for tag in split_norm(line) {
                let next = ids.len() as u32;
                let id = *ids.entry(tag).or_insert(next);
                if id as usize >= df.len() {
                    df.push(0);
                }
                if seen.insert(id) {
                    line_ids.push(id);
                    df[id as usize] += 1;
                }
            }
            for i in 0..line_ids.len() {
                for j in (i + 1)..line_ids.len() {
                    let (a, b) = (line_ids[i], line_ids[j]);
                    let key = if a < b { (a, b) } else { (b, a) };
                    *pair.entry(key).or_insert(0) += 1;
                }
            }
        }

        CoocIndex { ids, df, pair, n: corpus_lines.len().max(1) as f64 }
    }

    fn pmi(&self, a: u32, b: u32) -> f64 {
        let key = if a < b { (a, b) } else { (b, a) };
        let count = *self.pair.get(&key).unwrap_or(&0);
        if count < MIN_COOC {
            return 0.0;
        }
        let df_a = self.df[a as usize] as f64;
        let df_b = self.df[b as usize] as f64;
        (count as f64 * self.n / (df_a * df_b)).ln()
    }

    fn ids_of(&self, tags: &[String]) -> Vec<u32> {
        tags.iter().filter_map(|t| self.ids.get(&norm_tag(t)).copied()).collect()
    }

    /// Mean PMI over all cross pairs between a context and a candidate fragment.
    /// 0 if either side has no corpus-known tags.
    fn fit_score(&self, context_ids: &[u32], frag_ids: &[u32]) -> f64 {
        if context_ids.is_empty() || frag_ids.is_empty() {
            return 0.0;
        }
        let mut sum = 0.0;
        let mut count = 0u32;
        for &a in context_ids {
            for &b in frag_ids {
                sum += self.pmi(a, b);
                count += 1;
            }
        }
        if count == 0 { 0.0 } else { sum / count as f64 }
    }
}

/// A distinct fragment (a subset's tag list for one line), kept unique by text.
struct Fragment {
    tags: Vec<String>,
    ids: Vec<u32>,
}

/// Softmax-weighted pick from `(index, score)` candidates. Scores are shifted by
/// the max before exp for numerical stability. Returns the POSITION within
/// `cands`, so the caller reads both the pool index and the score directly.
fn sample_softmax(cands: &[(usize, f64)], rng: &mut Rng) -> usize {
    if cands.len() == 1 {
        return 0;
    }
    let max = cands.iter().map(|c| c.1).fold(f64::NEG_INFINITY, f64::max);
    let weights: Vec<f64> = cands.iter().map(|c| (c.1 - max).exp()).collect();
    let total: f64 = weights.iter().sum();
    let mut r = rng.next_f64() * total;
    for (i, w) in weights.iter().enumerate() {
        r -= w;
        if r <= 0.0 {
            return i;
        }
    }
    cands.len() - 1
}

fn hash_str(s: &str) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}

/// Generate up to `count` whole prompts by sampling one fragment per subset (in
/// `subset_order`), each pick conditioned on the accumulated context so the
/// prompt stays coherent. Bounded to `count` outputs regardless of pool size.
pub fn generate(
    corpus_lines: Vec<String>,
    fragment_sets: Vec<FragmentSetIn>,
    subset_order: Vec<u64>,
    options: GenerateOptions,
) -> Vec<GeneratedPrompt> {
    let index = CoocIndex::build(&corpus_lines);

    // Distinct fragment pools per subset, restricted to the chosen register.
    let mut pools: HashMap<u64, Vec<Fragment>> = HashMap::new();
    let mut seen: HashMap<u64, HashSet<String>> = HashMap::new();
    for fs in fragment_sets {
        if !options.register.is_empty() && fs.register != options.register {
            continue;
        }
        for fg in fs.fragments {
            if fg.tags.is_empty() {
                continue;
            }
            let text = fg.tags.join(", ");
            let s = seen.entry(fg.subset_id).or_default();
            if s.insert(text) {
                let ids = index.ids_of(&fg.tags);
                pools.entry(fg.subset_id).or_default().push(Fragment { ids, tags: fg.tags });
            }
        }
    }

    let must_ids = index.ids_of(&options.must_include);
    let mut rng = Rng(options.seed ^ hash_str(&options.register));
    let mut out: Vec<GeneratedPrompt> = Vec::new();
    let mut combo_seen: HashSet<String> = HashSet::new();

    // Bounded attempts so a small pool that can't yield `count` uniques still ends.
    let max_attempts = options.count.saturating_mul(20).max(50);
    let mut attempts = 0u32;

    while (out.len() as u32) < options.count && attempts < max_attempts {
        attempts += 1;

        // Seed the prompt with the must-include tags (also the initial context).
        let mut context_ids: Vec<u32> = must_ids.clone();
        let mut seen_tags: HashSet<String> = HashSet::new();
        let mut parts: Vec<String> = Vec::new();
        for t in &options.must_include {
            if seen_tags.insert(norm_tag(t)) {
                parts.push(t.clone());
            }
        }

        let mut score_sum = 0.0;
        let mut score_n = 0u32;

        for sid in &subset_order {
            let pool = match pools.get(sid) {
                Some(p) if !p.is_empty() => p,
                _ => continue,
            };

            // Score each candidate against the accumulated context.
            let scored: Vec<(usize, f64)> = pool.iter().enumerate()
                .map(|(i, f)| (i, index.fit_score(&context_ids, &f.ids)))
                .filter(|(_, s)| *s >= options.min_score as f64)
                .collect();
            // If nothing clears the threshold, fall back to the whole pool so a
            // prompt still forms (the first subset also lands here, no context yet).
            let candidates = if scored.is_empty() {
                pool.iter().enumerate().map(|(i, _)| (i, 0.0)).collect::<Vec<_>>()
            } else {
                scored
            };

            let (chosen, s) = candidates[sample_softmax(&candidates, &mut rng)];
            score_sum += s;
            score_n += 1;

            let frag = &pool[chosen];
            for t in &frag.tags {
                if seen_tags.insert(norm_tag(t)) {
                    parts.push(t.clone());
                }
            }
            context_ids.extend(&frag.ids);
        }

        if parts.is_empty() {
            continue;
        }
        let text = parts.join(", ");
        if !combo_seen.insert(text.clone()) {
            continue;
        }
        let score = if score_n == 0 { 0.0 } else { (score_sum / score_n as f64) as f32 };
        out.push(GeneratedPrompt { text, score });
    }

    out
}

// `(async)` keeps the corpus-scale index build + sampling off the main thread.
#[tauri::command(async)]
pub fn generate_prompts(
    corpus_lines: Vec<String>,
    fragment_sets: Vec<FragmentSetIn>,
    subset_order: Vec<u64>,
    options: GenerateOptions,
) -> Result<Vec<GeneratedPrompt>, String> {
    Ok(generate(corpus_lines, fragment_sets, subset_order, options))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fg(subset_id: u64, tags: &[&str]) -> FragmentGroup {
        FragmentGroup { subset_id, tags: tags.iter().map(|s| s.to_string()).collect() }
    }

    fn opts(count: u32, must: &[&str], register: &str) -> GenerateOptions {
        GenerateOptions {
            count,
            must_include: must.iter().map(|s| s.to_string()).collect(),
            min_score: -100.0,
            register: register.to_string(),
            seed: 42,
        }
    }

    #[test]
    fn generates_bounded_count_and_is_deterministic() {
        let corpus: Vec<String> = (0..10).flat_map(|_| vec![
            "1girl, red dress, smile".to_string(),
            "1girl, blue skirt, blush".to_string(),
        ]).collect();
        let sets = vec![
            FragmentSetIn { register: "all".into(), fragments: vec![fg(1, &["red dress"]), fg(2, &["smile"])] },
            FragmentSetIn { register: "all".into(), fragments: vec![fg(1, &["blue skirt"]), fg(2, &["blush"])] },
        ];

        let a = generate(corpus.clone(), sets.clone(), vec![1, 2, 0], opts(5, &[], ""));
        let b = generate(corpus, sets, vec![1, 2, 0], opts(5, &[], ""));

        // Bounded: at most `count`, never a blowup of the pool product.
        assert!(a.len() <= 5);
        assert!(!a.is_empty());
        // Deterministic for a fixed seed.
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.text, y.text);
        }
    }

    #[test]
    fn must_include_tags_appear_in_every_prompt() {
        let corpus = vec!["1girl, red dress".to_string(); 5];
        let sets = vec![
            FragmentSetIn { register: "all".into(), fragments: vec![fg(1, &["red dress"])] },
        ];
        let out = generate(corpus, sets, vec![1], opts(3, &["masterpiece", "1girl"], ""));
        assert!(!out.is_empty());
        for p in &out {
            assert!(p.text.contains("masterpiece"));
            assert!(p.text.contains("1girl"));
        }
    }

    #[test]
    fn register_filter_restricts_fragment_pool() {
        let corpus = vec!["a, b".to_string(); 5];
        let sets = vec![
            FragmentSetIn { register: "daily".into(), fragments: vec![fg(1, &["serafuku"])] },
            FragmentSetIn { register: "explicit".into(), fragments: vec![fg(1, &["nude"])] },
        ];
        let out = generate(corpus, sets, vec![1], opts(4, &[], "daily"));
        assert!(!out.is_empty());
        for p in &out {
            assert!(p.text.contains("serafuku"));
            assert!(!p.text.contains("nude"));
        }
    }
}
