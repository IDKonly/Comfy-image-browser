import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// browserFallback pulls in fs/dialog/store surfaces the global setup only partially mocks,
// so declare complete local mocks here.
const fsMocks = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  writeTextFile: vi.fn(),
  readTextFile: vi.fn(),
  readDir: vi.fn(),
  remove: vi.fn(),
}));

const storeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  ...fsMocks,
  BaseDirectory: { AppData: 6 },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(), save: vi.fn(), confirm: vi.fn(), message: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-store", () => ({
  LazyStore: class { get = vi.fn(); set = vi.fn(); save = vi.fn(); },
}));

vi.mock("../../../api/settings", () => ({ settingsStore: storeMocks }));

/** Load a fresh copy of the module with the given Tauri globals in place. */
const loadWithGlobals = async (globals: Record<string, unknown>) => {
  vi.resetModules();
  for (const [k, v] of Object.entries(globals)) (window as any)[k] = v;
  return await import("../browserFallback");
};

const clearTauriGlobals = () => {
  delete (window as any).__TAURI__;
  delete (window as any).__TAURI_INTERNALS__;
};

describe("browserFallback / isTauri probe", () => {
  beforeEach(() => { clearTauriGlobals(); localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { clearTauriGlobals(); });

  it("is false in a plain browser with no Tauri globals", async () => {
    const { isTauri } = await loadWithGlobals({});
    expect(isTauri).toBe(false);
  });

  it("is true when __TAURI_INTERNALS__ is present", async () => {
    const { isTauri } = await loadWithGlobals({ __TAURI_INTERNALS__: { invoke: () => {} } });
    expect(isTauri).toBe(true);
  });

  // Regression: the probe used to read `__TAURI__`, which is only injected when
  // `app.withGlobalTauri` is enabled in tauri.conf.json — it is not. That made every
  // wrapper take the browser-mock branch inside the real desktop app, so Direct/Filtered
  // Import silently returned hardcoded sample prompts.
  it("does not depend on __TAURI__, which withGlobalTauri gates", async () => {
    const { isTauri } = await loadWithGlobals({ __TAURI_INTERNALS__: { invoke: () => {} } });
    expect(isTauri).toBe(true);
    expect((window as any).__TAURI__).toBeUndefined();
  });
});

describe("rescueStrandedBrowserConfig", () => {
  beforeEach(() => { clearTauriGlobals(); localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => { clearTauriGlobals(); });

  it("no-ops outside Tauri", async () => {
    localStorage.setItem(".settings.json:subsets", "[]");
    const { rescueStrandedBrowserConfig } = await loadWithGlobals({});
    await rescueStrandedBrowserConfig();
    expect(storeMocks.set).not.toHaveBeenCalled();
  });

  it("copies stranded config keys and presets, then marks itself done", async () => {
    localStorage.setItem(".settings.json:subsets", JSON.stringify([{ id: 1, name: "Characters" }]));
    localStorage.setItem(".settings.json:last_preset", JSON.stringify("nsfw"));
    localStorage.setItem("browser_preset:nsfw", '{"subsets":[]}');

    storeMocks.get.mockResolvedValue(null);       // nothing in the real store yet
    fsMocks.exists.mockResolvedValue(false);      // preset dir and file absent

    const { rescueStrandedBrowserConfig } = await loadWithGlobals({ __TAURI_INTERNALS__: {} });
    await rescueStrandedBrowserConfig();

    expect(storeMocks.set).toHaveBeenCalledWith("subsets", [{ id: 1, name: "Characters" }]);
    expect(storeMocks.set).toHaveBeenCalledWith("last_preset", "nsfw");
    expect(fsMocks.mkdir).toHaveBeenCalled();
    expect(fsMocks.writeTextFile).toHaveBeenCalledWith(
      "classifier_presets/nsfw.json", '{"subsets":[]}', expect.anything()
    );
    expect(storeMocks.set).toHaveBeenCalledWith("classifier_localstorage_rescued", true);
    // Non-destructive: localStorage is left intact.
    expect(localStorage.getItem("browser_preset:nsfw")).toBe('{"subsets":[]}');
  });

  it("never overwrites values already in the real store", async () => {
    localStorage.setItem(".settings.json:subsets", JSON.stringify([{ id: 9 }]));
    storeMocks.get.mockImplementation(async (k: string) =>
      k === "subsets" ? [{ id: 1, name: "real" }] : null
    );
    fsMocks.exists.mockResolvedValue(false);

    const { rescueStrandedBrowserConfig } = await loadWithGlobals({ __TAURI_INTERNALS__: {} });
    await rescueStrandedBrowserConfig();

    expect(storeMocks.set).not.toHaveBeenCalledWith("subsets", expect.anything());
  });

  it("runs only once", async () => {
    localStorage.setItem(".settings.json:subsets", "[]");
    storeMocks.get.mockImplementation(async (k: string) =>
      k === "classifier_localstorage_rescued" ? true : null
    );

    const { rescueStrandedBrowserConfig } = await loadWithGlobals({ __TAURI_INTERNALS__: {} });
    await rescueStrandedBrowserConfig();

    expect(storeMocks.set).not.toHaveBeenCalled();
  });
});
