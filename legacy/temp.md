# 이미지 관리 프로그램 기능 분석 (main.py)

## 주요 클래스 및 기능

### 1. `LRUCache(collections.OrderedDict)`

- **설명**: LRU (Least Recently Used) 캐시를 구현한 클래스입니다.
- **주요 기능**:
    - `__init__(self, maxsize)`: 캐시의 최대 크기를 설정하여 초기화합니다.
    - `__getitem__(self, key)`: 캐시에서 항목을 가져오고, 해당 항목을 가장 최근 사용된 것으로 표시합니다.
    - `__setitem__(self, key, value)`: 캐시에 항목을 추가합니다. 캐시가 가득 차면 가장 오래된 항목을 제거합니다.
    - `change_maxsize(self, new_maxsize)`: 캐시의 최대 크기를 동적으로 변경합니다.

### 2. `CustomFormatter(logging.Formatter)`

- **설명**: 로깅 메시지 포맷을 커스터마이징하는 클래스입니다.
- **주요 기능**:
    - `format(self, record)`: 로그 레코드의 `pathname` (파일 경로)에서 사용자 이름 부분을 마스킹하고, `msg` (로그 메시지)에 파일 경로가 포함된 경우 파일 이름만 남기도록 포맷을 변경합니다.

### 3. `SettingsWindow(ctk.CTkToplevel)`

- **설명**: 애플리케이션의 설정을 관리하는 창을 구현한 클래스입니다.
- **주요 기능**:
    - `__init__(self, master, app_controller, update_app_theme_callback)`: 설정 창을 초기화하고 UI 요소를 생성합니다.
    - **탭 기반 설정**: 미리보기/캐시, 단축키, 창 크기, 테마 설정을 위한 탭을 제공합니다.
    - `_create_preview_cache_settings(self, tab)`: 미리보기 및 캐시 관련 설정 UI를 생성합니다.
    - `_create_shortcut_settings(self, tab)`: 단축키 설정 UI를 생성합니다.
    - `_create_window_settings(self, tab)`: 창 크기 설정 UI를 생성합니다.
    - `_create_theme_settings(self, tab)`: 테마 (Light/Dark/System) 설정 UI를 생성합니다.
    - `on_theme_change(self)`: 테마 변경 시 애플리케이션 전체 테마를 업데이트하고, 설정 창 자체의 테마도 업데이트합니다.
    - `update_settings_window_theme(self, theme_mode)`: 설정 창의 UI 요소들의 테마를 동적으로 변경합니다.
    - `_update_widget_theme(self, parent, is_dark)`: 부모 위젯 하위의 모든 위젯 테마를 재귀적으로 업데이트합니다.
    - `save_and_close(self)`: 변경된 설정을 저장하고 창을 닫습니다.
    - `save_and_restart(self)`: 변경된 설정을 저장하고 애플리케이션을 재시작하도록 요청합니다.
    - `restore_defaults(self)`: 모든 설정을 기본값으로 복원합니다.
    - `load_settings(self)`: 저장된 설정을 UI에 반영합니다.

### 4. `ImageManagerApp`

