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

