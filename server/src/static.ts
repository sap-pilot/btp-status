import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response } from 'express';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientBuild = join(__dirname, '..', 'public');

export function serveStatic(app: Express): void {
  app.use(
    express.static(clientBuild, {
      setHeaders(res, filePath) {
        const ext = extname(filePath).toLowerCase();
        if (ext === '.html') {
          // Always revalidate HTML so clients pick up new asset hashes
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (ext === '.js' || ext === '.css') {
          // Vite outputs content-hashed filenames — safe for long-term immutable caching
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (['.png', '.ico', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    }),
  );
  app.get(/^(?!\/api|\/health).*$/, (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(join(clientBuild, 'index.html'), err => {
      if (err) res.status(404).send('Not found');
    });
  });
}
