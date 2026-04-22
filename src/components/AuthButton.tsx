/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User as UserIcon, LogOut, LogIn } from 'lucide-react';
import { signInWithGoogle, logout, useSupabaseAuth } from '../lib/supabase';

export const AuthButton: React.FC = () => {
  const { user, loading } = useSupabaseAuth();

  if (loading) {
    return (
      <div className="w-10 h-10 border border-white/10 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    const displayName = user.user_metadata?.full_name || user.email;
    const photoURL = user.user_metadata?.avatar_url;

    return (
      <div className="flex items-center gap-4">
        <div className="hidden md:block text-right">
          <p className="text-xs font-serif italic text-bone">{displayName}</p>
          <p className="mono-label text-[8px] opacity-50">Archive Linked</p>
        </div>
        <div className="relative group">
          {photoURL ? (
            <img 
              src={photoURL} 
              alt={displayName || ''} 
              className="w-10 h-10 border border-white/10 grayscale hover:grayscale-0 transition-all"
            />
          ) : (
            <div className="w-10 h-10 border border-white/10 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-muted" />
            </div>
          )}
          <button 
            onClick={logout}
            className="absolute -bottom-1 -right-1 p-1 bg-accent text-ink opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
            title="Logout"
          >
            <LogOut className="w-3 h-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <button 
      onClick={signInWithGoogle}
      className="accent-button flex items-center gap-3"
    >
      <LogIn className="w-4 h-4" />
      Initialize Link
    </button>
  );
};
