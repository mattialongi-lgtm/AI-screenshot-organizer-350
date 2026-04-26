/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { MANUAL_UPLOAD_BATCH_LIMIT } from '../shared/uploadLimits';

interface UploadDropzoneProps {
  onUpload: (files: File[]) => void;
  isUploading: boolean;
}

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({ onUpload, isUploading }) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > MANUAL_UPLOAD_BATCH_LIMIT) {
      alert(`Batch limit exceeded: You can only upload a maximum of ${MANUAL_UPLOAD_BATCH_LIMIT} screenshots at once. Processing the first ${MANUAL_UPLOAD_BATCH_LIMIT}.`);
      onUpload(acceptedFiles.slice(0, MANUAL_UPLOAD_BATCH_LIMIT));
    } else {
      onUpload(acceptedFiles);
    }
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
        relative w-full h-[250px] border-2 rounded-[var(--radius-editorial)] border-dashed flex flex-col items-center justify-center transition-all duration-300 cursor-pointer group bg-white shadow-sm hover:shadow-md
        ${isDragActive ? 'border-accent bg-accent/5' : 'border-black/10'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : 'hover:border-black/30 hover:bg-black/[0.02]'}
      `}
    >
      <input {...getInputProps()} />
      
      <div className="relative mb-6">
        <div className="w-16 h-16 border border-black/10 bg-black/5 rounded-2xl flex items-center justify-center rotate-12 group-hover:rotate-0 transition-transform duration-500 shadow-sm">
          <Upload className={`w-6 h-6 transition-transform duration-500 ${isDragActive ? 'text-accent scale-110' : 'text-bone'}`} />
        </div>
        {isUploading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="scan-line !h-0.5" />
          </div>
        )}
      </div>

      <div className="text-center px-8 space-y-2">
        <p className="font-sans font-bold text-base text-bone tracking-tight">
          {isUploading ? 'Analyzing Specimen...' : isDragActive ? 'Release to Ingest' : 'Click or Drag to Upload'}
        </p>
        <p className="font-sans font-medium text-xs text-muted">
          Supports PNG, JPG, WEBP formats.
        </p>
      </div>

      {/* Corner Accents - Remove or adapt to light theme */}
      <div className="absolute top-2 left-2 w-2 h-2 border-t-2 border-l-2 border-black/10 rounded-tl-sm opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute top-2 right-2 w-2 h-2 border-t-2 border-r-2 border-black/10 rounded-tr-sm opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-2 left-2 w-2 h-2 border-b-2 border-l-2 border-black/10 rounded-bl-sm opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="absolute bottom-2 right-2 w-2 h-2 border-b-2 border-r-2 border-black/10 rounded-br-sm opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  );
};
