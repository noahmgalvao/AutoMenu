export type ImagePages = { mode: 'all' | 'selection' } | { mode: 'pages'; indexes: number[] };

export function resolveImagePages(choice: ImagePages, pageCount: number, selectedPages: readonly number[]) {
  if (choice.mode === 'all') return Array.from({ length: pageCount }, (_, index) => index);
  const indexes = choice.mode === 'pages' ? choice.indexes : selectedPages;
  return [...new Set(indexes)].filter(index => Number.isInteger(index) && index >= 0 && index < pageCount)
    .sort((left, right) => left - right);
}

export function toggleImagePage(choice: ImagePages, index: number): ImagePages {
  if (choice.mode !== 'pages') return { mode: 'pages', indexes: [index] };
  return {
    mode: 'pages',
    indexes: choice.indexes.includes(index) ? choice.indexes.filter(page => page !== index) : [...choice.indexes, index],
  };
}
