# Comfy Image Browser (Next-Gen)

A high-performance image browser for AI-generated images, rebuilt with **Tauri v2** and **React**.

## 🚀 Key Improvements
*   **Blazing Fast Scanning:** Scans 1,000 images in ~1.2ms (Rust).
*   **Memory Efficient:** Native Rust backend for heavy I/O and metadata parsing.
*   **Modern UI:** Built with React, Tailwind CSS, and Lucide Icons.
*   **GPU Accelerated:** Fluid image rendering and UI interactions via Webview2.

## 🛠 Tech Stack
*   **Backend:** Rust (Tauri v2)
*   **Frontend:** React (TypeScript), Vite, Tailwind CSS
*   **State Management:** Zustand
*   **Icons:** Lucide React

## 🎮 Shortcuts
*   `Left / Right Arrow`: Navigate images
*   `Delete`: Move current image to `_Trash`
*   `K`: Move current image to `_Keep`

## 📦 Development
1. Install dependencies: `npm install`
2. Run in dev mode: `npm run tauri dev`
3. Build: `npm run tauri build`
