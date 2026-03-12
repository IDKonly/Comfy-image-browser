# 메타데이터 추출 엔진 아키텍처 및 확장 가이드 (Metadata Engine Architecture & Extension Guide)

이 문서는 ComfyView의 `metadata.rs` 엔진이 현재 지원하지 않는 새로운 메타데이터 형식(새로운 AI 툴, 특이한 인코딩, 비표준 EXIF 등)을 만났을 때, 이를 분석하고 엔진에 통합하기 위한 **표준 작업 절차(SOP)**와 **트러블슈팅 가이드**를 제공합니다.

---

## 1. 작업 목표 (Objective)
새로운 메타데이터를 발견했을 때의 궁극적인 목표는 **"기존 로직을 망가뜨리지 않으면서, 최소한의 폭발 반경(Blast Radius)으로 새로운 형식을 파이프라인에 통합하는 것"**입니다.
- **범용성 유지**: 특정 이미지 하나만 위한 하드코딩 패치를 지양하고, 일반화 가능한 패턴을 찾습니다.
- **안정성 보장**: 기존에 잘 작동하던 PNG, JPEG, WebP (A1111, ComfyUI) 추출 로직이 훼손되지 않도록 격리(Isolation)합니다.
- **데이터 보존**: 파싱에 실패하더라도 원본 텍스트(`raw` 필드)는 최대한 손실 없이 보존해야 합니다.

---

## 2. 문제에 대한 접근 방법 (Approach & Mindset)
코드를 수정하기 전(Think Before Coding), 다음 마인드셋을 반드시 거쳐야 합니다.

1. **"코드가 아니라 데이터가 진실이다"**: 파서가 실패한다면 코드의 버그가 아니라, 우리가 알지 못했던 새로운 데이터 구조(예: UTF-16, 커스텀 청크, 비표준 헤더)가 존재하기 때문입니다. 반드시 원본 바이너리를 덤프하여 직접 눈으로 확인하십시오.
2. **"TDD (Test-Driven Development) 필수"**: 실패하는 이미지를 확보하지 않고서는 코드를 한 줄도 수정해서는 안 됩니다. 해당 이미지를 `test/` 폴더에 넣고 스크립트를 통해 재현하는 것이 1순위입니다.
3. **"Layered Fallback (계층적 방어선)"**: 표준 라이브러리(img-parts, kamadak-exif)가 실패할 경우를 대비해, 최후의 보루인 '바이너리 휴리스틱 검색(Heuristic Search)'으로 우회하는 방어적 프로그래밍을 지향합니다.

---

## 3. 새로운 포맷 지원을 위한 작업 순서 및 절차 (Step-by-step Procedure)

새로운 형식을 지원하기 위한 작업은 다음 4단계의 루프로 진행됩니다.

### Phase 1: 현상 파악 및 데이터 확보 (Discovery)
1. **샘플 확보**: 문제가 발생하는 이미지 파일을 `test/` 디렉토리로 복사합니다.
2. **바이너리 덤프 (Hex/String Dump)**: 
   - 이미지 파일을 텍스트 에디터나 Hex Editor로 열어 메타데이터가 어디에, 어떤 형태로 있는지 눈으로 확인합니다.
   - 팁: PowerShell이나 bash에서 `strings <파일명>` 또는 `head -c 8000 <파일명>`을 사용하여 파일 앞/뒤에 있는 텍스트 키워드(`prompt`, `UNICODE`, `parameters`, `{` 등)를 찾습니다.
3. **인코딩 의심**: 글자 사이에 공백이 보인다면(`m a s t e r p i e c e`) 100% **UTF-16(Little Endian)** 인코딩 문제입니다.

### Phase 2: 격리된 검증 환경 구축 (Red - Test Setup)
1. **임시 테스트 스크립트 작성**: `src-tauri/src/metadata.rs` 하단에 `#[cfg(test)]` 블록을 만들고 임시 테스트를 추가합니다.
2. **테스트 스크립트(`run_test.bat`) 생성**: PowerShell 오류를 피하기 위해 `cargo test -- --nocapture`를 실행하는 배치 파일을 만듭니다.
3. **결과 시각화**: 테스트의 결과로 추출된 `ImageMetadata` 구조체의 내용을 해당 파일명과 동일한 `.txt` 파일로 저장하게 하여 실패 상태(Red)를 명확히 눈으로 확인합니다.

### Phase 3: 엔진 아키텍처 확장 (Green - Implementation)
`metadata.rs`는 3단계의 파이프라인으로 구성되어 있습니다. 문제의 원인이 어느 계층인지 파악하고 해당 계층만 외과적으로 수정(Surgical Strike)합니다.

