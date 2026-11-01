import React from 'react';
import { FileText, Globe2, Loader2, Send, X } from 'lucide-react';
import { loadUserPreferences, saveUserPreferences } from '../utils/userPreferences';

interface PublishModalProps {
  open: boolean;
  loading?: boolean;
  preferenceKey: string;
  onClose: () => void;
  onConfirm: (options: { pdf: boolean; virtualLink: boolean }) => void;
}

const Choice: React.FC<{
  checked: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, icon, title, description, onChange }) => (
  <label className={`flex items-start gap-3 rounded-2xl border p-4 cursor-pointer transition-colors ${checked ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
    <span className={checked ? 'text-indigo-600' : 'text-slate-500'}>{icon}</span>
    <span className="min-w-0">
      <span className="block text-sm font-bold text-slate-800">{title}</span>
      <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
    </span>
  </label>
);

const DEFAULT_PREFERENCES = { pdf: true, virtualLink: true };

export const PublishModal: React.FC<PublishModalProps> = ({ open, loading = false, preferenceKey, onClose, onConfirm }) => {
  const [pdf, setPdf] = React.useState(true);
  const [virtualLink, setVirtualLink] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    const preferences = loadUserPreferences(preferenceKey, DEFAULT_PREFERENCES);
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
  }, [open, preferenceKey]);

  const updatePreferences = (preferences: { pdf: boolean; virtualLink: boolean }) => {
    setPdf(preferences.pdf);
    setVirtualLink(preferences.virtualLink);
    saveUserPreferences(preferenceKey, preferences);
  };

  if (!open) return null;
  const canConfirm = (pdf || virtualLink) && !loading;

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center p-4" onMouseDown={(event) => event.target === event.currentTarget && !loading && onClose()}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl border border-white/70 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2"><Send size={18} className="text-indigo-600" /> Publicar</h2>
            <p className="text-xs text-slate-500 mt-1">Escolha o que deseja gerar.</p>
          </div>
          <button onClick={onClose} disabled={loading} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          <Choice checked={pdf} onChange={(checked) => updatePreferences({ pdf: checked, virtualLink })} icon={<FileText size={20} />} title="Gerar PDF" description="Abre as opções atuais de geração e baixa o arquivo." />
          <Choice checked={virtualLink} onChange={(checked) => updatePreferences({ pdf, virtualLink: checked })} icon={<Globe2 size={20} />} title="Gerar link virtual" description="Publica o cardápio e cria um link compartilhável com QR code." />
          {!pdf && !virtualLink && <p className="text-xs text-red-600">Selecione pelo menos uma opção.</p>}
        </div>
        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">Cancelar</button>
          <button onClick={() => onConfirm({ pdf, virtualLink })} disabled={!canConfirm} className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
            {loading && <Loader2 size={15} className="animate-spin" />} OK
          </button>
        </div>
      </div>
    </div>
  );
};
