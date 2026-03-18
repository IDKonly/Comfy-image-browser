# ComfyView 문서 지도 (Map of Content)

ComfyView는 AI 아트 생성(ComfyUI, Automatic1111) 크리에이터를 위한 고성능 이미지 브라우저 및 프롬프트 분석 도구입니다. 이 문서는 프로젝트의 아키텍처, 기능 명세 및 유지보수 지침을 체계적으로 정리합니다.

## 📌 주요 문서

### 1. [프로젝트 개요 (Project Overview)](project.md)
*   프로젝트의 핵심 목표와 철학.
*   주요 기능(Batch Crop, Metadata Indexing) 및 기술 스택 안내.

### 2. [메타데이터 엔진 아키텍처 (Metadata Engine)](metadata_engine_architecture_and_troubleshooting.md)
*   **왜(Why)?**: 다양한 AI 도구(ComfyUI, A1111)의 파편화된 메타데이터를 어떻게 통합적으로 관리하는가.
*   PNG/JPEG/WebP 메타데이터 추출 알고리즘 및 노드 확장 가이드.
*   최신 업데이트: `UNETLoader`, `SD3`, `SDXL` 지원 및 PNG 청크 우선순위 로직.

### 3. [로드맵 (Roadmap)](roadmap.md)
*   단계별 개발 목표 및 현재 진행 상황.
*   완료된 기능과 향후 구현될 지능형 태깅/중복 제거 계획.

### 4. [진행 상황 (Progress)](progress.md)
*   최근 구현된 기능 및 버그 수정 내역.
*   멀티스레딩 최적화, 실행 취소(Undo) 시스템, 트위터 연동 등 상세 구현 로그.

### 5. [기타 분석 문서]
*   [참조 분석 (Reference Analysis)](reference_analysis.md): 기존 파이프라인 분석 및 마이그레이션 전략.
*   [버그 수정 및 검색 로그](bug_fix_search.md): 문제 해결 과정의 기록.

---
## 🛠 기술 스택 요약
*   **Frontend**: React 18, TypeScript, Tailwind CSS, Zustand.
*   **Backend**: Rust, Tauri v2.
*   **Database**: SQLite (Indexing & Search).
*   **Concurrency**: Rayon (Multi-threaded Scanning).
