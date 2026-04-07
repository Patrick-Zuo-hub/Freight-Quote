import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function startCliServer({ port }) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  return child;
}

function waitForLine(stream, pattern) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const onData = (chunk) => {
      buffer += chunk;
      if (pattern.test(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };

    const onClose = () => {
      cleanup();
      reject(new Error(`Stream closed before matching ${pattern}: ${buffer}`));
    };

    const cleanup = () => {
      stream.off('data', onData);
      stream.off('close', onClose);
      stream.off('end', onClose);
    };

    stream.on('data', onData);
    stream.on('close', onClose);
    stream.on('end', onClose);
  });
}

async function stopProcess(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await once(child, 'exit');
}

test('CLI server listens on PORT when provided', async () => {
  const port = await getFreePort();
  const child = startCliServer({ port });

  try {
    const output = await waitForLine(child.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}/freight-quote\\.html`));
    assert.match(output, new RegExp(`http://127\\.0\\.0\\.1:${port}/freight-quote\\.html`));

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true });
  } finally {
    await stopProcess(child);
  }
});

test('CLI server prints a friendly error when the port is already in use', async () => {
  const occupiedPort = await getFreePort();
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(occupiedPort, '127.0.0.1', resolve);
  });

  const child = startCliServer({ port: occupiedPort });

  try {
    const stderr = await waitForLine(child.stderr, /端口 .* 已被占用|EADDRINUSE/);
    const [exitCode] = await once(child, 'exit');

    assert.equal(exitCode, 1);
    assert.match(stderr, /端口 .* 已被占用/);
    assert.doesNotMatch(stderr, /Unhandled 'error' event/);
  } finally {
    await stopProcess(child).catch(() => {});
    await new Promise((resolve, reject) => blocker.close((error) => (error ? reject(error) : resolve())));
  }
});
