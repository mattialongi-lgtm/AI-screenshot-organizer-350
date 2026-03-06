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
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={onClick}
      className="group relative bg-white dark:bg-slate-800 rounded-[24px] overflow-hidden border border-slate-200 dark:border-slate-700 cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all"
    >
      <div className="aspect-[3/4] overflow-hidden relative">
        <img 
          src={imageUrl} 
          alt={screenshot.filename}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          onLoad={() => !screenshot.imageUrl && URL.revokeObjectURL(imageUrl)}
        />
        
        {/* Hover Overlay */}
        <div className="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
          <button className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40 transition-colors">
            <Eye className="w-5 h-5" />
          </button>
          <button 
            onClick={onReanalyze}
            className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
          <button 
            onClick={onDelete}
            className="p-3 bg-red-500/20 backdrop-blur-md rounded-full text-white hover:bg-red-500/40 transition-colors"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {screenshot.isSensitive && (
          <div className="absolute top-3 right-3 bg-red-500/90 backdrop-blur-md text-white p-1.5 rounded-full shadow-lg">
            <Shield className="w-3.5 h-3.5" />
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            {screenshot.category}
          </span>
          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
            <Calendar className="w-3 h-3" />
            <span>{new Date(screenshot.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug mb-3">
          {screenshot.isAnalyzed ? screenshot.summary : 'Awaiting analysis...'}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {screenshot.tags.slice(0, 2).map((tag: string) => (
            <span key={tag} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-medium rounded-md">
              #{tag}
            </span>
          ))}
          {screenshot.tags.length > 2 && (
            <span className="text-[10px] text-slate-400 font-medium">+{screenshot.tags.length - 2}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
};
