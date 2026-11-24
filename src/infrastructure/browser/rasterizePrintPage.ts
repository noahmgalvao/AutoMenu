import { embedPrintFonts } from './printFonts';

const svgNamespace = 'http://www.w3.org/2000/svg';

// Preserve the page's computed layout and paint properties, including logical sizes,
// line breaking, flex/grid alignment and the individual transform properties.
const paintProperties = `
  display position inset top right bottom left z-index isolation box-sizing
  width min-width max-width height min-height max-height aspect-ratio
  margin-top margin-right margin-bottom margin-left padding-top padding-right padding-bottom padding-left
  overflow-x overflow-y overflow-clip-margin visibility opacity float clear
  flex-basis flex-grow flex-shrink flex-direction flex-wrap order
  grid-template-columns grid-template-rows grid-template-areas grid-auto-columns grid-auto-rows grid-auto-flow
  grid-column-start grid-column-end grid-row-start grid-row-end row-gap column-gap
  align-content align-items align-self justify-content justify-items justify-self
  font-family font-size font-weight font-style font-stretch font-kerning font-feature-settings
  font-optical-sizing font-variation-settings font-variant-caps font-variant-numeric line-height
  color direction unicode-bidi writing-mode text-align text-align-last text-indent text-transform
  text-decoration-line text-decoration-style text-decoration-color text-decoration-thickness
  text-underline-offset text-shadow letter-spacing word-spacing white-space overflow-wrap word-break
  tab-size hyphens text-size-adjust -webkit-text-size-adjust -webkit-line-clamp -webkit-box-orient -webkit-text-stroke-width
  -webkit-text-stroke-color -webkit-text-fill-color
  background-image background-color background-size background-position background-repeat
  background-clip background-origin background-blend-mode
  border-top-width border-right-width border-bottom-width border-left-width
  border-top-style border-right-style border-bottom-style border-left-style
  border-top-color border-right-color border-bottom-color border-left-color
  border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius
  box-shadow transform transform-origin transform-box translate rotate scale
  object-fit object-position clip-path filter mix-blend-mode
  fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-dasharray
  stroke-dashoffset stroke-linecap stroke-linejoin paint-order vector-effect
`.trim().split(/\s+/);

const snapshotStyle = (style: CSSStyleDeclaration) => paintProperties.flatMap(property => {
  const value = style.getPropertyValue(property);
  return value ? [`${property}:${value};`] : [];
}).join('');

export async function rasterizePrintPage(
  page: HTMLElement, width: number, height: number, scale: number,
  inlineUrls: (value: string, baseUrl: string) => Promise<string>,
) {
  const snapshot = page.cloneNode(true) as HTMLElement;
  const sources = [page, ...page.querySelectorAll('*')];
  const targets = [snapshot, ...snapshot.querySelectorAll('*')];
  const families = new Set<string>();
  const pseudoRules: string[] = [];

  // Read the whole page before writing styles to the detached replica.
  const styledNodes = sources.map((source, index) => {
    const css = getComputedStyle(source);
    css.fontFamily.split(',').forEach(family => families.add(family));
    for (const pseudo of ['before', 'after']) {
      const style = getComputedStyle(source, `::${pseudo}`);
      if (!style.content || style.content === 'none' || style.content === 'normal') continue;
      targets[index].setAttribute('data-export-pseudo', String(index));
      pseudoRules.push(`[data-export-pseudo="${index}"]::${pseudo}{content:${style.content};${snapshotStyle(style)}}`);
    }
    return snapshotStyle(css);
  });
  const [fonts, pseudoCss] = await Promise.all([
    embedPrintFonts(families, inlineUrls),
    inlineUrls(pseudoRules.join('\n'), document.baseURI),
    ...styledNodes.map(async (style, index) => {
      targets[index].setAttribute('style', await inlineUrls(style, document.baseURI));
    }),
  ]);

  const svg = document.createElementNS(svgNamespace, 'svg');
  const pixelWidth = Math.round(width * scale);
  const pixelHeight = Math.round(height * scale);
  svg.setAttribute('width', String(pixelWidth));
  svg.setAttribute('height', String(pixelHeight));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const foreignObject = document.createElementNS(svgNamespace, 'foreignObject');
  foreignObject.setAttribute('width', String(width));
  foreignObject.setAttribute('height', String(height));
  const wrapper = document.createElement('div');
  wrapper.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#fff`;
  const css = document.createElement('style');
  css.textContent = fonts + pseudoCss;
  wrapper.append(css, snapshot);
  foreignObject.append(wrapper);
  svg.append(foreignObject);

  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext('2d');
  try {
    if (!context) throw new Error('O navegador não disponibilizou o contexto de imagem.');
    context.drawImage(image, 0, 0, pixelWidth, pixelHeight);
    // Some browsers accept the SVG but disable its HTML contents when drawn to canvas.
    if (!context.getImageData(0, 0, 1, 1).data[3]) throw new Error('O navegador não desenhou o conteúdo da página.');
    return canvas;
  } catch (error) {
    canvas.width = canvas.height = 1;
    throw error;
  }
}
