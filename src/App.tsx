/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search,
  Sparkles,
  Loader2,
  ShieldAlert,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { ScreenshotMetadata, Category, ChatMessage } from './types';
import {
  analyzeStoredScreenshot,
  askScreenshots,
  isMockMode,
  uploadScreenshot,
} from './lib/ai/openai';
import { keywordSearch, semanticSearch } from './lib/search';

import { UploadDropzone } from './components/UploadDropzone';
import { ScreenshotCard } from './components/ScreenshotCard';
import { DetailModal } from './components/DetailModal';
import { ChatDrawer } from './components/ChatDrawer';
import { Filters } from './components/Filters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { supabase, useSupabaseAuth, getAccessToken, authenticatedFetch } from './lib/supabase';
import { AuthButton } from './components/AuthButton';
import { SourcesPage } from './pages/Sources';
import { Cloud } from 'lucide-react';

import { mapDbToScreenshot, mapScreenshotToDb } from './lib/mapping';
import { AuthModal } from './components/AuthModal';
import { buildWebSocketUrl } from './lib/api';
import { applyStructuredFilters, getScreenshotsByIds } from './lib/screenshotFilters';
import { formatUploadWindowMinutes, MANUAL_UPLOAD_BATCH_LIMIT } from './shared/uploadLimits';

const DEMO_SCREENSHOTS: ScreenshotMetadata[] = [
  {
    id: 'demo-1',
    // We add a temp property for the UI if it supports it, else we rely on source 'manual'
    filename: 'receipt_dinner.png',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 2,
    isAnalyzed: true,
    category: 'Receipt',
    summary: 'Dinner receipt for 2 people. Total $85.50.',
    tags: ['dining', 'expenses'],
    ocrText: 'The Italian Place\nTotal $85.50',
    entities: { amounts: ['85.50'], dates: [], emails: [], urls: [], phones: [], order_ids: [], merchant: 'The Italian Place' },
    source: 'upload',
  },
  {
    id: 'demo-2',
    filename: 'event_poster.png',
    createdAt: Date.now() - 1000 * 60 * 60 * 24 * 5,
    isAnalyzed: true,
    category: 'Other',
    summary: 'Design Conference 2026 poster. Keynote on October 15th.',
    tags: ['design', 'networking'],
    ocrText: 'Design Conf 2026\nOctober 15th',
    entities: { dates: ['2026-10-15'], amounts: [], emails: [], urls: [], phones: [], order_ids: [] },
    source: 'upload',
  }
];

