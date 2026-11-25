import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, CircleHelp } from 'lucide-react';
import { exportProfiles, EXPORT_DPI, getExportGeometry, supportsCmyk, type ExportColor, type ExportPageSize, type ExportFormat, type ExportSettings } from '../../domain/publishing/exportProfiles';
import { BooleanSwitch } from '../common/BooleanSwitch';
import { DisclosureChevron } from '../common/DisclosureChevron';
import { FontSizeInput } from '../menu/designer/FontSizeInput';
import { actionClasses } from './VirtualLinkSection';

type Profile = (typeof exportProfiles)[ExportFormat]['options'][number];

const formatMm = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const mmSize = (width: number, height: number) => `${formatMm.format(width)} × ${formatMm.format(height)} mm`;

function ProfileTooltip({ id, settings, profile, format, pages, anchor, portal, close }: {
  id: string;
  settings: ExportSettings;
  profile: Profile;
  format: ExportFormat;
  pages: ExportPageSize[];
  anchor: HTMLElement;
  portal: HTMLElement;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number }>();
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const place = () => {
      const tooltip = ref.current;
      if (!tooltip) return;
      const rect = anchor.getBoundingClientRect();
      const view = { left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0,
        width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight };
      const width = Math.min(306, view.width - 16);
      const roomAbove = rect.top - view.top - 12;
      const roomBelow = view.top + view.height - rect.bottom - 12;
      const above = roomBelow < Math.min(250, tooltip.scrollHeight + 8) && roomAbove > roomBelow;
      const maxHeight = Math.max(48, above ? roomAbove : roomBelow);
      const top = above ? rect.top - Math.min(tooltip.scrollHeight + 2, maxHeight) - 6 : rect.bottom + 6;
      setPosition({
        left: Math.max(view.left + 8, Math.min(rect.right - width, view.left + view.width - width - 8)),
        top: Math.max(view.top + 8, top), width, maxHeight,
      });
    };
    place();
    const outerScroll = (event: Event) => { if (!ref.current?.contains(event.target as Node)) place(); };
    document.addEventListener('scroll', outerScroll, true);
    window.addEventListener('resize', place);
    viewport?.addEventListener('resize', place);
    viewport?.addEventListener('scroll', place);
    return () => {
      document.removeEventListener('scroll', outerScroll, true);
      window.removeEventListener('resize', place);
      viewport?.removeEventListener('resize', place);
      viewport?.removeEventListener('scroll', place);
    };
  }, [anchor]);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && !anchor.contains(event.target)) close();
    };
    document.addEventListener('click', outside);
    return () => document.removeEventListener('click', outside);
  }, [anchor, close]);

  const geometry = pages.map(page => getExportGeometry(page, settings));
  const sizes = (values: string[]) => [...new Set(values)].join(' · ') || '—';
  const rows = [
    ['Tamanho final', sizes(geometry.map(page => mmSize(page.trimWidth, page.trimHeight)))],
    ['Tamanho com sangria', sizes(geometry.map(page => mmSize(page.bleedWidth, page.bleedHeight)))],
    ...(settings.marks ? [['Tamanho total do arquivo', sizes(geometry.map(page => mmSize(page.totalWidth, page.totalHeight)))]] : []),
    ['Sangria', `${formatMm.format(settings.bleed)} mm`],
    ['Marcas de corte', settings.marks ? 'Ativadas' : 'Desativadas'],
    ['Afastamento das marcas', settings.marks ? settings.markOffset ? `+${formatMm.format(settings.markOffset)} mm da sangria` : 'Padrão' : 'Não aplicável'],
    ['Resolução', `${settings.dpi} DPI`],
    ['Modo de cor', settings.color],
    ...(format === 'PDF' ? [] : [['Dimensões em pixels', sizes(geometry.map(page => `${page.pixelWidth} × ${page.pixelHeight} px`))]]),
    ...(format === 'JPG' ? [['Qualidade de compressão', `${settings.quality}%`]] : []),
    ...(format === 'PNG' || format === 'TIFF' ? [['Compressão', format === 'PNG' ? 'Sem perdas' : 'Sem compressão']] : []),
  ];

  return createPortal(<div ref={ref} role="tooltip" id={id} tabIndex={0}
    className="fixed z-[1250] overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl"
    style={position ?? { visibility: 'hidden', width: 306 }}>
    <p className="mb-2 font-bold text-slate-900">{profile.name}</p>
    <dl className="space-y-1">
      {rows.map(([label, value]) => <div key={label} className="grid grid-cols-[1fr_1.15fr] gap-2">
        <dt className="text-slate-500">{label}</dt><dd className="text-right font-semibold">{value}</dd>
      </div>)}
    </dl>
  </div>, portal);
}

