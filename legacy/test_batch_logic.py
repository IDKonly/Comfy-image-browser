
import unittest
from unittest.mock import MagicMock

class TestBatchLogic(unittest.TestCase):
    def setUp(self):
        # 가상의 파일 리스트 (파일명 정렬 상태 가정)
        self.image_files = [
            "file1.png", "file2.png",  # Batch A (Prompt: "cat")
            "file3.png",               # Batch B (Prompt: "dog")
            "file4.png", "file5.png", "file6.png", # Batch C (Prompt: "bird")
            "file7.png"                # Batch D (Prompt: "cat") - Batch A와 같지만 떨어져 있음
        ]
        
        # 가상의 메타데이터 DB
        self.metadata_store = {
            "file1.png": {"prompt": "cat"},
            "file2.png": {"prompt": "cat"},
            "file3.png": {"prompt": "dog"},
            "file4.png": {"prompt": "bird"},
            "file5.png": {"prompt": "bird"},
            "file6.png": {"prompt": "bird"},
            "file7.png": {"prompt": "cat"},
        }
        
        # DBManager Mocking
        self.mock_db = MagicMock()
        self.mock_db.get_metadata.side_effect = lambda path: self.metadata_store.get(path, {})

    def get_batch_files(self, current_index):
        """테스트 대상 로직: 현재 인덱스 기준 앞뒤로 동일 프롬프트 탐색"""
        if not self.image_files:
            return []
            
        current_path = self.image_files[current_index]
        current_meta = self.mock_db.get_metadata(current_path)
        target_prompt = current_meta.get('prompt')
        
        if target_prompt is None: # 프롬프트가 없으면 자기 자신만 반환
            return [current_path]

        start = current_index
        end = current_index

        # 왼쪽 탐색
        while start > 0:
            prev_path = self.image_files[start - 1]
            prev_meta = self.mock_db.get_metadata(prev_path)
            if prev_meta.get('prompt') == target_prompt:
                start -= 1
            else:
                break

        # 오른쪽 탐색
        while end < len(self.image_files) - 1:
            next_path = self.image_files[end + 1]
            next_meta = self.mock_db.get_metadata(next_path)
            if next_meta.get('prompt') == target_prompt:
                end += 1
            else:
                break
                
        return self.image_files[start : end + 1]

    def test_batch_start(self):
        # file1 (index 0) 선택 시 -> file1, file2 반환 예상
        batch = self.get_batch_files(0)
        self.assertEqual(batch, ["file1.png", "file2.png"])

    def test_batch_middle_of_group(self):
        # file5 (index 4) 선택 시 -> file4, file5, file6 반환 예상
        batch = self.get_batch_files(4)
        self.assertEqual(batch, ["file4.png", "file5.png", "file6.png"])

    def test_single_file_batch(self):
        # file3 (index 2) 선택 시 -> file3 반환 예상
        batch = self.get_batch_files(2)
        self.assertEqual(batch, ["file3.png"])

    def test_separated_same_prompt(self):
        # file7 (index 6) 선택 시 -> file7만 반환 예상 (file1, file2와 섞이면 안됨)
        batch = self.get_batch_files(6)
        self.assertEqual(batch, ["file7.png"])

if __name__ == '__main__':
    unittest.main()