- **설명**: 이미지 관리 애플리케이션의 메인 클래스입니다.
- **주요 기능**:
    - `__init__(self, root)`: 애플리케이션 UI를 생성하고, 이벤트 핸들러를 바인딩하며, 초기 상태를 로드합니다.
    - **UI 구성**:
        - 메뉴바 (파일, 이동, 설정)
        - 상태 표시줄
        - 검색 바 (PNG 태그 검색)
        - 컨트롤 버튼 (이전/다음 이미지, 삭제, Keep 폴더로 이동, 회전, 확대/축소, 보기 모드 변경 등)
        - 이미지 표시 영역
        - 이미지 미리보기 스크롤 영역
        - 메타데이터 표시 영역
    - **핵심 기능**:
        - `change_folder(self)`: 이미지 폴더를 선택하고 이미지 목록을 로드합니다.
        - `refresh_image_list(self)`: 현재 폴더의 이미지 목록을 새로고침합니다.
        - `load_image(self, image_path, is_preview=False, target_size=None)`: 이미지를 로드하고 캐시에 저장합니다. 미리보기용 이미지 로드도 지원합니다.
        - `display_image(self)`: 현재 선택된 이미지를 화면에 표시합니다.
        - `show_next_image(self)`, `show_previous_image(self)`: 다음/이전 이미지를 표시합니다.
        - `delete_current_image(self)`: 현재 이미지를 삭제합니다.
        - `move_to_keep_folder(self)`: 현재 이미지를 'Keep' 폴더로 이동합니다.
        - `rotate_image(self, direction)`: 이미지를 회전합니다.
        - `zoom_image(self, direction)`: 이미지를 확대/축소합니다.
        - `toggle_view_mode(self)`: 이미지 보기 모드 (fit/original)를 변경합니다.
        - `_perform_search(self, event=None)`: PNG 태그를 기준으로 이미지를 검색합니다.
        - `_move_search_results_to_folder(self)`: 검색된 이미지들을 별도 폴더로 이동합니다.
        - `_clear_search(self, event=None)`: 검색 결과를 초기화합니다.
        - `_update_previews(self)`: 이미지 미리보기를 업데이트합니다.
        - `_display_metadata(self, image_path)`: 이미지의 메타데이터(PNG 태그 등)를 표시합니다.
        - `show_settings_window(self)`: 설정 창을 엽니다.
        - `_apply_and_bind_shortcuts(self)`: 설정된 단축키를 적용하고 바인딩합니다.
        - `_load_initial_state(self)`, `_save_current_state(self)`: 애플리케이션 상태 (현재 폴더, 인덱스 등)를 로드/저장합니다.
        - `_start_auto_save_timer(self)`: 주기적으로 애플리케이션 상태를 자동 저장하는 타이머를 시작합니다.
        - `update_app_theme(self, theme_mode)`: 애플리케이션 전체의 테마를 업데이트합니다.
        - `_on_closing(self)`: 애플리케이션 종료 시 상태를 저장하고 리소스를 정리합니다.

## 설정 관리 (`CONFIG_FILE = "image_manager_config.json"`)

- `load_config()`: `image_manager_config.json` 파일에서 설정을 로드합니다. 파일이 없거나 오류 발생 시 기본 설정을 사용합니다.
- `save_config()` / `save_app_config()`: 현재 설정을 `image_manager_config.json` 파일에 저장합니다.
- **주요 설정 항목**:
    - `max_preview_images`: 미리보기 이미지 최대 개수
    - `preview_thumbnail_width`: 미리보기 썸네일 너비
    - `max_image_cache_size`: 이미지 캐시 최대 크기
    - `max_preview_cache_size`: 미리보기 캐시 최대 크기
    - `auto_save_interval`: 자동 저장 간격 (초)
    - `window_size`: 창 크기 (너비, 높이)
    - `appearance_mode`: 테마 (Light, Dark, System)
    - `confirm_delete`: 삭제 시 확인 여부
    - `show_parameters`: PNG 메타데이터 표시 방식
    - `shortcuts`: 각종 기능에 대한 단축키 설정
    - `state`: 마지막으로 사용한 폴더, 인덱스 등 애플리케이션 상태 정보

## 로깅

- `CustomFormatter`를 사용하여 로그 메시지에서 민감한 정보(파일 경로의 사용자 이름)를 마스킹합니다.
- 파일(`image_manager.log`) 및 콘솔로 로그를 출력합니다.
- `debug_decorator`를 사용하여 함수 진입/종료 및 오류 발생 시 자동으로 로깅합니다.

## 기타 상수 및 설정

- `APP_VERSION`: 애플리케이션 버전
- `COLORS`: UI 요소에 사용될 커스텀 색상 팔레트
- `DEFAULT_FONT_SETTINGS`: 기본 폰트 설정
- `SUPPORTED_EXTENSIONS`: 지원하는 이미지 파일 확장자
- `MIN_SCALE_FACTOR`, `MAX_SCALE_FACTOR`: 이미지 확대/축소 비율 제한
- `ROTATION_STEP`: 이미지 회전 각도 단위
- `RESIZE_DEBOUNCE_MS`: 창 크기 변경 시 이미지 리사이즈 지연 시간
- `MAX_PNG_INFO_VALUE_LENGTH`: PNG 정보 값 최대 길이
- `DEFAULT_SCALE_FACTOR`: 기본 이미지 배율