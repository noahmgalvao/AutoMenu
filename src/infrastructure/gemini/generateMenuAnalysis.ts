import { GoogleGenAI, type Schema } from '@google/genai';

export interface MenuAnalysisRequest {
  base64Data: string;
  mimeType: string;
  prompt: string;
  responseSchema?: Schema;
}

export async function generateMenuAnalysis({ base64Data, mimeType, prompt, responseSchema }: MenuAnalysisRequest) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: { parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }] },
    config: { responseMimeType: 'application/json', responseSchema },
  });
  return response.text;
}
