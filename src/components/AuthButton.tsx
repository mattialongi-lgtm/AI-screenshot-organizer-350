/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, LogOut, LogIn } from 'lucide-react';
import { auth, signInWithGoogle, logout } from '../lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';

export const AuthButton: React.FC = () => {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return (
      <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden md:block text-right">
          <p className="text-xs font-bold text-slate-900 dark:text-white">{user.displayName}</p>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Cloud Sync Active</p>
        </div>
        <div className="relative group">
          <img 
            src={user.photoURL || ''} 
            alt={user.displayName || ''} 
            className="w-10 h-10 rounded-xl border-2 border-indigo-500/20"
          />
          <button 
            onClick={logout}
            className="absolute -bottom-1 -right-1 p-1 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
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
      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </button>
  );
};
