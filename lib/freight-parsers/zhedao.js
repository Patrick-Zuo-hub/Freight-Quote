import { FreightError } from '../freight-errors.js';
import { assertSheetExists, normalizeWarehouseCode } from './shared.js';

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

    if (!channel || !warehouseCode) {
      continue;
    }

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
