# Spec: Peaking Mode

## Objective
Introduce "Peaking Mode" to ComfyView to allow users to efficiently browse a grid of thumbnails while simultaneously viewing a high-resolution version of the focused image. This mode is optimized for rapid classification (Keep/Trash) without the distraction of metadata.

### User Stories
- As a user, I want to see a grid of thumbnails on the left and the original image on the right.
- As a user, I want to navigate the grid and have the right-side viewer update immediately.
- As a user, I want my selection (check state) to remain untouched when I click an image to "peak" at it.
- As a user, I want to switch between Single, Batch, and Peaking modes while keeping my focus on the current image.
- As a user, I want to use my usual shortcuts (Keep, Trash, Next, Prev) in this mode.

## Tech Stack
- **Frontend:** React, TypeScript, Zustand.
- **Components:** `ImageGrid`, `ZoomPanViewer`, `AppHeader`, `Sidebar`.

## Commands
- **Dev:** `npm run tauri dev`
- **Build:** `npm run tauri build`
- **Test:** `npm test`

## Project Structure
- [useAppStore.ts](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/store/useAppStore.ts): Update state to include `viewMode`.
- [App.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/App.tsx): Implement Peaking Mode layout logic.
- [AppHeader.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/layout/AppHeader.tsx): Add UI for mode switching.
- [ImageGrid.tsx](file:///E:/GEMINI%20workspace/Comfy%20image%20browser/src/components/ImageGrid.tsx): Ensure it supports flexible container sizes.

## Code Style
- Follow existing "Surgical Strike" philosophy.
- Use Tailwind CSS for layout adjustments.
- Maintain consistency with existing dark theme and interaction patterns.

## Testing Strategy
- Manual verification of layout responsiveness.
- Verify `currentIndex` persistence when switching modes.
- Verify shortcut functionality in Peaking Mode.

## Boundaries
- **Always do:** Preserve `currentIndex` when switching modes.
- **Ask first:** If significant changes to `Sidebar` or `Inspector` visibility logic are needed beyond simple toggles.
- **Never do:** Remove existing `batchMode` logic entirely if it breaks legacy behavior; instead, bridge it with `viewMode`.

## Success Criteria
- [x] `viewMode` state successfully manages 'Single', 'Batch', and 'Peaking'.
- [x] Peaking Mode displays `ImageGrid` on the left and `ZoomPanViewer` (single) on the right.
- [x] `Inspector` is hidden in Peaking Mode.
- [x] Clicking a thumbnail in the left grid updates the right viewer without losing selection state.
- [x] Switching from Single/Batch to Peaking (and vice versa) keeps the same image focused.
- [x] Keyboard shortcuts (k, delete, arrows) work correctly in Peaking Mode.

## Open Questions
- Should the left grid in Peaking Mode be resizable? (Assumption: Fixed or standard width for now, similar to Sidebar but maybe wider).
- Should we use the existing `Sidebar` or a new component for the left pane? (Assumption: Reuse `ImageGrid` directly or via a simplified `Sidebar`).
