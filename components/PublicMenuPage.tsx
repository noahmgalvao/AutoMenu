import React from 'react';
import { Loader2 } from 'lucide-react';
import { loadPublicMenuPublication } from '../services/workspaceService';
import type { MenuPublication } from '../types';

export const PublicMenuPage: React.FC = () => {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const restaurantSlug = decodeURIComponent(parts[1] || '');
  const menuSlug = decodeURIComponent(parts[2] || '');
  const portableSnapshotUrl = React.useMemo(() => new URLSearchParams(window.location.search).get('source'), []);
  const [publication, setPublication] = React.useState<MenuPublication | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadPublicMenuPublication({ restaurantSlug, menuSlug, portableSnapshotUrl })
      .then((result) => {
        if (!result?.publication.pdfUrl) {
          setError('Cardápio não encontrado.');
          return;
        }
        setPublication(result.publication);
        document.title = result.publication.pdfFilename.replace(/\.pdf$/i, '') || 'Cardápio';
      })
      .catch(() => setError('Não foi possível abrir este cardápio.'))
      .finally(() => setLoading(false));
  }, [restaurantSlug, menuSlug, portableSnapshotUrl]);

  if (loading) {
    return <div className="h-dvh bg-slate-100 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={28} /></div>;
  }

  if (!publication?.pdfUrl) {
    return (
      <div className="h-dvh bg-slate-100 flex items-center justify-center p-6">
        <div className="rounded-3xl bg-white p-8 shadow-xl text-center">
          <h1 className="font-bold text-slate-900">Cardápio indisponível</h1>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <main className="h-dvh w-screen overflow-hidden bg-slate-200">
      <iframe
        title="Cardápio em PDF"
        src={`${publication.pdfUrl}#view=Fit&zoom=page-fit&toolbar=0&navpanes=0`}
        className="block h-full w-full border-0 bg-white"
      />
    </main>
  );
};
