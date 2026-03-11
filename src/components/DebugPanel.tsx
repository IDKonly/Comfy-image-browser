import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bug, X, RefreshCw, Database } from "lucide-react";

export const DebugPanel = ({ folderPath, onClose }: { folderPath: string | null, onClose: () => void }) => {
  const [status, setStatus] = useState<any>(null);
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    if (!folderPath) return;
    setLoading(true);
    try {
      const res = await invoke("get_db_status", { folder: folderPath });
      setStatus(res);
      const logRes = await invoke("get_logs") as string;
      setLogs(logRes);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const clearDB = async () => {
    if (confirm("Are you sure you want to CLEAR the entire image database? This cannot be undone and will trigger full re-indexing of all folders.")) {
      setLoading(true);
      try {
        await invoke("clear_database");
        await refreshStatus();
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    refreshStatus();
    // Auto-refresh logs every 2 seconds when open
    const interval = setInterval(async () => {
      try {
        const logRes = await invoke("get_logs") as string;
        setLogs(logRes);
      } catch (e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [folderPath]);

  return (
    <div className="fixed bottom-12 left-4 z-[100] w-[450px] bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-neutral-950/50">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-500">
          <Bug className="w-3.5 h-3.5" /> Backend Debugger
        </div>
        <div className="flex gap-1">
            <button onClick={refreshStatus} className={`p-1.5 hover:bg-white/5 rounded-lg transition-all ${loading ? 'animate-spin' : ''}`}>
                <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg transition-all">
                <X className="w-3.5 h-3.5" />
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="p-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
          <div className="space-y-1">
              <label className="text-[8px] font-black uppercase text-neutral-500">Active Folder (Frontend)</label>
              <div className="bg-neutral-950 p-2 rounded-lg text-[9px] font-mono break-all text-neutral-400 border border-white/5">
                  {folderPath || "None"}
              </div>
          </div>

          {status ? (
              <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                      <div className="bg-neutral-950 p-3 rounded-xl border border-white/5">
                          <div className="text-[8px] font-black uppercase text-neutral-600 mb-1">Total Indexed</div>
                          <div className="text-sm font-black text-blue-400">{status.total_images}</div>
                      </div>
                      <div className="bg-neutral-950 p-3 rounded-xl border border-white/5">
                          <div className="text-[8px] font-black uppercase text-neutral-600 mb-1">In Current Folder</div>
                          <div className="text-sm font-black text-green-400">{status.folder_images}</div>
                      </div>
                  </div>

                  <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-neutral-500">Backend Logs (Recent 100 lines)</label>
                      <div className="bg-neutral-950 p-3 rounded-lg text-[8px] font-mono whitespace-pre-wrap h-48 overflow-y-auto scrollbar-thin text-neutral-500 border border-white/5 leading-tight">
                          {logs || "Waiting for logs..."}
                      </div>
                  </div>

                  <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-neutral-500">DB File Path</label>
                      <div className="bg-neutral-950 p-2 rounded-lg text-[9px] font-mono break-all text-neutral-400 border border-white/5">
                          {status.db_path}
                      </div>
                  </div>

                  <div className="space-y-1">
                      <label className="text-[8px] font-black uppercase text-neutral-500">Sample Paths in DB</label>
                      <div className="space-y-1">
                          {status.samples.map((s: string, i: number) => (
                              <div key={i} className="bg-neutral-950 p-2 rounded-lg text-[8px] font-mono break-all text-neutral-500 border border-white/5">
                                  {s}
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-20">
                  <Database className="w-8 h-8 mb-2" />
                  <p className="text-[9px] font-black uppercase">No Status Data</p>
              </div>
          )}
        </div>
        
        <div className="p-4 border-t border-white/5 space-y-3 bg-neutral-950/20">
          <button 
              onClick={clearDB}
              disabled={loading}
              className="w-full py-2.5 bg-red-900/10 hover:bg-red-600 border border-red-500/20 hover:border-red-500 rounded-xl text-[10px] font-black uppercase text-red-500 hover:text-white transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
              <Database className="w-3.5 h-3.5" /> Initialize Database
          </button>
        </div>
      </div>
    </div>
  );
};
