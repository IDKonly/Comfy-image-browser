import { useState, useEffect } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Sparkles, Copy, Download } from 'lucide-react';
import { useToast } from '../Toast';
import { useAppStore } from '../../store/useAppStore';
import { settingsStore } from '../../api/settings';
import { api } from '../../api';
import { loadClassifierPreset, listClassifierPresets } from '../tagclassifier/presets';
import { runPromptGenerator, type GeneratedPrompt } from '../../api/promptGenerator';
import type { GeneratorSettings } from '../../store/types';
import { DEFAULT_GENERATOR_SETTINGS } from '../../store/types';
import { LABEL, BAR_BTN, BAR_BTN_GHOST } from '../ui/tokens';
import {
  FolderField, SliderField, SelectField, ToggleField, Row,
  RunButton, StatusBox, GroupLabel,
} from './fields';

/** Samples N coherent prompts from the library. Config left, generated prompts right. */
export const GeneratorPanel = () => {
  const [cfg, setCfg] = useState(DEFAULT_GENERATOR_SETTINGS as GeneratorSettings);
  const [presets, setPresets] = useState([] as string[]);
  const [presetRegisters, setPresetRegisters] = useState([] as string[]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState('');
  const [prompts, setPrompts] = useState([] as GeneratedPrompt[]);
  const [error, setError] = useState(null as string | null);
  const [loaded, setLoaded] = useState(false);

  const workshopFilter = useAppStore(s => s.workshopFilter);
  const { showToast } = useToast();

  useEffect(() => {
    const init = async () => {
      const saved = await settingsStore.get<GeneratorSettings>('generator_settings');
      if (saved) setCfg({ ...DEFAULT_GENERATOR_SETTINGS, ...saved });
      try { setPresets(await listClassifierPresets()); } catch {}
      setLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    settingsStore.set('generator_settings', cfg);
    settingsStore.save();
  }, [cfg, loaded]);

  // Detect registers of the selected preset (for the register filter dropdown).
  useEffect(() => {
    let active = true;
    loadClassifierPreset(cfg.presetName)
      .then(p => {
        if (!active) return;
        const names = p.registers.map(r => r.name);
        setPresetRegisters(names);
        // Drop a stale register filter that no longer exists in this preset.
        if (cfg.register && !names.includes(cfg.register)) setCfg(prev => ({ ...prev, register: '' }));
      })
      .catch(() => { if (active) setPresetRegisters([]); });
    return () => { active = false; };
  }, [cfg.presetName]);

  const update = (patch: Partial<GeneratorSettings>) => setCfg(prev => ({ ...prev, ...patch }));

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') update({ sourceFolder: selected });
  };

  const run = async () => {
    if (!cfg.sourceFolder) {
      showToast('Set a source folder first', 'error');
      return;
    }
    setRunning(true);
    setError(null);
    setPrompts([]);
    setStep('');
    try {
      const result = await runPromptGenerator({ ...cfg, workshopFilter, seed: Date.now() }, s => setStep(s));
      setPrompts(result.prompts);
      showToast(`Generated ${result.prompts.length} prompt(s) from ${result.corpusSize} sources`, 'success');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setRunning(false);
      setStep('');
    }
  };

  const copyAll = () => {
    navigator.clipboard.writeText(prompts.map(p => p.text).join('\n'));
    showToast('Copied all prompts', 'success');
  };

  const exportAll = async () => {
    if (prompts.length === 0) return;
    try {
      const path = await save({ filters: [{ name: 'Text', extensions: ['txt'] }], defaultPath: 'generated_prompts.txt' });
      if (path) {
        await api.saveToFile(path, prompts.map(p => p.text).join('\n'));
        showToast('Exported', 'success');
      }
    } catch (e: any) {
      showToast(e?.message ?? String(e), 'error');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex max-lg:flex-col">
      {/* Config column */}
      <div className="w-[26rem] max-lg:w-full shrink-0 lg:border-r border-white/5 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          <GroupLabel>Corpus</GroupLabel>
          <FolderField label="Source" value={cfg.sourceFolder} onPick={pickFolder} />
          <ToggleField label="Recursive" value={cfg.recursive} onToggle={() => update({ recursive: !cfg.recursive })} />
          <SelectField
            label="Preset"
            value={cfg.presetName}
            onChange={v => update({ presetName: v })}
            options={[{ value: 'default', label: 'default (current)' }, ...presets.map(p => ({ value: p, label: p }))]}
          />
          {presetRegisters.length > 0 && (
            <SelectField
              label="Register"
              value={cfg.register}
              onChange={v => update({ register: v })}
              options={[{ value: '', label: 'All registers' }, ...presetRegisters.map(r => ({ value: r, label: r }))]}
              hint="Draw fragments only from this scene, keeping combinations coherent."
            />
          )}

          <GroupLabel>Generation</GroupLabel>
          <Row
            label="Must include"
            hint="Anchors every prompt — remaining groups are filled with compatible fragments."
          >
            <textarea
              value={cfg.mustInclude}
              onChange={e => update({ mustInclude: e.target.value })}
              placeholder="1girl, masterpiece, … (leave empty for pure random)"
              aria-label="Must-include tags"
              className="w-full h-14 bg-neutral-950 border border-white/10 focus:border-blue-500/50 rounded-md px-1.5 py-1 text-[10px] font-mono text-neutral-100 placeholder-neutral-600 outline-none resize-none scrollbar-thin transition-colors"
            />
          </Row>
          <SliderField label="Count" min={1} max={200} step={1} value={cfg.count} onChange={n => update({ count: n })} />
          <SliderField
            label="Min score" min={-2} max={4} step={0.1}
            value={cfg.minScore} onChange={n => update({ minScore: n })}
            format={n => n.toFixed(1)}
            hint="PMI threshold; higher = stricter and more coherent but less varied. 0 keeps positive co-occurrence."
          />
        </div>

        <div className="shrink-0 p-2 border-t border-white/5 bg-solid-panel">
          <RunButton
            onClick={run}
            disabled={running || !cfg.sourceFolder}
            running={running}
            runningLabel="Generating…"
            label="Generate prompts"
            icon={<Sparkles className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-solid-nested">
        <div className="h-7 max-lg:h-14 shrink-0 flex items-center gap-1.5 px-2 border-b border-white/5 bg-solid-panel">
          <span className={LABEL}>{prompts.length} prompts</span>
          <div className="flex-1" />
          {prompts.length > 0 && (
            <>
              <button onClick={copyAll} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><Copy className="w-3 h-3" /> Copy</button>
              <button onClick={exportAll} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><Download className="w-3 h-3" /> Export</button>
            </>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {running && step && <StatusBox tone="info">{step}</StatusBox>}
          {error && !running && <StatusBox tone="error">{error}</StatusBox>}
          {!running && !error && prompts.length === 0 && (
            <p className={`${LABEL} p-1`}>Generated prompts appear here</p>
          )}
          {prompts.map((p, i) => (
            <div key={i} className="flex items-start gap-1.5 px-1.5 py-1 bg-solid-card border border-white/5 rounded-md">
              <span className="w-8 shrink-0 text-right text-[9px] font-mono font-black text-neutral-600 tabular-nums leading-4">
                {p.score.toFixed(2)}
              </span>
              <span className="flex-1 min-w-0 text-[10.5px] font-mono text-neutral-300 leading-4 break-words">{p.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
