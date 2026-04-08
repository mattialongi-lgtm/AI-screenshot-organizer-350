import React, { useState } from 'react';
import { Sparkles, Loader2, LogIn, UserPlus } from 'lucide-react';
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from '../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

export const LandingPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google Auth failed.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink text-bone font-sans selection:bg-accent selection:text-ink transition-colors duration-700 flex flex-col items-center justify-center relative overflow-hidden">
      <div className="grain-overlay" />
      
      {/* Decorative background elements */}
      <div className="absolute top-1/4 left-1/4 w-[40vw] h-[40vw] bg-accent/5 rounded-full blur-[120px] -z-10 mix-blend-screen" />
      <div className="absolute bottom-1/4 right-1/4 w-[30vw] h-[30vw] bg-white/5 rounded-full blur-[100px] -z-10 mix-blend-screen" />

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full max-w-md p-8 border border-white/10 bg-ink/40 backdrop-blur-2xl relative"
      >
        <div className="absolute -top-6 -left-6">
          <div className="relative group">
            <div className="w-12 h-12 bg-accent flex items-center justify-center rotate-3 group-hover:rotate-0 transition-transform duration-500">
              <Sparkles className="w-6 h-6 text-ink" />
            </div>
            <div className="absolute -inset-1 border border-accent/30 -z-10 group-hover:inset-0 transition-all" />
          </div>
        </div>

        <div className="mb-12 mt-4 text-center">
          <h1 className="text-4xl font-serif italic leading-none tracking-tight mb-2">
            Screen <span className="text-accent">.</span> Sort
          </h1>
          <p className="mono-label text-muted/80">Intelligent Visual Archive</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }} 
              className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-mono text-center"
            >
              {error}
            </motion.div>
          )}

          <div className="space-y-4">
            <div>
              <label className="mono-label block mb-2 text-xs opacity-70">Email Access</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operative@domain.com"
                required
                className="w-full bg-black/20 border border-white/10 py-3 px-4 text-sm focus:border-accent focus:ring-0 transition-all placeholder:text-white/20"
              />
            </div>
            <div>
              <label className="mono-label block mb-2 text-xs opacity-70">Passphrase</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-black/20 border border-white/10 py-3 px-4 text-sm focus:border-accent focus:ring-0 transition-all placeholder:text-white/20"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full accent-button py-4 flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isLogin ? (
              <>
                <LogIn className="w-4 h-4" />
                Initialize Link
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                Create Archive
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex items-center gap-4">
          <div className="h-px bg-white/10 flex-1" />
          <span className="mono-label text-[10px] text-muted">OR</span>
          <div className="h-px bg-white/10 flex-1" />
        </div>

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="mt-8 w-full border border-white/10 bg-white/5 hover:bg-white/10 py-4 flex items-center justify-center gap-3 transition-colors disabled:opacity-50"
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
          <span className="mono-label text-xs">Continue with Google</span>
        </button>

        <div className="mt-8 text-center">
          <button 
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
            className="text-xs text-muted hover:text-white transition-colors underline decoration-white/20 underline-offset-4"
          >
            {isLogin ? "Need a new archive? Create one." : "Already have an archive? Link now."}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
