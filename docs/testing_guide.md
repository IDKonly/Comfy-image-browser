# ComfyView 테스트 및 검증 가이드 (Testing Guide)

이 문서는 ComfyView의 주요 기능, 특히 **Wildcard Workshop**의 성능 및 데이터 일관성을 검증하기 위한 테스트 실행 방법을 안내합니다.

## 1. 테스트 코드 구조
모든 핵심 비즈니스 로직 테스트는 `src-tauri` 폴더 내에 위치하며, 최근 개선된 와일드카드 관련 테스트는 별도의 폴더로 통합 관리됩니다.

- **와일드카드 테스트 통합 폴더**: `src-tauri/src/wildcard/tests/`
  - `merger.rs`: 병합 알고리즘의 동작 원리 및 입출력 일관성 검증
  - `benchmarks.rs`: 대규모 데이터셋 기반 성능 벤치마크
- **기타 벤치마크**: `src-tauri/src/benchmarks.rs`
  - 메타데이터 추출 속도, 썸네일 생성 속도 등

## 2. 테스트 실행 방법

테스트를 실행하려면 터미널에서 `src-tauri` 디렉토리로 이동한 후 아래 명령어들을 사용하십시오.

### A. 동작 원리 및 일관성 테스트 (Merger)
병합 결과가 ComfyUI 호환 형식(`A{ , B|, C}`)을 따르는지, 그리고 병합 전후의 태그 데이터가 손실 없이 유지되는지 확인합니다.

```powershell
# 전체 병합 로직 테스트 실행
cargo test wildcard::tests::merger -- --nocapture
```

### B. 성능 벤치마크 (Benchmarks)
실제 6,000개 이상의 태그 데이터셋(`test/tag classifier source.txt`)을 로드하여 알고리즘의 처리 속도를 측정합니다.

```powershell
# 와일드카드 병합 성능 측정
cargo test wildcard::tests::benchmarks -- --nocapture
```

### C. 전체 테스트 실행
프로젝트의 모든 유닛 테스트 및 통합 테스트를 실행합니다.

```powershell
cargo test
```

## 3. 주요 검증 포인트 (Verification Points)

### 동작 원리 (Operating Principle)
- **쉼표 무결성**: 와일드카드 확장 결과가 절대 쉼표로 시작해서는 안 되며, 각 태그는 반드시 쉼표로 구분되어야 합니다.
- **포맷팅**: `{ , 옵션1| , 옵션2}` 형식을 사용하여 ComfyUI 워크플로우에서 첫 번째 옵션(공백) 선택 시 쉼표가 중복되는 문제를 방지합니다.

### 입출력 일관성 (I/O Consistency)
- **데이터 보존**: 입력된 모든 태그 세트는 병합된 와일드카드를 다시 확장했을 때 100% 동일하게 복원되어야 합니다.
- **신규 원소 방지**: 쉼표 구분이 잘못되어 두 개의 태그가 하나로 합쳐지거나, 하나의 태그가 찢어지는 현상이 없는지 검사합니다.

### 성능 목표 (Performance Goals)
- **처리 속도**: 6,000세트 기준 10초 이내 처리를 목표로 합니다 (현재 최적화 결과 약 4~5초 소요).
- **메모리 효율**: 역색인(Inverted Index)을 사용하여 불필요한 $O(N^2)$ 유사도 비교를 지양합니다.
