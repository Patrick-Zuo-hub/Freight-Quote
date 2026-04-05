import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFreightQuoteStore } from './lib/freight-quote-store.js';
import { createFreightQueryEngine } from './lib/freight-query-engine.js';
import { FreightError, isFreightError } from './lib/freight-errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function readJson(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function createInternalServerError() {
  return {
    ok: false,
    code: 'INTERNAL_SERVER_ERROR',
    level: 'import',
    message: '服务处理失败，请稍后重试。'
  };
}

export function createServer({ rootDir = __dirname, store, queryEngine } = {}) {
  const resolvedStore = store || createFreightQuoteStore({ rootDir });
  const getQueryEngine = () =>
    queryEngine ||
    createFreightQueryEngine({
      storage: resolvedStore.getCurrent(),
      discounts: resolvedStore.getDiscounts()
    });

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

      if (requestUrl.pathname === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/freight/meta') {
        return sendJson(res, 200, resolvedStore.getMeta());
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/freight/discounts') {
        return sendJson(res, 200, resolvedStore.getDiscounts());
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/freight/query') {
        return sendJson(res, 200, getQueryEngine().queryByWarehouse(requestUrl.searchParams.get('warehouse') || ''));
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/freight/discounts') {
        const body = await readJson(req);
        if (!body?.supplierId) {
          throw new FreightError({
            code: 'SUPPLIER_ID_REQUIRED',
            level: 'structure',
            message: '保存优惠金额时必须提供物流商标识。'
          });
        }
        return sendJson(res, 200, {
          ok: true,
          discount: await resolvedStore.saveDiscount(body.supplierId, body)
        });
      }

      if (req.method === 'POST' && requestUrl.pathname === '/api/freight/batch-query') {
        const body = await readJson(req);
        return sendJson(res, 200, getQueryEngine().batchQuery(body));
      }

      if (requestUrl.pathname === '/' || requestUrl.pathname === '/freight-quote.html') {
        const html = await readFile(path.join(rootDir, 'freight-quote.html'), 'utf8');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      if (requestUrl.pathname === '/freight-quote-app.js') {
        const js = await readFile(path.join(rootDir, 'freight-quote-app.js'), 'utf8');
        res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
        res.end(js);
        return;
      }

      sendJson(res, 404, { ok: false, message: 'Not Found' });
    } catch (error) {
      if (isFreightError(error)) {
        return sendJson(res, 400, error.toJSON());
      }

      return sendJson(res, 500, createInternalServerError());
    }
  });

  return server;
}

if (process.argv[1] === __filename) {
  const server = createServer();
  server.listen(8787, '127.0.0.1', () => {
    console.log('Freight Quote running at http://127.0.0.1:8787/freight-quote.html');
  });
}