const FOLLOW_UP_QUERY_RE = /^(why|how|and|more|explain|because|what about|it|this|that|those|them)\b/i;
const RECENT_SCREENSHOT_QUERY_RE = /\b(upload(?:ed)?|latest|last|recent|new|this|that|it|screenshots?|screens?)\b/i;
const BROAD_SCOPE_QUERY_RE = /\b(these|those|all|every|my|the|any)\b.{0,20}\b(screenshots?|images?|files?|archive|things?)\b/i;

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'sources'>('home');
  const { user, loading: authLoading } = useSupabaseAuth();
  const [screenshots, setScreenshots] = useState<ScreenshotMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [semanticResultIds, setSemanticResultIds] = useState<(string | number)[] | null>(null);
  const [semanticSearchQuery, setSemanticSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [hasAmount, setHasAmount] = useState(false);
  const [hasUrl, setHasUrl] = useState(false);

  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotMetadata | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const semanticSearchRequestId = useRef(0);
  const isSemanticSearchActive = semanticResultIds !== null;

  // Connect to WebSocket for real-time analysis updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let cancelled = false;

    const connect = async () => {
      const token = await getAccessToken();
      if (!token || cancelled) {
        return;
      }

      ws = new WebSocket(buildWebSocketUrl());

      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: "auth", token }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'google:newFile') {
            const newScreenshot = message.data;
            setScreenshots(prev => {
              if (prev.some(s => s.id === newScreenshot.id)) return prev;
              return [newScreenshot, ...prev];
            });
          }
        } catch (e) {
          console.error("WS message error:", e);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      ws?.close();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && !user) {
      setScreenshots(DEMO_SCREENSHOTS);
      setLoadError(null);
      setLoading(false);
      return;
    }

    if (!user) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setScreenshots([]);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('screenshots-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'screenshots',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (cancelled) return;
            if (payload.eventType === 'INSERT') {
              const newScreenshot = mapDbToScreenshot(payload.new);
              setScreenshots(prev => {
                if (prev.some(s => s.id === newScreenshot.id)) return prev;
                return [newScreenshot, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              const updated = mapDbToScreenshot(payload.new);
              setScreenshots(prev => prev.map(s => String(s.id) === String(updated.id) ? { ...s, ...updated } : s));
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setScreenshots(prev => prev.filter(s => String(s.id) !== String(deletedId)));
            }
          },
        )
        .subscribe();
    } catch (subscribeError) {
      console.warn('Realtime subscription failed; continuing without live updates:', subscribeError);
    }

    const fetchCloudScreenshots = async () => {
      try {
        const { data, error } = await supabase
          .from('screenshots')
          .select('*, tags(*)')
          .eq('user_id', user.id)
          .order('upload_date', { ascending: false });

        if (cancelled) return;

        if (error) {
          throw error;
        }

        const mappedData = (data ?? []).map(mapDbToScreenshot);
        setScreenshots(prev => {
          const combined = [...mappedData];
          prev.forEach(p => {
            if (!combined.some(c => c.id === p.id)) combined.push(p);
          });
          return combined.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        });
        setLoadError(null);
      } catch (error) {
        if (cancelled) return;
        console.error('Failed to load cloud screenshots:', error);
        const message = error instanceof Error && error.message ? error.message : 'Unable to load your archive.';
        setLoadError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchCloudScreenshots();

    return () => {
      cancelled = true;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* best-effort */ }
      }
    };
  }, [user, authLoading, loadAttempt]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleUpload = async (files: File[]) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsUploading(true);
    let uploadedCount = 0;
    for (const file of files) {
      try {
        const { screenshot: row } = await uploadScreenshot(file);
        const mapped = mapDbToScreenshot(row);
        setScreenshots(prev => {
          if (prev.some(s => String(s.id) === String(mapped.id))) {
            return prev.map(s => String(s.id) === String(mapped.id) ? { ...s, ...mapped } : s);
          }
          return [mapped, ...prev];
        });
        uploadedCount += 1;
      } catch (err: any) {
        console.error("Upload failed:", err);
        const message = err?.message || JSON.stringify(err);
        if (typeof message === 'string' && message.includes('429')) {
          alert(
            `Upload limit reached: you can upload up to ${MANUAL_UPLOAD_BATCH_LIMIT} screenshots every ${formatUploadWindowMinutes()} minutes. Uploaded ${uploadedCount} file${uploadedCount === 1 ? '' : 's'} before the limit was hit.`
          );
          break;
        }
        alert(`Upload Error: ${message}`);
      }
    }
    setIsUploading(false);
  };

  const applyAnalysisResult = (screenshot: ScreenshotMetadata, result: Awaited<ReturnType<typeof analyzeStoredScreenshot>>): ScreenshotMetadata => ({
    ...screenshot,
    category: result.category,
    summary: result.summary,
    ocrText: result.ocr_text,
    tags: result.tags,
    entities: result.entities,
    isSensitive: result.safety?.contains_sensitive ?? false,
    safetyReason: result.safety?.reason ?? '',
    embedding: result.embedding ?? screenshot.embedding,
    isAnalyzed: true,
    lastAnalyzedAt: Date.now(),
  });

  const handleDelete = async (id: string | number) => {
    if (!confirm("Are you sure you want to delete this screenshot?")) {
      return;
    }

    try {
      const res = await authenticatedFetch(`/api/screenshots/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(payload.error || 'Delete failed.');
      }

      setScreenshots(prev => prev.filter(s => String(s.id) !== String(id)));
      if (String(selectedScreenshot?.id) === String(id)) {
        setSelectedScreenshot(null);
      }
    } catch (err: any) {
      console.error('Delete failed:', err);
      alert(`Delete Error: ${err.message || JSON.stringify(err)}`);
    }
  };

  const handleReanalyze = async (e: React.MouseEvent, s: ScreenshotMetadata) => {
    e.stopPropagation();
    if (!s.id) return;
    setScreenshots(prev => prev.map(item => String(item.id) === String(s.id) ? { ...item, isAnalyzed: false } : item));
    try {
      const result = await analyzeStoredScreenshot(s.id);
      const updated = applyAnalysisResult(s, result);
      setScreenshots(prev => prev.map(item => String(item.id) === String(updated.id) ? updated : item));
    } catch (err: any) {
      console.error("Re-analysis failed for:", s.id, err);
      alert(`Analysis Error: ${err.message || JSON.stringify(err)}`);
      setScreenshots(prev => prev.map(item => String(item.id) === String(s.id) ? { ...item, isAnalyzed: true } : item));
    }
  };

  const resetSemanticSearch = (options?: { clearQuery?: boolean }) => {
    semanticSearchRequestId.current += 1;
    setSemanticResultIds(null);
    setSemanticSearchQuery('');
    setIsSearching(false);

    if (options?.clearQuery) {
      setSearchQuery('');
    }
  };

  const structuredFilters = { activeCategory, hasAmount, hasUrl };

  const archiveScreenshots = useMemo(() => {
    let result = applyStructuredFilters(screenshots, structuredFilters);

    if (searchQuery.trim() && !isSemanticSearchActive) {
      result = keywordSearch(searchQuery, result);
    }

    return result;
  }, [screenshots, activeCategory, hasAmount, hasUrl, searchQuery, isSemanticSearchActive]);

  const semanticScreenshots = useMemo(() => {
    if (!semanticResultIds) {
      return [];
    }

    return applyStructuredFilters(
      getScreenshotsByIds(screenshots, semanticResultIds),
      structuredFilters,
    );
  }, [screenshots, semanticResultIds, activeCategory, hasAmount, hasUrl]);

  const visibleScreenshots = useMemo(() => {
    return isSemanticSearchActive ? semanticScreenshots : archiveScreenshots;
  }, [archiveScreenshots, semanticScreenshots, isSemanticSearchActive]);

  const handleSearchInputChange = (value: string) => {
    setSearchQuery(value);

    if (semanticSearchQuery && value.trim() !== semanticSearchQuery) {
      resetSemanticSearch();
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchQuery.trim();

    if (!query) {
      resetSemanticSearch({ clearQuery: true });
      return;
    }

    const requestId = ++semanticSearchRequestId.current;
    setIsSearching(true);
    try {
      const semanticResults = await semanticSearch(query, screenshots);
      if (requestId !== semanticSearchRequestId.current) {
        return;
      }

      setSemanticResultIds(
        semanticResults
          .map((screenshot) => screenshot.id)
          .filter((id): id is string | number => id != null),
      );
      setSemanticSearchQuery(query);
    } catch (err) {
      console.error("Semantic search failed:", err);
    } finally {
      if (requestId === semanticSearchRequestId.current) {
        setIsSearching(false);
      }
    }
  };

  const handleChat = async (text: string, history: ChatMessage[]) => {
    const normalizedText = text.trim().toLowerCase();
    const recentScreenshots = [...screenshots].sort((a, b) => b.createdAt - a.createdAt);
    const latestScreenshot = recentScreenshots[0];
    const latestAnalyzedScreenshot = recentScreenshots.find(
      (screenshot) => screenshot.isAnalyzed && Boolean(screenshot.summary.trim() || screenshot.ocrText.trim()),
    );
    const previousReferencedIds = [...history]
      .reverse()
      .find((message) => message.role === 'ai' && Array.isArray(message.ids) && message.ids.length > 0)
      ?.ids ?? [];
    const previousContext = getScreenshotsByIds(screenshots, previousReferencedIds);
    const isFollowUp = normalizedText.split(/\s+/).filter(Boolean).length <= 3 || FOLLOW_UP_QUERY_RE.test(normalizedText);
    const refersToLatestScreenshot = RECENT_SCREENSHOT_QUERY_RE.test(normalizedText);
    const refersToBroadScope = BROAD_SCOPE_QUERY_RE.test(normalizedText);
    const recentAnalyzed = recentScreenshots.filter(
      (screenshot) => screenshot.isAnalyzed && Boolean(screenshot.summary.trim() || screenshot.ocrText.trim()),
    );

    let relevant: ScreenshotMetadata[] = [];

    if (isFollowUp && previousContext.length > 0) {
      relevant = previousContext;
    }

    if (relevant.length === 0 && refersToBroadScope && recentAnalyzed.length > 0) {
      relevant = recentAnalyzed.slice(0, 5);
    }

    if (relevant.length === 0) {
      try {
        relevant = await semanticSearch(text, screenshots);
      } catch (err) {
        console.error("Semantic chat search failed, falling back to keyword search:", err);
      }
    }

    if (relevant.length === 0) {
      relevant = keywordSearch(text, screenshots);
    }

    if (relevant.length === 0 && previousContext.length > 0) {
      relevant = previousContext;
    }

    if (relevant.length === 0 && (refersToLatestScreenshot || screenshots.length === 1)) {
      if (latestScreenshot && !latestScreenshot.isAnalyzed) {
        return {
          answer: "The latest screenshot is still being analyzed. As soon as that finishes, I can tell you what it talks about.",
          used_ids: latestScreenshot.id != null ? [latestScreenshot.id] : [],
        };
      }

      if (latestAnalyzedScreenshot) {
        relevant = [latestAnalyzedScreenshot];
      }
    }

    if (relevant.length === 0 && recentAnalyzed.length > 0) {
      relevant = recentAnalyzed.slice(0, 5);
    }

    if (relevant.length === 0) {
      return {
        answer: "I couldn't match this question to any analyzed screenshot yet. Ask about visible text, or mention the latest uploaded screenshot and I'll use that as context.",
        used_ids: [],
      };
    }

    return await askScreenshots(text, relevant.slice(0, 5), history);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink text-bone font-sans selection:bg-accent selection:text-ink transition-colors duration-700">
      <div className="grain-overlay" />

      {!user && (
        <div className="bg-bone text-ink text-center py-2 text-xs font-semibold">
          You're exploring in guest mode. <button onClick={() => setIsAuthModalOpen(true)} className="underline decoration-ink/30 hover:decoration-ink/100 transition-colors">Log in</button> to upload and sync archives.
        </div>
      )}
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-ink/80 backdrop-blur-xl border-b border-black/5 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-8 h-24 flex items-center justify-between gap-12">
          <div className="flex items-center gap-6 shrink-0">
            <div className="relative group">
              <div className="w-12 h-12 bg-accent flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500">
                <Sparkles className="w-6 h-6 text-ink" />
              </div>
              <div className="absolute -inset-1 border border-accent/30 -z-10 group-hover:inset-0 transition-all" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-sans font-extrabold leading-none tracking-tight">
                Screen<span className="text-accent">Sort</span>
              </h1>
              <span className="font-sans text-[10px] uppercase tracking-widest text-bone/80 font-bold mt-1.5 ml-1">
                Organize automatically, retrieve instantly.
              </span>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-3xl relative group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => handleSearchInputChange(e.target.value)}
              placeholder="Search by meaning, content, or context..."
              className="w-full bg-transparent border-b border-black/10 rounded-none py-4 pl-8 pr-20 text-sm focus:border-accent focus:ring-0 outline-none transition-all placeholder:text-black/30 font-medium font-sans"
            />
            {isSearching && <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />}
            {!isSearching && (searchQuery.trim() || isSemanticSearchActive) && (
              <button
                type="button"
                onClick={() => resetSemanticSearch({ clearQuery: true })}
                className="absolute right-0 top-1/2 -translate-y-1/2 mono-label text-[10px] text-accent hover:text-bone transition-colors"
              >
                Clear
              </button>
            )}
          </form>

          <div className="flex items-center gap-8 shrink-0">
            <button 
              onClick={() => setCurrentPage(currentPage === 'home' ? 'sources' : 'home')}
              className={cn(
                "mono-label flex items-center gap-2 transition-all hover:text-accent font-semibold",
                currentPage === 'sources' && "text-accent"
              )}
            >
              <Cloud className="w-4 h-4" />
              <span className="hidden lg:block">Sources</span>
            </button>
            <AuthButton onSignInClick={() => setIsAuthModalOpen(true)} />
            <div className="flex items-center gap-3 px-4 py-2 border border-black/5 bg-black/[0.02] rounded-lg">
              <div className={cn("w-1.5 h-1.5 rounded-full", isMockMode ? "bg-amber-500" : "bg-accent")} />
              <span className="mono-label">
                {isMockMode ? 'Mock' : 'Live'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-8 py-16">
        {currentPage === 'sources' ? (
          <SourcesPage onBack={() => setCurrentPage('home')} />
        ) : (
          <div className="flex flex-col lg:flex-row gap-20">
            {/* Sidebar / Filters */}
            <aside className="w-full lg:w-80 shrink-0 space-y-16">
              <section>
                <h3 className="mono-label mb-8">Ingest</h3>
                <UploadDropzone onUpload={handleUpload} isUploading={isUploading} />
              </section>

              <section>
                <h3 className="mono-label mb-8">Refine</h3>
                <Filters 
                  activeCategory={activeCategory} 
                  onCategoryChange={setActiveCategory}
                  hasAmount={hasAmount}
                  setHasAmount={setHasAmount}
                  hasUrl={hasUrl}
                  setHasUrl={setHasUrl}
                />
              </section>

              <section className="p-8 border border-black/5 bg-white shadow-sm relative overflow-hidden group rounded-[var(--radius-editorial)]">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 -mr-12 -mt-12 rotate-45 group-hover:scale-150 transition-transform duration-700" />
                <h4 className="font-sans font-bold text-xl mb-4 flex items-center gap-2 text-bone">
                  <Sparkles className="w-5 h-5 text-accent" />
                  {user ? 'Cloud Active' : 'Explore Mode'}
                </h4>
                <p className="text-xs text-muted leading-relaxed font-medium">
                  {user ? 'Your intelligence archive is securely synced across all nodes via Supabase.' : 'You are exploring guest data. Log in to upload your own screenshots to the cloud.'}
                </p>
              </section>
            </aside>

            {/* Grid */}
            <div className="flex-1">
              {loading ? (
                <div className="h-96 flex flex-col items-center justify-center gap-4">
                  <Loader2 className="w-12 h-12 text-accent animate-spin" />
                  <span className="mono-label animate-pulse">Initializing Archive</span>
                </div>
              ) : loadError ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                  <h2 className="text-3xl font-sans font-bold tracking-tight">Archive Unavailable</h2>
                  <p className="text-muted font-medium max-w-md mx-auto">
                    Failed to load your archive. {loadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLoadAttempt((n) => n + 1)}
                    className="accent-button"
                  >
                    Retry
                  </button>
                </div>
              ) : visibleScreenshots.length === 0 ? (
                screenshots.length === 0 ? (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-12">
                    <div className="relative">
                      <div className="w-40 h-40 border border-black/5 rounded-3xl bg-white flex items-center justify-center rotate-12">
                        <LayoutGrid className="w-16 h-16 text-black/10 -rotate-12" />
                      </div>
                      <Sparkles className="absolute -top-4 -right-4 w-10 h-10 text-accent animate-pulse" />
                    </div>
                    <div className="space-y-4">
                      <h2 className="text-4xl font-sans font-bold tracking-tight">Archive Empty</h2>
                      <p className="text-muted font-medium max-w-sm mx-auto">
                        Your intelligence repository is currently void. Ingest screenshots to begin analysis.
                      </p>
                    </div>
                    <button 
                      onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
                      className="accent-button"
                    >
                      Ingest First Entry
                    </button>
                  </div>
                ) : (
                  <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-8">
                    <div className="relative">
                      <div className="w-32 h-32 border border-black/5 rounded-3xl bg-white flex items-center justify-center rotate-12">
                        <Search className="w-12 h-12 text-black/10 -rotate-12" />
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h2 className="text-4xl font-sans font-bold tracking-tight">
                        {isSemanticSearchActive ? 'No Search Results' : 'No Matching Screenshots'}
                      </h2>
                      <p className="text-muted font-light max-w-md mx-auto">
                        {isSemanticSearchActive
                          ? 'No screenshots matched that semantic search after applying your current filters. Clear search or relax filters to return to the full archive.'
                          : 'No screenshots match the current keyword query or filters. Adjust the search text or filters to expand the archive again.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => resetSemanticSearch({ clearQuery: true })}
                      className="accent-button"
                    >
                      Clear Search
                    </button>
                  </div>
                )
              ) : (
                <div className="space-y-12">
                  <div className="flex items-end justify-between border-b border-black/5 pb-6">
                    <h2 className="text-4xl font-sans font-bold tracking-tight">
                      {isSemanticSearchActive ? 'Search Results' : 'Collection'} <span className="text-accent text-xl align-top opacity-80">({visibleScreenshots.length})</span>
                    </h2>
                    <div className="mono-label">
                      {isSemanticSearchActive ? `Semantic: ${semanticSearchQuery}` : 'Sorted by Recency'}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 gap-y-10">
                    <AnimatePresence mode="popLayout">
                      {visibleScreenshots.map((s, idx) => (
                        <motion.div
                          key={s.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                        >
                          <ScreenshotCard 
                            screenshot={s} 
                            onClick={() => setSelectedScreenshot(s)}
                            onDelete={(e) => { e.stopPropagation(); handleDelete(s.id!); }}
                            onReanalyze={(e) => handleReanalyze(e, s)}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating AI Button */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-12 right-12 w-20 h-20 bg-accent text-ink flex items-center justify-center transition-all hover:scale-110 active:scale-95 group z-30 shadow-[0_0_30px_rgba(255,77,0,0.3)]"
      >
        <Sparkles className="w-8 h-8 group-hover:rotate-12 transition-transform duration-500" />
        <div className="absolute -top-3 -right-3 px-3 py-1 bg-bone text-ink text-[10px] font-mono font-bold shadow-xl uppercase tracking-tighter">
          Query
        </div>
      </button>

      {/* Modals & Drawers */}
      <DetailModal 
        screenshot={selectedScreenshot} 
        onClose={() => setSelectedScreenshot(null)}
        onDelete={handleDelete}
        onUpdateTags={async (id, tags) => {
          const s = screenshots.find(sc => sc.id === id);
          if (s) {
            const updated = { ...s, tags };
            const dbUpdate = mapScreenshotToDb(updated);
            delete dbUpdate.id;
            await supabase
              .from('screenshots')
              .update(dbUpdate)
              .eq('id', id)
              .eq('user_id', user!.id);
          }
        }}
      />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      <ChatDrawer 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        onSendMessage={handleChat}
        screenshots={screenshots}
      />

      {isMockMode && (
        <div className="fixed bottom-8 left-8 z-50">
          <div className="bg-amber-500/10 backdrop-blur-md border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3 shadow-xl">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-xs font-bold text-amber-700 dark:text-amber-500">Mock AI Mode Active</p>
              <p className="text-[10px] text-amber-600/80 dark:text-amber-500/80">No API key found. Using simulated responses.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