export function ExportProfilePicker({ format, value, custom, pages, onSelect }: {
  format: ExportFormat;
  value: string;
  custom: ExportSettings;
  pages: ExportPageSize[];
  onSelect: (profile: Profile) => void;
}) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState<{ profile: Profile; anchor: HTMLElement }>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const profiles = exportProfiles[format];
  const active = profiles.options.find(profile => profile.id === value) ?? profiles.options[0];

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || root.current?.contains(event.target) || event.target.closest('[role="tooltip"]')) return;
      setOpen(false);
      setHelp(undefined);
    };
    document.addEventListener('click', outside);
    return () => document.removeEventListener('click', outside);
  }, [open]);

  const portal = root.current?.closest<HTMLElement>('[role="dialog"]');
  return <div ref={root} className="space-y-1.5" onKeyDown={event => {
    if (event.key !== 'Escape' || !open) return;
    event.stopPropagation();
    if (help) {
      help.anchor.focus();
      setHelp(undefined);
    } else {
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <div className="text-xs font-semibold text-slate-700" id={id}>Perfil de exportação</div>
    <button type="button" ref={trigger} className={`${actionClasses} flex w-full items-center justify-between pl-3 pr-2.5 text-left`}
      aria-labelledby={`${id} ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-profiles` : undefined}
      onClick={() => { setOpen(!open); setHelp(undefined); }}>
      <span id={`${id}-value`}>{active.name}</span><DisclosureChevron open={open} size={15} />
    </button>
    {open && <div role="group" aria-label="Perfis de exportação" id={`${id}-profiles`} className="space-y-0.5 rounded-xl border border-slate-200 p-1">
      {profiles.options.map(profile => <div key={profile.id} className={`flex items-center gap-1 rounded-lg ${profile.id === value ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
        <button type="button" className="flex min-h-10 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2.5 py-1 text-left text-xs text-slate-700 [-webkit-tap-highlight-color:transparent]"
          aria-pressed={profile.id === value} onClick={() => { onSelect(profile); setOpen(false); setHelp(undefined); trigger.current?.focus(); }}>
          <span><span className="block font-semibold">{profile.name}</span>
            {profile.description && <span className="mt-0.5 block text-[11px] text-slate-500">{profile.description}</span>}</span>
          {profile.id === value && <Check className="shrink-0 text-indigo-600" size={15} />}
        </button>
        <button type="button" aria-label={`Informações de ${profile.name}`} aria-expanded={help?.profile.id === profile.id}
          aria-describedby={help?.profile.id === profile.id ? `${id}-tooltip` : undefined}
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-indigo-100 hover:text-indigo-700 [-webkit-tap-highlight-color:transparent]"
          onClick={event => setHelp(help?.profile.id === profile.id ? undefined : { profile, anchor: event.currentTarget })}>
          <CircleHelp size={17} />
        </button>
      </div>)}
    </div>}
    {open && help && portal && <ProfileTooltip id={`${id}-tooltip`} settings={help.profile.settings ?? custom}
      profile={help.profile} format={format} pages={pages} anchor={help.anchor} portal={portal} close={() => setHelp(undefined)} />}
  </div>;
}

export function CustomExportSettings({ format, settings, onChange }: {
  format: ExportFormat;
  settings: ExportSettings;
  onChange: (next: ExportSettings) => void;
}) {
  const supportsBleed = format === 'PDF' || format === 'TIFF';
  const update = (patch: Partial<ExportSettings>) => onChange({ ...settings, ...patch });
  return <div className="grid min-w-0 grid-cols-2 gap-2.5">
    <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-700">
      Resolução
      <select value={settings.dpi} onChange={event => update({ dpi: Number(event.target.value) })}
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
        {EXPORT_DPI.map(dpi => <option key={dpi} value={dpi}>{dpi} DPI</option>)}
      </select>
    </label>
    {supportsBleed && <Parameter label="Sangria (mm)" min={0} max={10} value={settings.bleed}
      onChange={bleed => update({ bleed })} />}
    {format === 'JPG' && <Parameter label="Qualidade JPG (%)" min={50} max={100} value={settings.quality}
      onChange={quality => update({ quality })} />}
    {supportsCmyk(format) && <label className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-700">
      Modo de cor
      <select value={settings.color} onChange={event => update({ color: event.target.value as ExportColor })}
        className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700">
        <option value="RGB">RGB</option>
        <option value="CMYK">CMYK</option>
      </select>
    </label>}
    {format === 'PDF' && <div className="col-span-2">
      <BooleanSwitch label="Marcas de corte" value={settings.marks} onChange={marks => update({ marks })} />
    </div>}
    {format === 'PDF' && settings.marks && <Parameter label="Afastamento adicional (mm)" min={0} max={10}
      value={settings.markOffset} onChange={markOffset => update({ markOffset })} />}
  </div>;
}

function Parameter({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return <div className="min-w-0 space-y-1 text-xs font-semibold text-slate-700">
    <div>{label}</div>
    <FontSizeInput value={value} min={min} max={max} label={label} stepSubject={label}
      variant="layout" showStepButtons onChange={onChange} />
  </div>;
}
