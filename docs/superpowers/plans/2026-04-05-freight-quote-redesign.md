# Freight Quote Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable local freight quote application that supports layered upload errors, ignores hidden sheets, stores per-supplier discounts, adds batch query, refreshes the UI, and leaves the project ready for git version control and GitHub sharing.

**Architecture:** Keep a single local Node.js process that serves both the HTML app and JSON APIs. Split logic into focused modules for HTTP routing, workbook parsing, dataset storage, query shaping, and frontend interactions so Excel parsing rules and UI behavior can evolve independently.

**Tech Stack:** Node.js, `xlsx`, built-in `node:test`, vanilla HTML/CSS/JavaScript

---

## File Structure

### Create

- `.gitignore` - ignore runtime data, uploads, and local-only artifacts
- `README.md` - setup, run, test, and usage guide for new users
- `package.json` - local scripts and dependency declarations
- `server.js` - local HTTP server, static file serving, API routing
- `lib/freight-errors.js` - normalized app and parser error helpers
- `lib/freight-sheet-utils.js` - workbook visibility helpers and shared cell readers
- `lib/freight-parsers/index.js` - parser selection and shared import entry
- `lib/freight-parsers/shared.js` - normalized parser helpers
- `lib/freight-parsers/zhedao.js` - 赤道 parser
- `lib/freight-parsers/nuoku.js` - 纽酷 parser
- `lib/freight-parsers/meiqi.js` - 美琦 parser
- `lib/freight-quote-store.js` - dataset storage, workbook persistence, discount persistence
- `lib/freight-query-engine.js` - single-query and batch-query shaping
- `freight-quote.html` - refreshed Apple-like page shell
- `freight-quote-app.js` - uploads, discounts, batch query, comparison rendering
- `tests/freight-parsers/shared.test.js` - hidden sheet filtering and shared parser utilities
- `tests/freight-parsers/zhedao.test.js` - 赤道 parser behavior
- `tests/freight-parsers/nuoku.test.js` - 纽酷 parser behavior
- `tests/freight-parsers/meiqi.test.js` - 美琦 parser behavior
- `tests/freight-quote-store.test.js` - import replacement, clearing, discount persistence
- `tests/freight-query-engine.test.js` - single query, batch query, discount application
- `tests/server.test.js` - API behavior and response shapes

### Reuse as references only

- `Reference/freight-quote.html`
- `Reference/freight-quote-app.js`
- `Reference/freight-quote-store.js`
- `Reference/data/freight/current.json`

### Runtime data files created by the app

- `data/freight/current.json`
- `data/freight/discounts.json`
- `data/freight/uploads/*`

---

### Task 1: Bootstrap the runnable local app and test harness

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `package.json`
- Create: `server.js`
- Create: `freight-quote.html`
- Create: `freight-quote-app.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Write the failing server smoke test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from '../server.js';

test('GET /health returns ok payload', async () => {
  const app = createServer({ rootDir: process.cwd() });
  app.listen(0);
  await once(app, 'listening');
  const { port } = app.address();

  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload, { ok: true });

  await new Promise((resolve) => app.close(resolve));
});
```

- [ ] **Step 2: Run the smoke test to verify it fails**

Run: `node --test tests/server.test.js`

Expected: FAIL with `Cannot find module '../server.js'` or missing `createServer` export.

- [ ] **Step 3: Add package metadata and scripts**

```json
{
  "name": "freight-quote",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "dependencies": {
    "xlsx": "^0.18.5"
  }
}
```

- [ ] **Step 4: Add repository-ready ignore rules and quickstart documentation**

```gitignore
node_modules/
data/freight/uploads/
data/freight/current.json
data/freight/discounts.json
.superpowers/
.DS_Store
```

```md
# Freight Quote

本地物流价格比价工具。

## 安装

```bash
npm install
```

## 启动

```bash
npm start
```

打开 `http://127.0.0.1:8787/freight-quote.html`

## 测试

```bash
npm test
```
```

- [ ] **Step 5: Add a minimal HTTP server implementation**

```js
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer({ rootDir = __dirname } = {}) {
  return http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url === '/' || req.url === '/freight-quote.html') {
      const html = await readFile(path.join(rootDir, 'freight-quote.html'), 'utf8');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.url === '/freight-quote-app.js') {
      const js = await readFile(path.join(rootDir, 'freight-quote-app.js'), 'utf8');
      res.writeHead(200, { 'content-type': 'application/javascript; charset=utf-8' });
      res.end(js);
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: 'Not Found' }));
  });
}

if (process.argv[1] === __filename) {
  const server = createServer();
  server.listen(8787, '127.0.0.1', () => {
    console.log('Freight Quote running at http://127.0.0.1:8787/freight-quote.html');
  });
}
```

- [ ] **Step 6: Add the initial page shell and client bootstrap**

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>物流价格比价</title>
</head>
<body>
  <main id="app">Freight Quote</main>
  <script type="module" src="./freight-quote-app.js"></script>
</body>
</html>
```

```js
const app = document.getElementById('app');

if (app) {
  app.textContent = 'Freight Quote app booted.';
}
```

