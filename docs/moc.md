# ComfyView 지식 체계 (Map of Content)

ComfyView는 단순한 이미지 뷰어를 넘어, AI 아트 크리에이션 과정에서 발생하는 데이터 파편화 문제를 해결하기 위한 **고성능 메타데이터 분석 및 자산 관리 도구**입니다. 본 문서는 프로젝트의 아키텍처적 결정과 유지보수 전략을 체계적으로 서술합니다.

## 🧭 핵심 탐색 가이드

### 1. [시스템 아키텍처 (Architecture)](architecture.md)
ComfyView가 왜 Tauri v2와 Rust를 선택했는지, 그리고 프론트엔드와 백엔드가 어떻게 효율적으로 데이터를 교환하며 수만 장의 이미지를 지연 없이 처리하는지에 대한 시스템 설계를 다룹니다.

### 2. [메타데이터 파이프라인 (Metadata Pipeline)](metadata_pipeline.md)
ComfyUI와 Automatic1111 등 서로 다른 도구들이 생성하는 파편화된 메타데이터를 하나의 통합된 인터페이스로 변환하기 위한 추출 로직과 노드 확장 전략을 설명합니다.

### 3. [기능 명세 및 사용자 경험 (Features & UX)](features_and_ux.md)
Batch Crop, Wildcard Workshop, Undo System 등 크리에이터의 생산성을 극대화하기 위해 설계된 주요 기능들의 구현 배경과 UX 설계 철학을 기록합니다.

### 4. [개발 및 유지보수 가이드 (Development Guide)](development_guide.md)
프로젝트의 코드 스타일, 테스트 전략, 그리고 새로운 기능을 추가하거나 버그를 수정할 때 준수해야 할 정밀한 외과적 수정(Surgical Strike) 원칙을 안내합니다.

---
## 📦 기술 스택 요약 (Tech Stack)
*   **Interface**: React 18, TypeScript, Tailwind CSS, Zustand.
*   **Runtime**: Tauri v2, Rust.
*   **Storage**: SQLite (via `rusqlite`), Rayon (Multi-threading).
*   **Asset Management**: image-rs.
