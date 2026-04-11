import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ZoomPanViewer } from '../ZoomPanViewer';

// Mock Thumbnail component and its associated functions to avoid complex async logic during tests
vi.mock('../Thumbnail', () => ({
  Thumbnail: ({ path }: any) => <div data-testid="thumbnail">{path}</div>,
  scheduleThumbnailGeneration: vi.fn().mockResolvedValue(undefined),
  notifyMainImageChange: vi.fn(),
}));

describe('ZoomPanViewer', () => {
  const images = [
    { path: '/img1.png', mtime: 1 },
    { path: '/img2.png', mtime: 2 },
  ];

  it('renders safely in batchMode when batchRange contains out-of-bounds indices', () => {
    // batchRange includes index 2, which does not exist in the images array
    render(
      <ZoomPanViewer
        images={images}
        currentIndex={0}
        reloadTimestamp={0}
        batchMode={true}
        batchRange={[0, 2]}
        batchMap={{
          0: [0, 2],
          1: [0, 2],
        }}
      />
    );

    // It should render valid images and gracefully ignore the undefined ones
    expect(screen.getByText('/img1.png')).toBeInTheDocument();
    expect(screen.getByText('/img2.png')).toBeInTheDocument();
    
    // Exactly 2 thumbnails should be rendered, index 2 is filtered out safely
    expect(screen.getAllByTestId('thumbnail')).toHaveLength(2);
  });

  it('renders safely in single mode when stageImages attempts to load out-of-bounds adjacent images', () => {
    // currentIndex is 0, stageImages tries to load indices -2 to +2
    const { container } = render(
      <ZoomPanViewer
        images={images}
        currentIndex={0}
        reloadTimestamp={0}
        batchMode={false}
      />
    );
    
    // It should only render <img> elements for valid indices (0 and 1)
    const imgElements = container.querySelectorAll('img');
    expect(imgElements.length).toBe(2);
  });
});
