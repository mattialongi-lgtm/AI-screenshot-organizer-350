import { createClient, User } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { buildApiUrl } from './api';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && supabaseAnonKey !== '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

type AuthState = {
  user: User | null;
  loading: boolean;
};

const authListeners = new Set<() => void>();
let authState: AuthState = {
  user: null,
  loading: isSupabaseConfigured,
};
let authBootstrapPromise: Promise<void> | null = null;
let authBootstrapStarted = false;
let initialSessionResolved = false;
let authRevision = 0;

const emitAuthState = () => {
  authListeners.forEach((listener) => listener());
};

const updateAuthState = (nextState: Partial<AuthState>) => {
  authState = {
    ...authState,
    ...nextState,
  };
  emitAuthState();
};

const ensureSupabaseAuthBootstrap = () => {
  if (authBootstrapStarted) {
    return authBootstrapPromise ?? Promise.resolve();
  }

  authBootstrapStarted = true;

  if (!isSupabaseConfigured) {
    updateAuthState({ user: null, loading: false });
    return Promise.resolve();
  }

  updateAuthState({ loading: true });

  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    authRevision += 1;
    updateAuthState({
      user: session?.user ?? null,
      loading: !initialSessionResolved,
    });
  });
  void subscription;

  authBootstrapPromise = (async () => {
    const revisionAtStart = authRevision;

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }

      if (authRevision === revisionAtStart) {
        updateAuthState({ user: data.session?.user ?? null });
      }
    } catch (error) {
      console.error('Failed to load initial Supabase session:', error);
      if (authRevision === revisionAtStart) {
        updateAuthState({ user: null });
      }
    } finally {
      initialSessionResolved = true;
      updateAuthState({ loading: false });
    }
  })();

  return authBootstrapPromise;
};

const subscribeToAuthState = (listener: () => void) => {
  authListeners.add(listener);
  void ensureSupabaseAuthBootstrap();

  return () => {
    authListeners.delete(listener);
  };
};

const getAuthSnapshot = () => authState;

export const useSupabaseAuth = () => useSyncExternalStore(
  subscribeToAuthState,
  getAuthSnapshot,
  getAuthSnapshot
);

export const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.access_token ?? null;
};

export const authenticatedFetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("No authenticated Supabase session found.");
  }

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  const requestUrl =
    typeof input === 'string'
      ? buildApiUrl(input)
      : input instanceof URL
        ? new URL(buildApiUrl(input.toString()))
        : input;

  return fetch(requestUrl, {
    ...init,
    headers,
  });
};

export const signInWithGoogle = async () => {
  if (!isSupabaseConfigured) {
    console.error("Supabase is not configured.");
    return null;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  });
  if (error) throw error;
  return data;
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });
  if (error) throw error;
  return data;
};

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
};
