/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface UploadDropzoneProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onUpload, isUploading }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    onUpload(acceptedFiles);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    disabled: isUploading,
  });

  return (
    <div 
      {...getRootProps()} 
      className={`
        relative w-full h-48 border-2 border-dashed rounded-3xl flex flex-col items-center justify-center transition-all cursor-pointer
        ${isDragActive ? 'border-indigo-500 bg-indigo-500/5' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-indigo-500 hover:bg-indigo-500/5'}
      `}
    >
      <input {...getInputProps()} />
      <div className="relative mb-4">
        <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center">
          <Upload className={`w-8 h-8 ${isDragActive ? 'text-indigo-600' : 'text-slate-400'}`} />
        </div>
        {isUploading && (
          <div className="absolute -top-2 -right-2">
            <Sparkles className="w-6 h-6 text-indigo-500 animate-pulse" />
          </div>
        )}
      </div>
      <div className="text-center px-6">
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {isUploading ? 'AI is analyzing...' : isDragActive ? 'Drop your screenshots here' : 'Click or drag screenshots to upload'}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Supported formats: PNG, JPG, WEBP
        </p>
      </div>
    </div>
  );
};
