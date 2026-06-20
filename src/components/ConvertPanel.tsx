import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { X, FileImage, ArrowLeftRight, FolderOpen, Loader2, CheckCircle, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from './Toast';
import { api } from '../api';

interface ConvertResult {
  converted: string[];
  skipped: string[];
  errors: string[];
}

interface ConvertPanelProps {
  onClose: () => void;
}

export const ConvertPanel = ({ onClose }: ConvertPanelProps) => {
  const [mode, setMode] = useState<'to_webp' | 'to_png'>('to_webp');
  const [files, setFiles] = useState<string[]>([]);
  const [quality, setQuality] = useState(85);
  const [lossless, setLossless] = useState(false);
  const [deleteOriginal, setDeleteOriginal] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConvertResult | null>(null);
  const { showToast } = useToast();

  const srcExt = mode === 'to_webp' ? '.png' : '.webp';

  const switchMode = (next: 'to_webp' | 'to_png') => {
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

  const removeFile = (path: string) => setFiles(prev => prev.filter(p => p !== path));

  const run = async () => {
    if (files.length === 0) { showToast('No files selected', 'error'); return; }
    setRunning(true);
    setResult(null);
    try {
      const res: ConvertResult = mode === 'to_webp'
        ? await invoke('convert_to_webp', { paths: files, quality, lossless, deleteOriginal })
        : await invoke('convert_to_png',  { paths: files, deleteOriginal });

      setResult(res);
      const msg = `${res.converted.length} converted · ${res.skipped.length} skipped · ${res.errors.length} errors`;
      showToast(msg, res.errors.length > 0 ? 'error' : 'success');

      // Remove converted files from the list
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-xl max-h-[88vh] shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600/20 rounded-xl flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest">Image Converter</h2>
              <p className="text-[10px] text-neutral-400 font-bold">PNG ↔ WebP · ComfyUI metadata preserved</p>
            </div>
          </div>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">

          {/* Mode toggle */}
          <div className="flex bg-neutral-950 rounded-xl p-1 border border-white/5">
            <button
              onClick={() => switchMode('to_webp')}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${mode === 'to_webp' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              PNG → WebP
            </button>
            <button
              onClick={() => switchMode('to_png')}
              className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${mode === 'to_png' ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              WebP → PNG
            </button>
          </div>

          {/* File list */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                {srcExt.toUpperCase()} Files ({files.length})
              </label>
              <div className="flex gap-1.5">
                <button
                  onClick={addFiles}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-neutral-300 transition-colors"
                >
                  <FileImage className="w-3 h-3" /> Files
                </button>
                <button
                  onClick={addFolder}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-neutral-300 transition-colors"
                >
                  <FolderOpen className="w-3 h-3" /> Folder
                </button>
                {files.length > 0 && (
                  <button
                    onClick={() => setFiles([])}
                    className="px-2.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-[9px] font-black uppercase text-neutral-500 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="bg-neutral-950 border border-white/5 rounded-xl p-3 min-h-[96px] max-h-[200px] overflow-y-auto scrollbar-thin">
              {files.length === 0 ? (
                <div className="flex items-center justify-center h-full py-8 text-[10px] text-neutral-600">
                  No {srcExt} files — click Files or Folder to add
                </div>
              ) : (
                <div className="space-y-0.5">
                  {files.map(f => (
                    <div key={f} className="flex items-center justify-between group py-0.5">
                      <span className="text-[10px] text-neutral-400 truncate min-w-0">
                        {f.split(/[\\/]/).pop()}
                      </span>
                      <button
                        onClick={() => removeFile(f)}
                        className="ml-2 opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 transition-all flex-shrink-0"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* PNG→WebP quality options */}
          {mode === 'to_webp' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Quality</label>
                  <span className="text-[10px] font-black text-blue-400">{lossless ? 'Lossless' : quality}</span>
                </div>
                <input
                  type="range" min={1} max={100} step={1}
                  value={quality}
                  disabled={lossless}
                  onChange={e => setQuality(parseInt(e.target.value))}
                  className="w-full h-1.5 appearance-none bg-neutral-700 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <label className="flex items-center justify-between py-2.5 px-3 bg-neutral-950 border border-white/5 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
                <span className="text-xs font-bold text-neutral-300">Lossless</span>
                <div
                  className={`rounded-full transition-colors relative flex-shrink-0 ${lossless ? 'bg-blue-600' : 'bg-neutral-700'}`}
                  style={{ height: '18px', width: '34px' }}
                  onClick={() => setLossless(v => !v)}
                >
                  <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${lossless ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </label>
            </div>
          )}

          {/* Delete original */}
          <label className="flex items-center justify-between py-2.5 px-3 bg-neutral-950 border border-white/5 rounded-xl cursor-pointer hover:bg-neutral-900 transition-colors">
            <div className="flex items-center gap-2">
              <Trash2 className={`w-3.5 h-3.5 flex-shrink-0 ${deleteOriginal ? 'text-red-400' : 'text-neutral-500'}`} />
              <div>
                <span className="text-xs font-bold text-neutral-300">Delete Original After Convert</span>
                <p className="text-[10px] text-neutral-600 mt-0.5">Permanent — cannot be undone</p>
              </div>
            </div>
            <div
              className={`rounded-full transition-colors relative flex-shrink-0 ${deleteOriginal ? 'bg-red-600' : 'bg-neutral-700'}`}
              style={{ height: '18px', width: '34px' }}
              onClick={() => setDeleteOriginal(v => !v)}
            >
              <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${deleteOriginal ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </div>
          </label>

          {/* Result */}
          {result && !running && (
            <div className={`p-3 rounded-xl border space-y-1.5 ${
              result.errors.length > 0 ? 'bg-yellow-600/10 border-yellow-500/20' : 'bg-green-600/10 border-green-500/20'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                <span className="text-[10px] font-black uppercase tracking-widest text-green-300">
                  {result.converted.length} converted · {result.skipped.length} skipped · {result.errors.length} errors
                </span>
              </div>
              {result.converted.slice(0, 5).map(f => (
                <div key={f} className="text-[10px] text-neutral-400 pl-5 truncate">
                  {f.split(/[\\/]/).pop()}
                </div>
              ))}
              {result.converted.length > 5 && (
                <div className="text-[10px] text-neutral-600 pl-5">
                  +{result.converted.length - 5} more
                </div>
              )}
              {result.errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 pl-5">
                  <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-[9px] text-red-300 break-all">{e}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Run button */}
        <div className="p-6 pt-0 shrink-0">
          <button
            onClick={run}
            disabled={running || files.length === 0}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95 text-white flex items-center justify-center gap-2"
          >
            {running ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Converting...</>
            ) : (
              <><ArrowLeftRight className="w-4 h-4" /> Convert {files.length} File{files.length !== 1 ? 's' : ''}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
