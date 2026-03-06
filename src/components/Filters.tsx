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
    <div className="space-y-6">
      <div className="flex items-center gap-3 overflow-x-auto pb-4 no-scrollbar">
        {CATEGORIES.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => onCategoryChange(label)}
            className={cn(
              "flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border-2",
              activeCategory === label 
                ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20 scale-105 z-10" 
                : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10"
            )}
          >
            <Icon className={cn("w-4 h-4", activeCategory === label ? "text-white" : "text-slate-400")} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={() => setHasAmount(!hasAmount)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
            hasAmount 
              ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400" 
              : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500"
          )}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Has Amount
        </button>
        <button
          onClick={() => setHasUrl(!hasUrl)}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border",
            hasUrl 
              ? "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400" 
              : "bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500"
          )}
        >
          <LinkIcon className="w-3.5 h-3.5" />
          Has URL
        </button>
      </div>
    </div>
  );
};