* **Layer 1: 파일 포맷 추출기 (Format Extractor)**
   - `extract_png`, `extract_jpeg`, `extract_webp`
   - *문제 시나리오*: 표준 라이브러리가 청크나 EXIF를 아예 찾지 못함.
   - *해결 방법*: `brute_force_search` (휴리스틱 바이너리 탐색)에 새로운 키워드(예: `Software`, `ImageDescription` 등)를 추가합니다.
* **Layer 2: 디코딩 및 정제 (Decoder)**
   - `extract_from_exif`, `decode_utf16_le`
   - *문제 시나리오*: 데이터는 찾았으나 글자가 깨짐.
   - *해결 방법*: 헤더(예: `ASCII\0\0\0`, `UNICODE\0`)를 파악하여 적절한 디코딩 로직을 추가합니다.
* **Layer 3: 범용 파서 (Universal Parser)**
   - `parse_comfyui_extended`, `parse_a1111_improved`
   - *문제 시나리오*: 텍스트(또는 JSON)는 잘 추출되었으나, Steps, CFG, Prompt 등의 세부 필드 분류가 안 됨.
   - *해결 방법*: 
      - ComfyUI의 경우: 새로운 커스텀 노드 이름이라면 노드를 순회하며 공통 속성(`inputs.steps`, `inputs.seed`)을 찾는 방식을 유지/강화합니다.
      - 텍스트의 경우: `Negative prompt:`, `Steps:` 등 분할 키워드를 기준으로 하는 `split` 로직을 개선합니다.

### Phase 4: 회귀 테스트 및 클린업 (Refactor & Cleanup)
1. 새로 추가한 로직이 해당 이미지에 대해 완벽한 `.txt`를 생성하는지 확인합니다.
2. **회귀 테스트(Regression Test)**: 기존에 잘 되던 PNG, JPG 파일들(`.txt`)의 추출 결과가 망가지지 않았는지 대조 확인합니다.
3. 확인이 완료되면 추가했던 `#[cfg(test)]` 블록과 임시 `.bat`, `.txt` 파일들을 삭제하여 코드베이스를 원래의 깨끗한 상태로 되돌립니다.

---

## 4. 주요 트러블슈팅 가이드 (Troubleshooting Catalog)

### Q1. 프롬프트가 한 줄로 길게 나오고, Negative나 Steps가 분리되지 않아요.
* **원인**: A1111 스타일의 메타데이터에서 줄바꿈(`\n`)이 유실된 채 EXIF나 텍스트 청크에 저장된 경우입니다.
* **조치**: `parse_a1111_improved` 함수에서 `raw.find("Negative prompt: ")`와 `raw.find("Steps: ")`를 활용한 인덱스 슬라이싱 로직을 확인하고 인덱스 계산(`n + 17` 등)을 조정하십시오.

### Q2. 프롬프트 글자 사이에 공백이 있고, 특수문자가 깨집니다.
* **원인**: UTF-16LE 로 인코딩된 데이터를 UTF-8로 강제 읽기 시도했기 때문입니다.
* **조치**: 
   1. EXIF 데이터 앞부분에 `UNICODE\0` 시그니처가 있는지 확인합니다.
   2. 없다면 `is_likely_utf16` 함수(널 바이트 비율 검사)를 통해 자동 감지되도록 `brute_force_search` 계층으로 보내 `decode_utf16_le`를 거치게 만듭니다.

### Q3. ComfyUI 이미지인데 Steps, CFG 값이 안 나옵니다.
* **원인**: 사용자가 표준 `KSampler` 대신 `FaceDetailer`, `ImpactSampler` 등 커스텀 노드를 사용했기 때문입니다.
* **조치**: `parse_comfyui_extended` 내에서 특정 `class_type`에 의존하지 말고, `inputs` 객체 내부에 `steps`, `seed`, `sampler_name` 키가 존재하는지 오리 타입(Duck Typing) 방식으로 검사하여 추출하도록 유지보수하십시오.

### Q4. img-parts나 kamadak-exif가 JPEG EXIF를 파싱하다가 `Failed to parse EXIF container` 에러를 냅니다.
* **원인**: 라이브러리가 기대하는 헤더(TIFF 헤더)가 아니라 APP1 마커(`Exif\0\0`)가 포함되어 넘어왔기 때문입니다.
* **조치**: `extract_from_exif` 함수 초반부의 오프셋 조정 로직(`if data.starts_with(b"Exif\0\0") { &data[6..] }`)이 정상 작동하는지 확인하십시오.

---

## 5. 결론
"메타데이터의 형태는 유저가 사용하는 AI 툴 체인(Toolchain)과 운영체제에 따라 끝없이 파편화(Fragmentation)됩니다." 

모든 포맷을 미리 예측할 수는 없지만, **1) 원본 바이너리 분석 -> 2) 고립된 테스트 -> 3) 휴리스틱 Fallback** 이라는 이 세 가지 방어선만 지킨다면 어떤 파편화된 데이터가 들어와도 엔진을 유연하고 안전하게 확장할 수 있습니다.
