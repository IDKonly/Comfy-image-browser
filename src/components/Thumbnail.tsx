import { useState, useEffect, useRef } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";

interface Task {
  path: string;
  priority: boolean;
  run: () => Promise<void>;
}

const taskQueue: Task[] = [];
const pendingTasks = new Map<string, Promise<string>>();
let activeTasks = 0;
const MAX_CONCURRENT = 12;

const processQueue = () => {
  if (activeTasks >= MAX_CONCURRENT || taskQueue.length === 0) return;
  
  const task = taskQueue.shift();
  if (task) {
    activeTasks++;
    task.run().finally(() => {
      activeTasks--;
      processQueue();
    });
    processQueue();
  }
};

export const scheduleThumbnailGeneration = (path: string, priority = true): Promise<string> => {
  if (pendingTasks.has(path)) {
    if (priority) {
      const idx = taskQueue.findIndex(t => t.path === path);
      if (idx !== -1 && !taskQueue[idx].priority) {
        const [task] = taskQueue.splice(idx, 1);
        task.priority = true;
        taskQueue.unshift(task);
      }
    }
    return pendingTasks.get(path)!;
  }

  const promise = new Promise<string>((resolve, reject) => {
    const taskObj = {
      path,
      priority,
      run: async () => {
        try {
          const res = await invoke("get_thumbnail", { path });
          resolve(res as string);
        } catch (e) {
          reject(e);
        }
      }
    };
    
    if (priority) {
      taskQueue.unshift(taskObj);
    } else {
      taskQueue.push(taskObj);
    }
    processQueue();
  });

  pendingTasks.set(path, promise);
  promise.finally(() => pendingTasks.delete(path));
  return promise;
};

interface ThumbnailProps {
  path: string;
  mtime?: number;
  reloadTimestamp?: number;
  className?: string;
  onClick?: () => void;
  fit?: "cover" | "contain";
}

export const Thumbnail = ({ path, mtime, reloadTimestamp, className, onClick, fit = "cover" }: ThumbnailProps) => {
  const [src, setSrc] = useState<string | null>(null);
  const pathRef = useRef(path);

  useEffect(() => {
    pathRef.current = path;
    let active = true;
    
    const timer = setTimeout(() => {
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
        });    }, 100);
    
    return () => { 
      active = false; 
      clearTimeout(timer);
    };
  }, [path, mtime, reloadTimestamp]);

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
