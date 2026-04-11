#[cfg(test)]
mod tests {
    use std::collections::HashSet;
    use crate::wildcard::merger::recursive_merge;
    use crate::wildcard::expansion::expand_single_line;

    fn string_set(tags: &[&str]) -> HashSet<String> {
        tags.iter().map(|s| s.to_string()).collect()
    }

    /// ( 동작 원리 검증 )
    /// ComfyUI의 실제 확장 로직을 시뮬레이션하여 쉼표 무결성을 검사합니다.
    /// A{ |, B|, C} 형식은 "A ", "A, B", "A, C"로 확장되어야 하며, 
    /// 어떠한 경우에도 쉼표로 시작하거나 각 태그 간 구분이 모호해져서는 안 됩니다.
    #[test]
    fn test_wildcard_expansion_raw_comfy_style() {
        let input_sets = vec![
            string_set(&["A"]),
            string_set(&["A", "B"]),
            string_set(&["A", "C"]),
        ];

        let merged = recursive_merge(&input_sets, 0.5, 0, 5);
        println!("Merged Result: {}", merged);

        // 검증: A{ |, B|, C} 형식을 따르는가?
        assert!(merged.contains("{ |, B|, C}") || merged.contains("{ |, C|, B}"), "Merged result format is wrong: {}", merged);
        assert!(merged.starts_with("A"), "Merged result should start with 'A'");
    }

    /// ( 입출력 일관성 검증 )
    /// 병합 전의 태그 세트 목록과 병합 후 확장된 결과의 태그 세트 목록이 100% 일치하는지 검사합니다.
    /// 만약 쉼표 구분이 잘못되었다면 새로운 원소가 나타난 것으로 판정되어 이 테스트가 실패합니다.
    #[test]
    fn test_wildcard_io_consistency() {
        let input_sets = vec![
            string_set(&["tag1", "tag2"]),
            string_set(&["tag1", "tag3"]),
            string_set(&["tag1", "tag2", "tag4"]),
        ];

        let merged = recursive_merge(&input_sets, 0.5, 0, 5);
        let expanded = expand_single_line(&merged);

        // 결과 세트 추출 및 비교
        for ex in expanded {
            let ex_tags: HashSet<String> = ex.split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            
            let matched = input_sets.iter().any(|input| *input == ex_tags);
            assert!(matched, "Output set {:?} was not present in original inputs. Possible comma separation issue.", ex_tags);
        }
    }

    #[test]
    fn test_tags_facial_leading_comma_reproduction() {
        use std::fs::read_to_string;
        use std::path::Path;
        use crate::wildcard::merger::merge_tag_groups;

        let dataset_path = Path::new("../test/tags_facial.txt");
        if !dataset_path.exists() { return; }

        let content = read_to_string(dataset_path).expect("Failed to read dataset");
        let tag_groups: Vec<HashSet<String>> = content.lines()
            .map(|line| line.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()).collect())
            .collect();

        // 0.3 similarity threshold as reported by user (causes massive groups)
        let results = merge_tag_groups(tag_groups, 0.3, 5);
        
        // [테스트 전략 최적화] 
        // 0.3 유사도에서는 수천 개의 태그가 묶여 조합 경우의 수가 수억 개를 초과하므로 
        // expand_single_line()을 통한 전수 조사는 메모리/CPU 폭발(Timeout)을 일으킵니다.
        // 대신, 생성된 와일드카드 문자열 자체의 Syntax를 검사하여 
        // "가장 앞에 {, !?|, ... 가 오면서 쉼표로 시작하게 되는 현상"을 검증합니다.
        for merged in results {
            let trimmed = merged.trim();
            
            // 1. 결과 문자열 자체가 쉼표로 시작하는지 검사
            assert!(!trimmed.starts_with(','), "Merged string starts with a comma: {}", merged);
            
            // 2. 공통 분모(Base) 없이 쉼표로 시작하는 괄호 그룹이 맨 앞에 오는지 검사
            // 예: "{, " 또는 "{|," 로 시작하면 전개 시 첫 항목이 쉼표로 시작하게 됨
            assert!(!trimmed.starts_with("{,"), "Merged string starts with {{, : {}", merged);
            assert!(!trimmed.starts_with("{|,"), "Merged string starts with {{|, : {}", merged);
            
            // 3. 잘못된 파이프-쉼표 조합 검사 ({|, } 등)
            assert!(!trimmed.contains("{|,"), "Merged string contains invalid empty-pipe-comma sequence: {}", merged);
        }
    }
}
