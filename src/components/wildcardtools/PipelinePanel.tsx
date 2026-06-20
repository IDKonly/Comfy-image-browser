import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { BaseDirectory } from '@tauri-apps/plugin-fs';
import { FolderOpen, Play, CheckCircle, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '../Toast';
import { useAppStore } from '../../store/useAppStore';
import { settingsStore } from '../../api/settings';
import { fsExists, fsReadDir } from '../tagclassifier/browserFallback';
import { runWildcardPipeline } from '../../api/wildcardPipeline';
import type { WildcardPipelineSettings } from '../../store/types';
import { DEFAULT_PIPELINE_SETTINGS } from '../../store/types';

export const PipelinePanel = () => {
  const [cfg, setCfg] = useState<WildcardPipelineSettings>(DEFAULT_PIPELINE_SETTINGS);
  const [presets, setPresets] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState('');
  const [lastResult, setLastResult] = useState<{ ok: true; totalLines: number; cleanedLines: number; savedFiles: string[] } | { ok: false; error: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  const workshopFilter = useAppStore(s => s.workshopFilter);
  const { showToast } = useToast();

  // Load saved settings and preset list
  useEffect(() => {
    const init = async () => {
      const saved = await settingsStore.get<WildcardPipelineSettings>('pipeline_settings');
      if (saved) setCfg(saved);

      try {
        const subDir = 'classifier_presets';
        if (await fsExists(subDir, { baseDir: BaseDirectory.AppData })) {
          const entries = await fsReadDir(subDir, { baseDir: BaseDirectory.AppData });
          const names = entries
            .filter((e: any) => e.name?.endsWith('.json'))
            .map((e: any) => e.name.replace('.json', '') as string);
          setPresets(names);
        }
      } catch {}

      setLoaded(true);
    };
    init();
  }, []);

  // Persist settings whenever they change
  useEffect(() => {
    if (!loaded) return;
    settingsStore.set('pipeline_settings', cfg);
    settingsStore.save();
  }, [cfg, loaded]);

  const update = (patch: Partial<WildcardPipelineSettings>) =>
    setCfg(prev => ({ ...prev, ...patch }));

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
      const result = await runWildcardPipeline(
        { ...cfg, workshopFilter },
        s => setStep(s)
      );
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

  return (
    <div className="flex flex-col gap-5 p-6">

      {/* Source Folder */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Source Folder</label>
        <div className="flex gap-2">
          <div className="flex-1 bg-neutral-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-300 truncate min-w-0">
            {cfg.sourceFolder || <span className="text-neutral-600">Not set</span>}
          </div>
          <button
            onClick={() => pickFolder('sourceFolder')}
            className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-white/5 transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-neutral-300" />
          </button>
        </div>
      </div>

      {/* Output Folder */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Output Folder</label>
        <div className="flex gap-2">
          <div className="flex-1 bg-neutral-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-300 truncate min-w-0">
            {cfg.outputFolder || <span className="text-neutral-600">Not set</span>}
          </div>
          <button
            onClick={() => pickFolder('outputFolder')}
            className="px-3 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl border border-white/5 transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-neutral-300" />
          </button>
        </div>
      </div>

      {/* Preset + Recursive row */}
      <div className="flex gap-4">
        <div className="flex-1 space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">TagClassifier Preset</label>
          <select
            value={cfg.presetName}
            onChange={e => update({ presetName: e.target.value })}
            className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-200 focus:outline-none"
          >
            <option value="default">default (current)</option>
            {presets.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Recursive</label>
          <button
            onClick={() => update({ recursive: !cfg.recursive })}
            className={`w-full h-[38px] px-4 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
              cfg.recursive
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-400'
                : 'bg-neutral-950 border-white/5 text-neutral-500'
            }`}
          >
            {cfg.recursive ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Threshold */}
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Workshop Threshold</label>
          <span className="text-[10px] font-black text-blue-400">{cfg.workshopThreshold.toFixed(2)}</span>
        </div>
        <input
          type="range" min={0} max={1} step={0.01}
          value={cfg.workshopThreshold}
          onChange={e => update({ workshopThreshold: parseFloat(e.target.value) })}
          className="w-full h-1.5 appearance-none bg-neutral-700 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 cursor-pointer"
        />
        <p className="text-[10px] text-neutral-600">Shared with Wildcard Workshop filter state</p>
      </div>

      {/* Toggle options */}
      <div className="flex flex-col gap-2">
        <label className="flex items-center justify-between py-2.5 px-3 bg-neutral-950 border border-white/5 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
          <span className="text-xs font-bold text-neutral-300">Remove Duplicates</span>
          <div className={`w-8 h-4.5 rounded-full transition-colors relative ${cfg.removeDuplicates ? 'bg-blue-600' : 'bg-neutral-700'}`}
            style={{ height: '18px' }}
            onClick={() => update({ removeDuplicates: !cfg.removeDuplicates })}
          >
            <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${cfg.removeDuplicates ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
        <label className="flex items-center justify-between py-2.5 px-3 bg-neutral-950 border border-white/5 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
          <div>
            <span className="text-xs font-bold text-neutral-300">Auto-run on Scan Complete</span>
            <p className="text-[10px] text-neutral-600 mt-0.5">Mode B — triggers after every folder scan</p>
          </div>
          <div className={`w-8 rounded-full transition-colors relative flex-shrink-0 ${cfg.autoRunOnScan ? 'bg-blue-600' : 'bg-neutral-700'}`}
            style={{ height: '18px', width: '34px' }}
            onClick={() => update({ autoRunOnScan: !cfg.autoRunOnScan })}
          >
            <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${cfg.autoRunOnScan ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </div>
        </label>
      </div>

      {/* Filter note */}
      <p className="text-[10px] text-neutral-600 -mt-2">
        Exclusion filters (partial/exact/exceptions) are shared from Wildcard Workshop settings.
      </p>

      {/* Progress */}
      {running && step && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-600/10 border border-blue-500/20 rounded-xl">
          <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin flex-shrink-0" />
          <span className="text-[10px] font-bold text-blue-300">{step}</span>
        </div>
      )}

      {/* Result */}
      {lastResult && !running && (
        <div className={`px-3 py-3 rounded-xl border space-y-1.5 ${
          lastResult.ok
            ? 'bg-green-600/10 border-green-500/20'
            : 'bg-red-600/10 border-red-500/20'
        }`}>
          {lastResult.ok ? (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-[10px] font-black text-green-300 uppercase tracking-widest">
                  Done — {lastResult.totalLines} → {lastResult.cleanedLines} prompts → {lastResult.savedFiles.length} files
                </span>
              </div>
              {lastResult.savedFiles.map(f => (
                <div key={f} className="text-[10px] text-neutral-400 pl-5 truncate">{f.split(/[\\/]/).pop()}</div>
              ))}
            </>
          ) : (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-red-300">{lastResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Run Button */}
      <button
        onClick={run}
        disabled={running || !cfg.sourceFolder || !cfg.outputFolder}
        className="flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 text-white"
      >
        {running
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Running...</>
          : <><Play className="w-4 h-4" /> Run Pipeline Now</>
        }
      </button>

      {/* Re-scan presets */}
      <button
        onClick={async () => {
          try {
            const subDir = 'classifier_presets';
            if (await fsExists(subDir, { baseDir: BaseDirectory.AppData })) {
              const entries = await fsReadDir(subDir, { baseDir: BaseDirectory.AppData });
              const names = entries
                .filter((e: any) => e.name?.endsWith('.json'))
                .map((e: any) => e.name.replace('.json', '') as string);
              setPresets(names);
              showToast(`Found ${names.length} preset(s)`, 'success');
            }
          } catch {}
        }}
        className="flex items-center justify-center gap-2 py-2.5 bg-neutral-800 hover:bg-neutral-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-neutral-400 transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Refresh Presets
      </button>
    </div>
  );
};
