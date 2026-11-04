import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = () => Boolean(supabaseUrl && supabaseKey);

export const getSupabaseConfigError = () => {
  if (supabaseUrl && supabaseKey) {
    return null;
  }

  return 'A configuração do serviço de dados está incompleta.';
};

export const getSupabaseClient = () => {
  if (!isSupabaseConfigured()) {
    throw new Error(getSupabaseConfigError() || 'Serviço de dados não configurado.');
  }

  if (!client) {
    client = createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }

  return client;
};
