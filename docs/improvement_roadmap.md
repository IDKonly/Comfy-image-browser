# ComfyView 개선 로드맵 및 우선순위 (2026-06-06)

기존 두 보고서([code_review_report_20260418](code_review_report_20260418.md), [code_inspection_report](code_inspection_report.md))의 제안과 이번 세션에서 발견한 항목을 종합하여, 영향도·노력·위험을 기준으로 우선순위를 정리한다.

범례 — 노력: S(작음)/M(중간)/L(큼), 위험: L/M/H, 의사결정: 사용자 결정 필요 여부.

---

## ✅ P0 — 완료 (이번 세션)

| 항목 | 내용 |
| :--- | :--- |
| Reload 강제 재인덱싱 버그 | `force_reindex`(snake) → `forceReindex`(camel). Tauri 인자 변환 규칙 위반으로 무시되던 버그 수정. |
| TagClassifier 모달 단축키 누수 | 전역 keydown 가드에 `showTagClassifier` 추가 (모달 뒤 이미지 이동/삭제 방지). |
| Peaking 토글 stale closure | keydown effect 의존성에 `viewMode` 추가 (`p` 두 번째 누름 복귀). |
| 모바일 서버 토스트 스팸 | 폴더 열 때마다 뜨던 성공 토스트를 설정 변경 시에만 표시. |
| **이미지 캐시/프리뷰 깜빡임** | ZoomPanViewer에 1024px 썸네일 기반 레이어 + 원본 onLoad 페이드인(progressive loading). 죽어 있던 `imageCacheSize` 프리로더 재연결(lazy→eager). |
| **Twitter 키 평문 저장(보안)** | OS 키체인(Windows Credential Manager, `keyring` crate)으로 이전. localStorage에서 비밀 키 완전 제거 + 자동 마이그레이션. |

---

## 🔴 P1 — 다음 단계 (고가치·중노력·저위험)

### 1. API 서비스 레이어 도입 · 노력 M · 위험 L–M · 결정 불필요
- `src/api/index.ts`에 모든 `invoke` 호출을 캡슐화하고 `normalizePath`를 전담 처리.
- 곳곳에 흩어진 `path.replace(/\//g, '\\')` 중복 제거, 인자 camelCase 강제 → **이번에 발견된 `force_reindex` 류 버그의 재발 방지**.
- 점진적 마이그레이션 가능(한 번에 한 명령씩). 두 보고서 모두 지적한 항목.

### 2. 렌더링 최적화(점진적) · 노력 M · 위험 L–M · 결정 불필요
- `App.tsx`가 store 전체를 구독해 모든 상태 변경(특히 이미지마다 `setCurrentMetadata`)에 전체 트리가 리렌더됨.
- 전면 store 분할(P2) 전에, 무거운 leaf(`Inspector`, `Sidebar`, `ImageGrid`)를 **셀렉터 기반 구독 + 콜백 메모이제이션**으로 전환하면 낮은 위험으로 체감 성능 개선.
- 현재 `Inspector`의 `React.memo`는 비메모 콜백 prop으로 무력화되어 있어 함께 처리해야 효과.

### 3. Undo 안정화 · 노력 S · 위험 L · 결정 불필요
- `removeImages`의 `setTimeout(0)` 기반 `pushUndo`를 같은 `set()` 내 동기 갱신으로 변경(실행 순서 경합 제거). 보고서 지적 항목.

### 4. 죽은 코드/공통 타입 정리 · 노력 S · 위험 L
- `ImageGrid`/`ZoomPanViewer`의 빈 useEffect/타이머 제거, 프론트 공용 `types.ts` 중앙화.

---

## 🟡 P2 — 구조 리팩터링 (대노력·결정 필요)

### 5. 상태 저장소 분할 · 노력 L · 위험 M–H · **결정 필요**
- `useAppStore`를 `useNavigationStore`/`useSettingsStore`/`useWorkshopStore`로 분리.
- **가장 큰 성능 레버**지만 전 컴포넌트에 영향 → P1-2(점진 최적화) 이후 효과/필요성 재평가 권장.

### 6. 공통 UI 키트 추출 + 모놀리식 컴포넌트 분해 · 노력 L · 위험 M · **결정 필요**
- `src/components/ui`: `ModalLayout`, `TagInput`, `CommandButton`(invoke 로딩 내장), `ProgressBar`.
- 대형 컴포넌트 분해: TagClassifier(~51KB), WildcardTools(~40KB), BatchCropModule(~20KB). 인라인 Web Worker 문자열도 별도 모듈로.

### 7. 영속성 계층 통합 · 노력 L · 위험 M · **결정 필요**
- 현재 5가지 저장 방식(Zustand/localStorage, tauri-plugin-store, 직접 localStorage, SQLite, 평문 txt)을 정리. 비밀 키→키체인은 완료. 도구별 `.json` 설정을 전역 store 서브 네임스페이스 또는 SQLite로 통합.

### 8. 태그 연산 로직 백엔드 일원화 · 노력 L · 위험 M · **결정 필요**
- 태그 머지/필터 알고리즘이 Rust와 프론트(+Web Worker)에 중복 구현됨. 강력한 `wildcard` 엔진으로 이관하고 프론트는 시각화/입력 담당.

---

## 🔵 P3 — 폴리시/인프라 (기회 될 때)

| 항목 | 노력 | 비고 |
| :--- | :--- | :--- |
| Tauri `generate_handler` 기능별 그룹화 | S | 가독성. lib.rs 핸들러 목록 비대. |
| `thiserror` 구조화 에러 타입 | M | `Result<T,String>`+`map_err` 반복 대체. |
| 로그 로테이션(fern) | S | 프로덕션 로그 크기 제한 부재. |
| metadata `brute_force_search` 매직넘버 가드/조기 반환 | S | 비이미지 파일 불필요 연산 방지. |
| 접근성: 아이콘 버튼 `aria-label`, 이미지 `alt` | S–M | 현재 title 의존. |
| `solid-*` 컬러 토큰 일관 적용 | M | tailwind 토큰 도입 완료, 적용 확산. UI/UX 보고서의 색상 파편화 대응. |

---

## 권장 진행 순서
1. **P1-1(API 레이어)** → 이후 모든 작업의 안전망. 
2. **P1-3(Undo) · P1-4(정리)** → 빠른 마무리.
3. **P1-2(점진 렌더 최적화)** → 성능 체감 개선 후, 필요 시 **P2-5(store 분할)** 결정.
4. P2-6/7/8은 각각 독립 작업으로 사용자 승인 후 착수.
