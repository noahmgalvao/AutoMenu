const faceBlocks = (css: string) => css.match(/@font-face\s*\{[^}]*\}/gi) ?? [];

const fontFamily = (value: string) => value.trim().replace(/^["']|["']$/g, '').toLowerCase();

const usedFontRules = async (sheets: Set<CSSStyleSheet>, families: ReadonlySet<string>) => {
  return Promise.all(Array.from(sheets, async sheet => {
    const base = sheet.href ?? document.baseURI;
    try {
      const rules = Array.from(sheet.cssRules).filter(rule => rule.type === CSSRule.FONT_FACE_RULE)
        .map(rule => rule.cssText);
      return { base, rules };
    } catch {
      if (!sheet.href) return { base, rules: [] };
      const url = new URL(sheet.href);
      // Google Fonts exposes the CSS over CORS, including declarations hidden from CSSOM.
      const requested = url.searchParams.getAll('family');
      if (requested.length && !requested.some(value =>
        value.split(':')[0].split('|').some(name => families.has(fontFamily(name))))) return { base, rules: [] };
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      return { base, rules: response.ok ? faceBlocks(await response.text()) : [] };
    }
  }).map(task => task.catch(() => ({ base: document.baseURI, rules: [] }))));
};

export async function embedPrintFonts(
  fontFamilies: ReadonlySet<string>,
  inlineUrls: (value: string, baseUrl: string) => Promise<string>,
) {
  const loadedFamilies = new Set(Array.from(document.fonts)
    .filter(face => face.status === 'loaded').map(face => fontFamily(face.family)));
  const families = new Set(Array.from(fontFamilies, fontFamily).filter(name => loadedFamilies.has(name)));
  if (!families.size) return '';
  const sheets = new Set<CSSStyleSheet>();
  const visit = (sheet: CSSStyleSheet) => {
    if (sheets.has(sheet) || sheet.disabled) return;
    sheets.add(sheet);
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSImportRule && rule.styleSheet) visit(rule.styleSheet);
      }
    } catch {
      // Cross-origin font sheets are fetched below.
    }
  };
  for (const sheet of Array.from(document.styleSheets)) visit(sheet);
  const rulesByUrl = await usedFontRules(sheets, families);
  const faces = new Map<string, Promise<string>>();
  const embeddedFamilies = new Set<string>();
  for (const { base, rules } of rulesByUrl) {
    for (const rule of rules) {
      const name = rule.match(/font-family:\s*([^;]+)/i)?.[1];
      if (!name || !/\bsrc:\s*/i.test(rule) || !families.has(fontFamily(name)) || faces.has(rule)) continue;
      embeddedFamilies.add(fontFamily(name));
      faces.set(rule, inlineUrls(rule, base));
    }
  }
  if (Array.from(families).some(family => !embeddedFamilies.has(family))) {
    throw new Error('Não foi possível incluir todas as fontes carregadas na captura.');
  }
  return (await Promise.all(faces.values())).join('\n');
}
