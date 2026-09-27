import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

function publicChunkProxyPlugin(): Plugin {
  return {
    name: 'public-chunk-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url && req.url.startsWith('/api/public-chunk')) {
          try {
            const urlObj = new URL(req.url, 'http://localhost:3000');
            const fileId = urlObj.searchParams.get('fileId');
            if (!fileId) {
              res.statusCode = 400;
              res.end('Missing fileId');
              return;
            }

            const primaryUrl = `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&authuser=0`;
            let driveRes = await fetch(primaryUrl, { redirect: 'follow' });

            if (!driveRes.ok) {
              const fallbackUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}&confirm=t`;
              driveRes = await fetch(fallbackUrl, { redirect: 'follow' });
            }

            if (!driveRes.ok) {
              res.statusCode = driveRes.status;
              res.end(`Chunk fetch failed: ${driveRes.status}`);
              return;
            }

            const contentType = driveRes.headers.get('content-type') || 'application/octet-stream';
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');

            const arrayBuffer = await driveRes.arrayBuffer();
            res.end(Buffer.from(arrayBuffer));
          } catch (e: any) {
            res.statusCode = 500;
            res.end(`Proxy error: ${e.message}`);
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), publicChunkProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
