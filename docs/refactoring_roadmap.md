# ComfyView 아키텍처 현대화 로드맵 (Top-Down)

본 로드맵은 코드 감사 보고서(`code_inspection_report.md`)에서 제기된 아일랜드형 컴포넌트 현상과 데이터 파편화를 해결하고, 시스템의 확장성을 확보하기 위한 단계별 실행 계획입니다.

---

## 🏁 Phase 1: 기반 인프라 표준화 (Foundation & Infrastructure)
개별 기능을 수정하기 전, 어플리케이션의 통신과 저장 방식을 정의하는 '규격'을 먼저 구축합니다.

### 1. 통합 API 서비스 레이어 구축 (`src/api`)
*   `invoke` 호출을 추상화한 `ApiService` 클래스 또는 함수군 도입.
*   모든 요청에 대해 OS별 경로 정규화(`normalizePath`)를 강제하는 미들웨어 로직 포함.
*   전역 에러 핸들러를 통한 예외 처리 표준화.

### 2. 영속성 레이어 단일화 전략 수립
*   `SQLite`를 설정 저장소로 확장하거나, `Zustand`와 연동된 단일 `JSON Store`로 모든 도구 설정을 통합.
*   `localStorage` 및 파편화된 `.json` 파일 사용 중단 선언 및 마이그레이션 유틸리티 작성.

### 3. 전역 상태(Store) 구조 재설계
*   도구별로 흩어진 상태를 `useAppStore` 내의 네임스페이스(예: `state.wildcard`, `state.classifier`)로 그룹화하여 관리.

---

## 🏁 Phase 2: 핵심 비즈니스 로직의 백엔드 집약 (Core Logic Centralization)
프론트엔드에 산재한 계산 집약적 로직을 Rust 백엔드로 이관하여 성능과 신뢰성을 높입니다.

### 1. 태그 분석 엔진 통합 (`src-tauri/src/wildcard`)
*   `TagClassifier`의 Waterfall Analysis 로직을 Rust의 `wildcard` 모듈로 이관.
*   프론트엔드의 Web Worker(문자열 형태) 제거 및 백엔드 멀티스레딩(`Rayon`) 활용.

### 2. 공통 필터링/파싱 로직 표준화
*   태그 분리, 중괄호 제거, 유사도 계산 등 기초 로직을 Rust 백엔드의 유틸리티로 단일화.

---

## 🏁 Phase 3: 원자적 UI 라이브러리 추출 (Atomic Design Implementation)
'아일랜드형 컴포넌트' 내부에서 중복 구현된 UI 요소들을 공통 컴포넌트로 분리합니다.

### 1. Shared UI Kit 구축 (`src/components/ui`)
*   `TagInput`: 제안형 태그 입력기 표준화.
*   `ModalLayout`: 헤더, 스크롤 영역, 푸터가 규격화된 모달 프레임.
*   `StatusIcon`: 처리 상태(Loading, Success, Error)를 표시하는 공통 아이콘 컴포넌트.

### 2. 디자인 시스템 토큰 적용
*   Tailwind CSS 설정(`tailwind.config.js`)을 강화하여 색상, 간격, 그림자 효과를 변수화하고 모든 컴포넌트에 강제 적용.

---

## 🏁 Phase 4: 기능별 점진적 마이그레이션 (Island Refactoring)
정비된 인프라와 UI Kit을 사용하여 대형 컴포넌트들을 하나씩 리팩토링합니다.

1.  **BatchCropModule 리팩토링:** `localStorage` 의존성 제거 및 표준 모달 프레임 적용.
2.  **WildcardTools 리팩토링:** `textarea` 기반 입력을 표준 `TagInput`으로 교체 및 백엔드 엔진 연동 최적화.
3.  **TagClassifier 리팩토링:** 인라인 Web Worker 제거 및 통합 분석 엔진 API 호출 방식으로 전환.

---

## 🏁 Phase 5: 검증 및 마무리 (Validation & Cleanup)
변경 사항이 시스템 전체의 성능과 UX에 미치는 영향을 검증합니다.

1.  **회귀 테스트 및 성능 벤치마킹:** 로직 백엔드 이관 후 대용량 데이터 처리 속도 비교.
2.  **레거시 코드 제거:** 더 이상 사용하지 않는 개별 설정 파일 및 중복 유틸리티 함수 삭제.
3.  **문서 업데이트:** 최신화된 아키텍처와 컴포넌트 사용법을 `docs/` 내에 반영.

---

### 🎯 로드맵 실행 지침
*   **외과적 수술 원칙:** 각 단계 이행 시 기존 기능이 멈추지 않도록 점진적으로 교체합니다.
*   **TDD 병행:** 백엔드 로직 이관 시 Rust 유닛 테스트를 통해 결과의 동일성을 보장합니다.
