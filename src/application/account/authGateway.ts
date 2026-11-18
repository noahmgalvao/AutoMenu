export interface AuthSession {
  user: { id: string; email?: string };
}

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  workspaceName: string;
}

export interface AuthGateway {
  isConfigured(): boolean;
  getInitialSession(): Promise<AuthSession | null>;
  subscribeToAuth(callback: (session: AuthSession | null) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(input: SignUpInput): Promise<void>;
  signOutCurrentUser(): Promise<void>;
  sendPasswordReauthentication(): Promise<void>;
  updatePasswordWithNonce(password: string, nonce: string): Promise<void>;
}
