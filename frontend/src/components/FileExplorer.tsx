/**
 * FileExplorer — Browse and edit files on remote servers via SFTP
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Folder, File, ChevronLeft, Save, X, RefreshCw } from 'lucide-react';

interface FileItem {
  name: string;
  type: 'file' | 'dir';
  size: number;
  modified: string;
}

interface FileExplorerProps {
  serverId: string;
  serverColor: string;
  initialPath?: string;
}

export default function FileExplorer({ serverId, serverColor, initialPath }: FileExplorerProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editor state
  const [editingFile, setEditingFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchFiles = useCallback(async (path: string) => {
    setLoading(true);
    setError('');
    try {
      const params = path ? `?path=${encodeURIComponent(path)}` : '';
      const res = await fetch(`/api/files/${serverId}/list${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setFiles(data.files);
      setCurrentPath(data.path);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchFiles(currentPath);
  }, [serverId]);

  const openDir = (name: string) => {
    fetchFiles(`${currentPath}/${name}`);
  };

  const goUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    fetchFiles(parent);
  };

  const openFile = async (name: string) => {
    const filePath = `${currentPath}/${name}`;
    try {
      const res = await fetch(`/api/files/${serverId}/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEditingFile(filePath);
      setFileContent(data.content);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveFile = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/files/${serverId}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: editingFile, content: fileContent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  };

  // ── File Editor ──
  if (editingFile) {
    const fileName = editingFile.split('/').pop();
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-white/5">
          <button onClick={() => setEditingFile(null)} className="text-white/40 hover:text-white">
            <X className="w-4 h-4" />
          </button>
          <File className="w-4 h-4" style={{ color: serverColor }} />
          <span className="text-xs font-mono text-white/60 truncate flex-1">{editingFile}</span>
          {dirty && (
            <button
              onClick={saveFile}
              disabled={saving}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border transition-colors"
              style={{ borderColor: serverColor, color: serverColor }}
            >
              <Save className="w-3 h-3" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
        <textarea
          value={fileContent}
          onChange={(e) => { setFileContent(e.target.value); setDirty(true); }}
          className="flex-1 bg-[#0a0a0f] text-white/90 font-mono text-xs p-4 resize-none outline-none"
          style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}
          spellCheck={false}
        />
      </div>
    );
  }

  // ── File List ──
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-3 border-b border-white/10 bg-white/5">
        <button onClick={goUp} className="text-white/40 hover:text-white" title="Parent directory">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono text-white/50 truncate flex-1">{currentPath}</span>
        <button onClick={() => fetchFiles(currentPath)} className="text-white/40 hover:text-white">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-red-400 font-mono bg-red-500/10">{error}</div>
      )}

      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
        {loading ? (
          <div className="p-4 text-xs text-white/30 font-mono text-center">Loading...</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-xs text-white/30 font-mono text-center">Empty directory</div>
        ) : (
          files.map((f) => (
            <button
              key={f.name}
              onClick={() => f.type === 'dir' ? openDir(f.name) : openFile(f.name)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/5 transition-colors text-left border-b border-white/5"
            >
              {f.type === 'dir'
                ? <Folder className="w-4 h-4 flex-shrink-0" style={{ color: serverColor }} />
                : <File className="w-4 h-4 flex-shrink-0 text-white/30" />
              }
              <span className="text-xs font-mono text-white/80 truncate flex-1">{f.name}</span>
              <span className="text-[10px] font-mono text-white/30">{f.type === 'file' ? formatSize(f.size) : ''}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
