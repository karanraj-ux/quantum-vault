import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Zero-Auth Public Chunk Proxy:
  // Proxies Google Drive binary chunk downloads server-side to completely bypass browser CORS limitations.
  app.get('/api/public-chunk', async (req, res) => {
    try {
      const fileId = req.query.fileId as string;
      if (!fileId || typeof fileId !== 'string') {
        res.status(400).send('Missing required fileId query parameter');
        return;
      }

      // 1. Direct usercontent export download (fastest, standard for Google Drive public files)
      const primaryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`;
      let driveRes = await fetch(primaryUrl, { redirect: 'follow' });

      // 2. Secondary fallback via uc?export=download with confirm token
      if (!driveRes.ok) {
        const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
        driveRes = await fetch(fallbackUrl, { redirect: 'follow' });
      }

      // 3. Third fallback for files with confirm warnings
      if (!driveRes.ok) {
        const altUrl = `https://drive.google.com/uc?id=${encodeURIComponent(fileId)}&export=download`;
        driveRes = await fetch(altUrl, { redirect: 'follow' });
      }

      if (!driveRes.ok) {
        res.status(driveRes.status).send(`Upstream chunk retrieval failed with status ${driveRes.status}. Make sure the file has public link permissions.`);
        return;
      }

      const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
      if (contentType.toLowerCase().includes('text/html')) {
        res.status(404).send('Google Drive returned an HTML error/warning page instead of chunk binary data (file likely deleted or not public).');
        return;
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400');

      const arrayBuffer = await driveRes.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      console.error('Public chunk proxy server error:', err);
      res.status(500).send(`Failed to proxy chunk: ${err.message}`);
    }
  });

  // Vite middleware for development vs static build for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
