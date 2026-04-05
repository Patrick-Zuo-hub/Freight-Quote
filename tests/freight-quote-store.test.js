import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createFreightQuoteStore } from '../lib/freight-quote-store.js';
import { FreightError } from '../lib/freight-errors.js';

test('failed replacement clears supplier dataset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'freight-store-'));
  const store = createFreightQuoteStore({
    rootDir,
    detectDataset: () => ({
      supplier: { id: 'zhedao-w14', name: '赤道国际', code: 'zhedao', order: 1 },
      sourceFilename: 'ok.xlsx',
      records: [{ warehouseCode: 'ONT8', channel: 'A' }]
    })
  });

  await store.importWorkbook({
    buffer: Buffer.from('ok'),
    filename: 'ok.xlsx',
    supplierId: 'zhedao-w14'
  });

  const failingStore = createFreightQuoteStore({
    rootDir,
    detectDataset: () => {
      throw new FreightError({ code: 'NO_USABLE_RECORDS', level: 'import', message: 'bad file' });
    }
  });

  await assert.rejects(
    () =>
      failingStore.importWorkbook({
        buffer: Buffer.from('bad'),
        filename: 'bad.xlsx',
        supplierId: 'zhedao-w14'
      }),
    /bad file/
  );

  assert.equal(failingStore.hasDataset('zhedao-w14'), false);
});

test('supplier mismatch rejects without clearing the existing dataset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'freight-mismatch-'));
  const store = createFreightQuoteStore({
    rootDir,
    detectDataset: () => ({
      supplier: { id: 'zhedao-w14', name: '赤道国际', code: 'zhedao', order: 1 },
      sourceFilename: 'ok.xlsx',
      records: [{ warehouseCode: 'ONT8', channel: 'A' }]
    })
  });

  await store.importWorkbook({
    buffer: Buffer.from('ok'),
    filename: 'ok.xlsx',
    supplierId: 'zhedao-w14'
  });

  const mismatchStore = createFreightQuoteStore({
    rootDir,
    detectDataset: () => ({
      supplier: { id: 'nuoku-vip', name: '纽酷国际', code: 'nuoku', order: 2 },
      sourceFilename: 'nuoku.xlsx',
      records: [{ warehouseCode: 'LAX9', channel: 'B' }]
    })
  });

  await assert.rejects(
    () =>
      mismatchStore.importWorkbook({
        buffer: Buffer.from('mismatch'),
        filename: 'nuoku.xlsx',
        supplierId: 'zhedao-w14'
      }),
    /当前上传入口是“zhedao-w14”，但文件识别结果是“nuoku-vip”/
  );

  assert.equal(mismatchStore.hasDataset('zhedao-w14'), true);
});

test('discounts persist independently from current dataset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'freight-discounts-'));
  const store = createFreightQuoteStore({ rootDir, detectDataset: () => null });

  await store.saveDiscount('zhedao-w14', { discountAmount: 0.3, enabled: true });
  const payload = JSON.parse(await readFile(path.join(rootDir, 'data/freight/discounts.json'), 'utf8'));

  assert.equal(payload.suppliers['zhedao-w14'].discountAmount, 0.3);
});
