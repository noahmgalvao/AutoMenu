declare module 'jscanify/client' {
  export interface JscanifyPoint {
    x: number;
    y: number;
  }

  export interface JscanifyCorners {
    topLeftCorner: JscanifyPoint;
    topRightCorner: JscanifyPoint;
    bottomLeftCorner: JscanifyPoint;
    bottomRightCorner: JscanifyPoint;
  }

  export default class Jscanify {
    findPaperContour(image: any): any;
    getCornerPoints(contour: any): Partial<JscanifyCorners>;
    extractPaper(
      image: HTMLImageElement | HTMLCanvasElement | File,
      resultWidth: number,
      resultHeight: number,
      cornerPoints?: JscanifyCorners,
    ): HTMLCanvasElement | null;
  }
}
