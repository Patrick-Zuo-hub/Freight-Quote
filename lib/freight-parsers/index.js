import XLSX from 'xlsx';
import { FreightError } from '../freight-errors.js';
import { getVisibleSheetNames } from '../freight-sheet-utils.js';
import { createZhedaoDataset } from './zhedao.js';

export function detectSupplierDataset(buffer, options = {}) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellFormula: true,
    cellNF: true,
    cellText: true
  });
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
