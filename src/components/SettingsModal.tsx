import { X, Keyboard, History, Zap, Smartphone, Link, Plus, Trash2, ShieldAlert } from "lucide-react";
import { Shortcuts, DEFAULT_SHORTCUTS, DEFAULT_NSFW_TAGS, SortMethod, useAppStore } from "../store/useAppStore";
import { api } from "../api";
import { open, confirm } from "@tauri-apps/plugin-dialog";
import { useState, useEffect } from "react";

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
  const { imageCacheSize, setImageCacheSize, mobileServerSettings, setMobileServerSettings } = useAppStore();
  const [localIp, setLocalIp] = useState<string | null>(null);

  // Twitter/X credentials live in the OS keychain, not in the persisted store.
  const [twitterSecrets, setTwitterSecrets] = useState({ apiKey: '', apiSecret: '', accessToken: '', accessSecret: '' });

  useEffect(() => {
    if (show && mobileServerSettings.enabled) {
      api.getLocalIp().then(ip => setLocalIp(ip)).catch(() => setLocalIp(null));
    }
  }, [show, mobileServerSettings.enabled]);

  useEffect(() => {
    if (show) {
      api.loadTwitterSecrets()
        .then(s => setTwitterSecrets(s))
        .catch(() => {});
    }
  }, [show]);

  if (!show) return null;

  const mobileUrl = `http://${localIp || 'loading...'}:${mobileServerSettings.port}`;

  const handleAddAuthorizedFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected && typeof selected === 'string') {
        const currentFolders = mobileServerSettings.authorizedFolders || [];
        if (!currentFolders.includes(selected)) {
            setMobileServerSettings({
                ...mobileServerSettings,
                authorizedFolders: [...currentFolders, selected]
            });
            showToast(`Indexing folder in background: ${selected}`, "info");
            api.scanDirectory(selected, "NameAsc", true)
                .then(() => showToast(`Successfully indexed authorized folder: ${selected}`, "success"))
                .catch(e => showToast(`Failed to index folder: ${e}`, "error"));
        }
    }
  };

  const handleRemoveAuthorizedFolder = (path: string) => {
    const currentFolders = mobileServerSettings.authorizedFolders || [];
    setMobileServerSettings({
        ...mobileServerSettings,
        authorizedFolders: currentFolders.filter(f => f !== path)
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in duration-300">
      <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3 font-black uppercase tracking-widest text-sm text-white text-left">
            <Keyboard className="w-5 h-5 text-blue-500" /> Settings
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin">
          <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2"><Zap className="w-3 h-3" /> Performance</h4>
            <div className="flex items-center justify-between group">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300 group-hover:text-white block">Image Cache Range</span>
                <p className="text-[8px] text-neutral-500 italic leading-relaxed uppercase">Number of images to pre-cache forward/backward.</p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="range" min="1" max="20" step="1"
                  value={imageCacheSize} 
                  onChange={e => setImageCacheSize(parseInt(e.target.value))}
                  className="w-24 accent-blue-500 h-1 bg-neutral-950 rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[11px] font-mono text-blue-400 w-4 text-center">{imageCacheSize}</span>
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 flex items-center gap-2"><ShieldAlert className="w-3 h-3" /> Content Filter (NSFW)</h4>
            <p className="text-[8px] text-neutral-500 italic leading-relaxed uppercase">
              Keywords used by the viewer's "Move NSFW" action and the mobile SFW mode. Matched as whole words (plurals included) against each image's positive prompt and filename.
            </p>
            <textarea
              value={(mobileServerSettings.nsfwTags || []).join(', ')}
              onChange={e => setMobileServerSettings({
                ...mobileServerSettings,
                nsfwTags: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
              })}
              className="w-full h-24 bg-neutral-950 border border-white/5 rounded-xl p-3 text-[11px] font-mono focus:outline-none focus:border-red-500/50 resize-none scrollbar-thin"
              placeholder="sex, nipple, penis, pussy, ..."
            />
            <button
              onClick={() => setMobileServerSettings({ ...mobileServerSettings, nsfwTags: DEFAULT_NSFW_TAGS })}
              className="text-[8px] font-black uppercase text-neutral-500 hover:text-neutral-300 underline underline-offset-4"
            >
              Reset to default list
            </button>
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500 flex items-center gap-2"><Smartphone className="w-3 h-3" /> Mobile Connectivity</h4>
            <div className="flex items-center justify-between group">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-300 group-hover:text-white block">Enable Server</span>
                <p className="text-[8px] text-neutral-500 italic leading-relaxed uppercase">Start mobile web interface server.</p>
              </div>
              <input 
                type="checkbox" 
                checked={mobileServerSettings.enabled} 
                onChange={e => setMobileServerSettings({...mobileServerSettings, enabled: e.target.checked})}
                className="w-4 h-4 accent-blue-600 cursor-pointer"
              />
            </div>
            <div className="flex items-center justify-between group">
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Server Port</span>
              <input 
                type="number" 
                value={mobileServerSettings.port} 
                onChange={e => setMobileServerSettings({...mobileServerSettings, port: parseInt(e.target.value) || 4882})}
                className="bg-neutral-950 border border-white/5 rounded-xl px-4 py-2 text-center text-[11px] font-mono text-blue-400 w-24 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all" 
              />
            </div>
            <label className="flex items-center justify-between group cursor-pointer">
              <div className="space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 group-hover:text-neutral-300">Restrict to this PC</span>
                <p className="text-[8px] text-neutral-500 italic leading-relaxed uppercase">Only allow access from this computer (Localhost).</p>
              </div>
              <input 
                type="checkbox" 
                checked={mobileServerSettings.localOnly} 
                onChange={e => setMobileServerSettings({...mobileServerSettings, localOnly: e.target.checked})}
                className="w-4 h-4 accent-blue-600"
              />
            </label>

            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Authorized Folders</span>
                    <button 
                        onClick={handleAddAuthorizedFolder}
                        className="p-1.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-lg transition-all"
                    >
                        <Plus className="w-3 h-3" />
                    </button>
                </div>
                <div className="space-y-1.5">
                    {(mobileServerSettings.authorizedFolders || []).map(folder => (
                        <div key={folder} className="flex items-center justify-between gap-2 p-2 bg-black/20 border border-white/5 rounded-xl group">
                            <span className="text-[9px] text-neutral-400 truncate flex-1">{folder}</span>
                            <button 
                                onClick={() => handleRemoveAuthorizedFolder(folder)}
                                className="p-1 text-neutral-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                            >
                                <Trash2 className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                    {(!mobileServerSettings.authorizedFolders || mobileServerSettings.authorizedFolders.length === 0) && (
                        <p className="text-[8px] text-neutral-600 italic">No permanent folders added.</p>
                    )}
                </div>
            </div>

            {mobileServerSettings.enabled && (
              <div className="mt-4 p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl space-y-2 animate-in slide-in-from-top-2 duration-300">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-400">
                        <Link className="w-3 h-3" />
                        <span className="text-[10px] font-black uppercase tracking-widest">Access URL</span>
                    </div>
                    <button 
                        onClick={() => {
                            const { recentFolders } = useAppStore.getState();
                            api.updateMobileServer(
                                { ...mobileServerSettings, authorizedFolders: mobileServerSettings.authorizedFolders || [] },
                                recentFolders
                            ).then(() => showToast("Manual sync success", "success"))
                              .catch(e => showToast(`Sync failed: ${e}`, "error"));
                        }}
                        className="text-[8px] font-black uppercase text-blue-500 hover:text-blue-400 underline underline-offset-4"
                    >
                        Force Sync
                    </button>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <code className="text-[11px] font-mono text-white bg-black/40 px-3 py-1.5 rounded-lg flex-1 truncate select-all">
                    {mobileServerSettings.localOnly ? `http://localhost:${mobileServerSettings.port}` : mobileUrl}
                  </code>
                </div>
                <p className="text-[8px] text-neutral-500 italic uppercase">
                  {mobileServerSettings.localOnly ? "Accessible only on this PC." : "Open this address on your mobile device browser."}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-4 pt-6 border-t border-white/5">
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
                Keys are stored securely in your OS keychain (Windows Credential Manager), not in plain text.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Key</label>
                <input type="password" autoComplete="off" value={twitterSecrets.apiKey} onChange={e => setTwitterSecrets({...twitterSecrets, apiKey: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">API Secret</label>
                <input type="password" autoComplete="off" value={twitterSecrets.apiSecret} onChange={e => setTwitterSecrets({...twitterSecrets, apiSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Token</label>
                <input type="password" autoComplete="off" value={twitterSecrets.accessToken} onChange={e => setTwitterSecrets({...twitterSecrets, accessToken: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
              <div className="space-y-2">
                <label className="text-[8px] font-black uppercase text-neutral-600 block tracking-widest">Access Secret</label>
                <input type="password" autoComplete="off" value={twitterSecrets.accessSecret} onChange={e => setTwitterSecrets({...twitterSecrets, accessSecret: e.target.value})} className="w-full bg-neutral-950 border border-white/5 rounded-xl px-3 py-2 text-[10px] focus:outline-none focus:border-blue-500/50" />
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await api.saveTwitterSecrets(twitterSecrets);
                  const cleared = !twitterSecrets.apiKey && !twitterSecrets.apiSecret && !twitterSecrets.accessToken && !twitterSecrets.accessSecret;
                  showToast(cleared ? "API keys cleared from secure storage" : "API keys saved to secure storage", "success");
                } catch (e: any) {
                  showToast(`Failed to save keys: ${e}`, "error");
                }
              }}
              className="w-full py-2.5 bg-blue-950/10 hover:bg-blue-600 border border-blue-500/20 hover:border-blue-500 rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-white transition-all"
            >
              Save Keys to Secure Storage
            </button>
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
                If search results are incorrect or performance is lagging, you can sync/index your Authorized Folders or reset the entire indexing database.
            </p>

            <button 
                onClick={async () => {
                    const folders = mobileServerSettings.authorizedFolders || [];
                    if (folders.length === 0) {
                        showToast("No authorized folders configured.", "info");
                        return;
                    }
                    showToast("Indexing all authorized folders in background...", "info");
                    for (const folder of folders) {
                        api.scanDirectory(folder, "NameAsc", true)
                            .then(() => showToast(`Finished indexing: ${folder}`, "success"))
                            .catch(e => showToast(`Indexing failed for ${folder}: ${e}`, "error"));
                    }
                }}
                className="w-full py-3 bg-blue-950/10 hover:bg-blue-600 border border-blue-500/20 hover:border-blue-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-blue-500 hover:text-white transition-all flex items-center justify-center gap-2 mb-3 shadow-md"
            >
                <History className="w-3.5 h-3.5" /> Index & Sync Authorized Folders
            </button>

            <button 
                onClick={async () => {
                    if (await confirm("Are you sure you want to CLEAR the entire image database? This will trigger full re-indexing of all folders.")) {
                        try {
                            await api.clearDatabase();
                            if (folderPath) {
                                showToast("Database Initialized. Full re-indexing current folder...", "success");
                                const result = await api.scanDirectory(folderPath, sortMethod as SortMethod, recursive, true);
                                setImages(result.images);
                            } else {
                                showToast("Database Initialized.", "success");
                            }
                        } catch (e: any) {
                            showToast(`Failed to clear DB: ${e}`, "error");
                        }
                    }
                }}
                className="w-full py-3 bg-red-950/10 hover:bg-red-600 border border-red-500/20 hover:border-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest text-red-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-md"
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
