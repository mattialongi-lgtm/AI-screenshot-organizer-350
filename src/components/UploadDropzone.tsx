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
        relative w-full h-56 border border-dashed flex flex-col items-center justify-center transition-all duration-500 cursor-pointer group
        ${isDragActive ? 'border-accent bg-accent/5' : 'border-white/10 bg-white/[0.02]'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-white/30 hover:bg-white/[0.04]'}
      `}
    >
      <input {...getInputProps()} />
      
      <div className="relative mb-6">
        <div className="w-16 h-16 border border-white/10 flex items-center justify-center rotate-45 group-hover:rotate-0 transition-transform duration-700">
          <Upload className={`w-6 h-6 -rotate-45 group-hover:rotate-0 transition-transform duration-700 ${isDragActive ? 'text-accent' : 'text-muted'}`} />
        </div>
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="scan-line !h-0.5" />
          </div>
        )}
      </div>

      <div className="text-center px-8 space-y-2">
        <p className="mono-label text-[10px] text-bone">
          {isUploading ? 'Analyzing Specimen' : isDragActive ? 'Release to Ingest' : 'Click or Drag to Ingest'}
        </p>
        <p className="mono-label text-[8px] opacity-50">
          Formats: PNG, JPG, WEBP
        </p>
      </div>

      {/* Corner Accents */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/20" />
      <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/20" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/20" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/20" />
    </div>
  );
};
