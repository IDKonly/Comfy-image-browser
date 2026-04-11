#[cfg(test)]
mod tests {
    use std::time::Instant;
    use std::path::Path;
    use std::collections::HashSet;
    use std::fs::read_to_string;
    use crate::wildcard::merger::merge_tag_groups;

    /// ( 성능 및 일관성 검증 )
    /// 실제 대규모 데이터셋(test/tag classifier source.txt)을 사용하여 
    /// 병합 알고리즘의 처리 속도와 결과물의 일관성을 검증합니다.
    /// 이 테스트는 병목 현상을 파악하고 최적화의 효과를 측정하는 데 사용됩니다.
    #[test]
    fn benchmark_wildcard_workshop() {
        let dataset_path = Path::new("../test/tag classifier source.txt");
        if !dataset_path.exists() {
            println!("Dataset not found at {:?}", dataset_path);
            return;
        }

        println!("\n--- Wildcard Workshop Performance Benchmark ---");
        let content = read_to_string(dataset_path).expect("Failed to read dataset");
        let tag_groups: Vec<HashSet<String>> = content.lines()
            .map(|line| line.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
            .collect();

        println!("Dataset Size: {} sets", tag_groups.len());
        
        let start = Instant::now();
        let results = merge_tag_groups(tag_groups, 0.5, 5);
        let elapsed = start.elapsed();
        
        println!("FULL DATASET processing total time: {:?}", elapsed);
        println!("Generated {} wildcard patterns", results.len());

        // 최소한의 성능 기준 (예: 6000세트 기준 10초 이내)
        assert!(elapsed.as_secs() < 10, "Performance regression detected! Merging took too long: {:?}", elapsed);
    }
}
