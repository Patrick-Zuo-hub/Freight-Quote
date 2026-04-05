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
