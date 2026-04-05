import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { getVisibleSheetNames, getVisibleSheets } from '../../lib/freight-sheet-utils.js';
import { FreightError, isFreightError } from '../../lib/freight-errors.js';
import {
  assertSheetExists,
  normalizeWarehouseCode
} from '../../lib/freight-parsers/shared.js';

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

test('normalizeWarehouseCode normalizes spaces and case', () => {
  assert.equal(normalizeWarehouseCode('  wh  01  '), 'WH01');
  assert.equal(normalizeWarehouseCode('  a b c 123 '), 'ABC123');
});

test('assertSheetExists throws structured FreightError when sheet is missing', () => {
  try {
    assertSheetExists(undefined, 'TK直送', '赤道国际');
    assert.fail('expected assertSheetExists to throw');
  } catch (error) {
    assert.ok(error instanceof FreightError);
    assert.deepEqual(error.toJSON(), {
      ok: false,
      code: 'MISSING_REQUIRED_SHEET',
      level: 'sheet',
      message: '模板已识别，但缺少关键工作表：TK直送',
      details: { supplierName: '赤道国际', sheetName: 'TK直送' }
    });
  }
});

test('isFreightError distinguishes FreightError from plain Error', () => {
  assert.equal(isFreightError(new FreightError({
    code: 'MISSING_REQUIRED_SHEET',
    level: 'sheet',
    message: '模板已识别，但缺少关键工作表：TK直送'
  })), true);
  assert.equal(isFreightError(new Error('boom')), false);
});

test('getVisibleSheets returns visible sheet name and sheet pairs', () => {
  const workbook = XLSX.utils.book_new();
  const visibleSheet = XLSX.utils.aoa_to_sheet([['A']]);
  const hiddenSheet = XLSX.utils.aoa_to_sheet([['B']]);
  XLSX.utils.book_append_sheet(workbook, visibleSheet, 'Visible');
  XLSX.utils.book_append_sheet(workbook, hiddenSheet, 'Hidden');
  workbook.Workbook = {
    Sheets: [
      { name: 'Visible', Hidden: 0 },
      { name: 'Hidden', Hidden: 1 }
    ]
  };

  assert.deepEqual(getVisibleSheets(workbook), [['Visible', visibleSheet]]);
});
