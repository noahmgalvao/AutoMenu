import React, { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, RotateCcw, ShieldCheck, UserRound, X } from 'lucide-react';
import {
  DEFAULT_FONT_SIZE_LIMITS,
  DEFAULT_MENU_CONTENT_SPACING,
  DEFAULT_MENU_MARGINS,
  DEFAULT_MINIMUM_FONT_SIZE,
} from '../constants';
import type {
  FontSizeLimitKey,
  FontSizeLimits,
  MenuContentSpacing,
  MenuMargins,
  MenuStyle,
  Profile,
  Workspace,
} from '../types';
import {
  resolveFontSizeLimits,
  resolveMenuContentSpacing,
  resolveMenuMargins,
  resolveMinimumFontSize,
} from '../utils/styleRules';

interface SettingsModalProps {
  open: boolean;
  profile: Profile;
  workspace: Workspace;
  menuStyle: MenuStyle;
  email: string;
  saving: boolean;
  onClose: () => void;
  onSave: (values: {
    fullName: string;
    workspaceName: string;
    splitCategoryAcrossPages: boolean;
    productsCanChangeCategory: boolean;
    minimumFontSize: number;
    allowSameWordBreak: boolean;
    fontSizeLimits: FontSizeLimits;
    margins: MenuMargins;
    contentSpacing: MenuContentSpacing;
  }, section: 'account' | 'rules') => Promise<void>;
  onRequestPasswordReset: () => Promise<void>;
  onUpdatePassword: (password: string, nonce: string) => Promise<void>;
}

const AUTO_SAVE_DELAY_MS = 600;

