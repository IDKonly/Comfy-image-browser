# ComfyView 코드 리뷰 보고서 (2026-04-18)

## 요약
ComfyView는 Tauri와 Rust를 활용하여 성능 최적화가 잘 되어 있는 이미지 브라우저입니다. 특히 백엔드에서의 멀티스레딩 활용과 SQLite를 통한 메타데이터 캐싱 전략이 인상적입니다. 하지만 프로젝트가 확장됨에 따라 프론트엔드 상태 관리의 비대화와 백엔드 자원 관리의 효율성 측면에서 개선의 여지가 발견되었습니다.

## 상태: RESOLVED (취약점 및 효율성 개선 완료)

---

## 🔴 핵심 발견 사항 (Critical Issues) - ✅ RESOLVED

### 1. 경로 검증 및 보안 (Path Traversal Risk) - ✅ Fixed
*   **문제:** 파일 조작 명령이 절대 경로를 그대로 사용하여 Path Traversal 위험이 있었음.
*   **해결책:** `scanner::validate_path` 유틸리티를 도입하여, 모든 파일 조작이 현재 앱에서 오픈된 디렉토리 하위에서만 발생하도록 검증 로직을 강제함.

### 2. SQLite 연결 관리 비효율성 - ✅ Fixed
*   **문제:** 명령 호출 시마다 `DB::open()`을 수행하여 오버헤드와 잠금 위험이 있었음.
*   **해결책:** Tauri `DbState`를 도입하여 앱 시작 시 단일 DB 커넥션을 초기화하고, `Mutex`를 통해 안전하게 공유하도록 구조를 변경함.

---

## 🟡 주요 개선 제안 (Important Improvements)

### 1. 프론트엔드 상태 관리(Store) 분할
*   **문제:** `useAppStore.ts`가 내비게이션, 이미지 목록, 각종 설정(Twitter, Workshop, Shortcuts)을 모두 포함하고 있어 파일 크기가 비대해지고 유지보수가 어렵습니다.
*   **해결책:** `useNavigationStore`, `useSettingsStore`, `useWorkshopStore` 등으로 관심사를 분리하십시오.

### 2. Undo 시스템의 안정성 확보
*   **문제:** `useAppStore.ts`의 `removeImages`에서 `setTimeout`을 사용하여 `pushUndo`를 호출합니다. 이는 상태 업데이트 경합을 피하기 위한 임시방편으로 보이나, 실행 순서가 보장되지 않을 위험이 있습니다.
*   **해결책:** Zustand의 미들웨어를 활용하거나, 액션 완료 후 명시적으로 상태를 업데이트하는 흐름으로 변경하십시오.

### 3. 메타데이터 파싱 엣지 케이스 처리
*   **문제:** `metadata.rs`의 `brute_force_search`가 4096 바이트를 무조건 읽어들입니다. 만약 매우 큰 파일이거나 이미지가 아닌 파일이 섞일 경우 불필요한 연산이 발생할 수 있습니다.
*   **해결책:** 파일 매직 넘버 검사를 강화하고, 실패 시의 조기 반환(Early Return) 로직을 더 정교화하십시오.

---

## 🔵 소소한 제안 및 스타일 (Minor Suggestions)

*   **Tauri Handler 분리:** `lib.rs`의 `invoke_handler` 목록이 너무 깁니다. 기능별로 `generate_handler!`를 래핑하는 함수를 만들어 가독성을 높이십시오.
*   **Error Mapping:** `Result<T, String>`과 `.map_err(|e| e.to_string())` 조합 대신 `thiserror` 라이브러리를 사용하여 구조화된 에러 타입을 정의하는 것을 권장합니다.
*   **Logging:** `fern`을 통한 로깅은 좋으나, 프로덕션 환경에서 로그 파일 크기 제한(Rotation) 로직이 보이지 않습니다.

---

## 상세 피드백

| 파일 | 라인 | 이슈 | 권장 수정 |
| :--- | :--- | :--- | :--- |
| `src-tauri/src/db.rs` | L87 | 매번 DB 오픈 | Tauri `State`를 사용해 커넥션 유지 |
| `src-tauri/src/file_ops.rs` | L14 | 경로 검증 부재 | `is_descendant_of` 검증 로직 추가 |
| `src/store/useAppStore.ts` | L185 | `setTimeout` 사용 | 액션 시퀀스 동기화 또는 미들웨어 도입 |
| `src/api/apiClient.ts` | L31 | 경로 정규화 로직 | 백엔드에서도 정규화 및 검증 강제 |

---

## 질문 및 확인 사항
*   `TwitterSettings`에 API Key 등 민감 정보가 포함되어 있는데, 이를 `localStorage`에 평문 저장하는 것이 허용된 범위입니까? 보안이 중요하다면 시스템 키체인 연동을 고려해야 합니다.

## 긍정적인 부분 (Positive Highlights)
*   **성능 중심 설계:** `scanner.rs`에서 포커스(현재 보고 있는 이미지)를 기준으로 인덱싱 우선순위를 동적으로 조정하는 로직은 UX 측면에서 매우 훌륭합니다.
*   **확장성:** ComfyUI와 A1111의 다양한 메타데이터 포맷을 `parse_universal`로 통합 처리하는 구조가 견고합니다.
