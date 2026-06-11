# P2 상세 실행 계획 (구조 리팩터링)

[improvement_roadmap.md](improvement_roadmap.md)의 P2 항목을 코드 실측 기반으로 구체화한다. 각 항목은 **독립 작업(별도 승인 후 착수)**이며, 모두 사용자 결정이 필요한 큰 변경이다.

> P1은 완료됨: API 서비스 레이어(`src/api/index.ts`) 도입 및 핵심 6개 파일 마이그레이션, ZoomPanViewer 메모이제이션 + 콜백 안정화, Inspector 셀렉터화, Undo 동기화, 죽은 코드 정리, api 회귀 테스트 추가.

## 진행 상황 (2026-06-06)
- **P2-5 (1단계 Slices) — ✅ 완료.** `store/types.ts` + `store/slices/{session,navigation,settings,workshop}Slice.ts`로 분리, 단일 `create()/persist`로 합성(스토리지 키/버전 유지 → 마이그레이션 위험 0). 기존 테스트 통과.
- **P2-6 — 대부분 완료.**
  - ✅ 공통 UI 키트 `src/components/ui/`(`ModalLayout`, `IconButton`, `ProgressBar`) 신설.
  - ✅ 추상화 검증: `TagRefiner`→`ModalLayout`, `AppFooter`→`ProgressBar`(0-division 가드 포함), `DebugPanel`→`IconButton`.
  - ✅ **전체 `invoke`→`api` 마이그레이션 완료**. 유일한 raw invoke는 TagClassifier의 제네릭 mock 디스패처(`browserFallback.tauriInvokeMock`).
  - ✅ 위험한 deprecated `apiClient.ts`(+테스트) 제거.
  - ✅ **모놀리식 컴포넌트 구조 분해** (다중 에이전트 분석 청사진 기반, 행동 보존 + tsc/테스트/프로덕션 빌드 검증):
    - `BatchCropModule` 345→~190줄: `batchcrop/`(types, utils, CropBox, CropToolbar, SelectionActionBar, CropHints).
    - `WildcardTools` 753→~480줄: `wildcardtools/`(utils, MergeFilterModal, TargetImagesPanel, TextPromptsPanel, CleaningBaseCard, WorkshopSettings, ExclusionFiltersSection, WorkshopResults).
    - `TagClassifier` 1225→~935줄: `tagclassifier/`(types, classify, browserFallback, TagInput) + **죽은 `workerRef` 제거**.
  - ℹ️ **"인라인 Web Worker" 항목은 무효**: 분석 결과 TagClassifier에 문자열 Worker는 존재하지 않았고, 할당된 적 없는 `workerRef`(dead code)만 있었음 → 제거로 갈음. 진짜 off-main-thread 분류가 필요하면 별도 신규 기능.
  - ⏳ **남은 작업(상태 스레딩 高위험 → 런타임 검증 필요)**: TagClassifier의 뷰 서브컴포넌트(`SubsetCard`, `SingleEditorView`, `LibraryView`, `OutputPanel`, `WorkstationToolbar`, `PresetBar`/`BulkSourceView`/`MobileSectionNav`/`WordGroupEditor`)와 각 모놀리식의 커스텀 훅(`useWorkshopSettings`/`useWorkshopEvents` 등). 수십 개의 `setX(x.map(...))` 콜백 스레딩이라 회귀 위험이 커 `npm run tauri dev` 검증과 함께 진행 권장.
- **P2-8 / P2-7 — 미착수.** 백엔드 parity·데이터 마이그레이션을 수반하므로 런타임 검증과 함께 별도 진행 권장.

> 남은 P2-6(뷰/훅 분해)·P2-8·P2-7은 런타임 검증(`npm run tauri dev`)이 필요한 큰 단위이며 각각 독립 진행을 권장한다.

---

## P2-5. 상태 저장소 분할 · 노력 L · 위험 M

### 현황
`src/store/useAppStore.ts`(약 400줄, 단일 store)가 5개 관심사를 혼재:
- **Navigation**: `images, currentIndex, currentMetadata, viewMode, batchMode, batchRange, batchMap, checkedIndices` + `removeImages/insertImage/toggleCheck/...`
- **Undo**: `undoStack` + `pushUndo/popUndo`
- **Settings(영속)**: `shortcuts, twitterSettings(비밀 제외), mobileServerSettings, recursive, sortMethod, imageCacheSize, sidebarWidth`
- **Workshop/Search**: `workshopFilter, workshopTargetPaths, similaritySearch*, searchAuthFolders, classifierSettings`
- **Session**: `folderPath, recentFolders`

전체 store를 `useAppStore()`로 통째 구독하는 컴포넌트(App 등)가 모든 상태 변경에 리렌더된다.

### 권장 접근 — 2단계
1. **(저위험·선행) Slices 패턴**: 단일 `create()`는 유지하되 파일을 `slices/navigationSlice.ts`, `settingsSlice.ts`, `workshopSlice.ts`, `undoSlice.ts`로 분리해 합성. **persist 키/스토리지 변경 없음 → 마이그레이션 위험 0.** 거대 파일 문제와 책임 분리를 우선 해결.
2. **(후속·선택) 물리적 store 분리**: `useNavigationStore`/`useSettingsStore`/`useWorkshopStore`로 분리. 이때 localStorage 단일 키(`comfy-image-browser-storage`)를 3개로 나누는 **1회성 마이그레이션** 필요(기존 키 읽어 분배 후 정리). 성능상 가장 큰 레버지만 위험도 높음.

### 단계별 작업(1단계 기준)
- `combine`/스프레드로 슬라이스 합성, 타입은 교집합으로 유지.
- 컴포넌트는 이미 셀렉터 사용 권장(P1에서 Inspector 적용). 나머지 leaf도 점진 셀렉터화.
- `partialize`/`migrate`는 그대로 유지.

