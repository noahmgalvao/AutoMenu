import type { MenuStyle, PriceDecimalPlaces, PriceDecimalSeparator, Product } from './model';

export const DEFAULT_PRICE_DECIMAL_PLACES = 'auto';
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

export const normalizePriceInput = (value: string): string => {
  const digitsAndSeparators = value.replace(/[^0-9.,]/g, '');
  return digitsAndSeparators.match(/^\d*(?:[.,]\d*)?/)?.[0] || '';
};

export const parsePriceInput = (value: string): { price: number; priceEnteredWithDecimals: boolean } | null => {
  const normalized = normalizePriceInput(value);
  if (!/\d/.test(normalized)) return null;
  const numeric = Number(normalized.replace(',', '.'));
  return Number.isFinite(numeric)
    ? { price: roundPrice(numeric), priceEnteredWithDecimals: /[.,]\d/.test(normalized) }
    : null;
};

export const parseAndRoundPrice = (value: string): number | null => parsePriceInput(value)?.price ?? null;

export const resolvePriceDecimalPlaces = (value: unknown): PriceDecimalPlaces | 'auto' => (
  value === 0 || value === 1 || value === 2 ? value : DEFAULT_PRICE_DECIMAL_PLACES
);

const hasFractionalPrice = (value: unknown) => !Number.isInteger(roundPrice(value));

export const resolveMenuPriceDecimalPlaces = (
  style: MenuPriceFormat,
  products: Iterable<Pick<Product, 'price' | 'priceEnteredWithDecimals' | 'isFreeText'>>,
): PriceDecimalPlaces => {
  const configured = resolvePriceDecimalPlaces(style.priceDecimalPlaces);
  if (configured !== 'auto') return configured;
  for (const product of products) {
    if (!product.isFreeText && (product.priceEnteredWithDecimals || hasFractionalPrice(product.price))) return 2;
  }
  return 0;
};

export const resolvePriceDecimalSeparator = (value: unknown): PriceDecimalSeparator => (
  value === '.' ? '.' : DEFAULT_PRICE_DECIMAL_SEPARATOR
);

export const formatMenuPriceValue = (
  value: unknown,
  style?: Pick<MenuStyle, 'priceDecimalPlaces' | 'priceDecimalSeparator'>,
): string => {
  const configured = resolvePriceDecimalPlaces(style?.priceDecimalPlaces);
  const decimalPlaces = configured === 'auto' ? (hasFractionalPrice(value) ? 2 : 0) : configured;
  const decimalSeparator = resolvePriceDecimalSeparator(style?.priceDecimalSeparator);
  const formatted = roundPrice(value).toFixed(decimalPlaces);
  return decimalSeparator === ',' ? formatted.replace('.', ',') : formatted;
};

export const formatMenuPrice = (value: unknown, style?: MenuPriceFormat) =>
  [getMenuPriceSymbol(style), formatMenuPriceValue(value, style)].filter(Boolean).join(' ');
