import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Cloud,
  Copy,
  FolderOpen,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { CloudSource, SourceSettings } from '../types';
import { authenticatedFetch } from '../lib/supabase';
import { getApiBaseUrl, getApiOrigin } from '../lib/api';

interface SourcesPageProps {
  onBack: () => void;
}

const defaultSourceSettings: SourceSettings = {
  keywords: ['screenshot', 'screen shot', 'screenshots', 'IMG_'],
  dateRangeDays: 30,
  maxFiles: 200,
  autoSyncEnabled: false,
  intervalMinutes: 15,
};

const parseJsonResponse = async (res: Response) => {
  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || `HTTP ${res.status}` };
  }
};

const normalizeSource = (source: any): CloudSource => ({
  id: String(source.id),
  provider: source.provider === 'googleDrive' ? 'googleDrive' : 'icloudFolder',
  status: source.status === 'error' ? 'error' : source.status === 'connected' ? 'connected' : 'disconnected',
  connectedAt:
    typeof source.connectedAt === 'number'
      ? source.connectedAt
      : source.connected_at
        ? new Date(source.connected_at).getTime()
        : undefined,
  lastSyncAt:
    typeof source.lastSyncAt === 'number'
      ? source.lastSyncAt
      : source.last_sync
        ? new Date(source.last_sync).getTime()
        : undefined,
  accountEmail: source.accountEmail || source.email || undefined,
  localPath: source.localPath || source.local_path || undefined,
  agentStatus: source.agentStatus === 'online' ? 'online' : source.agentStatus === 'offline' ? 'offline' : undefined,
  settings: source.settings || defaultSourceSettings,
});

