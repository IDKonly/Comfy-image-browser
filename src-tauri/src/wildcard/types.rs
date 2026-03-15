use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct WildcardFilter {
    pub partial_match: Vec<String>,
    pub exact_match: Vec<String>,
    pub exceptions: Vec<String>,
    pub max_words: u32,
    pub min_tags: u32,
    pub max_depth: u32,
    pub simple_mode: bool,
    pub simple_exclusions: Vec<String>,
    pub mix_mode: bool,
    pub mix_depth: u32, // New: depth at which to start mixing features
    pub mix_tandem_min_branches: u32, // Minimum branches to consider tandem
    pub mix_tandem_ratio: f32, // Probability threshold for tandem
}
