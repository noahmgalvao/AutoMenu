import type { RequestHandler } from 'express';
import type { MenuAnalysisRequest } from '../gemini/generateMenuAnalysis';

type AnalyzeMenu = (input: MenuAnalysisRequest) => Promise<string | undefined>;

export function createAnalyzeMenuRoute(analyzeMenu: AnalyzeMenu): RequestHandler {
  return async (req, res) => {
    try {
      const { base64Data, mimeType, prompt, responseSchema } = req.body;
      if (!base64Data || !mimeType || !prompt) {
        return res.status(400).json({ error: 'Não foi possível processar a solicitação.' });
      }

      const text = await analyzeMenu({ base64Data, mimeType, prompt, responseSchema });
      res.json({ text });
    } catch (error) {
      console.error('Gemini server error:', error);
      res.status(500).json({ error: 'Não foi possível analisar o cardápio. Tente novamente.' });
    }
  };
}
