export interface ScanPoint {
  x: number;
  y: number;
}

export interface DocumentCorners {
  topLeft: ScanPoint;
  topRight: ScanPoint;
  bottomRight: ScanPoint;
  bottomLeft: ScanPoint;
}

export interface ScannerImageInfo {
  width: number;
  height: number;
  url: string;
}

const MAX_OUTPUT_EDGE = 3000;
const MIN_DETECTED_DOCUMENT_AREA_RATIO = 0.65;
const EDGE_SNAP_RATIO = 0.025;
let scannerPromise: Promise<{
  cv: any;
  scanner: InstanceType<typeof import('jscanify/client')['default']>;
}> | null = null;

const loadImage = (source: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
  image.src = source;
});

const loadScanner = () => {
  if (scannerPromise) return scannerPromise;

  scannerPromise = (async () => {
    const [{ default: cvModule }, { default: Jscanify }] = await Promise.all([
      import('@techstark/opencv-js'),
      import('jscanify/client'),
    ]);

    let cv: any = cvModule;
    if (cvModule instanceof Promise) {
      cv = await cvModule;
    } else if (!cvModule?.Mat) {
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
      });
      cv = cvModule;
    }

    (globalThis as any).cv = cv;
    return { cv, scanner: new Jscanify() };
  })();

  return scannerPromise;
};

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.max(minimum, Math.min(maximum, value))
);

export const getDefaultDocumentCorners = (
  width: number,
  height: number,
): DocumentCorners => ({
  topLeft: { x: 0, y: 0 },
  topRight: { x: Math.max(0, width - 1), y: 0 },
  bottomRight: { x: Math.max(0, width - 1), y: Math.max(0, height - 1) },
  bottomLeft: { x: 0, y: Math.max(0, height - 1) },
});

export const getScannerImageInfo = async (file: File): Promise<ScannerImageInfo> => {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      url,
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
};

const polygonArea = (corners: DocumentCorners) => {
  const points = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];

  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + ((point.x * next.y) - (next.x * point.y));
  }, 0) / 2);
};

const sanitizeDetectedCorners = (
  detected: Partial<Record<'topLeftCorner' | 'topRightCorner' | 'bottomRightCorner' | 'bottomLeftCorner', ScanPoint>>,
  width: number,
  height: number,
): DocumentCorners | null => {
  const values = [
    detected.topLeftCorner,
    detected.topRightCorner,
    detected.bottomRightCorner,
    detected.bottomLeftCorner,
  ];
  if (values.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }

  const corners: DocumentCorners = {
    topLeft: {
      x: clamp(detected.topLeftCorner!.x, 0, width - 1),
      y: clamp(detected.topLeftCorner!.y, 0, height - 1),
    },
    topRight: {
      x: clamp(detected.topRightCorner!.x, 0, width - 1),
      y: clamp(detected.topRightCorner!.y, 0, height - 1),
    },
    bottomRight: {
      x: clamp(detected.bottomRightCorner!.x, 0, width - 1),
      y: clamp(detected.bottomRightCorner!.y, 0, height - 1),
    },
    bottomLeft: {
      x: clamp(detected.bottomLeftCorner!.x, 0, width - 1),
      y: clamp(detected.bottomLeftCorner!.y, 0, height - 1),
    },
  };

  const areaRatio = polygonArea(corners) / Math.max(1, width * height);
  if (areaRatio < MIN_DETECTED_DOCUMENT_AREA_RATIO) return null;

  const snapX = Math.max(2, width * EDGE_SNAP_RATIO);
  const snapY = Math.max(2, height * EDGE_SNAP_RATIO);
  if (corners.topLeft.x <= snapX) corners.topLeft.x = 0;
  if (corners.bottomLeft.x <= snapX) corners.bottomLeft.x = 0;
  if (corners.topRight.x >= width - 1 - snapX) corners.topRight.x = width - 1;
  if (corners.bottomRight.x >= width - 1 - snapX) corners.bottomRight.x = width - 1;
  if (corners.topLeft.y <= snapY) corners.topLeft.y = 0;
  if (corners.topRight.y <= snapY) corners.topRight.y = 0;
  if (corners.bottomLeft.y >= height - 1 - snapY) corners.bottomLeft.y = height - 1;
  if (corners.bottomRight.y >= height - 1 - snapY) corners.bottomRight.y = height - 1;

  return corners;
};

export const detectDocumentCorners = async (
  imageUrl: string,
  width: number,
  height: number,
): Promise<DocumentCorners> => {
  const image = await loadImage(imageUrl);

  try {
    const { cv, scanner } = await loadScanner();
    const matrix = cv.imread(image);
    let contour: any = null;

    try {
      contour = scanner.findPaperContour(matrix);
      if (!contour) return getDefaultDocumentCorners(width, height);
      const detected = scanner.getCornerPoints(contour);
      return sanitizeDetectedCorners(detected, width, height)
        || getDefaultDocumentCorners(width, height);
    } finally {
      contour?.delete?.();
      matrix.delete?.();
    }
  } catch (error) {
    console.warn('Detecção automática de bordas indisponível; usando a página inteira.', error);
    return getDefaultDocumentCorners(width, height);
  }
};

