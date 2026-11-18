import type { MenuStyle, PriceDecimalPlaces, PriceDecimalSeparator } from './model';

export const DEFAULT_PRICE_DECIMAL_PLACES: PriceDecimalPlaces = 2;
export const DEFAULT_PRICE_DECIMAL_SEPARATOR: PriceDecimalSeparator = ',';
export const PRICE_CURRENCIES = [
  ['R$', 'Real brasileiro'],
  ['$', 'Cifrão'],
  ['US$', 'Dólar americano'],
  ['€', 'Euro'],
  ['£', 'Libra esterlina'],
  ['¥', 'Iene ou yuan'],
  ['CA$', 'Dólar canadense'],
  ['A$', 'Dólar australiano'],
  ['CHF', 'Franco suíço'],
  ['AR$', 'Peso argentino'],
  ['MX$', 'Peso mexicano'],
  ['$U', 'Peso uruguaio'],
  ['₲', 'Guarani'],
  ['S/', 'Sol peruano'],
  ['₩', 'Won sul-coreano'],
  ['₹', 'Rupia indiana'],
] as const;

export type MenuPriceFormat = Pick<MenuStyle, 'priceDecimalPlaces' | 'priceDecimalSeparator' | 'priceCurrencySymbol' | 'showCurrencySymbol'>;

export const resolvePriceCurrencySymbol = (value: unknown) =>
  PRICE_CURRENCIES.find(([symbol]) => symbol === value)?.[0] ?? PRICE_CURRENCIES[0][0];

export const getMenuPriceSymbol = (style?: MenuPriceFormat) =>
  style?.showCurrencySymbol === false ? '' : resolvePriceCurrencySymbol(style?.priceCurrencySymbol);

export const roundPrice = (value: unknown): number => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round((numeric + Number.EPSILON) * 100) / 100);
};

export const parseAndRoundPrice = (value: string): number | null => {
  const sanitized = String(value || '').trim().replace(/[^0-9,.-]/g, '');
  if (!sanitized) return null;
  const separatorIndex = Math.max(sanitized.lastIndexOf(','), sanitized.lastIndexOf('.'));
  const negative = sanitized.startsWith('-');
  const integerDigits = (separatorIndex >= 0 ? sanitized.slice(0, separatorIndex) : sanitized).replace(/\D/g, '') || '0';
  const decimalDigits = separatorIndex >= 0 ? sanitized.slice(separatorIndex + 1).replace(/\D/g, '') : '';
  const numeric = Number(`${negative ? '-' : ''}${integerDigits}${decimalDigits ? `.${decimalDigits}` : ''}`);
  return Number.isFinite(numeric) ? roundPrice(numeric) : null;
};

export const resolvePriceDecimalPlaces = (value: unknown): PriceDecimalPlaces => (
  value === 0 || value === 1 || value === 2 ? value : DEFAULT_PRICE_DECIMAL_PLACES
);

export const resolvePriceDecimalSeparator = (value: unknown): PriceDecimalSeparator => (
  value === '.' ? '.' : DEFAULT_PRICE_DECIMAL_SEPARATOR
);

export const formatMenuPriceValue = (
  value: unknown,
  style?: Pick<MenuStyle, 'priceDecimalPlaces' | 'priceDecimalSeparator'>,
): string => {
  const decimalPlaces = resolvePriceDecimalPlaces(style?.priceDecimalPlaces);
  const decimalSeparator = resolvePriceDecimalSeparator(style?.priceDecimalSeparator);
  const formatted = roundPrice(value).toFixed(decimalPlaces);
  return decimalSeparator === ',' ? formatted.replace('.', ',') : formatted;
};

export const formatMenuPrice = (value: unknown, style?: MenuPriceFormat) =>
  [getMenuPriceSymbol(style), formatMenuPriceValue(value, style)].filter(Boolean).join(' ');
