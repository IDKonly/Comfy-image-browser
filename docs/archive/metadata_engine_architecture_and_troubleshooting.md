# 메타데이터 엔진 아키텍처 및 확장 가이드 (Metadata Engine Architecture)

이 문서는 ComfyView의 `metadata.rs` 모듈이 다양한 AI 생성 이미지의 메타데이터를 어떻게 통합적으로 추출하고 처리하는지 설명합니다.

## 1. 설계 목표 (Design Goals)

다양한 도구(ComfyUI, A1111)에서 생성된 메타데이터는 파편화되어 있으며, 인코딩 방식(UTF-8, UTF-16)과 데이터 포맷(JSON, Plain Text)이 제각각입니다. ComfyView 메타데이터 엔진은 다음 원칙을 따릅니다:

1.  **유연한 폴백 (Layered Fallback)**: 특정 포맷 파싱에 실패하더라도 다른 포맷이나 바이너리 검색을 통해 최소한의 정보를 찾아냅니다.
2.  **데이터 정확성**: UI 레이아웃 정보가 담긴 `workflow`보다 실제 실행 데이터가 담긴 `prompt` 청크를 우선적으로 처리합니다.
3.  **성능 최적화**: 수만 장의 이미지를 처리하기 위해 `Rayon` 기반 병렬 스캔을 지원하며, DB 인덱싱을 통해 검색 속도를 보장합니다.

---

## 2. 아키텍처 구조 (Layered Approach)

메타데이터 엔진은 3가지 계층으로 구성됩니다.

### Layer 1: 로우 데이터 추출 (Format Extractor)
-   `extract_png`, `extract_jpeg`, `extract_webp`
-   파일 포맷별로 PNG tEXt/iTXt 청크, JPEG EXIF 데이터 등을 로우 바이너리/문자열 상태로 가져옵니다.
-   **최신 업데이트**: PNG 파싱 시 `prompt` 또는 `parameters` 청크가 발견되면 `workflow` 청크보다 높은 우선순위를 부여하여 즉시 반환합니다. 이는 사용자가 ComfyUI 노드 설정을 수정한 후 저장했을 때 UI 설정(workflow)과 실제 실행 그래프(prompt)가 불일치하는 문제를 해결하기 위함입니다.

### Layer 2: 인코딩 디코딩 (Decoder)
-   `extract_from_exif`, `decode_utf16_le`
-   A1111의 일부 이미지처럼 UTF-16LE로 인코딩된 EXIF 데이터를 식별하고 UTF-8로 변환합니다.
-   `brute_force_search`를 통해 표준 포맷을 벗어난 데이터에서도 프롬프트 키워드를 식별합니다.

### Layer 3: 범용 파서 (Universal Parser)
-   `parse_comfyui_extended`, `parse_a1111_improved`
-   추출된 문자열을 분석하여 JSON 객체나 텍스트 행에서 `Steps`, `CFG`, `Model`, `Prompt` 등을 추출합니다.
-   **ComfyUI 확장 지원**:
    -   `UNETLoader`, `DiffusionLoader`, `DualModelLoader` 등 다양한 모델 로더 대응.
    -   `CLIPTextEncodeSDXL`, `CLIPTextEncodeSD3` 등 멀티 텍스트 입력 노드(`text_g`, `text_l`) 지원.
    -   `class_type` 기반의 동적 필드 탐색(Duck Typing)을 통해 커스텀 노드의 파라미터도 최대한 수집합니다.

---

## 3. 확장 가이드 (Extension Guide)

### 새로운 ComfyUI 노드 지원 추가하기
1.  `test/` 디렉토리에 해당 노드가 포함된 샘플 이미지를 추가합니다.
2.  `metadata.rs`의 `parse_comfyui_extended` 함수 내에서 `model_keys` 또는 `CLIP` 관련 파싱 로직에 노드 이름을 추가합니다.
3.  `cargo test`를 실행하여 새로운 노드로부터 데이터가 정상적으로 추출되는지 확인합니다.

---

## 4. 트러블슈팅 (Troubleshooting)

### Q: 모델명이 표시되지 않거나 "Unknown"으로 나옵니다.
-   **원인**: 해당 이미지가 지원되지 않는 새로운 커스텀 노드(예: `CheckPointLoaderSimple` 등)를 사용했을 수 있습니다.
-   **해결**: `metadata.rs`의 모델 키 리스트(`ckpt_name`, `unet_name`, `model_name`)에 해당 키를 추가하십시오.

### Q: 프롬프트가 깨져서 나옵니다.
-   **원인**: 비표준 인코딩이 사용되었을 가능성이 큽니다.
-   **해결**: `brute_force_search`의 탐색 범위를 넓히거나 특정 인코딩 강제 디코딩 로직을 추가해야 합니다.

### Q: PNG 파일의 정보가 실제와 다릅니다.
-   **원인**: ComfyUI에서 `workflow` 청크만 있고 `prompt` 청크가 없는 경우, 이전 세션의 잔류 데이터가 workflow에 남아 있을 수 있습니다.
-   **해결**: 이미지를 저장할 때 "Save Prompt" 옵션이 켜져 있는지 확인하십시오. 엔진은 `prompt` 청크를 찾으면 workflow 데이터는 무시합니다.
