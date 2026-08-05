# 파이프라인 문맥 보존 & 재조립 구현 계획

목표: 파이프라인이 프롬프트를 그룹으로 분해할 때 **장면 문맥(레지스터)을 보존**하고,
보존된 문맥 위에서 **검증된 궁합 기반의 재조립**으로 안정적인 프롬프트 조합을 대량
생성한다.

세 아이디어(차선 분리 / 레지스터 축 / 재조립기)는 적층 구조이므로 3개 Phase로
출시한다. Phase 1이 끝나면 즉시 실사용 가능하고, 각 Phase는 이전 Phase의 산출물을
입력으로 그대로 사용한다.

```
Phase 1  SFW/NSFW 차선 분리      → output/{sfw,nsfw}/<subset>.txt
Phase 2  레지스터 축 일반화       → output/<register>/<subset>.txt
Phase 3  앵커-위성 재조립기       → output/<register>/combined.txt
```

---

## 현재 구조 요약 (변경 지점 기준)

| 단계 | 위치 | 비고 |
|---|---|---|
| 1. 프롬프트 추출 | `db::get_all_prompts` → `src/api/wildcardPipeline.ts:33` | 문자열 배열만 반환, 출처 소멸 |
| 2. Workshop 정제 | `wildcard::generate_wildcards` | `preserve_order` 여부에 따라 라인 병합 발생 |
| 3. 프리셋 로드 | `wildcardPipeline.ts:51-69` | AppData `classifier_presets/*.json` |
| 4. 폭포수 분류 | `wildcard::classifier::classify_prompts` | 라인별 subset 매치 반환 (`ClassificationResult`) |
| 5. 저장 | `wildcardPipeline.ts:75-100` + `pipeline_save_file` | **여기서 라인별 문맥이 소실됨** |

핵심 재료:
- `nsfw::NsfwMatcher` — 단어경계+복수형 처리 키워드 매처. 모바일 피드/`classify_nsfw`와 판정 기준 공유.
- `mobileServerSettings.nsfwTags` — 사용자 편집 가능한 키워드 목록 (스토어 persist + 백엔드 동기화 배관 완비).
- `ClassificationResult.data` — 라인별 subset 매치. **Phase 3의 조각 세트가 이미 여기 있음** (현재는 파일로 납작하게 만들며 버리는 정보).

주의: 레지스터 판정은 **2단계 정제 후의 cleaned line**에 대해 수행한다.
`preserve_order=false`면 Workshop이 라인을 병합하므로 원본 이미지와 1:1 대응이
깨지지만, cleaned line 자체가 재조립의 단위이므로 cleaned line 기준 판정이 옳다.

---

## Phase 1 — SFW/NSFW 차선 분리

**산출물**: 파이프라인 모드 `전체 / SFW만 / NSFW만 / 분리 저장`. 분리 저장 시
`output/sfw/`, `output/nsfw/` 하위 폴더에 subset 파일 생성.

### 1-1. Rust: 라인 일괄 판정 커맨드

`src-tauri/src/wildcard/commands.rs`에 추가 (NsfwMatcher 재사용):

```rust
/// Judge each line with the shared NsfwMatcher. Same semantics as the mobile
/// SFW feed: positive-prompt text only, whole-word + plural matching.
#[tauri::command]
pub fn classify_nsfw_lines(lines: Vec<String>, tags: Vec<String>) -> Vec<bool> {
    let matcher = crate::nsfw::NsfwMatcher::new(&tags);
    lines.iter().map(|l| matcher.is_nsfw(Some(l), None)).collect()
}
```

- `lib.rs` invoke_handler에 등록.
- 단위 테스트: 경계 케이스(`sexy dress` 미매치, `nipples` 복수형 매치)는 nsfw.rs
  테스트가 이미 커버하므로, 여기서는 빈 tags → 전부 false만 확인.

### 1-2. 프론트: 타입/설정

`src/store/types.ts`:

```ts
export type PipelineSeparationMode = 'all' | 'sfwOnly' | 'nsfwOnly' | 'split';

export interface WildcardPipelineSettings {
  // ...기존 필드...
  separationMode: PipelineSeparationMode;   // default 'all'
}
```

`DEFAULT_PIPELINE_SETTINGS`에 `separationMode: 'all'` 추가. 저장된 설정에 필드가
없으면 spread 병합으로 기본값이 적용되도록 `PipelinePanel`의 로드 코드를
`setCfg({ ...DEFAULT_PIPELINE_SETTINGS, ...saved })`로 수정 (하위호환).

### 1-3. 파이프라인 본체 개조

