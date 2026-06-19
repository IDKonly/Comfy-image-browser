export interface Subset {
  id: number;
  name: string;
  keywords: string[];
  excludeKeywords: string[];
}

export interface WordGroup {
  id: number;
  name: string;
  words: string[];
}

export interface TagClassifierProps {
  onClose: () => void;
  initialData?: string;
}
