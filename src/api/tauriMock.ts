import { mockIPC, mockWindows, mockConvertFileSrc } from "@tauri-apps/api/mocks";

// Inject Tauri API mocks in browser environment (e.g. Playwright audit or standard web browser)
if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
  console.log("[Mock] Injecting Tauri API Mocks for Browser Context...");
  mockWindows("main");
  mockConvertFileSrc("windows");
  
  mockIPC((cmd, args: any) => {
    console.log(`[Mock IPC] Command: ${cmd}`, args);
    
    // Tauri Store Plugin Mocking (v2 uses array [value, exists] for internal IPC returns)
    if (cmd === "plugin:store|get") {
      const key = args?.key;
      const storePath = args?.path;
      
      if (storePath?.includes(".settings.json")) {
        if (key === "workshop_threshold") return [0.5, true];
        if (key === "workshop_max_words") return [3, true];
        if (key === "workshop_min_tags") return [2, true];
        if (key === "workshop_max_depth") return [4, true];
        if (key === "workshop_recursive") return [false, true];
        if (key === "workshop_simple_mode") return [false, true];
        if (key === "workshop_filter") return [null, true];
      }
      
      if (storePath?.includes(".tag_classifier.json")) {
        if (key === "last_preset") return ["default", true];
        if (key === "subsets") return [[{ id: 1, name: "Characters", keywords: [], excludeKeywords: [] }], true];
        if (key === "wordGroups") return [[], true];
      }

      return [undefined, false];
    }
    
    if (cmd === "plugin:store|load") return 1;
    if (cmd === "plugin:store|get_store") return null;
    if (cmd === "plugin:store|set") return null;
    if (cmd === "plugin:store|save") return null;
    
    // Tauri File System Plugin Mocking
    if (cmd === "plugin:fs|exists") return false;
    if (cmd === "plugin:fs|mkdir") return null;
    if (cmd === "plugin:fs|read_dir") return [];
    
    // App Command Mocks
    if (cmd === "scan_directory") {
      return { folder: "", images: [], initial_index: 0 };
    }
    if (cmd === "get_all_prompts") return [];
    if (cmd === "generate_wildcards") return [];
    if (cmd === "classify_prompts_command") return [];
    if (cmd === "get_tag_suggestions") return [];
    
    return null;
  }, { shouldMockEvents: true });
}