export const SourcesPage: React.FC<SourcesPageProps> = ({ onBack }) => {
  const [sources, setSources] = useState<CloudSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyingCommand, setCopyingCommand] = useState(false);
  const [agentTokenExpiry, setAgentTokenExpiry] = useState<number | null>(null);

  useEffect(() => {
    void loadSources();
    const refreshTimer = window.setInterval(() => {
      void loadSources(false);
    }, 15000);

    return () => window.clearInterval(refreshTimer);
  }, []);

  const googleSource = useMemo(
    () => sources.find((source) => source.provider === 'googleDrive'),
    [sources]
  );
  const iCloudSource = useMemo(
    () => sources.find((source) => source.provider === 'icloudFolder'),
    [sources]
  );

  const loadSources = async (showSpinner = true) => {
    if (showSpinner) {
      setLoading(true);
    }

    try {
      const res = await authenticatedFetch('/api/sources');
      const payload = await parseJsonResponse(res);

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load sources.');
      }

      setSources(Array.isArray(payload) ? payload.map(normalizeSource) : []);
    } catch (err) {
      console.error('Failed to load sources:', err);
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  const handleConnectGoogle = () => {
    authenticatedFetch('/api/auth/google/url')
      .then(async (res) => {
        const payload = await parseJsonResponse(res);
        if (!res.ok || !payload.url) {
          throw new Error(payload.error || 'Failed to create Google Drive authorization URL.');
        }

        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          payload.url,
          'google_auth',
          `width=${width},height=${height},left=${left},top=${top}`
        );

        if (!popup) {
          throw new Error('Google auth popup was blocked by the browser.');
        }

        const handleMessage = (event: MessageEvent) => {
          if (event.origin !== getApiOrigin()) {
            return;
          }

          if (event.data.type === 'AUTH_SUCCESS') {
            window.removeEventListener('message', handleMessage);
            void loadSources();
          } else if (event.data.type === 'AUTH_ERROR') {
            window.removeEventListener('message', handleMessage);
            alert(event.data.message || 'Google Drive connection failed.');
          }
        };

        window.addEventListener('message', handleMessage);
      })
      .catch((error) => {
        console.error('Google connection failed:', error);
        alert(error.message || 'Google Drive connection failed.');
      });
  };

  const handleDisconnect = async (id: string) => {
    if (!confirm('Are you sure you want to disconnect this source?')) return;

    try {
      const res = await authenticatedFetch(`/api/sources/${id}/disconnect`, { method: 'POST' });
      const payload = await parseJsonResponse(res);

      if (!res.ok) {
        throw new Error(payload.error || 'Failed to disconnect source.');
      }

      await loadSources();
    } catch (err: any) {
      console.error('Disconnect failed:', err);
      alert(err.message || 'Disconnect failed.');
    }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);

    try {
      const res = await authenticatedFetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: id }),
      });
      const payload = await parseJsonResponse(res);

      if (!res.ok || payload.success === false) {
        const firstError = Array.isArray(payload.results)
          ? payload.results.find((result: any) => result.error)?.error
          : null;
        throw new Error(firstError || payload.error || 'Google Drive sync failed.');
      }

      const resultSummary = Array.isArray(payload.results) ? payload.results[0] : null;
      const syncMessage = [
        `Imported ${payload.syncedCount || 0} new screenshot(s).`,
        resultSummary?.skipped ? `Skipped ${resultSummary.skipped}.` : null,
        resultSummary?.errors ? `Errors ${resultSummary.errors}.` : null,
      ]
        .filter(Boolean)
        .join(' ');

      alert(syncMessage || 'Sync complete.');
      await loadSources(false);
    } catch (err: any) {
      console.error('Sync failed:', err);
      alert(err.message || 'Google Drive sync failed.');
    } finally {
      setSyncing(null);
    }
  };

  const copyAgentCommand = async () => {
    setCopyingCommand(true);

    try {
      const res = await authenticatedFetch('/api/icloud/agent-token', { method: 'POST' });
      const payload = await parseJsonResponse(res);

      if (!res.ok || !payload.token) {
        throw new Error(payload.error || 'Failed to create the iCloud agent token.');
      }

      const command = [
        `$env:AUTH_TOKEN="${payload.token}"`,
        `$env:API_URL="${getApiBaseUrl()}"`,
        'npm run agent -- "/path/to/your/icloud/screenshots"',
      ].join('; ');

      await navigator.clipboard.writeText(command);
      setAgentTokenExpiry(typeof payload.expiresAt === 'number' ? payload.expiresAt : null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      await loadSources(false);
    } catch (err: any) {
      console.error('Failed to copy iCloud agent command:', err);
      alert(err.message || 'Failed to prepare the iCloud agent command.');
    } finally {
      setCopyingCommand(false);
    }
  };

  const commandPreview = [
    '$env:AUTH_TOKEN="..."',
    `$env:API_URL="${getApiBaseUrl()}"`,
    'npm run agent -- "/path/to/your/icloud/screenshots"',
  ].join('; ');

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
        {loading && <Loader2 className="w-5 h-5 text-accent animate-spin" />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <SourceCard
          title="Google Drive"
          description="Connect your Google Drive and ingest screenshot files directly from the archive."
          icon={<Cloud className="w-6 h-6 text-accent" />}
          source={googleSource}
          onConnect={handleConnectGoogle}
          onDisconnect={(id) => void handleDisconnect(id)}
          onSync={(id) => void handleSync(id)}
          isSyncing={syncing === googleSource?.id}
        />

        <div className="editorial-card p-10 space-y-10">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-6">
              <div className="w-14 h-14 border border-white/10 flex items-center justify-center rotate-45">
                <FolderOpen className="w-6 h-6 text-bone -rotate-45" />
              </div>
              <div>
                <h3 className="text-2xl font-serif italic leading-none">iCloud Node</h3>
                <p className="mono-label mt-2 text-[9px]">
                  {iCloudSource?.agentStatus === 'online'
                    ? 'Local agent online'
                    : iCloudSource
                      ? 'Awaiting local agent'
                      : 'Not configured yet'}
                </p>
              </div>
            </div>
            <div
              className={`mono-label text-[8px] px-3 py-1 border ${
                iCloudSource?.agentStatus === 'online'
                  ? 'border-accent/30 text-accent'
                  : iCloudSource
                    ? 'border-white/10 text-bone'
                    : 'border-white/10 text-muted'
              }`}
            >
              {iCloudSource?.agentStatus === 'online'
                ? 'Online'
                : iCloudSource
                  ? 'Ready'
                  : 'Setup'}
            </div>
          </div>

          <div className="space-y-8">
            <div className="p-6 bg-white/[0.02] border border-white/5 space-y-4">
              <h4 className="mono-label text-[9px]">Protocol</h4>
              <ol className="mono-label text-[9px] space-y-3 opacity-60">
                <li className="flex gap-4"><span>01</span> Generate the local agent command below.</li>
                <li className="flex gap-4"><span>02</span> Run it in PowerShell on the machine that syncs iCloud Drive.</li>
                <li className="flex gap-4"><span>03</span> Existing screenshots are imported immediately, then new ones stream in automatically.</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 bg-white/[0.02] border border-white/5 space-y-2">
                <p className="mono-label text-[8px] opacity-40">Local Path</p>
                <p className="mono-label text-[9px] text-bone break-all">
                  {iCloudSource?.localPath || 'Set when the agent comes online.'}
                </p>
              </div>
              <div className="p-6 bg-white/[0.02] border border-white/5 space-y-2">
                <p className="mono-label text-[8px] opacity-40">Last Import</p>
                <p className="mono-label text-[9px] text-bone">
                  {iCloudSource?.lastSyncAt ? new Date(iCloudSource.lastSyncAt).toLocaleString() : 'Not yet imported'}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="mono-label text-[9px]">Agent Command</label>
              <div className="flex items-center gap-4 p-4 bg-ink border border-white/10 font-mono text-[11px] text-bone overflow-hidden group">
                <span className="truncate opacity-70 group-hover:opacity-100 transition-opacity">
                  {commandPreview}
                </span>
                <button
                  onClick={() => void copyAgentCommand()}
                  disabled={copyingCommand}
                  className="shrink-0 text-muted hover:text-accent transition-colors disabled:opacity-50"
                >
                  {copyingCommand ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : copied ? (
                    <Check className="w-4 h-4 text-accent" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
              {agentTokenExpiry && (
                <p className="mono-label text-[9px] opacity-50">
                  Latest copied token expires on {new Date(agentTokenExpiry).toLocaleString()}.
                </p>
              )}
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  iCloudSource?.agentStatus === 'online' ? 'bg-accent animate-pulse' : 'bg-white/30'
                }`}
              />
              <span className="mono-label text-[9px]">
                {iCloudSource?.agentStatus === 'online' ? 'Monitoring stream is active.' : 'Waiting for the local agent to connect.'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {iCloudSource && (
                <button
                  onClick={() => void handleDisconnect(iCloudSource.id)}
                  className="w-10 h-10 border border-accent/40 flex items-center justify-center text-accent hover:bg-accent hover:text-ink transition-all"
                  title="Disconnect iCloud source"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => void loadSources(false)}
                className="mono-label text-[9px] text-accent hover:text-bone transition-colors"
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-white/5 bg-white/[0.01] p-12 space-y-10">
        <div className="flex items-center gap-4">
          <AlertCircle className="w-6 h-6 text-accent" />
          <h3 className="text-3xl font-serif italic">Troubleshooting</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          <div className="space-y-4">
            <h4 className="mono-label text-bone">Google Drive</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">
              Sync now reports real backend errors instead of silently looking successful with zero imports.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="mono-label text-bone">iCloud Agent</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">
              The copied command now includes a dedicated agent token and imports existing files on first launch.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="mono-label text-bone">Network Base URL</h4>
            <p className="mono-label text-[9px] leading-relaxed opacity-50">
              Current agent API target: {getApiBaseUrl()}
            </p>
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
  source?: CloudSource;
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
  isSyncing,
}) => {
  const statusLabel =
    source?.status === 'error'
      ? 'Attention'
      : source
        ? 'Linked'
        : 'Offline';

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
              <p className="mono-label mt-2 text-[9px] opacity-50">
                {source?.accountEmail || 'No account connected'}
              </p>
            </div>
          </div>
          <div
            className={`mono-label text-[8px] px-3 py-1 border ${
              source?.status === 'error'
                ? 'border-amber-500/30 text-amber-400'
                : source
                  ? 'border-accent/30 text-accent'
                  : 'border-white/10 text-muted'
            }`}
          >
            {statusLabel}
          </div>
        </div>

        <p className="mono-label text-[10px] leading-relaxed opacity-60">{description}</p>

        {source && (
          <div className="grid grid-cols-2 gap-8 p-6 bg-white/[0.02] border border-white/5">
            <div className="space-y-2">
              <p className="mono-label text-[8px] opacity-40">Last Ingestion</p>
              <p className="mono-label text-[9px] text-bone">
                {source.lastSyncAt ? new Date(source.lastSyncAt).toLocaleString() : 'N/A'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="mono-label text-[8px] opacity-40">Node Status</p>
              <p className="mono-label text-[9px] text-accent">
                {source.status === 'error' ? 'Needs attention' : 'Operational'}
              </p>
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
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
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
            Connect
          </button>
        )}
      </div>
    </div>
  );
};

function cn(...inputs: Array<string | false | null | undefined>) {
  return inputs.filter(Boolean).join(' ');
}
