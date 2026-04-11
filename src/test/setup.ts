import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri APIs that might be used during tests
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path) => `asset://${path}`),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  confirm: vi.fn(),
  message: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