`src/api/wildcardPipeline.ts` — 2단계와 3단계 사이에 차선 분기 삽입:

```
cleanedLines
  → classifyNsfwLines(cleanedLines, nsfwTags)      // invoke 인자는 camelCase!
  → lanes: { sfw: string[], nsfw: string[] }
  → 모드별로 대상 lane 선택
  → lane마다 기존 4~5단계(classify → save) 실행
  → split 모드일 때만 outputFolder에 'sfw'/'nsfw' 하위 경로 부여
```

구현 지침:
- 기존 4~5단계를 `classifyAndSave(lines, subsets, wordGroups, outDir, cfg)` 헬퍼로
  추출하고 lane 루프에서 호출한다 (중복 제거).
- `nsfwTags`는 `PipelineConfig`에 필드로 추가하고, `PipelinePanel`에서
  `useAppStore(s => s.mobileServerSettings.nsfwTags)`로 주입한다.
- `PipelineResult`에 lane별 통계 추가: `laneCounts?: { sfw: number; nsfw: number }`.
- 한쪽 lane이 0줄이면 그 lane은 건너뛰되 에러로 취급하지 않는다 (전체 0줄일 때만
  기존 에러 유지).

### 1-4. UI

`PipelinePanel.tsx`: Preset/Recursive 행 아래에 4버튼 세그먼트 컨트롤 추가
(전체 / SFW / NSFW / 분리). 결과 카드에 lane별 줄 수 표시.

### 1-5. 검증

- `cargo test` (신규 커맨드 테스트 포함).
- `test/tag classifier source.txt`를 소스로 분리 모드 실행 → sfw/nsfw 폴더 생성,
  sfw 쪽에 `sex`/`nipples` 포함 라인이 없는지 grep으로 확인.
- 기존 설정 파일(separationMode 없는)로 로드 시 'all' 동작 확인.

**규모**: Rust ~20줄, TS ~80줄, UI ~40줄. 반나절.

---

## Phase 2 — 레지스터 축 일반화

**산출물**: 프리셋에 사용자 정의 레지스터(장면 축) 목록. 파이프라인이
`output/<레지스터명>/<subset>.txt` 매트릭스로 저장. Phase 1의 4모드는 유지하되,
레지스터가 정의된 프리셋에서는 레지스터 분리가 우선.

### 2-1. 데이터 모델

Subset과 동형이지만 **라인 전체를 판정**한다는 점이 다르다. 폭포수 우선순위는
배열 순서, 아무 데도 매치 안 되면 마지막의 fallback 레지스터로.

```ts
// src/components/tagclassifier/types.ts
export interface Register {
  id: number;
  name: string;            // 폴더명으로 사용됨 — 파일명 불가 문자 sanitize 필요
  keywords: string[];      // 하나라도 매치 → 이 레지스터 (excludeKeywords 통과 시)
  excludeKeywords: string[];
  isFallback?: boolean;    // true인 항목은 keywords 무시, 최후 수용소
}
```

프리셋 JSON 스키마 확장 (하위호환 — 필드 없으면 레지스터 미사용):

```json
{ "subsets": [...], "wordGroups": [...], "registers": [...] }
```

기본 시드 (신규 레지스터 UI에서 "기본값 생성" 버튼):

```
1. 행위 (explicit) : sex, penetration, cum, fellatio, cunnilingus, masturbation,
                     vaginal, ejaculation, hetero, dildo, object insertion ...
2. 노출 (exposure) : nude, nudity, naked, topless, bottomless, nipple, areola,
                     penis, pussy, anus, no panties, no bra, ahegao ...
3. 일상 (daily)    : isFallback: true
```

(1·2의 키워드는 `DEFAULT_NSFW_TAGS`를 행위/노출로 이분해 시드하고 사용자가 편집.)

### 2-2. Rust: 레지스터 판정 커맨드

`src-tauri/src/wildcard/classifier.rs`에 추가. NsfwMatcher와 동일한
단어경계+복수형 매칭을 쓰되 exclude 거부권을 얹는다:

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterDef {
    pub id: u64,
    pub name: String,
    pub keywords: Vec<String>,
    pub exclude_keywords: Vec<String>,
    #[serde(default)]
    pub is_fallback: bool,
}

