import { create } from 'zustand';

interface ImageInfo {
  path: string;
  name: string;
  mtime: number;
  size: number;
}

interface AppState {
  folderPath: string | null;
  images: ImageInfo[];
  currentIndex: number;
  setFolderPath: (path: string) => void;
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  folderPath: null,
  images: [],
  currentIndex: 0,
  setFolderPath: (path) => set({ folderPath: path }),
  setImages: (images) => set({ images, currentIndex: 0 }),
  setCurrentIndex: (index) => set({ currentIndex: index }),
}));
