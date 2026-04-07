import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFreightQuoteStore } from './lib/freight-quote-store.js';
import { createFreightQueryEngine } from './lib/freight-query-engine.js';
import { FreightError, isFreightError } from './lib/freight-errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;

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
  const getQueryEngine = () => {
    if (queryEngine) {
      return queryEngine;
    }

    if (typeof resolvedStore.getCurrent !== 'function' || typeof resolvedStore.getDiscounts !== 'function') {
      return null;
    }

    return createFreightQueryEngine({
      storage: resolvedStore.getCurrent(),
      discounts: resolvedStore.getDiscounts()
    });
  };

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');

      if (requestUrl.pathname === '/health') {
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && requestUrl.pathname === '/api/freight/meta') {
        const meta = resolvedStore.getMeta();
        const discounts = typeof resolvedStore.getDiscounts === 'function' ? resolvedStore.getDiscounts() : { suppliers: {} };
        const engine = getQueryEngine();
        const suppliers = Array.isArray(meta.suppliers)
          ? meta.suppliers.map((supplier) => ({
              ...supplier,
              discount: discounts.suppliers?.[supplier.id] || {
                supplierId: supplier.id,
                discountAmount: 0,
                enabled: false
              },
              deliveryOptions: engine?.getDeliveryOptions ? engine.getDeliveryOptions(supplier.id) : supplier.deliveryOptions || []
            }))
          : [];
        return sendJson(res, 200, { ...meta, suppliers });
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

      if (req.method === 'POST' && requestUrl.pathname === '/api/freight/upload') {
        const body = await readJson(req);
        if (!body?.supplierId || !body?.filename || !body?.contentBase64) {
          throw new FreightError({
            code: 'UPLOAD_PAYLOAD_INVALID',
            level: 'structure',
            message: '上传报价时必须提供物流商、文件名和文件内容。'
          });
        }

        const imported = await resolvedStore.importWorkbook({
          supplierId: body.supplierId,
          filename: body.filename,
          buffer: Buffer.from(body.contentBase64, 'base64')
        });

        return sendJson(res, 200, {
          ok: true,
          message: `${imported?.supplier?.name || body.supplierId}报价已更新。`,
          supplier: imported?.supplier || null,
          meta: resolvedStore.getMeta()
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

export function resolveServerConfig(env = process.env) {
  const configuredPort = Number.parseInt(env.PORT || '', 10);

  return {
    host: env.HOST || DEFAULT_HOST,
    port: Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : DEFAULT_PORT
  };
}

export function createPortInUseMessage({ host, port }) {
  return `端口 ${host}:${port} 已被占用。请先关闭旧服务，或使用 PORT=${port + 1} npm start 改用其他端口。`;
}

export function startServer(options = {}) {
  const server = createServer(options);
  const { host, port } = resolveServerConfig(options.env);

  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        reject(new Error(createPortInUseMessage({ host, port }), { cause: error }));
        return;
      }

      reject(error);
    });

    server.listen(port, host, () => {
      resolve({ server, host, port });
    });
  });
}

if (process.argv[1] === __filename) {
  startServer()
    .then(({ host, port }) => {
      console.log(`Freight Quote running at http://${host}:${port}/freight-quote.html`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
