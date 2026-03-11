import { X, Keyboard, History } from "lucide-react";
import { Shortcuts, DEFAULT_SHORTCUTS } from "../store/useAppStore";
import { invoke } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";

interface SettingsModalProps {
  show: boolean;
  onClose: () => void;
  shortcuts: Shortcuts;
  setShortcuts: (s: Shortcuts) => void;
  twitterSettings: any;
  setTwitterSettings: (s: any) => void;
  folderPath: string | null;
  sortMethod: string;
  recursive: boolean;
  setImages: (images: any[]) => void;
  showToast: (msg: string, type: "success" | "error" | "info") => void;
}

export const SettingsModal = ({
  show,
  onClose,
  shortcuts,
  setShortcuts,
  twitterSettings,
  setTwitterSettings,
  folderPath,
  sortMethod,
  recursive,
  setImages,
  showToast,
}: SettingsModalProps) => {
  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 font-black uppercase tracking-widest text-sm text-white text-left">
            <Keyboard className="w-5 h-5 text-blue-500" /> Shortcuts
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Keyboard Shortcuts</h4>
            {(Object.keys(shortcuts) as (keyof Shortcuts)[]).map(key => (
              <div key={key} className="flex items-center justify-between group">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">{key}</span>
                <input 
                  value={shortcuts[key]} 
                  onKeyDown={e => { 
                    e.preventDefault(); 
                    const newShortcuts = {...shortcuts, [key]: e.key}; 
                    setShortcuts(newShortcuts); 
                  }} 
                  readOnly 
                  className="bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-center text-[11px] font-mono text-blue-400 w-32 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all cursor-default" 
                />
              </div>
            ))}
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500">Twitter (X) Integration</h4>
            <p className="text-[9px] text-neutral-500 italic mb-4 leading-relaxed">
                Leave API keys empty to use the **Clipboard + Browser** method. 
                Fill them in for **Standard API Direct Upload**.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Key</label>
                <input type="password" value={twitterSettings.apiKey} onChange={e => setTwitterSettings({...twitterSettings, apiKey: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Secret</label>
                <input type="password" value={twitterSettings.apiSecret} onChange={e => setTwitterSettings({...twitterSettings, apiSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Token</label>
                <input type="password" value={twitterSettings.accessToken} onChange={e => setTwitterSettings({...twitterSettings, accessToken: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Secret</label>
                <input type="password" value={twitterSettings.accessSecret} onChange={e => setTwitterSettings({...twitterSettings, accessSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <div className="space-y-3 pt-2">
              <label className="text-[9px] font-bold uppercase text-neutral-500">Post Template</label>
              <textarea 
                value={twitterSettings.template} 
                onChange={e => setTwitterSettings({...twitterSettings, template: e.target.value})}
                className="w-full h-24 bg-neutral-950 border border-white/5 rounded-xl p-3 text-[11px] focus:outline-none focus:border-blue-500/50 resize-none scrollbar-thin"
                placeholder="{phrases} #AIart"
              />
              <p className="text-[8px] text-neutral-600 italic">Use {"{phrases}"} to insert picked tags.</p>
            </div>
            <div className="space-y-3">
              <label className="text-[9px] font-bold uppercase text-neutral-500">Phrases to Pick (Comma separated)</label>
              <input 
                type="text"
                value={twitterSettings.phrasesToPick.join(', ')} 
                onChange={e => setTwitterSettings({...twitterSettings, phrasesToPick: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                className="w-full bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-[11px] focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <label className="flex items-center justify-between group cursor-pointer">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">Auto-copy Image</span>
              <input 
                type="checkbox" 
                checked={twitterSettings.autoCopyImage} 
                onChange={e => setTwitterSettings({...twitterSettings, autoCopyImage: e.target.checked})}
                className="w-4 h-4 accent-blue-600"
              />
            </label>
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Database Management</h4>
            <p className="text-[9px] text-neutral-500 italic leading-relaxed">
                If search results are incorrect or performance is lagging, you can reset the indexing database. 
                This will force a full re-scan of folders you visit.
            </p>
            <button 
                onClick={async () => {
                    if (await confirm("Are you sure you want to CLEAR the entire image database? This will trigger full re-indexing of all folders.")) {
                        try {
                            await invoke("clear_database");
                            if (folderPath) {
                                showToast("Database Initialized. Full re-indexing current folder...", "success");
                                const result = await invoke("scan_directory", { 
                                    path: folderPath, 
                                    sortMethod, 
                                    recursive,
                                    forceReindex: true 
                                }) as any;
                                setImages(result.images);
                            } else {
                                showToast("Database Initialized.", "success");
                            }
                        } catch (e: any) {
                            showToast(`Failed to clear DB: ${e}`, "error");
                        }
                    }
                }}
                className="w-full py-3 bg-red-950/10 hover:bg-red-600 border border-red-500/20 hover:border-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
            >
                <History className="w-3.5 h-3.5" /> Initialize & Rebuild Database
            </button>
          </div>

          <button onClick={() => { setShortcuts(DEFAULT_SHORTCUTS); showToast('Shortcuts Reset', 'info'); }} className="w-full py-3 bg-white/5 hover:bg-neutral-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-neutral-500 hover:text-neutral-300 transition-all">Reset Shortcuts to Default</button>
        </div>
      </div>
    </div>
  );
};
