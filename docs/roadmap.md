# Project Roadmap: Comfy Image Browser (Evolution)

## Phase 1: Foundation & High-Performance Core (Completed)
- [x] Tech Stack Migration: Tauri v2 + React + Rust.
- [x] High-speed directory scanning (Rust).
- [x] PNG Metadata (tEXt/iTXt) parsing.
- [x] Basic File Operations (Delete, Keep).
- [x] Keyboard Navigation.

## Phase 2: Visual Feedback Loop & GUI/UX Polish (Current)
- [ ] **Visual Feedback System**:
    - [ ] Add Toast notifications for file operations (Delete/Keep).
    - [ ] Loading overlays for heavy directory scans.
    - [ ] Smooth transitions between images.
- [ ] **Advanced Viewer UX**:
    - [ ] Implementation of Zoom/Pan (Canvas or high-perf CSS).
    - [ ] "Fit to Screen" vs "Original Size" toggle with visual indicators.
- [ ] **Layout Optimization**:
    - [ ] Resizable sidebars.
    - [ ] Grid View vs. List View toggle.
    - [ ] Modern dark-themed palette based on Shadcn/Tailwind.

## Phase 3: Scenario-Driven Feature Parity (Legacy Alignment)
- [ ] **Batch Logic Migration**:
    - [ ] Port the "contigous prompt grouping" logic from `legacy/test_batch_logic.py`.
    - [ ] Visual grouping indicators in the sidebar/grid.
- [ ] **Search & Filter**:
    - [ ] Real-time metadata search.
    - [ ] Filter by Model/Sampler/Date.

## Phase 4: Performance & Virtualization
- [ ] **Virtualized Grid**: Render 10k+ images efficiently using `react-window` or `tanstack-virtual`.
- [ ] **Smart Pre-fetching**: Background loading of next/previous images for zero-latency browsing.

## Phase 5: Testing & Validation
- [ ] Port legacy test scenarios (`legacy/test_app.py`, `legacy/test_batch_logic.py`) to Rust/TypeScript.
- [ ] Visual regression testing.
- [ ] Performance benchmarking (Scan speed, Metadata indexing).