- [ ] **Step 7: Run the smoke test again**

Run: `node --test tests/server.test.js`

Expected: PASS with one passing test.

- [ ] **Step 8: Run the server manually**

Run: `npm start`

Expected: console prints `Freight Quote running at http://127.0.0.1:8787/freight-quote.html`

- [ ] **Step 9: Initialize git locally if this workspace is not already a repository**

Run:

```bash
git init -b main
```

Expected: `.git/` created and `git status` works.

- [ ] **Step 10: Commit checkpoint if git is initialized**

```bash
git add .gitignore README.md package.json server.js freight-quote.html freight-quote-app.js tests/server.test.js
git commit -m "chore: bootstrap freight quote app shell"
```

---

### Task 2: Add shared parser utilities and layered app errors

**Files:**
- Create: `lib/freight-errors.js`
- Create: `lib/freight-sheet-utils.js`
- Create: `lib/freight-parsers/shared.js`
- Test: `tests/freight-parsers/shared.test.js`

- [ ] **Step 1: Write failing tests for hidden-sheet filtering and structured errors**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { getVisibleSheetNames } from '../../lib/freight-sheet-utils.js';
import { FreightError } from '../../lib/freight-errors.js';

test('getVisibleSheetNames excludes hidden and veryHidden sheets', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['A']]), 'Visible');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['B']]), 'Hidden');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['C']]), 'VeryHidden');
  workbook.Workbook = {
    Sheets: [
      { name: 'Visible', Hidden: 0 },
      { name: 'Hidden', Hidden: 1 },
      { name: 'VeryHidden', Hidden: 2 }
    ]
  };

  assert.deepEqual(getVisibleSheetNames(workbook), ['Visible']);
});

test('FreightError serializes code level message and details', () => {
  const error = new FreightError({
    code: 'MISSING_REQUIRED_SHEET',
    level: 'sheet',
    message: '模板已识别，但缺少关键工作表：TK直送',
    details: { sheetName: 'TK直送' }
  });

  assert.deepEqual(error.toJSON(), {
    ok: false,
    code: 'MISSING_REQUIRED_SHEET',
    level: 'sheet',
    message: '模板已识别，但缺少关键工作表：TK直送',
    details: { sheetName: 'TK直送' }
  });
});
```

- [ ] **Step 2: Run parser shared tests to verify they fail**

Run: `node --test tests/freight-parsers/shared.test.js`

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement structured error helpers**

```js
export class FreightError extends Error {
  constructor({ code, level, message, details = {} }) {
    super(message);
    this.name = 'FreightError';
    this.code = code;
    this.level = level;
    this.details = details;
  }

  toJSON() {
    return {
      ok: false,
      code: this.code,
      level: this.level,
      message: this.message,
      details: this.details
    };
  }
}

export function isFreightError(error) {
  return error instanceof FreightError;
}
```

- [ ] **Step 4: Implement workbook visibility helpers**

```js
export function getWorkbookSheetMeta(workbook) {
  const entries = workbook.Workbook?.Sheets || [];
  return new Map(entries.map((entry) => [entry.name, entry.Hidden ?? 0]));
}

export function getVisibleSheetNames(workbook) {
  const meta = getWorkbookSheetMeta(workbook);
  return workbook.SheetNames.filter((name) => (meta.get(name) ?? 0) === 0);
}

export function getVisibleSheets(workbook) {
  return getVisibleSheetNames(workbook).map((name) => [name, workbook.Sheets[name]]);
}
```

- [ ] **Step 5: Add shared parser primitives**

```js
import { FreightError } from '../freight-errors.js';

