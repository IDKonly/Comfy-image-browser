import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

interface Task {
  path: string;
  priority: boolean;
  run: () => Promise<void>;
  cancel: () => void; // 취소 콜백 추가
}

const taskQueue: Task[] = [];
const pendingTasks = new Map<string, { promise: Promise<string>, reject: (reason: any) => void }>();
let activeTasks = 0;
const MAX_CONCURRENT = 12;

// 글로벌 로딩 제어 상태
let isMainImageLoading = false;
const setMainLoading = (loading: boolean) => {
    isMainImageLoading = loading;
    if (!loading) processQueue();
};

export const notifyMainImageChange = () => {
    setMainLoading(true);
    
    // [핵심 수정] 큐에서 저우선순위 작업을 제거할 때 반드시 cancel()을 호출하여 Promise를 정리
    let i = 0;
    while (i < taskQueue.length) {
        if (!taskQueue[i].priority) {
            const [task] = taskQueue.splice(i, 1);
            task.cancel(); // 좀비 Promise 방지
        } else {
            i++;
        }
    }
    
    setTimeout(() => setMainLoading(false), 400);
};

const processQueue = () => {
  if (taskQueue.length === 0 || activeTasks >= MAX_CONCURRENT) return;
  if (isMainImageLoading && !taskQueue[0].priority) return;
  
  const task = taskQueue.shift();
  if (task) {
    activeTasks++;
    task.run().finally(() => {
      activeTasks--;
      setTimeout(processQueue, 5);
    });
    processQueue();
  }
};

export const scheduleThumbnailGeneration = (path: string, priority = true, size = 512): Promise<string> => {
  const cacheKey = `${path}-${size}`;
  const existing = pendingTasks.get(cacheKey);
  
  if (existing) {
    if (priority) {
      const idx = taskQueue.findIndex(t => t.path === path);
      if (idx !== -1 && !taskQueue[idx].priority) {
        const [task] = taskQueue.splice(idx, 1);
        task.priority = true;
        taskQueue.unshift(task);
      }
    }
    return existing.promise;
  }

  let rejectFn: (reason: any) => void = () => {};
  const promise = new Promise<string>((resolve, reject) => {
    rejectFn = reject;
    const taskObj: Task = {
      path,
      priority,
      run: async () => {
        try {
          const res = await invoke("get_thumbnail", { path, size });
          resolve(res as string);
        } catch (e) {
          reject(e);
        }
      },
      cancel: () => {
        reject("Task Cancelled");
      }
    };
    
    if (priority) taskQueue.unshift(taskObj);
    else taskQueue.push(taskObj);
    processQueue();
  });

  pendingTasks.set(cacheKey, { promise, reject: rejectFn });
  promise.finally(() => {
    const current = pendingTasks.get(cacheKey);
    if (current?.promise === promise) {
        pendingTasks.delete(cacheKey);
    }
  }).catch(() => {});
  
  return promise;
};

export const cancelThumbnailTask = (path: string) => {
    const idx = taskQueue.findIndex(t => t.path === path);
    if (idx !== -1) {
        const [task] = taskQueue.splice(idx, 1);
        task.cancel();
    }
};

interface ThumbnailProps {
  path: string;
  mtime?: number;
  reloadTimestamp?: number;
  className?: string;
  onClick?: () => void;
  fit?: "cover" | "contain";
  delay?: number;
}

export const Thumbnail = ({ path, mtime, reloadTimestamp, className, onClick, fit = "cover", delay = 100 }: ThumbnailProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
    let active = true;
    
    const fetchThumb = () => {
      scheduleThumbnailGeneration(path)
        .then(res => {
          if (active && pathRef.current === path) {
            const normalizedRes = (res as string).replace(/\//g, '\\');
            const url = convertFileSrc(normalizedRes);
            setSrc(reloadTimestamp ? `${url}?t=${reloadTimestamp}` : url);
          }
        })
        .catch((err) => {
          console.error("Thumbnail failed", path, err);
          if (active && pathRef.current === path) {
             const url = convertFileSrc(path.replace(/\//g, '\\'));
             setSrc(reloadTimestamp ? `${url}?t=${reloadTimestamp}` : url);
          }
        });
    };

    let timer: any;
    if (delay > 0) {
      timer = setTimeout(fetchThumb, delay);
    } else {
      fetchThumb();
    }
    
    return () => { 
      active = false; 
      if (timer) clearTimeout(timer);
      cancelThumbnailTask(path);
    };
  }, [path, mtime, reloadTimestamp, delay]);

  return (
    <div 
      className={`overflow-hidden bg-neutral-900 flex items-center justify-center ${className || ""}`} 
      onClick={onClick}
      style={{ minHeight: '100px' }} // Ensure visibility even if parent is collapsing
    >
      {src ? (
        <img 
          src={src} 
          key={src}
          className={`w-full h-full ${fit === "cover" ? 'object-cover' : 'object-contain'} animate-in fade-in duration-300`} 
          onError={() => {
             // Fallback to original image if thumbnail URL fails
             if (src !== convertFileSrc(path)) {
                setSrc(convertFileSrc(path));
             }
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center min-h-[inherit]">
          <div className="w-4 h-4 border-2 border-white/5 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