const RuleGroup = <T extends object>({
  title,
  rows,
  values,
  min = 0,
  max,
  onChange,
  headerContent,
}: {
  title: string;
  rows: Array<[keyof T & string, string]>;
  values: T;
  min?: number;
  max: number;
  onChange: (key: keyof T & string, value: number) => void;
  headerContent?: React.ReactNode;
}) => (
  <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="mb-3 text-sm font-bold text-slate-800">{title}</h3>
    {headerContent}
    <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
      {rows.map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>{label}</span>
          <input
            type="number"
            min={min}
            max={max}
            value={Number(values[key])}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (Number.isFinite(parsed)) onChange(key, Math.min(max, Math.max(min, parsed)));
            }}
            className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      ))}
    </div>
  </section>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  profile,
  workspace,
  menuStyle,
  email,
  saving,
  onClose,
  onSave,
  onRequestPasswordReset,
  onUpdatePassword,
}) => {
  const [section, setSection] = useState<'account' | 'rules'>('account');
  const [fullName, setFullName] = useState(profile.fullName || '');
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [splitCategoryAcrossPages, setSplitCategoryAcrossPages] = useState(
    workspace.settings.splitCategoryAcrossPages
  );
  const [productsCanChangeCategory, setProductsCanChangeCategory] = useState(
    workspace.settings.productsCanChangeCategory ?? false
  );
  const [minimumFontSize, setMinimumFontSize] = useState(() => resolveMinimumFontSize(menuStyle));
  const [allowSameWordBreak, setAllowSameWordBreak] = useState(menuStyle.allowSameWordBreak === true);
  const [fontSizeLimits, setFontSizeLimits] = useState(() => resolveFontSizeLimits(menuStyle));
  const [margins, setMargins] = useState(() => resolveMenuMargins(menuStyle));
  const [contentSpacing, setContentSpacing] = useState(() => resolveMenuContentSpacing(menuStyle));
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingPasswordEmail, setSendingPasswordEmail] = useState(false);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [passwordNonce, setPasswordNonce] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const savedAccountSignatureRef = useRef('');
  const savedRulesSignatureRef = useRef('');

  const getValues = useCallback(() => ({
    fullName,
    workspaceName,
    splitCategoryAcrossPages,
    productsCanChangeCategory,
    minimumFontSize,
    allowSameWordBreak,
    fontSizeLimits,
    margins,
    contentSpacing,
  }), [
    allowSameWordBreak,
    contentSpacing,
    fontSizeLimits,
    fullName,
    margins,
    minimumFontSize,
    productsCanChangeCategory,
    splitCategoryAcrossPages,
    workspaceName,
  ]);

  const saveAccountIfChanged = useCallback(async () => {
    const signature = JSON.stringify({ fullName, workspaceName });
    if (signature === savedAccountSignatureRef.current || !fullName.trim() || !workspaceName.trim()) return;
    savedAccountSignatureRef.current = signature;
    setMessage(null);
    setError(null);
    try {
      await onSave(getValues(), 'account');
      setMessage('Alterações salvas automaticamente.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar configurações.');
    }
  }, [fullName, getValues, onSave, workspaceName]);

  const saveRulesIfChanged = useCallback(async () => {
    const signature = JSON.stringify({
      splitCategoryAcrossPages,
      productsCanChangeCategory,
      minimumFontSize,
      allowSameWordBreak,
      fontSizeLimits,
      margins,
      contentSpacing,
    });
    if (signature === savedRulesSignatureRef.current) return;
    savedRulesSignatureRef.current = signature;
    setMessage(null);
    setError(null);
    try {
      await onSave(getValues(), 'rules');
      setMessage('Alterações salvas automaticamente.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Falha ao salvar configurações.');
    }
  }, [
    allowSameWordBreak,
    contentSpacing,
    fontSizeLimits,
    getValues,
    margins,
    minimumFontSize,
    onSave,
    productsCanChangeCategory,
    splitCategoryAcrossPages,
  ]);

  useEffect(() => {
    if (!open) return;
    const nextMinimumFontSize = resolveMinimumFontSize(menuStyle);
    const nextAllowSameWordBreak = menuStyle.allowSameWordBreak === true;
    const nextFontSizeLimits = resolveFontSizeLimits(menuStyle);
    const nextMargins = resolveMenuMargins(menuStyle);
    const nextContentSpacing = resolveMenuContentSpacing(menuStyle);
    setFullName(profile.fullName || '');
    setWorkspaceName(workspace.name);
    setSplitCategoryAcrossPages(workspace.settings.splitCategoryAcrossPages);
    setProductsCanChangeCategory(workspace.settings.productsCanChangeCategory ?? false);
    setMinimumFontSize(nextMinimumFontSize);
    setAllowSameWordBreak(nextAllowSameWordBreak);
    setFontSizeLimits(nextFontSizeLimits);
    setMargins(nextMargins);
    setContentSpacing(nextContentSpacing);
    savedAccountSignatureRef.current = JSON.stringify({
      fullName: profile.fullName || '',
      workspaceName: workspace.name,
    });
    savedRulesSignatureRef.current = JSON.stringify({
      splitCategoryAcrossPages: workspace.settings.splitCategoryAcrossPages,
      productsCanChangeCategory: workspace.settings.productsCanChangeCategory ?? false,
      minimumFontSize: nextMinimumFontSize,
      allowSameWordBreak: nextAllowSameWordBreak,
      fontSizeLimits: nextFontSizeLimits,
      margins: nextMargins,
      contentSpacing: nextContentSpacing,
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

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => void saveRulesIfChanged(), AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [open, saveRulesIfChanged]);

  if (!open) return null;

  const closeAndSave = () => {
    void saveAccountIfChanged();
    void saveRulesIfChanged();
    onClose();
  };

  const resetRules = () => {
    setSplitCategoryAcrossPages(false);
    setProductsCanChangeCategory(false);
    setMinimumFontSize(DEFAULT_MINIMUM_FONT_SIZE);
    setAllowSameWordBreak(false);
    setFontSizeLimits({ ...DEFAULT_FONT_SIZE_LIMITS });
    setMargins({ ...DEFAULT_MENU_MARGINS });
    setContentSpacing({ ...DEFAULT_MENU_CONTENT_SPACING });
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
      setError(requestError instanceof Error ? requestError.message : 'Falha ao enviar o e-mail.');
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
      setError(passwordError instanceof Error ? passwordError.message : 'Falha ao alterar a senha.');
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onPointerDown={closeAndSave}>
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:flex-row" onPointerDown={(event) => event.stopPropagation()}>
        <aside className="w-full shrink-0 border-b border-slate-200 bg-slate-50 p-3 sm:w-44 sm:border-b-0 sm:border-r">
          <div className="mb-3 px-2 text-sm font-bold text-slate-900">Configurações</div>
          <button type="button" onClick={() => setSection('account')} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${section === 'account' ? 'bg-indigo-100 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white'}`}>
            <UserRound size={16} /> Minha Conta
          </button>
          <button type="button" onClick={() => setSection('rules')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${section === 'rules' ? 'bg-indigo-100 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-white'}`}>
            <ShieldCheck size={16} /> Regras Gerais
          </button>
        </aside>

        <form onSubmit={(event) => event.preventDefault()} className="min-w-0 flex-1 overflow-y-auto p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">{section === 'account' ? 'Minha Conta' : 'Regras Gerais'}</h2>
            <button type="button" onClick={closeAndSave} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
          </div>

          {section === 'account' ? (
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
          ) : (
            <div className="space-y-4">
              <RuleGroup
                title="Limite de tamanho das fontes"
                rows={[
                  ['menuTitle', 'Título'],
                  ['menuSubtitle', 'Subtítulo'],
                  ['category', 'Nome das categorias'],
                  ['productName', 'Nome dos produtos'],
                  ['productPrice', 'Preço dos produtos'],
                  ['productDescription', 'Descrições dos produtos'],
                  ['freeText', 'Texto livre'],
                ]}
                values={fontSizeLimits}
                min={minimumFontSize}
                max={300}
                headerContent={(
                  <label className="mb-3 flex items-center justify-between gap-3 border-b border-slate-200 pb-3 text-sm font-semibold text-slate-700">
                    <span>Mínimo geral</span>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={minimumFontSize}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        if (!Number.isFinite(parsed)) return;
                        const value = Math.min(300, Math.max(1, parsed));
                        setMinimumFontSize(value);
                        setFontSizeLimits((previous) => ({
                          menuTitle: Math.max(value, previous.menuTitle),
                          menuSubtitle: Math.max(value, previous.menuSubtitle),
                          category: Math.max(value, previous.category),
                          productName: Math.max(value, previous.productName),
                          productPrice: Math.max(value, previous.productPrice),
                          productDescription: Math.max(value, previous.productDescription),
                          freeText: Math.max(value, previous.freeText),
                        }));
                      }}
                      className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-right text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </label>
                )}
                onChange={(key, value) => setFontSizeLimits((previous) => ({
                  ...previous,
                  [key as FontSizeLimitKey]: value,
                }))}
              />

              <RuleGroup
                title="Margens"
                rows={[
                  ['top', 'Superior'],
                  ['bottom', 'Inferior'],
                  ['left', 'Esquerda'],
                  ['right', 'Direita'],
                  ['columnGap', 'Entre colunas'],
                ]}
                values={margins}
                max={300}
                onChange={(key, value) => setMargins((previous) => ({ ...previous, [key]: value }))}
              />

              <RuleGroup
                title="Espaçamentos"
                rows={[
                  ['headerToContent', 'Cabeçalho → primeira categoria'],
                  ['categoryToProduct', 'Categoria → produto'],
                  ['productNameToDescription', 'Produto → descrição'],
                  ['betweenProducts', 'Entre produtos'],
                  ['productNameToPrice', 'Nome → preço (horizontal)'],
                ]}
                values={contentSpacing}
                max={200}
                onChange={(key, value) => setContentSpacing((previous) => ({ ...previous, [key]: value }))}
              />

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                <input type="checkbox" checked={splitCategoryAcrossPages} onChange={(event) => setSplitCategoryAcrossPages(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                <span>
                  <span className="block font-semibold text-slate-800">Quebra de página entre produtos da mesma categoria</span>
                  <span className="mt-1 block text-sm text-slate-500">Permite continuar os produtos da categoria na página seguinte quando não houver espaço.</span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
                <input type="checkbox" checked={allowSameWordBreak} onChange={(event) => setAllowSameWordBreak(event.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600" />
                <span>
                  <span className="block font-semibold text-slate-800">Permitir quebra de linha na mesma palavra</span>
                  <span className="mt-1 block text-sm text-slate-500">Ex.: permitir “HAMBU” / “RGUER” em duas linhas. Desativado, o texto reduz até o mínimo.</span>
                </span>
              </label>

              <button
                type="button"
                onClick={resetRules}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <RotateCcw size={16} /> Redefinir regras ao padrão
              </button>
            </div>
          )}

          {message && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}
          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
            {saving && <span className="flex items-center gap-2 text-xs font-medium text-slate-500"><Loader2 size={14} className="animate-spin" /> Salvando</span>}
            <button type="button" onClick={closeAndSave} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Fechar</button>
          </div>
        </form>
      </div>
    </div>
  );
};
