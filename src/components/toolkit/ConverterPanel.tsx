import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { ArrowLeftRight, FileImage, FolderOpen, X } from 'lucide-react';
import { useToast } from '../Toast';
import { api } from '../../api';
import { LABEL, BAR_BTN, BAR_BTN_GHOST, ICON_BTN_DANGER, HOVER_TOOLS, SEGMENT, SEGMENT_BTN } from '../ui/tokens';
import { SliderField, ToggleField, RunButton, StatusBox, GroupLabel } from './fields';

interface ConvertResult {
  converted: string[];
  skipped: string[];
  errors: string[];
}

type Mode = 'to_webp' | 'to_png';

/** PNG ↔ WebP batch converter (ComfyUI metadata preserved). Config left, file queue right. */
export const ConverterPanel = () => {
  const [mode, setMode] = useState('to_webp' as Mode);
  const [files, setFiles] = useState([] as string[]);
  const [quality, setQuality] = useState(85);
  const [lossless, setLossless] = useState(false);
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null as ConvertResult | null);
  const { showToast } = useToast();

  const srcExt = mode === 'to_webp' ? '.png' : '.webp';

  const switchMode = (next: Mode) => {
    setMode(next);
    setFiles([]);
    setResult(null);
  };

  const addFiles = async () => {
    const ext = mode === 'to_webp' ? ['png'] : ['webp'];
    const selected = await open({ multiple: true, filters: [{ name: 'Images', extensions: ext }] });
    if (!selected) return;
    const arr = Array.isArray(selected) ? selected : [selected];
    setFiles(prev => Array.from(new Set([...prev, ...arr])));
  };

  const addFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== 'string') return;
    try {
      const imgs = await api.scanPaths([selected], false) as any[];
      const filtered = imgs
        .filter(img => img.path.toLowerCase().endsWith(srcExt))
        .map(img => img.path as string);
      setFiles(prev => Array.from(new Set([...prev, ...filtered])));
      showToast(`Added ${filtered.length} ${srcExt} file(s)`, 'success');
    } catch (e: any) {
      showToast(String(e), 'error');
    }
  };

  const run = async () => {
    if (files.length === 0) { showToast('No files selected', 'error'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res: ConvertResult = mode === 'to_webp'
        ? await invoke('convert_to_webp', { paths: files, quality, lossless, deleteOriginal })
        : await invoke('convert_to_png', { paths: files, deleteOriginal });

      setResult(res);
      showToast(
        `${res.converted.length} converted · ${res.skipped.length} skipped · ${res.errors.length} errors`,
        res.errors.length > 0 ? 'error' : 'success'
      );

      // Drop converted files from the queue.
      if (res.converted.length > 0) {
        setFiles(prev => prev.filter(p => !res.converted.some(c =>
          c.replace(/\.\w+$/, '') === p.replace(/\.\w+$/, '')
        )));
      }
    } catch (e: any) {
      showToast(e?.message ?? String(e), 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex max-lg:flex-col">
      {/* Config column */}
      <div className="w-[26rem] max-lg:w-full shrink-0 lg:border-r border-white/5 flex flex-col min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2 space-y-1.5">
          <GroupLabel>Direction</GroupLabel>
          <div className={`${SEGMENT} w-full`}>
            <button
              onClick={() => switchMode('to_webp')}
              aria-pressed={mode === 'to_webp'}
              className={`${SEGMENT_BTN} flex-1 ${mode === 'to_webp' ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              PNG → WebP
            </button>
            <button
              onClick={() => switchMode('to_png')}
              aria-pressed={mode === 'to_png'}
              className={`${SEGMENT_BTN} flex-1 ${mode === 'to_png' ? 'bg-blue-600 text-white' : 'text-neutral-500 hover:text-white'}`}
            >
              WebP → PNG
            </button>
          </div>
          <p className="text-[9px] text-neutral-600 leading-snug">
            Switching direction clears the queue — the two modes take different source types.
          </p>

          {mode === 'to_webp' && (
            <>
              <GroupLabel>Encoding</GroupLabel>
              <ToggleField label="Lossless" value={lossless} onToggle={() => setLossless(v => !v)} />
              <SliderField
                label="Quality" min={1} max={100} step={1}
                value={quality} onChange={setQuality} disabled={lossless}
                format={n => (lossless ? '—' : String(n))}
              />
            </>
          )}

          <GroupLabel>After convert</GroupLabel>
          <ToggleField
            label="Delete source" value={deleteOriginal} onToggle={() => setDeleteOriginal(v => !v)} danger
            hint={deleteOriginal ? 'Originals are permanently removed — this cannot be undone.' : undefined}
          />
        </div>

        <div className="shrink-0 p-2 border-t border-white/5 bg-solid-panel space-y-1.5">
          {result && !running && (
            <StatusBox tone={result.errors.length > 0 ? 'error' : 'ok'}>
              <p className="font-black uppercase tracking-wide">
                {result.converted.length} converted · {result.skipped.length} skipped · {result.errors.length} errors
              </p>
              {result.errors.slice(0, 3).map((e, i) => (
                <p key={i} className="text-neutral-400 break-all mt-0.5">{e}</p>
              ))}
            </StatusBox>
          )}
          <RunButton
            onClick={run}
            disabled={running || files.length === 0}
            running={running}
            runningLabel="Converting…"
            label={`Convert ${files.length} file${files.length !== 1 ? 's' : ''}`}
            icon={<ArrowLeftRight className="w-3.5 h-3.5" />}
          />
        </div>
      </div>

      {/* File queue */}
      <div className="flex-1 min-h-0 min-w-0 flex flex-col bg-solid-nested">
        <div className="h-7 max-lg:h-14 shrink-0 flex items-center gap-1.5 px-2 border-b border-white/5 bg-solid-panel">
          <span className={LABEL}>{files.length} {srcExt} files</span>
          <div className="flex-1" />
          <button onClick={addFiles} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><FileImage className="w-3 h-3" /> Files</button>
          <button onClick={addFolder} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}><FolderOpen className="w-3 h-3" /> Folder</button>
          {files.length > 0 && (
            <button onClick={() => setFiles([])} className={`${BAR_BTN} ${BAR_BTN_GHOST}`}>Clear</button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-1">
          {files.length === 0 ? (
            <p className={`${LABEL} p-1`}>No {srcExt} files — add them with Files or Folder</p>
          ) : files.map(f => (
            <div key={f} className="group flex items-center gap-1.5 px-1.5 h-[20px] max-lg:h-10 rounded hover:bg-white/5">
              <span className="flex-1 min-w-0 text-[10px] font-mono text-neutral-400 truncate" title={f}>
                {f.split(/[\\/]/).pop()}
              </span>
              <div className={HOVER_TOOLS}>
                <button onClick={() => setFiles(prev => prev.filter(p => p !== f))} className={ICON_BTN_DANGER} aria-label={`Remove ${f}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {result && result.converted.length > 0 && !running && (
          <div className="shrink-0 max-h-40 overflow-y-auto scrollbar-thin border-t border-white/5 p-2">
            <GroupLabel>Converted ({result.converted.length})</GroupLabel>
            {result.converted.map(f => (
              <p key={f} className="text-[10px] font-mono text-green-300/70 truncate px-1" title={f}>
                {f.split(/[\\/]/).pop()}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