export function normalizeWarehouseCode(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

export function assertSheetExists(sheet, sheetName, supplierName) {
  if (!sheet) {
    throw new FreightError({
      code: 'MISSING_REQUIRED_SHEET',
      level: 'sheet',
      message: `模板已识别，但缺少关键工作表：${sheetName}`,
      details: { supplierName, sheetName }
    });
  }
}
```

- [ ] **Step 6: Run shared parser tests again**

Run: `node --test tests/freight-parsers/shared.test.js`

Expected: PASS with two passing tests.

- [ ] **Step 7: Commit checkpoint if git is initialized**

```bash
git add lib/freight-errors.js lib/freight-sheet-utils.js lib/freight-parsers/shared.js tests/freight-parsers/shared.test.js
git commit -m "feat: add shared parser utilities and error model"
```

---

### Task 3: Implement parser entrypoint and 赤道 parser with hidden-sheet behavior

**Files:**
- Create: `lib/freight-parsers/index.js`
- Create: `lib/freight-parsers/zhedao.js`
- Test: `tests/freight-parsers/zhedao.test.js`

- [ ] **Step 1: Write failing 赤道 parser tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { detectSupplierDataset } from '../../lib/freight-parsers/index.js';

function createWorkbookWithVisibleZhedaoSheet() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 90 }, () => []));
  sheet.B80 = { t: 's', v: 'CA特惠专线-直送' };
  sheet.C80 = { t: 's', v: 'ONT8' };
  sheet.D80 = { t: 'n', v: 4.32 };
  sheet.E80 = { t: 'n', v: 4.52 };
  sheet.K80 = { t: 's', v: '10KG+' };
  sheet.T80 = { t: 's', v: '27天' };
  sheet.U80 = { t: 's', v: '31天' };
  sheet['!ref'] = 'A1:U90';
  XLSX.utils.book_append_sheet(workbook, sheet, '美国运价快速查询表');
  workbook.Workbook = { Sheets: [{ name: '美国运价快速查询表', Hidden: 0 }] };
  return workbook;
}

test('赤道 workbook parses visible query sheet', () => {
  const workbook = createWorkbookWithVisibleZhedaoSheet();
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  const dataset = detectSupplierDataset(buffer, { filename: 'zhedao.xlsx' });

  assert.equal(dataset.supplier.id, 'zhedao-w14');
  assert.equal(dataset.records[0].warehouseCode, 'ONT8');
});

test('hidden 赤道 sheet is ignored and workbook becomes unsupported', () => {
  const workbook = createWorkbookWithVisibleZhedaoSheet();
  workbook.Workbook = { Sheets: [{ name: '美国运价快速查询表', Hidden: 1 }] };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(
    () => detectSupplierDataset(buffer, { filename: 'zhedao-hidden.xlsx' }),
    /暂不支持这份报价表模板/
  );
});
```

- [ ] **Step 2: Run 赤道 parser tests to verify they fail**

Run: `node --test tests/freight-parsers/zhedao.test.js`

Expected: FAIL because parser entrypoint does not exist yet.

- [ ] **Step 3: Implement parser entrypoint with visible-sheet detection**

```js
import XLSX from 'xlsx';
import { FreightError } from '../freight-errors.js';
import { getVisibleSheetNames } from '../freight-sheet-utils.js';
import { createZhedaoDataset } from './zhedao.js';

export function detectSupplierDataset(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellNF: true, cellText: true });
  const visibleSheetNames = getVisibleSheetNames(workbook);

  if (visibleSheetNames.includes('美国运价快速查询表')) {
    return createZhedaoDataset(workbook, options);
  }

  throw new FreightError({
    code: 'UNSUPPORTED_TEMPLATE',
    level: 'template',
    message: '暂不支持这份报价表模板，请确认是赤道、纽酷或美琦的标准报价单。'
  });
}
```

- [ ] **Step 4: Implement the 赤道 parser**

```js
import { assertSheetExists, normalizeWarehouseCode } from './shared.js';
import { FreightError } from '../freight-errors.js';

export function createZhedaoDataset(workbook, { filename = 'zhedao.xlsx' } = {}) {
  const sheet = workbook.Sheets['美国运价快速查询表'];
  assertSheetExists(sheet, '美国运价快速查询表', '赤道国际');

  if (!sheet['!ref']) {
    throw new FreightError({
      code: 'EMPTY_REQUIRED_SHEET',
      level: 'structure',
      message: '工作表“美国运价快速查询表”没有可读取的数据。',
      details: { supplierId: 'zhedao-w14', sheetName: '美国运价快速查询表' }
    });
  }

  const records = [];
  for (let rowNumber = 80; rowNumber <= 5000; rowNumber += 1) {
    const channel = sheet[`B${rowNumber}`]?.v;
    const warehouseCode = normalizeWarehouseCode(sheet[`C${rowNumber}`]?.v);
    if (!channel || !warehouseCode) continue;

    records.push({
      supplierId: 'zhedao-w14',
      supplierName: '赤道国际',
      sheetName: '美国运价快速查询表',
      rowNumber,
      channel: String(channel).trim(),
      warehouseCode,
      yiwuPackageTaxPrice: Number(sheet[`D${rowNumber}`]?.v ?? NaN),
      shenzhenPackageTaxPrice: Number(sheet[`E${rowNumber}`]?.v ?? NaN),
      yiwuOriginLabel: '义乌',
      shenzhenOriginLabel: '深圳',
      taxStartStandard: String(sheet[`K${rowNumber}`]?.v ?? '').trim(),
      referenceAging: String(sheet[`T${rowNumber}`]?.v ?? '').trim(),
      compensationAging: String(sheet[`U${rowNumber}`]?.v ?? '').trim()
    });
  }

  return {
    supplier: { id: 'zhedao-w14', name: '赤道国际', code: 'zhedao', order: 1 },
    sourceFilename: filename,
    records,
    notes: '该供应商报价表直接使用“美国运价快速查询表”中的义乌/深圳包税结果。'
  };
}
```

- [ ] **Step 5: Run 赤道 parser tests again**

Run: `node --test tests/freight-parsers/zhedao.test.js`

Expected: PASS with two passing tests.

- [ ] **Step 6: Commit checkpoint if git is initialized**

```bash
git add lib/freight-parsers/index.js lib/freight-parsers/zhedao.js tests/freight-parsers/zhedao.test.js
git commit -m "feat: add zhedao parser entrypoint"
```

---

### Task 4: Implement 纽酷 and 美琦 parsers with structure-level failures

**Files:**
- Create: `lib/freight-parsers/nuoku.js`
- Create: `lib/freight-parsers/meiqi.js`
- Test: `tests/freight-parsers/nuoku.test.js`
- Test: `tests/freight-parsers/meiqi.test.js`

- [ ] **Step 1: Write failing tests for missing visible sheets and structure errors**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { detectSupplierDataset } from '../../lib/freight-parsers/index.js';

test('纽酷 missing visible required sheet returns sheet-level error', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['x']]), '直送专线');
  workbook.Workbook = { Sheets: [{ name: '直送专线', Hidden: 0 }] };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), /暂不支持这份报价表模板/);
});

