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

  const imageUrl = screenshot.imageUrl ?? '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast here
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-ink/95 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          className="relative w-full max-w-[1400px] h-full max-h-[90vh] bg-ink border border-white/10 flex flex-col lg:flex-row overflow-hidden"
        >
          <div className="flex-1 bg-white/[0.02] flex items-center justify-center p-12 overflow-hidden relative">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-10 left-10 mono-label">Specimen ID: {screenshot.id}</div>
              <div className="absolute bottom-10 right-10 mono-label">Capture: {new Date(screenshot.createdAt).toISOString()}</div>
            </div>
            <img 
              src={imageUrl} 
              className="max-w-full max-h-full object-contain shadow-[0_0_100px_rgba(0,0,0,0.5)]"
              onLoad={() => !screenshot.imageUrl && URL.revokeObjectURL(imageUrl)}
            />
          </div>
          
          <div className="w-full lg:w-[500px] border-l border-white/10 flex flex-col bg-ink">
            <div className="p-10 border-b border-white/10 flex items-center justify-between">
              <div className="space-y-2">
                <span className="mono-label text-accent">
                  {screenshot.category}
                </span>
                <h2 className="text-4xl font-serif italic leading-none">Intelligence</h2>
              </div>
              <button 
                onClick={onClose} 
                className="w-12 h-12 border border-white/10 flex items-center justify-center hover:bg-bone hover:text-ink transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-12 no-scrollbar">
              <section className="space-y-4">
                <h3 className="mono-label">Summary</h3>
                <p className="text-xl font-serif italic text-bone leading-relaxed">
                  {screenshot.isAnalyzed ? screenshot.summary : 'Awaiting intelligence...'}
                </p>
              </section>

              <section className="space-y-4">
                <h3 className="mono-label">Taxonomy</h3>
                <div className="flex flex-wrap gap-2">
                  {screenshot.tags.map((tag: string) => (
                    <span key={tag} className="mono-label text-[10px] border border-white/10 px-3 py-1.5">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <section className="space-y-6">
                <h3 className="mono-label">Entities</h3>
                <div className="space-y-2">
                  {Object.entries(screenshot.entities).map(([key, val]: [string, any]) => {
                    if (Array.isArray(val) && val.length === 0) return null;
                    if (!val) return null;
                    return (
                      <div key={key} className="flex items-center justify-between py-3 border-b border-white/5">
                        <span className="mono-label text-[9px]">{key.replace('_', ' ')}</span>
                        <span className="text-xs font-mono text-bone">
                          {Array.isArray(val) ? val.join(', ') : String(val)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="mono-label">Raw Data</h3>
                  <button 
                    onClick={() => copyToClipboard(screenshot.ocrText)}
                    className="mono-label text-accent hover:text-bone transition-colors"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-6 text-xs font-mono text-muted max-h-60 overflow-y-auto leading-relaxed">
                  {screenshot.ocrText || 'No data extracted.'}
                </div>
              </section>

              {screenshot.isSensitive && (
                <div className="border border-accent/30 bg-accent/5 p-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-accent" />
                    <span className="mono-label text-accent">Sensitive Material</span>
                  </div>
                  <p className="text-xs text-muted leading-relaxed">
                    {screenshot.safetyReason || 'This specimen contains potentially sensitive data.'}
                  </p>
                </div>
              )}
            </div>

            <div className="p-10 border-t border-white/10 flex gap-4">
              <button className="accent-button flex-1 flex items-center justify-center gap-3">
                <Share2 className="w-4 h-4" />
                Export
              </button>
              <button 
                onClick={() => onDelete(screenshot.id!)}
                className="w-12 h-12 border border-accent/40 flex items-center justify-center text-accent hover:bg-accent hover:text-ink transition-all"
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
