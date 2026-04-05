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
