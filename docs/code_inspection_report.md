# ComfyView 통합 코드 감사 및 UI/UX 분석 보고서

**일자:** 2026년 4월 5일  
**작성자:** Gemini CLI (Code Inspector)  
**대상:** ComfyView 전체 코드베이스 (Frontend: React, Backend: Rust)

---

## 1. 개요 (Overview)
본 보고서는 ComfyView 프로젝트의 코드 일관성, 재사용성, 그리고 사용자 경험(UI/UX)의 일관성을 감사한 결과입니다. 현재 프로젝트는 기능적으로는 고도화되어 있으나, 급격한 기능 확정으로 인해 **'아일랜드형 컴포넌트(Island Components)'** 현상과 **'상태 저장소 파편화'**라는 전역적인 기술 부채를 안고 있습니다.

---

## 2. 주요 관찰 및 문제점 (Key Findings)

### 2.1 상태 관리 및 데이터 영속성 파편화 (Persistence Hydra)
현재 어플리케이션은 데이터를 저장하는 방식이 5가지 이상으로 나뉘어 있어, 데이터 동기화 및 유지보수에 큰 혼선을 초래하고 있습니다.

*   **Zustand (localStorage):** 전역 앱 설정 및 최근 경로 관리.
*   **Tauri Plugin Store:** [TagClassifier.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/TagClassifier.tsx) 및 [WildcardTools.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/WildcardTools.tsx)의 도구별 개별 설정 (`.settings.json`, `.tag_classifier.json`).
*   **LocalStorage (Direct):** [BatchCropModule.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/BatchCropModule.tsx)의 그리드/비율 기록.
*   **SQLite (rusqlite):** 이미지 인덱스 및 메타데이터.
*   **Plain Text Files:** 필터 제외 목록 ([default_exact_exclusion.txt](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src-tauri/default_exact_exclusion.txt) 등).

> **비판:** 동일한 종류의 설정값들이 서로 다른 레이어에 저장됨에 따라 'Single Source of Truth' 원칙이 위배되고 있습니다.

### 2.2 아일랜드형 컴포넌트 설계 (Monolithic Island Components)
[TagClassifier.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/TagClassifier.tsx) (51KB), [WildcardTools.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/WildcardTools.tsx) (40KB), [BatchCropModule.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/BatchCropModule.tsx) (20KB)와 같은 대형 컴포넌트들이 독립된 어플리케이션처럼 동작하고 있습니다.

*   **중복 구현:** `TagInput`, `Modal`, `ProgressBar`, `FileListItem`과 같은 기초 UI 요소들이 각 도구 내부에서 매번 새로 구현되었습니다.
*   **로직 매몰:** 태그 파싱, 정규화, Web Worker 로직이 컴포넌트 내부에 문자열 또는 인라인 함수로 포함되어 있어 단위 테스트가 불가능하고 다른 도구에서 재사용할 수 없습니다.
*   **UX 불일치:** `TagClassifier`는 전용 입력 UI를 사용하는 반면, `WildcardTools`는 `textarea`를 사용하는 등 동일한 '태그 입력' 행위에 대해 다른 경험을 제공합니다.

### 2.3 IPC 호출 및 경로 처리의 비일관성
프론트엔드에서 백엔드 명령(`invoke`)을 호출할 때 공통된 래퍼가 없습니다.

*   **경로 정규화 중복:** 프론트엔드에서 `path.replace(/\//g, '\\')`와 같은 처리를 곳곳에서 수행하고 있으며, 백엔드에서도 동일한 정규화를 수행합니다. 이는 운영체제별 경로 처리 오류의 온상이 됩니다.
*   **에러 핸들링:** 백엔드에서 던지는 에러 메시지를 프론트엔드에서 처리하는 방식이 제각각이며, 공통된 Toast 알림 외의 구조적 대응이 부족합니다.

### 2.4 비즈니스 로직의 레이어 침범
*   **태그 처리 로직:** 태그를 머지하고 필터링하는 핵심 알고리즘이 Rust 백엔드와 React 프론트엔드(및 Web Worker) 양쪽에 중복 구현되어 있습니다.
*   **웹 워커 관리:** `TagClassifier` 내부에 문자열로 박힌 워커 코드는 현대적인 빌드 시스템의 혜택(타입 체크, 트리 쉐이킹)을 전혀 받지 못하고 있습니다.

---

## 3. 개선을 위한 심층 고찰 (Recommendations)

### 3.1 영속성 계층 통합 (Unified Persistence)
*   **제안:** `tauri-plugin-store` 또는 `SQLite`로 모든 설정을 단일화해야 합니다. 특히 도구별 설정 파일(`json`)을 개별적으로 관리하기보다, 전역 Store의 서브 네임스페이스로 통합하여 관리하는 것이 효율적입니다.

### 3.2 공통 UI 라이브러리 추출 (Shared UI Kit)
*   **제안:** [src/components/ui](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/ui) 폴더를 신설하고 다음 요소들을 추출해야 합니다.
    *   `TagInput`: `TagClassifier`의 로직을 범용적으로 개선.
    *   `ModalLayout`: 헤더/푸터/본문 영역이 정해진 공통 모달 구조.
    *   `CommandButton`: `invoke` 상태(loading, disabled)를 내장한 버튼.

### 3.3 API 서비스 레이어 도입
*   **제안:** [src/api](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/api) 폴더 내에 `index.ts` 등을 통해 모든 `invoke` 호출을 캡슐화해야 합니다.
    *   이 레이어에서 경로 정규화(`normalizePath`)를 전담 처리합니다.
    *   타입 정의를 중앙화하여 프론트/백엔드 간 인터페이스 불일치를 방지합니다.

### 3.4 비즈니스 로직의 Backend 이관
*   **제안:** 복잡한 태그 연산(Waterfall Analysis 등)은 이미 강력한 `Wildcard` 엔진이 있는 Rust 백엔드로 완전히 이관해야 합니다. 프론트엔드는 데이터의 시각화와 입력만을 담당해야 합니다.

---

## 4. 결론 (Conclusion)
ComfyView는 뛰어난 기능을 보유하고 있으나, 현재의 구조는 신규 기능 추가 시 코드 중복을 가속화하고 버그 수정 비용을 높이는 병목 지점에 도달했습니다. **UI 요소의 컴포넌트화**와 **데이터 처리 로직의 백엔드 집중화**를 통해 코드베이스를 정비해야 할 시점입니다.

---
*본 보고서는 코드 수정 없이 순수 관찰과 고찰을 바탕으로 작성되었습니다.*
