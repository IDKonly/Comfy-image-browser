import { useState, useEffect, useRef } from "react";
import { api, assetSrc } from "../api";

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
          const res = await api.getThumbnail(path, size);
          resolve(res);
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

// Resolved thumbnail-URL cache keyed by path+mtime+reloadTimestamp. A folder update that
// inserts/removes files reflows the virtualized grid, remounting Thumbnails that cross row
// boundaries; without this cache each remount would reset to the spinner and refetch (making
// the whole grid appear to refresh). Unchanged files (same path+mtime) render instantly from here.
const thumbUrlCache = new Map<string, string>();
const THUMB_CACHE_MAX = 4000;
const thumbCacheKey = (path: string, mtime?: number, reloadTimestamp?: number) =>
  `${path}|${mtime ?? ''}|${reloadTimestamp ?? ''}`;
const setThumbCache = (key: string, url: string) => {
  thumbUrlCache.set(key, url);
  if (thumbUrlCache.size > THUMB_CACHE_MAX) {
    const evict = Math.ceil(THUMB_CACHE_MAX * 0.1);
    let i = 0;
    for (const k of thumbUrlCache.keys()) { thumbUrlCache.delete(k); if (++i >= evict) break; }
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
  const initialCached = thumbUrlCache.get(thumbCacheKey(path, mtime, reloadTimestamp)) ?? null;
  const [src, setSrc] = useState<string | null>(initialCached);
  const [loading, setLoading] = useState(!initialCached);
  const [loadedPath, setLoadedPath] = useState<string | null>(initialCached ? path : null);
  const pathRef = useRef(path);

  useEffect(() => {
    const key = thumbCacheKey(path, mtime, reloadTimestamp);
    pathRef.current = path;

    // Already resolved (e.g. re-mounted by list reflow) — render instantly, no refetch.
    const hit = thumbUrlCache.get(key);
    if (hit) {
      setSrc(hit);
      setLoadedPath(path);
      setLoading(false);
      return;
    }

    setLoading(true);
    let active = true;

    const fetchThumb = () => {
      scheduleThumbnailGeneration(path)
        .then(res => {
          if (active && pathRef.current === path) {
            const url = assetSrc(res, reloadTimestamp);
            setThumbCache(key, url);
            setSrc(url);
            setLoadedPath(path);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Thumbnail failed", path, err);
          if (active && pathRef.current === path) {
             setSrc(assetSrc(path, reloadTimestamp));
             setLoadedPath(path);
             setLoading(false);
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

  const isCorrectPath = loadedPath === path;

  return (
    <div 
      className={`overflow-hidden bg-neutral-900 flex items-center justify-center relative ${className || ""}`} 
      onClick={onClick}
      style={{ minHeight: '100px' }}
    >
      {src && (
        <img 
          src={src} 
          key={src}
          className={`w-full h-full ${fit === "cover" ? 'object-cover' : 'object-contain'} transition-all duration-300 ${!isCorrectPath || loading ? 'opacity-40 scale-95 blur-sm' : 'opacity-100 scale-100 blur-0'} animate-in fade-in`} 
          onError={() => {
             const fallback = assetSrc(path);
             if (src !== fallback) {
                setSrc(fallback);
             }
          }}
        />
      )}
      {(!src || loading) && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <div className="w-5 h-5 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};
