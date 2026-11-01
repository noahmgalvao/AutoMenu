import React from 'react';
import QRCode from 'qrcode';
import { Check, Download, ExternalLink, Link2, Loader2, QrCode, Share2 } from 'lucide-react';
import { canEditPublishedMenu, loadPublicMenuPublication, updatePublicationMenuSlug } from '../services/workspaceService';
import type { MenuPublication } from '../types';

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const input = document.createElement('textarea');
  input.value = value; input.style.position = 'fixed'; input.style.opacity = '0';
  document.body.appendChild(input); input.select(); document.execCommand('copy'); input.remove();
};

export const PublicMenuPage: React.FC = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const restaurantSlug = decodeURIComponent(parts[1] || '');
  const initialMenuSlug = decodeURIComponent(parts[2] || '');
  const [publication, setPublication] = React.useState<MenuPublication | null>(null);
  const [editable, setEditable] = React.useState(false);
  const [menuSlug, setMenuSlug] = React.useState(initialMenuSlug);
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const publicUrl = React.useMemo(() => `${window.location.origin}/cardapio/${encodeURIComponent(restaurantSlug)}/${encodeURIComponent(publication?.menuSlug || menuSlug)}`, [restaurantSlug, publication?.menuSlug, menuSlug]);

  React.useEffect(() => {
    void loadPublicMenuPublication({ restaurantSlug, menuSlug: initialMenuSlug })
      .then(async (result) => {
        if (!result) { setError('Cardápio não encontrado.'); return; }
        setPublication(result.publication); setMenuSlug(result.publication.menuSlug);
        setEditable(await canEditPublishedMenu(result.publication.workspaceId));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao abrir o cardápio.'))
      .finally(() => setLoading(false));
  }, [restaurantSlug, initialMenuSlug]);

  React.useEffect(() => {
    if (!publication) return;
    void QRCode.toDataURL(publicUrl, { width: 1024, margin: 4, errorCorrectionLevel: 'H', color: { dark: '#0f172a', light: '#ffffff' } }).then(setQrDataUrl);
  }, [publication?.menuSlug, publicUrl]);

  const showCopied = async () => { await copyText(publicUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); };
  const saveSlug = async () => {
    if (!publication || menuSlug === publication.menuSlug) return;
    setSaving(true); setError(null);
    try {
      const updated = await updatePublicationMenuSlug({ publicationId: publication.id, menuSlug });
      setPublication(updated); setMenuSlug(updated.menuSlug);
      window.history.replaceState({}, '', `/cardapio/${encodeURIComponent(updated.restaurantSlug)}/${encodeURIComponent(updated.menuSlug)}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao atualizar o link.'); }
    finally { setSaving(false); }
  };
  const downloadQr = () => { if (!qrDataUrl) return; const link = document.createElement('a'); link.href = qrDataUrl; link.download = `qrcode-${publication?.menuSlug || 'cardapio'}.png`; link.click(); };
  const downloadPdf = async () => {
    if (!publication?.pdfUrl) return;
    const response = await fetch(publication.pdfUrl); const blob = await response.blob();
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = publication.pdfFilename; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  if (loading) return <div className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>;
  if (!publication) return <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6"><div className="rounded-3xl bg-white p-8 shadow-xl text-center"><h1 className="font-bold text-slate-900">Cardápio indisponível</h1><p className="text-sm text-slate-500 mt-2">{error}</p></div></div>;

  return (
    <div className="h-screen bg-slate-100 flex flex-col text-slate-900">
      <header className="h-16 bg-white border-b px-4 flex items-center justify-between gap-3 shrink-0">
        <div className="min-w-0"><div className="font-bold text-indigo-600">AutoMenu</div><div className="text-xs text-slate-500 truncate">Cardápio virtual</div></div>
        <div className="flex items-center gap-2"><button onClick={() => void showCopied()} className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-bold flex items-center gap-2 hover:bg-slate-50"><Share2 size={16} /> <span className="hidden sm:inline">Compartilhar</span></button><button onClick={() => void downloadPdf()} className="h-10 px-3 rounded-xl bg-indigo-600 text-white text-sm font-bold flex items-center gap-2"><Download size={16} /> <span className="hidden sm:inline">Baixar PDF</span></button></div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden grid lg:grid-cols-[1fr_360px]">
        <section className="h-[65vh] lg:h-auto min-h-0 bg-slate-200 p-2 md:p-4"><iframe title="Cardápio em PDF" src={`${publication.pdfUrl || ''}#view=FitH&toolbar=1`} className="w-full h-full rounded-xl bg-white shadow-sm border-0" /></section>
        <aside className="bg-white border-l lg:overflow-y-auto p-5 space-y-5 custom-scrollbar">
          <div><h2 className="font-bold flex items-center gap-2"><Link2 size={17} className="text-indigo-600" /> Link do cardápio</h2><p className="text-xs text-slate-500 mt-1">Compartilhe este endereço com seus clientes.</p></div>
          <div className="rounded-2xl border border-slate-200 p-3 bg-slate-50"><div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Endereço</div><div className="text-xs text-slate-600 break-all">{window.location.origin}/cardapio/{restaurantSlug}/</div>{editable ? <div className="flex gap-2 mt-2"><input value={menuSlug} onChange={(event) => setMenuSlug(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void saveSlug()} className="min-w-0 flex-1 h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm" /><button onClick={() => void saveSlug()} disabled={saving || menuSlug === publication.menuSlug} className="h-10 px-3 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</button></div> : <div className="text-sm font-semibold text-slate-800 mt-1 break-all">{publication.menuSlug}</div>}</div>
          <button onClick={() => void showCopied()} className="w-full h-11 rounded-xl bg-indigo-50 text-indigo-700 font-bold text-sm flex items-center justify-center gap-2"><Share2 size={16} /> Copiar link</button>
          <div className="border-t pt-5"><h3 className="font-bold text-sm flex items-center gap-2"><QrCode size={16} /> QR code</h3>{qrDataUrl && <img src={qrDataUrl} alt="QR code do cardápio" className="w-56 max-w-full mx-auto my-3 rounded-xl border" />}<button onClick={downloadQr} className="w-full h-10 rounded-xl border border-slate-200 text-sm font-bold flex items-center justify-center gap-2"><Download size={15} /> Exportar PNG (1024 px)</button></div>
          <button onClick={() => window.open(publication.pdfUrl || '', '_blank', 'noopener,noreferrer')} className="w-full h-10 rounded-xl text-slate-600 text-sm font-semibold flex items-center justify-center gap-2"><ExternalLink size={15} /> Abrir PDF em nova guia</button>
          {error && <p className="rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        </aside>
      </main>
      {copied && <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-xl flex items-center gap-2"><Check size={15} /> Copiado</div>}
    </div>
  );
};
