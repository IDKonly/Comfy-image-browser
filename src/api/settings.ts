import { LazyStore } from "@tauri-apps/plugin-store";

/**
 * Single tauri-plugin-store file backing all front-end tool settings (Workshop,
 * Tag Classifier, Batch Crop). Previously these were fragmented across `.settings.json`,
 * `.tag_classifier.json`, and raw localStorage. Keys are namespaced by tool
 * (`workshop_*`, classifier `subsets`/`wordGroups`/`last_preset`, `recent_crop_*`).
 *
 * Import this shared instance everywhere — do not create additional LazyStore(".settings.json").
 */
export const settingsStore = new LazyStore(".settings.json");
