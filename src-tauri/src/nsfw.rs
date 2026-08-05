use regex::Regex;

/// Default NSFW keyword set, seeded into front-end settings and the mobile server's
/// initial state. Kept as base forms — plural/`-es` variants are handled by the matcher,
/// so "nipple" already covers "nipples". The user edits this list in Settings.
pub fn default_nsfw_tags() -> Vec<String> {
    [
        "sex", "nsfw", "nude", "nudity", "naked", "topless", "bottomless",
        "nipple", "areola", "penis", "pussy", "vagina", "vaginal", "anus",
        "clitoris", "testicle", "cum", "ejaculation", "penetration",
        "fellatio", "cunnilingus", "masturbation", "pubic", "ahegao", "cameltoe",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect()
}

/// Compiled set of NSFW keyword matchers. A keyword matches as a whole word with an
/// optional plural suffix (`s`/`es`): "sex" matches "sex"/"sexes" but not "sexy"/"unisex";
/// "nipple" also matches "nipples". Word boundaries are any non-alphanumeric character.
pub struct NsfwMatcher {
    regexes: Vec<Regex>,
}

impl NsfwMatcher {
    pub fn new(tags: &[String]) -> Self {
        let mut regexes = Vec::new();
        for tag in tags {
            let t = tag.trim().to_lowercase();
            if t.is_empty() {
                continue;
            }
            let escaped = regex::escape(&t);
            // (boundary)(keyword)(optional es|s)(boundary). Text is lowercased before matching.
            let pattern = format!(r"(^|[^a-z0-9])(?:{})(?:es|s)?([^a-z0-9]|$)", escaped);
            if let Ok(re) = Regex::new(&pattern) {
                regexes.push(re);
            }
        }
        Self { regexes }
    }

    pub fn is_empty(&self) -> bool {
        self.regexes.is_empty()
    }

    /// Match against text the caller has already lowercased — lets hot loops that
    /// probe several matchers per line lowercase the line once instead of per probe.
    pub fn matches_lowercase(&self, lower: &str) -> bool {
        self.regexes.iter().any(|re| re.is_match(lower))
    }

    fn matches_text(&self, text: &str) -> bool {
        if self.regexes.is_empty() {
            return false;
        }
        self.matches_lowercase(&text.to_lowercase())
    }

    /// NSFW is judged from the POSITIVE prompt and the filename only — never the negative
    /// prompt, since users put "nsfw"/"nude" there to *avoid* such content (a negative-prompt
    /// match would mean the image is intentionally SFW).
    pub fn is_nsfw(&self, prompt: Option<&str>, name: Option<&str>) -> bool {
        if let Some(p) = prompt {
            if self.matches_text(p) {
                return true;
            }
        }
        if let Some(n) = name {
            if self.matches_text(n) {
                return true;
            }
        }
        false
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn matcher() -> NsfwMatcher {
        NsfwMatcher::new(&["sex".into(), "nipple".into(), "pussy".into()])
    }

    #[test]
    fn whole_word_matches() {
        let m = matcher();
        assert!(m.is_nsfw(Some("1girl, sex, indoors"), None));
        assert!(m.is_nsfw(Some("exposed nipples"), None)); // plural
        assert!(m.is_nsfw(Some("pussy"), None));
    }

    #[test]
    fn avoids_false_positives() {
        let m = matcher();
        assert!(!m.is_nsfw(Some("sexy dress, unisex"), None));
        assert!(!m.is_nsfw(Some("a landscape photo"), None));
    }

    #[test]
    fn empty_matcher_never_matches() {
        let m = NsfwMatcher::new(&[]);
        assert!(m.is_empty());
        assert!(!m.is_nsfw(Some("sex"), Some("sex.png")));
    }
}
