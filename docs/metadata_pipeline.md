# 메타데이터 파이프라인 (Metadata Pipeline)

AI 이미지 생성 생태계에서 메타데이터는 단순한 텍스트 이상의 가치를 지닙니다. ComfyView는 파편화된 메타데이터를 통합하여 창작자에게 유의미한 인사이트를 제공하기 위해 고도화된 파이프라인을 구축했습니다.

## 1. 다중 포맷 통합 추출 전략 (Unified Extraction Strategy)

ComfyUI, Automatic1111 등 다양한 도구들은 각자 다른 방식으로 메타데이터를 저장합니다. ComfyView의 `metadata.rs` 엔진은 다음 계층 구조를 통해 이를 통합합니다.

*   **Format Extractor**: PNG tEXt/iTXt 청크, JPEG EXIF, WebP Extended Chunk 등 이미지 포맷별로 물리적인 데이터를 먼저 수집합니다.
*   **Layered Fallback**: 표준 메타데이터 청크에 정보가 없는 경우, 이미지 설명(ImageDescription)이나 소프트웨어(Software) 필드, 혹은 파일 내 바이너리 문자열 검색(Brute-force)을 통해 데이터를 확보합니다.
*   **Prioritization**: ComfyUI의 경우, UI 레이아웃 정보가 담긴 `workflow`보다 실제 실행 노드 정보가 담긴 `prompt` 청크를 우선시하여 파싱합니다. 이는 실제 생성된 이미지와 UI 상의 설정이 다를 때 발생할 수 있는 혼선을 방지합니다.

---

## 2. 노드 지능형 분석 및 확장 (Node Intelligence & Extension)

최신 ComfyUI 노드들은 복잡한 구조를 가지며, 단순한 키-값 쌍으로는 표현하기 어렵습니다. ComfyView는 **Duck Typing** 기법을 사용하여 노드를 분석합니다.

*   **Model Identification**: `UNETLoader`, `DiffusionLoader`, `DualModelLoader` 등 다양한 모델 로더 노드에서 `ckpt_name`, `unet_name`, `model_name` 등의 키를 순차적으로 탐색하여 정확한 모델명을 추출합니다.
*   **Prompt Consolidation**: `CLIPTextEncodeSDXL` 이나 `SD3` 관련 노드처럼 `text_g`, `text_l` 등 여러 프롬프트 입력이 나뉘어 있는 경우, 이를 지능적으로 병합하여 사용자에게 단일 프롬프트 뷰를 제공합니다.
*   **Extensibility**: 새로운 커스텀 노드가 등장하더라도 `metadata.rs`의 파싱 로직에 노드 타입만 추가하면 즉시 지원이 가능하도록 설계되었습니다.

---

## 3. 와일드카드 및 유사도 분석 (Wildcard & Similarity)

메타데이터가 확보된 후, ComfyView는 이를 활용하여 창작자의 프롬프트 워크플로우를 개선합니다.

*   **Prompt Compression**: 수백 장의 이미지에서 공통된 태그와 변화하는 태그(와일드카드)를 자동으로 추출합니다. 이는 Jaccard Similarity 계수를 활용한 유사도 분석을 통해 이루어지며, 크리에이터는 이를 통해 자신의 프롬프트 패턴을 한눈에 파악할 수 있습니다.
## 4. 트러블슈팅: 메타데이터 추출 이슈 (Troubleshooting)

복잡한 AI 생성 환경에서 발생할 수 있는 주요 메타데이터 추출 이슈와 해결 방안은 다음과 같습니다.

*   **모델명 미검출 (Unknown Model)**: 새로운 커스텀 노드(예: `CheckPointLoaderSimple` 등)가 표준 키값이 아닌 다른 이름으로 모델명을 저장할 경우 발생합니다. `metadata.rs`의 모델 키 리스트에 해당 키를 추가하여 해결할 수 있습니다.
*   **프롬프트 깨짐 현상 (Encoding Issue)**: 주로 A1111에서 생성된 일부 이미지가 비표준 UTF-16LE 인코딩을 사용할 때 발생합니다. 엔진은 이를 감지하여 UTF-8로 강제 변환하는 디코딩 로직을 수행합니다.
*   **실제 데이터와 UI 불일치**: ComfyUI 세션 도중 설정을 변경하고 저장했을 때, `workflow` 청크에는 이전 데이터가 남고 `prompt` 청크에만 최신 데이터가 반영될 수 있습니다. 엔진은 항상 `prompt` 청크를 우선시하여 이 불일치를 해결합니다.
