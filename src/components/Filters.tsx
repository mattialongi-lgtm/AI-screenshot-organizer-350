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
              "flex items-center justify-between px-4 py-3 transition-all group border-2 rounded-xl mb-2",
              activeCategory === label 
                ? "border-accent bg-white shadow-sm text-bone" 
                : "border-transparent bg-transparent text-muted hover:border-black/5 hover:bg-white hover:text-bone hover:shadow-sm"
            )}
          >
            <div className="flex items-center gap-4">
              <Icon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", activeCategory === label ? "text-accent" : "text-black/60 group-hover:text-bone")} />
              <span className={cn("font-sans font-extrabold text-sm transition-colors tracking-tight", activeCategory === label ? "text-bone" : "text-black/60 group-hover:text-bone")}>
                {label}
              </span>
            </div>
            {activeCategory === label && (
              <div className="w-1 h-1 bg-accent rounded-full" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <h4 className="mono-label text-[11px] px-4 font-bold tracking-widest text-black/40 mb-3">Attributes</h4>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => setHasAmount(!hasAmount)}
            className={cn(
              "flex items-center gap-4 px-4 py-3.5 transition-all border-2 rounded-xl group",
              hasAmount 
                ? "bg-accent/10 text-accent border-accent/20 shadow-sm" 
                : "border-transparent text-black/60 hover:border-black/5 hover:bg-white hover:text-bone hover:shadow-sm"
            )}
          >
            <DollarSign className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", hasAmount ? "text-accent" : "")} />
            <span className="font-sans font-extrabold text-sm tracking-tight text-inherit">Financial Data</span>
          </button>
          <button
            onClick={() => setHasUrl(!hasUrl)}
            className={cn(
              "flex items-center gap-4 px-4 py-3.5 transition-all border-2 rounded-xl group",
              hasUrl 
                ? "bg-accent/10 text-accent border-accent/20 shadow-sm" 
                : "border-transparent text-black/60 hover:border-black/5 hover:bg-white hover:text-bone hover:shadow-sm"
            )}
          >
            <LinkIcon className={cn("w-5 h-5 transition-transform duration-300 group-hover:scale-110", hasUrl ? "text-accent" : "")} />
            <span className="font-sans font-extrabold text-sm tracking-tight text-inherit">Hyperlinks</span>
          </button>
        </div>
      </div>
    </div>
  );
};
