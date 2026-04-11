# ComfyView 기능 회귀 분석 보고서 (Regression Report)

**일자:** 2026년 4월 5일  
**작성자:** Gemini CLI  
**기준 커밋:** `75e0c9e` (리팩토링 시작 전) 대비 현재 상태

---

## 1. 개요
리팩토링 로드맵(`refactoring_roadmap.md`)에 따른 구조 현대화 과정에서, 코드의 정결성과 표준 UI Kit 적용을 우선시함에 따라 기존의 세부 기능 중 일부가 누락되거나 변형되었습니다. 본 보고서는 사라진 핵심 기능들을 식별하고 복구 우선순위를 제안합니다.

---

## 2. 모듈별 누락 기능 상세

### 2.1 TagClassifier (태그 분류기)
*   **Focus Mode (단일 라인 편집):** 이전/다음 버튼을 이용해 한 줄씩 집중해서 편집하고 결과를 실시간으로 확인하던 UI가 사라지고 전체 리스트 뷰로 대체됨.
*   **Library Browsing:** 전체 이미지 라이브러리에서 추출된 고유 태그들을 브라우징하고, 클릭 한 번으로 포함/제외 키워드에 추가하던 기능이 사라짐.
*   **Tag Variables (WordGroups):** 특정 태그를 변수화(`{var}`)하여 치환하던 로직의 UI 편집 기능이 약화됨.
*   **Export/Backup:** 설정한 규칙을 백업하거나 분류 결과를 텍스트 파일로 내보내는 기능 누락.
*   **Duplicate Removal:** 결과 출력 시 중복 레코드를 제외하는 옵션 사라짐.

### 2.2 WildcardTools (워크샵)
*   **Tag Refiner 연동:** 워크샵 결과에서 특정 태그를 다시 정제(Exclusion 추가)하는 워크플로우 단절.
*   **Advanced Mix Mode 설정:** `Mix Depth`, `Min Branches`, `Tandem Ratio` 등 세부 알고리즘 파라미터 조절 UI가 사라짐.
*   **Import from File:** 외부 텍스트 파일에서 프롬프트를 불러오는 기능 누락.
*   **Tag Merging Modal:** 여러 태그를 한 번에 리스트에 병합해 넣는 전용 모달 사라짐.

### 2.3 BatchCropModule (배치 크롭)
*   **Custom Ratios:** 사용자 정의 비율(W:H)을 입력하고 저장하는 기능이 사라지고 프리셋만 남음.
*   **Clipboard:** 크롭 영역의 크기를 복사하여 다른 영역에 붙여넣는 기능 사라짐.
*   **Interaction:** 축 고정(Shift), 스냅 무시(Alt) 등 정밀 조작 단축키 로직이 단순화됨.
*   **Snap to Edges:** 이미지 경계나 다른 크롭 영역에 자석처럼 붙는 스냅 기능 누락.

### 2.4 UI/UX 및 공통 레이아웃
*   **Sidebar 검색 자동완성:** 태그 입력 시 DB 기반으로 추천 태그를 보여주고 `Tab` 키로 완성하던 기능 사라짐.
*   **Classify Results:** 검색 결과를 특정 폴더로 한 번에 이동(Move to Folder)시키던 버튼 사라짐.
*   **ImageGrid (Sidebar):** 사이드바 하단에서 전체 이미지를 썸네일로 보며 빠르게 탐색하던 그리드 뷰 삭제 (현재는 헤더의 정렬 버튼으로 대체).
*   **Sort Methods:** `Z-A`, `Oldest` 정렬 옵션 UI에서 제거됨.

---

## 3. 원인 분석
1.  **UI Kit의 제약:** 범용 `ModalLayout`과 `TagInput`을 적용하면서, 기존의 특수 목적형 UI(커스텀 캔버스 조작, 정밀 슬라이더 등)가 단순화되었습니다.
2.  **상태 관리 통합 과정의 누락:** `LazyStore`에서 `Zustand`로 이전하며 모든 프로퍼티를 한꺼번에 이관하지 못했습니다.
3.  **컴포넌트 크기 축소:** 50KB 이상의 거대 컴포넌트를 20KB 이하로 줄이는 과정에서 부가 기능 로직이 과도하게 삭제되었습니다.

---

## 4. 향후 조치 제안 (복구 계획)
*   **우선순위 1 (UX 필수):** 사이드바 검색 자동완성 및 'Classify Results' 기능 복구.
*   **우선순위 2 (엔진 활용):** `TagClassifier`의 Library Browsing 및 Export 기능 복구.
*   **우선순위 3 (정밀 조작):** `BatchCropModule`의 스냅 및 커스텀 비율 기능 재구현.

---
*본 보고서는 Git 이력을 바탕으로 면밀히 대조하여 작성되었습니다.*
