import { create } from 'zustand';

export interface ImageMetadata {
  prompt?: string;
  negative_prompt?: string;
  steps?: number;
  sampler?: string;
  cfg?: number;
  seed?: number;
  model?: string;
  raw: string;
}

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
  currentMetadata: ImageMetadata | null;
  setFolderPath: (path: string) => void;
  setImages: (images: ImageInfo[]) => void;
  setCurrentIndex: (index: number) => void;
  setCurrentMetadata: (metadata: ImageMetadata | null) => void;
  removeImage: (index: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  folderPath: null,
  images: [],
  currentIndex: 0,
  currentMetadata: null,
  setFolderPath: (path) => set({ folderPath: path }),
  setImages: (images) => set({ images, currentIndex: 0, currentMetadata: null }),
  setCurrentIndex: (index) => set({ currentIndex: index, currentMetadata: null }),
  setCurrentMetadata: (metadata) => set({ currentMetadata: metadata }),
  removeImage: (index) => set((state) => {
    const newImages = state.images.filter((_, i) => i !== index);
    const nextIndex = index >= newImages.length ? Math.max(0, newImages.length - 1) : index;
    return {
      images: newImages,
      currentIndex: nextIndex,
      currentMetadata: null,
    };
  }),
}));
