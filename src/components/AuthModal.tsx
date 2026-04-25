import React, { useState } from 'react';
import { Sparkles, Loader2, LogIn, UserPlus, X } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMode?: 'login' | 'signup';
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, defaultMode = 'login' }) => {
  const [isLogin, setIsLogin] = useState(defaultMode === 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await signInWithEmail(email, password);
      } else {
        await signUpWithEmail(email, password);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      onClose(); // In reality, Google OAuth redirects the page
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google Auth failed.');
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm px-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md p-8 border border-black/10 bg-white rounded-2xl shadow-2xl relative"
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-muted hover:text-bone transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute -top-6 -left-6">
            <div className="relative group">
              <div className="w-12 h-12 bg-accent rounded-xl flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500 shadow-sm">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <div className="mb-10 mt-6 text-center">
            <h2 className="text-3xl font-sans font-bold leading-none tracking-tight mb-2">
              Welcome
            </h2>
            <p className="text-muted text-sm">
              {isLogin ? 'Log in to sync your visual archive.' : 'Create an account to start syncing.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: 'auto' }} 
                className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm font-medium text-center"
              >
                {error}
              </motion.div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block mb-1.5 text-sm font-semibold text-bone">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@domain.com"
                  required
                  className="w-full bg-black/5 border border-black/10 rounded-lg py-3 px-4 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-black/30 text-bone font-medium"
                />
              </div>
              <div>
                <label className="block mb-1.5 text-sm font-semibold text-bone">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-black/5 border border-black/10 rounded-lg py-3 px-4 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none transition-all placeholder:text-black/30 text-bone font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full accent-button py-3 mt-2 flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isLogin ? (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  Create Account
                </>
              )}
            </button>
          </form>

          <div className="mt-8 flex items-center gap-4">
            <div className="h-px bg-black/5 flex-1" />
            <span className="text-xs font-semibold text-muted">OR</span>
            <div className="h-px bg-black/5 flex-1" />
          </div>

          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="mt-6 w-full border border-black/10 bg-white hover:bg-black/5 rounded-lg py-3 flex items-center justify-center gap-3 transition-colors disabled:opacity-50 font-medium text-sm text-bone shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="mt-8 text-center">
            <button 
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError(null);
              }}
              className="text-xs font-semibold text-muted hover:text-bone transition-colors underline underline-offset-4"
            >
              {isLogin ? "Don't have an account? Sign up." : "Already have an account? Log in."}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
