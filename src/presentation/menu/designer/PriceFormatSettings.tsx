import { useId, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Settings2 } from 'lucide-react';
import { DesignerOptionSelect } from './SearchableSelects';
import type { MenuStyle } from '../../../domain/menu/model';
import {
  formatMenuPrice, getMenuPriceSymbol, PRICE_CURRENCIES,
  resolvePriceCurrencySymbol, resolvePriceDecimalPlaces, resolvePriceDecimalSeparator,
  type MenuPriceFormat,
} from '../../../domain/menu/price';

const fieldClass = 'h-8 min-w-0 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500';
const currencyOptions = [{ value: '', label: 'Sem símbolo' }, ...PRICE_CURRENCIES.map(([value, name]) => ({ value, label: `${value} · ${name}` }))];

export function PriceFormatSettings({ style, setStyle, children }: {
  style: MenuStyle;
  setStyle: Dispatch<SetStateAction<MenuStyle>>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const update = (patch: MenuPriceFormat) => setStyle(current => ({ ...current, ...patch, name: 'Custom' }));

  return <div className="min-w-0">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <button type="button" aria-label="Configurações de preço" title="Configurações de preço"
        aria-controls={panelId} aria-expanded={open} onClick={() => setOpen(current => !current)}
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border focus-visible:outline-2 focus-visible:outline-indigo-500 ${open
          ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
        <Settings2 size={15} />
      </button>
    </div>
    {open && <div id={panelId} data-price-format-settings className="my-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="grid gap-1 text-[11px] font-medium text-slate-600">
        Símbolo da moeda
        <DesignerOptionSelect label="Símbolo da moeda" value={getMenuPriceSymbol(style)} options={currencyOptions} onChange={symbol => {
          update(symbol ? { showCurrencySymbol: true, priceCurrencySymbol: resolvePriceCurrencySymbol(symbol) } : { showCurrencySymbol: false });
        }} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-[11px] font-medium text-slate-600">
          Casas decimais
          <select value={resolvePriceDecimalPlaces(style.priceDecimalPlaces)}
            onChange={event => update({ priceDecimalPlaces: resolvePriceDecimalPlaces(Number(event.target.value)) })} className={fieldClass}>
            {[0, 1, 2].map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-[11px] font-medium text-slate-600">
          Separador decimal
          <select value={resolvePriceDecimalSeparator(style.priceDecimalSeparator)}
            onChange={event => update({ priceDecimalSeparator: resolvePriceDecimalSeparator(event.target.value) })} className={fieldClass}>
            <option value=",">Vírgula (,)</option>
            <option value=".">Ponto (.)</option>
          </select>
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
        Prévia <output className="font-semibold tabular-nums text-slate-800">{formatMenuPrice(12.5, style)}</output>
      </div>
    </div>}
  </div>;
}
