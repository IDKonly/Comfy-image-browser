import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FolderOpen, Copy, Image as ImageIcon } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { api } from "../api";

export interface ImageMenuState {
  x: number;
  y: number;
  path: string;
}

interface ImageContextMenuProps {
  menu: ImageMenuState | null;
  onClose: () => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

/**
 * Right-click context menu for images (main viewer + grid thumbnails). Rendered once at the
 * app root; App holds the open state and the target path. Closes on outside-click, Escape,
 * scroll, or after an action runs.
 */
export const ImageContextMenu = ({ menu, onClose, showToast }: ImageContextMenuProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  // Clamp the menu inside the viewport once its size is known.
  useLayoutEffect(() => {
    if (!menu) return;
    const el = ref.current;
    const w = el?.offsetWidth ?? 200;
    const h = el?.offsetHeight ?? 100;
    const margin = 8;
    const x = Math.min(menu.x, window.innerWidth - w - margin);
    const y = Math.min(menu.y, window.innerHeight - h - margin);
    setPos({ x: Math.max(margin, x), y: Math.max(margin, y) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const handleReveal = async () => {
    onClose();
    try {
      await revealItemInDir(menu.path);
    } catch (e: any) {
      showToast(`Failed to open location: ${e}`, "error");
    }
  };

  const handleCopyImage = async () => {
    onClose();
    try {
      await api.copyImageToClipboard(menu.path);
      showToast("Image copied to clipboard", "success");
    } catch (e: any) {
      showToast(`Failed to copy image: ${e}`, "error");
    }
  };

  const handleCopyPath = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(menu.path);
      showToast("Path copied", "success");
    } catch {
      showToast("Failed to copy path", "error");
    }
  };

  return (
    // Full-screen backdrop captures the outside click that dismisses the menu.
    <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        className="absolute min-w-[200px] bg-neutral-900 border border-white/10 rounded-xl shadow-2xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
        style={{ left: pos.x, top: pos.y }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={handleReveal}
          className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-[11px] font-bold text-neutral-200 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5 shrink-0" /> Open file location
        </button>
        <button
          onClick={handleCopyImage}
          className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-[11px] font-bold text-neutral-200 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5 shrink-0" /> Copy image
        </button>
        <button
          onClick={handleCopyPath}
          className="flex items-center gap-2.5 w-full text-left px-4 py-2 text-[11px] font-bold text-neutral-200 hover:bg-white/5 hover:text-white transition-colors"
        >
          <Copy className="w-3.5 h-3.5 shrink-0" /> Copy file path
        </button>
      </div>
    </div>
  );
};
