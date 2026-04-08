/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Shield, Eye, Trash2, RefreshCw, Tag, Calendar } from 'lucide-react';
import { ScreenshotMetadata } from '../types';

interface ScreenshotCardProps {
  screenshot: ScreenshotMetadata;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onReanalyze: (e: React.MouseEvent) => void;
}

export const ScreenshotCard: React.FC<ScreenshotCardProps> = ({ 
  screenshot, 
  onClick, 
  onDelete, 
  onReanalyze 
}) => {
  const imageUrl = screenshot.imageUrl || (screenshot.imageBlob ? URL.createObjectURL(screenshot.imageBlob) : '');

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="editorial-card group cursor-pointer"
    >
      <div className="aspect-[4/5] overflow-hidden relative border-b border-white/5">
        <img 
          src={imageUrl} 
          alt={screenshot.filename}
          className="w-full h-full object-cover transition-transform duration-[1.5s] ease-out group-hover:scale-105"
          onLoad={() => !screenshot.imageUrl && URL.revokeObjectURL(imageUrl)}
        />
        
        {!screenshot.isAnalyzed && (
          <div className="absolute inset-0 bg-ink/60 backdrop-blur-md flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="mono-label text-accent animate-pulse">Awaiting Intelligence...</span>
          </div>
        )}

        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-ink/80 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-center gap-6">
          <div className="flex gap-4">
            <button className="w-12 h-12 border border-white/20 flex items-center justify-center text-bone hover:bg-bone hover:text-ink transition-all">
              <Eye className="w-5 h-5" />
            </button>
            <button 
              onClick={onReanalyze}
              className="w-12 h-12 border border-white/20 flex items-center justify-center text-bone hover:bg-bone hover:text-ink transition-all"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button 
              onClick={onDelete}
              className="w-12 h-12 border border-accent/40 flex items-center justify-center text-accent hover:bg-accent hover:text-ink transition-all"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
          <span className="mono-label text-[8px]">Inspect Specimen</span>
        </div>

        {screenshot.isSensitive && (
          <div className="absolute top-4 right-4 bg-accent text-ink p-1.5 shadow-xl">
            <Shield className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="mono-label text-accent">
            {screenshot.category}
          </span>
          <span className="mono-label">
            {new Date(screenshot.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
          </span>
        </div>
        
        <h3 className="text-lg font-serif italic leading-tight group-hover:text-accent transition-colors">
          {screenshot.isAnalyzed ? screenshot.summary : 'Awaiting intelligence...'}
        </h3>

        <div className="flex flex-wrap gap-2 pt-2">
          {screenshot.tags.slice(0, 3).map((tag: string) => (
            <span key={tag} className="mono-label text-[8px] border border-white/10 px-2 py-1">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
