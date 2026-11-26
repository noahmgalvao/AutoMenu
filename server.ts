import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { generateMenuAnalysis } from './src/infrastructure/gemini/generateMenuAnalysis';
import { createAnalyzeMenuRoute } from './src/infrastructure/http/analyzeMenuRoute';

import { revisionHandler, revisionWorkerHandler } from './src/infrastructure/revisions/http';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 image data
  app.use(express.json({ limit: "50mb" }));

  app.all('/api/revisions', express.json({limit:'10mb'}), revisionHandler);
  app.all('/api/revisions-worker', revisionWorkerHandler);

  app.post('/api/analyze-menu', createAnalyzeMenuRoute(generateMenuAnalysis));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
