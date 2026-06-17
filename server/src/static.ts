import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response } from 'express';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientBuild = join(__dirname, '..', 'public');

export function serveStatic(app: Express): void {
  app.use(express.static(clientBuild));
  app.get(/^(?!\/api|\/health).*$/, (_req: Request, res: Response) => {
    res.sendFile(join(clientBuild, 'index.html'), err => {
      if (err) res.status(404).send('Not found');
    });
  });
}
