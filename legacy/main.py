
import sys
import traceback
import os

# 콘솔 출력을 확보하기 위해 stdout 버퍼링 끄기
sys.stdout.reconfigure(encoding='utf-8')

def main():
    try:
        print("라이브러리 로딩 중...")
        import customtkinter as ctk
        from tkinterdnd2 import TkinterDnD
        
        # 로컬 모듈 임포트
        print("모듈 로딩 중...")
        from app_controller import AppController
        from config import logger, APP_CONFIG

        class MainApp(ctk.CTk, TkinterDnD.DnDWrapper):
            def __init__(self):
                super().__init__()
                self.TkdndVersion = TkinterDnD._require(self)
                
                # Controller 초기화
                self.controller = AppController(self)
                
                # 창 닫기 이벤트 핸들러 등록
                self.protocol("WM_DELETE_WINDOW", self.controller.on_closing)

            def report_callback_exception(self, exc, val, tb):
                logger.error("Uncaught exception", exc_info=(exc, val, tb))
                traceback.print_exception(exc, val, tb)
                super().report_callback_exception(exc, val, tb)

        print("설정 로드 및 테마 적용 중...")
        ctk.set_appearance_mode(APP_CONFIG.get("appearance_mode", "System"))
        ctk.set_default_color_theme("blue")

        print("애플리케이션 시작...")
        app = MainApp()
        app.mainloop()

    except ImportError as e:
        print(f"\n[치명적 오류] 필수 라이브러리가 설치되지 않았습니다: {e}")
        print("다음 명령어를 사용하여 필요한 라이브러리를 설치하세요:")
        print("pip install customtkinter tkinterdnd2 pillow")
        input("\n엔터 키를 눌러 종료하세요...")
    except Exception as e:
        print(f"\n[치명적 오류] 프로그램 실행 중 문제가 발생했습니다: {e}")
        traceback.print_exc()
        input("\n엔터 키를 눌러 종료하세요...")

if __name__ == "__main__":
    main()