test('美琦 visible workbook with missing structure returns structure error', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['bad']]), 'TK直送');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['ok']]), 'Match系列 ');
  workbook.Workbook = {
    Sheets: [
      { name: 'TK直送', Hidden: 0 },
      { name: 'Match系列 ', Hidden: 0 }
    ]
  };
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  assert.throws(() => detectSupplierDataset(buffer), /结构|未解析到任何可用渠道数据/);
});
```

- [ ] **Step 2: Run supplier parser tests to verify they fail**

Run: `node --test tests/freight-parsers/nuoku.test.js tests/freight-parsers/meiqi.test.js`

Expected: FAIL because parser implementations do not exist.

- [ ] **Step 3: Implement 纽酷 parser with explicit structure guards**

```js
import { FreightError } from '../freight-errors.js';

export function createNuokuDataset(workbook, { filename = 'nuoku.xlsx' } = {}) {
  const requiredSheets = ['直送专线', '王牌渠道-全美25日达'];
  for (const sheetName of requiredSheets) {
    if (!workbook.Sheets[sheetName]) {
      throw new FreightError({
        code: 'MISSING_REQUIRED_SHEET',
        level: 'sheet',
        message: `模板已识别，但缺少关键工作表：${sheetName}`,
        details: { supplierId: 'nuoku-vip', sheetName }
      });
    }
  }

  const anchorSheet = workbook.Sheets['直送专线'];
  if (!anchorSheet['C6']?.v || !String(anchorSheet['C6'].v).includes('仓库代码')) {
    throw new FreightError({
      code: 'WAREHOUSE_COLUMN_NOT_FOUND',
      level: 'structure',
      message: '模板已识别，但仓库代码列未找到',
      details: { supplierId: 'nuoku-vip', sheetName: '直送专线', cell: 'C6' }
    });
  }

  return {
    supplier: { id: 'nuoku-vip', name: '纽酷国际', code: 'nuoku', order: 2 },
    sourceFilename: filename,
    records: [],
    notes: '纽酷义乌价格按“华东/宁波/上海/苏州”口径读取，深圳价格按“华南”口径读取。'
  };
}
```

- [ ] **Step 4: Implement 美琦 parser with explicit structure guards**

```js
import { FreightError } from '../freight-errors.js';

export function createMeiqiDataset(workbook, { filename = 'meiqi.xlsx' } = {}) {
  const requiredSheets = ['TK直送', 'Match系列 '];
  for (const sheetName of requiredSheets) {
    if (!workbook.Sheets[sheetName]) {
      throw new FreightError({
        code: 'MISSING_REQUIRED_SHEET',
        level: 'sheet',
        message: `模板已识别，但缺少关键工作表：${sheetName}`,
        details: { supplierId: 'meiqi-us', sheetName }
      });
    }
  }

  const sheet = workbook.Sheets['TK直送'];
  if (!sheet['!ref']) {
    throw new FreightError({
      code: 'EMPTY_REQUIRED_SHEET',
      level: 'structure',
      message: '模板已识别，但工作表“TK直送”没有可读取的数据。',
      details: { supplierId: 'meiqi-us', sheetName: 'TK直送' }
    });
  }

  throw new FreightError({
    code: 'NO_USABLE_RECORDS',
    level: 'import',
    message: '未在美琦报价表中解析到可用于仓库代码查询的渠道数据。',
    details: { supplierId: 'meiqi-us' }
  });
}
```

- [ ] **Step 5: Update parser entrypoint to include visible-sheet detection for 纽酷 and 美琦**

```js
import XLSX from 'xlsx';
import { FreightError } from '../freight-errors.js';
import { getVisibleSheetNames } from '../freight-sheet-utils.js';
import { createZhedaoDataset } from './zhedao.js';
import { createNuokuDataset } from './nuoku.js';
import { createMeiqiDataset } from './meiqi.js';

