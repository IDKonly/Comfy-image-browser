# Project Architecture: Image Manager Optimized

## 1. 개요
이 프로젝트는 대량의 고해상도 AI 이미지를 딜레이 없이 탐색하고, 복잡한 메타데이터(Prompt)를 기반으로 관리할 수 있는 도구입니다. 기존 `Tkinter` 기반의 단일 스레드 구조가 가진 성능 한계(UI 멈춤, 느린 로딩)를 극복하기 위해 **멀티스레딩**과 **로컬 DB 캐싱**을 도입하여 전면 리팩토링되었습니다.

## 2. 핵심 기술 스택

*   **Language:** Python 3.10+
*   **GUI Framework:** `CustomTkinter` (Modern UI), `TkinterDnD2` (Drag & Drop)
*   **Database:** `SQLite3` (메타데이터 영구 저장 및 인덱싱)
*   **Image Processing:** `Pillow (PIL)`
*   **Concurrency:** `threading`, `queue`, `concurrent.futures`

## 3. 아키텍처 설계 (MVC Pattern)

유지보수성과 확장성을 위해 철저한 관심사 분리(Separation of Concerns)를 적용했습니다.

### 3.1 Controller (`app_controller.py`)
*   애플리케이션의 **두뇌** 역할을 합니다.
*   사용자 입력(클릭, 단축키)을 받아 `DBManager`나 `ImageLoader`에 작업을 지시합니다.
*   작업 결과를 받아 `UIManager`를 통해 화면을 갱신합니다.
*   메인 스레드(`MainLoop`)에서 주기적으로 폴링(`_update_loop`)하며 백그라운드 작업의 결과를 UI에 반영합니다.

### 3.2 View (`ui_view.py`)
*   **화면 표시**만을 담당합니다.
*   로직을 포함하지 않으며, 버튼 클릭 시 Controller가 주입해준 콜백 함수(`callbacks`)를 실행합니다.
*   `CustomTkinter` 위젯의 스타일링과 배치를 관리합니다.

### 3.3 Model
*   **DB Manager (`db_manager.py`)**
    *   이미지 메타데이터를 SQLite에 저장합니다.
    *   파일의 수정 시간(`mtime`)을 체크하여 변경된 파일만 효율적으로 업데이트(Upsert)합니다.
    *   SQL 쿼리를 통해 고속 검색을 수행합니다.
*   **Image Loader (`image_loader.py`)**
    *   **Producer-Consumer 패턴**을 적용했습니다.
    *   `PriorityQueue`를 사용하여 현재 사용자가 보고 있는 이미지를 최우선(`Priority 0`)으로 처리하고, 이전/다음 이미지는 낮은 우선순위(`Priority 1`)로 백그라운드에서 미리 로드(Pre-fetch)합니다.
    *   이미지 리사이징(LANCZOS)과 회전 연산을 별도 스레드에서 수행하여 메인 UI 스레드의 부하를 0으로 만듭니다.

### 3.4 Utils (`image_utils.py`)
*   **Optimized Parser:** 정규식을 미리 컴파일(`re.compile`)하고 문자열 슬라이싱을 적극 활용하여 기존 파싱 로직 대비 약 **30% 이상의 속도 향상**을 달성했습니다.

## 4. 데이터 흐름

1.  **초기화:** 앱 실행 시 `main.py`가 `AppController`를 생성합니다.
2.  **폴더 열기:** 사용자가 폴더를 열면 `DBManager`가 별도 스레드에서 파일 목록을 스캔하고 DB를 동기화합니다.
3.  **이미지 요청:** `AppController`는 `ImageLoader`에게 현재 이미지와 앞/뒤 이미지 로딩을 요청합니다.
4.  **비동기 처리:** `ImageLoader`의 워커 스레드가 이미지를 로드하고 처리하여 `Result Queue`에 넣습니다.
5.  **UI 갱신:** `AppController`의 `update_loop`가 큐에서 완료된 이미지를 꺼내 `UIManager`에게 전달하여 화면에 표시합니다.

## 5. 향후 개선 사항
*   **가상 리스트 (Virtual List):** 수천 개의 썸네일을 스크롤할 때 메모리 효율을 위해 보이는 부분만 렌더링하는 기술 도입.
*   **태그 통계:** 자주 사용된 프롬프트나 모델 통계 시각화.
