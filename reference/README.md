# Wildcard Generator from Image Set

이미지 세트에서 메타데이터(프롬프트)를 추출하고, 이를 비교/분석하여 중복을 제거하거나 유사한 태그들을 그룹화하여 와일드카드(Wildcard) 패턴으로 생성해주는 도구입니다. ComfyUI와 Automatic1111에서 생성된 이미지의 메타데이터를 지원합니다.

## 주요 기능

- **빠른 메타데이터 추출**: PNG 이미지의 경우 픽셀 데이터를 디코딩하지 않고 청크(Chunk)를 직접 읽어 매우 빠르게 태그를 추출합니다. (JPG, WEBP는 PIL을 통해 지원)
- **태그 비교 및 추출**: 특정 '비교 이미지'와 대상 이미지들을 비교하여, 비교 이미지에는 없는 대상 이미지들만의 고유한 태그를 찾아냅니다.
- **지능적 태그 병합 (Tree-like Wildcards)**: Jaccard 유사도와 그래프 알고리즘을 사용하여 유사한 프롬프트들을 `base{diff1|diff2}`와 같은 와일드카드 형식으로 자동 병합합니다.
- **고급 필터링**:
    - **부분 일치 제외**: 특정 단어가 포함된 태그 제외.
    - **완전 일치 제외**: 특정 태그와 정확히 일치하는 경우 제외.
    - **예외 목록**: 제외 필터에 걸리더라도 유지하고 싶은 태그 설정.
    - **단어 수 제한**: 태그당 최대 단어 수 설정.
    - **최소 태그 수**: 결과물에서 일정 개수 이상의 태그를 가진 그룹만 유지.
- **GUI & CLI 지원**:
    - **GUI**: `customtkinter`를 기반으로 한 직관적인 인터페이스와 드래그 앤 드롭 지원.
    - **CLI**: 프롬프트 파일을 와일드카드로 압축(`compress`)하거나, 와일드카드를 다시 모든 가능한 조합으로 확장(`expand`)하는 기능 제공.

## 설치 방법

Python 3.10 이상이 필요합니다.

```bash
pip install customtkinter tkinterdnd2 Pillow networkx scikit-learn numpy
```

## 사용 방법

### GUI (app.py)

1. `python app.py`를 실행합니다.
2. **Target Images**: 태그를 추출할 이미지들을 드래그 앤 드롭하거나 폴더를 추가합니다.
3. **Comparison Image (선택)**: 공통으로 들어가는 태그를 제외하기 위한 기준 이미지를 선택합니다. (비어있을 경우 타겟 중 하나를 무작위 선택)
4. **Run Comparison**: 비교를 시작합니다.
5. **Refine Results**: 결과창에 나온 태그들을 인터랙티브하게 필터링하여 제외 목록에 추가할 수 있습니다.
6. **Merge Tags**: 추출된 태그들을 기존의 와일드카드 파일과 병합할 수 있습니다.

### CLI (tag_compressor.py)

프롬프트가 나열된 텍스트 파일을 와일드카드 형식으로 압축하거나 확장합니다.

**압축 (Compress):**
```bash
python tag_compressor.py compress -i input.txt -o output.txt -t 0.3
```

**확장 (Expand):**
```bash
python tag_compressor.py expand -i input.txt -o output.txt
```

## 프로젝트 구조

- `app.py`: GUI 애플리케이션 메인 코드.
- `core.py`: 메타데이터 추출 및 태그 병합 알고리즘 핵심 로직.
- `tag_compressor.py`: 와일드카드 압축/확장 CLI 도구.
- `metadata_reader.py`: 이미지의 모든 메타데이터를 출력해보는 디버깅용 유틸리티.
- `default_*.txt`: 필터링에 사용되는 기본 설정 파일들.

## 주의 사항
- Windows에서 실행 시 한글 깨짐 방지를 위해 환경 설정이 필요할 수 있습니다.
- 대량의 이미지를 처리할 때 멀티프로세싱을 사용하므로 CPU 점유율이 일시적으로 높아질 수 있습니다.
