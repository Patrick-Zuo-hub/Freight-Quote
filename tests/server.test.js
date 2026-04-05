import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.js';
import { FreightError } from '../lib/freight-errors.js';

async function withServer(options, run) {
  const app = createServer(options);
  app.listen(0, '127.0.0.1');

  try {
    await once(app, 'listening');
    const { port } = app.address();
    await run({ port, app });
  } finally {
    if (app.listening) {
      await new Promise((resolve) => app.close(resolve));
    }
  }
}

test('GET /health returns ok payload', async () => {
  await withServer({ rootDir: process.cwd() }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
  });
});

test('GET /api/freight/meta returns store metadata', async () => {
  const store = {
    getMeta() {
      return {
        hasDataset: true,
        suppliers: [{ id: 'zhedao-w14', name: '赤道国际' }]
      };
    },
    getDiscounts() {
      return { suppliers: {} };
    }
  };

  await withServer({ rootDir: process.cwd(), store }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/freight/meta`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, {
      hasDataset: true,
      suppliers: [{ id: 'zhedao-w14', name: '赤道国际' }]
    });
  });
});

test('POST /api/freight/discounts saves supplier discount', async () => {
  const calls = [];
  const store = {
    getMeta() {
      return { hasDataset: false, suppliers: [] };
    },
    getDiscounts() {
      return { suppliers: {} };
    },
    async saveDiscount(supplierId, payload) {
      calls.push({ supplierId, payload });
      return {
        supplierId,
        discountAmount: payload.discountAmount,
        enabled: payload.enabled
      };
    }
  };

  await withServer({ rootDir: process.cwd(), store }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/freight/discounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId: 'zhedao-w14', discountAmount: 0.3, enabled: true })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
      supplierId: 'zhedao-w14',
      payload: { supplierId: 'zhedao-w14', discountAmount: 0.3, enabled: true }
    });
    assert.deepEqual(payload, {
      ok: true,
      discount: {
        supplierId: 'zhedao-w14',
        discountAmount: 0.3,
        enabled: true
      }
    });
  });
});

test('POST /api/freight/batch-query returns query-engine payload', async () => {
  const store = {
    getMeta() {
      return { hasDataset: true, suppliers: [] };
    },
    getDiscounts() {
      return { suppliers: {} };
    }
  };
  const queryEngine = {
    batchQuery(body) {
      return {
        supplierId: body.supplierId,
        deliveryOptionKey: body.deliveryOptionKey,
        columnCount: 1,
        rows: [{ warehouseCode: 'ONT8', cells: [{ finalPrice: 4.1, channel: '渠道 A' }] }]
      };
    }
  };

  await withServer({ rootDir: process.cwd(), store, queryEngine }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/freight/batch-query`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId: 'zhedao-w14', deliveryOptionKey: 'shenzhen', warehouseCodes: ['ONT8'] })
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.supplierId, 'zhedao-w14');
    assert.equal(payload.columnCount, 1);
    assert.equal(payload.rows[0].cells[0].channel, '渠道 A');
  });
});

test('GET /api/freight/query returns single-warehouse comparison payload', async () => {
  const store = {
    getMeta() {
      return { hasDataset: true, suppliers: [] };
    },
    getDiscounts() {
      return { suppliers: {} };
    }
  };
  const queryEngine = {
    queryByWarehouse(warehouseCode) {
      return {
        warehouseCode,
        totalCount: 1,
        supplierGroups: [{ supplier: { id: 'zhedao-w14' }, count: 1, records: [{ channel: '渠道 A', finalPrice: 4.1 }] }]
      };
    }
  };

  await withServer({ rootDir: process.cwd(), store, queryEngine }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/freight/query?warehouse=ONT8`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.warehouseCode, 'ONT8');
    assert.equal(payload.supplierGroups[0].records[0].finalPrice, 4.1);
  });
});

test('FreightError responses are returned as layered 400 payloads', async () => {
  const store = {
    getMeta() {
      return { hasDataset: false, suppliers: [] };
    },
    getDiscounts() {
      return { suppliers: {} };
    },
    async saveDiscount() {
      throw new FreightError({
        code: 'WAREHOUSE_COLUMN_NOT_FOUND',
        level: 'structure',
        message: '模板已识别，但仓库代码列未找到。',
        details: { supplierId: 'nuoku-vip' }
      });
    }
  };

  await withServer({ rootDir: process.cwd(), store }, async ({ port }) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/freight/discounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ supplierId: 'nuoku-vip', discountAmount: 0.3, enabled: true })
    });
    const payload = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(payload, {
      ok: false,
      code: 'WAREHOUSE_COLUMN_NOT_FOUND',
      level: 'structure',
      message: '模板已识别，但仓库代码列未找到。',
      details: { supplierId: 'nuoku-vip' }
    });
  });
});
