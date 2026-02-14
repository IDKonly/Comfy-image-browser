import threading
import queue
import time
from PIL import Image
from concurrent.futures import ThreadPoolExecutor
from image_utils import LRUCache
from config import logger

class ImageLoader:
    def __init__(self, cache_size=100): # Increased cache size
        self.request_queue = queue.PriorityQueue()
        self.result_queue = queue.Queue()
        self.cache = LRUCache(cache_size)
        self.running = True
        self.executor = ThreadPoolExecutor(max_workers=4)
        self.current_priority_counter = 0
        
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()

    def stop(self):
        self.running = False
        self.executor.shutdown(wait=False)

    def request_image(self, path, priority, target_size=None, rotation=0, is_thumbnail=False):
        """
        priority: 0 (Main), 1 (Preload), 2 (Thumbnail)
        """
        # Cache Key: path + is_thumbnail (to separate full image vs thumb)
        cache_key = (path, is_thumbnail)
        
        if cache_key in self.cache:
            cached_img = self.cache[cache_key]
            
            # Check if cached image is sufficient resolution
            is_sufficient = True
            if target_size and cached_img:
                # Allow some tolerance (e.g. if cached is 90% of target, it's fine)
                # But if cached is 100x100 (thumbnail) and target is 500x500 (batch), reload.
                if cached_img.width < target_size[0] * 0.8 or cached_img.height < target_size[1] * 0.8:
                    is_sufficient = False
            
            if is_sufficient:
                if priority == 0 or priority == 2: # Immediate return for main or thumb
                    self.result_queue.put((path, cached_img, is_thumbnail))
                return

        self.current_priority_counter += 1
        # Item: (priority, counter, path, target_size, rotation, is_thumbnail)
        self.request_queue.put((priority, self.current_priority_counter, path, target_size, rotation, is_thumbnail))

    def get_result(self):
        try:
            return self.result_queue.get_nowait()
        except queue.Empty:
            return None

    def _worker_loop(self):
        while self.running:
            try:
                priority, _, path, target_size, rotation, is_thumbnail = self.request_queue.get(timeout=0.1)
                
                cache_key = (path, is_thumbnail)
                should_process = True
                
                if cache_key in self.cache:
                    cached_img = self.cache[cache_key]
                    # Check if cached image is sufficient resolution
                    is_sufficient = True
                    if target_size and cached_img:
                        if cached_img.width < target_size[0] * 0.8 or cached_img.height < target_size[1] * 0.8:
                            is_sufficient = False
                    
                    if is_sufficient:
                        if priority == 0 or priority == 2:
                             self.result_queue.put((path, cached_img, is_thumbnail))
                        self.request_queue.task_done()
                        should_process = False

                if should_process:
                    self.executor.submit(self._process_image, path, target_size, rotation, priority, is_thumbnail)
                    self.request_queue.task_done()

            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Error in loader loop: {e}")

    def _process_image(self, path, target_size, rotation, priority, is_thumbnail):
        try:
            img = Image.open(path)
            img.load()

            width, height = img.size
            
            if target_size:
                target_w, target_h = target_size
                
                # For thumbnails, use fixed size/crop or fit? usually fit for manager
                # For main image (priority 0), fit to window
                
                ratio = min(target_w / width, target_h / height)
                new_w, new_h = int(width * ratio), int(height * ratio)
                
                # Use high quality (LANCZOS) for all immediate requests (Priority 0)
                # This ensures Batch View (which requests thumbs with Priority 0) looks sharp.
                # Use fast bilinear only for background preloads (Priority > 0).
                if priority == 0:
                    resample_method = Image.Resampling.LANCZOS
                else:
                    resample_method = Image.Resampling.BILINEAR

                img = img.resize((new_w, new_h), resample_method)

            if rotation != 0:
                img = img.rotate(rotation, expand=True)

            cache_key = (path, is_thumbnail)
            self.cache[cache_key] = img
            self.result_queue.put((path, img, is_thumbnail))
            
        except Exception as e:
            logger.error(f"Failed to load image {path}: {e}")
            self.result_queue.put((path, None, is_thumbnail))

    def clear_queue(self):
        with self.request_queue.mutex:
            self.request_queue.queue.clear()