import { lockModalScrolling } from '../common/modalScroll';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, X } from 'lucide-react';
import type { Profile, Workspace } from '../../domain/workspace/model';
import { getErrorMessage } from '../../application/errorMessages';

interface SettingsModalProps {
  open: boolean;
  profile: Profile;
  workspace: Workspace;
  email: string;
  saving: boolean;
  onClose: () => void;
  onSave: (values: { fullName: string; workspaceName: string }) => Promise<void>;
  onRequestPasswordReset: () => Promise<void>;
  onUpdatePassword: (password: string, nonce: string) => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 600;

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  profile,
  workspace,
  email,
  saving,
  onClose,
  onSave,
  onRequestPasswordReset,
  onUpdatePassword,
}) => {
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingPasswordEmail, setSendingPasswordEmail] = useState(false);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [passwordNonce, setPasswordNonce] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const savedAccountSignatureRef = useRef('');
  const saveAccountIfChanged = useCallback(async () => {
    const signature = JSON.stringify({ fullName, workspaceName });
    if (signature === savedAccountSignatureRef.current || !fullName.trim() || !workspaceName.trim()) return;
    savedAccountSignatureRef.current = signature;
    setMessage(null);
    setError(null);
    try {
      await onSave({ fullName, workspaceName });
      setMessage('Alterações salvas automaticamente.');
    } catch (saveError) {
      setError(getErrorMessage(saveError, 'Falha ao salvar configurações.'));
    }
  }, [fullName, onSave, workspaceName]);

  useEffect(() => {
    if (!open) return;
    setFullName(profile.fullName || '');
    setWorkspaceName(workspace.name);
    savedAccountSignatureRef.current = JSON.stringify({
      fullName: profile.fullName || '',
      workspaceName: workspace.name,
    });
    setMessage(null);
    setError(null);
    setShowPasswordVerification(false);
    setPasswordNonce('');
    setNewPassword('');
    setPasswordConfirmation('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void saveAccountIfChanged(), AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [open, saveAccountIfChanged]);

  if (!open) return null;

  const closeAndSave = () => {
    void saveAccountIfChanged();
    onClose();
  };

  const requestPasswordReset = async () => {
    setSendingPasswordEmail(true);
    setMessage(null);
    setError(null);
    try {
      await onRequestPasswordReset();
      setShowPasswordVerification(true);
      setMessage('Código de verificação enviado para o seu e-mail.');
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Falha ao enviar o e-mail.'));
    } finally {
      setSendingPasswordEmail(false);
    }
  };

  const updatePassword = async () => {
    setMessage(null);
    setError(null);
    if (!/^\d{6}$/.test(passwordNonce)) {
      setError('Digite o código de verificação com 6 números.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Use uma senha com pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setError('As senhas não coincidem.');
      return;
    }

    setUpdatingPassword(true);
    try {
      await onUpdatePassword(newPassword, passwordNonce);
      setShowPasswordVerification(false);
      setPasswordNonce('');
      setNewPassword('');
      setPasswordConfirmation('');
      setMessage('Senha alterada com segurança.');
    } catch (passwordError) {
      setError(getErrorMessage(passwordError, 'Falha ao alterar a senha.'));
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div ref={lockModalScrolling} className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onClick={closeAndSave}>
      <div role="dialog" aria-label="Configurações" data-settings-dialog
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
        onContextMenu={event => { if ((event.target as Element).closest('button')) event.preventDefault(); }}>
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-2 sm:px-6">
          <h2 className="text-lg font-bold text-slate-900">Configurações</h2>
          <button type="button" onClick={closeAndSave} aria-label="Fechar configurações"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <form onSubmit={event => event.preventDefault()} className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-y-contain p-4 sm:p-6">
            <div className="space-y-5">
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Nome do responsável
                <input value={fullName} onChange={(event) => setFullName(event.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-slate-700">
                Nome do restaurante
                <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
              </label>
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 font-semibold text-slate-800"><KeyRound size={17} /> Alterar senha</div>
                <p className="mt-1 text-sm text-slate-500">A verificação será enviada para {email}.</p>
                <button type="button" onClick={() => void requestPasswordReset()} disabled={sendingPasswordEmail || saving} className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {sendingPasswordEmail && <Loader2 size={15} className="animate-spin" />}
                  Enviar verificação por e-mail
                </button>
                {showPasswordVerification && (
                  <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                    <input value={passwordNonce} onChange={(event) => setPasswordNonce(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} inputMode="numeric" autoComplete="one-time-code" placeholder="Código de 6 números" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
                    <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }} minLength={8} autoComplete="new-password" placeholder="Nova senha" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
                    <input type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void updatePassword(); } }} minLength={8} autoComplete="new-password" placeholder="Confirmar nova senha" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-200" />
                    <button type="button" onClick={() => void updatePassword()} disabled={updatingPassword} className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                      {updatingPassword && <Loader2 size={15} className="animate-spin" />} Confirmar nova senha
                    </button>
                  </div>
                )}
              </div>
            </div>
          {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        </form>
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 px-4 py-2 sm:px-6">
          {saving && <span className="flex items-center gap-2 text-xs font-medium text-slate-500"><Loader2 size={14} className="animate-spin" /> Salvando</span>}
          <button type="button" onClick={closeAndSave} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fechar</button>
        </footer>
      </div>
    </div>
  );
};