/// Returns, per line, the id of the first register whose keywords match and
/// whose exclude_keywords don't. Falls back to the first is_fallback register
/// (or the last register) when nothing matches.
#[tauri::command]
pub fn classify_registers(lines: Vec<String>, registers: Vec<RegisterDef>) -> Vec<u64>
```

구현: 레지스터마다 `NsfwMatcher` 2개(include/exclude)를 미리 컴파일,
`lines.par_iter()`로 순회. 폭포수: 배열 순서대로 첫 매치 승리.

테스트: 행위>노출 우선순위(둘 다 매치되는 라인은 행위로), exclude 거부권,
fallback 동작.

### 2-3. TagClassifier UI

- `src/components/tagclassifier/`에 `RegisterCard.tsx` 추가 — `SubsetCard`와 같은
  편집 UX(키워드 chip 입력, exclude 목록). 드래그 또는 ↑↓ 버튼으로 우선순위 변경.
- `LibraryView`(또는 프리셋 편집 화면)에 "Registers" 섹션 추가. 프리셋
  저장/로드(`classifier_presets/*.json`)와 `.tag_classifier.json` 직렬화에
  `registers` 포함.
- **미리보기**: 기존 분류 미리보기 라인에 레지스터 배지(색상 칩)를 붙여, 어떤
  라인이 어느 레지스터로 갈지 실행 전에 확인 가능하게 한다. (백엔드
  `classify_registers`를 미리보기에서도 호출 — 설정 통합 원칙에 따라 프론트에서
  판정 로직을 복제하지 않는다.)

### 2-4. 파이프라인 통합

`wildcardPipeline.ts`:

```
프리셋에 registers 있음?
  ├─ 예: classify_registers로 cleaned line들을 레지스터별 파티션
  │      → 파티션마다 classifyAndSave(..., `${outputFolder}/${registerName}`)
  └─ 아니오: Phase 1의 separationMode 로직 그대로
```

- 레지스터명 폴더 sanitize: `[\\/:*?"<>|]` → `_`.
- `PipelineResult`에 레지스터별 카운트 맵 추가, 결과 카드에 표시.
- `PipelinePanel`: 프리셋 선택 시 레지스터 보유 여부를 읽어 "이 프리셋은
  레지스터 N개로 분리 저장합니다" 안내 문구 표시. separationMode 컨트롤은
  레지스터 보유 프리셋에서 비활성화(중복 축 방지).

### 2-5. 검증

- `cargo test` 신규 테스트.
- 실사용 프리셋 `aaaa`에 기본 레지스터 3종을 추가하고 `test/tag classifier
  source.txt`로 실행 → 행위/노출/일상 폴더 산출물 육안 확인 (예: 1번 라인
  `after sex, ... cum in pussy ...` → 행위, 2번 라인 → 일상).
- 레지스터 없는 구버전 프리셋 로드/실행 회귀 확인.

**규모**: Rust ~120줄+테스트, TS/UI ~300줄. 2~3일.

---

## Phase 3 — 앵커-위성 재조립기

**산출물**: 파이프라인 5단계 "Recombine". 레지스터×그룹으로 보존된 조각을,
사용자 DB의 공출현 통계로 궁합 점수를 매겨 조합한 `combined.txt` 생성.
미리보기 UI 포함.

### 3-1. 조각 세트 보존

`classifyAndSave`가 파일 저장과 별개로 라인별 구조를 반환하도록 변경:

```ts
interface FragmentSet {          // cleaned line 하나에서 나온 조각 묶음
  register: string;              // Phase 2 파티션 결과
  fragments: Map<subsetId, string[]>;  // subset별 매치 태그 (원문 순서 유지)
}
```

`ClassificationResult`가 이미 이 구조이므로 새 계산은 없다 — 버리지 않고 모아서
재조립 단계로 넘기기만 하면 된다.

### 3-2. Rust: 공출현 인덱스 + 재조립 커맨드

`src-tauri/src/wildcard/recombine.rs` 신설:

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecombineOptions {
    pub anchor_subset_id: u64,   // 앵커 그룹 (0 = unclassified)
    pub max_per_anchor: u32,     // 앵커 조각당 생성 조합 수 (기본 5)
    pub min_score: f32,          // 궁합 하한 (기본 0.0 = PMI 양수만)
    pub target_count: u32,       // 총 목표 조합 수 (0 = 제한 없음)
    pub seed: u64,               // 재현 가능 샘플링
}

#[tauri::command]
pub fn recombine_fragments(
    corpus_lines: Vec<String>,          // 공출현 통계용 (cleaned lines 전체)
    fragment_sets: Vec<FragmentSetIn>,  // 라인별 { register, fragments }
    subset_order: Vec<u64>,             // 출력 태그 순서 = subset 정의 순서
    options: RecombineOptions,
) -> Result<Vec<RecombinedPrompt>, String>
```

알고리즘:

1. **태그 인터닝**: corpus 전체 태그에 u32 id 부여 (`HashMap<String, u32>`).
2. **공출현 카운트**: 라인별 태그 집합에서 순서쌍 `(min,max)` 카운트.
   `HashMap<(u32,u32), u32>`. rayon fold/reduce (get_tag_counts와 같은 패턴).
3. **PMI 점수**: `pmi(a,b) = ln( p(a,b) / (p(a)·p(b)) )`. 희소쌍 잡음 억제를 위해
   공출현 3회 미만 쌍은 0 처리.
4. **조각 간 궁합**: `score(F, G) = mean over (a∈F, b∈G) of pmi(a,b)`
   (교차쌍 산술평균; 조각 크기에 불변).
5. **샘플링**: 레지스터별로 —
   - 앵커 subset의 고유 조각 목록을 순회.
   - 각 위성 subset에서 `score ≥ min_score`인 조각을 softmax(score) 가중
     샘플링으로 `max_per_anchor`회 추첨 (seed 기반 `StdRng` — 재현성).
   - 조합 = 앵커 + 위성들을 `subset_order` 순으로 join. 전역 HashSet으로 중복 제거.
6. 반환: `{ register, text, score }[]` — 점수 내림차순.

성능 가늠: 1만 라인 × 평균 40태그 → 쌍 ~800만 카운트 연산, HashMap으로 수백 ms
수준. 문제 시 태그 상위 N만 인덱싱하는 컷오프 추가 (마이크로 최적화는 측정 후).

주의: `Date/rand` — Tauri 커맨드이므로 제약 없음. seed는 프론트에서
`Date.now()`로 넘겨 UI에 표시(재현용 복사 버튼).

### 3-3. 파이프라인/UI 통합

- `WildcardPipelineSettings` 확장: `recombine: { enabled, anchorSubsetId,
  maxPerAnchor, minScore, targetCount }`.
- 파이프라인 흐름: 5단계 저장 후 `recombine.enabled`면 6단계로
  `recombine_fragments` 호출 → 레지스터별 `combined.txt` 저장
  (`output/<register>/combined.txt`).
- `PipelinePanel`에 "Recombine" 접이식 섹션: 앵커 그룹 드롭다운(프리셋의 subset
  목록 + Unclassified), 조합 수/하한 슬라이더.
- **미리보기 모달**: 저장 전 상위 50개 조합을 점수와 함께 리스트로 표시,
  개별 체크 해제 후 저장. (품질 임계값 튜닝은 이 화면에서 체감으로 하게 됨.)

### 3-4. 검증

- Rust 단위 테스트: 소형 코퍼스로 PMI 부호 검증 (`serafuku`↔`sex` 낮음,
  `open shirt`↔`sex` 높음이 되는 인공 데이터), seed 고정 재현성, 중복 제거.
- 통합: 실데이터로 실행 후 combined.txt 상위/하위 조합을 육안 검토 —
  "일상 레지스터 조합에 행위 태그 0건"을 grep으로 확인.

**규모**: Rust ~350줄+테스트, TS/UI ~250줄. 4~5일.

---

## 공통 사항

- **invoke 인자는 camelCase** (snake_case는 조용히 실패 — 프로젝트 메모리).
  Rust 쪽 `#[serde(rename_all = "camelCase")]` 일관 적용.
- 설정은 전부 `.settings.json`(`settingsStore`) 경유 — 신규 키:
  `pipeline_settings.separationMode`, `pipeline_settings.recombine`.
  프리셋 파일에는 `registers`만 추가.
- 각 Phase 완료 시: `cargo test` + `npm test` + 실데이터 스모크 → 커밋 1개.
- README의 Pipeline 섹션을 Phase별로 갱신 (모드 설명, 레지스터 개념, 재조립).

## 리스크 및 대비

| 리스크 | 대비 |
|---|---|
| Workshop 병합(preserve_order=false)으로 레지스터 판정 대상이 합성 라인이 됨 | cleaned line 기준 판정은 의도된 동작. 다만 병합이 레지스터 경계를 흐릴 수 있으므로, 레지스터 사용 시 "preserve_order 권장" 안내를 UI에 표시 |
| 레지스터 키워드 초기 품질 | 기본 시드 + Phase 2 미리보기 배지로 실행 전 확인 루프 제공 |
| PMI 잡음(희소 태그) | 최소 공출현 3회 컷 + min_score 기본값 0 |
| unclassified가 앵커일 때 조각이 지나치게 길어짐 | 미리보기에서 체감 후, 필요 시 앵커 조각 태그 수 상한 옵션 추가 (초기 범위에서는 제외) |
