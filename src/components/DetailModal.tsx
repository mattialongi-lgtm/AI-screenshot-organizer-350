/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Share2, Trash2, Copy, Tag, Calendar, Sparkles } from 'lucide-react';
import { ScreenshotMetadata } from '../types';

interface DetailModalProps {
  screenshot: ScreenshotMetadata | null;
  onClose: () => void;
  onDelete: (id: string | number) => void;
  onUpdateTags: (id: string | number, tags: string[]) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ 
  screenshot, 
  onClose, 
  onDelete,
  onUpdateTags
}) => {
  if (!screenshot) return null;

  const imageUrl = screenshot.imageUrl || (screenshot.imageBlob ? URL.createObjectURL(screenshot.imageBlob) : '');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast here
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          className="relative w-full max-w-6xl bg-white dark:bg-slate-900 rounded-[32px] shadow-2xl overflow-hidden flex flex-col lg:flex-row max-h-[90vh] border border-white/10"
        >
          <div className="flex-1 bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6 lg:p-12 overflow-hidden">
            <img 
              src={imageUrl} 
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              onLoad={() => !screenshot.imageUrl && URL.revokeObjectURL(imageUrl)}
            />
          </div>
          
          <div className="w-full lg:w-[450px] border-l border-slate-100 dark:border-slate-800 flex flex-col bg-white dark:bg-slate-900">
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold rounded uppercase tracking-widest">
                    {screenshot.category}
                  </span>
                </div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Analysis</h2>
              </div>
              <button 
                onClick={onClose} 
                className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-400"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <section>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">AI Summary</h3>
                <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                  {screenshot.isAnalyzed ? screenshot.summary : 'Awaiting analysis...'}
                </p>
              </section>

              <section>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-3">Smart Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {screenshot.tags.map((tag: string) => (
                    <span key={tag} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700">
                      #{tag}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">Detected Entities</h3>
                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(screenshot.entities).map(([key, val]: [string, any]) => {
                    if (Array.isArray(val) && val.length === 0) return null;
                    if (!val) return null;
                    return (
                      <div key={key} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tighter">{key.replace('_', ' ')}</span>
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          {Array.isArray(val) ? val.join(', ') : String(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Extracted Text</h3>
                  <button 
                    onClick={() => copyToClipboard(screenshot.ocrText)}
                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Text
                  </button>
                </div>
                <div className="bg-slate-50 dark:bg-slate-950 rounded-2xl p-5 text-xs font-mono text-slate-600 dark:text-slate-400 max-h-60 overflow-y-auto leading-relaxed border border-slate-100 dark:border-slate-800">
                  {screenshot.ocrText || 'No text extracted.'}
                </div>
              </section>

              {screenshot.isSensitive && (
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-2xl p-5 flex gap-4">
                  <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-red-600 dark:text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-red-700 dark:text-red-500">Sensitive Information</p>
                    <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 leading-relaxed">
                      {screenshot.safetyReason || 'This screenshot contains potentially sensitive data.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-3">
              <button className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button 
                onClick={() => onDelete(screenshot.id!)}
                className="p-3 bg-white dark:bg-slate-800 text-red-500 hover:bg-red-50 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
