/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { 
  LayoutGrid, 
  MessageCircle, 
  Receipt, 
  Share2, 
  Mail, 
  FileText, 
  Smile, 
  CreditCard, 
  ShoppingBag, 
  Calendar,
  Link as LinkIcon,
  DollarSign
} from 'lucide-react';
import { Category } from '../types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

const CATEGORIES: { label: Category | 'All', icon: any }[] = [
  { label: 'All', icon: LayoutGrid },
  { label: 'Chat', icon: MessageCircle },
  { label: 'Receipt', icon: Receipt },
  { label: 'Social Media', icon: Share2 },
  { label: 'Email', icon: Mail },
  { label: 'Document', icon: FileText },
  { label: 'Meme', icon: Smile },
  { label: 'Banking', icon: CreditCard },
  { label: 'E-commerce', icon: ShoppingBag },
  { label: 'Booking', icon: Calendar },
];

interface FiltersProps {
  activeCategory: Category | 'All';
  onCategoryChange: (cat: Category | 'All') => void;
  hasAmount: boolean;
  setHasAmount: (val: boolean) => void;
  hasUrl: boolean;
  setHasUrl: (val: boolean) => void;
}

export const Filters: React.FC<FiltersProps> = ({ 
  activeCategory, 
  onCategoryChange,
  hasAmount,
  setHasAmount,
  hasUrl,
  setHasUrl
}) => {
  return (
    <div className="space-y-12">
      <div className="flex flex-col gap-2">
        {CATEGORIES.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => onCategoryChange(label)}
            className={cn(
              "flex items-center justify-between px-4 py-3 transition-all group border-l-2",
              activeCategory === label 
                ? "border-accent bg-accent/5 text-bone" 
                : "border-white/5 text-muted hover:border-white/20 hover:text-bone"
            )}
          >
            <div className="flex items-center gap-4">
              <Icon className={cn("w-4 h-4 transition-colors", activeCategory === label ? "text-accent" : "text-muted group-hover:text-bone")} />
              <span className="mono-label text-[11px] group-hover:text-bone transition-colors">{label}</span>
            </div>
            {activeCategory === label && (
              <div className="w-1 h-1 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <h4 className="mono-label text-[10px] px-4">Attributes</h4>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setHasAmount(!hasAmount)}
            className={cn(
              "flex items-center gap-4 px-4 py-3 transition-all border border-white/5",
              hasAmount 
                ? "bg-accent text-ink border-accent" 
                : "text-muted hover:border-white/20 hover:text-bone"
            )}
          >
            <DollarSign className="w-4 h-4" />
            <span className="mono-label text-[10px] text-inherit">Financial Data</span>
          </button>
          <button
            onClick={() => setHasUrl(!hasUrl)}
            className={cn(
              "flex items-center gap-4 px-4 py-3 transition-all border border-white/5",
              hasUrl 
                ? "bg-accent text-ink border-accent" 
                : "text-muted hover:border-white/20 hover:text-bone"
            )}
          >
            <LinkIcon className="w-4 h-4" />
            <span className="mono-label text-[10px] text-inherit">Hyperlinks</span>
          </button>
        </div>
      </div>
    </div>
  );
};