const distance = (first: ScanPoint, second: ScanPoint) => (
  Math.hypot(first.x - second.x, first.y - second.y)
);

const canvasToFile = (
  canvas: HTMLCanvasElement,
  originalName: string,
): Promise<File> => new Promise((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (!blob) {
      reject(new Error('Não foi possível gerar a página recortada.'));
      return;
    }

    const baseName = originalName.replace(/\.[^.]+$/, '') || 'cardapio';
    resolve(new File([blob], `${baseName}-digitalizado.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    }));
  }, 'image/jpeg', 0.96);
});

const isAxisAligned = (
  corners: DocumentCorners,
  _width: number,
  _height: number,
) => {
  const tolerance = 1;
  return (
    Math.abs(corners.topLeft.y - corners.topRight.y) <= tolerance
    && Math.abs(corners.bottomLeft.y - corners.bottomRight.y) <= tolerance
    && Math.abs(corners.topLeft.x - corners.bottomLeft.x) <= tolerance
    && Math.abs(corners.topRight.x - corners.bottomRight.x) <= tolerance
  );
};

const getAxisAlignedBounds = (
  corners: DocumentCorners,
  width: number,
  height: number,
) => {
  const left = clamp(Math.ceil(Math.max(corners.topLeft.x, corners.bottomLeft.x)), 0, width - 1);
  const top = clamp(Math.ceil(Math.max(corners.topLeft.y, corners.topRight.y)), 0, height - 1);
  const right = clamp(Math.floor(Math.min(corners.topRight.x, corners.bottomRight.x)), left + 1, width);
  const bottom = clamp(Math.floor(Math.min(corners.bottomLeft.y, corners.bottomRight.y)), top + 1, height);
  return { left, top, right, bottom };
};

export const cropDocumentPage = async (
  file: File,
  imageUrl: string,
  corners: DocumentCorners,
): Promise<File> => {
  const image = await loadImage(imageUrl);
  const imageWidth = image.naturalWidth;
  const imageHeight = image.naturalHeight;

  if (isAxisAligned(corners, imageWidth, imageHeight)) {
    const bounds = getAxisAlignedBounds(corners, imageWidth, imageHeight);
    const fullFrameToleranceX = Math.max(2, imageWidth * 0.006);
    const fullFrameToleranceY = Math.max(2, imageHeight * 0.006);
    const isFullFrame = (
      bounds.left <= fullFrameToleranceX
      && bounds.top <= fullFrameToleranceY
      && bounds.right >= imageWidth - fullFrameToleranceX
      && bounds.bottom >= imageHeight - fullFrameToleranceY
    );
    if (isFullFrame) return file;

    const cropWidth = bounds.right - bounds.left;
    const cropHeight = bounds.bottom - bounds.top;
    const longestEdge = Math.max(cropWidth, cropHeight);
    const outputScale = longestEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / longestEdge : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.round(cropWidth * outputScale));
    canvas.height = Math.max(2, Math.round(cropHeight * outputScale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('NÃ£o foi possÃ­vel gerar a pÃ¡gina recortada.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      image,
      bounds.left,
      bounds.top,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvasToFile(canvas, file.name);
  }

  const rawWidth = Math.max(
    distance(corners.topLeft, corners.topRight),
    distance(corners.bottomLeft, corners.bottomRight),
  );
  const rawHeight = Math.max(
    distance(corners.topLeft, corners.bottomLeft),
    distance(corners.topRight, corners.bottomRight),
  );
  const longestEdge = Math.max(rawWidth, rawHeight);
  const outputScale = longestEdge > MAX_OUTPUT_EDGE ? MAX_OUTPUT_EDGE / longestEdge : 1;
  const outputWidth = Math.max(2, Math.round(rawWidth * outputScale));
  const outputHeight = Math.max(2, Math.round(rawHeight * outputScale));

  if (polygonArea(corners) < imageWidth * imageHeight * 0.01) {
    throw new Error('A área de recorte é muito pequena.');
  }

  const { scanner } = await loadScanner();
  const canvas = scanner.extractPaper(image, outputWidth, outputHeight, {
    topLeftCorner: corners.topLeft,
    topRightCorner: corners.topRight,
    bottomLeftCorner: corners.bottomLeft,
    bottomRightCorner: corners.bottomRight,
  });
  if (!canvas) throw new Error('Não foi possível corrigir a perspectiva da página.');

  return canvasToFile(canvas, file.name);
};
