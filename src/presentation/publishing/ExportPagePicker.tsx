import { useState } from 'react';
import { Check } from 'lucide-react';
import { resolveImagePages, toggleImagePage, type ImagePages } from '../../domain/publishing/imagePages';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { ActionButton } from './VirtualLinkSection';

export function ExportPagePicker({ format, choice, pageCount, selectedPages, onChange, disabled }: {
  format: 'PDF' | 'JPG';
  choice: ImagePages;
  pageCount: number;
  selectedPages: readonly number[];
  onChange: (choice: ImagePages) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const indexes = resolveImagePages(choice, pageCount, selectedPages);
  const hasSelection = selectedPages.some(index => index >= 0 && index < pageCount);
  const label = choice.mode === 'all' ? (open ? 'Todas as páginas' : 'Todas') : choice.mode === 'selection' ? 'Seleção'
    : indexes.length === 1 ? `Página ${indexes[0] + 1}` : `${indexes.length} páginas`;

  return <>
    <ActionButton icon={<DisclosureChevron open={open} size={15} />} label={label} expanded={open}
      disabled={disabled || !pageCount} onClick={() => setOpen(current => !current)} />
    {open && (
      <div role="group" aria-label={`Páginas do ${format}`} className="order-last col-span-full max-h-48 min-w-0 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
        {([{ mode: 'all', label: 'Todas as páginas' }, { mode: 'selection', label: 'Seleção' }] as const).map(option => (
          <PageOption key={option.mode} label={option.label} checked={choice.mode === option.mode}
            disabled={option.mode === 'selection' && !hasSelection}
            onClick={() => { onChange({ mode: option.mode }); setOpen(false); }} />
        ))}
        {Array.from({ length: pageCount }, (_, index) => (
          <PageOption key={index} label={`Página ${index + 1}`}
            checked={choice.mode === 'pages' && indexes.includes(index)}
            onClick={() => onChange(toggleImagePage(choice, index))} />
        ))}
      </div>
    )}
  </>;
}

function PageOption({ label, checked, disabled, onClick }: {
  label: string; checked: boolean; disabled?: boolean; onClick: () => void;
}) {
  return <button type="button" aria-pressed={checked} disabled={disabled} onClick={onClick}
    className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2.5 text-left text-xs font-semibold disabled:opacity-40 ${checked
      ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}>
    {label}
    {checked && <Check size={15} aria-hidden="true" />}
  </button>;
}
