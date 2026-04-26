process.env.VITEST = "true";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

// Required by server.ts module load — values are test-only fakes.
process.env.VITE_SUPABASE_URL ||= "https://test.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ||= "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.GOOGLE_OAUTH_STATE_SECRET ||= "test-oauth-state-secret";
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ||= "0123456789abcdef0123456789abcdef";
process.env.OPENAI_API_KEY ||= "test-openai-key";
