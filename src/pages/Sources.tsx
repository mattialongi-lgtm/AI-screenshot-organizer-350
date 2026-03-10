import React, { useState, useEffect } from 'react';
import { 
  Cloud, 
  RefreshCw, 
  Settings2, 
  Trash2, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  FolderOpen,
  Monitor,
  ArrowLeft,
  Copy,
  Check
} from 'lucide-react';
import { motion } from 'motion/react';
import { CloudSource, SourceSettings } from '../types';
import { getAllSources, saveSource, deleteSource } from '../lib/db';

interface SourcesPageProps {
  onBack: () => void;
}

export const SourcesPage: React.FC<SourcesPageProps> = ({ onBack }) => {
  const [sources, setSources] = useState<CloudSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sources');
      const cloudSources = await res.json();
      
      // Merge with local sources if any (though we primarily use server for sources now)
      setSources(cloudSources);
    } catch (err) {
      console.error("Failed to load sources:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogle = () => {
    fetch('/api/auth/google/url')
      .then(res => res.json())
      .then(data => {
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        const popup = window.open(
          data.url,
          'google_auth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        window.addEventListener('message', (event) => {
          if (event.data.type === 'AUTH_SUCCESS') {
            loadSources();
          }
        }, { once: true });
      });
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this source?')) return;
    try {
      await fetch(`/api/sources/${id}/disconnect`, { method: 'POST' });
      loadSources();
    } catch (err) {
      console.error("Disconnect failed:", err);
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(`Sync complete! Imported ${data.syncedCount} new screenshots.`);
        loadSources();
      }
    } catch (err) {
      console.error("Sync failed:", err);
    } finally {
      setSyncing(null);
    }
  };

  const copyAgentCommand = () => {
    const cmd = 'npm run agent -- "/path/to/your/icloud/screenshots"';
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex items-center justify-between border-b border-white/5 pb-12">
        <div className="flex items-center gap-8">
          <button 
            onClick={onBack}
            className="w-12 h-12 border border-white/10 flex items-center justify-center hover:bg-bone hover:text-ink transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-2">
            <h2 className="text-5xl font-serif italic">Sources</h2>
            <p className="mono-label text-[10px] opacity-50">Archive Ingestion Nodes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Google Drive Card */}
        <SourceCard 
          title="Google Drive"
          description="Establish a neural link with your Google Drive repository for automated specimen ingestion."
          icon={<Cloud className="w-6 h-6 text-accent" />}
          source={sources.find(s => s.provider === 'googleDrive')}
          onConnect={handleConnectGoogle}
          onDisconnect={(id) => handleDisconnect(id)}
          onSync={(id) => handleSync(id)}
          isSyncing={syncing === 'googleDrive'}
        />

        {/* iCloud Folder Card */}
        <div className="editorial-card p-10 space-y-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 border border-white/10 flex items-center justify-center rotate-45">
                <FolderOpen className="w-6 h-6 text-bone -rotate-45" />
              </div>
              <div>
                <h3 className="text-2xl font-serif italic leading-none">iCloud Node</h3>
                <p className="mono-label mt-2 text-[9px]">Local Sync Agent</p>
              </div>
            </div>
            <div className="mono-label text-[8px] border border-accent/30 text-accent px-3 py-1">
              Active
            </div>
          </div>

          <div className="space-y-8">
            <div className="p-6 bg-white/[0.02] border border-white/5 space-y-4">
              <h4 className="mono-label text-[9px]">Protocol</h4>
              <ol className="mono-label text-[9px] space-y-3 opacity-60">
                <li className="flex gap-4"><span>01</span> Locate local iCloud screenshot repository.</li>
                <li className="flex gap-4"><span>02</span> Initialize local ingestion agent.</li>
                <li className="flex gap-4"><span>03</span> Automated specimen push enabled.</li>
              </ol>
            </div>

            <div className="space-y-3">
              <label className="mono-label text-[9px]">Agent Command</label>
              <div className="flex items-center gap-4 p-4 bg-ink border border-white/10 font-mono text-[11px] text-bone overflow-hidden group">
                <span className="truncate opacity-70 group-hover:opacity-100 transition-opacity">npm run agent -- "/path/to/icloud"</span>
                <button 
                  onClick={copyAgentCommand}
                  className="shrink-0 text-muted hover:text-accent transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
              <span className="mono-label text-[9px]">Monitoring Stream...</span>
            </div>
            <button className="mono-label text-[9px] text-accent hover:text-bone transition-colors">
              Diagnostics
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostics / Help */}
      <div className="border border-white/5 bg-white/[0.01] p-12 space-y-10">
        <div className="flex items-center gap-4">
          <AlertCircle className="w-6 h-6 text-accent" />
          <h3 className="text-3xl font-serif italic">Troubleshooting</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <h4 className="mono-label text-bone">Sync Latency</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">Ensure Google Drive permissions include "View and download all files" for full archive access.</p>
          </div>
          <div className="space-y-4">
            <h4 className="mono-label text-bone">Agent Connection</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">Verify terminal persistence and folder access permissions for the local ingestion agent.</p>
          </div>
          <div className="space-y-4">
            <h4 className="mono-label text-bone">Data Integrity</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">Archive uses cryptographic hashing for duplicate detection. Modified specimens will be re-ingested.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SourceCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  source?: any;
  onConnect: () => void;
  onDisconnect: (id: string) => void;
  onSync: (id: string) => void;
  isSyncing: boolean;
}

