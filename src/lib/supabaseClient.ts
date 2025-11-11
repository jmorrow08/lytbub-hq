import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Log environment variable status for debugging
console.log('🔧 Supabase Client Init:', {
  url: supabaseUrl ? `✅ ${supabaseUrl.substring(0, 30)}...` : '❌ Missing NEXT_PUBLIC_SUPABASE_URL',
  anonKey: supabaseAnonKey ? `✅ ${supabaseAnonKey.substring(0, 20)}...` : '❌ Missing NEXT_PUBLIC_SUPABASE_ANON_KEY',
});

// Handle missing environment variables gracefully during build
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);
