import { createClient, User } from '@supabase/supabase-js';
import { useState, useEffect } from 'react';
import { buildApiUrl } from './api';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = !!supabaseUrl && !!supabaseAnonKey && supabaseAnonKey !== '';

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

export const useSupabaseAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Hard timeout: never block the UI more than 1.5 s waiting for Supabase
    const timeout = setTimeout(() => {
      setUser(null);
      setLoading(false);
    }, 1500);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(timeout);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
};

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
