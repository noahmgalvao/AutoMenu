import type { AuthSession, SignUpInput } from '../../application/account/authGateway';
import { getSupabaseClient } from './client';

export const getInitialSession = async (): Promise<AuthSession | null> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session;
};

export const subscribeToAuth = (callback: (session: AuthSession | null) => void) => {
  const supabase = getSupabaseClient();

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => data.subscription.unsubscribe();
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

export const signUpWithEmail = async ({ email, password, fullName, workspaceName }: SignUpInput) => {
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