### 위험 / 검증
- 2단계 진행 시 persist 마이그레이션 회귀가 핵심 위험 → 마이그레이션 단위 테스트 필수(기존 키 → 신규 키 매핑).
- 수용 기준: 모든 기존 테스트 통과 + 설정/최근 폴더/단축키가 업데이트 후에도 보존.

---

## P2-6. 공통 UI 키트 추출 + 모놀리식 컴포넌트 분해 · 노력 L · 위험 M

### 현황(중복 실측)
- 모달 셸(backdrop+panel+header/close)이 `SettingsModal`, `WildcardTools`, `TagClassifier`(`fixed inset-0 z-50`), `BatchCropModule`, `DebugPanel`, `TagRefiner`에 각각 재구현.
- `password` 입력(키 4종), 진행바(AppFooter/도구), invoke 버튼(loading/disabled) 패턴 반복.
- 대형 파일: `TagClassifier.tsx`(~51KB), `WildcardTools.tsx`(~40KB), `BatchCropModule.tsx`(~20KB). TagClassifier에는 **문자열로 박힌 Web Worker** 존재(타입체크/트리셰이킹 불가).

### 작업
1. `src/components/ui/` 신설:
   - `ModalLayout`(backdrop, ESC/외부클릭 닫기, header/body/footer 슬롯, 포커스 트랩)
   - `IconButton`(필수 `aria-label`) · `CommandButton`(async 호출 상태 내장) · `TagInput`(칩 입력) · `ProgressBar` · `PasswordField`
2. **검증 우선순위**: 작은 소비자부터 — `DebugPanel`, `TagRefiner`, `SettingsModal`을 `ModalLayout`으로 이전해 추상화 확정 → 이후 `WildcardTools`/`TagClassifier`/`BatchCropModule` 분해.
3. 분해 시 각 도구의 `invoke` 호출을 `api.*`로 이전(P1-1 점진 완료) + 인라인 Worker를 `src/workers/*.worker.ts`(Vite `?worker`)로 추출.

### 위험 / 검증
- UX 회귀(모달 동작/포커스) 위험 → 컴포넌트 단위 렌더 테스트 추가.
- 수용 기준: 시각/동작 동일성 유지, 대형 파일 라인수 대폭 감소, Worker 타입체크 적용.

---

## P2-7. 영속성 계층 통합 · 노력 L · 위험 M

### 현황(저장 방식 인벤토리)
| 데이터 | 현재 위치 |
| :--- | :--- |
| 전역 앱 설정/최근 폴더 | zustand localStorage (`comfy-image-browser-storage`) |
| Workshop 설정 | tauri-plugin-store `.settings.json` |
| Classifier 설정 | tauri-plugin-store `.tag_classifier.json` |
| BatchCrop 그리드/비율 | 직접 localStorage |
| 이미지 인덱스/메타데이터 | SQLite |
| 필터 제외 목록 | 평문 txt(`default_exact_exclusion.txt` 등) |
| Twitter 비밀 키 | **OS 키체인(완료)** |

### 작업
- **프런트 UI/도구 설정 단일화**: Workshop/Classifier/BatchCrop 설정을 zustand persist의 서브 네임스페이스로 통합(또는 tauri-plugin-store 단일 네임스페이스). 도구 컴포넌트의 직접 store 접근 제거.
- **유지**: SQLite(이미지 데이터), 키체인(비밀). 필터 txt는 사용자 편집 파일 특성상 유지하되 백엔드 경유 읽기로 일원화 검토.
- **1회성 마이그레이션**: 기존 `.settings.json`/`.tag_classifier.json`/직접 localStorage 값을 신규 위치로 이전.

### 의존성 / 위험
- P2-6(도구 분해) 이후가 안전(도구가 직접 plugin-store를 쓰므로).
- 위험: 마이그레이션 누락 시 사용자 설정 유실 → 백업/롤백 및 테스트 필요.

---

## P2-8. 태그 연산 로직 백엔드 일원화 · 노력 L · 위험 M

### 현황
태그 정규화/머지/분류 알고리즘이 **프런트(JS + TagClassifier 인라인 Worker)와 Rust `wildcard` 엔진(`merger/filter/classifier/mix/expansion`) 양쪽에 중복**. 프런트 구현은 테스트/재사용 불가.

### 작업
- Rust 측에 프런트가 쓰는 연산을 명령으로 노출(정규화, 머지, waterfall/classify 등). 일부는 이미 존재(`classify_prompts_command`, `compare_tags`, `get_tag_counts`).
- 프런트는 `api.*` 호출 후 **시각화/입력만** 담당, 인라인 Worker 제거.
- 결과 동등성(parity) 보장: 기존 `wildcard` Rust 테스트/벤치마크 활용 + 프런트 스냅샷 대조.

### 의존성 / 위험
- P1-1(api) + P2-6(Worker 추출) 선행 권장.
- 위험: 미묘한 동작 차이(쉼표/공백/이스케이프 처리). 회귀 테스트로 고정.

---

## 권장 착수 순서
1. **P2-5 (Slices 1단계)** — 저위험, 이후 작업 토대.
2. **P2-6 (UI 키트 → 모놀리식 분해)** — 중복 제거 + 도구 `api` 이전.
3. **P2-8 (태그 로직 백엔드 이관)** — Worker 제거.
4. **P2-7 (영속성 통합)** — 도구 분해 후 마이그레이션.
5. (선택) **P2-5 2단계 (물리적 store 분리)** — 성능 필요 시.

각 단계는 독립 PR 단위로, 기존 테스트 통과 + 신규 회귀 테스트 추가를 완료 기준으로 한다.
