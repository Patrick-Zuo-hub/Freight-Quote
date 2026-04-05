import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer({ rootDir = __dirname } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === '/' || req.url === '/freight-quote.html') {
      try {
        const html = await readFile(path.join(rootDir, 'freight-quote.html'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Failed to load freight-quote.html' }));
      }
      return;
    }

    if (req.url === '/freight-quote-app.js') {
      try {
        const js = await readFile(path.join(rootDir, 'freight-quote-app.js'), 'utf8');
        res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
        res.end(js);
      } catch {
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Failed to load freight-quote-app.js' }));
      }
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: 'Not Found' }));
  });

  return server;
}

if (process.argv[1] === __filename) {
  const server = createServer();
  server.listen(8787, '127.0.0.1', () => {
    console.log('Freight Quote running at http://127.0.0.1:8787/freight-quote.html');
  });
}
