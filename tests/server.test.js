import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.js';

test('GET /health returns ok payload', async () => {
  const app = createServer({ rootDir: process.cwd() });
  app.listen(0, '127.0.0.1');

  try {
    await once(app, 'listening');
    const { port } = app.address();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
  } finally {
    if (app.listening) {
      await new Promise((resolve) => app.close(resolve));
    }
  }
});
