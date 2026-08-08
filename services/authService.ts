import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  workspaceName: string;
}

export const getInitialSession = async (): Promise<Session | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
};

export const onSupabaseAuthChange = (callback: (session: Session | null) => void) => {
  const supabase = getSupabaseClient();

  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
};

export const sendPasswordReauthentication = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.reauthenticate();

  if (error) throw error;
};

export const updatePasswordWithNonce = async (password: string, nonce: string) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.updateUser({ password, nonce });

  if (error) throw error;
};

export const signInWithEmail = async (email: string, password: string) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }
};

export const signUpWithEmail = async ({ email, password, fullName, workspaceName }: SignUpPayload) => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        workspace_name: workspaceName,
      },
    },
  });

  if (error) {
    throw error;
  }
};

export const signOutCurrentUser = async () => {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }
};
