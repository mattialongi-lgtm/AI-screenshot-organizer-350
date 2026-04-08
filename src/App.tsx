/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Sparkles, 
  Moon, 
  Sun, 
  Plus, 
  Loader2,
  Database,
  ShieldAlert,
  LayoutGrid
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

import { ScreenshotMetadata, Category } from './types';
import { 
  getAllScreenshots, 
  saveScreenshot, 
  deleteScreenshot, 
  updateScreenshot 
} from './lib/db';
import { 
  analyzeScreenshot, 
  generateEmbedding, 
  askScreenshots, 
  isMockMode 
} from './lib/ai/gemini';
import { keywordSearch, semanticSearch } from './lib/search';

import { UploadDropzone } from './components/UploadDropzone';
import { ScreenshotCard } from './components/ScreenshotCard';
import { DetailModal } from './components/DetailModal';
import { ChatDrawer } from './components/ChatDrawer';
import { Filters } from './components/Filters';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

import { supabase, isSupabaseConfigured, useSupabaseAuth } from './lib/supabase';
import { AuthButton } from './components/AuthButton';
import { SourcesPage } from './pages/Sources';
import { Cloud } from 'lucide-react';

import { mapDbToScreenshot, mapScreenshotToDb } from './lib/mapping';
import { LandingPage } from './pages/LandingPage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'sources'>('home');
  const { user, loading: authLoading } = useSupabaseAuth();
  const [screenshots, setScreenshots] = useState<ScreenshotMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [hasAmount, setHasAmount] = useState(false);
  const [hasUrl, setHasUrl] = useState(false);

  const [selectedScreenshot, setSelectedScreenshot] = useState<ScreenshotMetadata | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Connect to WebSocket for real-time analysis updates
  useEffect(() => {
    const getWsUrl = () => {
      const apiUrl = import.meta.env.VITE_API_URL;
      if (apiUrl) {
        return apiUrl.replace('http', 'ws');
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${window.location.host}`;
    };

    const ws = new WebSocket(getWsUrl());

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'icloud:newFile' || message.type === 'google:newFile') {
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

    return () => ws.close();
  }, []);

  // Load data from IndexedDB or Supabase
  useEffect(() => {
    if (user && isSupabaseConfigured) {
      // Subscribe to Supabase real-time updates for this user
      const channel = supabase
        .channel('screenshots-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'screenshots',
            filter: `user_id=eq.${user.id}`
          },
          (payload) => {
            console.log("Real-time event received:", payload.eventType, (payload.new as any)?.id);
            if (payload.eventType === 'INSERT') {
              const newScreenshot = mapDbToScreenshot(payload.new);
              setScreenshots(prev => {
                if (prev.some(s => s.id === newScreenshot.id)) return prev;
                return [newScreenshot, ...prev];
              });
            } else if (payload.eventType === 'UPDATE') {
              const updated = mapDbToScreenshot(payload.new);
              console.log("Updated screenshot from real-time:", updated.id, "isAnalyzed:", updated.isAnalyzed);
              setScreenshots(prev => prev.map(s => String(s.id) === String(updated.id) ? { ...s, ...updated } : s));
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              setScreenshots(prev => prev.filter(s => String(s.id) !== String(deletedId)));
            }
          }
        )
        .subscribe();

      // Initial fetch from Supabase
      const fetchCloudScreenshots = async () => {
        const { data, error } = await supabase
          .from('screenshots')
          .select('*, tags(*)')
          .eq('user_id', user.id)
          .order('upload_date', { ascending: false });
        
        if (data && !error) {
          const mappedData = data.map(mapDbToScreenshot);
          setScreenshots(prev => {
            const combined = [...mappedData];
            prev.forEach(p => {
              if (!combined.some(c => c.id === p.id)) combined.push(p);
            });
            return combined.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
          });
          setLoading(false);
        }
      };

      fetchCloudScreenshots();

      return () => {
        supabase.removeChannel(channel);
      };
    } else {
      // Load from IndexedDB
      loadLocalData();
    }
  }, [user]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadLocalData = async () => {
    setLoading(true);
    try {
      const data = await getAllScreenshots();
      setScreenshots(data.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error("Failed to load screenshots:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: File[]) => {
    setIsUploading(true);
    for (const file of files) {
      const blob = new Blob([file], { type: file.type });
      const newScreenshot: ScreenshotMetadata = {
        createdAt: Date.now(),
        filename: file.name,
        imageBlob: blob,
        ocrText: '',
        summary: '',
        category: 'Other',
        tags: [],
        entities: { dates: [], amounts: [], emails: [], urls: [], phones: [], order_ids: [] },
        source: 'upload',
        isAnalyzed: false,
        userId: user?.id
      };

      try {
        if (user && isSupabaseConfigured) {
          // Sanitize filename for Supabase Storage (removes spaces, special characters)
          const safeFilename = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const fileName = `${user.id}/${Date.now()}_${safeFilename}`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('screenshots')
            .upload(fileName, blob);

          if (uploadError) throw uploadError;

          // Align with database schema: store full path in filename
          newScreenshot.filename = fileName;

          // Save to Supabase DB (mapScreenshotToDb handles standard fields)
          const dbDataToInsert = mapScreenshotToDb(newScreenshot);
          const { data: dbData, error: dbError } = await supabase
            .from('screenshots')
            .insert([{
            ...dbDataToInsert,
            user_id: user.id,
            upload_date: new Date().toISOString()
          }])
            .select()
            .single();

          if (dbError) throw dbError;
          if (dbData) {
            newScreenshot.id = dbData.id;
            console.log("Screenshot saved to Supabase:", dbData.id);
            // Add to state immediately for responsiveness
            setScreenshots(prev => [newScreenshot, ...prev]);
          }
        } else {
          const id = await saveScreenshot(newScreenshot);
          newScreenshot.id = id;
          setScreenshots(prev => [newScreenshot, ...prev]);
        }
        
        console.log("Starting analysis for:", newScreenshot.id);
        // Start analysis
        processAnalysis(newScreenshot);
      } catch (err: any) {
        console.error("Upload failed:", err);
        alert(`Upload Error: ${err.message || JSON.stringify(err)}`);
      }
    }
    setIsUploading(false);
  };

  const processAnalysis = async (screenshot: ScreenshotMetadata) => {
    if (screenshot.isAnalyzed) {
      console.log("DEBUG: Screenshot already analyzed:", screenshot.id);
      return;
    }

    try {
      console.log("DEBUG: processAnalysis started for:", screenshot.id);
      let blob = screenshot.imageBlob;
      if (!blob && screenshot.imageUrl) {
        console.log("DEBUG: Fetching blob from URL:", screenshot.imageUrl);
        const response = await fetch(screenshot.imageUrl);
        blob = await response.blob();
      }

      if (!blob) {
        throw new Error("No image data available for analysis");
      }

      console.log("DEBUG: Calling analyzeScreenshot...");
      const result = await analyzeScreenshot(blob);
      console.log("DEBUG: analyzeScreenshot result:", result.category);

      console.log("DEBUG: Calling generateEmbedding...");
      const embedding = await generateEmbedding(`${result.summary} ${result.ocr_text}`);
      console.log("DEBUG: generateEmbedding complete");

      // Map AnalysisResult fields to ScreenshotMetadata fields explicitly
      const updated: ScreenshotMetadata = {
        ...screenshot,
        category: result.category,
        summary: result.summary,
        ocrText: result.ocr_text,
        tags: result.tags,
        entities: result.entities,
        isSensitive: result.safety?.contains_sensitive ?? false,
        safetyReason: result.safety?.reason ?? '',
        embedding,
        isAnalyzed: true,
        lastAnalyzedAt: Date.now()
      };
      
      console.log("DEBUG: Analysis successful for:", updated.id, "Summary:", result.summary);
      
      // Update state immediately with strict ID comparison
      setScreenshots(prev => prev.map(s => String(s.id) === String(updated.id) ? updated : s));

      if (user && isSupabaseConfigured && updated.id) {
        console.log("DEBUG: Updating Supabase for:", updated.id);
        // Only update analysis-related columns to avoid overwriting unrelated fields
        const analysisUpdate = {
          category: updated.category,
          summary: updated.summary,
          ocr_text: updated.ocrText,
          entities: updated.entities,
          embedding: updated.embedding,
          is_sensitive: updated.isSensitive ? 1 : 0,
          is_analyzed: 1,
          safety_reason: updated.safetyReason,
          last_analyzed_at: new Date(updated.lastAnalyzedAt!).toISOString(),
        };
        const { error: dbError } = await supabase
          .from('screenshots')
          .update(analysisUpdate)
          .eq('id', updated.id);
        
        if (dbError) {
          console.error("DEBUG: Supabase update error:", dbError);
        } else {
          console.log("DEBUG: Supabase update success for:", updated.id);
          if (updated.tags && updated.tags.length > 0) {
            // Delete old tags first just in case
            await supabase.from('tags').delete().eq('screenshot_id', updated.id);
            const tagInserts = updated.tags.map(t => ({ screenshot_id: updated.id, tag: t }));
            await supabase.from('tags').insert(tagInserts);
          }
        }
      } else {
        console.log("DEBUG: Updating local DB for:", updated.id);
        await updateScreenshot(updated);
      }
    } catch (err: any) {
      console.error("DEBUG: processAnalysis FAILED for screenshot:", screenshot.id, err);
      alert(`Analysis Error: ${err.message || JSON.stringify(err)}`);
      const failed = { ...screenshot, isAnalyzed: false, summary: "Analysis failed. See console for details." };
      setScreenshots(prev => prev.map(s => String(s.id) === String(failed.id) ? failed : s));
    }
  };

  const handleDelete = async (id: string | number) => {
    if (confirm("Are you sure you want to delete this screenshot?")) {
      if (user && isSupabaseConfigured && typeof id === 'string') {
        // Delete from Supabase Storage and DB
        const { data } = await supabase
          .from('screenshots')
          .select('storage_path')
          .eq('id', id)
          .single();

        if (data?.storage_path) {
          await supabase.storage.from('screenshots').remove([data.storage_path]);
        }
        await supabase.from('screenshots').delete().eq('id', id);
      } else {
        await deleteScreenshot(id as number);
        setScreenshots(prev => prev.filter(s => s.id !== id));
      }
      if (selectedScreenshot?.id === id) setSelectedScreenshot(null);
    }
  };

  const handleReanalyze = async (e: React.MouseEvent, s: ScreenshotMetadata) => {
    e.stopPropagation();
    console.log("Manual re-analyze requested for:", s.id);
    setScreenshots(prev => prev.map(item => String(item.id) === String(s.id) ? { ...item, isAnalyzed: false } : item));
    processAnalysis(s);
  };

  const filteredScreenshots = useMemo(() => {
    let result = [...screenshots];

    if (activeCategory !== 'All') {
      result = result.filter(s => s.category === activeCategory);
    }

    if (hasAmount) {
      result = result.filter(s => s.entities.amounts.length > 0);
    }

    if (hasUrl) {
      result = result.filter(s => s.entities.urls.length > 0);
    }

    if (searchQuery.trim()) {
      result = keywordSearch(searchQuery, result);
    }

    return result;
  }, [screenshots, activeCategory, hasAmount, hasUrl, searchQuery]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const semanticResults = await semanticSearch(searchQuery, screenshots);
      if (semanticResults.length > 0) {
        // For simplicity, we just filter the list to these results
        // In a real app, you might merge or show them separately
        setScreenshots(semanticResults);
      }
    } catch (err) {
      console.error("Semantic search failed:", err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleChat = async (text: string) => {
    // RAG: Find relevant screenshots first
    const relevant = await semanticSearch(text, screenshots);
    return await askScreenshots(text, relevant.slice(0, 5));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-12 h-12 text-accent animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-ink text-bone font-sans selection:bg-accent selection:text-ink transition-colors duration-700">
      <div className="grain-overlay" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-ink/80 backdrop-blur-2xl border-b border-white/5">
        <div className="max-w-[1600px] mx-auto px-8 h-24 flex items-center justify-between gap-12">
          <div className="flex items-center gap-6 shrink-0">
            <div className="relative group">
              <div className="w-12 h-12 bg-accent flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500">
                <Sparkles className="w-6 h-6 text-ink" />
              </div>
              <div className="absolute -inset-1 border border-accent/30 -z-10 group-hover:inset-0 transition-all" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-serif italic leading-none tracking-tight">
                Screen <span className="text-accent">.</span> Sort
              </h1>
              <span className="mono-label mt-1">Intelligent Organization</span>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-3xl relative group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-4 h-4 text-muted group-focus-within:text-accent transition-colors" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by meaning, content, or context..."
              className="w-full bg-transparent border-b border-white/10 rounded-none py-4 pl-8 pr-4 text-sm focus:border-accent focus:ring-0 transition-all placeholder:text-muted/50"
            />
            {isSearching && <Loader2 className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 text-accent animate-spin" />}
          </form>

          <div className="flex items-center gap-8 shrink-0">
            <button 
              onClick={() => setCurrentPage(currentPage === 'home' ? 'sources' : 'home')}
              className={cn(
                "mono-label flex items-center gap-2 transition-all hover:text-accent",
                currentPage === 'sources' && "text-accent"
              )}
            >
              <Cloud className="w-4 h-4" />
              <span className="hidden lg:block">Sources</span>
            </button>
            <AuthButton />
            <div className="flex items-center gap-3 px-4 py-2 border border-white/5 bg-white/[0.02]">
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

              <section className="p-8 border border-accent/20 bg-accent/[0.02] relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-accent/5 -mr-12 -mt-12 rotate-45 group-hover:scale-150 transition-transform duration-700" />
                <h4 className="font-serif italic text-xl mb-4 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-accent" />
                  Cloud Active
                </h4>
                <p className="text-xs text-muted leading-relaxed font-light">
                  Your intelligence archive is securely synced across all nodes via Supabase.
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
              ) : filteredScreenshots.length === 0 ? (
                <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-12">
                  <div className="relative">
                    <div className="w-40 h-40 border border-white/5 flex items-center justify-center rotate-45">
                      <LayoutGrid className="w-16 h-16 text-white/10 -rotate-45" />
                    </div>
                    <Sparkles className="absolute -top-4 -right-4 w-10 h-10 text-accent animate-pulse" />
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-5xl font-serif italic">Archive Empty</h2>
                    <p className="text-muted font-light max-w-sm mx-auto">
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
                <div className="space-y-12">
                  <div className="flex items-end justify-between border-b border-white/5 pb-8">
                    <h2 className="text-6xl font-serif italic leading-none">
                      Collection <span className="text-accent text-2xl align-top">({filteredScreenshots.length})</span>
                    </h2>
                    <div className="mono-label">Sorted by Recency</div>
                  </div>
                  
                  <div className="editorial-grid">
                    <AnimatePresence mode="popLayout">
                      {filteredScreenshots.map((s, idx) => (
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
            if (user && isSupabaseConfigured && typeof id === 'string') {
              const dbUpdate = mapScreenshotToDb(updated);
              // Remove fields that shouldn't be updated or cause issues
              delete dbUpdate.id; 
              
              await supabase
                .from('screenshots')
                .update(dbUpdate)
                .eq('id', id);
            } else {
              await updateScreenshot(updated);
              setScreenshots(prev => prev.map(sc => sc.id === id ? updated : sc));
            }
          }
        }}
      />

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