export function detectSupplierDataset(buffer, options = {}) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellNF: true, cellText: true });
  const visibleSheetNames = getVisibleSheetNames(workbook);

  if (visibleSheetNames.includes('美国运价快速查询表')) return createZhedaoDataset(workbook, options);
  if (visibleSheetNames.includes('直送专线') && visibleSheetNames.includes('王牌渠道-全美25日达')) return createNuokuDataset(workbook, options);
  if (visibleSheetNames.includes('TK直送') && visibleSheetNames.includes('Match系列 ')) return createMeiqiDataset(workbook, options);

  throw new FreightError({
    code: 'UNSUPPORTED_TEMPLATE',
    level: 'template',
    message: '暂不支持这份报价表模板，请确认是赤道、纽酷或美琦的标准报价单。'
  });
}
```

- [ ] **Step 6: Run supplier parser tests again**

Run: `node --test tests/freight-parsers/nuoku.test.js tests/freight-parsers/meiqi.test.js`

Expected: PASS with expected failures mapped to structured errors.

- [ ] **Step 7: Replace stub record parsing with the reference logic adapted into each parser**

```js
// In nuoku.js:
// 1. Port `normalizeNuokuHeaderColumns`, `buildNuokuSections`,
//    `pickNuokuPriceColumn`, and `collectNuokuRecordsFromSheet`
//    from Reference/freight-quote-store.js.
// 2. Change the workbook iteration to:
//    `for (const sheetName of getVisibleSheetNames(workbook)) { ... }`
// 3. Replace every generic parsing failure with FreightError:
//    - missing visible key sheet => MISSING_REQUIRED_SHEET / level `sheet`
//    - missing `仓库代码` anchor => WAREHOUSE_COLUMN_NOT_FOUND / level `structure`
//    - no parsed records => NO_USABLE_RECORDS / level `import`
//
// In meiqi.js:
// 1. Port `collectMeiqiSingleGroupRecords` and `collectMeiqiMultiGroupRecords`
//    from Reference/freight-quote-store.js.
// 2. Keep raw origin labels on every normalized record so later delivery-option
//    mapping can distinguish merged labels from exact labels.
// 3. Throw FreightError variants for:
//    - missing visible key sheet
//    - empty required sheet
//    - no parsed records
```

- [ ] **Step 8: Re-run all parser tests**

Run: `node --test tests/freight-parsers/*.test.js`

Expected: PASS across shared, zhedao, nuoku, and meiqi parser suites.

- [ ] **Step 9: Commit checkpoint if git is initialized**

```bash
git add lib/freight-parsers/nuoku.js lib/freight-parsers/meiqi.js tests/freight-parsers/nuoku.test.js tests/freight-parsers/meiqi.test.js
git commit -m "feat: add nuoku and meiqi parsers"
```

---

### Task 5: Build store persistence for datasets, failed replacements, and discounts

**Files:**
- Create: `lib/freight-quote-store.js`
- Test: `tests/freight-quote-store.test.js`

- [ ] **Step 1: Write failing storage tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createFreightQuoteStore } from '../lib/freight-quote-store.js';
import { FreightError } from '../lib/freight-errors.js';

test('failed replacement clears supplier dataset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'freight-store-'));
  const store = createFreightQuoteStore({ rootDir, detectDataset: () => ({
    supplier: { id: 'zhedao-w14', name: '赤道国际', code: 'zhedao', order: 1 },
    sourceFilename: 'ok.xlsx',
    records: [{ warehouseCode: 'ONT8', channel: 'A' }]
  })});

  await store.importWorkbook({ buffer: Buffer.from('ok'), filename: 'ok.xlsx', supplierId: 'zhedao-w14' });

  const failingStore = createFreightQuoteStore({
    rootDir,
    detectDataset: () => {
      throw new FreightError({ code: 'NO_USABLE_RECORDS', level: 'import', message: 'bad file' });
    }
  });

  await assert.rejects(
    () => failingStore.importWorkbook({ buffer: Buffer.from('bad'), filename: 'bad.xlsx', supplierId: 'zhedao-w14' }),
    /bad file/
  );

  assert.equal(failingStore.hasDataset('zhedao-w14'), false);
});

test('discounts persist independently from current dataset', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'freight-discounts-'));
  const store = createFreightQuoteStore({ rootDir, detectDataset: () => null });

  await store.saveDiscount('zhedao-w14', { discountAmount: 0.3, enabled: true });
  const payload = JSON.parse(await readFile(path.join(rootDir, 'data/freight/discounts.json'), 'utf8'));

  assert.equal(payload.suppliers['zhedao-w14'].discountAmount, 0.3);
});
```

- [ ] **Step 2: Run store tests to verify they fail**

Run: `node --test tests/freight-quote-store.test.js`

Expected: FAIL because the store module does not exist.

- [ ] **Step 3: Implement storage layout and import replacement**

```js
import fs from 'node:fs';
import path from 'node:path';
import { detectSupplierDataset as defaultDetectSupplierDataset } from './freight-parsers/index.js';

const DATASET_PATH = path.join('data', 'freight', 'current.json');
const DISCOUNTS_PATH = path.join('data', 'freight', 'discounts.json');
const UPLOAD_DIR = path.join('data', 'freight', 'uploads');

export function createFreightQuoteStore({ rootDir, detectDataset = defaultDetectSupplierDataset }) {
  function importWorkbook({ buffer, filename, supplierId }) {
    try {
      const dataset = detectDataset(buffer, { filename });
      if (dataset.supplier.id !== supplierId) {
        throw new Error(`当前上传入口是“${supplierId}”，但文件识别结果是“${dataset.supplier.id}”`);
      }
      // persist dataset here
      return dataset;
    } catch (error) {
      // clear supplier dataset here before rethrow
      throw error;
    }
  }

  return { importWorkbook };
}
```

- [ ] **Step 4: Implement discount persistence**

```js
function saveDiscount(supplierId, { discountAmount, enabled }) {
  const payload = readDiscounts();
  payload.suppliers[supplierId] = {
    discountAmount: Number(discountAmount),
    enabled: Boolean(enabled),
    updatedAt: new Date().toISOString()
  };
  writeJSON(DISCOUNTS_PATH, payload);
  return payload.suppliers[supplierId];
}
```

- [ ] **Step 5: Implement dataset clearing on failed replacement**

```js
function clearSupplierDataset(supplierId) {
  const current = readCurrent();
  delete current.suppliers[supplierId];
  writeJSON(DATASET_PATH, current);
}
```

- [ ] **Step 6: Run store tests again**

Run: `node --test tests/freight-quote-store.test.js`

Expected: PASS with dataset clearing and discount persistence verified.

- [ ] **Step 7: Commit checkpoint if git is initialized**

```bash
git add lib/freight-quote-store.js tests/freight-quote-store.test.js
git commit -m "feat: add freight store and discount persistence"
```

---

### Task 6: Build the query engine for single comparison, delivery options, and batch output

**Files:**
- Create: `lib/freight-query-engine.js`
- Test: `tests/freight-query-engine.test.js`

- [ ] **Step 1: Write failing query-engine tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreightQueryEngine } from '../lib/freight-query-engine.js';

const dataset = {
  suppliers: {
    'zhedao-w14': {
      supplier: { id: 'zhedao-w14', name: '赤道国际', order: 1 },
      records: [
        { warehouseCode: 'ONT8', channel: 'A', shenzhenOriginLabel: '深圳', yiwuOriginLabel: '义乌', shenzhenPackageTaxPrice: 4.5, yiwuPackageTaxPrice: 4.3 },
        { warehouseCode: 'ONT8', channel: 'B', shenzhenOriginLabel: '深圳', yiwuOriginLabel: '义乌', shenzhenPackageTaxPrice: 4.8, yiwuPackageTaxPrice: 4.6 }
      ]
    }
  }
};

test('single query sorts by discounted final price', () => {
  const engine = createFreightQueryEngine({
    storage: dataset,
    discounts: { suppliers: { 'zhedao-w14': { discountAmount: 0.2, enabled: true } } }
  });

  const result = engine.queryByWarehouse('ONT8');
  assert.equal(result.supplierGroups[0].records[0].finalPrice, 4.1);
});

test('batch query preserves pasted order and fixed columns', () => {
  const engine = createFreightQueryEngine({
    storage: dataset,
    discounts: { suppliers: { 'zhedao-w14': { discountAmount: 0, enabled: false } } }
  });

  const result = engine.batchQuery({
    supplierId: 'zhedao-w14',
    deliveryOptionKey: 'shenzhen',
    warehouseCodes: ['ONT8', 'ONT8']
  });

  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].cells[0].channel, 'A');
});
```

- [ ] **Step 2: Run query-engine tests to verify they fail**

Run: `node --test tests/freight-query-engine.test.js`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement discount application and sorting**

```js
function applyDiscount(rawPrice, discountConfig) {
  if (rawPrice == null) return null;
  if (!discountConfig?.enabled) return rawPrice;
  return Number((rawPrice - Number(discountConfig.discountAmount || 0)).toFixed(2));
}

function sortRecords(records) {
  return records.slice().sort((left, right) => {
    const leftPrice = left.finalPrice ?? Number.MAX_SAFE_INTEGER;
    const rightPrice = right.finalPrice ?? Number.MAX_SAFE_INTEGER;
    return leftPrice - rightPrice || left.channel.localeCompare(right.channel, 'zh-CN');
  });
}
```

- [ ] **Step 4: Implement delivery-option derivation**

```js
function getDeliveryOptionsForSupplier(dataset) {
  const options = new Map();
  for (const record of dataset.records) {
    if (record.shenzhenOriginLabel) options.set('shenzhen', { key: 'shenzhen', label: '深圳', mode: 'shenzhen' });
    if (record.yiwuOriginLabel) options.set('yiwu', { key: 'yiwu', label: '义乌', mode: 'yiwu' });
  }
  return [...options.values()];
}
```

- [ ] **Step 5: Implement batch-query row shaping**

```js
function batchQuery({ supplierId, deliveryOptionKey, warehouseCodes }) {
  const dataset = storage.suppliers[supplierId];
  const rows = warehouseCodes
    .filter((code) => String(code).trim())
    .map((warehouseCode) => {
      const matches = getMatchesForWarehouse(dataset, warehouseCode, deliveryOptionKey);
      const cells = sortRecords(matches).map((record) => ({
        finalPrice: record.finalPrice,
        channel: record.channel
      }));
      return { warehouseCode, cells };
    });

  return { supplierId, deliveryOptionKey, rows };
}
```

- [ ] **Step 6: Implement single-query shaping for `多渠道比价`**

```js
function queryByWarehouse(warehouseCode) {
  return {
    warehouseCode,
    supplierGroups: Object.values(storage.suppliers).map((dataset) => ({
      supplier: dataset.supplier,
      records: sortRecords(getMatchesForWarehouse(dataset, warehouseCode))
    }))
  };
}
```

- [ ] **Step 7: Run query-engine tests again**

Run: `node --test tests/freight-query-engine.test.js`

Expected: PASS with single-query and batch-query behavior verified.

- [ ] **Step 8: Commit checkpoint if git is initialized**

```bash
git add lib/freight-query-engine.js tests/freight-query-engine.test.js
git commit -m "feat: add freight query engine"
```

---

### Task 7: Wire APIs into the server and verify layered responses

**Files:**
- Modify: `server.js`
- Modify: `lib/freight-quote-store.js`
- Modify: `lib/freight-query-engine.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: Expand server tests with upload, discounts, and batch-query behavior**

```js
test('POST /api/freight/discounts saves supplier discount', async () => {
  const app = createServer({ rootDir: process.cwd(), store, queryEngine });
  app.listen(0);
  await once(app, 'listening');
  const { port } = app.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/freight/discounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ supplierId: 'zhedao-w14', discountAmount: 0.3, enabled: true })
  });

  assert.equal(response.status, 200);
});
```

- [ ] **Step 2: Run server tests to verify new API tests fail**

Run: `node --test tests/server.test.js`

Expected: FAIL with 404 or missing handlers for new API routes.

- [ ] **Step 3: Add JSON body parsing and unified response helpers**

```js
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}
```

- [ ] **Step 4: Add API routes**

```js
if (req.method === 'GET' && req.url === '/api/freight/meta') {
  return sendJson(res, 200, store.getMeta());
}

if (req.method === 'POST' && req.url === '/api/freight/discounts') {
  const body = await readJson(req);
  return sendJson(res, 200, { ok: true, discount: await store.saveDiscount(body.supplierId, body) });
}

if (req.method === 'POST' && req.url === '/api/freight/batch-query') {
  const body = await readJson(req);
  return sendJson(res, 200, queryEngine.batchQuery(body));
}
```

- [ ] **Step 5: Add layered error handling**

```js
try {
  // route handling
} catch (error) {
  if (isFreightError(error)) {
    return sendJson(res, 400, error.toJSON());
  }
  return sendJson(res, 500, { ok: false, code: 'INTERNAL_SERVER_ERROR', level: 'import', message: '服务处理失败，请稍后重试。' });
}
```

- [ ] **Step 6: Run server tests again**

Run: `node --test tests/server.test.js`

Expected: PASS with health, discounts, and batch-query routes covered.

- [ ] **Step 7: Commit checkpoint if git is initialized**

```bash
git add server.js tests/server.test.js lib/freight-quote-store.js lib/freight-query-engine.js
git commit -m "feat: wire freight APIs and layered responses"
```

---

### Task 8: Build the Apple-like frontend, supplier discounts, batch query, and comparison UI

**Files:**
- Modify: `freight-quote.html`
- Modify: `freight-quote-app.js`

- [ ] **Step 1: Replace the page shell with the redesigned layout**

```html
<main class="app-shell">
  <section class="left-panel" id="supplier-panel"></section>
  <section class="right-panel">
    <details open class="accordion" id="batch-query">
      <summary>批量查询</summary>
      <section id="batch-query-root"></section>
    </details>
    <details class="accordion" id="comparison-query">
      <summary>多渠道比价</summary>
      <section id="comparison-root"></section>
    </details>
  </section>
</main>
```

- [ ] **Step 2: Add Apple-like visual tokens and layout styles**

```css
:root {
  --bg: #f5f5f7;
  --panel: rgba(255, 255, 255, 0.9);
  --line: rgba(15, 23, 42, 0.08);
  --text: #111827;
  --muted: #6b7280;
  --accent: #111827;
  --shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
  --radius: 28px;
}

body {
  margin: 0;
  background: radial-gradient(circle at top, #ffffff 0%, var(--bg) 60%);
  color: var(--text);
  font-family: "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```

- [ ] **Step 3: Render supplier upload cards with discount controls**

```js
function renderSupplierCard(supplier) {
  return `
    <article class="supplier-card" data-supplier-id="${supplier.id}">
      <h3>${supplier.name}</h3>
      <input type="number" data-role="discountAmount" step="0.01" placeholder="优惠金额" />
      <label><input type="checkbox" data-role="discountEnabled" /> 纳入计算</label>
      <input type="file" data-role="uploadInput" accept=".xlsx,.xls,.xlsm" />
      <button data-role="uploadButton">上传报价</button>
      <div class="status" data-role="status"></div>
    </article>
  `;
}
```

- [ ] **Step 4: Render batch-query controls and grid**

```js
function renderBatchQuerySection(options) {
  return `
    <section class="batch-section">
      <div class="field-group" id="batch-supplier-options"></div>
      <div class="field-group" id="batch-delivery-options"></div>
      <section class="grid-section">
        <div class="grid-header">
          <h3>仓库代码、单价和渠道名称</h3>
          <button id="batch-run-btn">计算</button>
        </div>
        <div class="batch-grid" id="batch-grid"></div>
      </section>
    </section>
  `;
}
```

- [ ] **Step 5: Implement paste-to-first-column behavior**

```js
function handleBatchPaste(event) {
  const text = event.clipboardData.getData('text');
  const rows = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  state.batchWarehouseCodes = rows;
  renderBatchGrid();
  event.preventDefault();
}
```

- [ ] **Step 6: Implement batch-query result rendering with frozen first column**

```js
function renderBatchGridRows(rows) {
  return rows.map((row) => `
    <div class="grid-row">
      <div class="grid-cell sticky">${row.warehouseCode}</div>
      ${row.cells.flatMap((cell, index) => [
        `<div class="grid-cell">${cell.finalPrice ?? ''}</div>`,
        `<div class="grid-cell">${cell.channel ?? ''}</div>`
      ]).join('')}
    </div>
  `).join('');
}
```

- [ ] **Step 7: Preserve the familiar single-query comparison flow**

```js
async function runSingleQuery(warehouseCode) {
  const response = await fetch(`/api/freight/query?warehouse=${encodeURIComponent(warehouseCode)}`);
  const payload = await response.json();
  renderComparisonColumns(payload.supplierGroups);
}
```

- [ ] **Step 8: Surface layered errors in upload UI**

```js
function renderUploadError(target, errorPayload) {
  target.textContent = errorPayload.message;
  target.dataset.level = errorPayload.level;
}
```

- [ ] **Step 9: Verify the page manually**

Run: `npm start`

Manual checks:

- upload cards render for all three suppliers
- discount values save and reload
- batch-query first column accepts pasted warehouse codes
- batch results display `price / channel` pairs
- first column remains visible while scrolling
- comparison view still sorts ascending

- [ ] **Step 10: Commit checkpoint if git is initialized**

```bash
git add freight-quote.html freight-quote-app.js
git commit -m "feat: add redesigned freight quote frontend"
```

---

### Task 9: Full verification pass and documentation cleanup

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-04-05-freight-quote-redesign-design.md` (only if implementation revealed required clarifications)
- Modify: `docs/superpowers/plans/2026-04-05-freight-quote-redesign.md` (checkbox updates only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`

Expected: PASS across parser, store, query-engine, and server tests.

- [ ] **Step 2: Run one real upload scenario per supplier using reference files**

Run:

```bash
npm start
```

Manual scenarios:

- upload `Reference/浙江赤道-W14北美价格表20260320(1).xlsx`
- upload `Reference/纽酷国际-美线FBA-VIP-03.23（1）.xlsx`
- upload `Reference/美琦-美国报价表2026.03.26.xlsx`

Expected:

- all three suppliers import successfully
- meta counts update
- discounts persist after uploads

- [ ] **Step 3: Verify hidden-sheet behavior with a workbook fixture**

Run: `node --test tests/freight-parsers/shared.test.js`

Expected: PASS proving hidden and veryHidden sheets are excluded from detection and parsing.

- [ ] **Step 4: Verify failed replacement clears old supplier data**

Run: `node --test tests/freight-quote-store.test.js`

Expected: PASS proving a failed upload removes that supplier from active data.

- [ ] **Step 5: Verify batch-query Excel copy behavior manually**

Manual check:

- paste a warehouse column from Excel into the first grid column
- click `计算`
- copy returned rows back into Excel
- confirm `单价` and `渠道名称` land in separate spreadsheet columns

- [ ] **Step 6: Update plan checkboxes and implementation notes**

```md
- [x] Completed tasks should stay checked in this plan file.
- [x] Any implementation-driven clarification should be mirrored back into the spec if behavior changed.
```

- [ ] **Step 7: Final commit checkpoint if git is initialized**

```bash
git add README.md docs/superpowers/plans/2026-04-05-freight-quote-redesign.md docs/superpowers/specs/2026-04-05-freight-quote-redesign-design.md
git commit -m "docs: finalize freight quote redesign plan and verification notes"
```

---

### Task 10: Prepare the finished project for GitHub publishing

**Files:**
- Modify: `README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Add final README sections for outside users**

```md
## 项目结构

- `server.js` 本地服务入口
- `freight-quote.html` 页面
- `freight-quote-app.js` 前端逻辑
- `lib/` 解析、查询、存储逻辑

## 数据说明

- 上传后的运行数据默认写入 `data/freight/`
- `uploads/` 保存当前工作簿副本
- `current.json` 保存当前生效报价
- `discounts.json` 保存优惠配置
```

- [ ] **Step 2: Verify ignored files stay out of git status**

Run: `git status --short`

Expected: source files listed when changed; runtime data and `.superpowers/` absent.

- [ ] **Step 3: Add a publish checklist for later GitHub push**

```md
## 发布到 GitHub

1. 创建一个新的 GitHub 仓库
2. 在本地执行：

```bash
git remote add origin <your-repo-url>
git push -u origin main
```
```

- [ ] **Step 4: Final commit checkpoint if git is initialized**

```bash
git add README.md .gitignore
git commit -m "docs: prepare project for github publishing"
```
