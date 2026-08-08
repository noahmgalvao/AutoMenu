import { Type } from "@google/genai";
import {
  BoundingBox,
  ExtractedImage,
  MenuCategory,
  Product,
} from "../types";

// Helper to convert file to base64
export const fileToGenerativePart = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      // Remove data url prefix (e.g. "data:image/jpeg;base64,")
      const base64Data = base64String.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export const analyzeMenuImage = async (
  base64Data: string,
  mimeType: string,
  imageDimensions: { width: number; height: number }
): Promise<{
  categories: MenuCategory[];
  products: Product[];
  extractedImages: ExtractedImage[];
  styleSuggestion: any;
}> => {
  const model = "gemini-3.6-flash"; 

  const prompt = `
  Act as a Senior UI/UX Designer & Computer Vision Expert.
  REVERSE ENGINEER this menu photo into a JSON structure compatible with our React rendering engine.
  The original image is exactly ${imageDimensions.width}px wide by ${imageDimensions.height}px high.

  ### 0. REQUIRED PIXEL COORDINATES
  Para cada categoria, produto e imagem/ilustração visual identificada no cardápio, forneça as coordenadas geográficas exatas na imagem original no formato boundingBox: { x, y, width, height }. Estime esses valores em pixels com base na imagem.
  - Coordinates MUST be absolute pixels in the original ${imageDimensions.width}x${imageDimensions.height} image. Never return percentages or normalized values.
  - x and y are the top-left corner. width and height are positive dimensions.
  - COVERAGE IS CRITICAL: no letter, glyph, price, icon edge, shadow, anti-aliasing pixel or image fragment may remain outside its boundingBox. Slightly overestimate a box instead of leaving any visible foreground pixel uncovered.
  - A category boundingBox must cover the complete heading block, including every adjacent icon or ornament belonging to that heading. Also return category.nameBoundingBox tightly around only the category text glyphs for font measurement.
  - A product boundingBox must be one rectangle covering the complete multi-line product entry: from its leftmost name/description pixel through its rightmost price pixel, including every size and price row.
  - For every product also return nameBoundingBox, descriptionBoundingBox (when a description exists), priceBoundingBox, and priceLineCount separately. These boxes must tightly cover only those glyphs and priceLineCount must count the visible price rows; they are used to calculate typography from measured pixel height.
  - Every visible food photo, logo, icon, illustration and separator must be returned once in the root images array. Its boundingBox must cover the complete silhouette, including objects clipped by an image edge.
  - Main title, subtitle and every free text element must also contain a boundingBox covering the entire multi-line block so every original foreground pixel can be removed.

  ### 1. CRITICAL RULES FOR IMAGES (DECORATIONS)
  - **IGNORE BACKGROUNDS:** You are STRICTLY FORBIDDEN from selecting the full page background or large texture areas as a decoration image.
  - **DO NOT CLASSIFY TEXT AS AN IMAGE:** Titles, category headers and prices have text bounding boxes in their own JSON objects, never in the images array.
  - **TARGETS:** Only extract distinct visual assets: Food plates, Isolated Icons, Specific Illustrations, or Separator Lines.
  - **PRECISION:** Define boundingBox { x, y, width, height } tightly around the object's visible pixels.

  ### 2. LAYOUT INTELLIGENCE
  - **Category Columns:** Look at the Category Headers. Are they arranged in a Grid/Multi-column layout?
    - 1 Column: Vertical list.
    - 2 Columns: Split left/right.
    - 3 Columns: Grid layout.
     - **CRITICAL:** Count the number of columns of CATEGORIES, not products. Set \`style.layout.categoryColumnCount\` to 1, 2, or 3.
     - Return categories in column reading flow: finish the left column from top to bottom before continuing at the top of the next column to the right. Never move a lower category from the left column after a category from the right column.
  - **Product Columns:** Within a category, are products side-by-side? Set \`style.layout.columnsProducts\`.

  ### 3. GEOMETRY & EXACT MARGINS (CRITICAL)
  You must act as a Ruler. Do not guess standard margins. Measure them relative to the image width (assumed 794px for A4).

  1. **Page Margins:**
     - Measure and return \`layout.marginTop\`, \`marginBottom\`, \`marginLeft\` and \`marginRight\` separately.
     - Convert X measurements to the 794px A4 width and Y measurements to the 1123px A4 height.
     - Also return \`layout.columnGap\`: the empty horizontal distance between category columns, converted to the 794px A4 width.
     - Keep \`layout.contentPadding\` as the average of the four margins only for backwards compatibility.

  2. **Category Positioning:**
     - Identify exactly where the Category Headers start.
     - If \`layout.categoryColumnCount\` is 2, determine the X-split. Does Col 1 start at 10% and Col 2 start at 60%?
     - Return \`layout.categoryColumnWidths\` with one measured usable width per category column, in 794px A4 coordinates. Preserve unequal column widths; do not force equal values.
     - Use this to set precise \`spacing\` values.

  3. **Exact Content Spacing:**
     - \`spacing.headerToContent\`: subtitle bottom to first category top; when there is no subtitle, title bottom to first category top.
     - \`spacing.categoryToFirstProduct\`: category heading bottom to its first product top.
     - \`spacing.productNameToDescription\`: product name bottom to its description top.
     - \`spacing.betweenProducts\`: previous product description bottom to next product name top.
     - \`spacing.productNameToPrice\`: horizontal empty distance between product name and price.
     - Return every spacing in A4 pixels, using the 794x1123 target scale.

  ### 4. DATA EXTRACTION
  - Group products inside their visible category in the root categories array.
  - Extract exact text for Titles. Do not default to "Menu".
  - If a subtitle exists, extract it. If not, set exists: false.
  - **Font Sizes:** Calculate exact \`fontSize\` based on the 794px scale.
  - **Colors:** Act as a HEX Eyedropper. Pick the EXACT pixel color for Backgrounds and Texts.

  Return the JSON strictly matching the schema.
`;

  try {
    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        categories: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              boundingBox: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "Left edge in original-image pixels" },
                  y: { type: Type.NUMBER, description: "Top edge in original-image pixels" },
                  width: { type: Type.NUMBER, description: "Width in original-image pixels" },
                  height: { type: Type.NUMBER, description: "Height in original-image pixels" },
                },
                required: ["x", "y", "width", "height"],
              },
              nameBoundingBox: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  width: { type: Type.NUMBER },
                  height: { type: Type.NUMBER },
                },
                required: ["x", "y", "width", "height"],
              },
              products: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    price: { type: Type.NUMBER },
                    boundingBox: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER, description: "Left edge in original-image pixels" },
                        y: { type: Type.NUMBER, description: "Top edge in original-image pixels" },
                        width: { type: Type.NUMBER, description: "Width in original-image pixels" },
                        height: { type: Type.NUMBER, description: "Height in original-image pixels" },
                      },
                      required: ["x", "y", "width", "height"],
                    },
                    nameBoundingBox: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        width: { type: Type.NUMBER },
                        height: { type: Type.NUMBER },
                      },
                      required: ["x", "y", "width", "height"],
                    },
                    descriptionBoundingBox: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        width: { type: Type.NUMBER },
                        height: { type: Type.NUMBER },
                      },
                      required: ["x", "y", "width", "height"],
                    },
                    priceBoundingBox: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                        width: { type: Type.NUMBER },
                        height: { type: Type.NUMBER },
                      },
                      required: ["x", "y", "width", "height"],
                    },
                    priceLineCount: { type: Type.NUMBER },
                  },
                  required: ["name", "description", "price", "boundingBox", "nameBoundingBox", "priceBoundingBox", "priceLineCount"],
                },
              },
            },
            required: ["name", "boundingBox", "nameBoundingBox", "products"],
          },
        },
        images: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: {
                type: Type.STRING,
                enum: ["food", "logo", "icon", "illustration", "separator", "other"],
              },
              description: { type: Type.STRING },
              relatedCategoryName: { type: Type.STRING },
              relatedProductName: { type: Type.STRING },
              boundingBox: {
                type: Type.OBJECT,
                properties: {
                  x: { type: Type.NUMBER, description: "Left edge in original-image pixels" },
                  y: { type: Type.NUMBER, description: "Top edge in original-image pixels" },
                  width: { type: Type.NUMBER, description: "Width in original-image pixels" },
                  height: { type: Type.NUMBER, description: "Height in original-image pixels" },
                },
                required: ["x", "y", "width", "height"],
              },
            },
            required: ["type", "description", "boundingBox"],
          },
        },
        styleSuggestion: {
          type: Type.OBJECT,
          properties: {
            globalColors: {
                type: Type.OBJECT,
                properties: {
                    background: { type: Type.STRING, description: "Exact Hex from pixel analysis" },
                    backgroundType: { type: Type.STRING, enum: ['solid', 'image/texture'] },
                    primary: { type: Type.STRING, description: "Exact Hex" },
                    secondary: { type: Type.STRING, description: "Exact Hex" },
                    text: { type: Type.STRING, description: "Exact Hex" },
                    borderColor: { type: Type.STRING }
                }
            },
            layout: {
                type: Type.OBJECT,
                properties: {
                    contentPadding: { type: Type.NUMBER, description: "Calculated side margin in px relative to 794px width" },
                    marginTop: { type: Type.NUMBER, description: "Top margin in px relative to 1123px height" },
                    marginBottom: { type: Type.NUMBER, description: "Bottom margin in px relative to 1123px height" },
                    marginLeft: { type: Type.NUMBER, description: "Left margin in px relative to 794px width" },
                    marginRight: { type: Type.NUMBER, description: "Right margin in px relative to 794px width" },
                    columnGap: { type: Type.NUMBER, description: "Horizontal gap between category columns in px relative to 794px width" },
                    globalRadius: { type: Type.NUMBER },
                    hasFrame: { type: Type.BOOLEAN },
                    categoryColumnCount: { type: Type.NUMBER, description: "1, 2, or 3 columns of categories" },
                    categoryColumnWidths: {
                      type: Type.ARRAY,
                      items: { type: Type.NUMBER },
                      description: "Measured usable width of each category column in 794px A4 coordinates"
                    }
                },
                required: ["contentPadding", "marginTop", "marginBottom", "marginLeft", "marginRight", "columnGap", "categoryColumnCount", "categoryColumnWidths"]
            },
            typography: {
                type: Type.OBJECT,
                properties: {
                    mainTitle: {
                        type: Type.OBJECT,
                        properties: {
                            text: { type: Type.STRING },
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER, description: "Pixel size relative to 794px width" },
                            color: { type: Type.STRING },
                            textTransform: { type: Type.STRING, enum: ['uppercase', 'lowercase', 'capitalize', 'none'] },
                            alignment: { type: Type.STRING, enum: ['left', 'center', 'right'] },
                            boundingBox: {
                              type: Type.OBJECT,
                              properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER },
                                width: { type: Type.NUMBER },
                                height: { type: Type.NUMBER }
                              },
                              required: ["x", "y", "width", "height"]
                            }
                        }
                    },
                    subtitle: {
                        type: Type.OBJECT,
                        properties: {
                            exists: { type: Type.BOOLEAN },
                            text: { type: Type.STRING },
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER },
                            color: { type: Type.STRING },
                            textTransform: { type: Type.STRING, enum: ['uppercase', 'lowercase', 'capitalize', 'none'] },
                            boundingBox: {
                              type: Type.OBJECT,
                              properties: {
                                x: { type: Type.NUMBER },
                                y: { type: Type.NUMBER },
                                width: { type: Type.NUMBER },
                                height: { type: Type.NUMBER }
                              },
                              required: ["x", "y", "width", "height"]
                            }
                        }
                    },
                    category: {
                         type: Type.OBJECT,
                         properties: {
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER },
                            color: { type: Type.STRING },
                            textTransform: { type: Type.STRING, enum: ['uppercase', 'lowercase', 'capitalize', 'none'] },
                            alignment: { type: Type.STRING, enum: ['left', 'center', 'right'] }
                         }
                    },
                    productName: {
                         type: Type.OBJECT,
                         properties: {
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER },
                            color: { type: Type.STRING },
                            fontWeight: { type: Type.STRING }
                         }
                    },
                    productDescription: {
                         type: Type.OBJECT,
                         properties: {
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER },
                            color: { type: Type.STRING },
                            fontStyle: { type: Type.STRING, enum: ['normal', 'italic'] }
                         }
                    },
                    productPrice: {
                         type: Type.OBJECT,
                         properties: {
                            fontFamily: { type: Type.STRING, description: "Google Font Name" },
                            fontSize: { type: Type.NUMBER },
                            color: { type: Type.STRING }
                         }
                    }
                }
            },
            spacing: {
                type: Type.OBJECT,
                properties: {
                    titleToSubtitle: { type: Type.NUMBER },
                    headerToContent: { type: Type.NUMBER, description: "Subtitle-to-first-category, or title-to-first-category when subtitle is absent" },
                    categoryToFirstProduct: { type: Type.NUMBER },
                    productNameToDescription: { type: Type.NUMBER },
                    betweenProducts: { type: Type.NUMBER },
                    productNameToPrice: { type: Type.NUMBER }
                },
                required: ["titleToSubtitle", "headerToContent", "categoryToFirstProduct", "productNameToDescription", "betweenProducts", "productNameToPrice"]
            },
            freeTextElements: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        text: { type: Type.STRING },
                        fontSize: { type: Type.NUMBER },
                        color: { type: Type.STRING },
                        alignment: { type: Type.STRING },
                        fontFamily: { type: Type.STRING },
                        fontWeight: { type: Type.STRING },
                        textTransform: { type: Type.STRING },
                        boundingBox: {
                          type: Type.OBJECT,
                          properties: {
                            x: { type: Type.NUMBER },
                            y: { type: Type.NUMBER },
                            width: { type: Type.NUMBER },
                            height: { type: Type.NUMBER }
                          },
                          required: ["x", "y", "width", "height"]
                        }
                    },
                    required: ["text", "boundingBox"]
                }
            }
          }
        },
      },
      required: ["categories", "images", "styleSuggestion"],
    };

    const apiResponse = await fetch("/api/analyze-menu", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        base64Data,
        mimeType,
        prompt,
        responseSchema,
      }),
    });

    if (!apiResponse.ok) {
      const errData = await apiResponse.json().catch(() => ({}));
      throw new Error(errData.error || `Erro na API: ${apiResponse.statusText}`);
    }

    const resultData = await apiResponse.json();
    const text = resultData.text;

    if (!text) throw new Error("No response from AI");

    const data = JSON.parse(text);

    const normalizeBoundingBox = (box: any): BoundingBox | undefined => {
      if (!box) return undefined;

      const x = Number(box.x);
      const y = Number(box.y);
      const width = Number(box.width);
      const height = Number(box.height);
      if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
        return undefined;
      }

      const clampedX = Math.max(0, Math.min(x, imageDimensions.width - 1));
      const clampedY = Math.max(0, Math.min(y, imageDimensions.height - 1));
      return {
        x: clampedX,
        y: clampedY,
        width: Math.max(1, Math.min(width, imageDimensions.width - clampedX)),
        height: Math.max(1, Math.min(height, imageDimensions.height - clampedY)),
      };
    };

    const mappedCategories: MenuCategory[] = (Array.isArray(data.categories) ? data.categories : [])
      .map((category: any): MenuCategory => ({
        id: crypto.randomUUID(),
        name: String(category.name || '').trim(),
        boundingBox: normalizeBoundingBox(category.boundingBox),
        nameBoundingBox: normalizeBoundingBox(category.nameBoundingBox),
        products: (Array.isArray(category.products) ? category.products : []).map((product: any) => ({
          id: crypto.randomUUID(),
          name: String(product.name || '').trim(),
          description: String(product.description || '').trim(),
          price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
          boundingBox: normalizeBoundingBox(product.boundingBox),
          nameBoundingBox: normalizeBoundingBox(product.nameBoundingBox),
          descriptionBoundingBox: normalizeBoundingBox(product.descriptionBoundingBox),
          priceBoundingBox: normalizeBoundingBox(product.priceBoundingBox),
          priceLineCount: Math.max(1, Number(product.priceLineCount) || 1),
        })),
      }))
      .filter((category: MenuCategory) => category.name && category.products.length > 0);

    const mappedProducts: Product[] = mappedCategories.flatMap((category) => (
      category.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        category: category.name,
        image: '',
        boundingBox: product.boundingBox,
        nameBoundingBox: product.nameBoundingBox,
        descriptionBoundingBox: product.descriptionBoundingBox,
        priceBoundingBox: product.priceBoundingBox,
        priceLineCount: product.priceLineCount,
      }))
    ));

    const mappedImages: ExtractedImage[] = (Array.isArray(data.images) ? data.images : [])
      .map((image: any): ExtractedImage => ({
        id: crypto.randomUUID(),
        type: image.type || 'other',
        description: String(image.description || '').trim(),
        relatedCategoryName: image.relatedCategoryName || undefined,
        relatedProductName: image.relatedProductName || undefined,
        boundingBox: normalizeBoundingBox(image.boundingBox),
      }))
      .filter((image: ExtractedImage) => Boolean(image.boundingBox));

    return {
      categories: mappedCategories,
      products: mappedProducts,
      extractedImages: mappedImages,
      styleSuggestion: data.styleSuggestion,
    };

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};
