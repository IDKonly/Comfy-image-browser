import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { Play, RefreshCw, Layers } from 'lucide-react';
import { useToast } from '../Toast';
import { useAppStore } from '../../store/useAppStore';
import { settingsStore } from '../../api/settings';
import { loadClassifierPreset, listClassifierPresets } from '../tagclassifier/presets';
import { runWildcardPipeline, formatDateStamp } from '../../api/wildcardPipeline';
import type { PipelineResult } from '../../api/wildcardPipeline';
import type { WildcardPipelineSettings } from '../../store/types';
import { DEFAULT_PIPELINE_SETTINGS } from '../../store/types';
import { LABEL } from '../ui/tokens';
import {
  FolderField, SliderField, SelectField, ToggleField, SegmentField,
  RunButton, StatusBox, GroupLabel,
} from './fields';

type SeparationMode = WildcardPipelineSettings['separationMode'];

const SEPARATION_HINT: Record<SeparationMode, string> = {
  all: 'No split — one set of files per subset.',
  sfwOnly: 'Keep only SFW prompts.',
  nsfwOnly: 'Keep only NSFW prompts.',
  split: 'Both lanes, split by a sfw_/nsfw_ filename token.',
};

/** "Extract → Clean → Classify → Save" batch runner. Config left, run log right. */
export const PipelinePanel = () => {
  const [cfg, setCfg] = useState(DEFAULT_PIPELINE_SETTINGS as WildcardPipelineSettings);
  const [presets, setPresets] = useState([] as string[]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState('');
  const [lastResult, setLastResult] = useState(
    null as ({ ok: true } & PipelineResult) | { ok: false; error: string } | null
  );
  const [loaded, setLoaded] = useState(false);
  // Register names of the selected preset (null = none). When present, output is
  // partitioned by register and the SFW/NSFW mode control is redundant.
  const [presetRegisters, setPresetRegisters] = useState(null as string[] | null);

  const workshopFilter = useAppStore(s => s.workshopFilter);
  const nsfwTags = useAppStore(s => s.mobileServerSettings.nsfwTags);
  const { showToast } = useToast();

  useEffect(() => {
    const init = async () => {
      const saved = await settingsStore.get<WildcardPipelineSettings>('pipeline_settings');
      // Merge over defaults so settings saved before a field existed get the new default.
      if (saved) setCfg({ ...DEFAULT_PIPELINE_SETTINGS, ...saved });
      try { setPresets(await listClassifierPresets()); } catch {}
      setLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    settingsStore.set('pipeline_settings', cfg);
    settingsStore.save();
  }, [cfg, loaded]);

  useEffect(() => {
    let active = true;
    loadClassifierPreset(cfg.presetName)
      .then(p => { if (active) setPresetRegisters(p.registers.length > 0 ? p.registers.map(r => r.name) : null); })
      .catch(() => { if (active) setPresetRegisters(null); });
    return () => { active = false; };
  }, [cfg.presetName]);

  const update = (patch: Partial<WildcardPipelineSettings>) => setCfg(prev => ({ ...prev, ...patch }));

  const pickFolder = async (field: 'sourceFolder' | 'outputFolder') => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') update({ [field]: selected });
  };

  const run = async () => {
    if (!cfg.sourceFolder || !cfg.outputFolder) {
      showToast('Set source and output folders first', 'error');
      return;
    }
    setRunning(true);
    setLastResult(null);
    setStep('');
    try {
      const result = await runWildcardPipeline({ ...cfg, workshopFilter, nsfwTags }, s => setStep(s));
      setLastResult({ ok: true, ...result });
      showToast(`Pipeline done — ${result.savedFiles.length} file(s) saved`, 'success');
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      setLastResult({ ok: false, error: msg });
      showToast(msg, 'error');
    } finally {
      setRunning(false);
      setStep('');
    }
  };

  const refreshPresets = async () => {
    try {
      const names = await listClassifierPresets();
      setPresets(names);
      showToast(`Found ${names.length} preset(s)`, 'success');
    } catch {}
  };

  return (
    <div className="flex-1 min-h-0 flex max-lg:flex-col">
      {/* Config column */}
      <div className="w-[26rem] max-lg:w-full shrink-0 lg:border-r border-white/5 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          <GroupLabel>Folders</GroupLabel>
          <FolderField label="Source" value={cfg.sourceFolder} onPick={() => pickFolder('sourceFolder')} />
          <FolderField label="Output" value={cfg.outputFolder} onPick={() => pickFolder('outputFolder')} />
          <ToggleField label="Recursive" value={cfg.recursive} onToggle={() => update({ recursive: !cfg.recursive })} />

          <GroupLabel>Classification</GroupLabel>
          <SelectField
            label="Preset"
            value={cfg.presetName}
            onChange={v => update({ presetName: v })}
            options={[{ value: 'default', label: 'default (current)' }, ...presets.map(p => ({ value: p, label: p }))]}
          />

          {presetRegisters ? (
            <div className="flex items-start gap-2">
              <span className={`${LABEL} w-[6.5rem] shrink-0 text-right leading-6`}>Registers</span>
              <div className="flex-1 min-w-0 px-2 py-1 bg-purple-600/10 border border-purple-500/25 rounded-md">
                <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-purple-300">
                  <Layers className="w-3 h-3" /> {presetRegisters.join(' · ')}
                </p>
                <p className="text-[9px] text-neutral-500 mt-0.5">
                  Output partitioned as &lt;date&gt;_&lt;register&gt;_&lt;group&gt;.txt — SFW/NSFW mode is ignored.
                </p>
              </div>
            </div>
          ) : (
            <SegmentField
              label="SFW split"
              value={cfg.separationMode}
              onChange={(v: SeparationMode) => update({ separationMode: v })}
              options={[
                { value: 'all' as SeparationMode, label: 'All' },
                { value: 'sfwOnly' as SeparationMode, label: 'SFW' },
                { value: 'nsfwOnly' as SeparationMode, label: 'NSFW' },
                { value: 'split' as SeparationMode, label: 'Split' },
              ]}
              hint={`${SEPARATION_HINT[cfg.separationMode]} Judged by NSFW keywords in Settings.`}
            />
          )}

          <SliderField
            label="Threshold" min={0} max={1} step={0.01}
            value={cfg.workshopThreshold}
            onChange={n => update({ workshopThreshold: n })}
            format={n => n.toFixed(2)}
            hint="Shared with Wildcard Workshop, along with its exclusion filters."
          />

          <GroupLabel>Output options</GroupLabel>
          <ToggleField label="Dedupe" value={cfg.removeDuplicates} onToggle={() => update({ removeDuplicates: !cfg.removeDuplicates })} />
          <ToggleField
            label="Date prefix" value={cfg.datePrefix} onToggle={() => update({ datePrefix: !cfg.datePrefix })}
            hint={`Prepend ${cfg.datePrefix ? `${formatDateStamp()}_` : 'YYMMDD_'} to filenames`}
          />
          <ToggleField
            label="Save raw" value={cfg.saveRaw} onToggle={() => update({ saveRaw: !cfg.saveRaw })}
            hint="Also dump pre-classification prompts as raw.txt"
          />
          <ToggleField
            label="Auto-run" value={cfg.autoRunOnScan} onToggle={() => update({ autoRunOnScan: !cfg.autoRunOnScan })}
            hint="Mode B — triggers after every folder scan"
          />
        </div>

        <div className="shrink-0 p-2 border-t border-white/5 bg-solid-panel space-y-1.5">
          <RunButton
            onClick={run}
            disabled={running || !cfg.sourceFolder || !cfg.outputFolder}
            running={running}
            runningLabel="Running…"
            label="Run pipeline"
            icon={<Play className="w-3.5 h-3.5" />}
          />
          <button
            onClick={refreshPresets}
            className="w-full h-6 max-lg:h-11 flex items-center justify-center gap-1.5 bg-neutral-950 hover:bg-neutral-800 border border-white/10 rounded-md text-[9px] font-black uppercase tracking-wide text-neutral-400 hover:text-white transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Refresh presets
          </button>
        </div>
      </div>

      {/* Run log */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto scrollbar-thin p-2 space-y-1.5 bg-solid-nested">
        {running && step && <StatusBox tone="info">{step}</StatusBox>}

        {lastResult && !running && (
          lastResult.ok ? (
            <StatusBox tone="ok">
              <p className="font-black uppercase tracking-wide">
                {lastResult.totalLines} → {lastResult.cleanedLines} prompts → {lastResult.savedFiles.length} files
              </p>
              {lastResult.laneCounts && (
                <p className="text-neutral-400 mt-0.5">SFW {lastResult.laneCounts.sfw} · NSFW {lastResult.laneCounts.nsfw}</p>
              )}
              {lastResult.registerCounts && (
                <p className="text-neutral-400 mt-0.5">
                  {Object.entries(lastResult.registerCounts).map(([n, c]) => `${n} ${c}`).join(' · ')}
                </p>
              )}
            </StatusBox>
          ) : (
            <StatusBox tone="error">{lastResult.error}</StatusBox>
          )
        )}

        {lastResult?.ok && lastResult.savedFiles.length > 0 && (
          <>
            <GroupLabel>Saved files ({lastResult.savedFiles.length})</GroupLabel>
            <div className="space-y-0.5">
              {lastResult.savedFiles.map(f => (
                <p key={f} className="text-[10px] font-mono text-neutral-300 truncate px-1" title={f}>
                  {f.split(/[\\/]/).pop()}
                </p>
              ))}
            </div>
          </>
        )}

        {!running && !lastResult && (
          <p className={`${LABEL} p-2`}>Run the pipeline to see its output here</p>
        )}
      </div>
    </div>
  );
};