const SourceCard: React.FC<SourceCardProps> = ({ 
  title, 
  description, 
  icon, 
  source, 
  onConnect, 
  onDisconnect,
  onSync,
  isSyncing
}) => {
  return (
    <div className="editorial-card p-10 flex flex-col justify-between">
      <div className="space-y-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 border border-white/10 flex items-center justify-center rotate-45">
              <div className="-rotate-45">{icon}</div>
            </div>
            <div>
              <h3 className="text-2xl font-serif italic leading-none">{title}</h3>
              <p className="mono-label mt-2 text-[9px] opacity-50">{source ? source.email : 'Node Offline'}</p>
            </div>
          </div>
          {source ? (
            <div className="mono-label text-[8px] border border-accent/30 text-accent px-3 py-1">
              Linked
            </div>
          ) : (
            <div className="mono-label text-[8px] border border-white/10 text-muted px-3 py-1">
              Void
            </div>
          )}
        </div>

        <p className="mono-label text-[10px] leading-relaxed opacity-60">
          {description}
        </p>

        {source && (
          <div className="grid grid-cols-2 gap-8 p-6 bg-white/[0.02] border border-white/5">
            <div className="space-y-2">
              <p className="mono-label text-[8px] opacity-40">Last Ingestion</p>
              <p className="mono-label text-[9px] text-bone">
                {source.last_sync ? new Date(source.last_sync).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="mono-label text-[8px] opacity-40">Node Status</p>
              <p className="mono-label text-[9px] text-accent">Operational</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center gap-4">
        {source ? (
          <>
            <button 
              onClick={() => onSync(source.id)}
              disabled={isSyncing}
              className="accent-button flex-1 flex items-center justify-center gap-3 disabled:opacity-30"
            >
              <RefreshCw className={cn("w-4 h-4", isSyncing && "animate-spin")} />
              {isSyncing ? 'Ingesting...' : 'Ingest Now'}
            </button>
            <button 
              onClick={() => onDisconnect(source.id)}
              className="w-12 h-12 border border-accent/40 flex items-center justify-center text-accent hover:bg-accent hover:text-ink transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </>
        ) : (
          <button 
            onClick={onConnect}
            className="accent-button w-full flex items-center justify-center gap-3"
          >
            <Plus className="w-5 h-5" />
            Initialize Link
          </button>
        )}
      </div>
    </div>
  );
};

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ');
}
