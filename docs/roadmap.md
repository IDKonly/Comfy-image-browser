# Project Roadmap: Comfy Image Browser (Evolution)

## Phase 1: Foundation & High-Performance Core (Completed)
- [x] Tech Stack Migration: Tauri v2 + React + Rust.
- [x] High-speed directory scanning (Rust).
- [x] PNG Metadata (tEXt/iTXt) parsing.
- [x] Basic File Operations (Delete, Keep).
- [x] Keyboard Navigation.

## Phase 2: Visual Feedback Loop & GUI/UX Polish (Completed)
- [x] **Visual Feedback System**:
    - [x] Add Toast notifications for file operations.
    - [x] Smooth transitions between images.
- [x] **Advanced Viewer UX**:
    - [x] Implementation of Zoom/Pan (high-perf CSS/React).
- [x] **Layout Optimization**:
    - [x] Batch Mode (Grid View).
    - [x] Modern dark-themed aesthetic.

## Phase 3: Scenario-Driven Feature Parity & Intelligence (Completed)
- [x] **Batch Logic**:
    - [x] Ported "contiguous prompt grouping" logic.
    - [x] Visual grouping indicators in Batch Mode.
- [x] **Advanced Search & Filter**:
    - [x] Multi-tag search (AND condition).
    - [x] Filter by Model/Sampler.
    - [x] Recursive folder scanning and searching.
- [x] **Wildcard Workshop**:
    - [x] AI-driven prompt compression.
    - [x] Similarity-based results sorting.
    - [x] Interactive tag refining.

## Phase 4: Performance & Stability (Completed)
- [x] **Virtualized List**: High-performance scrolling for 10k+ images.
- [x] **Multi-threading Optimization**: Parallel metadata indexing and thumbnail generation.
- [x] **Undo System**: Revert accidental file moves with Ctrl+Z.
- [x] **Persistence**: Secure storage of settings and database in app data directory.

## Phase 5: Advanced Intelligence & Ecosystem
- [x] **Simple Wildcard Mode**: Added option to skip recursive compression for raw unique filtered prompts.
- [x] **Social Sharing**: One-click Twitter (X) sharing with automated tag picking and clipboard integration.
- [ ] **AI Tagging**: Auto-tagging images without metadata using local LLM/Vision models.
- [ ] **Duplicate Detection**: Find and group identical or highly similar images.
- [ ] **Mobile Remote**: View and sort images from a mobile device on the same network.
- [ ] **Extension API**: Support for community-made themes and plugins.
