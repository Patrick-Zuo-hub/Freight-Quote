import fs from 'node:fs';
import path from 'node:path';
import { detectSupplierDataset as defaultDetectSupplierDataset } from './freight-parsers/index.js';
import { FreightError } from './freight-errors.js';

const DATASET_PATH = path.join('data', 'freight', 'current.json');
const DISCOUNTS_PATH = path.join('data', 'freight', 'discounts.json');
const UPLOAD_DIR = path.join('data', 'freight', 'uploads');
const SUPPORTED_SUPPLIERS = {
  'zhedao-w14': { id: 'zhedao-w14', name: '赤道国际', code: 'zhedao', order: 1 },
  'nuoku-vip': { id: 'nuoku-vip', name: '纽酷国际', code: 'nuoku', order: 2 },
  'meiqi-us': { id: 'meiqi-us', name: '美琦国际', code: 'meiqi', order: 3 }
};

function createEmptyDatasetPayload() {
  return {
    version: 1,
    suppliers: {}
  };
}

function createEmptyDiscountPayload() {
  return {
    version: 1,
    suppliers: {}
  };
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readJSON(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return fallback();
    }
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback();
    }
    throw error;
  }
}

function writeJSON(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function sanitizeFilename(filename) {
  return path.basename(filename || 'freight-pricing.xlsx').replace(/[^\w.\-()+\u4e00-\u9fa5]/g, '_');
}

function datasetPath(rootDir) {
  return path.join(rootDir, DATASET_PATH);
}

function discountsPath(rootDir) {
  return path.join(rootDir, DISCOUNTS_PATH);
}

function uploadDir(rootDir) {
  return path.join(rootDir, UPLOAD_DIR);
}

function readCurrent(rootDir) {
  const payload = readJSON(datasetPath(rootDir), createEmptyDatasetPayload);
  if (!payload.suppliers || typeof payload.suppliers !== 'object') {
    payload.suppliers = {};
  }
  if (typeof payload.version !== 'number') {
    payload.version = 1;
  }
  return payload;
}

function readDiscounts(rootDir) {
  const payload = readJSON(discountsPath(rootDir), createEmptyDiscountPayload);
  if (!payload.suppliers || typeof payload.suppliers !== 'object') {
    payload.suppliers = {};
  }
  if (typeof payload.version !== 'number') {
    payload.version = 1;
  }
  return payload;
}

function supplierOrderOf(supplier) {
  return Number.isFinite(Number(supplier?.order)) ? Number(supplier.order) : Number.MAX_SAFE_INTEGER;
}

function buildMeta(rootDir) {
  const current = readCurrent(rootDir);
  const activeDatasets = current.suppliers || {};
  const suppliers = Object.values(SUPPORTED_SUPPLIERS)
    .sort((left, right) => supplierOrderOf(left) - supplierOrderOf(right))
    .map((supplier) => {
      const dataset = activeDatasets[supplier.id];
      return {
        ...supplier,
        hasDataset: Boolean(dataset),
        uploadedAt: dataset?.uploadedAt || '',
        sourceFilename: dataset?.sourceFilename || '',
        storedWorkbookName: dataset?.storedWorkbookName || '',
        recordCount: dataset?.recordCount || 0,
        warehouseCount: dataset?.warehouseCount || 0,
        sampleWarehouses: dataset?.warehouseCodes?.slice(0, 8) || [],
        notes: dataset?.notes || '',
        sheetNames: dataset?.sheetNames || []
      };
    });

  const warehouseCodes = Array.from(
    new Set(Object.values(activeDatasets).flatMap((dataset) => dataset?.warehouseCodes || []))
  ).sort((left, right) => left.localeCompare(right, 'en'));

  return {
    hasDataset: Object.keys(activeDatasets).length > 0,
    supplierCount: suppliers.length,
    activeSupplierCount: Object.keys(activeDatasets).length,
    totalRecordCount: Object.values(activeDatasets).reduce((sum, dataset) => sum + (dataset?.recordCount || 0), 0),
    totalWarehouseCount: warehouseCodes.length,
    suppliers,
    sampleWarehouses: warehouseCodes.slice(0, 12)
  };
}

function persistWorkbook(rootDir, supplierId, filename, buffer) {
  const targetDir = uploadDir(rootDir);
  ensureDir(targetDir);

  const storedWorkbookName = `${supplierId}-${Date.now()}-${sanitizeFilename(filename)}`;
  const storedWorkbookPath = path.join(targetDir, storedWorkbookName);
  fs.writeFileSync(storedWorkbookPath, buffer);
  return storedWorkbookName;
}

function removeStoredWorkbook(rootDir, storedWorkbookName) {
  if (!storedWorkbookName) {
    return;
  }

  const storedWorkbookPath = path.join(uploadDir(rootDir), storedWorkbookName);
  try {
    fs.unlinkSync(storedWorkbookPath);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }
}

function normalizeSupplierRecord(dataset, filename, storedWorkbookName) {
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const warehouseCodes = Array.from(
    new Set(records.map((record) => String(record?.warehouseCode || '').trim()).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right, 'en'));

  return {
    supplier: dataset.supplier,
    uploadedAt: new Date().toISOString(),
    sourceFilename: sanitizeFilename(filename || dataset.sourceFilename),
    storedWorkbookName,
    sheetNames: Array.isArray(dataset.sheetNames) ? dataset.sheetNames : [],
    recordCount: records.length,
    warehouseCount: warehouseCodes.length,
    warehouseCodes,
    notes: dataset.notes || '',
    records
  };
}

function clearSupplierDataset(rootDir, supplierId) {
  const current = readCurrent(rootDir);
  const existingDataset = current.suppliers[supplierId];

  if (existingDataset && existingDataset.storedWorkbookName) {
    removeStoredWorkbook(rootDir, existingDataset.storedWorkbookName);
  }

  delete current.suppliers[supplierId];
  writeJSON(datasetPath(rootDir), current);
}

export function createFreightQuoteStore({ rootDir, detectDataset = defaultDetectSupplierDataset }) {
  if (!rootDir) {
    throw new FreightError({
      code: 'INVALID_STORE_ROOT',
      level: 'store',
      message: '创建报价存储时必须提供 rootDir。'
    });
  }

  function hasDataset(supplierId) {
    const current = readCurrent(rootDir);

    if (supplierId) {
      return Boolean(current.suppliers[supplierId]);
    }

    return Object.keys(current.suppliers).length > 0;
  }

  async function importWorkbook({ buffer, filename, supplierId }) {
    let storedWorkbookName;

    try {
      const dataset = detectDataset(buffer, { filename });

      if (!dataset || !dataset.supplier) {
        throw new FreightError({
          code: 'NO_USABLE_RECORDS',
          level: 'import',
          message: '未能从这份报价表中识别出可用数据。'
        });
      }

      if (dataset.supplier.id !== supplierId) {
        throw new FreightError({
          code: 'SUPPLIER_MISMATCH',
          level: 'import',
          message: `当前上传入口是“${supplierId}”，但文件识别结果是“${dataset.supplier.id}”`
        });
      }

      const current = readCurrent(rootDir);
      const existingDataset = current.suppliers[supplierId];
      if (existingDataset && existingDataset.storedWorkbookName) {
        removeStoredWorkbook(rootDir, existingDataset.storedWorkbookName);
      }

      storedWorkbookName = persistWorkbook(rootDir, supplierId, filename, buffer);
      current.suppliers[supplierId] = normalizeSupplierRecord(dataset, filename, storedWorkbookName);
      writeJSON(datasetPath(rootDir), current);

      return current.suppliers[supplierId];
    } catch (error) {
      if (storedWorkbookName) {
        removeStoredWorkbook(rootDir, storedWorkbookName);
      }
      if (supplierId && error?.code !== 'SUPPLIER_MISMATCH') {
        clearSupplierDataset(rootDir, supplierId);
      }
      throw error;
    }
  }

  async function saveDiscount(supplierId, { discountAmount, enabled }) {
    const payload = readDiscounts(rootDir);
    const parsedDiscountAmount = Number(discountAmount);

    payload.suppliers[supplierId] = {
      supplierId,
      discountAmount: Number.isFinite(parsedDiscountAmount) ? parsedDiscountAmount : 0,
      enabled: Boolean(enabled),
      updatedAt: new Date().toISOString()
    };

    writeJSON(discountsPath(rootDir), payload);
    return payload.suppliers[supplierId];
  }

  return {
    hasDataset,
    getCurrent() {
      return readCurrent(rootDir);
    },
    getDiscounts() {
      return readDiscounts(rootDir);
    },
    getMeta() {
      return buildMeta(rootDir);
    },
    importWorkbook,
    saveDiscount
  };
}
