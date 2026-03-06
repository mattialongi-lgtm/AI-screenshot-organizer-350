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

import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db, storage } from './lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { AuthButton } from './components/AuthButton';

export default function App() {
  const [user] = useAuthState(auth);
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

  // Load data from IndexedDB or Firestore
  useEffect(() => {
    if (user) {
      // Load from Firestore
      const q = query(collection(db, 'screenshots'), where('userId', '==', user.uid));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const cloudData: ScreenshotMetadata[] = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          return {
            ...data,
            id: docSnap.id,
          } as ScreenshotMetadata;
        });
        setScreenshots(cloudData.sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      });
      return () => unsubscribe();
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
        userId: user?.uid
      };

      try {
        if (user) {
          // Upload to Storage
          const storageRef = ref(storage, `screenshots/${user.uid}/${Date.now()}_${file.name}`);
          await uploadBytes(storageRef, blob);
          const imageUrl = await getDownloadURL(storageRef);
          
          // Save to Firestore
          const { imageBlob, ...metadata } = newScreenshot;
          const docRef = await addDoc(collection(db, 'screenshots'), {
            ...metadata,
            imageUrl,
            storagePath: storageRef.fullPath
          });
          newScreenshot.id = docRef.id;
        } else {
          const id = await saveScreenshot(newScreenshot);
          newScreenshot.id = id;
          setScreenshots(prev => [newScreenshot, ...prev]);
        }
        
        // Start analysis
        processAnalysis(newScreenshot);
      } catch (err) {
        console.error("Upload failed:", err);
      }
    }
    setIsUploading(false);
  };

  const processAnalysis = async (screenshot: ScreenshotMetadata) => {
    try {
      let blob = screenshot.imageBlob;
      if (!blob && screenshot.imageUrl) {
        const response = await fetch(screenshot.imageUrl);
        blob = await response.blob();
      }
      if (!blob) throw new Error("No image data available for analysis");

      const result = await analyzeScreenshot(blob);
      const embedding = await generateEmbedding(`${result.summary} ${result.ocr_text}`);
      
      const updated: ScreenshotMetadata = {
        ...screenshot,
        ...result,
        ocrText: result.ocr_text,
        embedding,
        isAnalyzed: true,
        isSensitive: result.safety.contains_sensitive,
        safetyReason: result.safety.reason,
        lastAnalyzedAt: Date.now()
      };

      if (user && updated.id) {
        const { imageBlob, ...metadata } = updated;
        await updateDoc(doc(db, 'screenshots', updated.id as string), metadata);
      } else {
        await updateScreenshot(updated);
        setScreenshots(prev => prev.map(s => s.id === updated.id ? updated : s));
      }
    } catch (err) {
      console.error("Analysis failed:", err);
      const failed = { ...screenshot, isAnalyzed: false, summary: "Analysis failed. Click to retry." };
      setScreenshots(prev => prev.map(s => s.id === failed.id ? failed : s));
    }
  };

  const handleDelete = async (id: string | number) => {
    if (confirm("Are you sure you want to delete this screenshot?")) {
      if (user && typeof id === 'string') {
        // Delete from Firestore and Storage
        const docRef = doc(db, 'screenshots', id);
        const docSnap = await getDocs(query(collection(db, 'screenshots'), where('__name__', '==', id)));
        if (!docSnap.empty) {
          const data = docSnap.docs[0].data();
          if (data.storagePath) {
            await deleteObject(ref(storage, data.storagePath));
          }
        }
        await deleteDoc(docRef);
      } else {
        await deleteScreenshot(id as number);
        setScreenshots(prev => prev.filter(s => s.id !== id));
      }
      if (selectedScreenshot?.id === id) setSelectedScreenshot(null);
    }
  };

  const handleReanalyze = async (e: React.MouseEvent, s: ScreenshotMetadata) => {
    e.stopPropagation();
    setScreenshots(prev => prev.map(item => item.id === s.id ? { ...item, isAnalyzed: false } : item));
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

  return (
    <div className="min-h-screen bg-[#F7F8FA] dark:bg-[#0F1115] transition-colors duration-500 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0F1115]/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white hidden sm:block">
              AI Screenshot Organizer
            </h1>
          </div>

          <form onSubmit={handleSearch} className="flex-1 max-w-2xl relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by meaning, content, or context..."
              className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-2xl py-3 pl-12 pr-4 text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all dark:text-white"
            />
            {isSearching && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-500 animate-spin" />}
          </form>

          <div className="flex items-center gap-4 shrink-0">
            <AuthButton />
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className={cn("w-2 h-2 rounded-full", isMockMode ? "bg-amber-500" : "bg-emerald-500")} />
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                {isMockMode ? 'Mock AI' : 'Gemini Live'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
          {/* Sidebar / Filters */}
          <aside className="lg:col-span-1 space-y-8">
            <section>
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Quick Upload</h3>
              <UploadDropzone onUpload={handleUpload} isUploading={isUploading} />
            </section>

            <section>
              <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Filters</h3>
              <Filters 
                activeCategory={activeCategory} 
                onCategoryChange={setActiveCategory}
                hasAmount={hasAmount}
                setHasAmount={setHasAmount}
                hasUrl={hasUrl}
                setHasUrl={setHasUrl}
              />
            </section>

            <section className="p-6 bg-indigo-600 rounded-3xl text-white shadow-xl shadow-indigo-500/20">
              <h4 className="font-bold mb-2 flex items-center gap-2">
                {user ? <Sparkles className="w-4 h-4" /> : <Database className="w-4 h-4" />}
                {user ? 'Cloud Drive Active' : 'Local Storage'}
              </h4>
              <p className="text-xs text-indigo-100 leading-relaxed">
                {user 
                  ? 'Your screenshots are securely synced to your Cloud Drive (Firestore) and accessible anywhere.' 
                  : "All your screenshots are stored locally. Sign in to sync with your Cloud Drive."}
              </p>
            </section>
          </aside>

          {/* Grid */}
          <div className="lg:col-span-3">
            {loading ? (
              <div className="h-96 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : filteredScreenshots.length === 0 ? (
              <div className="h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
                <div className="relative">
                  <div className="w-32 h-32 bg-indigo-100 dark:bg-indigo-900/20 rounded-[40px] flex items-center justify-center">
                    <LayoutGrid className="w-12 h-12 text-indigo-500" />
                  </div>
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex items-center justify-center animate-bounce">
                    <Sparkles className="w-6 h-6 text-amber-500" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">No screenshots found</h2>
                  <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
                    Upload some screenshots to see the AI magic in action.
                  </p>
                </div>
                <button 
                  onClick={() => (document.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Upload First Screenshot
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filteredScreenshots.map(s => (
                    <ScreenshotCard 
                      key={s.id} 
                      screenshot={s} 
                      onClick={() => setSelectedScreenshot(s)}
                      onDelete={(e) => { e.stopPropagation(); handleDelete(s.id!); }}
                      onReanalyze={(e) => handleReanalyze(e, s)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Floating AI Button */}
      <button 
        onClick={() => setIsChatOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-2xl shadow-indigo-500/40 flex items-center justify-center transition-all hover:scale-110 active:scale-95 group z-30"
      >
        <Sparkles className="w-7 h-7 group-hover:rotate-12 transition-transform" />
        <div className="absolute -top-2 -right-2 px-2 py-1 bg-amber-500 text-white text-[8px] font-black rounded-lg shadow-lg uppercase tracking-tighter">
          AI Chat
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
            if (user && typeof id === 'string') {
              const { imageBlob, ...metadata } = updated;
              await updateDoc(doc(db, 'screenshots', id), metadata);
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
